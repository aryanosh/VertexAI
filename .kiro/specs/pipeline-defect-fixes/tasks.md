# Implementation Plan

This plan implements the nine defect fixes described in `design.md` across five phases (0 → 4), followed by an end-to-end verification phase (5). Every fix pairs a **Bug Condition Exploration Test** (must FAIL on unfixed code) with a **Preservation Check** (must PASS on unfixed code) before the implementation lands, then re-runs both after the fix to confirm the bug is resolved and no regression is introduced.

The two green baselines — `verify_pipeline_e2e.sh` (19/19) and `pytest agents_service/tests/` (24/24) — act as the top-level regression guard and must hold after every phase.

---

## Overview

This plan implements a five-phase fix strategy across **nine defects** in the pipeline, followed by an end-to-end verification phase. Phases 0 through 4 each land one or more independently revertible fixes; Phase 5 runs the integration and build gates that protect the two green baselines. Every bug pairs a **Bug Condition Exploration Test** (must FAIL on unfixed code) with a **Preservation Property Test** (must PASS on unfixed code) before the implementation lands, then re-runs both after the fix to confirm the bug is resolved and no regression is introduced.

**Baselines to preserve after every phase:**

- `verify_pipeline_e2e.sh` — 19/19 end-to-end checks (Ingest → Agent 1 → Agent 2 → Agent 3 → Agent 4 → HITL gate → Ticketing).
- `pytest agents_service/tests/` — 24/24 agent-runtime tests.

**Phase breakdown (9 bugs across Phases 0–4, verification in Phase 5):**

