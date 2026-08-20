# Pipeline Defect Fixes Bugfix Design

## Overview

This design consolidates nine confirmed defects across the VertexAI pipeline (Agents 2/3/4, the Spring Boot backend, and the React/Next.js frontend) into a single coordinated fix. Because the defects touch four different components and one of them requires a persisted database column, they cannot be shipped as nine independent PRs without risking a broken intermediate state. Instead, this design groups them into five phases (Phase 0 → Phase 4), each of which can be built, verified, and rolled back on its own while preserving the two established green baselines: `verify_pipeline_e2e.sh` (19/19) and `pytest agents_service/tests/` (24/24).

The coordinated strategy is:

- **Phase 0 — Foundation (bugs 1.7, 1.3).** Two zero-runtime-risk changes that unblock later phases and correct visible defects on their own. 0A rewrites the Agent 4 module docstring so it matches the currently-implemented 30/35/25/20 formula (documentation-only, no runtime effect). 0B adds a content-sniffing fallback to `ScanService.uploadAndStartScan` so files whose names lack a scanner keyword are still routed to the correct parser. Both are self-contained and can ship first because they have no dependency on any other phase.
- **Phase 1 — Agent 2 (bugs 1.2, 1.1).** 1A removes the unexplained `* 0.4` factor from the heuristic FP prior in `agents_service/agent2_noise.py` line 73. 1B moves XGBoost inference from group-averaged features (lines 130–145) to per-finding scoring with a `max`-based group aggregation. Both changes preserve the `CanonicalFinding` output schema, the fingerprint grouping, and the `> 0.85` suppression threshold. 1A ships before 1B because 1B's per-finding heuristic calls invoke the fixed `heuristic_fp_prob`.
- **Phase 2 — Agent 3 (bugs 1.4, 1.5).** 2A propagates `data_gaps` into `agent_assessments[cve]` on the deterministic-fallback branch (lines 424–429 and 515–520) so the analyst sees the true gap set. 2B replaces the single loop-scoped `fallback_reason` string (lines 386–394) with a per-CVE dict, and emits `reasoning_mode = "AGENTIC_PARTIAL"` with a summary that names each fallen-back CVE. `agent_runtime.py` is not touched.
- **Phase 3 — Backend (bugs 1.6, 1.8).** 3A adds a nullable `scan_jobs.ticket_payloads_json` (jsonb) column with the migration and JPA `@Column` mapping, then extends `PipelineOrchestrator.persistRiskScore` to write both `risk_scores` and `ticket_payloads_json` in the same `@Transactional` boundary. 3B tightens `GitHubTicketingService.createTicket` to independently verify a `RiskScore` row exists for the finding (via the already-injected `RiskScoreRepository`) and throw `SecurityException` otherwise, regardless of the caller-supplied `approved` flag. 3A ships before 3B because 3A's schema change is the largest and highest-risk single change in the bugfix and must be validated end-to-end before further backend edits stack on top.
- **Phase 4 — Frontend (bug 1.9).** 4A exposes `refreshImmediate()` on `pipeline-context.tsx` and wires the gate-continue handler (lines 187–195) to it, so the follow-up REST fetch bypasses the shared 400ms debounce and observes the just-committed backend state. The debounce continues to guard WebSocket rebroadcasts and periodic polls.

All fixes preserve the operator-visible defaults: `LLM_ENABLE_THINKING=false`, agentic mode enabled when the NVIDIA Nemotron key is present, Postgres on port 5433, the 19/19 E2E baseline, and the 24/24 agent-test baseline.

## Glossary

- **Bug_Condition (C)**: The predicate that identifies inputs for which the current code produces incorrect output. Formalized per-defect in the **Bug Details** section below.
- **Property (P)**: The desired behavior when `C(X)` holds — for this bugfix, `P` is composed of the nine clauses in Section 2 of `bugfix.md`.
- **Preservation**: For all inputs `X` where `¬C(X)`, the fixed code `F'(X)` produces exactly the same output as the original code `F(X)`. Preservation is enforced by the invariants in Section 3 of `bugfix.md`.
- **F / F′**: `F` is the code as of `bugfix.md` (pre-fix); `F′` is the code after this design ships.
- **`heuristic_fp_prob`**: The heuristic false-positive probability function in `agents_service/agent2_noise.py` (line 71) used when the XGBoost model is missing or fails to load.
- **`reduce_noise`**: The FastAPI handler in `agents_service/agent2_noise.py` (line 84) that groups findings by `fingerprint_hash`, invokes XGBoost (or the heuristic), and emits `CanonicalFinding` records.
- **`agent_assessments`**: The dict inside `agent3_threat.py`'s `enrich` handler that maps `cve_id → judgement`, where each judgement carries `data_gaps`, `sources_consulted`, and `exploitability_confidence`.
- **`fallback_reason`**: A string on the `EnrichResponse` payload that explains why Agent 3 did not use the agentic path. Today it is a single string; the fix makes it able to represent multiple per-CVE reasons.
- **`uploadAndStartScan`**: The `ScanService` entry point (line 106) that receives multipart uploads and decides `scannerType` per file.
- **`persistRiskScore`**: The `PipelineOrchestrator` method (line 511) that walks `scored_findings` and writes to `risk_scores`. This design extends it to also write `ticket_payloads_json`.
- **`createTicket`**: The `GitHubTicketingService` method (line 59) that dispatches a GitHub issue after final human approval.
- **`ticket_payloads_json`**: The new nullable jsonb column on `scan_jobs` that stores the Agent 4 ticket payload array so it survives a backend restart.
- **`refresh` / `refreshImmediate`**: `refresh` is the debounced status pull already exposed by `pipeline-context.tsx`. `refreshImmediate` is the new sibling function that bypasses the 400ms debounce and is used only by gate-continue handlers.

## Bug Details

Each subsection restates the defect from Section 1 of `bugfix.md`, gives a compact `isBugCondition` predicate in pseudocode, and enumerates concrete manifestations. The pseudocode restates the derivations at the bottom of `bugfix.md` so this design is self-contained.

### 1.1 Agent 2 averages `scanner_confidence` before XGBoost

The bug manifests when two or more findings share a fingerprint (same target host + port + CVE) but disagree on per-finding features the XGBoost model was trained on (`scanner_confidence`, `http_response_code`, `port_is_open`, `has_cve_id`, `historical_plugin_fp_rate`). `reduce_noise` builds one averaged feature vector per group and calls `model.predict_proba` once, so signal from any minority finding is washed out.

**Formal Specification:**

```
FUNCTION isBugCondition_1_1(group)
  INPUT: group of type FindingGroup  // findings sharing fingerprint_hash
  OUTPUT: boolean

  RETURN size(group.findings) > 1
     AND stddev(group.findings.scanner_confidence) > 0
END FUNCTION
```

**Examples:**
- Group `[{conf=3}, {conf=1}]` → averaged `conf=2` is fed to XGBoost; per-finding signal from the confidence-1 finding is lost.
- Group `[{http_code=200}, {http_code=404}]` → averaged `http_code=302` is not a value the classifier ever saw during training.

### 1.2 Agent 2 heuristic FP prior applies an unexplained `* 0.4`

Line 73 of `agent2_noise.py` initializes `prob = fp_rate * 0.4`. A plugin with an historical FP-rate of 0.5 therefore starts at 0.20, and the sum of all four penalty clauses (`+0.3 + 0.2 + 0.15 + 0.2 = 0.85`) cannot exceed the suppression threshold in a strict inequality. High-FP-rate plugins are under-suppressed.

**Formal Specification:**

```
FUNCTION isBugCondition_1_2(plugin)
  INPUT: plugin of type PluginRecord
  OUTPUT: boolean

  RETURN plugin.fp_rate > 0
END FUNCTION
```

**Examples:**
- `fp_rate=0.5`, no CVE, low confidence, HTTP 404, closed port → today `prob = 0.20 + 0.3 + 0.2 + 0.15 + 0.2 = 1.05` clamped to 1.0 (suppressed today).
- `fp_rate=0.5`, has CVE, low confidence, HTTP 200, port open → today `prob = 0.20 + 0.0 + 0.2 + 0.0 + 0.0 = 0.40` (not suppressed). After the fix (`prob = fp_rate`), the same case is `0.5 + 0.2 = 0.7` (still not suppressed) — critically, the fix does not over-suppress.

