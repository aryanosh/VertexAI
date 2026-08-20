import json
import xmltodict
from urllib.parse import urlparse
from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field
import logging

from agent_schemas import AIAnalysis, ai_analysis_from_result, sections_system_prompt

# Configure logging for diagnostics
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AGENT1_ROLE = (
    "You are Agent 1 of a human-supervised vulnerability triage pipeline: Scanner "
    "Normalization. Deterministic parsers have already converted raw ZAP/Nuclei/OpenVAS/Nmap "
    "output into a shared UnifiedFinding schema (scanner source, CVE, CVSS, host, port, "
    "severity). Your job is to review the counts and flags you are given and explain, in "
    "plain language, what was normalized, which findings have missing or reconciled data "
    "(e.g. no CVE id, default CVSS), and how confident an analyst should be in this batch."
)

router = APIRouter(prefix="/api/v1/agent1")

class UnifiedFinding(BaseModel):
    scanner_source: str
    cve_id: str
    vulnerability_name: str
    target_host: str
    target_port: int
    endpoint_path: str = "/"
    cvss_base_score: float
    scanner_confidence: int
    http_response_code: int = 200
    port_is_open: int = 1
    historical_plugin_fp_rate: float = 0.1

class Report(BaseModel):
    scanner_type: str = Field(alias="scannerType")
    content: str
    
    class Config:
        populate_by_name = True  # Accept both snake_case and camelCase

class ParseRequest(BaseModel):
    reports: Optional[List[Report]] = None
    target_host: Optional[str] = None
    scanners: Optional[List[str]] = None

class ParseResponse(BaseModel):
    stage_summary: Optional[str] = None
    status: str = "WAITING_FOR_HUMAN"
    findings: List[UnifiedFinding]
    ai_analysis: Optional[AIAnalysis] = None

def parse_zap(content: str) -> List[UnifiedFinding]:
    """Parse OWASP ZAP JSON reports."""
    findings = []
    try:
        data = json.loads(content)
        site_data = data.get("site", [])
        if isinstance(site_data, dict):
            site_data = [site_data]
            
        risk_map = {0: 0.0, 1: 3.0, 2: 5.0, 3: 8.0}
        
        for site in site_data:
            alerts = site.get("alerts", [])
            for alert in alerts:
                name = alert.get("name", "")
                riskcode = int(alert.get("riskcode", 0))
                confidence = int(alert.get("confidence", 1))
                cweid = alert.get("cweid", "")
                otherinfo = alert.get("otherinfo", "")
                reference = alert.get("reference", "")
                
                cve_id = f"CWE-{cweid}" if cweid else "UNKNOWN"
                for text in [otherinfo, reference]:
                    if "CVE-" in text:
                        start = text.find("CVE-")
                        cve_id = text[start:].split()[0].strip(',."\'<>')
                        break
                        
                cvss = risk_map.get(riskcode, 0.0)
                
                for instance in alert.get("instances", []):
                    uri = instance.get("uri", "")
                    parsed = urlparse(uri)
                    host = parsed.hostname or "unknown"
                    port = parsed.port or (443 if parsed.scheme == "https" else 80)
                    path = parsed.path or "/"
                    
                    findings.append(UnifiedFinding(
                        scanner_source="OWASP_ZAP",
                        cve_id=cve_id,
                        vulnerability_name=name,
                        target_host=host,
                        target_port=port,
                        endpoint_path=path,
                        cvss_base_score=cvss,
                        scanner_confidence=confidence,
                    ))
    except Exception:
        pass
    return findings

def parse_nuclei(content: str) -> List[UnifiedFinding]:
    """Parse Nuclei JSONL reports."""
    findings = []
    severity_map = {"critical": 9.5, "high": 7.5, "medium": 5.0, "low": 3.0, "info": 0.0}
    conf_map = {"critical": 3, "high": 3, "medium": 2, "low": 1, "info": 1}
    for line in content.splitlines():
        if not line.strip():
            continue
        try:
            data = json.loads(line)
            info = data.get("info", {})
            name = info.get("name", "")
            severity = info.get("severity", "info").lower()
            
            cve_id = "UNKNOWN"
            classification = info.get("classification", {})
            cves = classification.get("cve-id", [])
            if cves and isinstance(cves, list):
                cve_id = cves[0]
            else:
                tags = info.get("tags", [])
                for tag in tags:
                    if tag.upper().startswith("CVE-"):
                        cve_id = tag.upper()
                        break
                        
            matched_at = data.get("matched-at", "")
            parsed = urlparse(matched_at)
            host = data.get("host", parsed.hostname or "unknown")
            if ":" in host:
                host = host.split(":")[0]
                
            port_str = data.get("port", str(parsed.port))
            port = int(port_str) if port_str and str(port_str).isdigit() else (443 if parsed.scheme == "https" else 80)
            path = parsed.path or "/"
            
            cvss = severity_map.get(severity, 0.0)
            confidence = conf_map.get(severity, 1)
            
            findings.append(UnifiedFinding(
                scanner_source="NUCLEI",
                cve_id=cve_id,
                vulnerability_name=name,
                target_host=host,
                target_port=port,
                endpoint_path=path,
                cvss_base_score=cvss,
                scanner_confidence=confidence,
            ))
        except Exception:
            continue
    return findings

