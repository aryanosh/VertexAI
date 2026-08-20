# Bugfix Requirements Document

## Introduction

This bugfix consolidates nine confirmed defects across the VertexAI vulnerability scanner pipeline (Agents 2/3/4, Java backend, and React frontend) into one coordinated fix so the system produces correct, demo-ready output end to end. The defects span three severity tiers: three high-severity defects that block a clean demo (XGBoost averaging away per-finding signal, an unexplained 0.4x discount that under-suppresses high-FP-rate plugins, and scanner-type detection that only reads the filename), three medium-severity defects that produce wrong results or drop data (missing `data_gaps` on the Agent 3 fallback path, a single overwritten `fallback_reason` across CVEs, and Agent 4 ticket payloads never being persisted), and three low-severity defects covering documentation drift, a weak internal-approval boundary in the ticketing service, and a 400ms debounce that delays post-gate UI refresh. The fixes must be applied without changing the public output schemas, without regressing the current 19/19 E2E and 24/24 agent runtime test baselines, and without altering the operator-visible defaults (agentic mode on, `LLM_ENABLE_THINKING=false`).

## Bug Analysis

### Current Behavior (Defect)

Each clause below describes an observable defect in the code as it stands today. Clause X.Y in Section 1 corresponds to clause X.Y in Section 2 (the expected fix).

1.1 WHEN two findings share a fingerprint but have disagreeing `scanner_confidence` values (for example `[3, 1]`) THEN `agents_service/agent2_noise.py` (lines 130–145) averages `scanner_confidence` at the group level via `group['scanner_confidence'].mean()` and passes the averaged feature vector to XGBoost, so the classifier never sees per-finding signal and the group is misclassified.

1.2 WHEN a Nuclei/ZAP/OpenVAS/Nmap plugin has an historical false-positive rate `fp_rate` (for example `0.5`) THEN `agents_service/agent2_noise.py` line 73 initializes the heuristic FP probability as `prob = fp_rate * 0.4` (so a 50% FP-rate plugin starts at 0.20), requiring +0.65 of penalty-clause contribution to reach the 0.85 suppression threshold, which under-suppresses high-FP-rate plugins.

1.3 WHEN a scan file is uploaded with a name that does not contain a scanner keyword (for example a Nuclei JSONL uploaded as `scan_findings.jsonl`) THEN `backend/src/main/java/com/vertexai/service/ScanService.java` (lines 116–130) defaults `scannerType` to `OWASP_ZAP` based on filename alone, and Agent 1 subsequently fails to parse the file.

1.4 WHEN Agent 3's agentic assessment fails for a given CVE and control falls back to the deterministic tool-call path THEN `agents_service/agent3_threat.py` (lines 424–429 agentic path and 515–520 deterministic path) computes `data_gaps` locally from failed KEV/EPSS lookups but never writes them into `agent_assessments[cve]`, so the analyst sees `data_gaps=[]` even though gaps exist.

1.5 WHEN more than one CVE falls back from agentic to deterministic assessment inside the same run THEN `agents_service/agent3_threat.py` (lines 386–394) uses a single loop-scoped `fallback_reason` variable that is overwritten on each failed iteration, so `reasoning_mode = "AGENTIC_PARTIAL"` is emitted with only the last CVE's reason and the analyst cannot see which CVEs fell back or why.

1.6 WHEN Agent 4 returns both `scored_findings` and `ticket_payloads` (formatted GitHub issue templates) to the backend THEN `backend/src/main/java/com/vertexai/service/PipelineOrchestrator.java` (lines 615–655) persists only the risk scores and drops `ticket_payloads`, so if the backend restarts before ticket dispatch the payloads must be regenerated and may differ from what Agent 4 produced.