### 1.3 Scanner detection reads filename only

`uploadAndStartScan` in `ScanService.java` (line 116) branches solely on the lowercased filename. A Nuclei JSONL uploaded as `scan_findings.jsonl` matches the `.jsonl` suffix and is correctly detected as Nuclei, but `report.xml` (Nmap), `results.json` (Nuclei), or `output.txt` (OpenVAS) all fall through to the `OWASP_ZAP` default.

**Formal Specification:**

```
FUNCTION isBugCondition_1_3(upload)
  INPUT: upload of type ScanUpload
  OUTPUT: boolean

  RETURN NOT filenameContainsScannerKeyword(upload.filename)
     AND fileContentImpliesNonZapScanner(upload.bytes)
END FUNCTION
```

**Examples:**
- `report.xml` containing `<nmaprun>` → classified `OWASP_ZAP` (wrong) → Agent 1 parse fails.
- `findings.json` containing `"tool":"nuclei"` → classified `OWASP_ZAP` (wrong).
- `nmap_scan.xml` → correctly classified `NMAP` today (preservation case, `¬C(X)`).

### 1.4 Agent 3 `data_gaps` never propagated on fallback

When Agent 3's agentic path fails for a specific CVE and the deterministic path executes for that CVE, the function assigns `gaps` locally in the enrichment loop but never writes anything back into `agent_assessments[cve]`. The analyst sees `data_gaps=[]` even when KEV or EPSS calls returned nothing. The relevant regions are the agentic path around lines 424–429 and the deterministic path around lines 515–520.

**Formal Specification:**

```
FUNCTION isBugCondition_1_4(cve, run)
  INPUT: cve of type CveId, run of type Agent3Run
  OUTPUT: boolean

  RETURN run.agentic_failed_for(cve)
     AND (run.kev_lookup_failed(cve) OR run.epss_lookup_failed(cve))
END FUNCTION
```

**Example:**
- Agentic path fails for `CVE-2023-XXXXX`. Deterministic fallback returns `is_kev=False` and `epss=0.0`. Today the analyst sees `data_gaps=[]`; after the fix the analyst sees `data_gaps=["No KEV listing", "No EPSS score"]`.

### 1.5 Agent 3 `fallback_reason` overwritten across CVEs

Lines 386–394 of `agent3_threat.py` assign `fallback_reason` inside a per-CVE loop; the last iteration wins. When two CVEs fall back for different reasons, `EnrichResponse.fallback_reason` claims only the last one, and the analyst cannot see which CVEs fell back or why.

**Formal Specification:**

```
FUNCTION isBugCondition_1_5(run)
  INPUT: run of type Agent3Run
  OUTPUT: boolean

  RETURN count(run.cves_that_fell_back) >= 2
END FUNCTION
```

**Example:**
- Run with 3 CVEs. Agentic fails for CVE-A (`"invalid_json"`) and CVE-B (`"tool_timeout"`). Today `fallback_reason="tool_timeout"`. After the fix, `fallback_reason` is a structured summary such as `"CVE-A: invalid_json; CVE-B: tool_timeout"`.

### 1.6 Backend drops `ticket_payloads`

Agent 4's `ScoreResponse` (`agents_service/agent4_scoring.py`) contains both `scored_findings` and `ticket_payloads`. `PipelineOrchestrator.persistRiskScore` (lines 615–655) walks only `scored_findings`; the payload array is never written to Postgres. If the backend restarts between the WAITING_FOR_HUMAN gate and the CONTINUE, the payloads must be regenerated (and may differ, e.g. because SLA deadlines are recomputed from `now()`).

**Formal Specification:**

```
FUNCTION isBugCondition_1_6(agent4_result)
  INPUT: agent4_result of type Agent4Output
  OUTPUT: boolean

  RETURN agent4_result.ticket_payloads IS NOT EMPTY
END FUNCTION
```

**Example:**
- Agent 4 returns 4 ticket payloads; backend restarts before analyst clicks CONTINUE → today those exact payloads are lost. After the fix, the payloads survive in `scan_jobs.ticket_payloads_json`.

### 1.7 Agent 4 docstring drift

The module-level docstring in `agents_service/agent4_scoring.py` (lines 30–36) still describes the pre-fix formula `(cvss * 0.30) + (epss * 10 * 0.35)` capped at 51.5 with P0 unreachable. The actual code (line 62) already implements CVSS-normalized-to-30 + EPSS-normalized-to-35 + KEV-25 + asset-normalized-to-20 inside the 30/35/25/20 weighting. Documentation-only defect.

**Formal Specification:**

```
FUNCTION isBugCondition_1_7(module)
  INPUT: module of type PythonModule
  OUTPUT: boolean

  RETURN module.path = "agents_service/agent4_scoring.py"
     AND module.docstring_references_old_formula()
END FUNCTION
```

### 1.8 `GitHubTicketingService` weak internal boundary

`createTicket(findingId, approved)` (lines 58–72) trusts the caller-supplied `approved` flag and rejects only when `approved==false`. `RiskScoreRepository` is already injected on the class via the constructor, but the createTicket path never independently verifies that a `RiskScore` row exists for `findingId` before dispatching. A direct service-layer call with `approved=true` skips the Agent 4 gate.

**Formal Specification:**

```
FUNCTION isBugCondition_1_8(call)
  INPUT: call of type ServiceCall
  OUTPUT: boolean

  RETURN call.method = "createTicket"
     AND call.approved = true
     AND NOT riskScoreRepository.findByFinding_FindingId(call.findingId).isPresent()
END FUNCTION
```

**Example:**
- Any test or admin utility that constructs a `CanonicalVulnerability` and calls `createTicket(vuln.getFindingId(), true)` today creates a ticket for a finding Agent 4 never scored. After the fix, the same call throws `SecurityException`.

### 1.9 Post-gate refresh debounced

`pipeline-context.tsx` (lines 187–195) funnels every `pipeline-event` (WebSocket rebroadcast, periodic poll, gate-continue optimistic update) through the same 400ms `setTimeout` before calling `refresh()`. On the gate-continue path this means the follow-up REST fetch can land before the backend has committed the CONTINUE transaction, showing stale state.

**Formal Specification:**

```
FUNCTION isBugCondition_1_9(event)
  INPUT: event of type UiEvent
  OUTPUT: boolean

  RETURN event.type = "gate.continue.clicked"
END FUNCTION
```

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Agent 2's fingerprint grouping (MD5 of `target_host:target_port:cve_id`) and its `> 0.85` suppression threshold both remain.
- Agent 2's four penalty clauses (`no-CVE +0.3`, `low-confidence +0.2 / +0.1`, `HTTP 404 +0.15`, `closed port +0.2`) are added into the same probability variable in the same order.
- Agent 3's agentic path continues to populate `data_gaps` exactly as it does today from the agentic response.
- Agent 3 continues to emit `reasoning_mode = "AGENTIC"` when every CVE succeeds, `"AGENTIC_PARTIAL"` when some fall back, and `"DETERMINISTIC"` when all fall back (or the LLM is disabled).
- Agent 4's numeric scoring remains bit-identical (the change under 2.7 is documentation-only).
- The `risk_scores` table continues to be populated for every scored finding; the new `ticket_payloads_json` column is nullable and pre-existing rows remain valid.
- The successful HTTP path into `GitHubTicketingService.createTicket` (called after Agent 4 has written a `RiskScore` row) continues to work unchanged; the new check never rejects legitimate approved requests.
- Every WebSocket update and every periodic-poll tick continues to be debounced through the shared 400ms timer.
- Pipeline stages continue to execute in the order Ingest → Agent 1 → Agent 2 → Agent 3 → Agent 4 → Ticketing, and every existing HITL gate remains.

**Scope:**
All inputs that do NOT match a bug condition should be completely unaffected. Specifically:
- Filenames that already contain a scanner keyword (`nmap`, `zap`, `nuclei`, `openvas`, `.jsonl`) skip content sniffing (bug 1.3 preservation).
- Agent 3 runs where every CVE succeeds via the agentic path never touch the new per-CVE dict logic in the `fallback_reason` code path (bug 1.5 preservation).
- Agent 4 responses that carry an empty `ticket_payloads` array persist a NULL `ticket_payloads_json`, not `[]` (bug 1.6 preservation of "no payload" state).
- WebSocket and periodic-poll refreshes continue to go through the debounced `refresh()`; only the gate-continue click bypasses the debounce (bug 1.9 preservation).

