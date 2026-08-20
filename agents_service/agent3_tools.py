"""
Threat-intelligence tools available to Agent 3.

Each function here is real code performing a real lookup. The agent chooses which to call
and in what order; these functions never guess. When a source has no data they say so
explicitly with `found: false` rather than returning a zero that is indistinguishable from
"not exploitable" — that ambiguity was a genuine triage hazard in the previous
implementation, where an unknown CVE and a harmless CVE both produced epss_score 0.0.
"""

from __future__ import annotations

import os
from typing import Any, Dict

import httpx

CISA_KEV_URL = os.getenv(
    "CISA_KEV_URL",
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
)
FIRST_EPSS_URL = os.getenv("FIRST_EPSS_URL", "https://api.first.org/data/v1/epss")
NVD_API_URL = os.getenv("NVD_API_URL", "https://services.nvd.nist.gov/rest/json/cves/2.0")
EXPLOITDB_CSV_URL = os.getenv(
    "EXPLOITDB_CSV_URL",
    "https://gitlab.com/exploit-database/exploitdb/-/raw/main/files_exploits.csv",
)

HTTP_TIMEOUT = float(os.getenv("INTEL_HTTP_TIMEOUT", "8"))

# Process-lifetime caches. The KEV catalogue and Exploit-DB index are large single files, so
# they are fetched at most once per process rather than once per CVE.
_kev_cache: Dict[str, Any] = {"loaded": False, "cves": set(), "error": None}
_exploitdb_cache: Dict[str, Any] = {"loaded": False, "text": "", "error": None}


# ---------------------------------------------------------------------------
# Mock-backed variants (USE_MOCKS=true) so the agent still functions offline
# ---------------------------------------------------------------------------

def _mock_sources():
    """Imported lazily to avoid a circular import with agent3_threat."""
    from agent3_threat import USE_MOCKS, mock_epss_data, mock_kev_data

    return USE_MOCKS, mock_kev_data, mock_epss_data


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

async def cisa_kev_lookup(cve_id: str) -> Dict[str, Any]:
    """Is this CVE in the CISA Known Exploited Vulnerabilities catalogue?"""
    cve_id = (cve_id or "").strip().upper()
    if not cve_id:
        return {"source": "CISA_KEV", "found": False, "error": "cve_id was empty"}

    use_mocks, mock_kev, _ = _mock_sources()
    if use_mocks:
        listed = bool(mock_kev.get(cve_id, False))
        return {
            "source": "CISA_KEV",
            "provenance": "MOCK_FIXTURES",
            "found": True,
            "cve_id": cve_id,
            "listed_as_actively_exploited": listed,
            "note": "Offline fixture data, not a live CISA query.",
        }

    if not _kev_cache["loaded"]:
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                r = await client.get(CISA_KEV_URL)
            if r.status_code == 200:
                catalog = r.json()
                _kev_cache["cves"] = {
                    v.get("cveID", "").upper() for v in catalog.get("vulnerabilities", [])
                }
                _kev_cache["loaded"] = True
            else:
                _kev_cache["error"] = f"HTTP {r.status_code}"
        except Exception as exc:
            _kev_cache["error"] = str(exc)

    if not _kev_cache["loaded"]:
        return {
            "source": "CISA_KEV",
            "provenance": "LIVE",
            "found": False,
            "cve_id": cve_id,
            "error": f"catalogue unavailable: {_kev_cache['error']}",
        }

    return {
        "source": "CISA_KEV",
        "provenance": "LIVE",
        "found": True,
        "cve_id": cve_id,
        "listed_as_actively_exploited": cve_id in _kev_cache["cves"],
        "catalogue_size": len(_kev_cache["cves"]),
    }


async def epss_lookup(cve_id: str) -> Dict[str, Any]:
    """FIRST.org EPSS probability that this CVE will be exploited in the next 30 days."""
    cve_id = (cve_id or "").strip().upper()
    if not cve_id:
        return {"source": "FIRST_EPSS", "found": False, "error": "cve_id was empty"}

    use_mocks, _, mock_epss = _mock_sources()
    if use_mocks:
        hit = mock_epss.get(cve_id)
        if not hit:
            return {
                "source": "FIRST_EPSS",
                "provenance": "MOCK_FIXTURES",
                "found": False,
                "cve_id": cve_id,
                "note": "No fixture entry. This means NO DATA, not a score of zero.",
            }
        return {
            "source": "FIRST_EPSS",
            "provenance": "MOCK_FIXTURES",
            "found": True,
            "cve_id": cve_id,
            "epss": hit.get("epss", 0.0),
            "percentile": hit.get("percentile", 0.0),
        }

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            r = await client.get(FIRST_EPSS_URL, params={"cve": cve_id})
        if r.status_code != 200:
            return {
                "source": "FIRST_EPSS",
                "provenance": "LIVE",
                "found": False,
                "cve_id": cve_id,
                "error": f"HTTP {r.status_code}",
            }
        items = (r.json() or {}).get("data") or []
        if not items:
            return {
                "source": "FIRST_EPSS",
                "provenance": "LIVE",
                "found": False,
                "cve_id": cve_id,
                "note": "No EPSS score published. Often means the CVE is very new. "
                        "This is NO DATA, not a score of zero.",
            }
        item = items[0]
        return {
            "source": "FIRST_EPSS",
            "provenance": "LIVE",
            "found": True,
            "cve_id": cve_id,
            "epss": float(item.get("epss", 0.0)),
            "percentile": float(item.get("percentile", 0.0)),
        }
    except Exception as exc:
        return {
            "source": "FIRST_EPSS",
            "provenance": "LIVE",
            "found": False,
            "cve_id": cve_id,
            "error": str(exc),
        }


