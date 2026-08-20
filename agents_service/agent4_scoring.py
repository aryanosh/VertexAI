import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from agent_schemas import AIAnalysis, ai_analysis_from_result, sections_system_prompt

router = APIRouter(prefix="/api/v1/agent4")

AGENT4_ROLE = (
    "You are Agent 4 of a human-supervised vulnerability triage pipeline: Risk Prioritization "
    "and Ticket Preparation. A deterministic formula has already computed this finding's "
    "composite risk score (0-100) from CVSS, EPSS, CISA KEV status, asset criticality, and "
    "exploit availability, and assigned it a P0-P3 priority. You NEVER change the score or "
    "priority. Your only job is to write a clear, evidence-grounded explanation and a polished "
    "GitHub ticket narrative using ONLY the numbers and facts you are given."
)

class EnrichedFinding(BaseModel):
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
    is_cisa_kev: bool = False
    epss_score: float = 0.0
    epss_percentile: float = 0.0
    exploit_db_available: bool = False

class AssetContext(BaseModel):
    asset_id: str
    hostname: str
    criticality_rating: int
    environment: str = "PRODUCTION"

class ScoreRequest(BaseModel):
    findings: List[EnrichedFinding]
    asset_context: Optional[AssetContext] = None
    asset_criticality: Optional[int] = None

class ScoredFinding(BaseModel):
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
    is_cisa_kev: bool
    epss_score: float
    composite_risk_score: Optional[float] = None
    priority_level: Optional[str] = None
    sla_deadline: Optional[str] = None
    explainable_rationale: Optional[str] = None
    suggested_owner: Optional[str] = None

class TicketPayload(BaseModel):
    finding_id: str
    title: str
    body: str
    labels: List[str]
    assignee: Optional[str] = None
    suggested_owner: Optional[str] = None
    priority_level: str
    sla_deadline: str
    composite_risk_score: float

class ScoreResponse(BaseModel):
    stage_summary: Optional[str] = None
    status: str = "WAITING_FOR_HUMAN"
    scored_findings: List[ScoredFinding]
    ticket_payloads: List[TicketPayload]
    ai_analysis: Optional[AIAnalysis] = None

# Maximum point contribution of each risk dimension, out of 100.
# CVSS 30% technical severity, EPSS 25% exploit-prediction probability, CISA KEV +20
# active-exploitation bonus, asset criticality 15% business impact, exploit availability/
# exposure 10% (public PoC code or a CISA-confirmed active exploit). Never score on CVSS
# alone — the other four dimensions together outweigh it (70 of 100 points).
W_CVSS = 30.0
W_EPSS = 25.0
W_KEV = 20.0
W_ASSET = 15.0
W_EXPLOIT = 10.0

CVSS_MAX = 10.0
CRITICALITY_MAX = 5.0


def score_components(
    cvss: float,
    epss: float,
    is_kev: bool,
    asset_criticality: int,
    exploit_available: bool = False,
) -> dict:
    """
    Break the composite risk score into its five documented contributions:
    CVSS 30 | EPSS 25 | CISA KEV +20 | Asset criticality 15 | Exploit availability +10.

    Each input is normalised to 0..1 before being multiplied by its weight, so every
    dimension can actually contribute its full share of the 100-point scale; the five
    weights sum to exactly 100 so a finding with maximum evidence on every dimension scores
    exactly 100.0 without needing to be clamped.
    """
    cvss_norm = max(0.0, min(cvss / CVSS_MAX, 1.0))
    epss_norm = max(0.0, min(epss, 1.0))
    crit_norm = max(0.0, min(asset_criticality / CRITICALITY_MAX, 1.0))

    return {
        "cvss": cvss_norm * W_CVSS,
        "epss": epss_norm * W_EPSS,
        "kev": W_KEV if is_kev else 0.0,
        "asset": crit_norm * W_ASSET,
        "exploit": W_EXPLOIT if exploit_available else 0.0,
    }


def compute_composite_risk_score(
    cvss: float,
    epss: float,
    is_kev: bool,
    asset_criticality: int,
    exploit_available: bool = False,
) -> float:
    parts = score_components(cvss, epss, is_kev, asset_criticality, exploit_available)
    return min(sum(parts.values()), 100.0)