## Hypothesized Root Cause

The nine defects fall into three root-cause families:

1. **Averaging that discards signal (bugs 1.1, 1.2).** Both Agent 2 defects come from applying a scalar transformation (mean, `* 0.4`) to per-finding evidence before the classifier sees it. The XGBoost group-level averaging was a shortcut to avoid iterating twice per group; the `* 0.4` factor has no documented rationale in the codebase and appears to be a stale calibration.

2. **State that fails to cross a control-flow boundary (bugs 1.4, 1.5, 1.6, 1.9).** `data_gaps` are computed but never written back into `agent_assessments`. `fallback_reason` is a loop-scoped scalar where a per-CVE dict is required. `ticket_payloads` are received by `persistRiskScore` but not walked. The post-gate refresh is routed through the same debounce as noisy WebSocket rebroadcasts. Each is a case where information exists at one scope but never makes it into the persistence or delivery boundary that would preserve it.

3. **Trust that should not be granted (bugs 1.3, 1.8) and a documentation-only stale artifact (bug 1.7).** `uploadAndStartScan` trusts the filename; `createTicket` trusts the `approved` flag. `agent4_scoring.py`'s module docstring was left untouched when `score_components` was rewritten. Fixing 1.3 and 1.8 means adding an independent check (content sniff, `RiskScore` presence). Fixing 1.7 means bringing the docstring up to date.

## Correctness Properties

Property 1: Bug Condition 1.1 — Per-Finding XGBoost Scoring

_For any_ group of findings sharing a fingerprint where `stddev(scanner_confidence) > 0`, the fixed `reduce_noise` SHALL score each finding individually with the XGBoost classifier and aggregate the per-finding probabilities at the group level (using `max` by default), preserving per-finding signal.

**Validates: Requirements 2.1**

Property 2: Bug Condition 1.2 — Correct Heuristic FP Prior

_For any_ plugin with `fp_rate > 0`, the fixed `heuristic_fp_prob` SHALL initialize the probability as `prob = fp_rate` (no `* 0.4` factor) and continue to add the existing penalty clauses in their existing order.

**Validates: Requirements 2.2**

Property 3: Bug Condition 1.3 — Content-Sniff Scanner Detection

_For any_ uploaded scan file whose filename does not contain a scanner keyword and whose contents contain a schema marker (`<nmaprun`, `<nmap`, `<report ... openvas`, `"tool":"nuclei"`, `"tool":"ZAProxy"`), `uploadAndStartScan` SHALL assign the corresponding `scannerType` (NMAP / OPENVAS / NUCLEI / OWASP_ZAP) from the content.

**Validates: Requirements 2.3**

Property 4: Bug Condition 1.4 — Data-Gaps Propagated on Fallback

_For any_ CVE for which the agentic path fails and the deterministic fallback executes, the fixed `enrich` SHALL write the deterministically-derived `data_gaps` list into `agent_assessments[cve]["data_gaps"]` before the enrichment loop consumes it, so `EnrichedFinding.data_gaps` is non-empty when KEV or EPSS lookups returned nothing.

**Validates: Requirements 2.4**

Property 5: Bug Condition 1.5 — Per-CVE Fallback Reasons

_For any_ Agent 3 run where two or more CVEs fall back to the deterministic path, the fixed `enrich` SHALL emit `reasoning_mode = "AGENTIC_PARTIAL"` and a `fallback_reason` value that includes every fallen-back CVE's reason (either as a `"; "`-joined summary string of `"{cve}: {reason}"` entries, or in an equivalent structured field surfaced to the client).

**Validates: Requirements 2.5**

Property 6: Bug Condition 1.6 — Ticket Payloads Persisted

_For any_ Agent 4 result whose `ticket_payloads` is non-empty, `persistRiskScore` SHALL write the payload array to `scan_jobs.ticket_payloads_json` in the same `@Transactional` boundary that writes `risk_scores`.

**Validates: Requirements 2.6**

Property 7: Bug Condition 1.7 — Correct Docstring

_For any_ inspection of `agents_service/agent4_scoring.py`'s module docstring, the docstring SHALL describe the 30/35/25/20 weighting with the CVSS-normalized, EPSS-normalized, KEV-flat-25, and asset-normalized components, and SHALL NOT reference `(cvss * 0.30) + (epss * 10 * 0.35)` or the 51.5 cap.

**Validates: Requirements 2.7**

Property 8: Bug Condition 1.8 — Independent RiskScore Verification

_For any_ call `createTicket(findingId, approved)` where `riskScoreRepository.findByFinding_FindingId(findingId).isEmpty()`, the fixed method SHALL throw `SecurityException` (or a subclass thereof), regardless of the value of `approved`.

**Validates: Requirements 2.8**

Property 9: Bug Condition 1.9 — Immediate Post-Gate Refresh

_For any_ `gate.continue.clicked` event, the fixed pipeline-context handler SHALL invoke `refreshImmediate()` (bypassing the 400ms debounce) so the follow-up REST fetch observes committed state.

**Validates: Requirements 2.9**

Property 10: Preservation — Non-Bug Inputs Unchanged

_For any_ input where none of `isBugCondition_1_1 … isBugCondition_1_9` holds, the fixed system SHALL produce output identical to the original system, preserving: fingerprint grouping and 0.85 suppression threshold; the four heuristic penalty clauses; agentic-path `data_gaps`; the `AGENTIC` and `DETERMINISTIC` reasoning modes; Agent 4's numeric scores; every non-gate-continue `refresh()` call going through the 400ms debounce; the successful HTTP `createTicket` path; the pipeline stage order; and the operator-visible defaults (`LLM_ENABLE_THINKING=false`, agentic mode with NVIDIA key, port 5433).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16**

## Data Model Changes

### New Column: `scan_jobs.ticket_payloads_json`

The design adds exactly one column, in Phase 3A. It is nullable so the migration is backwards-compatible: pre-existing rows remain valid and rollback is safe.

**DDL (append to `backend/src/main/resources/schema.sql` next to the existing `ADD COLUMN IF NOT EXISTS` statements on `scan_jobs`):**

```sql
-- 3b. SCAN JOBS — persisted Agent 4 ticket payload array.
-- Written together with risk_scores in the same @Transactional boundary
-- (PipelineOrchestrator.persistRiskScore). Nullable: rows created before this
-- migration and rows for scans that produce zero payloads remain valid.
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS ticket_payloads_json JSONB;
```

`JSONB` (not `TEXT`) is used because Postgres 5433 is the target database; the `ScanJob` JPA entity declares the column as `columnDefinition = "jsonb"` and Jackson-serialized `String` content is written as a `jsonb` literal.

**JPA mapping added to `backend/src/main/java/com/vertexai/entity/ScanJob.java`:**

```java
/**
 * JSON array of Agent 4 ticket payloads (title, body, labels, priority, sla_deadline,
 * composite_risk_score). Persisted so that the exact payloads Agent 4 produced survive
 * a backend restart between the WAITING_FOR_HUMAN gate and the ticket-dispatch step.
 * Nullable: NULL for pre-migration rows and for scans where Agent 4 returned zero payloads.
 */
@Column(name = "ticket_payloads_json", columnDefinition = "jsonb")
private String ticketPayloadsJson;
```

The field is a `String` (Jackson-serialized JSON), consistent with how `stage_timings` is already handled on the same entity. Reader code (a future ticket-dispatch replay path) can deserialize with the existing `ObjectMapper`.

## Fix Implementation

### Phase 0 — Foundation (bugs 1.7, 1.3)

Phase 0 contains two independent low-risk fixes. Neither has a dependency on any other phase; both correct visible defects in isolation.

#### 0A — Agent 4 docstring (bug 1.7)

**Target file**: `agents_service/agent4_scoring.py` (lines 30–36 module docstring; also the `score_components` docstring near line 62).

**Current implementation**: The module-level docstring still describes `(cvss * 0.30) + (epss * 10 * 0.35)` capped at 51.5 with P0 unreachable, even though the code at line 62 already implements CVSS-normalized-to-30 + EPSS-normalized-to-35 + KEV-25 + asset-normalized-to-20.