async def nvd_lookup(cve_id: str) -> Dict[str, Any]:
    """NVD record: CVSS vector/score, CWE, publication date, description."""
    cve_id = (cve_id or "").strip().upper()
    if not cve_id:
        return {"source": "NVD", "found": False, "error": "cve_id was empty"}

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            r = await client.get(NVD_API_URL, params={"cveId": cve_id})
        if r.status_code != 200:
            return {
                "source": "NVD",
                "found": False,
                "cve_id": cve_id,
                "error": f"HTTP {r.status_code}",
            }
        vulns = (r.json() or {}).get("vulnerabilities") or []
        if not vulns:
            return {
                "source": "NVD",
                "found": False,
                "cve_id": cve_id,
                "note": "No NVD record. May be very new, withdrawn, or not a real CVE id.",
            }

        cve = vulns[0].get("cve", {})
        metrics = cve.get("metrics", {})
        cvss_score = None
        cvss_vector = None
        severity = None
        for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            entries = metrics.get(key) or []
            if entries:
                data = entries[0].get("cvssData", {})
                cvss_score = data.get("baseScore")
                cvss_vector = data.get("vectorString")
                severity = data.get("baseSeverity") or entries[0].get("baseSeverity")
                break

        descriptions = cve.get("descriptions") or []
        english = next(
            (d.get("value") for d in descriptions if d.get("lang") == "en"),
            "",
        )
        weaknesses = []
        for w in cve.get("weaknesses") or []:
            for d in w.get("description") or []:
                if d.get("value"):
                    weaknesses.append(d["value"])

        return {
            "source": "NVD",
            "found": True,
            "cve_id": cve_id,
            "cvss_base_score": cvss_score,
            "cvss_vector": cvss_vector,
            "severity": severity,
            "cwe": weaknesses[:4],
            "published": cve.get("published"),
            "last_modified": cve.get("lastModified"),
            "vuln_status": cve.get("vulnStatus"),
            "description": (english or "")[:400],
        }
    except Exception as exc:
        return {"source": "NVD", "found": False, "cve_id": cve_id, "error": str(exc)}


async def exploitdb_search(cve_id: str) -> Dict[str, Any]:
    """Is there public proof-of-concept exploit code indexed for this CVE?"""
    cve_id = (cve_id or "").strip().upper()
    if not cve_id:
        return {"source": "EXPLOIT_DB", "found": False, "error": "cve_id was empty"}

    use_mocks, mock_kev, mock_epss = _mock_sources()
    if use_mocks:
        # Offline heuristic proxy: KEV-listed or high EPSS implies public exploit code.
        kev = bool(mock_kev.get(cve_id, False))
        epss = (mock_epss.get(cve_id) or {}).get("epss", 0.0)
        return {
            "source": "EXPLOIT_DB",
            "provenance": "MOCK_FIXTURES",
            "found": True,
            "cve_id": cve_id,
            "public_exploit_available": bool(kev or epss > 0.5),
            "note": "Derived from offline fixtures, not a real Exploit-DB query.",
        }

    if not _exploitdb_cache["loaded"]:
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
                r = await client.get(EXPLOITDB_CSV_URL)
            if r.status_code == 200:
                _exploitdb_cache["text"] = r.text
                _exploitdb_cache["loaded"] = True
            else:
                _exploitdb_cache["error"] = f"HTTP {r.status_code}"
        except Exception as exc:
            _exploitdb_cache["error"] = str(exc)

    if not _exploitdb_cache["loaded"]:
        return {
            "source": "EXPLOIT_DB",
            "provenance": "LIVE",
            "found": False,
            "cve_id": cve_id,
            "error": f"index unavailable: {_exploitdb_cache['error']}",
        }

    hit = cve_id in _exploitdb_cache["text"].upper()
    return {
        "source": "EXPLOIT_DB",
        "provenance": "LIVE",
        "found": True,
        "cve_id": cve_id,
        "public_exploit_available": hit,
    }


# ---------------------------------------------------------------------------
# Tool schemas exposed to the model
# ---------------------------------------------------------------------------

_CVE_PARAM = {
    "type": "object",
    "properties": {
        "cve_id": {
            "type": "string",
            "description": "CVE identifier, e.g. CVE-2021-44228",
        }
    },
    "required": ["cve_id"],
}


def build_tools():
    """Construct the Tool objects Agent 3 may use."""
    from agent_runtime import Tool

    return [
        Tool(
            name="cisa_kev_lookup",
            description=(
                "Check the CISA Known Exploited Vulnerabilities catalogue. The strongest "
                "single signal: listing means confirmed exploitation in the wild. Absence "
                "does NOT mean safe, only that CISA has not catalogued it."
            ),
            parameters=_CVE_PARAM,
            handler=cisa_kev_lookup,
        ),
        Tool(
            name="epss_lookup",
            description=(
                "Get the FIRST.org EPSS probability (0..1) of exploitation within 30 days. "
                "If found is false there is NO score published, which is different from a "
                "score of zero. Newly published CVEs often have no EPSS score yet."
            ),
            parameters=_CVE_PARAM,
            handler=epss_lookup,
        ),
        Tool(
            name="nvd_lookup",
            description=(
                "Fetch the NVD record: CVSS base score and vector, CWE, publication date, "
                "status and description. Useful when KEV and EPSS return nothing, to judge "
                "whether the CVE is simply too new, or to confirm the identifier is real."
            ),
            parameters=_CVE_PARAM,
            handler=nvd_lookup,
        ),
        Tool(
            name="exploitdb_search",
            description=(
                "Check whether public proof-of-concept exploit code is indexed for this CVE. "
                "Public exploit code raises real-world risk even when EPSS is low or absent."
            ),
            parameters=_CVE_PARAM,
            handler=exploitdb_search,
        ),
    ]