def parse_openvas(content: str) -> List[UnifiedFinding]:
    """Parse OpenVAS XML reports."""
    findings = []
    try:
        data = xmltodict.parse(content)
        results = data.get("report", {}).get("results", {}).get("result", [])
        if isinstance(results, dict):
            results = [results]
            
        conf_map = {"High": 3, "Medium": 2, "Low": 1}
        
        for res in results:
            host = res.get("host", "unknown")
            port_str = res.get("port", "80/tcp")
            port = int(port_str.split("/")[0]) if "/" in port_str and port_str.split("/")[0].isdigit() else 80
            
            nvt = res.get("nvt", {})
            name = nvt.get("name", "")
            cvss_str = nvt.get("cvss_base", "0.0")
            cvss = float(cvss_str) if cvss_str else 0.0
            
            cve = nvt.get("cve", "NOCVE")
            if cve == "NOCVE":
                cve = "UNKNOWN"
                
            threat = res.get("threat", "Low")
            confidence = conf_map.get(threat, 1)
            
            findings.append(UnifiedFinding(
                scanner_source="OPENVAS",
                cve_id=cve,
                vulnerability_name=name,
                target_host=host,
                target_port=port,
                cvss_base_score=cvss,
                scanner_confidence=confidence,
            ))
    except Exception:
        pass
    return findings

def parse_nmap(content: str) -> List[UnifiedFinding]:
    """Parse Nmap XML reports."""
    findings = []
    try:
        data = xmltodict.parse(content)
        hosts = data.get("nmaprun", {}).get("host", [])
        if isinstance(hosts, dict):
            hosts = [hosts]
            
        for host in hosts:
            address = host.get("address", {})
            if isinstance(address, list):
                address = address[0]
            host_ip = address.get("@addr", "unknown")
            
            ports_data = host.get("ports", {}).get("port", [])
            if isinstance(ports_data, dict):
                ports_data = [ports_data]
                
            for port in ports_data:
                port_id = int(port.get("@portid", 0))
                state = port.get("state", {}).get("@state", "closed")
                port_is_open = 1 if state == "open" else 0
                
                scripts = port.get("script", [])
                if isinstance(scripts, dict):
                    scripts = [scripts]
                    
                for script in scripts:
                    script_id = script.get("@id", "").lower()
                    if "vuln" in script_id or "cve" in script_id:
                        output = script.get("@output", "")
                        cve_id = "UNKNOWN"
                        
                        if "CVE-" in script_id.upper():
                            start = script_id.upper().find("CVE-")
                            cve_id = script_id.upper()[start:start+14]
                        elif "CVE-" in output:
                            start = output.find("CVE-")
                            cve_id = output[start:].split()[0].strip(',."\'<>')
                            
                        findings.append(UnifiedFinding(
                            scanner_source="NMAP",
                            cve_id=cve_id,
                            vulnerability_name=script.get("@id", ""),
                            target_host=host_ip,
                            target_port=port_id,
                            cvss_base_score=5.0,
                            scanner_confidence=2,
                            port_is_open=port_is_open,
                            historical_plugin_fp_rate=0.15
                        ))
    except Exception:
        pass
    return findings

