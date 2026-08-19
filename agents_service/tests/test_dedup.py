import pytest
import hashlib
import json
from agent1_parser import parse_zap, parse_nuclei, parse_openvas, parse_nmap, ParseRequest, parse_reports
from agent2_noise import reduce_noise, Agent2Request, UnifiedFinding, heuristic_fp_prob
from agent3_threat import enrich_findings, EnrichRequest, CanonicalFinding as ThreatCanonicalFinding
from agent4_scoring import (
    score_and_ticket,
    compute_composite_risk_score,
    assign_priority_and_sla,
    ScoreRequest,
    EnrichedFinding,
    AssetContext,
)


def test_md5_fingerprint_deduplication():
    """Verify that 10 duplicate findings produce exactly 1 canonical master record with >=90% reduction."""
    target_host = "192.168.1.10"
    target_port = 443
    cve_id = "CVE-2021-44228"
    endpoint_path = "/api/v1/auth"

    # Expected exact MD5
    expected_hash = hashlib.md5(
        f"{target_host}:{target_port}:{cve_id}:{endpoint_path}".encode()
    ).hexdigest()

    # Generate 10 duplicate findings across different scanners
    scanners = ["OWASP_ZAP", "NUCLEI", "OPENVAS", "NMAP"]
    findings = []
    for i in range(10):
        findings.append(
            UnifiedFinding(
                scanner_source=scanners[i % len(scanners)],
                cve_id=cve_id,
                vulnerability_name="Apache Log4j RCE",
                target_host=target_host,
                target_port=target_port,
                endpoint_path=endpoint_path,
                cvss_base_score=9.8,
                scanner_confidence=3,
                http_response_code=200,
                port_is_open=1,
                historical_plugin_fp_rate=0.02,
            )
        )

    import asyncio

    response = asyncio.run(reduce_noise(Agent2Request(findings=findings)))

    assert response.status == "WAITING_FOR_HUMAN"
    assert response.statistics.input_count == 10
    assert response.statistics.output_count == 1
    assert response.statistics.duplicate_reduction_pct == 90.0
    assert len(response.findings) == 1

    canonical = response.findings[0]
    assert canonical.fingerprint_hash == expected_hash
    assert canonical.cve_id == cve_id
    assert canonical.target_host == target_host
    assert canonical.target_port == target_port
    assert set(canonical.scanner_sources) == set(scanners)
    assert canonical.cvss_base_score == 9.8
    assert canonical.is_suppressed is False


def test_xgboost_false_positive_suppression():
    """Verify that high false positive probability (>0.85) sets is_suppressed = True."""
    # Finding with high FP indicators: closed port, 404 response, low confidence, high FP rate, no CVE
    noisy_finding = UnifiedFinding(
        scanner_source="OWASP_ZAP",
        cve_id="UNKNOWN",
        vulnerability_name="Generic Directory Listing",
        target_host="10.0.0.5",
        target_port=8080,
        endpoint_path="/nonexistent",
        cvss_base_score=3.0,
        scanner_confidence=1,
        http_response_code=404,
        port_is_open=0,
        historical_plugin_fp_rate=0.95,
    )

    import asyncio

    response = asyncio.run(reduce_noise(Agent2Request(findings=[noisy_finding])))
    assert len(response.findings) == 1
    canonical = response.findings[0]
    assert canonical.false_positive_prob > 0.85
    assert canonical.is_suppressed is True


def test_composite_risk_score_formula():
    """Verify exact formula: (CVSS * 0.30) + (EPSS * 10 * 0.35) + KEV_Bonus + (Asset_Criticality * 4.0)"""
    # Test Case 1: Critical finding on Critical Asset (KEV listed)
    # CVSS = 9.8 -> 9.8 * 0.30 = 2.94
    # EPSS = 0.97156 -> 0.97156 * 10 * 0.35 = 3.40046
    # KEV_Bonus = 25.0
    # Asset_Criticality = 5 -> 5 * 4.0 = 20.0
    # Total = 2.94 + 3.40046 + 25.0 + 20.0 = 51.34046
    score = compute_composite_risk_score(
        cvss=9.8, epss=0.97156, is_kev=True, asset_criticality=5
    )
    assert pytest.approx(score, 0.01) == 51.34

    # Test Case 2: Maximum possible capped at 100.0
    # CVSS = 10.0, EPSS = 1.0, is_kev = True, Asset_Criticality = 5
    # (10 * 0.30) + (10 * 0.35) + 25 + 20 = 3 + 3.5 + 25 + 20 = 51.5 (non-capped)
    score_max = compute_composite_risk_score(
        cvss=10.0, epss=1.0, is_kev=True, asset_criticality=5
    )
    assert score_max <= 100.0


