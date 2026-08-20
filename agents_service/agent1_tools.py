"""
Tools available to Agent 1 (Scanner Normalization).

Deterministic parsers have already built the UnifiedFinding batch before the agent runs;
these tools let the model investigate real, specific ambiguities in that batch rather than
narrate it blind. Nothing here invents data — a missing NVD record is reported as missing,
not guessed.
"""

from __future__ import annotations

from typing import Any, Dict, List

# Scanner-specific reasons a field commonly ends up missing/defaulted, grounded in how each
# parser actually behaves (see agent1_parser.py) — not guesses, but documented parser gaps.
_SCANNER_GAP_NOTES = {
    "OWASP_ZAP": "ZAP alerts map CVE only when one appears in 'otherinfo'/'reference' text; "
                 "many findings only carry a CWE id, so cve_id falls back to CWE-<n> or UNKNOWN.",
    "NUCLEI": "Nuclei templates without a 'cve-id' classification or 'CVE-' tag parse with "
              "cve_id=UNKNOWN; severity-derived CVSS is a fixed lookup, not the template's own.",
    "OPENVAS": "OpenVAS <nvt><cve> is literal 'NOCVE' for many general-purpose checks (info "
               "disclosure, banner grabs), which the parser maps to UNKNOWN.",
    "NMAP": "Nmap NSE 'vuln'/'cve' scripts only carry a CVE id when it appears in the script "
            "id or @output text; generic vuln-category scripts often have neither.",
}


def build_tools(all_findings: List[Any]):
    """Construct the Tool objects Agent 1 may use, closed over this run's actual findings."""
    from agent_runtime import Tool
    from agent3_tools import nvd_lookup

    async def lookup_cve_metadata(cve_id: str) -> Dict[str, Any]:
        """Fetch the real NVD record for a CVE id to check/fill CVSS score and description."""
        return await nvd_lookup(cve_id)

    async def inspect_finding(index: int) -> Dict[str, Any]:
        """Return the raw parsed fields for one finding in this batch, by its position
        (0-based) in the order the deterministic parsers produced them."""
        if index < 0 or index >= len(all_findings):
            return {"error": f"index {index} out of range (batch has {len(all_findings)} findings)"}
        f = all_findings[index]
        return f.model_dump()

    async def explain_missing_field(scanner_source: str) -> Dict[str, Any]:
        """Real, documented reason a given scanner's parser sometimes leaves cve_id=UNKNOWN
        or applies a default CVSS, based on that scanner's actual report format."""
        note = _SCANNER_GAP_NOTES.get(
            (scanner_source or "").upper(),
            "No documented gap pattern for this scanner source.",
        )
        affected = [
            i for i, f in enumerate(all_findings)
            if f.scanner_source.upper() == (scanner_source or "").upper() and f.cve_id == "UNKNOWN"
        ]
        return {
            "scanner_source": scanner_source,
            "parser_gap_note": note,
            "findings_missing_cve_in_this_batch": len(affected),
            "example_indices": affected[:5],
        }

    return [
        Tool(
            name="lookup_cve_metadata",
            description=(
                "Query the real NVD record for a CVE id (CVSS score/vector, CWE, description, "
                "publication date). Use this to verify or fill a finding's data when the "
                "scanner itself supplied an incomplete CVSS or title."
            ),
            parameters={
                "type": "object",
                "properties": {"cve_id": {"type": "string", "description": "e.g. CVE-2021-44228"}},
                "required": ["cve_id"],
            },
            handler=lookup_cve_metadata,
        ),
        Tool(
            name="inspect_finding",
            description=(
                "Look up the full raw fields of one specific finding in this batch by its "
                "index, when the summary alone isn't enough to judge its ambiguity."
            ),
            parameters={
                "type": "object",
                "properties": {"index": {"type": "integer", "description": "0-based position in the batch"}},
                "required": ["index"],
            },
            handler=inspect_finding,
        ),
        Tool(
            name="explain_missing_field",
            description=(
                "Get the documented, real reason a given scanner (OWASP_ZAP/NUCLEI/OPENVAS/NMAP) "
                "sometimes yields cve_id=UNKNOWN, plus how many findings in this batch it affected."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "scanner_source": {
                        "type": "string",
                        "description": "OWASP_ZAP | NUCLEI | OPENVAS | NMAP",
                    }
                },
                "required": ["scanner_source"],
            },
            handler=explain_missing_field,
        ),
    ]