def assign_priority_and_sla(score: float) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    if score >= 90.0:
        return "P0_CRITICAL", (now + timedelta(hours=24)).isoformat()
    elif score >= 70.0:
        return "P1_HIGH", (now + timedelta(hours=72)).isoformat()
    elif score >= 40.0:
        return "P2_MEDIUM", (now + timedelta(days=14)).isoformat()
    else:
        return "P3_LOW", (now + timedelta(days=30)).isoformat()

def generate_rationale(finding: EnrichedFinding, score: float, priority: str, asset_context: AssetContext) -> str:
    # Derive the displayed breakdown from the same function that produced the score, so the
    # explanation can never drift from the arithmetic actually used.
    c = score_components(
        finding.cvss_base_score,
        finding.epss_score,
        finding.is_cisa_kev,
        asset_context.criticality_rating,
        finding.exploit_db_available,
    )
    parts = []
    parts.append(f"Composite Risk Score: {score:.1f}/100.0 [{priority}]")
    parts.append(f"CVSS Base Score: {finding.cvss_base_score}/10.0 (contributes {c['cvss']:.1f} of {W_CVSS:.0f} points)")
    parts.append(f"EPSS Score: {finding.epss_score:.4f} (contributes {c['epss']:.1f} of {W_EPSS:.0f} points)")
    if finding.is_cisa_kev:
        parts.append(f"CISA KEV: Listed in Known Exploited Vulnerabilities catalog (+{c['kev']:.1f} points)")
    else:
        parts.append("CISA KEV: Not listed (+0.0 points)")
    parts.append(f"Asset Criticality: {asset_context.criticality_rating}/5 (contributes {c['asset']:.1f} of {W_ASSET:.0f} points)")
    if finding.exploit_db_available:
        parts.append(f"Exploit Availability: Public exploit code / active exploitation evidence (+{c['exploit']:.1f} points)")
    else:
        parts.append("Exploit Availability: No public exploit evidence found (+0.0 points)")
    parts.append(f"Asset: {asset_context.hostname} ({asset_context.environment})")
    parts.append(f"Scanners: {', '.join(finding.scanner_sources)}")
    if finding.is_suppressed:
        parts.append("Note: This finding was flagged as a likely false positive.")
    if finding.is_accepted_risk:
        parts.append("Note: This finding has been marked as accepted risk.")
    return " | ".join(parts)

def generate_ticket_body(finding: EnrichedFinding, score: float, priority: str, sla: str, rationale: str, asset_context: AssetContext) -> str:
    body = f"""## Security Vulnerability Report

**CVE:** {finding.cve_id}
**Vulnerability:** {finding.vulnerability_name}
**Target:** {finding.target_host}:{finding.target_port}
**CVSS:** {finding.cvss_base_score}
**Composite Risk Score:** {score:.1f}/100.0
**Priority:** {priority}
**SLA Deadline:** {sla}
**Asset:** {asset_context.hostname} (Criticality: {asset_context.criticality_rating}/5, Environment: {asset_context.environment})

### Risk Analysis
{rationale}

### Scanner Sources
{', '.join(finding.scanner_sources)}

### CISA KEV Status
{'⚠️ Listed in CISA Known Exploited Vulnerabilities catalog' if finding.is_cisa_kev else 'Not listed'}

### EPSS Score
{finding.epss_score:.4f} ({finding.epss_score * 100:.1f}% probability of exploitation in next 30 days)

---
*Generated by VertexAI Agent 4 — Risk Scoring & Ticket Preparation*
*This ticket was prepared for human review. It has NOT been auto-dispatched.*"""
    return body

def suggest_owner(priority: str) -> str:
    """Deterministic owner suggestion by priority. A human still assigns/re-assigns on approval."""
    return {
        "P0_CRITICAL": "Security Engineering (On-Call)",
        "P1_HIGH": "Security Engineering",
        "P2_MEDIUM": "Application Team",
        "P3_LOW": "Security Backlog",
    }.get(priority, "Security Engineering")

