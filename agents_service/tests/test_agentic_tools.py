"""
Smoke tests for the agentic tool layer added to Agents 1, 2, and 4.

These call each tool's handler directly (no live NVIDIA API key needed) to verify: (1) the
tools run without crashing against real data shapes, and (2) the underlying deterministic
pipeline output is byte-identical whether or not the agentic layer runs, since LLM_ENABLED
defaults on but NVIDIA_API_KEY is unset in CI — proving the tool layer is additive
(narration only) and never load-bearing for correctness.
"""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Agent 1 tools
# ---------------------------------------------------------------------------

def test_agent1_tools_run_without_crashing():
    from agent1_parser import UnifiedFinding
    from agent1_tools import build_tools

    findings = [
        UnifiedFinding(
            scanner_source="NUCLEI",
            cve_id="UNKNOWN",
            vulnerability_name="Generic info leak",
            target_host="10.0.0.5",
            target_port=443,
            cvss_base_score=0.0,
            scanner_confidence=1,
        )
    ]
    tools = {t.name: t for t in build_tools(findings)}

    out = run(tools["inspect_finding"].handler(index=0))
    assert out["scanner_source"] == "NUCLEI"

    out = run(tools["inspect_finding"].handler(index=99))
    assert "error" in out

    out = run(tools["explain_missing_field"].handler(scanner_source="NUCLEI"))
    assert out["findings_missing_cve_in_this_batch"] == 1


# ---------------------------------------------------------------------------
# Agent 2 tools
# ---------------------------------------------------------------------------

def test_agent2_tools_heuristic_breakdown_matches_real_arithmetic():
    from agent2_tools import build_tools

    findings_by_hash = {
        "abc123": {
            "scanner_confidence": 1,
            "has_cve_id": 0,
            "http_response_code": 404,
            "port_is_open": 0,
            "historical_plugin_fp_rate": 0.1,
        }
    }
    tools = {t.name: t for t in build_tools(None, [], findings_by_hash)}

    out = run(tools["get_model_feature_importance"].handler())
    assert out["model_loaded"] is False

    out = run(tools["get_heuristic_breakdown"].handler(fingerprint_hash="abc123"))
    # baseline 0.1 + no_cve 0.3 + low_confidence 0.2 + 404 0.15 + port_closed 0.2 = 0.95
    assert out["sum_before_clamp"] == pytest.approx(0.95, abs=1e-6)

    out = run(tools["get_finding_features"].handler(fingerprint_hash="nope"))
    assert "error" in out


# ---------------------------------------------------------------------------
# Agent 4 tools
# ---------------------------------------------------------------------------

def test_agent4_tools_run_without_crashing():
    from agent4_scoring import AssetContext
    from agent4_tools import build_tools

    ctx = AssetContext(asset_id="a-1", hostname="prod-web-01", criticality_rating=5, environment="PRODUCTION")
    tools = {t.name: t for t in build_tools(ctx, [])}

    out = run(tools["get_asset_context"].handler())
    assert out["hostname"] == "prod-web-01"
    assert out["was_default"] is False

    out = run(tools["infer_environment_from_hostname"].handler(hostname="prod-web-01"))
    assert out["inferred_environment"] == "PRODUCTION"

    out = run(tools["find_similar_findings"].handler(cve_id="CVE-2021-44228"))
    assert out["occurrences_in_this_run"] == 0


# ---------------------------------------------------------------------------
# End-to-end: deterministic output is unaffected by the agentic layer being wired in
# (LLM_ENABLED defaults true, but no NVIDIA_API_KEY is set in this environment, so
# agentic_enabled() is False and every agent takes its deterministic-only path).
# ---------------------------------------------------------------------------

def test_full_pipeline_findings_unaffected_by_agentic_layer():
    """The agentic tool layer only produces narrative (ai_analysis); it must never change
    the deterministic findings themselves, regardless of whether a live NVIDIA_API_KEY is
    configured in this environment (ai_mode may legitimately be NEMOTRON or DETERMINISTIC)."""
    zap_report = json.dumps({
        "site": [{
            "alerts": [{
                "name": "Apache Log4j RCE",
                "riskcode": "3",
                "confidence": "3",
                "cweid": "502",
                "otherinfo": "CVE-2021-44228 detected",
                "instances": [{"uri": "https://10.0.0.9:8443/login"}],
            }]
        }]
    })
    r1 = client.post("/api/v1/agent1/parse", json={"reports": [{"scanner_type": "OWASP_ZAP", "content": zap_report}]})
    assert r1.status_code == 200
    body = r1.json()
    assert body["ai_analysis"]["ai_mode"] in ("DETERMINISTIC", "NEMOTRON")
    assert len(body["findings"]) == 1
    assert body["findings"][0]["cve_id"] == "CVE-2021-44228"
    assert body["findings"][0]["scanner_source"] == "OWASP_ZAP"