**New implementation (pseudocode)**: Replace the module docstring and the `score_components` docstring with an accurate description of the 30/35/25/20 weighting.

```python
"""
Agent 4 — Composite Risk Scoring & Ticket Formatting.

Composite risk score is computed as the sum of four documented contributions,
each capped at its share of the 100-point scale:

  * CVSS  (30) — cvss / 10.0 * 30
  * EPSS  (35) — clip(epss, 0, 1) * 35
  * KEV   (25) — 25 if listed in CISA KEV else 0
  * Asset (20) — asset_criticality / 5.0 * 20

Priority bands (P0 >= 80, P1 >= 60, P2 >= 40, P3 < 40) are all reachable across
the full input range. This module also emits GitHub-issue-shaped ticket payloads
(title, body, labels, priority, sla_deadline, composite_risk_score) alongside
the scored findings.
"""

def score_components(cvss, epss, is_kev, asset_criticality):
    """
    Break the composite risk score into its four contributions.

    Weighting (out of 100):
      * CVSS  (30) — cvss / 10.0 * 30
      * EPSS  (35) — clip(epss, 0, 1) * 35
      * KEV   (25) — 25 if listed in CISA KEV else 0
      * Asset (20) — asset_criticality / 5.0 * 20

    Each numeric input is clamped to its documented range before multiplication,
    so no single dimension can exceed its share of the 100-point scale.
    """
```

**Interactions**: None. Documentation-only; no runtime behavior changes. Ships alongside 0B or independently.

**Test strategy**: `grep -q "51.5" agents_service/agent4_scoring.py` must return exit 1 after the fix; `grep -q "30/35/25/20" agents_service/agent4_scoring.py` must return exit 0. Numeric outputs of `score_components` for a canned tuple set must be bit-identical before and after. Full `pytest agents_service/tests/` must remain 24/24.

#### 0B — Scanner content sniffing (bug 1.3)

**Target file**: `backend/src/main/java/com/vertexai/service/ScanService.java` (lines 116–130 within `uploadAndStartScan`).

**Current implementation**: Assigns `scannerType` from filename keywords only; defaults to `OWASP_ZAP` when none match. Nuclei/ZAP/OpenVAS/Nmap uploads whose filenames lack the scanner keyword flow through to `OWASP_ZAP` and Agent 1 fails to parse them.

**New implementation (pseudocode)**: Add a private `detectScannerFromContent(String)` helper called only when the filename branch does not identify the scanner. Content sniffing inspects the first ~4 KB of bytes decoded as UTF-8 for scanner-specific markers.

```java
// Inside uploadAndStartScan, replace the current filename-only branch:
String content = new String(file.getBytes(), StandardCharsets.UTF_8);
String scannerType = detectScannerFromFilename(filename);
if (scannerType == null) {
    scannerType = detectScannerFromContent(content);   // NEW
}
if (scannerType == null) {
    scannerType = "OWASP_ZAP";                          // last-resort default preserved
}

// Helpers (private static on ScanService):
private static String detectScannerFromFilename(String filename) {
    if (filename == null) return null;
    if (filename.contains("nuclei") || filename.endsWith(".jsonl")) return "NUCLEI";
    if (filename.contains("openvas")) return "OPENVAS";
    if (filename.contains("nmap"))    return "NMAP";
    if (filename.contains("zap"))     return "OWASP_ZAP";
    return null;
}

private static String detectScannerFromContent(String content) {
    if (content == null || content.isEmpty()) return null;
    String head = content.substring(0, Math.min(4096, content.length())).toLowerCase();
    if (head.contains("<nmaprun") || head.contains("<nmap"))                     return "NMAP";
    if (head.contains("<openvas") || head.contains("openvas"))                   return "OPENVAS";
    if (head.contains("\"tool\":\"nuclei\"") || head.contains("template-id"))    return "NUCLEI";
    if (head.contains("\"tool\":\"zaproxy\"") || head.contains("<owasp"))        return "OWASP_ZAP";
    return null;
}
```

**Interactions**: None. Independent of every later phase. The `OWASP_ZAP` last-resort default is preserved so a completely unrecognized file still flows through to Agent 1 with the same behavior it has today.

**Test strategy**: New `ScanServiceTest` cases: (a) `report.xml` with `<nmaprun>` content → `NMAP`; (b) `findings.json` with `"tool":"nuclei"` → `NUCLEI`; (c) `nmap_scan.xml` → `NMAP` **without** `detectScannerFromContent` invocation (verify via Mockito spy on the helper) to prove filename-keyword preservation. Run `verify_pipeline_e2e.sh` to confirm 19/19.

---

### Phase 1 — Agent 2 (bugs 1.2, 1.1)

Phase 1 fixes both Agent 2 defects in a single file (`agents_service/agent2_noise.py`). 1A is applied first because 1B's per-finding heuristic calls invoke the fixed `heuristic_fp_prob`.

#### 1A — Remove 0.4x discount (bug 1.2)

**Target file**: `agents_service/agent2_noise.py`, function `heuristic_fp_prob` (line 73).

**Current implementation**: `prob = fp_rate * 0.4`, then adds four penalty contributions.

**New implementation (pseudocode)**: Drop the `* 0.4` factor; keep every penalty clause in the same order.

```python
def heuristic_fp_prob(scanner_confidence, has_cve_id, http_response_code, port_is_open, fp_rate):
    # Use fp_rate directly as the Bayesian prior. The previous `* 0.4` factor
    # under-suppressed high-FP-rate plugins (bug 1.2). Penalty clauses below are
    # unchanged in value and order.
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
```

**Interactions**: Consumed by 1B (the per-finding heuristic call in the group loop). 1A must land first so that when 1B's iterator invokes `heuristic_fp_prob`, it invokes the fixed function.

**Test strategy**: Extend `agents_service/tests/test_dedup.py` with (a) `heuristic_fp_prob(scanner_confidence=3, has_cve_id=True, http_response_code=200, port_is_open=True, fp_rate=0.5) == 0.5` after the fix (was `0.20`); (b) `fp_rate=0.0` case unchanged (regression pin — `prob = 0 + penalties`); (c) `fp_rate=1.0, all penalties=0` returns `1.0` (clamp preservation).

#### 1B — Per-finding scoring before grouping (bug 1.1)

**Target file**: `agents_service/agent2_noise.py`, function `reduce_noise` group loop (lines 130–145).

**Current implementation**: Averages `scanner_confidence`, `has_cve_id`, `http_response_code`, `port_is_open`, `historical_plugin_fp_rate` at the group level, calls `model.predict_proba` once per group, and falls back to a single `heuristic_fp_prob` call on the rounded averaged values.

**New implementation (pseudocode)**: Score each finding in the group individually (with XGBoost or the heuristic), then aggregate the per-finding probabilities via `max` (default) so a group is suppressed only when every finding in it agrees it is noise.

```python
# For each group of findings sharing a fingerprint, score every finding
# individually and aggregate. This preserves per-finding signal that the
# previous group-averaging (bug 1.1) discarded.
per_finding_probs = []
for _, f in group.iterrows():
    if model is not None:
        try:
            features = np.array([[
                f['scanner_confidence'],
                f['has_cve_id'],
                f['http_response_code'],
                f['port_is_open'],
                f['historical_plugin_fp_rate'],
            ]])
            p = float(model.predict_proba(features)[0][1])
            used_model = True
        except Exception as e:
            print(f"WARNING: XGBoost inference failed for finding ({e}); heuristic fallback.")
            p = heuristic_fp_prob(
                int(f['scanner_confidence']),
                bool(f['has_cve_id']),
                int(f['http_response_code']),
                bool(f['port_is_open']),
                float(f['historical_plugin_fp_rate']),
            )
            used_heuristic = True
    else:
        p = heuristic_fp_prob(
            int(f['scanner_confidence']),
            bool(f['has_cve_id']),
            int(f['http_response_code']),
            bool(f['port_is_open']),
            float(f['historical_plugin_fp_rate']),
        )
        used_heuristic = True
    per_finding_probs.append(p)

# Aggregate: max preserves the strongest signal — a group is suppressed only
# if every finding in it is at least 0.85 likely to be an FP.
false_positive_prob = max(per_finding_probs) if per_finding_probs else 0.0
is_suppressed = false_positive_prob > 0.85
```

