import os
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel
import httpx

from agent3_tools import build_tools as build_agent3_tools
from agent_schemas import AIAnalysis, ai_analysis_from_result, sections_system_prompt

router = APIRouter(prefix="/api/v1/agent3")

AGENT3_STAGE_ROLE = (
    "You are Agent 3 of a human-supervised vulnerability triage pipeline: Threat Intelligence "
    "Enrichment. You have already investigated each CVE individually using CISA KEV, FIRST "
    "EPSS, NVD, and Exploit-DB tools (or, when agentic reasoning was unavailable, a "
    "deterministic two-source lookup). Summarize the OVERALL run for a human analyst using "
    "only the aggregate facts given to you."
)

# How many CVEs to investigate concurrently, and the ceiling on how many get the agentic
# treatment in a single request. Beyond the ceiling the deterministic path is used, so a
# 2,500-finding scan cannot turn into thousands of model calls.
AGENT3_CONCURRENCY = int(os.getenv("AGENT3_CONCURRENCY", "5"))
AGENT3_MAX_CVES = int(os.getenv("AGENT3_MAX_CVES", "25"))

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

    # Agentic additions. These make the difference between "no data" and "not exploitable"
    # visible to the analyst instead of collapsing both into epss_score = 0.0.
    #
    # exploitability_confidence: HIGH | MEDIUM | LOW | UNKNOWN
    # data_completeness: which sources actually returned data for this CVE
    exploitability_confidence: str = "UNKNOWN"
    assessment: Optional[str] = None
    sources_consulted: List[str] = []
    data_gaps: List[str] = []

class VulnerabilityIntelligence(BaseModel):
    cve_id: str
    is_cisa_kev: bool = False
    epss_score: float = 0.0
    epss_percentile: float = 0.0
    exploit_db_available: bool = False
    # Ground-truth provenance for THIS CVE's data, independent of the batch-level
    # intel_source field: LIVE (a real feed call succeeded), MOCK_CONFIGURED (USE_MOCKS=true,
    # bundled fixtures used by design), MOCK_FALLBACK_LIVE_FAILED (USE_MOCKS=false but the live
    # call failed/timed out and fixture data was substituted — previously indistinguishable
    # from a genuine live result), or AGENTIC (assessed via the tool-calling loop, which makes
    # its own real tool calls tracked separately in sources_consulted).
    data_source: str = "UNKNOWN"

class EnrichRequest(BaseModel):
    findings: List[CanonicalFinding]

class AgentTraceStep(BaseModel):
    """One observable step of Agent 3's reasoning, for analyst review."""
    step: int
    kind: str
    tool: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None
    result_summary: Optional[str] = None
    text: Optional[str] = None
    duration_ms: Optional[int] = None


class EnrichResponse(BaseModel):
    stage_summary: Optional[str] = None
    status: str = "WAITING_FOR_HUMAN"
    findings: List[EnrichedFinding]
    vulnerability_intelligence: List[VulnerabilityIntelligence]
    # Provenance of the threat intelligence used for this run.
    # "MOCK_FIXTURES" when USE_MOCKS=true (offline bundled data),
    # "LIVE_FEEDS" when CISA KEV / FIRST EPSS were actually queried.
    # An analyst must never mistake bundled fixtures for live exploit intelligence.
    intel_source: str = "MOCK_FIXTURES"

    # ---- Agentic execution metadata -------------------------------------
    # "AGENTIC"       : the LLM chose which intel sources to consult, per CVE.
    # "DETERMINISTIC" : the original fixed two-call sequence ran instead.
    reasoning_mode: str = "DETERMINISTIC"
    # Why the agentic path was not used, when applicable (flag off, no key, timeout, ...).
    fallback_reason: Optional[str] = None
    # The tool calls the agent actually made, so a human can audit the reasoning.
    agent_trace: List[AgentTraceStep] = []
    tools_used: List[str] = []
    agent_duration_ms: int = 0
    # Per-CVE fallback reasons. `fallback_reason` above only ever held the LAST CVE's reason
    # in a batch, silently discarding every earlier one — this preserves all of them.
    fallback_reasons: Dict[str, str] = {}
    ai_analysis: Optional[AIAnalysis] = None

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