@router.post("/parse", response_model=ParseResponse)
async def parse_reports(request: ParseRequest):
    logger.info("📥 Agent 1 received parse request")
    logger.info(f"  ├─ target_host: {request.target_host}")
    logger.info(f"  ├─ scanners: {request.scanners}")
    logger.info(f"  └─ reports_count: {len(request.reports) if request.reports else 0}")
    
    if request.reports:
        logger.info(f"📄 First uploaded report:")
        logger.info(f"  ├─ scanner_type: {request.reports[0].scanner_type}")
        logger.info(f"  ├─ content_length: {len(request.reports[0].content)} bytes")
        logger.info(f"  └─ content_preview: {request.reports[0].content[:100]}...")
    
    all_findings = []
    
    reports = request.reports or []
    if not reports:
        logger.warning("⚠️  No uploaded reports received - falling back to sample fixtures")
        # Load sample report fixtures from disk for requested scanners or all scanners
        import os
        sample_dir = os.path.join(os.path.dirname(__file__), "sample_reports")
        if not os.path.exists(sample_dir):
            sample_dir = os.path.join(os.path.dirname(__file__), "..", "sample_reports")
            
        requested_scanners = [s.upper() for s in request.scanners] if request.scanners else ["OWASP_ZAP", "NUCLEI", "OPENVAS", "NMAP"]
        
        scanner_file_map = {
            "OWASP_ZAP": "zap_scan.json",
            "ZAP": "zap_scan.json",
            "NUCLEI": "nuclei_scan.jsonl",
            "OPENVAS": "openvas_scan.xml",
            "NMAP": "nmap_scan.xml"
        }
        
        for sc, fname in scanner_file_map.items():
            if any(sc in req for req in requested_scanners):
                fpath = os.path.join(sample_dir, fname)
                if os.path.exists(fpath):
                    with open(fpath, "r", encoding="utf-8") as f:
                        reports.append(Report(scanner_type=sc, content=f.read()))
    else:
        logger.info(f"✅ Processing {len(reports)} uploaded reports (not using samples)")

    for report in reports:
        scanner = report.scanner_type.upper()
        if "ZAP" in scanner:
            all_findings.extend(parse_zap(report.content))
        elif "NUCLEI" in scanner:
            all_findings.extend(parse_nuclei(report.content))
        elif "OPENVAS" in scanner:
            all_findings.extend(parse_openvas(report.content))
        elif "NMAP" in scanner:
            all_findings.extend(parse_nmap(report.content))
            
    summary = f"Parsed {len(all_findings)} raw findings across {len(reports)} scanner reports. Standardized schemas and mapped baseline CVSS scores."

    scanners_seen = sorted({f.scanner_source for f in all_findings})
    missing_cve = [f for f in all_findings if f.cve_id == "UNKNOWN"]
    deterministic_analysis = AIAnalysis(
        processing_summary=summary,
        evidence_used=(
            f"{len(all_findings)} parsed findings from scanners: {', '.join(scanners_seen) or 'none'}."
        ),
        tools_and_sources="Deterministic per-scanner parsers (ZAP JSON, Nuclei JSONL, OpenVAS XML, Nmap XML).",
        decision_rationale="Field mapping and CVSS baselines applied via fixed per-scanner lookup tables.",
        confidence_and_limitations=(
            f"{len(missing_cve)} of {len(all_findings)} finding(s) had no CVE identifier and were "
            "tagged UNKNOWN; downstream agents treat these as lower-confidence."
            if all_findings
            else "No findings were parsed from the supplied reports."
        ),
    )

    ai_analysis = deterministic_analysis
    try:
        from agent_runtime import agentic_enabled, run_agent, wrap_untrusted, NVIDIA_MODEL

        if agentic_enabled() and all_findings:
            from agent1_tools import build_tools as build_agent1_tools

            sample_titles = "; ".join(
                wrap_untrusted(f.vulnerability_name, max_chars=80) for f in all_findings[:8]
            )
            goal = (
                f"Batch summary: {len(all_findings)} findings from {len(reports)} report(s) across "
                f"scanners {scanners_seen}. {len(missing_cve)} finding(s) have no CVE id. "
                f"Sample finding titles:\n{sample_titles}\n\n"
                "Investigate this normalization run using your tools before answering: for any "
                "finding missing a CVE id, call explain_missing_field to understand why its "
                "scanner left it that way; if a specific finding's CVSS looks suspicious, use "
                "inspect_finding and lookup_cve_metadata to verify it against the real NVD record. "
                "Then summarize this normalization run for a human security analyst, grounded in "
                "what your tool calls actually returned."
            )
            result = await run_agent(
                goal=goal,
                system_prompt=sections_system_prompt(AGENT1_ROLE),
                tools=build_agent1_tools(all_findings),
                expect_json=True,
            )
            ai_analysis = ai_analysis_from_result(
                result, model_name=NVIDIA_MODEL, deterministic=deterministic_analysis
            )
    except Exception as exc:
        logger.warning(f"Agent 1 Nemotron summarization skipped: {exc}")

    return ParseResponse(
        status="WAITING_FOR_HUMAN", stage_summary=summary, findings=all_findings, ai_analysis=ai_analysis
    )