1.7 WHEN a reader inspects the Agent 4 scoring module docstring THEN `agents_service/agent4_scoring.py` (lines 30–36) describes an old broken formula (`(cvss * 0.30) + (epss * 10 * 0.35)` capped at 51.5 with P0 unreachable) even though the code at line 62 already implements the corrected `cvss / 10.0 * 30` term inside the 30/35/25/20 weighting, so the documentation misrepresents current behavior.

1.8 WHEN `GitHubTicketingService.createTicket(findingId, approved)` is invoked directly at the service layer with `approved=true` THEN `backend/src/main/java/com/vertexai/service/GitHubTicketingService.java` (lines 58–72) trusts the caller-supplied flag and does not independently verify that a `RiskScore` row (the Agent 4 approval marker) exists for the finding, so a direct service call can bypass the HTTP-level approval check.

1.9 WHEN the analyst clicks CONTINUE at a pipeline gate THEN `frontend/src/lib/pipeline-context.tsx` (lines 187–195) routes the follow-up `refresh()` through the shared 400ms debounce used for WebSocket and periodic-poll updates, so a slow backend commit causes the refresh to fetch stale state and the analyst must refresh manually.

### Expected Behavior (Correct)

Each clause below defines the correct behavior for the same trigger condition as its Section 1 counterpart. These are the acceptance criteria (EARS format) for the fix.

2.1 WHEN two findings share a fingerprint but have disagreeing `scanner_confidence` values THEN Agent 2 SHALL score each finding individually with the XGBoost classifier first and aggregate scores at the group level afterward (using `max` or the mean of per-finding scores), preserving per-finding signal, keeping deduplication grouping intact, and keeping the >0.85 suppression threshold unchanged.

2.2 WHEN the heuristic FP probability is computed for any plugin THEN Agent 2 SHALL use `prob = fp_rate` as the Bayesian prior (removing the unexplained `* 0.4` factor) while continuing to add the existing penalty clauses (no-CVE, low-confidence, HTTP 404, closed-port) and continuing to apply the 0.85 suppression threshold.

2.3 WHEN a scan file is uploaded whose filename does not include a scanner keyword THEN `ScanService` SHALL fall back to content sniffing that inspects the file for schema markers (`"tool":"nuclei"`, `<nmap`, `<openvas`, `"tool":"ZAProxy"`) and assign `scannerType` accordingly, correctly detecting all four supported scanner types (NMAP, ZAP, NUCLEI, OPENVAS).

2.4 WHEN Agent 3's agentic assessment fails for a CVE and the deterministic fallback executes THEN Agent 3 SHALL build the `data_gaps` list explicitly from the failed tool returns (missing KEV, missing EPSS, and any other tool-lookup failures) and store it in `agent_assessments[cve]["data_gaps"]` so the analyst sees the true gap set.

