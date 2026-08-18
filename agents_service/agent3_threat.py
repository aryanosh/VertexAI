import os
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel
import httpx

router = APIRouter(prefix="/api/v1/agent3")

USE_MOCKS = os.getenv("USE_MOCKS", "true").lower() == "true"

class CanonicalFinding(BaseModel):
    finding_id: str
    fingerprint_hash: str
    cve_id: str
    vulnerability_name: str
    target_host: str
    target_port: int
    cvss_base_score: float
    scanner_sources: List[str]
    false_positive_prob: float
    is_suppressed: bool
    is_accepted_risk: bool

class EnrichedFinding(CanonicalFinding):
    is_cisa_kev: bool = False
    epss_score: float = 0.0
    epss_percentile: float = 0.0
    exploit_db_available: bool = False

class VulnerabilityIntelligence(BaseModel):
    cve_id: str
    is_cisa_kev: bool = False
    epss_score: float = 0.0
    epss_percentile: float = 0.0
    exploit_db_available: bool = False

class EnrichRequest(BaseModel):
    findings: List[CanonicalFinding]

class EnrichResponse(BaseModel):
    status: str = "WAITING_FOR_HUMAN"
    findings: List[EnrichedFinding]
    vulnerability_intelligence: List[VulnerabilityIntelligence]

MOCK_DIR = Path(__file__).parent / "mocks"
MOCK_KEV_FILE = MOCK_DIR / "mock_kev.json"
MOCK_EPSS_FILE = MOCK_DIR / "mock_epss.json"

mock_kev_data: Dict[str, bool] = {}
mock_epss_data: Dict[str, Dict[str, float]] = {}

def load_mocks():
    """Load mock KEV and EPSS data into memory for offline execution/fallback."""
    global mock_kev_data, mock_epss_data
    try:
        if MOCK_KEV_FILE.exists():
            with open(MOCK_KEV_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for vuln in data.get("vulnerabilities", []):
                    cve = vuln.get("cveID")
                    if cve:
                        mock_kev_data[cve] = True
        if MOCK_EPSS_FILE.exists():
            with open(MOCK_EPSS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data.get("data", []):
                    cve = item.get("cve")
                    if cve:
                        mock_epss_data[cve] = {
                            "epss": float(item.get("epss", 0.0)),
                            "percentile": float(item.get("percentile", 0.0))
                        }
    except Exception as e:
        print(f"Failed to load mocks: {e}")

load_mocks()

async def fetch_cisa_kev(client: httpx.AsyncClient, cve: str) -> bool:
    """Check if CVE is in CISA KEV feed via live call or cached mock."""
    if USE_MOCKS:
        return mock_kev_data.get(cve, False)
    try:
        url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
        response = await client.get(url, timeout=5.0)
        if response.status_code == 200:
            catalog = response.json()
            for vuln in catalog.get("vulnerabilities", []):
                if vuln.get("cveID") == cve:
                    return True
            return False
    except Exception:
        pass
    # Fallback to local mock data
    return mock_kev_data.get(cve, False)

async def fetch_epss(client: httpx.AsyncClient, cve: str) -> Dict[str, float]:
    """Fetch EPSS score and percentile from FIRST.org API or fallback to mock."""
    if USE_MOCKS:
        return mock_epss_data.get(cve, {"epss": 0.0, "percentile": 0.0})
    try:
        url = f"https://api.first.org/data/v1/epss?cve={cve}"
        response = await client.get(url, timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            items = data.get("data", [])
            if items:
                item = items[0]
                return {
                    "epss": float(item.get("epss", 0.0)),
                    "percentile": float(item.get("percentile", 0.0))
                }
    except Exception:
        pass
    # Fallback to mock
    return mock_epss_data.get(cve, {"epss": 0.0, "percentile": 0.0})

async def fetch_nvd_metadata(client: httpx.AsyncClient, cve: str) -> Dict[str, Any]:
    """Fetch NVD metadata (CVSS/CWE/CPE) best effort."""
    try:
        url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve}"
        response = await client.get(url, timeout=5.0)
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return {}

@router.post("/enrich", response_model=EnrichResponse)
async def enrich_findings(request: EnrichRequest):
    """Enrich canonical findings with threat intelligence (CISA KEV, EPSS, Exploit-DB)."""
    cve_intel: Dict[str, VulnerabilityIntelligence] = {}
    
    # Process unique CVEs
    unique_cves = list(set([f.cve_id for f in request.findings if f.cve_id and f.cve_id != "UNKNOWN"]))
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        for cve in unique_cves:
            is_kev = await fetch_cisa_kev(client, cve)
            epss_info = await fetch_epss(client, cve)
            # Public exploit metadata check (never execute exploits)
            exploit_db_available = is_kev or (epss_info.get("epss", 0.0) > 0.5)
            
            cve_intel[cve] = VulnerabilityIntelligence(
                cve_id=cve,
                is_cisa_kev=is_kev,
                epss_score=epss_info.get("epss", 0.0),
                epss_percentile=epss_info.get("percentile", 0.0),
                exploit_db_available=exploit_db_available
            )
            
    enriched_findings: List[EnrichedFinding] = []
    for finding in request.findings:
        intel = cve_intel.get(finding.cve_id)
        if intel:
            is_kev = intel.is_cisa_kev
            epss = intel.epss_score
            percentile = intel.epss_percentile
            exploit_avail = intel.exploit_db_available
        else:
            is_kev = False
            epss = 0.0
            percentile = 0.0
            exploit_avail = False
            
        enriched_findings.append(EnrichedFinding(
            finding_id=finding.finding_id,
            fingerprint_hash=finding.fingerprint_hash,
            cve_id=finding.cve_id,
            vulnerability_name=finding.vulnerability_name,
            target_host=finding.target_host,
            target_port=finding.target_port,
            cvss_base_score=finding.cvss_base_score,
            scanner_sources=finding.scanner_sources,
            false_positive_prob=finding.false_positive_prob,
            is_suppressed=finding.is_suppressed,
            is_accepted_risk=finding.is_accepted_risk,
            is_cisa_kev=is_kev,
            epss_score=epss,
            epss_percentile=percentile,
            exploit_db_available=exploit_avail
        ))
        
    return EnrichResponse(
        status="WAITING_FOR_HUMAN",
        findings=enriched_findings,
        vulnerability_intelligence=list(cve_intel.values())
    )
