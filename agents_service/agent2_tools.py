"""
Tools available to Agent 2 (Deduplication and Noise Reduction).

These let the model investigate the REAL classifier that produced each finding's
false-positive probability — actual XGBoost feature importances when the model is loaded,
or the actual heuristic term breakdown when it fell back — rather than just being told the
final number. The suppression decision itself (threshold 0.85) stays deterministic Python;
these tools only expose the real evidence behind it.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def build_tools(model, canonical_findings: List[Any], findings_by_hash: Dict[str, dict]):
    """Construct the Tool objects Agent 2 may use.

    `model` is the actual loaded xgboost.XGBClassifier (or None if unavailable).
    `canonical_findings` is this run's real output (CanonicalFinding objects).
    `findings_by_hash` maps fingerprint_hash -> the raw feature dict used to score it,
    so the agent can inspect real inputs, not just the final probability.
    """
    from agent_runtime import Tool

    FEATURE_NAMES = [
        "scanner_confidence",
        "has_cve_id",
        "http_response_code",
        "port_is_open",
        "historical_plugin_fp_rate",
    ]

    async def get_model_feature_importance() -> Dict[str, Any]:
        """Real global feature importances from the loaded XGBoost false-positive
        classifier, if one is loaded for this run. Explains which signals the model
        actually weighs most, not a canned explanation."""
        if model is None:
            return {
                "model_loaded": False,
                "note": "No XGBoost model was loaded for this run; findings were scored by "
                        "the deterministic rule-based heuristic instead (see get_heuristic_breakdown).",
            }
        try:
            importances = model.feature_importances_.tolist()
        except Exception as exc:
            return {"model_loaded": True, "error": f"could not read feature_importances_: {exc}"}
        return {
            "model_loaded": True,
            "feature_importance": {
                name: round(float(val), 4) for name, val in zip(FEATURE_NAMES, importances)
            },
        }

    async def get_finding_features(fingerprint_hash: str) -> Dict[str, Any]:
        """Return the real per-finding input features that were fed to the classifier for
        one canonical finding, identified by its fingerprint_hash."""
        row = findings_by_hash.get(fingerprint_hash)
        if row is None:
            return {"error": f"no finding with fingerprint_hash '{fingerprint_hash}' in this run"}
        return {name: row.get(name) for name in FEATURE_NAMES}

    async def get_heuristic_breakdown(fingerprint_hash: str) -> Dict[str, Any]:
        """When no XGBoost model was available, show the real per-term breakdown of the
        rule-based false-positive heuristic for one finding (fp_rate baseline + each
        applicable penalty), so the explanation matches the actual arithmetic used."""
        row = findings_by_hash.get(fingerprint_hash)
        if row is None:
            return {"error": f"no finding with fingerprint_hash '{fingerprint_hash}' in this run"}
        fp_rate = float(row.get("historical_plugin_fp_rate", 0.0))
        has_cve = bool(row.get("has_cve_id"))
        confidence = int(row.get("scanner_confidence", 0))
        http_code = int(row.get("http_response_code", 200))
        port_open = bool(row.get("port_is_open", 1))
        terms = {"baseline_fp_rate": fp_rate}
        if not has_cve:
            terms["no_cve_id_penalty"] = 0.3
        if confidence == 1:
            terms["low_confidence_penalty"] = 0.2
        elif confidence == 2:
            terms["medium_confidence_penalty"] = 0.1
        if http_code == 404:
            terms["http_404_penalty"] = 0.15
        if not port_open:
            terms["port_closed_penalty"] = 0.2
        return {
            "fingerprint_hash": fingerprint_hash,
            "terms": terms,
            "sum_before_clamp": round(sum(terms.values()), 4),
        }

    async def find_related_findings(fingerprint_hash: str) -> Dict[str, Any]:
        """Search this run's own output for other canonical findings on the same host, so
        the agent can note real clustering (e.g. many findings on one host) grounded in the
        actual batch, not a guess."""
        target = next((c for c in canonical_findings if c.fingerprint_hash == fingerprint_hash), None)
        if target is None:
            return {"error": f"no finding with fingerprint_hash '{fingerprint_hash}' in this run"}
        related = [
            {"fingerprint_hash": c.fingerprint_hash, "cve_id": c.cve_id, "target_port": c.target_port}
            for c in canonical_findings
            if c.target_host == target.target_host and c.fingerprint_hash != fingerprint_hash
        ]
        return {
            "target_host": target.target_host,
            "other_findings_on_same_host": len(related),
            "examples": related[:8],
        }

    return [
        Tool(
            name="get_model_feature_importance",
            description="Real global feature importances from the loaded XGBoost false-positive model, if one is loaded.",
            parameters={"type": "object", "properties": {}},
            handler=get_model_feature_importance,
        ),
        Tool(
            name="get_finding_features",
            description="Real per-finding input features (confidence, has_cve_id, http code, port state, plugin fp rate) fed to the classifier.",
            parameters={
                "type": "object",
                "properties": {"fingerprint_hash": {"type": "string"}},
                "required": ["fingerprint_hash"],
            },
            handler=get_finding_features,
        ),
        Tool(
            name="get_heuristic_breakdown",
            description="Real per-term breakdown of the rule-based FP heuristic for one finding, when no XGBoost model was loaded.",
            parameters={
                "type": "object",
                "properties": {"fingerprint_hash": {"type": "string"}},
                "required": ["fingerprint_hash"],
            },
            handler=get_heuristic_breakdown,
        ),
        Tool(
            name="find_related_findings",
            description="Find other canonical findings in this same run on the same target host, to note real clustering.",
            parameters={
                "type": "object",
                "properties": {"fingerprint_hash": {"type": "string"}},
                "required": ["fingerprint_hash"],
            },
            handler=find_related_findings,
        ),
    ]