async def fetch_cisa_kev(client: httpx.AsyncClient, cve: str) -> tuple[bool, str]:
    """Check if CVE is in CISA KEV feed via live call or cached mock.

    Returns (value, data_source) — data_source is honest ground truth about where the
    value actually came from, never inferred from the USE_MOCKS flag alone. Previously a
    live-mode call that silently fell back to mock data on failure was indistinguishable
    from a genuine live result once it reached the response.
    """
    if USE_MOCKS:
        return mock_kev_data.get(cve, False), "MOCK_CONFIGURED"
    try:
        url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
        response = await client.get(url, timeout=5.0)
        if response.status_code == 200:
            catalog = response.json()
            for vuln in catalog.get("vulnerabilities", []):
                if vuln.get("cveID") == cve:
                    return True, "LIVE"
            return False, "LIVE"
    except Exception:
        pass
    # Live call failed — fall back to local mock data, but say so honestly.
    return mock_kev_data.get(cve, False), "MOCK_FALLBACK_LIVE_FAILED"

async def fetch_epss(client: httpx.AsyncClient, cve: str) -> tuple[Dict[str, float], str]:
    """Fetch EPSS score and percentile from FIRST.org API or fallback to mock.

    Returns (value, data_source) — see fetch_cisa_kev for what data_source means.
    """
    if USE_MOCKS:
        return mock_epss_data.get(cve, {"epss": 0.0, "percentile": 0.0}), "MOCK_CONFIGURED"
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
                }, "LIVE"
            return {"epss": 0.0, "percentile": 0.0}, "LIVE"
    except Exception:
        pass
    # Live call failed — fall back to mock, but say so honestly.
    return mock_epss_data.get(cve, {"epss": 0.0, "percentile": 0.0}), "MOCK_FALLBACK_LIVE_FAILED"

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

AGENT3_SYSTEM_PROMPT = """You are Agent 3 of a human-supervised vulnerability triage pipeline.

Your goal for each CVE: determine whether it is realistically exploitable, using the tools
provided. You decide which tools to call and in what order.

Guidance:
- cisa_kev_lookup is the strongest signal. Listing means confirmed exploitation in the wild.
- Absence from KEV does NOT mean safe. It often means the CVE is new or uncatalogued.
- If epss_lookup returns found=false there is NO published score. That is NOT a score of
  zero, and you must not treat it as evidence of safety.
- When KEV and EPSS give you nothing, use nvd_lookup to see whether the CVE is simply too
  new (check the published date and CVSS), and exploitdb_search to see whether public
  exploit code exists. Public exploit code raises real risk even with no EPSS score.
- Stop as soon as you can justify a conclusion. Do not call the same tool twice with the
  same argument.

You MUST NOT invent numeric values. Every score you report must have come from a tool
result. If a value is unavailable, say so via data_gaps rather than guessing.

When finished, reply with ONLY a JSON object, no prose and no code fence:
{
  "cve_id": "<the CVE you assessed>",
  "is_cisa_kev": <true|false>,
  "epss_score": <number from epss_lookup, or null if unavailable>,
  "epss_percentile": <number from epss_lookup, or null if unavailable>,
  "public_exploit_available": <true|false>,
  "exploitability_confidence": "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",
  "assessment": "<two sentences max, citing which sources supported your conclusion>",
  "sources_consulted": ["CISA_KEV", "FIRST_EPSS", ...],
  "data_gaps": ["<what you could not determine, if anything>"]
}

exploitability_confidence means confidence in your exploitability judgement:
- HIGH: KEV-listed, or high EPSS, or confirmed public exploit code.
- MEDIUM: partial corroboration across sources.
- LOW: little data, but contextual reasons for concern (e.g. high CVSS, very recent).
- UNKNOWN: sources returned nothing usable. Say so plainly instead of implying safety.
"""