**Preservation**: Fingerprint grouping (`grouped = df.groupby('fingerprint_hash')`), the `> 0.85` threshold, the `CanonicalFinding` output schema, and the `used_model` / `used_heuristic` telemetry are all untouched. When a group contains a single finding, `max([p])` returns exactly `p` — bit-identical to the pre-fix single-finding behavior that dominates the 24/24 test corpus.

**Interactions**: Depends on 1A (uses the fixed `heuristic_fp_prob`). Independent of every other phase.

**Test strategy**: New `test_dedup.py` case: two findings sharing a fingerprint with `scanner_confidence=[3, 1]`; assert the group's `false_positive_prob` equals `max(prob(conf=3), prob(conf=1))`, not `prob(avg=2)`. Single-finding groups must return the same probability as today. Full pytest suite must remain 24/24.

---

### Phase 2 — Agent 3 (bugs 1.4, 1.5)

Phase 2 fixes both Agent 3 defects in a single file (`agents_service/agent3_threat.py`). 2A and 2B touch overlapping regions of the same `enrich` function, so they are shipped in one commit; both are localized to the deterministic-fallback branch and neither touches `agent_runtime.py`.

#### 2A — Data gaps on fallback (bug 1.4)

**Target file**: `agents_service/agent3_threat.py`, agentic path around lines 424–429 and deterministic path around lines 515–520.

**Current implementation**: When the agentic path fails for a specific CVE and the deterministic path executes, `gaps` is computed locally but never written into `agent_assessments[cve]`. The downstream enrichment loop that consumes `judgement.get("data_gaps")` therefore sees an empty list.

**New implementation (pseudocode)**: Explicitly build `data_gaps` from the deterministic tool returns and store it in `agent_assessments[cve]["data_gaps"]` before the enrichment loop runs.

```python
# Inside the deterministic-fallback loop (was line ~515):
gaps: list[str] = []
if not is_kev:
    gaps.append("No KEV listing")
if epss_info.get("epss", 0.0) == 0.0:
    gaps.append("No EPSS score")

reason = fallback_reasons_by_cve.get(cve)   # dict from fix 2B below
agent_assessments[cve] = {
    "exploitability_confidence": "UNKNOWN" if gaps else "MEDIUM",
    "sources_consulted": ["CISA_KEV", "FIRST_EPSS"],
    "data_gaps": gaps,
    **({"fallback_reason": reason} if reason else {}),
}
```

The write to `agent_assessments` is what makes the existing enrichment loop pick up `judgement.get("data_gaps")` for fallen-back CVEs; the rest of the enrichment loop is untouched.

**Interactions**: Consumes `fallback_reasons_by_cve` from 2B; the two fixes are shipped in one commit. The write is only made in the deterministic-fallback branch, so agentic-successful runs continue to populate `data_gaps` from the agentic response exactly as today.

**Test strategy**: New `test_pipeline.py` case: monkeypatch `run_agent_threat_intel` so CVE-X returns `outcome={"success": False}`; monkeypatch `fetch_cisa_kev` to return `False` and `fetch_epss` to return `{"epss": 0.0}`; assert `EnrichedFinding.data_gaps == ["No KEV listing", "No EPSS score"]`. Agentic-successful runs must continue to populate `data_gaps` from the agentic response — regression assertion pins today's happy path.

#### 2B — Per-CVE fallback reasons (bug 1.5)

**Target file**: `agents_service/agent3_threat.py`, lines 386–394 (agentic failure branch).

**Current implementation**: A single loop-scoped `fallback_reason` string is overwritten on each failed iteration; the last failed CVE wins.

**New implementation (pseudocode)**: Track fallback reasons in a dict keyed by CVE ID; when `AGENTIC_PARTIAL`, emit a summary that names each fallen-back CVE.

```python
# Replace the single `fallback_reason` variable with a per-CVE dict.
fallback_reasons_by_cve: dict[str, str] = {}   # NEW
fallback_reason: str | None = None             # kept for AGENTIC-disabled runs

# Inside the agentic failure branch (was line ~384):
else:
    reason = (outcome or {}).get("fallback_reason", "agent failed")
    fallback_reasons_by_cve[cve] = reason
    print(f"WARNING: Agent 3 agentic assessment failed for {cve}: {reason}")

# After the deterministic-fallback loop (see 2A above), decide the response mode:
remaining = [c for c in unique_cves if c not in cve_intel]
if remaining:
    if reasoning_mode == "AGENTIC":
        reasoning_mode = "AGENTIC_PARTIAL"
    else:
        from agent_runtime import runtime_status
        status = runtime_status()
        fallback_reason = (
            "LLM_ENABLED is false" if not status["llm_enabled"]
            else "NVIDIA_API_KEY is not set" if not status["api_key_present"]
            else next(iter(fallback_reasons_by_cve.values()), fallback_reason)
        )

# When AGENTIC_PARTIAL, build a summary that names each fallen-back CVE:
if reasoning_mode == "AGENTIC_PARTIAL" and fallback_reasons_by_cve:
    fallback_reason = "; ".join(
        f"{cve}: {reason}" for cve, reason in fallback_reasons_by_cve.items()
    )
```

**Preservation**: When every CVE succeeds via the agentic path, `remaining` is empty and none of the new code executes; `reasoning_mode` stays `"AGENTIC"` with `fallback_reason=None`. When the agent is disabled (`LLM_ENABLED=false` or missing key), `reasoning_mode="DETERMINISTIC"` and `fallback_reasons_by_cve` is empty, so the `"; ".join(...)` block is skipped.

**Interactions**: Provides `fallback_reasons_by_cve` to 2A. The two fixes ship together in a single commit.

**Test strategy**: New `test_pipeline.py` case: monkeypatch two CVEs to fail agentically with reasons `"invalid_json"` and `"tool_timeout"`; assert `response.fallback_reason` contains both CVE IDs and both reasons. All-agentic-success case: assert `fallback_reason is None` and `reasoning_mode == "AGENTIC"` (regression pin). All-fallback case (no LLM key): assert `reasoning_mode == "DETERMINISTIC"` and `fallback_reason` explains the absent key.

---

### Phase 3 — Backend (bugs 1.6, 1.8)

Phase 3 lands the largest change in the bugfix (the new column plus its writer) and one strict-add security tightening. 3A ships first because its schema change must be validated end-to-end before further backend edits stack on top.

#### 3A — Persist ticket_payloads (bug 1.6)

**Target files**: `backend/src/main/resources/schema.sql`, `backend/src/main/java/com/vertexai/entity/ScanJob.java`, `backend/src/main/java/com/vertexai/service/PipelineOrchestrator.java`.

**Current implementation**: `PipelineOrchestrator.persistRiskScore` (lines 615–655) walks `scoredResult.get("scored_findings")` and writes to `risk_scores`. `scoredResult.get("ticket_payloads")` is never read; the payloads Agent 4 produced are discarded.

**New implementation (pseudocode)**: Three coordinated changes in one commit.

1. **Schema migration** — append to `schema.sql`:

```sql
-- 3b. SCAN JOBS — persisted Agent 4 ticket payload array.
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS ticket_payloads_json JSONB;
```

2. **Entity field** — add to `ScanJob.java`:

```java
@Column(name = "ticket_payloads_json", columnDefinition = "jsonb")
private String ticketPayloadsJson;
// with standard getter/setter, matching the existing stage_timings pattern.
```

3. **Persistence extension** — extend `persistRiskScore` to write both `risk_scores` and `ticket_payloads_json` inside the same `@Transactional` boundary:

```java
// Signature is extended to receive the scan ID:
//   protected void persistRiskScore(UUID scanId, Map<String,Object> scoredResult,
//                                   List<Map<String,Object>> findings)
// The executeStage4 call site is updated in the same commit.

// ... existing walk over scored_findings unchanged ...

// NEW (bug 1.6): persist Agent 4 ticket payloads alongside risk scores so a
// backend restart before dispatch replays the exact payloads Agent 4 produced.
Object payloadsObj = scoredResult.get("ticket_payloads");
if (payloadsObj instanceof List<?> payloadsList && !payloadsList.isEmpty()) {
    try {
        String payloadsJson = objectMapper.writeValueAsString(payloadsList);
        scanJobRepository.findById(scanId).ifPresent(job -> {
            job.setTicketPayloadsJson(payloadsJson);
            scanJobRepository.save(job);
        });
    } catch (JsonProcessingException e) {
        log.warn("Failed to serialize ticket_payloads for scan {}: {}", scanId, e.getMessage());
        // Fall through: risk_scores are still committed; ticket dispatch will
        // regenerate payloads from Agent 4 on the next run (pre-fix behavior).
    }
}
```

