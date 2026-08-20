"""
Shared Pydantic contracts for the four agents.

AIAnalysis is the one UI-facing shape every agent uses to report its Nemotron-derived
narrative. It intentionally exposes only five clean, auditable sections and never the
model's raw chain-of-thought / reasoning_content — that field is captured separately in
agent_runtime's TraceStep objects for backend/audit storage, not surfaced here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class AIAnalysis(BaseModel):
    """Safe, structured explanation of what an agent did on this run."""

    processing_summary: str
    evidence_used: str
    tools_and_sources: str
    decision_rationale: str
    confidence_and_limitations: str
    ai_mode: str = "DETERMINISTIC"  # "NEMOTRON" | "DETERMINISTIC"
    model: Optional[str] = None
    fallback_reason: Optional[str] = None


_SECTIONS_SYSTEM_SUFFIX = """
When finished, reply with ONLY a JSON object, no prose and no code fence:
{
  "processing_summary": "<1-2 sentences: what this agent did on this run>",
  "evidence_used": "<the concrete deterministic evidence/data it relied on>",
  "tools_and_sources": "<which tools/data sources were consulted>",
  "decision_rationale": "<why it reached its conclusion, grounded ONLY in the evidence given>",
  "confidence_and_limitations": "<how confident, and what is uncertain or missing>"
}
Use ONLY the facts and numbers supplied to you. Never invent a CVE, score, host, or count
that was not given. Do not include your chain-of-thought — only these five final sections.
"""


def sections_system_prompt(role_description: str) -> str:
    return f"{role_description}\n{_SECTIONS_SYSTEM_SUFFIX}"


def ai_analysis_from_result(
    result: "Any",
    *,
    model_name: Optional[str],
    deterministic: AIAnalysis,
) -> AIAnalysis:
    """Build an AIAnalysis from an agent_runtime.AgentResult, falling back to a supplied
    deterministic AIAnalysis (ai_mode='DETERMINISTIC') when the model call did not succeed.
    """
    if not result.ok or not result.final_json:
        deterministic.fallback_reason = result.fallback_reason
        return deterministic

    data: Dict[str, Any] = result.final_json
    try:
        return AIAnalysis(
            processing_summary=str(data.get("processing_summary") or deterministic.processing_summary),
            evidence_used=str(data.get("evidence_used") or deterministic.evidence_used),
            tools_and_sources=str(data.get("tools_and_sources") or deterministic.tools_and_sources),
            decision_rationale=str(data.get("decision_rationale") or deterministic.decision_rationale),
            confidence_and_limitations=str(
                data.get("confidence_and_limitations") or deterministic.confidence_and_limitations
            ),
            ai_mode="NEMOTRON",
            model=model_name,
        )
    except Exception:
        deterministic.fallback_reason = "model reply did not match the expected shape"
        return deterministic