async def _assess_cve_agentically(cve: str) -> Optional[Dict[str, Any]]:
    """
    Run the agentic loop for one CVE.

    Returns the parsed assessment plus trace metadata, or None when the agent could not
    complete so the caller can fall back to the deterministic path.
    """
    from agent_runtime import run_agent, wrap_untrusted

    tools = build_agent3_tools()
    # The CVE id originates from scanner output, so it is untrusted input.
    goal = (
        "Assess the exploitability of the following CVE identifier taken from a scanner "
        f"report.\n\n{wrap_untrusted(cve, max_chars=64)}\n\n"
        "Investigate with the tools available and return the JSON object described in your "
        "instructions."
    )

    result = await run_agent(
        goal=goal,
        system_prompt=AGENT3_SYSTEM_PROMPT,
        tools=tools,
        expect_json=True,
    )

    if not result.ok or not result.final_json:
        return {
            "ok": False,
            "fallback_reason": result.fallback_reason or "agent produced no assessment",
            "trace": result.trace_dicts(),
            "duration_ms": result.duration_ms,
        }

    return {
        "ok": True,
        "assessment": result.final_json,
        "trace": result.trace_dicts(),
        "tools_used": result.tools_used,
        "duration_ms": result.duration_ms,
    }


# Maps a tool name to the intelligence source it represents, so "which sources were
# consulted" can be derived from tool calls that actually happened rather than from the
# model's self-report, which is not always complete.
TOOL_TO_SOURCE = {
    "cisa_kev_lookup": "CISA_KEV",
    "epss_lookup": "FIRST_EPSS",
    "nvd_lookup": "NVD",
    "exploitdb_search": "EXPLOIT_DB",
}


def _sources_from_trace(trace: List[Dict[str, Any]]) -> List[str]:
    """Ground truth on which sources were consulted, taken from executed tool calls."""
    seen: List[str] = []
    for step in trace:
        if step.get("kind") != "tool_call":
            continue
        source = TOOL_TO_SOURCE.get(step.get("tool", ""))
        if source and source not in seen:
            seen.append(source)
    return seen


def _gaps_from_trace(trace: List[Dict[str, Any]]) -> List[str]:
    """Derive honest data gaps from tool results that reported found=false."""
    gaps: List[str] = []
    for step in trace:
        if step.get("kind") != "tool_call":
            continue
        summary = step.get("result_summary") or ""
        source = TOOL_TO_SOURCE.get(step.get("tool", ""), step.get("tool", ""))
        if '"found": false' in summary or "'found': False" in summary:
            gaps.append(f"{source}: no data returned for this CVE.")
    return gaps


