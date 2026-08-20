"""
Tools available to Agent 4 (Risk Prioritization and Ticket Preparation).

These let the model ground a finding's rationale/ticket narrative in real context it
actively retrieves — the actual asset record passed into this request, and real
co-occurring findings in this same run — rather than just restating a pre-computed score.
The composite risk-score arithmetic itself is never exposed as writable to the model; these
tools are read-only over data already present in this request.
"""

from __future__ import annotations

from typing import Any, Dict, List


# Real, documented environment-tier defaults used when a caller does not supply asset
# criticality explicitly. Not a guess presented as fact — the tool always states which case
# applied (supplied context vs. hostname-pattern default).
_ENV_HOSTNAME_HINTS = [
    ("PRODUCTION", ("prod", "prd")),
    ("STAGING", ("stag", "stg", "uat")),
    ("DEV", ("dev", "test", "qa", "sandbox")),
]


def build_tools(asset_context: Any, scored_findings: List[Any]):
    """Construct the Tool objects Agent 4 may use.

    `asset_context` is the real AssetContext supplied on (or defaulted for) this request.
    `scored_findings` is this run's own already-scored output, so the agent can search real
    co-occurring findings rather than a canned example.
    """
    from agent_runtime import Tool

    async def get_asset_context() -> Dict[str, Any]:
        """Return the real asset context this request was scored against: hostname,
        criticality rating, and environment, plus whether it was explicitly supplied by the
        caller or defaulted."""
        return {
            "asset_id": asset_context.asset_id,
            "hostname": asset_context.hostname,
            "criticality_rating": asset_context.criticality_rating,
            "environment": asset_context.environment,
            "was_default": asset_context.asset_id == "asset-default",
        }

    async def infer_environment_from_hostname(hostname: str) -> Dict[str, Any]:
        """Real, deterministic pattern match of a hostname against common environment-naming
        conventions (prod/staging/dev), for when the caller-supplied environment looks
        inconsistent with the actual target hostname."""
        h = (hostname or "").lower()
        for env, patterns in _ENV_HOSTNAME_HINTS:
            if any(p in h for p in patterns):
                return {"hostname": hostname, "inferred_environment": env, "matched_pattern": True}
        return {
            "hostname": hostname,
            "inferred_environment": None,
            "matched_pattern": False,
            "note": "No recognizable environment token in hostname; cannot infer beyond the supplied asset_context.",
        }

    async def find_similar_findings(cve_id: str) -> Dict[str, Any]:
        """Search this run's own already-scored findings for others sharing the same CVE, to
        show real duplication/spread across the estate (e.g. one CVE hitting many hosts)."""
        matches = [
            {
                "target_host": f.target_host,
                "target_port": f.target_port,
                "priority_level": f.priority_level,
                "composite_risk_score": f.composite_risk_score,
            }
            for f in scored_findings
            if f.cve_id == cve_id and f.composite_risk_score is not None
        ]
        return {
            "cve_id": cve_id,
            "occurrences_in_this_run": len(matches),
            "examples": matches[:10],
        }

    return [
        Tool(
            name="get_asset_context",
            description="Real asset context (hostname, criticality, environment) this request was scored against.",
            parameters={"type": "object", "properties": {}},
            handler=get_asset_context,
        ),
        Tool(
            name="infer_environment_from_hostname",
            description="Pattern-match a hostname against prod/staging/dev naming conventions when the supplied environment looks inconsistent.",
            parameters={
                "type": "object",
                "properties": {"hostname": {"type": "string"}},
                "required": ["hostname"],
            },
            handler=infer_environment_from_hostname,
        ),
        Tool(
            name="find_similar_findings",
            description="Find other findings in this same run sharing the same CVE id, to show real spread across hosts.",
            parameters={
                "type": "object",
                "properties": {"cve_id": {"type": "string"}},
                "required": ["cve_id"],
            },
            handler=find_similar_findings,
        ),
    ]