The catch block is deliberately non-fatal: a serialization failure must not roll back the `risk_scores` writes. In that case behavior degrades gracefully to today's behavior (payloads regenerated on dispatch).

**Preservation**: The `risk_scores` writes are byte-identical to today. `ticket_payloads_json` is written only when `ticket_payloads` is present and non-empty, so scans that produce no payloads persist NULL (never `"[]"`). The `ADD COLUMN IF NOT EXISTS` is idempotent — pre-existing rows retain `ticket_payloads_json IS NULL` and every existing constraint continues to hold.

**Interactions**: 3B does not depend on 3A. However, both are in the same phase because both are backend commits and a single backend rebuild covers both.

**Test strategy**: Migration idempotency — boot the backend against a database where `scan_jobs` already exists without the new column; verify the `ADD COLUMN IF NOT EXISTS` is idempotent and `scanJobRepository.save(...)` writes NULL when payloads are empty. End-to-end — after `verify_pipeline_e2e.sh` runs a full pipeline, assert `SELECT ticket_payloads_json FROM scan_jobs WHERE scan_id = ?` returns a non-null JSON array whose length matches Agent 4's `ticket_payloads`. Rollback — `ALTER TABLE scan_jobs DROP COLUMN IF EXISTS ticket_payloads_json` executed after the writer is removed produces no data loss. Full `verify_pipeline_e2e.sh` must remain 19/19.

#### 3B — Enforce approval boundary (bug 1.8)

**Target file**: `backend/src/main/java/com/vertexai/service/GitHubTicketingService.java` (lines 58–72 within `createTicket`).

**Current implementation**: Rejects when `approved==false`. Trusts the caller when `approved==true`. `RiskScoreRepository` is already injected on the class via the constructor but is not consulted inside `createTicket`.

**New implementation (pseudocode)**: Independently verify that a `RiskScore` row exists for `findingId` before any other side effect (before the `CanonicalVulnerability` lookup, before the GitHub REST call). Throw `SecurityException` if none exists.

```java
@Transactional
public TicketResponse createTicket(UUID findingId, boolean approved) {
    log.info("Processing ticket dispatch request for finding ID: {}, approved: {}", findingId, approved);

    // NEW (bug 1.8): Independent internal boundary — a ticket can be created
    // only when Agent 4 has already scored this finding, regardless of the
    // caller-supplied `approved` flag. Prevents direct service-layer calls
    // from bypassing the Final Human Approval gate.
    if (riskScoreRepository.findByFinding_FindingId(findingId).isEmpty()) {
        log.error("Ticket creation blocked for finding {}: no RiskScore row (Agent 4 approval marker absent)", findingId);
        throw new SecurityException(
                "Ticket creation rejected: finding has not been scored by Agent 4 (no RiskScore row).");
    }

    // Existing behavior preserved:
    if (!approved) {
        log.warn("Ticket creation blocked: Final human approval was rejected (approved=false) for finding: {}", findingId);
        throw new BadRequestException("Ticket creation rejected: Final human approval was not granted.");
    }

    // ... rest of createTicket unchanged; the existing RiskScore lookup on line ~82
    // is preserved because it still supplies priority/score/rationale.
}
```

**RiskScoreRepository injection**: The repository is already injected on the class via the existing constructor. No new constructor argument is needed; only the method body changes.

**Preservation**: The existing HTTP flow — analyst clicks approve → `POST /api/tickets/dispatch` with `approved=true` → `createTicket(findingId, true)` — always reaches `createTicket` *after* `persistRiskScore` has written the `RiskScore` row inside `executeStage4`, so the new check is a strict addition that never rejects a legitimate approval. The `BadRequestException` for `approved==false` is preserved.

**Interactions**: Independent of 3A at the code level (uses the existing `risk_scores` table, not the new column). Ships alongside 3A because both are backend commits.

**Test strategy**: New `GitHubTicketingServiceTest` cases: (a) mocked `RiskScoreRepository.findByFinding_FindingId(...)` returns `Optional.empty()`, `createTicket(anyUuid, true)` throws `SecurityException`; (b) same repository returns `Optional.of(riskScore)`, `createTicket(...)` returns a `TicketResponse` (happy path); (c) `createTicket(anyUuid, false)` with a present `RiskScore` still throws `BadRequestException` (approved-flag preservation). Full `verify_pipeline_e2e.sh` must remain 19/19 because the analyst-click path always has a persisted `RiskScore` by that point.

---

### Phase 4 — Frontend (bug 1.9)

Phase 4 fixes the single frontend defect and is the cheapest phase to roll back.

#### 4A — refreshImmediate bypass (bug 1.9)

**Target file**: `frontend/src/lib/pipeline-context.tsx` (lines 187–195 — the debounced `refresh` and its listener registration).

**Current implementation**: Every listener path (WebSocket, periodic poll, gate-continue optimistic update) funnels through the same 400ms debounce before calling `refresh()`. On the gate-continue path this means the follow-up REST fetch can land before the backend has committed the CONTINUE transaction.

**New implementation (pseudocode)**: Introduce `refreshImmediate`, which is `refresh` without the debounce; expose it alongside `refresh` on the context value. Gate handlers (`ScanReviewGate`, `FinalApprovalGate`, or wherever `pipeline-event` with `detail.status === 'CONTINUE'` is emitted) call `refreshImmediate()` directly.

```tsx
// Same body as `refresh`, no setTimeout / debounce.
const refreshImmediate = useCallback(async () => {
  if (!auth.isAuthenticated()) return;
  try {
    const id = scanIdRef.current;
    const latest = id ? await api.getScanStatus(id) : await api.getLatestScan();
    applyStatus(latest);
  } catch (err) {
    console.warn('[pipeline] immediate status refresh failed', err);
  }
}, [applyStatus]);

// Add to PipelineContextValue and to the useMemo value + deps:
//   refreshImmediate,

// The `pipeline-event` listener path KEEPS its 400ms debounce for the general
// case; only gate-continue callers switch to refreshImmediate().
```

Extend the exported context type:

```ts
export interface PipelineContextValue {
  // ... existing fields ...
  refresh: () => Promise<void>;
  refreshImmediate: () => Promise<void>;   // NEW
}
```

**Preservation**: The `refresh` API is unchanged; every existing caller of `refresh()` retains its current behavior (WebSocket rebroadcasts and periodic polls remain debounced through the 400ms timer).

**Interactions**: None. Independent of every other phase.

**Test strategy**: Jest test that renders `PipelineProvider`, calls `refreshImmediate()`, and asserts `api.getScanStatus` is invoked without waiting 400ms (using `jest.useFakeTimers()` and advancing time by 0ms). A second test dispatches a `pipeline-event` CustomEvent with `detail.status="RUNNING"` and asserts `api.getScanStatus` is *not* called until 400ms elapse (debounce preservation). Optional Playwright test: click CONTINUE at a gate and assert the UI updates within one animation frame.

## Testing Strategy

### Validation Approach

Testing follows the two-phase pattern required by the bug-condition methodology: for every bug, first surface counterexamples on the unfixed code (to confirm the root-cause hypothesis), then verify the fix works and preserves existing behavior.

The two established green baselines act as the top-level regression guard:

- `verify_pipeline_e2e.sh` must remain 19/19 after every phase.
- `pytest agents_service/tests/` must remain 24/24 after every phase.

Phase gates: each phase (0 through 4) must independently pass both baselines before the next phase merges. This is what makes each phase individually rollback-safe.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug on the unfixed code, confirming (or refuting) the root-cause hypothesis. If any hypothesis is refuted, re-hypothesize before implementing the fix.

**Test Plan**: Before each phase, add tests that assert the *incorrect* current behavior. Run them on the unfixed code — they must reproduce the defect deterministically. Then implement the fix and flip each test's assertion.

**Test Cases**:

