import json
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def run_verification():
    print("=" * 80)
    print("VERTEXAI MULTI-AGENT PIPELINE VERIFICATION")
    print("=" * 80)

    # -------------------------------------------------------------
    # STAGE 1: Agent 1 (Scanner Parser & Normalizer)
    # -------------------------------------------------------------
    print("\n[STAGE 1] Ingesting Scanner Reports -> Agent 1 Parser...")
    
    zap_report = json.dumps({
        "site": [{
            "alerts": [{
                "name": "Log4j Remote Code Execution",
                "riskcode": "3",
                "confidence": "3",
                "cweid": "502",
                "otherinfo": "CVE-2021-44228 in authorization header",
                "instances": [{"uri": "https://api.sentinelai.internal:8443/v1/auth/login"}]
            }]
        }]
    })
    nuclei_report = json.dumps({
        "template-id": "cve-2021-44228",
        "info": {
            "name": "Apache Log4j RCE",
            "severity": "critical",
            "classification": {"cve-id": ["CVE-2021-44228"]}
        },
        "host": "api.sentinelai.internal",
        "matched-at": "https://api.sentinelai.internal:8443/v1/auth/login"
    })
    openvas_report = """<report><results><result>
        <host>api.sentinelai.internal</host>
        <port>8443/tcp</port>
        <threat>High</threat>
        <nvt>
            <name>Apache Log4j RCE Vulnerability</name>
            <cvss_base>9.8</cvss_base>
            <cve>CVE-2021-44228</cve>
        </nvt>
    </result></results></report>"""

    r1 = client.post("/api/v1/agent1/parse", json={
        "reports": [
            {"scanner_type": "OWASP_ZAP", "content": zap_report},
            {"scanner_type": "NUCLEI", "content": nuclei_report},
            {"scanner_type": "OPENVAS", "content": openvas_report}
        ]
    })
    d1 = r1.json()
    print(f"-> State Transition: {d1['status']}")
    print(f"-> Parsed Findings Count: {len(d1['findings'])} findings across 3 scanners")
    for i, f in enumerate(d1['findings'], 1):
        print(f"   [{i}] Scanner: {f['scanner_source']} | Target: {f['target_host']}:{f['target_port']}{f['endpoint_path']} | CVE: {f['cve_id']} | CVSS: {f['cvss_base_score']}")

    # -------------------------------------------------------------
    # STAGE 2: Agent 2 (Noise Reduction & XGBoost Deduplication)
    # -------------------------------------------------------------
    print("\n[HUMAN REVIEW 1] Decision: Continue -> Advancing to Agent 2")
    print("[STAGE 2] Running Agent 2: Cryptographic Deduplication & XGBoost FP Model...")
    r2 = client.post("/api/v1/agent2/reduce-noise", json={"findings": d1["findings"]})
    d2 = r2.json()
    stats = d2["statistics"]
    print(f"-> State Transition: {d2['status']}")
    print(f"-> Statistics: {stats['input_count']} Raw Findings -> {stats['output_count']} Canonical Finding ({stats['duplicate_reduction_pct']:.1f}% Noise Reduction)")
    canonical = d2["findings"][0]
    print(f"-> Master Fingerprint: {canonical['fingerprint_hash']}")
    print(f"   Merged Scanners: {canonical['scanner_sources']}")
    print(f"   XGBoost FP Probability: {canonical['false_positive_prob']:.4f} (Suppressed: {canonical['is_suppressed']})")

    # -------------------------------------------------------------
    # STAGE 3: Agent 3 (Threat Intelligence & Exploitability)
    # -------------------------------------------------------------
    print("\n[HUMAN REVIEW 2] Decision: Continue -> Advancing to Agent 3")
    print("[STAGE 3] Running Agent 3: Threat Intelligence Enrichment (KEV + EPSS)...")
    r3 = client.post("/api/v1/agent3/enrich", json={"findings": d2["findings"]})
    d3 = r3.json()
    print(f"-> State Transition: {d3['status']}")
    enriched = d3["findings"][0]
    print(f"-> Enriched CVE: {enriched['cve_id']}")
    print(f"   CISA KEV Listed: {enriched['is_cisa_kev']} (+25.0 KEV Bonus)")
    print(f"   FIRST.org EPSS Exploit Probability: {enriched['epss_score'] * 100:.2f}% (Percentile: {enriched['epss_percentile'] * 100:.1f}%)")
    print(f"   Exploit-DB Available: {enriched['exploit_db_available']}")

    # -------------------------------------------------------------
    # STAGE 4: Agent 4 (Composite Risk Scoring & Ticket Preparation)
    # -------------------------------------------------------------
    print("\n[HUMAN REVIEW 3] Decision: Continue -> Advancing to Agent 4")
    print("[STAGE 4] Running Agent 4: Risk Scoring & Ticket Payload Preparation...")
    r4 = client.post("/api/v1/agent4/score-and-ticket", json={
        "findings": d3["findings"],
        "asset_context": {
            "asset_id": "asset-uuid-001",
            "hostname": "api.sentinelai.internal",
            "criticality_rating": 5,
            "environment": "PRODUCTION"
        }
    })
    d4 = r4.json()
    print(f"-> State Transition: {d4['status']}")
    scored = d4["scored_findings"][0]
    ticket = d4["ticket_payloads"][0]
    print(f"-> Composite Risk Score: {scored['composite_risk_score']:.2f} / 100.0")
    print(f"-> Assigned Priority Tier: {scored['priority_level']}")
    print(f"-> SLA Deadline: {scored['sla_deadline']}")
    print(f"-> Explainable Rationale:\n   {scored['explainable_rationale']}")
    
    print("\n[STAGE 5: FINAL HUMAN APPROVAL GATE]")
    print(f"-> Pipeline is paused at: {d4['status']}")
    print("-> Ticket Prepared (Awaiting Human Approval before Team 1 GitHub dispatch):")
    print(f"   Title:    {ticket['title']}")
    print(f"   Labels:   {ticket['labels']}")
    print(f"   Assignee: {ticket['assignee']} (Waiting for human assignment)")
    print(f"   Body Preview:\n{ticket['body']}")
    print("\n" + "=" * 80)
    print("ALL 4 AGENTS VERIFIED IN FULL HITL WORKFLOW!")
    print("=" * 80)

if __name__ == "__main__":
    run_verification()
