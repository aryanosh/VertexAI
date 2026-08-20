import hashlib
import os
import uuid
import pandas as pd
import xgboost as xgb
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from agent_schemas import AIAnalysis, ai_analysis_from_result, sections_system_prompt

router = APIRouter(prefix="/api/v1/agent2")

AGENT2_ROLE = (
    "You are Agent 2 of a human-supervised vulnerability triage pipeline: Deduplication and "
    "Noise Reduction. Deterministic code has already fingerprinted findings by CVE+host+port, "
    "merged duplicates, and scored each surviving finding's false-positive probability using "
    "either a trained XGBoost classifier or a documented rule-based heuristic. Your job is only "
    "to explain, in plain language, what was merged and suppressed and why — you do not change "
    "any score or suppression decision."
)

class UnifiedFinding(BaseModel):
    scanner_source: str
    cve_id: str
    vulnerability_name: str
    target_host: str
    target_port: int
    endpoint_path: str
    cvss_base_score: float
    scanner_confidence: int
    http_response_code: int
    port_is_open: int
    historical_plugin_fp_rate: float

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
    is_cisa_kev: Optional[bool] = None
    epss_score: Optional[float] = None
    composite_risk_score: Optional[float] = None
    priority_level: Optional[str] = None
    sla_deadline: Optional[str] = None
    explainable_rationale: Optional[str] = None

class Agent2Request(BaseModel):
    findings: List[UnifiedFinding]

class Agent2Statistics(BaseModel):
    input_count: int
    output_count: int
    duplicate_reduction_pct: float
    suppressed_count: int
    # Explicit report fields (mirror the fields above under the names the platform spec
    # requires, so both naming conventions are available to callers without a breaking change).
    raw_finding_count: int = 0
    normalized_finding_count: int = 0
    duplicates_removed: int = 0
    false_positives_removed: int = 0
    accepted_risk_exclusions: int = 0
    final_prioritized_finding_count: int = 0
    noise_reduction_pct: float = 0.0
    # Same figures again under the exact metric names the dashboard is required to show,
    # so callers don't have to know which of the two naming conventions maps to which.
    duplicate_findings_detected: int = 0
    findings_removed: int = 0
    final_unique_findings_count: int = 0
    deduplication_percentage: float = 0.0

class DedupRecord(BaseModel):
    """Per-raw-finding dedup audit row. One of these exists for EVERY finding Agent 2 was
    given, including the ones merged away as duplicates or suppressed as false positives —
    never just the survivors. This is the concrete, persisted, downloadable/displayable
    output the platform spec requires Agent 2 to produce, distinct from the aggregate
    Agent2Statistics above."""
    finding_id: str
    cve_id: Optional[str] = None
    scanner_source: str
    target_host: str
    severity: str
    description: str
    duplicate_group_id: str
    # KEPT | REMOVED_DUPLICATE | REMOVED_FALSE_POSITIVE
    # (ACCEPTED_RISK intentionally omitted: this agent has no accepted-risk data to act on —
    # every finding is created with is_accepted_risk=False, see reduce_noise below — so a
    # status value this stage can never actually produce is not offered here.)
    duplicate_status: str
    reason: str

class Agent2Response(BaseModel):
    stage_summary: Optional[str] = None
    status: str = "WAITING_FOR_HUMAN"
    findings: List[CanonicalFinding]
    statistics: Agent2Statistics
    dedup_detail: List[DedupRecord] = []
    ai_analysis: Optional[AIAnalysis] = None

def load_model():
    model_path = os.path.join(os.path.dirname(__file__), "models", "xgboost_fp.json")
    if os.path.exists(model_path):
        try:
            model = xgb.XGBClassifier()
            model.load_model(model_path)
            return model
        except Exception as e:
            # Model file may have been produced by a newer XGBoost version than the
            # one installed. Never crash the pipeline: fall back to the heuristic.
            print(f"WARNING: Failed to load XGBoost model ({e}); using heuristic FP scoring.")
            return None
    return None