1. **Agent 4 docstring (1.7 → Phase 0A)**: `grep -q "51.5" agents_service/agent4_scoring.py`. Today returns 0 (found); must return 1 (not found) after the fix.
2. **Backend scanner detection (1.3 → Phase 0B)**: POST an Nmap XML file named `report.xml` via `/api/scans/upload`. Today the ScanRequest carries `scannerType="OWASP_ZAP"`; must carry `"NMAP"` after the fix.
3. **Agent 2 heuristic prior (1.2 → Phase 1A)**: Call `heuristic_fp_prob(scanner_confidence=3, has_cve_id=True, http_response_code=200, port_is_open=True, fp_rate=0.5)`. Today returns `0.20`; must return `0.50` after the fix.
4. **Agent 2 averaging (1.1 → Phase 1B)**: Feed a two-finding group with `scanner_confidence=[3, 1]` to `reduce_noise`. Today the group's `false_positive_prob` is computed from `conf=2`; after the fix it equals `max(prob(conf=3), prob(conf=1))`.
5. **Agent 3 data_gaps (1.4 → Phase 2A)**: Monkeypatch the agentic path to fail for one CVE while KEV and EPSS also return empty. Today `EnrichedFinding.data_gaps` is empty; must be non-empty after the fix.
6. **Agent 3 fallback_reason overwrite (1.5 → Phase 2B)**: Monkeypatch two CVEs to fail agentically with different reasons. Today `fallback_reason` names only the last CVE's reason; must include both after the fix.
7. **Backend ticket_payloads drop (1.6 → Phase 3A)**: Run the pipeline end-to-end; query `SELECT ticket_payloads_json FROM scan_jobs WHERE scan_id = ?`. Today the column does not exist; after Phase 3A it holds Agent 4's payload array.
8. **GitHubTicketingService weak boundary (1.8 → Phase 3B)**: In a unit test, mock `RiskScoreRepository.findByFinding_FindingId(...)` to return `Optional.empty()` and call `createTicket(anyUuid, true)`. Today creates a ticket (or fails downstream on a missing vuln); must throw `SecurityException` after the fix.
9. **Frontend post-gate debounce (1.9 → Phase 4A)**: Render `PipelineProvider`, call the gate-continue emitter, and assert `api.getScanStatus` is called *within the same tick* (no 400ms wait). Today the call is delayed 400ms; must be immediate after the fix.

**Expected Counterexamples**: Bugs 1.1, 1.2, 1.4, 1.5 are numerical / data-integrity failures. Bugs 1.3, 1.6, 1.8, 1.9 are behavioral / boundary failures. Bug 1.7 is a text-grep failure. Together they cover all nine defects with concrete, deterministic reproductions.

### Fix Checking

**Goal**: Verify that for every input where a bug condition holds, the fixed system produces the expected behavior.

**Pseudocode:**

```
FOR EACH bug i IN 1..9 DO
  FOR ALL input X WHERE isBugCondition_i(X) DO
    result := fixedSystem_i(X)
    ASSERT propertyExpectedFor_i(result)
  END FOR
END FOR
```

Concretely, each test case in the previous section is executed on the fixed code with the assertion flipped: the fix must produce the expected behavior for every enumerated bug-triggering input.

### Preservation Checking

**Goal**: Verify that for every input where no bug condition holds, the fixed system produces exactly the same output as the original system.

**Pseudocode:**

```
FOR ALL input X WHERE NOT (isBugCondition_1(X) OR ... OR isBugCondition_9(X)) DO
  ASSERT originalSystem(X) = fixedSystem(X)
END FOR
```

**Testing Approach**: Two complementary strategies:

- **Baseline regression**: `verify_pipeline_e2e.sh` (19/19) and `pytest agents_service/tests/` (24/24) exercise the full non-bug input space; any regression flips a green check to red.
- **Targeted preservation tests**: Additive unit tests for each fix that specifically pin the non-buggy branch — filename with `nmap` keyword still short-circuits to `NMAP` (1.3), single-finding groups still produce the same probability (1.1), `fp_rate=0` case unchanged (1.2), all-CVEs-agentic run still emits `reasoning_mode="AGENTIC"` with `fallback_reason=None` (1.5), WebSocket rebroadcast still waits 400ms before refreshing (1.9), successful `createTicket` HTTP path still returns `TicketResponse` (1.8), Agent 4 scoring numeric output is bit-identical (1.7).

**Test Cases**:
1. **Filename-keyword preservation (1.3)**: Upload `nmap_scan.xml` → verify `scannerType="NMAP"` and `detectScannerFromContent` is never invoked (assert via spy).
2. **All-agentic-success preservation (1.5)**: Monkeypatch all CVEs to succeed agentically → verify `reasoning_mode="AGENTIC"`, `fallback_reason=None`, `fallback_reasons_by_cve` is empty.
3. **No-payload preservation (1.6)**: Force Agent 4 to return `ticket_payloads=[]` → verify `scan_jobs.ticket_payloads_json` is NULL (not `"[]"`) after `executeStage4`.
4. **Successful HTTP createTicket (1.8)**: Seed a `RiskScore` row and call `createTicket(findingId, true)` → verify `TicketResponse` is returned and `SecurityException` is not raised.
5. **WebSocket-refresh debounce (1.9)**: Emit a synthetic `pipeline-event` with `detail.status="RUNNING"` (not a CONTINUE) → verify `api.getScanStatus` is *not* called until 400ms elapse.
6. **Agent 4 numeric preservation (1.7)**: Given a fixed set of `(cvss, epss, is_kev, asset_criticality)` tuples, verify `compute_composite_risk_score` returns the same float on the fixed docstring as it did before.
7. **Agent 2 heuristic preservation (1.2 boundary)**: `fp_rate=0.0` case is unchanged (`prob = 0 + penalties` before and after).
8. **Agent 2 single-finding preservation (1.1)**: Group of size 1 → `max([p])` equals the pre-fix single-finding probability.

### Unit Tests

- `tests/test_dedup.py`: per-finding vs group-averaged XGBoost scoring; heuristic prior at `fp_rate=0`, `fp_rate=0.5`, `fp_rate=1.0`.
- `tests/test_pipeline.py`: Agent 3 fallback reasons combined across CVEs; `data_gaps` on the deterministic fallback branch.
- Java: `ScanServiceTest` (content-sniff branch and filename-keyword preservation), `PipelineOrchestratorTest` (`persistRiskScore` writes `ticket_payloads_json`, NULL preservation for empty payload arrays), `GitHubTicketingServiceTest` (`SecurityException` when no `RiskScore`; `BadRequestException` still thrown for `approved=false`).
- Frontend: Jest test for `refreshImmediate` vs `refresh` (debounced) behavior.

### Property-Based Tests

- **Agent 2 (1.1, 1.2)**: Generate random groups of 1–5 findings with random `scanner_confidence ∈ {1,2,3}`, `fp_rate ∈ [0, 1]`, and other features → assert (a) per-finding max ≥ group-averaged score in the fixed code, and (b) suppression flips only when the sum of prior and penalties exceeds `0.85`.
- **Agent 3 (1.4, 1.5)**: Generate random Agent 3 runs with 1–10 CVEs and a random subset that fails agentically → assert `reasoning_mode` is `"AGENTIC"` iff no CVE fails, `"DETERMINISTIC"` iff all fail, and `"AGENTIC_PARTIAL"` otherwise; assert `fallback_reason` mentions every fallen-back CVE ID when `AGENTIC_PARTIAL`.
- **Backend (1.3)**: Generate random filenames with and without scanner keywords over random binary content shaped like NMAP/OpenVAS/Nuclei/ZAP output → assert the detected `scannerType` matches the content marker whenever the filename is uninformative.

### Integration Tests

- **`verify_pipeline_e2e.sh` end-to-end**: run after each phase, must stay 19/19. This exercises the ingest → Agent 1 → Agent 2 → Agent 3 → Agent 4 → HITL gate → ticket path with the real backend, database, and (mocked) GitHub REST call.
- **Backend restart between gate and dispatch (1.6)**: run pipeline to `WAITING_FOR_HUMAN` at Gate 4, restart the backend, click CONTINUE. Today: pipeline fails with "in-flight agent data was lost". After Phase 3A: `ticket_payloads_json` is still readable from `scan_jobs`, and a future dispatch-replay path can consume it. (This integration test documents the substrate; the replay path itself is out of scope for this bugfix.)
- **Frontend gate-continue latency (1.9)**: Playwright test that clicks CONTINUE at a gate and asserts the UI updates within one animation frame (< 50 ms), not after 400 ms.

