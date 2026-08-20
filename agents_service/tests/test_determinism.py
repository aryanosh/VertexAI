"""Regression tests for the "random findings between runs" root causes:

1. Agent 2 previously assigned `finding_id=str(uuid.uuid4())` — a fresh random UUID on
   every run even for byte-identical input.
2. Agent 3 previously built its unique-CVE list via `set(...)`, whose iteration order for
   strings depends on Python's per-process hash randomization — so which CVEs got the
   (capped) agentic treatment could change on every container restart, even for identical
   input.
3. Agent 2's dedup_detail must account for every raw input finding exactly once.
"""
import asyncio

from agent2_noise import reduce_noise, Agent2Request, UnifiedFinding
from agent3_threat import enrich_findings, EnrichRequest, CanonicalFinding as ThreatCanonicalFinding


def _sample_findings():
    scanners = ["OWASP_ZAP", "NUCLEI", "OPENVAS", "NMAP"]
    findings = []
    for i in range(6):
        findings.append(
            UnifiedFinding(
                scanner_source=scanners[i % len(scanners)],
                cve_id=f"CVE-2021-4422{i % 3}",
                vulnerability_name=f"Sample Vuln {i % 3}",
                target_host=f"10.0.0.{i % 3 + 1}",
                target_port=443,
                endpoint_path="/api",
                cvss_base_score=7.5,
                scanner_confidence=3,
                http_response_code=200,
                port_is_open=1,
                historical_plugin_fp_rate=0.05,
            )
        )
    return findings


def test_agent2_finding_id_is_deterministic_across_runs():
    """Identical input must produce identical finding_id values on every run."""
    findings = _sample_findings()

    response_a = asyncio.run(reduce_noise(Agent2Request(findings=list(findings))))
    response_b = asyncio.run(reduce_noise(Agent2Request(findings=list(findings))))

    ids_a = sorted(f.finding_id for f in response_a.findings)
    ids_b = sorted(f.finding_id for f in response_b.findings)
    assert ids_a == ids_b
    assert len(ids_a) == len(set(ids_a))  # still unique within a single run


def test_agent2_dedup_detail_covers_every_raw_finding_exactly_once():
    findings = _sample_findings()
    response = asyncio.run(reduce_noise(Agent2Request(findings=findings)))

    assert len(response.dedup_detail) == len(findings)

    valid_statuses = {"KEPT", "REMOVED_DUPLICATE", "REMOVED_FALSE_POSITIVE"}
    for record in response.dedup_detail:
        assert record.duplicate_status in valid_statuses
        assert record.duplicate_group_id
        assert record.reason

    # Every group must have exactly one KEPT or REMOVED_FALSE_POSITIVE "representative"
    # (never zero, never more than one — that's the group's canonical finding).
    by_group = {}
    for record in response.dedup_detail:
        by_group.setdefault(record.duplicate_group_id, []).append(record)
    for group_id, records in by_group.items():
        representatives = [r for r in records if r.duplicate_status in ("KEPT", "REMOVED_FALSE_POSITIVE")]
        assert len(representatives) == 1, f"group {group_id} has {len(representatives)} representatives"

    # dedup_detail ids must be internally unique too.
    detail_ids = [r.finding_id for r in response.dedup_detail]
    assert len(detail_ids) == len(set(detail_ids))


def test_agent2_statistics_exposes_required_metric_names():
    findings = _sample_findings()
    response = asyncio.run(reduce_noise(Agent2Request(findings=findings)))
    stats = response.statistics

    assert stats.raw_finding_count == len(findings)
    assert stats.duplicate_findings_detected == stats.duplicates_removed
    assert stats.findings_removed == stats.duplicates_removed + stats.false_positives_removed
    assert stats.final_unique_findings_count == stats.output_count
    assert stats.deduplication_percentage == stats.duplicate_reduction_pct


def _threat_findings_for(cve_ids):
    return [
        ThreatCanonicalFinding(
            finding_id=f"finding-{i}",
            fingerprint_hash=f"hash-{i}",
            cve_id=cve,
            vulnerability_name="Sample",
            target_host="10.0.0.1",
            target_port=443,
            cvss_base_score=7.5,
            scanner_sources=["NUCLEI"],
            false_positive_prob=0.05,
            is_suppressed=False,
            is_accepted_risk=False,
        )
        for i, cve in enumerate(cve_ids)
    ]


def test_agent3_unique_cve_ordering_is_deterministic_across_runs():
    """dict.fromkeys-based dedup must preserve first-appearance order identically on every
    run, unlike the previous set()-based version whose order depended on process-level hash
    randomization. This directly determines which CVEs get the capped agentic treatment."""
    cve_ids = [f"CVE-2020-{1000 + (i % 40)}" for i in range(80)]
    findings = _threat_findings_for(cve_ids)

    response_a = asyncio.run(enrich_findings(EnrichRequest(findings=list(findings))))
    response_b = asyncio.run(enrich_findings(EnrichRequest(findings=list(findings))))

    intel_a = [v.cve_id for v in response_a.vulnerability_intelligence]
    intel_b = [v.cve_id for v in response_b.vulnerability_intelligence]
    assert intel_a == intel_b

    # Same input, same order, every time — not merely the same set of CVEs.
    expected_order = list(dict.fromkeys(cve_ids))
    assert intel_a == expected_order