2.5 WHEN one or more CVEs fall back from agentic to deterministic assessment in the same run THEN Agent 3 SHALL track the fallback reason per CVE in a dict keyed by CVE ID, emit `reasoning_mode = "AGENTIC_PARTIAL"` with a summary message that combines the per-CVE reasons (or a machine-readable structure surfacing each CVE's reason), and continue to emit `reasoning_mode = "AGENTIC"` with `fallback_reason = None` when all CVEs succeed and `reasoning_mode = "DETERMINISTIC"` when all fall back.

2.6 WHEN Agent 4 returns `ticket_payloads` alongside `scored_findings` THEN `PipelineOrchestrator` SHALL persist the payload array to a new `ticket_payloads_json` (jsonb) column on the `scan_jobs` table together with the risk scores in the same transaction, so a backend restart before dispatch can replay the exact payloads Agent 4 produced.

2.7 WHEN a reader inspects the Agent 4 scoring module docstring THEN the docstring SHALL describe the currently implemented 30/35/25/20 weighting (CVSS 30%, EPSS 35%, business-context 25%, exploit-availability 20%) with the correct component formulas and the current 0–100 range, and SHALL NOT reference the old `(cvss * 0.30) + (epss * 10 * 0.35)` formula or the 51.5 cap.

2.8 WHEN `GitHubTicketingService.createTicket(findingId, approved)` is invoked at the service layer THEN the service SHALL independently verify that `riskScoreRepository.findByFinding(findingId)` returns a non-empty result before creating a ticket, and SHALL throw a `SecurityException` (or equivalent) when no `RiskScore` exists, regardless of the value of `approved`.

2.9 WHEN the analyst clicks CONTINUE at a pipeline gate THEN `pipeline-context.tsx` SHALL expose a `refreshImmediate()` function that bypasses the 400ms debounce, and gate handlers SHALL call `refreshImmediate()` directly so the post-gate fetch returns the just-committed state.

### Unchanged Behavior (Regression Prevention)

The clauses below capture invariants that MUST hold across every fix. Clauses 3.1–3.9 mirror the per-bug preservation contracts; clauses 3.10–3.16 are cross-cutting invariants.

3.1 WHEN Agent 2 processes a group of findings sharing a fingerprint THEN the system SHALL CONTINUE TO deduplicate findings by fingerprint, apply the >0.85 suppression threshold, and emit the existing `CanonicalFinding` output schema unchanged.

3.2 WHEN Agent 2 evaluates the heuristic FP clauses THEN the system SHALL CONTINUE TO add the existing penalty contributions (no-CVE, low-confidence, HTTP 404, closed-port) into the same probability variable and SHALL CONTINUE TO suppress at `prob > 0.85`.

3.3 WHEN a scan file arrives with a filename that already contains a scanner keyword (for example `nmap_scan.xml`, `nuclei_output.jsonl`) THEN `ScanService` SHALL CONTINUE TO detect the scanner type from the filename without invoking content sniffing.

3.4 WHEN Agent 3's agentic path succeeds for a CVE THEN Agent 3 SHALL CONTINUE TO populate `data_gaps` exactly as it does today from the agentic response.

3.5 WHEN every CVE in a run succeeds via the agentic path THEN Agent 3 SHALL CONTINUE TO emit `reasoning_mode = "AGENTIC"` with `fallback_reason = None`; WHEN every CVE falls back THEN Agent 3 SHALL CONTINUE TO emit `reasoning_mode = "DETERMINISTIC"`; WHEN the agent runs without an LLM key configured THEN the deterministic-only mode SHALL CONTINUE TO work.

3.6 WHEN the backend writes risk scores THEN the `risk_scores` table SHALL CONTINUE TO be populated as it is today; the existing ticket-dispatch flow SHALL CONTINUE TO consume `scored_findings`; the new `ticket_payloads_json` column SHALL be added as a nullable/backwards-compatible migration so pre-existing rows remain valid.

3.7 WHEN Agent 4 computes any risk score THEN the numeric output SHALL CONTINUE TO be identical to the current implementation (the change under 2.7 is documentation only).

3.8 WHEN a request reaches `GitHubTicketingService` through the HTTP controller with a valid `RiskScore` for the finding THEN the successful ticket-creation path SHALL CONTINUE TO work unchanged; the new check is belt-and-suspenders and MUST NOT reject legitimate approved requests.

3.9 WHEN WebSocket updates or periodic polling trigger `refresh()` THEN the shared 400ms debounce SHALL CONTINUE TO apply to those code paths; only the gate-continue handler switches to `refreshImmediate()`.

3.10 WHEN the full pipeline runs end to end THEN pipeline stages SHALL CONTINUE TO execute in their current order (Ingest → Agent 1 → Agent 2 → Agent 3 → Agent 4 → Ticketing) with no reordering or stage removal.

3.11 WHEN `verify_pipeline_e2e.sh` is executed against the fixed system THEN the current 19/19 check pass rate SHALL CONTINUE TO be met (no regressions introduced by any of the nine fixes).

3.12 WHEN the agent-runtime test suite runs THEN the current 24/24 pass rate SHALL CONTINUE TO be met.

3.13 WHEN the database migration for `ticket_payloads_json` is applied against an existing database THEN the migration SHALL be backwards-compatible: existing rows SHALL remain valid, no destructive DDL SHALL be issued, and rollback SHALL be possible without data loss.

3.14 WHEN the service starts with the default configuration THEN `LLM_ENABLE_THINKING=false` SHALL CONTINUE TO be the effective default.

3.15 WHEN the service starts with the default configuration AND the NVIDIA Nemotron key is present in `.env` THEN agentic mode SHALL CONTINUE TO be enabled by default (Agent 3 SHALL prefer the agentic path when the key is available).

3.16 WHEN any component connects to Postgres THEN the completed port migration (5432 → 5433) SHALL CONTINUE TO be respected; no fix in this bugfix SHALL reintroduce hard-coded 5432 references.

## Bug Condition Derivations

The pseudocode below formalizes each defect. `F` denotes the original function; `F'` denotes the fixed function. Section-2 clauses above are the property assertions `P(result)`.

```pascal
// 1.1 - Agent 2: per-finding vs averaged features
FUNCTION isBugCondition_1_1(group)
  INPUT: group of type FindingGroup
  OUTPUT: boolean
  RETURN size(group.findings) > 1
     AND stddev(group.findings.scanner_confidence) > 0
END FUNCTION

// 1.2 - Agent 2: 0.4x discount on FP-rate prior
FUNCTION isBugCondition_1_2(plugin)
  INPUT: plugin of type PluginRecord
  OUTPUT: boolean
  RETURN plugin.fp_rate > 0
END FUNCTION

// 1.3 - Backend: scanner detection by filename only
FUNCTION isBugCondition_1_3(upload)
  INPUT: upload of type ScanUpload
  OUTPUT: boolean
  RETURN NOT filenameContainsScannerKeyword(upload.filename)
     AND fileContentImpliesNonZapScanner(upload.bytes)
END FUNCTION

// 1.4 - Agent 3: data_gaps not propagated on fallback
FUNCTION isBugCondition_1_4(cve, run)
  INPUT: cve of type CveId, run of type Agent3Run
  OUTPUT: boolean
  RETURN run.agentic_failed_for(cve)
     AND (run.kev_lookup_failed(cve) OR run.epss_lookup_failed(cve))
END FUNCTION

// 1.5 - Agent 3: fallback_reason overwritten across CVEs
FUNCTION isBugCondition_1_5(run)
  INPUT: run of type Agent3Run
  OUTPUT: boolean
  RETURN count(run.cves_that_fell_back) >= 2
END FUNCTION

// 1.6 - Backend: ticket_payloads dropped
FUNCTION isBugCondition_1_6(agent4_result)
  INPUT: agent4_result of type Agent4Output
  OUTPUT: boolean
  RETURN agent4_result.ticket_payloads IS NOT EMPTY
END FUNCTION

// 1.7 - Agent 4: stale docstring
FUNCTION isBugCondition_1_7(module)
  INPUT: module of type PythonModule
  OUTPUT: boolean
  RETURN module.path = "agents_service/agent4_scoring.py"
     AND module.docstring_references_old_formula()
END FUNCTION

// 1.8 - Backend: GitHubTicketingService weak boundary
FUNCTION isBugCondition_1_8(call)
  INPUT: call of type ServiceCall
  OUTPUT: boolean
  RETURN call.method = "createTicket"
     AND call.approved = true
     AND NOT riskScoreExistsFor(call.findingId)
END FUNCTION

// 1.9 - Frontend: post-gate refresh debounced
FUNCTION isBugCondition_1_9(event)
  INPUT: event of type UiEvent
  OUTPUT: boolean
  RETURN event.type = "gate.continue.clicked"
END FUNCTION

// Preservation - all non-buggy inputs behave identically
FOR ALL X WHERE NOT isBugCondition_i(X) DO
  ASSERT F_i(X) = F_prime_i(X)
END FOR
```