def _coerce_float(value: Any) -> Optional[float]:
    """Accept only real numbers from the model; reject anything else."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if 0.0 <= f <= 1.0 else None


@router.post("/enrich", response_model=EnrichResponse)
async def enrich_findings(request: EnrichRequest):
    """Enrich canonical findings with threat intelligence (CISA KEV, EPSS, Exploit-DB).

    Runs an agentic, goal-directed investigation per CVE when LLM_ENABLED=true and a key is
    configured. Falls back to the original fixed two-call sequence otherwise, or whenever the
    agent times out, errors, or returns something unusable — so this endpoint's contract
    never depends on the model being available.
    """
    from agent_runtime import agentic_enabled

    cve_intel: Dict[str, VulnerabilityIntelligence] = {}

    # Process unique CVEs. dict.fromkeys (not set()) is deliberate: Python's set iteration
    # order for strings depends on per-process hash randomization, which is re-randomized on
    # every process restart — so a set-based dedup produced a different CVE order on every
    # `docker compose up`, even for byte-identical input. That order feeds directly into which
    # CVEs get the (capped) agentic treatment below, so a random order meant a random subset
    # of CVEs got full investigation between otherwise-identical runs. dict.fromkeys preserves
    # first-appearance order deterministically, and Agent 2's output order is itself
    # deterministic (pandas groupby sorts by fingerprint_hash), so this is now stable end to end.
    unique_cves = list(dict.fromkeys(
        f.cve_id for f in request.findings if f.cve_id and f.cve_id != "UNKNOWN"
    ))

    # Per-CVE agentic assessment metadata
    agent_assessments: Dict[str, Dict[str, Any]] = {}
    agent_traces_by_cve: Dict[str, List[Dict[str, Any]]] = {}
    agent_trace: List[Dict[str, Any]] = []
    tools_used: List[str] = []
    agent_duration_ms = 0
    reasoning_mode = "DETERMINISTIC"
    fallback_reason: Optional[str] = None
    fallback_reasons: Dict[str, str] = {}

    if agentic_enabled() and unique_cves:
        reasoning_mode = "AGENTIC"

        # Investigate CVEs concurrently. Sequential assessment made wall-clock time scale
        # linearly with the number of unique CVEs, which does not hold up on real scans.
        # Concurrency is bounded so a large scan cannot open hundreds of parallel requests.
        targets = unique_cves[:AGENT3_MAX_CVES]
        deferred = unique_cves[AGENT3_MAX_CVES:]
        if deferred:
            print(
                f"INFO: Agent 3 agentically assessing {len(targets)} of {len(unique_cves)} CVEs; "
                f"{len(deferred)} will use the deterministic path (AGENT3_MAX_CVES)."
            )

        semaphore = asyncio.Semaphore(AGENT3_CONCURRENCY)

        async def _guarded(cve: str):
            async with semaphore:
                return cve, await _assess_cve_agentically(cve)

        started = asyncio.get_event_loop().time()
        results = await asyncio.gather(
            *(_guarded(c) for c in targets), return_exceptions=True
        )
        agent_duration_ms = int((asyncio.get_event_loop().time() - started) * 1000)

        for item in results:
            if isinstance(item, BaseException):
                reason = f"agent task error: {item}"
                fallback_reason = reason
                fallback_reasons["<task_error>"] = reason
                print(f"WARNING: Agent 3 agentic task raised: {item}")
                continue

            cve, outcome = item
            per_cve_trace = (outcome or {}).get("trace", [])
            agent_trace.extend(per_cve_trace)
            agent_traces_by_cve[cve] = per_cve_trace

            if outcome and outcome.get("ok"):
                data = outcome["assessment"]
                agent_assessments[cve] = data
                for t in outcome.get("tools_used", []):
                    if t not in tools_used:
                        tools_used.append(t)

                cve_intel[cve] = VulnerabilityIntelligence(
                    cve_id=cve,
                    is_cisa_kev=bool(data.get("is_cisa_kev", False)),
                    epss_score=_coerce_float(data.get("epss_score")) or 0.0,
                    epss_percentile=_coerce_float(data.get("epss_percentile")) or 0.0,
                    exploit_db_available=bool(data.get("public_exploit_available", False)),
                    data_source="AGENTIC",
                )
            else:
                # This CVE could not be assessed agentically; fall back for it alone.
                reason = (outcome or {}).get("fallback_reason", "agent failed")
                fallback_reason = reason
                fallback_reasons[cve] = reason
                print(f"WARNING: Agent 3 agentic assessment failed for {cve}: {reason}")

    # Deterministic path for any CVE the agent did not resolve (or all of them when the
    # agentic path is disabled). This is the original behaviour, unchanged.
    remaining = [c for c in unique_cves if c not in cve_intel]
    if remaining:
        if reasoning_mode == "AGENTIC":
            reasoning_mode = "AGENTIC_PARTIAL"
        else:
            from agent_runtime import runtime_status
            status = runtime_status()
            reason = (
                "LLM_ENABLED is false" if not status["llm_enabled"]
                else "NVIDIA_API_KEY is not set" if not status["api_key_present"]
                else fallback_reason or "agentic reasoning unavailable"
            )
            fallback_reason = reason
            for cve in remaining:
                fallback_reasons.setdefault(cve, reason)
        async with httpx.AsyncClient(timeout=10.0) as client:
            for cve in remaining:
                is_kev, kev_source = await fetch_cisa_kev(client, cve)
                epss_info, epss_source = await fetch_epss(client, cve)
                # Public exploit metadata check (never execute exploits)
                exploit_db_available = is_kev or (epss_info.get("epss", 0.0) > 0.5)

                # Honest provenance for this CVE: only "LIVE" when BOTH calls actually hit a
                # live feed successfully; "MOCK_CONFIGURED" only when both were mock-by-design;
                # any mix (including a live call that silently failed over to mock) is flagged
                # distinctly so it can never be mistaken for a genuine live result.
                if kev_source == epss_source == "LIVE":
                    data_source = "LIVE"
                elif kev_source == epss_source == "MOCK_CONFIGURED":
                    data_source = "MOCK_CONFIGURED"
                else:
                    data_source = "MOCK_FALLBACK_LIVE_FAILED"

                cve_intel[cve] = VulnerabilityIntelligence(
                    cve_id=cve,
                    is_cisa_kev=is_kev,
                    epss_score=epss_info.get("epss", 0.0),
                    epss_percentile=epss_info.get("percentile", 0.0),
                    exploit_db_available=exploit_db_available,
                    data_source=data_source,
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
            
        # Attach the agent's judgement when it assessed this CVE.
        judgement = agent_assessments.get(finding.cve_id, {})
        confidence = str(judgement.get("exploitability_confidence") or "UNKNOWN").upper()
        if confidence not in ("HIGH", "MEDIUM", "LOW", "UNKNOWN"):
            confidence = "UNKNOWN"

        cve_trace = agent_traces_by_cve.get(finding.cve_id, [])

        if judgement:
            # Prefer ground truth from executed tool calls over the model's self-report,
            # which sometimes omits sources it actually consulted.
            sources = _sources_from_trace(cve_trace) or (judgement.get("sources_consulted") or [])
            gaps = judgement.get("data_gaps") or _gaps_from_trace(cve_trace)
        else:
            # Deterministic path: be explicit that absence of data is not evidence of safety.
            sources = ["CISA_KEV", "FIRST_EPSS"]
            if not is_kev and epss == 0.0:
                confidence = "UNKNOWN"
                gaps = ["No KEV listing and no EPSS score; exploitability undetermined."]
            else:
                confidence = "MEDIUM"
                gaps = []

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
            exploit_db_available=exploit_avail,
            exploitability_confidence=confidence,
            assessment=judgement.get("assessment"),
            sources_consulted=[str(s) for s in sources][:6],
            data_gaps=[str(g) for g in gaps][:4],
        ))
        
    kev_count = sum(1 for f in enriched_findings if f.is_cisa_kev)
    avg_epss = (sum(f.epss_score for f in enriched_findings) / len(enriched_findings)) if enriched_findings else 0.0

    # Ground truth, not just the USE_MOCKS flag: a "live mode" run where some CVEs silently
    # fell back to mock data on a feed failure must not claim to be pure LIVE_FEEDS — that
    # previously made an intermittently-failing external feed look, from the outside, like
    # inconsistent/"random" enrichment between otherwise-identical runs.
    observed_sources = {intel.data_source for intel in cve_intel.values()}
    if not observed_sources or observed_sources <= {"MOCK_CONFIGURED"}:
        intel_source = "MOCK_FIXTURES"
        source_label = "OFFLINE MOCK FIXTURES (USE_MOCKS=true — not live exploit intelligence)"
    elif "MOCK_FALLBACK_LIVE_FAILED" in observed_sources:
        intel_source = "MIXED_LIVE_WITH_FALLBACKS"
        source_label = (
            "LIVE CISA KEV + FIRST EPSS feeds, with some CVEs falling back to bundled "
            "fixtures because a live call failed — not purely live intelligence this run"
        )
    elif observed_sources <= {"LIVE", "AGENTIC"}:
        intel_source = "LIVE_FEEDS"
        source_label = "LIVE CISA KEV + FIRST EPSS feeds"
    else:
        intel_source = "MIXED"
        source_label = "Mixed intelligence sources across CVEs in this run"
    undetermined = sum(1 for f in enriched_findings if f.exploitability_confidence == "UNKNOWN")

    if reasoning_mode.startswith("AGENTIC"):
        mode_label = (
            f"Agentic investigation ({len(tools_used)} tool(s) used: {', '.join(tools_used) or 'none'}; "
            f"{len(agent_trace)} reasoning step(s))"
        )
    else:
        mode_label = "Deterministic two-call lookup (agentic reasoning disabled)"

    summary = (
        f"Correlated {len(enriched_findings)} canonical findings against {len(unique_cves)} unique CVE(s). "
        f"Method: {mode_label}. "
        f"Intelligence source: {source_label}. "
        f"{kev_count} finding(s) flagged as actively exploited; average exploit probability "
        f"{avg_epss*100:.1f}%. "
        f"{undetermined} finding(s) have UNDETERMINED exploitability — absence of data, not evidence of safety."
    )
    deterministic_analysis = AIAnalysis(
        processing_summary=summary,
        evidence_used=f"Threat intel for {len(unique_cves)} unique CVE(s) via {source_label}.",
        tools_and_sources=", ".join(tools_used) if tools_used else "CISA_KEV, FIRST_EPSS (deterministic lookups)",
        decision_rationale=mode_label,
        confidence_and_limitations=(
            f"{undetermined} of {len(enriched_findings)} finding(s) have UNDETERMINED "
            "exploitability (absence of data, not evidence of safety)."
        ),
    )
    ai_analysis = deterministic_analysis
    try:
        from agent_runtime import agentic_enabled, run_agent, NVIDIA_MODEL

        if agentic_enabled() and unique_cves:
            goal = (
                f"Enrichment run over {len(enriched_findings)} findings / {len(unique_cves)} unique "
                f"CVEs. Mode: {mode_label}. Intelligence source: {source_label}. "
                f"{kev_count} finding(s) are CISA KEV-listed. Average EPSS: {avg_epss*100:.1f}%. "
                f"{undetermined} finding(s) have undetermined exploitability. Tools used: "
                f"{tools_used or 'none (deterministic path)'}. Fallbacks encountered: "
                f"{len(fallback_reasons)}.\n\n"
                "Summarize this threat-intelligence enrichment run for a human security analyst."
            )
            result = await run_agent(
                goal=goal,
                system_prompt=sections_system_prompt(AGENT3_STAGE_ROLE),
                tools=[],
                expect_json=True,
            )
            ai_analysis = ai_analysis_from_result(
                result, model_name=NVIDIA_MODEL, deterministic=deterministic_analysis
            )
    except Exception as exc:
        print(f"WARNING: Agent 3 stage-level Nemotron summarization skipped: {exc}")

    return EnrichResponse(
        status="WAITING_FOR_HUMAN",
        stage_summary=summary,
        findings=enriched_findings,
        # Iterate unique_cves (the single, deterministic master order) rather than
        # cve_intel.values() directly. cve_intel is populated in two passes — agentic
        # successes first, then the deterministic fallback for whatever's left — and which
        # CVEs land in which pass can vary run-to-run under real API flakiness (e.g. rate
        # limiting), which would otherwise still let dict insertion order (and so this list's
        # order) vary between two runs over byte-identical input, even after fixing the
        # earlier set()-based unique_cves bug.
        vulnerability_intelligence=[cve_intel[c] for c in unique_cves if c in cve_intel],
        intel_source=intel_source,
        reasoning_mode=reasoning_mode,
        fallback_reason=fallback_reason,
        fallback_reasons=fallback_reasons,
        agent_trace=[AgentTraceStep(**s) for s in agent_trace],
        tools_used=tools_used,
        agent_duration_ms=agent_duration_ms,
        ai_analysis=ai_analysis,
    )