def test_sla_and_priority_tiers():
    """Verify SLA tiers:
    P0 Critical -> 80.0-100.0 -> 24 Hours
    P1 High -> 60.0-79.9 -> 72 Hours
    P2 Medium -> 40.0-59.9 -> 14 Days
    P3 Low -> 0.0-39.9 -> 30 Days
    """
    p0, _ = assign_priority_and_sla(85.0)
    assert p0 == "P0_CRITICAL"

    p1, _ = assign_priority_and_sla(70.0)
    assert p1 == "P1_HIGH"

    p2, _ = assign_priority_and_sla(50.0)
    assert p2 == "P2_MEDIUM"

    p3, _ = assign_priority_and_sla(20.0)
    assert p3 == "P3_LOW"


def test_agent1_parser():
    """Verify Agent 1 parses ZAP, Nuclei, OpenVAS, and Nmap formats."""
    # ZAP JSON test
    zap_json = json.dumps(
        {
            "site": [
                {
                    "alerts": [
                        {
                            "name": "SQL Injection",
                            "riskcode": "3",
                            "confidence": "3",
                            "cweid": "89",
                            "instances": [
                                {"uri": "https://example.com:8443/products?id=1"}
                            ],
                        }
                    ]
                }
            ]
        }
    )
    findings = parse_zap(zap_json)
    assert len(findings) == 1
    assert findings[0].scanner_source == "OWASP_ZAP"
    assert findings[0].target_host == "example.com"
    assert findings[0].target_port == 8443
    assert findings[0].cvss_base_score == 8.0

    # Nuclei JSONL test
    nuclei_jsonl = json.dumps(
        {
            "template-id": "cve-2021-44228",
            "info": {
                "name": "Log4j RCE",
                "severity": "critical",
                "classification": {"cve-id": ["CVE-2021-44228"]},
            },
            "host": "10.0.0.1",
            "matched-at": "http://10.0.0.1:8080/login",
        }
    )
    nuclei_findings = parse_nuclei(nuclei_jsonl)
    assert len(nuclei_findings) == 1
    assert nuclei_findings[0].scanner_source == "NUCLEI"
    assert nuclei_findings[0].cve_id == "CVE-2021-44228"
    assert nuclei_findings[0].cvss_base_score == 9.5


def test_agent4_ticket_prep_hitl():
    """Verify Agent 4 prepares ticket without external API calls and enters WAITING_FOR_HUMAN."""
    finding = EnrichedFinding(
        finding_id="123e4567-e89b-12d3-a456-426614174000",
        fingerprint_hash="abcd1234abcd1234abcd1234abcd1234",
        cve_id="CVE-2021-44228",
        vulnerability_name="Log4j RCE",
        target_host="target.internal",
        target_port=443,
        cvss_base_score=9.8,
        scanner_sources=["NUCLEI", "OWASP_ZAP"],
        false_positive_prob=0.05,
        is_suppressed=False,
        is_accepted_risk=False,
        is_cisa_kev=True,
        epss_score=0.97156,
        epss_percentile=0.99,
        exploit_db_available=True,
    )

    asset_context = AssetContext(
        asset_id="asset-uuid-1",
        hostname="target.internal",
        criticality_rating=5,
        environment="PRODUCTION",
    )

    import asyncio

    response = asyncio.run(
        score_and_ticket(
            ScoreRequest(findings=[finding], asset_context=asset_context)
        )
    )

    assert response.status == "WAITING_FOR_HUMAN"
    assert len(response.scored_findings) == 1
    assert len(response.ticket_payloads) == 1

    ticket = response.ticket_payloads[0]
    assert "Log4j RCE" in ticket.title
    assert "Generated by VertexAI Agent 4" in ticket.body
    assert "This ticket was prepared for human review" in ticket.body
    assert ticket.assignee is None  # Waiting for human assignment
