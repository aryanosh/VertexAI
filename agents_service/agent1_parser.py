import json
import xmltodict
from urllib.parse import urlparse
from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel

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
    scanner_type: str
    content: str

class ParseRequest(BaseModel):
    reports: Optional[List[Report]] = None
    target_host: Optional[str] = None
    scanners: Optional[List[str]] = None

class ParseResponse(BaseModel):
    status: str = "WAITING_FOR_HUMAN"
    findings: List[UnifiedFinding]

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
    all_findings = []
    
    reports = request.reports or []
    if not reports:
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
            
    return ParseResponse(status="WAITING_FOR_HUMAN", findings=all_findings)