- **Phase 0 — Foundation** (independent, parallel): 0A Agent 4 docstring rewrite (bug 1.7) and 0B ScanService content sniffing (bug 1.3).
- **Phase 1 — Agent 2** (1A before 1B): 1A drop `0.4x` discount in `heuristic_fp_prob` (bug 1.2), then 1B per-finding XGBoost scoring in `reduce_noise` (bug 1.1).
- **Phase 2 — Agent 3** (single commit): 2A propagate `data_gaps` on fallback (bug 1.4) and 2B per-CVE `fallback_reasons_by_cve` dict (bug 1.5).
- **Phase 3 — Backend** (3A before 3B): 3A `ticket_payloads_json` schema + writer (bug 1.6), then 3B SecurityException guard in `createTicket` (bug 1.8).
- **Phase 4 — Frontend**: 4A `refreshImmediate` bypass on gate-continue (bug 1.9).
- **Phase 5 — Verification**: pytest 24/24, `verify_pipeline_e2e.sh` 19/19, `mvn package`, frontend build, and the cross-phase checkpoint.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 1,
      "tasks": ["0A", "0B"],
      "dependsOn": [],
      "description": "Independent foundation — Agent 4 docstring rewrite (0A, bug 1.7) and ScanService content sniffing (0B, bug 1.3). No dependencies; can run in parallel."
    },
    {
      "id": 2,
      "tasks": ["1A"],
      "dependsOn": [1],
      "description": "Remove 0.4x discount from heuristic_fp_prob (bug 1.2)."
    },
    {
      "id": 3,
      "tasks": ["1B"],
      "dependsOn": [2],
      "description": "Per-finding scoring in reduce_noise (bug 1.1). Depends on 1A because 1B's per-finding heuristic path calls the fixed heuristic_fp_prob."
    },
    {
      "id": 4,
      "tasks": ["2"],
      "dependsOn": [3],
      "description": "Agent 3 single commit — 2A (data_gaps propagation on fallback, bug 1.4) and 2B (per-CVE fallback_reasons_by_cve dict, bug 1.5) combined because they share the fallback_reasons_by_cve state."
    },
    {
      "id": 5,
      "tasks": ["3A"],
      "dependsOn": [4],
      "description": "Schema + writer — first backend change. ticket_payloads_json column, JPA field, and persistRiskScore writer (bug 1.6)."
    },
    {
      "id": 6,
      "tasks": ["3B"],
      "dependsOn": [5],
      "description": "SecurityException guard in createTicket (bug 1.8). No code dependency on 3A but ships in the same phase after 3A validates."
    },
    {
      "id": 7,
      "tasks": ["4A"],
      "dependsOn": [6],
      "description": "Frontend refreshImmediate bypass on gate-continue (bug 1.9)."
    },
    {
      "id": 8,
      "tasks": ["26", "27", "28", "29", "30"],
      "dependsOn": [7],
      "description": "Phase 5 verification gates — pytest 24/24, verify_pipeline_e2e.sh 19/19, mvn package, frontend build, cross-phase checkpoint."
    }
  ]
}
```

Cross-phase ordering (from design "Phase Order Rationale"): Phase 0 → 1 → 2 → 3 → 4 → 5. Each phase is independently shippable and independently revertible; every intermediate state is a valid, deployable configuration.

---

## Tasks

## Phase 0 — Foundation

### 0A — Agent 4 docstring rewrite (bug 1.7)

- [ ] 1. Bug condition exploration test for Agent 4 docstring drift
  - **Property 1: Bug Condition** - Docstring References Old Formula
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the docstring still references the old formula.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the stale-docstring counterexample from bug 1.7.
  - **Scoped PBT Approach**: Bug 1.7 is deterministic (file contents); scope the property to concrete grep assertions on the module file.
  - Add a test (in `agents_service/tests/test_docstrings.py` or equivalent) that reads `agents_service/agent4_scoring.py` and asserts the module docstring:
    - does NOT contain the substring `51.5`
    - does NOT contain the substring `(cvss * 0.30) + (epss * 10 * 0.35)`
    - DOES contain the substring `30/35/25/20` (or an equivalent breakdown of CVSS 30 / EPSS 35 / KEV 25 / Asset 20)
  - Equivalent shell check: `grep -q "51.5" agents_service/agent4_scoring.py` must return exit 0 (found) on unfixed code.
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the docstring drift exists)
  - Document counterexample: docstring at lines 30–36 still references `(cvss * 0.30) + (epss * 10 * 0.35)` and the 51.5 cap.
  - Mark task complete when test is written, run, and failure is documented.
  - _Design: Phase 0A_
  - _Requirements: 1.7_

- [ ] 2. Preservation property test for Agent 4 numeric scoring
  - **Property 2: Preservation** - Numeric Scoring Bit-Identical
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, `compute_composite_risk_score(cvss=9.8, epss=0.5, is_kev=True, asset_criticality=4.0)` returns a specific float. Record it.
  - Observe: same for `(cvss=5.0, epss=0.1, is_kev=False, asset_criticality=2.0)` and `(cvss=0.0, epss=0.0, is_kev=False, asset_criticality=1.0)` and `(cvss=10.0, epss=1.0, is_kev=True, asset_criticality=5.0)`.
  - Write property-based test (using Hypothesis) that asserts, for arbitrary `(cvss ∈ [0, 10], epss ∈ [0, 1], is_kev ∈ {True, False}, asset_criticality ∈ [1, 5])`, the fixed function returns the same float as a pinned-golden reference table captured from the unfixed run.
  - Verify test passes on UNFIXED code (baseline capture).
  - _Design: Phase 0A "Preservation" — Agent 4's numeric scoring remains bit-identical (change is documentation-only)._
  - _Requirements: 3.7_

- [ ] 3. Fix 0A — Rewrite Agent 4 module and `score_components` docstrings
  - Target file: `agents_service/agent4_scoring.py` (module docstring at lines 30–36; `score_components` docstring near line 62).
  - Replace the module-level docstring with the design's 30/35/25/20 description (see design.md → Phase 0A pseudocode).
  - Replace the `score_components` docstring with the design's four-contribution breakdown.
  - No code path is modified. Only the two docstring blocks.
  - _Bug_Condition: isBugCondition_1_7(module) — module.path = "agents_service/agent4_scoring.py" AND module.docstring_references_old_formula()_
  - _Expected_Behavior: The docstring describes 30/35/25/20 weighting with correct component formulas and 0–100 range; does NOT reference `(cvss * 0.30) + (epss * 10 * 0.35)` or the 51.5 cap._
  - _Preservation: Numeric output of `score_components` and `compute_composite_risk_score` is bit-identical (Requirement 3.7)._
  - _Design: Phase 0A_
  - _Requirements: 1.7, 2.7, 3.7_

  - [ ] 3.1 Verify exploration test now passes
    - **Property 1: Expected Behavior** - Docstring Matches Current Implementation
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Run docstring exploration test.
    - **EXPECTED OUTCOME**: Test PASSES (confirms `51.5` and old formula are gone and `30/35/25/20` breakdown is present)
    - _Requirements: 2.7_

  - [ ] 3.2 Verify Agent 4 numeric preservation still holds
    - **Property 2: Preservation** - Numeric Scoring Bit-Identical
    - **IMPORTANT**: Re-run the SAME test from task 2 — do NOT write new tests
    - Run preservation property test.
    - **EXPECTED OUTCOME**: Tests PASS (confirms scoring numbers unchanged)
    - _Requirements: 3.7_

### 0B — ScanService content sniffing (bug 1.3)

- [ ] 4. Bug condition exploration test for filename-only scanner detection
  - **Property 1: Bug Condition** - Scanner Type Defaulted To OWASP_ZAP For Uninformative Filename
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms `scannerType` defaults to `OWASP_ZAP` when the filename lacks a keyword.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the misdetection counterexample from bug 1.3.
  - **Scoped PBT Approach**: Scope the property to concrete `(filename, content) → expected scannerType` triples: `("report.xml", "<nmaprun ...", "NMAP")`, `("findings.json", "\"tool\":\"nuclei\" ...", "NUCLEI")`, `("output.txt", "OpenVAS Report ...", "OPENVAS")`, `("scan.log", "<owasp ...", "OWASP_ZAP")`.
  - Add `ScanServiceTest` cases in `backend/src/test/java/com/vertexai/service/ScanServiceTest.java` that:
    1. Upload a `MultipartFile` with name `report.xml` and body `<nmaprun ...`. Assert the resulting `ScanRequest.scannerType == "NMAP"`.
    2. Upload with name `findings.json` and body `{"tool":"nuclei", ...}`. Assert `scannerType == "NUCLEI"`.
  - Run tests on UNFIXED code.
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — proves the filename-only branch defaults to `OWASP_ZAP`)
  - Document counterexamples: `report.xml` with nmap content classified as `OWASP_ZAP`; Agent 1 subsequently fails to parse.
  - _Design: Phase 0B_
  - _Requirements: 1.3_

- [ ] 5. Preservation property test for filename-keyword short-circuit
  - **Property 2: Preservation** - Filename Keyword Skips Content Sniffing
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, `nmap_scan.xml` uploads produce `scannerType == "NMAP"`; `zap_findings.json` produces `OWASP_ZAP`; `nuclei_output.jsonl` produces `NUCLEI`; `openvas_scan.txt` produces `OPENVAS`.
  - Write property-based test that generates random filenames drawn from `{nmap, zap, nuclei, openvas} × {random-suffix}` and asserts the detected `scannerType` equals the filename-keyword-implied scanner, regardless of content bytes.
  - Add an assertion (using Mockito spy on `ScanService.detectScannerFromContent`) that `detectScannerFromContent` is NEVER invoked when the filename contains a scanner keyword.
  - Verify tests PASS on UNFIXED code (baseline is filename-only detection with these keywords).
  - _Design: Phase 0B "Preservation" — filenames with scanner keyword skip content sniffing (bug 1.3 preservation)._
  - _Requirements: 3.3_

- [ ] 6. Fix 0B — Add `detectScannerFromContent` helper and wire it into `uploadAndStartScan`
  - Target file: `backend/src/main/java/com/vertexai/service/ScanService.java` (method `uploadAndStartScan`, lines 116–130).
  - Extract the existing filename-branch into a private static helper `detectScannerFromFilename(String filename)` returning `null` when no keyword matches.
  - Add a new private static helper `detectScannerFromContent(String content)` that inspects the first 4 KB of UTF-8 content (case-insensitive) for the markers listed in the design: `<nmaprun` / `<nmap` → `NMAP`; `<openvas` / `openvas` → `OPENVAS`; `"tool":"nuclei"` / `template-id` → `NUCLEI`; `"tool":"zaproxy"` / `<owasp` → `OWASP_ZAP`.
  - In `uploadAndStartScan`, call filename detection first; if it returns `null`, call content detection; if that also returns `null`, retain the `OWASP_ZAP` last-resort default.
  - _Bug_Condition: isBugCondition_1_3(upload) — NOT filenameContainsScannerKeyword(upload.filename) AND fileContentImpliesNonZapScanner(upload.bytes)_
  - _Expected_Behavior: For any upload with an uninformative filename whose bytes contain a schema marker, `scannerType` matches the content marker (Requirement 2.3)._
  - _Preservation: Filenames containing a scanner keyword bypass content sniffing entirely (Requirement 3.3); the `OWASP_ZAP` last-resort default is preserved for files that match neither branch._
  - _Design: Phase 0B_
  - _Requirements: 1.3, 2.3, 3.3_

  - [ ] 6.1 Verify exploration test now passes
    - **Property 1: Expected Behavior** - Content-Sniffed Scanner Type
    - **IMPORTANT**: Re-run the SAME tests from task 4 — do NOT write new tests
    - Run scanner-detection exploration tests.
    - **EXPECTED OUTCOME**: Tests PASS (`report.xml` → `NMAP`, `findings.json` → `NUCLEI`, etc.)
    - _Requirements: 2.3_

  - [ ] 6.2 Verify filename-keyword preservation still holds
    - **Property 2: Preservation** - Filename Keyword Short-Circuits
    - **IMPORTANT**: Re-run the SAME tests from task 5 — do NOT write new tests
    - Run preservation tests including the Mockito spy assertion.
    - **EXPECTED OUTCOME**: Tests PASS (`nmap_scan.xml` still classified as `NMAP` without invoking content sniffing)
    - _Requirements: 3.3_

---

## Phase 1 — Agent 2

Phase 1 fixes both Agent 2 defects in `agents_service/agent2_noise.py`. **1A must land before 1B** because 1B's per-finding heuristic path invokes the fixed `heuristic_fp_prob`.

### 1A — Remove 0.4x discount from `heuristic_fp_prob` (bug 1.2)

- [ ] 7. Bug condition exploration test for 0.4x FP-rate discount
  - **Property 1: Bug Condition** - Heuristic Prior Under-Suppresses High-FP Plugins
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms `prob = fp_rate * 0.4` is the current prior.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where a `fp_rate=0.5` plugin with clean penalties reaches only `0.20` instead of `0.50`.
  - **Scoped PBT Approach**: Scope to the concrete failing case first: `heuristic_fp_prob(scanner_confidence=3, has_cve_id=True, http_response_code=200, port_is_open=True, fp_rate=0.5) == 0.5`. Then generalize with Hypothesis over `fp_rate ∈ [0, 1]` while pinning all penalty inputs to their zero-contribution values, asserting `result == fp_rate`.
  - Add test in `agents_service/tests/test_dedup.py`.
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code returns `0.20`, not `0.50`)
  - Document counterexample: `fp_rate=0.5` with clean penalties reaches `0.20` — well under the 0.85 suppression threshold, so high-FP plugins are not suppressed.
  - _Design: Phase 1A_
  - _Requirements: 1.2_

- [ ] 8. Preservation property test for heuristic penalty clauses
  - **Property 2: Preservation** - Penalty Clauses Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, `heuristic_fp_prob(scanner_confidence=1, has_cve_id=False, http_response_code=404, port_is_open=False, fp_rate=0.0)` returns `0 + 0.3 + 0.2 + 0.15 + 0.2 = 0.85`. Record.
  - Observe: `heuristic_fp_prob(scanner_confidence=2, has_cve_id=True, http_response_code=200, port_is_open=True, fp_rate=0.0)` returns `0 + 0.1 = 0.1`.
  - Observe: `heuristic_fp_prob(scanner_confidence=3, has_cve_id=True, http_response_code=200, port_is_open=True, fp_rate=1.0)` returns `min(0.4, 1.0) = 0.4` today (was `1.0 * 0.4`).
  - Write Hypothesis-based property test: for any `fp_rate=0.0`, the result equals exactly the sum of penalty contributions (no prior term); each penalty clause fires independently on its input predicate; the `min(prob, 1.0)` clamp is preserved.
  - Verify tests PASS on UNFIXED code for the `fp_rate=0.0` case (regression pin — the four penalty clauses are unchanged by 1A).
  - _Design: Phase 1A "Preservation" — penalty clauses are unchanged in value and order (Requirement 3.2)._
  - _Requirements: 3.2_

- [ ] 9. Fix 1A — Remove 0.4x factor from `heuristic_fp_prob`
  - Target file: `agents_service/agent2_noise.py`, function `heuristic_fp_prob` (line 71 onward; the `prob = fp_rate * 0.4` initialization at line 73).
  - Change the initializer from `prob = fp_rate * 0.4` to `prob = fp_rate`.
  - Do not modify any penalty clause, their order, or the final `min(prob, 1.0)` clamp.
  - Add a code comment referencing bug 1.2 explaining that `fp_rate` is used as the Bayesian prior directly.
  - _Bug_Condition: isBugCondition_1_2(plugin) — plugin.fp_rate > 0_
  - _Expected_Behavior: `prob = fp_rate` is used as the prior; penalty clauses (no-CVE +0.3, low-confidence +0.2/+0.1, HTTP 404 +0.15, closed-port +0.2) are added on top (Requirement 2.2)._
  - _Preservation: Penalty contributions and their order remain unchanged; 0.85 suppression threshold at the call site remains unchanged (Requirement 3.2)._
  - _Design: Phase 1A_
  - _Requirements: 1.2, 2.2, 3.2_

  - [ ] 9.1 Verify exploration test now passes
    - **Property 1: Expected Behavior** - Prior Equals `fp_rate`
    - **IMPORTANT**: Re-run the SAME test from task 7 — do NOT write a new test
    - Run heuristic exploration tests.
    - **EXPECTED OUTCOME**: Test PASSES (`fp_rate=0.5` with clean penalties returns `0.50`)
    - _Requirements: 2.2_

  - [ ] 9.2 Verify penalty-clause preservation still holds
    - **Property 2: Preservation** - Penalty Clauses Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 8 — do NOT write new tests
    - Run preservation tests for `fp_rate=0.0` and clamp behavior.
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.2_

### 1B — Per-finding scoring in `reduce_noise` (bug 1.1)

- [ ] 10. Bug condition exploration test for group-averaged XGBoost features
  - **Property 1: Bug Condition** - Averaged Features Discard Per-Finding Signal
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the group-level average is fed to XGBoost.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where a two-finding group with `scanner_confidence=[3, 1]` produces `false_positive_prob` computed from `conf=2` (average) instead of `max(p(conf=3), p(conf=1))`.
  - **Scoped PBT Approach**: Scope to concrete groups first: `[{conf=3, has_cve=True}, {conf=1, has_cve=False}]` sharing a fingerprint. Assert the group's `false_positive_prob` equals `max` of per-finding predictions in the FIXED expectation. Then generalize with Hypothesis: any group of 2–5 findings where `stddev(scanner_confidence) > 0` must produce `false_positive_prob = max(per_finding_probs)`, not the averaged-features probability.
  - Add test in `agents_service/tests/test_dedup.py`.
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code averages features first)
  - Document counterexample with concrete predicted-probability values for both the averaged and the per-finding paths.
  - _Design: Phase 1B_
  - _Requirements: 1.1_

- [ ] 11. Preservation property test for single-finding groups and fingerprint schema
  - **Property 2: Preservation** - Single-Finding Group Score And Schema Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, a group of size 1 produces `false_positive_prob = p` where `p` is exactly the XGBoost / heuristic prediction for that finding's features. Record the score for a canned single-finding input.
  - Observe: `CanonicalFinding` output schema fields (`fingerprint_hash`, `false_positive_prob`, `is_suppressed`, `used_model`, `used_heuristic`, ...) exactly as emitted today. Record for a small representative fixture.
  - Write Hypothesis-based property test: for any group of size 1, `false_positive_prob` equals the per-finding prediction (bit-identical to the group-averaged prediction when N=1). The `> 0.85` suppression threshold is preserved. The `CanonicalFinding` schema shape is preserved.
  - Verify tests PASS on UNFIXED code (single-finding groups dominate the 24/24 test corpus).
  - _Design: Phase 1B "Preservation" — fingerprint grouping, `> 0.85` threshold, `CanonicalFinding` schema, `used_model` / `used_heuristic` telemetry unchanged (Requirement 3.1)._
  - _Requirements: 3.1_

- [ ] 12. Fix 1B — Move XGBoost inference to per-finding scoring, aggregate via `max`
  - Target file: `agents_service/agent2_noise.py`, function `reduce_noise` (group loop at lines 130–145).
  - Replace the group-level average and single `model.predict_proba` call with an inner loop that iterates every finding in the group and computes a per-finding probability using XGBoost (with a heuristic fallback for the `except Exception` branch, matching today's fallback semantics).
  - Aggregate the per-finding probabilities into the group's `false_positive_prob` via `max(per_finding_probs)`.
  - Preserve `used_model` / `used_heuristic` telemetry: set `used_model=True` if any finding in the group used XGBoost successfully; set `used_heuristic=True` if any finding fell back to the heuristic.
  - Keep `is_suppressed = false_positive_prob > 0.85` unchanged.
  - _Bug_Condition: isBugCondition_1_1(group) — size(group.findings) > 1 AND stddev(group.findings.scanner_confidence) > 0_
  - _Expected_Behavior: Each finding scored individually; group aggregation via `max` preserves per-finding signal; fingerprint grouping and 0.85 threshold unchanged (Requirement 2.1)._
  - _Preservation: Single-finding groups produce identical output; `CanonicalFinding` schema unchanged; heuristic path invokes fixed `heuristic_fp_prob` from 1A (Requirement 3.1)._
  - _Design: Phase 1B_
  - _Requirements: 1.1, 2.1, 3.1_

  - [ ] 12.1 Verify exploration test now passes
    - **Property 1: Expected Behavior** - Per-Finding Max Aggregation
    - **IMPORTANT**: Re-run the SAME test from task 10 — do NOT write a new test
    - Run averaging exploration tests.
    - **EXPECTED OUTCOME**: Test PASSES (`false_positive_prob == max(p(conf=3), p(conf=1))` for the two-finding group)
    - _Requirements: 2.1_

  - [ ] 12.2 Verify single-finding preservation still holds
    - **Property 2: Preservation** - Single-Finding Score And Schema Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 11 — do NOT write new tests
    - Run preservation tests.
    - **EXPECTED OUTCOME**: Tests PASS (size-1 groups bit-identical, `CanonicalFinding` schema unchanged)
    - _Requirements: 3.1_

  - [ ] 12.3 Run full `pytest agents_service/tests/`
    - Must return 24/24. Any regression here indicates a schema or single-finding behavior drift.
    - _Requirements: 3.12_

---

## Phase 2 — Agent 3 (single commit)

Phase 2 ships bugs 1.4 and 1.5 in a **single commit** because 2A's `data_gaps` write and 2B's `fallback_reason` handling share the `fallback_reasons_by_cve` dict introduced by 2B.

- [ ] 13. Bug condition exploration test for missing `data_gaps` on fallback
  - **Property 1: Bug Condition** - `data_gaps` Empty When Agentic Fails And KEV/EPSS Missing
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms `data_gaps` stays empty on the deterministic-fallback branch.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where an agentic-failed CVE with missing KEV and EPSS still reports `data_gaps=[]`.
  - **Scoped PBT Approach**: Scope to a concrete monkeypatched run: one CVE, `run_agent_threat_intel` returns `outcome={"success": False}`, `fetch_cisa_kev` returns `False`, `fetch_epss` returns `{"epss": 0.0}`. Assert `EnrichedFinding.data_gaps == ["No KEV listing", "No EPSS score"]` in the FIXED expectation.
  - Add test in `agents_service/tests/test_pipeline.py`.
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code returns `data_gaps=[]`)
  - Document counterexample: `agent_assessments[cve]["data_gaps"]` is never written on the deterministic-fallback branch (design cites lines 424–429 and 515–520).
  - _Design: Phase 2A_
  - _Requirements: 1.4_

- [ ] 14. Bug condition exploration test for overwritten `fallback_reason`
  - **Property 1: Bug Condition** - Single `fallback_reason` Overwritten Across CVEs
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms only the last fallen-back CVE's reason survives.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where two CVEs fall back with different reasons but only one reason is reported.
  - **Scoped PBT Approach**: Scope to a concrete two-CVE run: monkeypatch CVE-A to fail agentically with reason `"invalid_json"`, CVE-B with `"tool_timeout"`. Assert `response.reasoning_mode == "AGENTIC_PARTIAL"` and `response.fallback_reason` includes both CVE IDs and both reasons in the FIXED expectation.
  - Add test in `agents_service/tests/test_pipeline.py`.
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code reports only `"tool_timeout"` — the last iteration's value)
  - Document counterexample: the loop-scoped `fallback_reason` scalar is overwritten on each failed iteration.
  - _Design: Phase 2B_
  - _Requirements: 1.5_

- [ ] 15. Preservation property test for all-agentic-success and all-deterministic modes
  - **Property 2: Preservation** - `reasoning_mode` Precedence And Agentic `data_gaps`
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, a run where every CVE succeeds agentically emits `reasoning_mode="AGENTIC"` with `fallback_reason=None`. Record.
  - Observe: a run with `LLM_ENABLED=false` (or no NVIDIA key) emits `reasoning_mode="DETERMINISTIC"`. Record.
  - Observe: an agentic-successful CVE has `data_gaps` populated from the agentic response verbatim (schema and values). Record for a small fixture.
  - Write Hypothesis-based property test: for any run where no CVE fails agentically, `reasoning_mode="AGENTIC"` and `fallback_reason is None`; for any run where every CVE fails, `reasoning_mode="DETERMINISTIC"`; the agentic-path `data_gaps` are populated exactly as today.
  - Verify tests PASS on UNFIXED code.
  - _Design: Phase 2 "Preservation" — Requirements 3.4 (agentic path unchanged) and 3.5 (mode precedence unchanged)._
  - _Requirements: 3.4, 3.5_

- [ ] 16. Fix Phase 2 — Propagate `data_gaps` and per-CVE `fallback_reasons_by_cve` (bugs 1.4, 1.5)
  - Target file: `agents_service/agent3_threat.py`, agentic-failure branch (lines 386–394) and deterministic-fallback branch (lines 424–429 and 515–520).
  - This is a single commit because 2A and 2B share state.

  - [ ] 16.1 Add `fallback_reasons_by_cve` dict and populate on agentic failure (2B)
    - Introduce `fallback_reasons_by_cve: dict[str, str] = {}` at the top of the agentic loop.
    - In the agentic-failure `else` branch (~line 384), assign `fallback_reasons_by_cve[cve] = (outcome or {}).get("fallback_reason", "agent failed")` before logging the warning.
    - Do NOT remove the existing `fallback_reason` scalar variable; it remains as the mode-summary field for the `DETERMINISTIC` branch (see 16.3).
    - _Design: Phase 2B_
    - _Bug_Condition: isBugCondition_1_5(run) — count(run.cves_that_fell_back) >= 2_
    - _Requirements: 1.5, 2.5_

  - [ ] 16.2 Write `data_gaps` into `agent_assessments[cve]` on deterministic-fallback branch (2A)
    - In the deterministic-fallback loop (~line 515), build `gaps: list[str]` explicitly:
      - Append `"No KEV listing"` when `is_kev` is `False`.
      - Append `"No EPSS score"` when `epss_info.get("epss", 0.0) == 0.0`.
    - Write `agent_assessments[cve] = {"exploitability_confidence": "UNKNOWN" if gaps else "MEDIUM", "sources_consulted": ["CISA_KEV", "FIRST_EPSS"], "data_gaps": gaps, **({"fallback_reason": fallback_reasons_by_cve[cve]} if fallback_reasons_by_cve.get(cve) else {})}`.
    - Do NOT change the agentic-success path — it continues to populate `data_gaps` from the agentic response.
    - _Design: Phase 2A_
    - _Bug_Condition: isBugCondition_1_4(cve, run) — run.agentic_failed_for(cve) AND (run.kev_lookup_failed(cve) OR run.epss_lookup_failed(cve))_
    - _Requirements: 1.4, 2.4_

  - [ ] 16.3 Decide response `reasoning_mode` and emit summary `fallback_reason`
    - After the fallback loop, compute `remaining = [c for c in unique_cves if c not in cve_intel]`.
    - If `remaining` is non-empty and `reasoning_mode` was `"AGENTIC"`, set `reasoning_mode = "AGENTIC_PARTIAL"`.
    - Else if `remaining` is non-empty and `reasoning_mode` is not `"AGENTIC"`, consult `agent_runtime.runtime_status()` to set `fallback_reason` (`"LLM_ENABLED is false"` / `"NVIDIA_API_KEY is not set"` / first entry of `fallback_reasons_by_cve`).
    - When `reasoning_mode == "AGENTIC_PARTIAL"` and `fallback_reasons_by_cve` is non-empty, set `fallback_reason = "; ".join(f"{cve}: {reason}" for cve, reason in fallback_reasons_by_cve.items())`.
    - _Design: Phase 2B_
    - _Requirements: 2.5, 3.5_

  - _Bug_Condition: isBugCondition_1_4 OR isBugCondition_1_5 (see individual sub-tasks above)_
  - _Expected_Behavior: `EnrichedFinding.data_gaps` is populated from failed KEV/EPSS lookups on the deterministic-fallback branch (2.4); `AGENTIC_PARTIAL` `fallback_reason` names every fallen-back CVE (2.5)._
  - _Preservation: Agentic path `data_gaps` unchanged (3.4); `AGENTIC` / `DETERMINISTIC` mode precedence unchanged (3.5); `agent_runtime.py` untouched._
  - _Design: Phase 2 (2A + 2B)_
  - _Requirements: 1.4, 1.5, 2.4, 2.5, 3.4, 3.5_

  - [ ] 16.4 Verify exploration tests now pass
    - **Property 1: Expected Behavior** - `data_gaps` And `AGENTIC_PARTIAL` Summary
    - **IMPORTANT**: Re-run the SAME tests from tasks 13 and 14 — do NOT write new tests
    - Run both Phase 2 exploration tests.
    - **EXPECTED OUTCOME**: Both tests PASS
    - _Requirements: 2.4, 2.5_

  - [ ] 16.5 Verify agentic-success and deterministic-only preservation still holds
    - **Property 2: Preservation** - Mode Precedence And Agentic `data_gaps`
    - **IMPORTANT**: Re-run the SAME test from task 15 — do NOT write new tests
    - Run preservation tests.
    - **EXPECTED OUTCOME**: Tests PASS (`AGENTIC` / `DETERMINISTIC` precedence intact; agentic `data_gaps` unchanged)
    - _Requirements: 3.4, 3.5_

---

## Phase 3 — Backend

**3A ships before 3B** because 3A's schema change is the largest single change in the bugfix and must be validated end-to-end before further backend edits stack on top.

### 3A — Persist `ticket_payloads_json` (bug 1.6)

- [ ] 17. Bug condition exploration test for dropped `ticket_payloads`
  - **Property 1: Bug Condition** - Ticket Payloads Not Persisted
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms Agent 4's `ticket_payloads` array is dropped by `persistRiskScore`.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where a full pipeline run produces payloads that never reach the database.
  - **Scoped PBT Approach**: Scope to a concrete integration test: run `verify_pipeline_e2e.sh` to `WAITING_FOR_HUMAN`, then execute `SELECT ticket_payloads_json FROM scan_jobs WHERE scan_id = ?`. In the FIXED expectation, the value is a non-null JSON array whose length equals `agent4Result.ticket_payloads.length()`.
  - Add `PipelineOrchestratorTest` case in `backend/src/test/java/com/vertexai/service/PipelineOrchestratorTest.java` that constructs a fake `scoredResult` with `ticket_payloads = [{"title": "..."}]`, calls `persistRiskScore(scanId, scoredResult, findings)`, and asserts `scanJobRepository.findById(scanId).get().getTicketPayloadsJson()` equals the Jackson-serialized JSON.
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code drops payloads; column does not yet exist so getter returns `null` or the entity field is absent)
  - Document counterexample.
  - _Design: Phase 3A_
  - _Requirements: 1.6_

- [ ] 18. Preservation property test for `risk_scores` writes and empty-payload NULL semantics
  - **Property 2: Preservation** - `risk_scores` Byte-Identical; NULL For Empty Payloads
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, `persistRiskScore` writes N `risk_scores` rows for a `scored_findings` of length N with exact `(finding_id, composite_score, priority_band, reasoning)` values. Record for a small fixture.
  - Observe: existing `scan_jobs` rows have all current columns populated; schema migration must not break these.
  - Write property-based test: for any `scoredResult` where `ticket_payloads` is absent OR is an empty list, `scan_jobs.ticket_payloads_json` MUST be `NULL` (not `"[]"`, not `""`). The `risk_scores` writes MUST be bit-identical to the unfixed run.
  - Add migration-idempotency test: apply `schema.sql` twice; the second apply MUST NOT error (`ADD COLUMN IF NOT EXISTS` semantics).
  - Verify tests PASS on UNFIXED code for the `risk_scores` side; skip the `ticket_payloads_json` NULL check until Phase 3A lands (column does not yet exist).
  - _Design: Phase 3A "Preservation" — `risk_scores` byte-identical (3.6); nullable / backwards-compatible migration (3.13)._
  - _Requirements: 3.6, 3.13_

- [ ] 19. Fix 3A — Add `ticket_payloads_json` column, JPA field, and writer
  - Three coordinated changes in one commit.

  - [ ] 19.1 Append `ticket_payloads_json` migration to `schema.sql`
    - Target file: `backend/src/main/resources/schema.sql`.
    - Append (next to the existing `ADD COLUMN IF NOT EXISTS` block on `scan_jobs`): `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS ticket_payloads_json JSONB;`
    - Idempotent DDL; nullable; safe against pre-existing rows.
    - _Requirements: 2.6, 3.6, 3.13_

  - [ ] 19.2 Add `ticketPayloadsJson` field to `ScanJob` entity
    - Target file: `backend/src/main/java/com/vertexai/entity/ScanJob.java`.
    - Add `@Column(name = "ticket_payloads_json", columnDefinition = "jsonb") private String ticketPayloadsJson;` with standard getter/setter, matching the existing `stage_timings` pattern.
    - Field is a `String` (Jackson-serialized JSON), same pattern as `stage_timings`.
    - _Requirements: 2.6_

  - [ ] 19.3 Extend `PipelineOrchestrator.persistRiskScore` to write payloads
    - Target file: `backend/src/main/java/com/vertexai/service/PipelineOrchestrator.java` (method around line 511, walk over `scored_findings` around lines 615–655).
    - Change method signature to accept `UUID scanId` as the first argument (update the `executeStage4` call site in the same commit).
    - After the existing `risk_scores` walk, read `scoredResult.get("ticket_payloads")`. If it is a non-empty `List`, serialize via the injected `ObjectMapper` and call `scanJobRepository.findById(scanId).ifPresent(job -> { job.setTicketPayloadsJson(payloadsJson); scanJobRepository.save(job); })`.
    - Wrap the serialization in a `try / catch (JsonProcessingException e)` that logs and falls through so `risk_scores` writes are still committed (graceful degradation to today's regenerate-on-dispatch behavior).
    - The entire method remains `@Transactional`; the payload write commits together with `risk_scores`.
    - _Requirements: 1.6, 2.6, 3.6_

  - _Bug_Condition: isBugCondition_1_6(agent4_result) — agent4_result.ticket_payloads IS NOT EMPTY_
  - _Expected_Behavior: `scan_jobs.ticket_payloads_json` holds Agent 4's payload array after `executeStage4` completes (Requirement 2.6)._
  - _Preservation: `risk_scores` writes are byte-identical; empty payload arrays leave `ticket_payloads_json` as `NULL`; pre-existing rows unaffected; migration is idempotent (Requirements 3.6, 3.13)._
  - _Design: Phase 3A_
  - _Requirements: 1.6, 2.6, 3.6, 3.13_

  - [ ] 19.4 Verify exploration test now passes
    - **Property 1: Expected Behavior** - Payload Array Persisted
    - **IMPORTANT**: Re-run the SAME test from task 17 — do NOT write a new test
    - Run integration test.
    - **EXPECTED OUTCOME**: Test PASSES (`scan_jobs.ticket_payloads_json` is non-null and matches Agent 4's payload array length)
    - _Requirements: 2.6_

  - [ ] 19.5 Verify `risk_scores` preservation and NULL semantics
    - **Property 2: Preservation** - `risk_scores` Byte-Identical; NULL For Empty
    - **IMPORTANT**: Re-run the SAME tests from task 18 — do NOT write new tests
    - Run preservation tests and migration-idempotency test.
    - **EXPECTED OUTCOME**: Tests PASS (`risk_scores` unchanged; empty payloads persist NULL; double-apply migration is a no-op)
    - _Requirements: 3.6, 3.13_

### 3B — SecurityException guard in `createTicket` (bug 1.8)

- [ ] 20. Bug condition exploration test for weak internal boundary
  - **Property 1: Bug Condition** - `createTicket` Accepts Missing `RiskScore` When `approved=true`
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms `createTicket(findingId, true)` does not independently verify a `RiskScore` row.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where a direct service-layer call with `approved=true` bypasses the Agent 4 approval gate.
  - **Scoped PBT Approach**: Scope to a concrete unit test using Mockito: mock `RiskScoreRepository.findByFinding_FindingId(anyUuid)` to return `Optional.empty()`. Call `createTicket(anyUuid, true)`. In the FIXED expectation, `SecurityException` is thrown.
  - Add `GitHubTicketingServiceTest` case in `backend/src/test/java/com/vertexai/service/GitHubTicketingServiceTest.java`.
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code proceeds past the check and either creates a ticket or fails downstream on the missing `CanonicalVulnerability`)
  - Document counterexample: caller-supplied `approved=true` is trusted without an independent `RiskScore` presence check.
  - _Design: Phase 3B_
  - _Requirements: 1.8_

- [ ] 21. Preservation property test for happy-path and `approved=false` handling
  - **Property 2: Preservation** - HTTP Happy Path And `BadRequestException` Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, `createTicket(findingId, true)` returns a `TicketResponse` when the finding has a persisted `RiskScore` and the mocked GitHub REST call succeeds. Record.
  - Observe: `createTicket(findingId, false)` with a present `RiskScore` throws `BadRequestException` (`"Ticket creation rejected: Final human approval was not granted."`). Record the exception type and message.
  - Write test cases: (a) with mocked `Optional.of(riskScore)` and `approved=true`, expect `TicketResponse`; (b) with mocked `Optional.of(riskScore)` and `approved=false`, expect `BadRequestException`.
  - Verify tests PASS on UNFIXED code.
  - _Design: Phase 3B "Preservation" — successful HTTP path unchanged (3.8); `BadRequestException` for `approved=false` preserved._
  - _Requirements: 3.8_

- [ ] 22. Fix 3B — Add SecurityException guard in `GitHubTicketingService.createTicket`
  - Target file: `backend/src/main/java/com/vertexai/service/GitHubTicketingService.java`, method `createTicket` (lines 58–72).
  - At the very top of the method (before the `approved` check, before any `CanonicalVulnerability` lookup, before the GitHub REST call), call `riskScoreRepository.findByFinding_FindingId(findingId)`.
  - If the returned `Optional` is empty, log an error naming the finding ID and throw `new SecurityException("Ticket creation rejected: finding has not been scored by Agent 4 (no RiskScore row).")`.
  - Preserve the existing `if (!approved) throw new BadRequestException(...)` branch immediately after the new guard.
  - Preserve the existing `RiskScore` lookup later in the method (used for priority / score / rationale).
  - No new constructor arguments — `riskScoreRepository` is already injected on the class.
  - _Bug_Condition: isBugCondition_1_8(call) — call.method = "createTicket" AND call.approved = true AND NOT riskScoreRepository.findByFinding_FindingId(call.findingId).isPresent()_
  - _Expected_Behavior: `SecurityException` is thrown whenever no `RiskScore` exists, regardless of `approved`'s value (Requirement 2.8)._
  - _Preservation: The HTTP happy path (always has a persisted `RiskScore` by that point) continues to return `TicketResponse`; the `approved=false` branch continues to throw `BadRequestException` (Requirement 3.8)._
  - _Design: Phase 3B_
  - _Requirements: 1.8, 2.8, 3.8_

  - [ ] 22.1 Verify exploration test now passes
    - **Property 1: Expected Behavior** - `SecurityException` On Missing `RiskScore`
    - **IMPORTANT**: Re-run the SAME test from task 20 — do NOT write a new test
    - Run the missing-RiskScore unit test.
    - **EXPECTED OUTCOME**: Test PASSES (`SecurityException` is thrown)
    - _Requirements: 2.8_

  - [ ] 22.2 Verify happy path and `approved=false` preservation still holds
    - **Property 2: Preservation** - HTTP Happy Path And `BadRequestException` Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 21 — do NOT write new tests
    - Run preservation tests.
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.8_

---

## Phase 4 — Frontend

### 4A — `refreshImmediate` bypass on gate-continue (bug 1.9)

- [ ] 23. Bug condition exploration test for post-gate debounce
  - **Property 1: Bug Condition** - Gate-Continue Refresh Delayed 400ms
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms every listener path is debounced.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample where clicking CONTINUE at a pipeline gate takes 400ms to trigger `api.getScanStatus`.
  - **Scoped PBT Approach**: Scope to a concrete Jest test with `jest.useFakeTimers()`. Render `PipelineProvider`. Dispatch a `pipeline-event` `CustomEvent` with `detail.status === 'CONTINUE'`. Assert (in the FIXED expectation) that `api.getScanStatus` is invoked without advancing timers.
  - Add Jest test in `frontend/src/lib/__tests__/pipeline-context.test.tsx` (create the file if needed).
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (unfixed code funnels through the 400ms `setTimeout`; `api.getScanStatus` is not called until timers advance)
  - Document counterexample.
  - _Design: Phase 4A_
  - _Requirements: 1.9_

- [ ] 24. Preservation property test for WebSocket / periodic-poll debounce
  - **Property 2: Preservation** - Non-Gate Refresh Remains Debounced
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, a `pipeline-event` with `detail.status === 'RUNNING'` (a periodic-poll or WebSocket rebroadcast payload) triggers `api.getScanStatus` only after 400ms elapse. Record.
  - Observe: two `pipeline-event` bursts within 400ms coalesce into a single `api.getScanStatus` call.
  - Write Jest tests: (a) dispatch a non-CONTINUE `pipeline-event`, do not advance timers, assert `api.getScanStatus` was NOT called; (b) advance timers by 400ms, assert it WAS called; (c) burst two events within 200ms, advance to 400ms after the second, assert exactly one `api.getScanStatus` call.
  - Verify tests PASS on UNFIXED code (baseline debounce behavior).
  - _Design: Phase 4A "Preservation" — WebSocket and periodic-poll refreshes remain debounced (Requirement 3.9)._
  - _Requirements: 3.9_

- [ ] 25. Fix 4A — Add `refreshImmediate` and wire gate-continue handlers
  - Target file: `frontend/src/lib/pipeline-context.tsx` (lines 187–195 — the debounced `refresh` and its listener registration).
  - Add a new `refreshImmediate = useCallback(async () => { ... }, [applyStatus])` with the same body as `refresh` but without the `setTimeout` / debounce wrapper.
  - Extend `PipelineContextValue` interface with `refreshImmediate: () => Promise<void>`.
  - Add `refreshImmediate` to the `useMemo` context value and to its dep array.
  - Update the `pipeline-event` listener path to call `refreshImmediate()` when `detail.status === 'CONTINUE'`; retain the 400ms debounce for every other status.
  - Update gate-continue call sites (`ScanReviewGate`, `FinalApprovalGate`, or wherever `pipeline-event` with `status:'CONTINUE'` is emitted) to call `refreshImmediate()` directly instead of relying on the debounced listener path.
  - _Bug_Condition: isBugCondition_1_9(event) — event.type = "gate.continue.clicked"_
  - _Expected_Behavior: `refreshImmediate()` bypasses the 400ms debounce so the follow-up REST fetch observes committed state (Requirement 2.9)._
  - _Preservation: `refresh` API unchanged for every existing caller; WebSocket rebroadcasts and periodic polls remain debounced through the 400ms timer (Requirement 3.9)._
  - _Design: Phase 4A_
  - _Requirements: 1.9, 2.9, 3.9_

  - [ ] 25.1 Verify exploration test now passes
    - **Property 1: Expected Behavior** - Immediate Refresh On CONTINUE
    - **IMPORTANT**: Re-run the SAME test from task 23 — do NOT write a new test
    - Run gate-continue Jest test.
    - **EXPECTED OUTCOME**: Test PASSES (`api.getScanStatus` invoked without advancing timers)
    - _Requirements: 2.9_

  - [ ] 25.2 Verify debounce preservation still holds
    - **Property 2: Preservation** - Non-Gate Refresh Remains Debounced
    - **IMPORTANT**: Re-run the SAME tests from task 24 — do NOT write new tests
    - Run debounce preservation tests.
    - **EXPECTED OUTCOME**: Tests PASS (non-CONTINUE events still wait 400ms; bursts still coalesce)
    - _Requirements: 3.9_

---

## Phase 5 — Verification

Phase 5 runs after every prior phase is complete and green in isolation. These are the integration and build-verification gates that protect the two established baselines and confirm the fixes hold end-to-end.

- [ ] 26. Run `pytest agents_service/tests/` — must return 24/24
  - Command: `pytest agents_service/tests/ -v`
  - Full agent-runtime test suite must pass. Any failure indicates a regression introduced by Phase 0A, 1A, 1B, or 2 (agent-side phases). Investigate before proceeding.
  - Acceptance: 24 passed, 0 failed.
  - _Design: Cross-Cutting Preservation Contracts — 24/24 Agent Test Baseline Preservation._
  - _Requirements: 3.12_

- [ ] 27. Run `verify_pipeline_e2e.sh` — must return 19/19
  - Command: `bash verify_pipeline_e2e.sh` (or the equivalent script location in the repository).
  - Full end-to-end pipeline (Ingest → Agent 1 → Agent 2 → Agent 3 → Agent 4 → HITL gate → Ticketing) must pass every check. Confirms Phase 0B, 3A, 3B integrate correctly with the running Postgres and backend.
  - Acceptance: 19 passed, 0 failed.
  - _Design: Cross-Cutting Preservation Contracts — 19/19 E2E Baseline Preservation._
  - _Requirements: 3.10, 3.11_

- [ ] 28. Backend build — `mvn compile` and full `mvn package`
  - Command: `mvn -f backend/pom.xml clean compile` then `mvn -f backend/pom.xml -DskipTests=false package`.
  - Both must succeed with zero errors. Warnings other than pre-existing ones must be reviewed but do not block the phase.
  - Confirms Phase 3A schema entity + writer and Phase 3B SecurityException guard compile cleanly and the unit test suite passes under Maven.
  - Acceptance: `BUILD SUCCESS` from both commands.
  - _Design: Phase 3 — 3A and 3B integrate cleanly into the backend build._
  - _Requirements: 1.6, 1.8, 2.6, 2.8, 3.6, 3.8, 3.13_

- [ ] 29. Frontend build — `npm run build` and `tsc --noEmit`
  - Commands (in `frontend/`): `npm run build` and `npx tsc --noEmit`.
  - Both must succeed. TypeScript type-check must pass with zero errors. Next.js build must produce a runnable bundle.
  - Confirms Phase 4A's new `refreshImmediate` on `PipelineContextValue` is exported and consumed with correct types by every gate handler.
  - Acceptance: build exits 0; `tsc --noEmit` exits 0.
  - _Design: Phase 4A — `refreshImmediate` typed on the context value._
  - _Requirements: 1.9, 2.9, 3.9_

- [ ] 30. Checkpoint — Ensure all tests and builds pass across every phase
  - Confirm 24/24 agent tests, 19/19 E2E checks, `mvn package BUILD SUCCESS`, and green frontend build.
  - Confirm every exploration test flipped from FAIL (on unfixed code) to PASS (on fixed code).
  - Confirm every preservation test still PASSES on fixed code.
  - Confirm operator-visible defaults are preserved: `LLM_ENABLE_THINKING=false`, agentic mode enabled when the NVIDIA Nemotron key is present, Postgres on port 5433, pipeline stage order (Ingest → Agent 1 → Agent 2 → Agent 3 → Agent 4 → Ticketing) unchanged.
  - Confirm the DB migration is backwards-compatible: `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS ticket_payloads_json JSONB` is idempotent; rollback is a no-op DDL.
  - Ensure all tests pass; ask the user if questions arise.
  - _Design: Cross-Cutting Preservation Contracts — Full Suite._
  - _Requirements: 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16_

---

## Notes

- **Independent revertibility.** Every fix in Phases 0 through 4 is independently revertible per the design's rollback plan; no phase's revert requires unwinding earlier or later phases. Each intermediate state is a valid, deployable configuration.
- **Exploration test contract.** Every exploration test MUST FAIL on unfixed code (the failure confirms the bug exists) and MUST PASS on fixed code (the pass confirms the fix resolves the bug). Do not modify the test between the two runs — only the code under test changes.
- **Preservation test contract.** Every preservation test MUST PASS on both unfixed and fixed code. The unfixed pass captures the baseline behavior; the fixed pass confirms no regression was introduced.
- **Postgres port.** Do NOT reintroduce hardcoded port `5432`. Port `5433` is authoritative across `.env`, `docker-compose.yml`, and every service configuration. Any diff that adds `5432` fails review.
- **Operator-visible defaults.** Preserve `LLM_ENABLE_THINKING=false` as the default. Preserve agentic mode as the default when the NVIDIA API key is present (agentic-successful runs must continue to emit `reasoning_mode="AGENTIC"` with `fallback_reason=None`).
- **Phase ordering.** Ship phases strictly in order `0 → 1 → 2 → 3 → 4 → 5`. Each phase MUST pass every Phase 5 gate (24/24 pytest, 19/19 E2E, `mvn package` `BUILD SUCCESS`, green frontend build) before the next phase is merged.