@router.post("/score-and-ticket", response_model=ScoreResponse)
async def score_and_ticket(request: ScoreRequest):
    scored_findings = []
    ticket_payloads = []

    asset_context = request.asset_context
    if asset_context is None:
        crit = request.asset_criticality if request.asset_criticality is not None else 5
        asset_context = AssetContext(
            asset_id="asset-default",
            hostname="target-host.local",
            criticality_rating=crit,
            environment="PRODUCTION"
        )

    for finding in request.findings:
        if finding.is_suppressed or finding.is_accepted_risk:
            # Include without score/ticket
            scored_findings.append(ScoredFinding(
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
                is_cisa_kev=finding.is_cisa_kev,
                epss_score=finding.epss_score
            ))
            continue
            
        score = compute_composite_risk_score(
            finding.cvss_base_score,
            finding.epss_score,
            finding.is_cisa_kev,
            asset_context.criticality_rating,
            finding.exploit_db_available,
        )
        
        priority, sla = assign_priority_and_sla(score)
        rationale = generate_rationale(finding, score, priority, asset_context)
        
        scored_findings.append(ScoredFinding(
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
            is_cisa_kev=finding.is_cisa_kev,
            epss_score=finding.epss_score,
            composite_risk_score=score,
            priority_level=priority,
            sla_deadline=sla,
            explainable_rationale=rationale,
            suggested_owner=suggest_owner(priority),
        ))

        ticket_body = generate_ticket_body(finding, score, priority, sla, rationale, asset_context)

        sla_hours = 24 if priority == "P0_CRITICAL" else (72 if priority == "P1_HIGH" else (336 if priority == "P2_MEDIUM" else 720))
        sla_label = f"sla-{sla_hours}h"

        ticket_payloads.append(TicketPayload(
            finding_id=finding.finding_id,
            title=f"[{priority}] {finding.cve_id} - {finding.vulnerability_name} on {finding.target_host}:{finding.target_port}",
            body=ticket_body,
            labels=[priority, "security", sla_label],
            assignee=None,
            suggested_owner=suggest_owner(priority),
            priority_level=priority,
            sla_deadline=sla,
            composite_risk_score=score
        ))

    p0_count = sum(1 for f in scored_findings if f.priority_level == "P0_CRITICAL")
    top_score = max((f.composite_risk_score for f in scored_findings if f.composite_risk_score is not None), default=0.0)
    summary = f"Calculated 0-100 composite risk scores across {len(scored_findings)} findings (Highest: {top_score:.1f}/100, {p0_count} P0 Critical). Prepared structured Markdown tickets with SLAs awaiting Final Human Approval."

    deterministic_analysis = AIAnalysis(
        processing_summary=summary,
        evidence_used=(
            f"Composite score = CVSS(30) + EPSS(25) + KEV(20) + Asset criticality(15) + "
            f"Exploit availability(10), computed for {len(scored_findings)} finding(s)."
        ),
        tools_and_sources="Deterministic weighted-scoring formula (no external calls at this stage).",
        decision_rationale="Priority bands: P0 90-100, P1 70-89, P2 40-69, P3 0-39.",
        confidence_and_limitations=(
            f"{len(ticket_payloads)} ticket draft(s) prepared for human review; none dispatched "
            "to GitHub — ticket creation happens only after explicit human approval."
        ),
    )
    ai_analysis = deterministic_analysis
    try:
        from agent_runtime import agentic_enabled, run_agent, NVIDIA_MODEL

        if agentic_enabled() and scored_findings:
            from agent4_tools import build_tools as build_agent4_tools

            top = sorted(
                (f for f in scored_findings if f.composite_risk_score is not None),
                key=lambda f: f.composite_risk_score,
                reverse=True,
            )[:5]
            examples = "; ".join(
                f"{f.cve_id} on {f.target_host}:{f.target_port} score={f.composite_risk_score:.1f} "
                f"priority={f.priority_level}"
                for f in top
            )
            goal = (
                f"Risk-scoring run: {len(scored_findings)} finding(s) scored, {p0_count} P0-CRITICAL, "
                f"highest score {top_score:.1f}/100. Top findings by score:\n{examples}\n\n"
                "Investigate before answering: call get_asset_context to ground your rationale in "
                "the real asset this was scored against, and find_similar_findings on the highest- "
                "scoring CVE to note if it's spread across multiple hosts. Then summarize this "
                "risk-prioritization run for a human security analyst."
            )
            result = await run_agent(
                goal=goal,
                system_prompt=sections_system_prompt(AGENT4_ROLE),
                tools=build_agent4_tools(asset_context, scored_findings),
                expect_json=True,
            )
            ai_analysis = ai_analysis_from_result(
                result, model_name=NVIDIA_MODEL, deterministic=deterministic_analysis
            )
    except Exception as exc:
        print(f"WARNING: Agent 4 Nemotron summarization skipped: {exc}")

    return ScoreResponse(
        status="WAITING_FOR_HUMAN",
        stage_summary=summary,
        scored_findings=scored_findings,
        ticket_payloads=ticket_payloads,
        ai_analysis=ai_analysis,
    )