## Cross-Cutting Preservation Contracts

### 19/19 E2E Baseline Preservation

Every phase must be verified against `verify_pipeline_e2e.sh` before merging. Phase 0A is documentation-only. Phase 0B preserves the `OWASP_ZAP` last-resort default so any file that used to be miscategorized is still miscategorized the same way if it lacks both filename and content markers. Phase 1 preserves the `CanonicalFinding` schema and the `> 0.85` threshold; downstream stages see identical data shapes. Phase 2 changes only the metadata fields (`data_gaps`, `fallback_reason`) that the E2E script does not assert numerically. Phase 3A adds a nullable side-write; scans with no payloads persist NULL. Phase 3B is a strict-add pre-condition that the E2E script's flow already satisfies (`persistRiskScore` runs before `createTicket`). Phase 4 keeps `refresh` semantics identical for every non-gate caller.

### 24/24 Agent Test Baseline Preservation

`pytest agents_service/tests/` covers Agents 1–4 and `agent_runtime.py`. Phase 0A is documentation-only. Phase 1's per-finding scoring reproduces the group-level score exactly when the group has a single finding (the common case in the test corpus). Phase 2 leaves `agent_runtime.py` untouched and only adds new `agent_assessments` entries on the deterministic-fallback path — no existing test exercises multi-CVE agentic failures, so the new behavior is additive. Phases 0B, 3, and 4 do not touch `agents_service/`.

### Backwards-Compatible DB Migration

The `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS ticket_payloads_json JSONB` statement in Phase 3A is idempotent and nullable. Pre-existing rows retain `ticket_payloads_json IS NULL` and continue to satisfy every existing constraint. The rollback is a no-op DDL `ALTER TABLE scan_jobs DROP COLUMN IF EXISTS ticket_payloads_json` executed only after the writer is removed (Phase 3A rollback in order: revert JPA field and writer first, then drop the column).

### `LLM_ENABLE_THINKING=false` Default Preserved

Nothing in this design reads or writes `LLM_ENABLE_THINKING`. Agent 3's `runtime_status()` continues to be consulted only in the existing `LLM_ENABLED` / `NVIDIA_API_KEY` branch. The env variable's default value in `.env.example` is not modified.

### Agentic Mode Default Preserved (NVIDIA Nemotron key)

Agent 3's precedence logic (`reasoning_mode = "AGENTIC"` when the agent succeeds for every CVE, downgrade to `"AGENTIC_PARTIAL"` when some fall back, hard `"DETERMINISTIC"` when the LLM is disabled or the key is missing) is preserved; the fix only changes *what data* is attached to a fallen-back CVE, not whether the agentic path is taken.

### Port 5433 Preserved

No file touched by this design contains a hard-coded `5432`. The `docker-compose.yml`, `application.yml`, `.env.example`, and every JDBC URL continue to point at `5433`. The Phase 3A `ALTER TABLE` runs against the same `scan_jobs` table on the same 5433 instance.

## Phase Order Rationale

The Phase 0 → 1 → 2 → 3 → 4 order (Foundation → Agent 2 → Agent 3 → Backend → Frontend) is chosen for four reasons:

1. **Cheapest-and-safest first.** Phase 0's two fixes (0A docstring, 0B content sniffing) have zero blast radius on the runtime data path: 0A cannot break anything (it edits comments), and 0B only activates on files that would otherwise be misclassified as `OWASP_ZAP` — the failure mode it replaces was already broken, so any deviation is strictly an improvement. Shipping these first lets us validate the deployment pipeline and the two baselines are stable before we touch anything more consequential.

2. **Agent-side before backend-side.** Phases 1 and 2 change Python-side code only. They don't touch the backend, database, or frontend, and their outputs (`CanonicalFinding` from Agent 2, `EnrichedFinding` from Agent 3) preserve their schemas. Doing agent-side work before backend work means a Phase-3 rollback doesn't force us to also revert Agent 2 or Agent 3 code.

3. **Backend before frontend for the highest-risk phase.** Phase 3 is the widest phase and the one that adds a schema column. It must be shipped and validated end-to-end (including the `ADD COLUMN IF NOT EXISTS` idempotency check and the write path) before the frontend consumes any new state. Phase 4 (frontend) is cheapest-to-roll-back and highest-user-visibility, so it lands last.

4. **Sub-order within Phase 1.** 1A (`heuristic_fp_prob` prior) must land before 1B (per-finding scoring) because 1B's group loop invokes `heuristic_fp_prob` for the model-unavailable path; shipping 1B before 1A would carry the `* 0.4` bug forward into a code path that today doesn't call `heuristic_fp_prob` at all (the pre-fix `reduce_noise` uses one call on averaged values). Sub-order within Phase 2 is a single commit (2A and 2B share `fallback_reasons_by_cve`). Sub-order within Phase 3 is 3A → 3B, with 3A first because it establishes the schema column and the JPA entity change; 3B is a pure code addition that does not depend on 3A.

## Rollback Plan

Each phase is independently revertible. The rollback recipe below assumes a clean git checkout at the tip of the phase; substitute the actual commit range as needed.

### Phase 0 rollback

- **0A (docstring)**: `git revert <phase-0a-commit>`. That is the entire rollback. No runtime effect. `verify_pipeline_e2e.sh` stays 19/19, `pytest` stays 24/24.
- **0B (content sniffing)**: `git revert <phase-0b-commit>` — removes the two helper methods and restores the filename-only branch in `uploadAndStartScan`. Files whose names do not include a scanner keyword revert to being misclassified as `OWASP_ZAP`, exactly as they were before the fix. No data loss (upload-time decision only).

### Phase 1 rollback (Agent 2)

- **1B rollback first, then 1A**: `git revert <phase-1b-commit>` restores the group-averaged XGBoost call; `git revert <phase-1a-commit>` restores `prob = fp_rate * 0.4`. Rollback order matters because 1B invokes the fixed `heuristic_fp_prob`; reverting 1A alone would leave 1B calling a function that no longer exists in its current form. Restart `agents_service`; rerun `pytest agents_service/tests/` (must return to 24/24). No data loss: Agent 2 is stateless.

### Phase 2 rollback (Agent 3)

`git revert <phase-2-commit>` — restores the single `fallback_reason` scalar and drops the `data_gaps` write on the deterministic branch. Restart `agents_service`; rerun the agent test suite. No data loss: `EnrichedFinding.data_gaps` values written before rollback are already delivered to the client and stored in downstream Agent 4 inputs.

### Phase 3 rollback (Backend)

Sub-phases can be rolled back independently, but 3A must be rolled back in order: writer first, then entity field, then column.

- **3B rollback**: revert the commit; the `SecurityException` guard is removed. Direct service-layer calls with `approved=true` once again bypass the Agent 4 check. Only rollback if a legitimate production caller is inadvertently blocked. No data loss.
- **3A rollback (in order)**:
  1. Revert the `PipelineOrchestrator.persistRiskScore` extension so no writer references `ticket_payloads_json`. `ticket_payloads_json` is no longer written; existing rows retain whatever value was last written; new scans get NULL. Safe.
  2. Revert the `ScanJob` JPA field addition.
  3. Apply `ALTER TABLE scan_jobs DROP COLUMN IF EXISTS ticket_payloads_json;` against every environment.
  4. Restart the backend; `verify_pipeline_e2e.sh` must stay 19/19.

Data loss on full 3A rollback: any `ticket_payloads_json` values previously written are dropped. Because no reader consumes the column in this bugfix, the loss is invisible to end users.

### Phase 4 rollback (Frontend)

`git revert <phase-4-commit>` — removes `refreshImmediate` from the context value and the gate-continue call sites. Rebuild the frontend; users see the previous 400ms lag on gate-continue but nothing else changes. No data loss: frontend state is transient.

### Full-Bugfix Rollback

If the entire feature must be reverted (worst case), roll back in reverse order: Phase 4 → 3B → 3A → 2 → 1B → 1A → 0B → 0A. Between each revert, run `verify_pipeline_e2e.sh` to confirm the intermediate state is stable. Every intermediate state has been chosen to be a valid, shippable configuration of the system.