def heuristic_fp_prob(scanner_confidence, has_cve_id, http_response_code, port_is_open, fp_rate):
    # `fp_rate` is the scanner plugin's own historical false-positive rate — it is already a
    # probability in [0, 1], so it is used directly as the baseline. Discounting it by an
    # unexplained 0.4x factor (the previous behaviour) silently under-suppressed findings from
    # plugins with a documented high false-positive rate.
    prob = fp_rate
    if not has_cve_id:
        prob += 0.3
    if scanner_confidence == 1:
        prob += 0.2
    elif scanner_confidence == 2:
        prob += 0.1
    if http_response_code == 404:
        prob += 0.15
    if not port_is_open:
        prob += 0.2
    return min(prob, 1.0)

def severity_from_cvss(cvss: float) -> str:
    if cvss >= 9.0:
        return "CRITICAL"
    if cvss >= 7.0:
        return "HIGH"
    if cvss >= 4.0:
        return "MEDIUM"
    if cvss > 0.0:
        return "LOW"
    return "INFO"

def deterministic_finding_id(*parts: str) -> str:
    """UUID5 over a stable key. Same input always yields the same id, unlike uuid4()
    (random per call), which previously made identical input produce different
    finding_id values on every run and broke any downstream identity comparison,
    row-keying, or persistence relying on it."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, ":".join(parts)))

@router.post("/reduce-noise", response_model=Agent2Response)
async def reduce_noise(request: Agent2Request):
    input_count = len(request.findings)
    if input_count == 0:
        return Agent2Response(
            findings=[],
            statistics=Agent2Statistics(
                input_count=0,
                output_count=0,
                duplicate_reduction_pct=0.0,
                suppressed_count=0
            )
        )

    # Convert to dict for pandas
    findings_dicts = [f.model_dump() for f in request.findings]

    # Calculate fingerprints based on canonical composite key: CVE_ID + Target_IP + Port
    for raw_index, f in enumerate(findings_dicts):
        fingerprint = hashlib.md5(
            f"{f['target_host']}:{f['target_port']}:{f['cve_id']}".encode()
        ).hexdigest()
        f['fingerprint_hash'] = fingerprint
        f['has_cve_id'] = 1 if f['cve_id'].startswith("CVE-") else 0
        # Position in the original request — used only to derive a stable, unique id for
        # each RAW finding (several raw findings can share one fingerprint_hash when
        # multiple scanners detect the same CVE+host+port).
        f['_raw_index'] = raw_index

    df = pd.DataFrame(findings_dicts)

    canonical_findings = []
    dedup_detail: List[DedupRecord] = []
    suppressed_count = 0
    # Real per-finding feature snapshots, keyed by fingerprint_hash, for Agent 2's tools to
    # inspect later (the actual inputs the classifier/heuristic saw, not a reconstruction).
    findings_by_hash: dict = {}

    model = load_model()
    # Track which classifier actually produced the probabilities, so the stage summary
    # cannot claim "XGBoost" when it silently fell back to the heuristic.
    used_model = False
    used_heuristic = False

    # Group by fingerprint_hash. Each raw finding inside a group is a separate scanner's
    # detection of the SAME underlying vulnerability (same CVE+host+port) — a legitimate
    # duplicate for merging purposes, but each one carries its own real evidence (its own
    # scanner's confidence, HTTP response, etc.). Scoring the GROUP's averaged features
    # (the previous behaviour) blurs a confident detection together with a weak one and can
    # push a real finding's false-positive probability up past the suppression threshold.
    # Instead, every finding is scored individually on its own features, then the group's
    # false-positive probability is the MINIMUM across its members: if any one scanner
    # detected it with low false-positive risk, that positive evidence should not be diluted
    # by other, noisier detections of the same underlying issue.
    grouped = df.groupby('fingerprint_hash')
    for fingerprint_hash, group in grouped:
        first_finding = group.iloc[0]
        group_id = deterministic_finding_id("group", str(fingerprint_hash))

        # Aggregate scanner sources
        scanner_sources = group['scanner_source'].unique().tolist()

        per_finding_probs = []
        raw_rows = []  # (row, fp_prob, classifier_label) for every raw finding, stable order
        for _, row in group.iterrows():
            fp_prob = None
            row_classifier = "rule-based heuristic"
            if model is not None:
                try:
                    import numpy as np
                    features = np.array([[
                        row['scanner_confidence'],
                        row['has_cve_id'],
                        row['http_response_code'],
                        row['port_is_open'],
                        row['historical_plugin_fp_rate'],
                    ]])
                    fp_prob = float(model.predict_proba(features)[0][1])  # Class 1 is FP
                    used_model = True
                    row_classifier = "XGBoost model"
                except Exception as e:
                    print(f"WARNING: XGBoost inference failed ({e}); using heuristic FP scoring.")
                    fp_prob = None
            if fp_prob is None:
                fp_prob = heuristic_fp_prob(
                    int(row['scanner_confidence']),
                    bool(row['has_cve_id']),
                    int(row['http_response_code']),
                    int(row['port_is_open']),
                    float(row['historical_plugin_fp_rate']),
                )
                used_heuristic = True
            per_finding_probs.append(fp_prob)
            raw_rows.append((row, fp_prob, row_classifier))

        false_positive_prob = min(per_finding_probs) if per_finding_probs else 1.0
        findings_by_hash[str(fingerprint_hash)] = {
            "scanner_confidence": int(first_finding["scanner_confidence"]),
            "has_cve_id": int(first_finding["has_cve_id"]),
            "http_response_code": int(first_finding["http_response_code"]),
            "port_is_open": int(first_finding["port_is_open"]),
            "historical_plugin_fp_rate": float(first_finding["historical_plugin_fp_rate"]),
        }

        is_suppressed = false_positive_prob > 0.85
        if is_suppressed:
            suppressed_count += 1

        canonical_id = deterministic_finding_id("canonical", str(fingerprint_hash))
        canonical_findings.append(CanonicalFinding(
            finding_id=canonical_id,
            fingerprint_hash=str(fingerprint_hash),
            cve_id=str(first_finding['cve_id']),
            vulnerability_name=str(first_finding['vulnerability_name']),
            target_host=str(first_finding['target_host']),
            target_port=int(first_finding['target_port']),
            cvss_base_score=float(group['cvss_base_score'].max()),
            scanner_sources=scanner_sources,
            false_positive_prob=float(false_positive_prob),
            is_suppressed=is_suppressed,
            is_accepted_risk=False
        ))

        # Per-raw-finding dedup audit trail: every finding in this group gets a record,
        # not just the survivor. The first row (by original request order) is the canonical
        # "KEPT" survivor unless the whole group is suppressed as a false positive; every
        # other row in the group was merged away as a duplicate regardless of the group's
        # suppression outcome, since deduplication happens before false-positive filtering.
        for position, (row, row_fp_prob, row_classifier) in enumerate(raw_rows):
            raw_id = deterministic_finding_id(
                "raw", str(fingerprint_hash), str(row["scanner_source"]), str(int(row["_raw_index"]))
            )
            severity = severity_from_cvss(float(row["cvss_base_score"]))
            description = (
                f"{row['vulnerability_name']} on {row['target_host']}:{int(row['target_port'])}"
                f"{row['endpoint_path'] or ''}"
            )
            if position == 0:
                if is_suppressed:
                    status = "REMOVED_FALSE_POSITIVE"
                    reason = (
                        f"False-positive probability {false_positive_prob:.2f} exceeds the "
                        f"0.85 suppression threshold ({row_classifier})."
                    )
                else:
                    status = "KEPT"
                    reason = (
                        f"Canonical finding for group {group_id} "
                        f"({len(raw_rows)} raw detection(s) merged); false-positive "
                        f"probability {false_positive_prob:.2f} is below the suppression threshold."
                    )
            else:
                status = "REMOVED_DUPLICATE"
                reason = (
                    f"Duplicate of finding {canonical_id} — same CVE+host+port "
                    f"(fingerprint {fingerprint_hash}), detected again by {row['scanner_source']}."
                )
            dedup_detail.append(DedupRecord(
                finding_id=raw_id,
                cve_id=str(row['cve_id']) if row['cve_id'] else None,
                scanner_source=str(row['scanner_source']),
                target_host=str(row['target_host']),
                severity=severity,
                description=description,
                duplicate_group_id=group_id,
                duplicate_status=status,
                reason=reason,
            ))

    output_count = len(canonical_findings)
    duplicate_reduction_pct = ((input_count - output_count) / input_count * 100.0) if input_count > 0 else 0.0
    
    if used_model and used_heuristic:
        classifier = "XGBoost model (with heuristic fallback on some findings)"
    elif used_model:
        classifier = "XGBoost ML model"
    elif used_heuristic:
        classifier = "rule-based heuristic (XGBoost model unavailable)"
    else:
        classifier = "no classifier"

    duplicates_removed = input_count - output_count
    accepted_risk_exclusions = sum(1 for c in canonical_findings if c.is_accepted_risk)
    final_prioritized_finding_count = sum(
        1 for c in canonical_findings if not c.is_suppressed and not c.is_accepted_risk
    )
    noise_reduction_pct = (
        ((input_count - final_prioritized_finding_count) / input_count * 100.0) if input_count > 0 else 0.0
    )

    summary = (
        f"Evaluated {input_count} raw findings using MD5(CVE+Host+Port). "
        f"Merged {duplicates_removed} duplicate alerts into {output_count} canonical findings. "
        f"False-positive filter: {classifier} suppressed {suppressed_count} finding(s). "
        f"{final_prioritized_finding_count} finding(s) remain prioritized "
        f"(Noise reduction: {noise_reduction_pct:.1f}%)."
    )

    stats = Agent2Statistics(
        input_count=input_count,
        output_count=output_count,
        duplicate_reduction_pct=duplicate_reduction_pct,
        suppressed_count=suppressed_count,
        raw_finding_count=input_count,
        normalized_finding_count=input_count,
        duplicates_removed=duplicates_removed,
        false_positives_removed=suppressed_count,
        accepted_risk_exclusions=accepted_risk_exclusions,
        final_prioritized_finding_count=final_prioritized_finding_count,
        noise_reduction_pct=noise_reduction_pct,
        duplicate_findings_detected=duplicates_removed,
        findings_removed=duplicates_removed + suppressed_count,
        final_unique_findings_count=output_count,
        deduplication_percentage=duplicate_reduction_pct,
    )

    deterministic_analysis = AIAnalysis(
        processing_summary=summary,
        evidence_used=(
            f"MD5(host:port:cve) fingerprints over {input_count} findings; per-finding "
            f"false-positive probabilities from {classifier}."
        ),
        tools_and_sources=classifier,
        decision_rationale=(
            "A canonical finding is suppressed when its minimum per-finding false-positive "
            "probability across duplicate detections exceeds 0.85."
        ),
        confidence_and_limitations=(
            f"{suppressed_count} of {output_count} canonical finding(s) suppressed as likely "
            "false positives; suppressed findings are still retained (not deleted) for audit."
        ),
    )

    ai_analysis = deterministic_analysis
    try:
        from agent_runtime import agentic_enabled, run_agent, NVIDIA_MODEL

        if agentic_enabled() and canonical_findings:
            from agent2_tools import build_tools as build_agent2_tools

            examples = "; ".join(
                f"{c.cve_id} on {c.target_host}:{c.target_port} fingerprint_hash={c.fingerprint_hash} "
                f"fp_prob={c.false_positive_prob:.2f} suppressed={c.is_suppressed}"
                for c in canonical_findings[:8]
            )
            goal = (
                f"Deduplication run: {input_count} raw findings merged into {output_count} canonical "
                f"findings ({duplicates_removed} duplicates removed). Classifier used: {classifier}. "
                f"{suppressed_count} finding(s) suppressed as likely false positives. Example canonical "
                f"findings and their false-positive probabilities:\n{examples}\n\n"
                "Investigate before answering: call get_model_feature_importance (or "
                "get_heuristic_breakdown for a specific fingerprint_hash if no model was loaded) to "
                "ground your explanation in what actually drove these probabilities, and use "
                "find_related_findings on any suppressed finding to note real clustering. Then "
                "explain this deduplication/noise-reduction run for a human security analyst."
            )
            result = await run_agent(
                goal=goal,
                system_prompt=sections_system_prompt(AGENT2_ROLE),
                tools=build_agent2_tools(model, canonical_findings, findings_by_hash),
                expect_json=True,
            )
            ai_analysis = ai_analysis_from_result(
                result, model_name=NVIDIA_MODEL, deterministic=deterministic_analysis
            )
    except Exception as e:
        print(f"WARNING: Agent 2 Nemotron summarization skipped: {e}")

    return Agent2Response(
        status="WAITING_FOR_HUMAN",
        stage_summary=summary,
        findings=canonical_findings,
        statistics=stats,
        dedup_detail=dedup_detail,
        ai_analysis=ai_analysis,
    )
