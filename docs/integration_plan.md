# VertexAI — Integration Plan

> **Authoritative sources**: `implementation_plan.md` (system specification) and `team_integration_plan.md` (team division). This document explains **how** the 4 teams / 8 developers build independently and merge into one working system. It does not redefine any API, agent, table, or workflow — it only sequences and operationalizes what those two documents already specify.
>
> If anything below appears to conflict with `implementation_plan.md`, `implementation_plan.md` wins. Stop and raise a `CONFLICT`, do not guess.

---

## 1. Team Ownership Boundaries

| Team | Owns (exclusive unless noted) | Stack |
| :--- | :--- | :--- |
| **Team 1** — Core Backend & Data | `backend/`, `schema.sql` content, sole `GitHubTicketingService.java` client. Shares `database/` infra with Team 4. | Java 17, Spring Boot 3, PostgreSQL 16, Spring Security, JPA |
| **Team 2** — AI Engine & Threat Intel | `agents_service/` (Agents 1–4) | Python 3.11, FastAPI, pandas, XGBoost, scikit-learn, xmltodict, `httpx` |
| **Team 3** — Security Dashboard & UI | `frontend/` | Next.js 14, React 18, Tailwind CSS, Anime.js, Chart.js, MSW/`json-server` |
| **Team 4** — DevOps, Scanners & E2E | `sample_reports/`, `docker-compose.yml`, `.github/workflows/ci-cd.yml`, root `README.md`, root `.env.example`, `docs/demo_script.md`, `scripts/test_e2e_pipeline.sh` | Docker, Nmap, Nuclei, OWASP ZAP, OpenVAS, GitHub Actions |

**Rule**: No team edits another team's owned files or directories. If your work seems to require it, that need must be satisfied through a documented contract (API, data schema, or handoff report) — not a direct edit. If no contract covers it, stop and raise a `CONFLICT`.

**Shared ownership**: `database/` — Team 1 owns `schema.sql` content; Team 4 owns the `postgres` container/infra definition inside `docker-compose.yml`. Neither team unilaterally changes the 7-table schema.

---

## 2. Developer Responsibilities (8 Developers)

| Team | Dev | Responsibility |
| :--- | :--- | :--- |
| Team 1 | Dev 1 | JPA entities & REST controllers |
| Team 1 | Dev 2 | `GitHubTicketingService.java` + risk/ticket persistence |
| Team 2 | Dev 3 | Agent 1 (Parser/Normalizer) & Agent 3 (`httpx`/KEV/EPSS) |
| Team 2 | Dev 4 | Agent 2 (XGBoost dedup) & Agent 4 (Scoring/Ticket Prep) |
| Team 3 | Dev 5 | Layout, Flow View, Live Timeline |
| Team 3 | Dev 6 | HITL checkpoints (Continue/Stop controls, Final Approval UI) |
| Team 4 | Dev 7 | Scanner sandbox, sample reports, Docker Compose |
| Team 4 | Dev 8 | E2E test harness & CI/CD |

Each developer works only within their team's owned paths and only on their assigned responsibility. Overlaps within a team (e.g., both Team 1 devs touching `backend/`) are resolved by normal PR review inside that team — not by this document.

---

## 3. GitHub Repository & Branch Strategy

**Monorepo structure** (per `implementation_plan.md` §20):
```
sentinelai/
├── .github/workflows/ci-cd.yml   (Team 4)
├── backend/                      (Team 1)
├── agents_service/               (Team 2)
├── frontend/                     (Team 3)
├── database/                     (Team 1 & Team 4, shared infra)
├── sample_reports/               (Team 4)
├── docker-compose.yml            (Team 4)
├── README.md                     (Team 4)
├── .env.example                  (Team 4)
└── docs/demo_script.md           (Team 4)
```

**Branches**:
- `main` — protected, production. Must always compile and pass all CI checks.
- `develop` — integration branch. All four teams merge here first.
- `feature/<team>-<short-description>` — one branch per unit of work, e.g. `feature/backend-asset-api`, `feature/agent1-zap-parser`, `feature/ui-flow-view`, `feature/docker-compose-setup`.

**Flow**: developer → `feature/*` branch → PR into `develop` → (after all 4 teams' work is present in `develop` and integration-tested) → PR from `develop` into `main`.

No developer pushes directly to `develop` or `main`.

---

## 4. API Contracts Between Teams (Frozen)

Source: `implementation_plan.md` §13. **Owner: Team 1.** Consumed by: Team 3 (all), Team 4 (E2E harness).

| Method | Endpoint | Purpose | Auth/Role |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | Authenticate, issue JWT | Public |
| POST | `/api/assets` | Register asset | Admin/Analyst |
| GET | `/api/assets` | List assets | Authenticated |
| POST | `/api/scans` | Trigger multi-scanner pipeline | Admin/Analyst |
| GET | `/api/scans/{id}` | Scan status + current HITL checkpoint/agent output | Authenticated |
| POST | `/api/scans/{id}/control` | HITL control action: `{action: "CONTINUE" \| "STOP"}` → `{status: WAITING_FOR_HUMAN \| STOPPED}` | Analyst |
| GET | `/api/vulnerabilities` | List canonical findings (query: `severity`, `priority`) | Authenticated |
| GET | `/api/dashboard` | Dashboard metrics (`security_score`, `top_threats`, ...) | Authenticated |
| POST | `/api/vulnerabilities/{id}/accept-risk` | Approve accepted risk | Admin |
| POST | `/api/vulnerabilities/{id}/ticket` | **Final Human Approval** → dispatches GitHub Issue via `GitHubTicketingService.java`. Request: `{approved: true}`. Response: `{ticket_url, status}` | Admin/Analyst |

Also owned by Team 1: `ws://localhost:8080/ws/pipeline` (see §9).

**Rule**: endpoint paths, methods, request/response fields, and field types above are frozen. No `/v2`, no renamed fields, no convenience endpoints. Team 3 and Team 4 consume this surface exactly as written; if actual backend behavior diverges, that is a `CONFLICT` against Team 1, not something to silently adapt around.

---

## 5. AI-Agent Input/Output Contracts

Source: `implementation_plan.md` §5, §10, §11. **Owner: Team 2.** Consumed by: Team 1 (backend orchestrates calls via `agent/` gateway package).

| Endpoint | Input | Output | Human Gate |
| :--- | :--- | :--- | :--- |
| `POST /api/v1/agent1/parse` | Raw scanner reports (XML/JSON/JSONL) | `UnifiedFinding[]` (logical) | Yes |
| `POST /api/v1/agent2/reduce-noise` | `UnifiedFinding[]` | `CanonicalFinding[]` (logical), with `false_positive_prob`, `is_suppressed` | Yes |
| `POST /api/v1/agent3/enrich` | `CanonicalFinding[]` | Enriched findings (CISA KEV, EPSS, NVD, Exploit-DB) | Yes |
| `POST /api/v1/agent4/score-and-ticket` | Enriched findings + asset context | Composite score, priority, SLA, rationale, **prepared ticket payload** (no GitHub call) | **Final Approval** |

Base URL: `http://python-agents:8000` (Docker network). Port `8000` per `docker-compose.yml`.

**CanonicalFinding schema** (frozen, `implementation_plan.md` — shared by Team 1, Team 2, Team 3 identically):
```json
{
  "finding_id": "string (UUID)",
  "fingerprint_hash": "string (MD5)",
  "cve_id": "string",
  "vulnerability_name": "string",
  "target_host": "string",
  "target_port": "integer",
  "scanner_sources": ["NMAP", "NUCLEI", "OWASP_ZAP"],
  "false_positive_prob": "float (0.0 to 1.0)",
  "is_suppressed": "boolean",
  "is_accepted_risk": "boolean",
  "is_cisa_kev": "boolean",
  "epss_score": "float (0.0 to 1.0)",
  "composite_risk_score": "float (0.0 to 100.0)",
  "priority_level": "P0_CRITICAL | P1_HIGH | P2_MEDIUM | P3_LOW",
  "sla_deadline": "ISO-8601 Timestamp",
  "explainable_rationale": "string"
}
```
This exact field set must be identical across Team 1 (persists/returns it), Team 2 (produces it), and Team 3 (renders it). Any team needing a different shape raises a `CONFLICT` — it does not fork the schema.

**Fingerprint formula** (Team 2, exact): `MD5(target_host + ":" + target_port + ":" + cve_id + ":" + endpoint_path)`

**Composite Risk Score formula** (Team 2, exact): `(CVSS × 0.30) + (EPSS × 10 × 0.35) + KEV_Bonus + (Asset_Criticality × 4.0)`, KEV_Bonus = +25.0 if CISA KEV listed else 0.0.

**SLA tiers** (exact): P0 80.0–100.0 → 24h · P1 60.0–79.9 → 72h · P2 40.0–59.9 → 14d · P3 0.0–39.9 → 30d.

**HTTP client rule (resolved)**: Team 2 uses `httpx` for all external calls (CISA KEV, EPSS, NVD). `requests` is prohibited. This was an open conflict in earlier drafts and is now resolved by `implementation_plan.md` — no `OPEN DECISION` remains here.

**GitHub client rule**: Team 2 must never implement a GitHub API client. `GitHubTicketingService.java` (Team 1) is the sole caller of the GitHub REST API, invoked only after Final Human Approval via `POST /api/vulnerabilities/{id}/ticket`.

---

## 6. Database Integration Rules

Source: `implementation_plan.md` §14. **Owner: Team 1** (schema content) / **Team 4** (container infra).

Exactly seven tables, no more:
1. `users`
2. `assets`
3. `scan_jobs`
4. `canonical_vulnerabilities`
5. `vulnerability_intelligence`
6. `risk_scores`
7. `risk_tickets`

**Explicitly forbidden as tables**: `raw_results`, `normalized_findings`, `threat_intel`, `threat_intel_cache`, `human_reviews`, `agent_states`, `pipeline_states`. Where these terms appear in narrative sections of either source document, they are logical/in-memory concepts only:
- `raw_results` → in-flight data between scanner output and Agent 1, never persisted.
- `normalized_findings` → in-memory `UnifiedFinding[]` inside Agent 2, never persisted.
- `threat_intel` / `threat_intel_cache` → maps onto columns of `vulnerability_intelligence`; no separate cache table.
- `human_reviews` / `agent_states` / `pipeline_states` → HITL runtime state lives in application/API/WebSocket layers only (see §9), never in the database.

**Rule**: Team 1 authors `backend/src/main/resources/schema.sql` with exactly these seven tables (verbatim DDL from `implementation_plan.md` §14). Team 4 wires the `postgres` service in `docker-compose.yml` (image `postgres:16-alpine`, db `sentinelai_db`, user `sentinel_user`, port `5432:5432`) but does not author schema content. Any other team needing new persisted state must raise a `CONFLICT` — it does not add a table.

---

## 7. Frontend ↔ Spring Boot Integration

**Team 3 consumes, Team 1 provides.**

- Base URL: `http://localhost:8080` via `NEXT_PUBLIC_API_URL` env var.
- Team 3 consumes exactly the endpoints in §4, with the exact `CanonicalFinding` fields in §5, rendered without renaming.
- **Integration switch-over**: while Team 1's backend is incomplete, Team 3 develops against MSW or `json-server` mocking the same contract. At integration time, Team 3 disables the mock and points `NEXT_PUBLIC_API_URL` at the real backend.
- **CORS**: Team 1 must enable CORS for `http://localhost:3000`. If CORS blocks Team 3, that is a `CONFLICT` raised against Team 1 — Team 3 does not add a proxy workaround.
- **HITL UI**: Continue/Stop controls call `POST /api/scans/{id}/control` exactly as defined in §4/§9. Team 3 does not invent alternate control endpoints or WebSocket command names.
- **Ticket display rule**: the dashboard must never show a ticket as created before Final Human Approval succeeds. Timeline text after Agent 4 must read: *"Agent 4 risk score generated → Final human approval pending → GitHub ticket created after approval"* (verbatim, per `team_integration_plan.md` §7).
- Verification metrics (94% noise reduction, 96/100 score, 15 findings) are rendered from live API values only — never hardcoded in the UI.

---

## 8. Spring Boot ↔ Python Agents Integration

**Team 1 consumes, Team 2 provides.**

- Team 1's `agent/` package (backend package structure, `implementation_plan.md` §12) is the sole caller of Team 2's four endpoints, chained in order: Agent 1 → Agent 2 → Agent 3 → Agent 4, with a human checkpoint between each (see §9).
- Base URL inside Docker network: `http://python-agents:8000`.
- **Mock-first development**: Team 1 develops against `MockAgentClient.java`, returning static JSON fixtures from `src/test/resources/mocks/`. No other mocking mechanism is used.
- **Switch-over**: at Integration Step 2 (see §12), Team 1 replaces `MockAgentClient.java` calls with real HTTP calls to Team 2's live FastAPI service, without changing any calling code elsewhere in the backend.
- Team 2 similarly mocks its own external dependencies (live CISA KEV / EPSS APIs) using `agents_service/mocks/mock_kev.json` and `agents_service/mocks/mock_epss.json` during development — these are not deleted, they simply stop being the active path once live `httpx` calls are wired in.

---

## 9. WebSocket / Human-in-the-Loop Integration

Source: `implementation_plan.md` §4, §16; `team_integration_plan.md` §4. **Owner: Team 1** (WebSocket + control endpoint), **consumed by**: Team 3 (UI), **verified by**: Team 4 (E2E harness).

**Pipeline**:
```
Agent 1 → WAITING_FOR_HUMAN → [Continue/Stop] → Agent 2 → WAITING_FOR_HUMAN → [Continue/Stop]
→ Agent 3 → WAITING_FOR_HUMAN → [Continue/Stop] → Agent 4 → WAITING_FOR_HUMAN/FINAL_APPROVAL
→ [Approve] → GitHubTicketingService.java creates GitHub Issue
```

**Conceptual states** (exact set, no additions): `PENDING`, `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, `FAILED`.

**Control contract**:
- `GET /api/scans/{id}` — poll current status + agent output for review.
- `POST /api/scans/{id}/control` with `{action: "CONTINUE" | "STOP"}` — advances or halts the pipeline.
- `POST /api/vulnerabilities/{id}/ticket` with `{approved: true}` — Final Human Approval; only this call may trigger `GitHubTicketingService.java`.
- `ws://localhost:8080/ws/pipeline` — Team 1 streams status transitions to Team 3 in real time.

**Rules**:
- If `Stop` is chosen at any checkpoint: the next agent does not execute, state becomes `STOPPED`, no GitHub issue is created.
- If `Continue` is chosen: pipeline proceeds to the next documented stage.
- Agent 4 (Team 2) never calls the GitHub API itself — it only produces the ticket payload and returns it, then waits.
- No team invents new HITL states, control actions, endpoints, or WebSocket message formats beyond what's listed here. If a team needs a capability the control contract doesn't cover, raise a `CONFLICT` — do not add a new command.
- HITL runtime state (current stage, waiting status) is held in application memory/API/WebSocket layers only — never persisted as a new database table (see §6).

---

## 10. Mock/Stub Strategy for Parallel Development

| Team | Mocks | Mechanism | Replaced at |
| :--- | :--- | :--- | :--- |
| Team 1 | Team 2's 4 agent endpoints | `MockAgentClient.java` returning static JSON from `src/test/resources/mocks/` | Integration Step 2 |
| Team 2 | Live CISA KEV / EPSS APIs | `agents_service/mocks/mock_kev.json`, `mock_epss.json`, static FastAPI router responses | Integration Step 2 (agent logic validated), live calls enabled progressively |
| Team 3 | Team 1's REST API + WebSocket | MSW (Mock Service Worker) or `json-server` on `:8080`, matching Team 1's documented contract | Integration Step 3 |
| Team 4 | Fully completed app services | Ephemeral base containers with health checks & dummy echo servers | Integration Step 1 onward, as real services come online |

No team introduces a mocking framework or mechanism beyond what's listed above (e.g., no WireMock, no VCR cassettes, no custom mock servers).

---

## 11. Integration Sequence

Four chronological steps, matching `team_integration_plan.md`'s structure:

**Step 1 — Core Foundation (Team 1 ↔ Team 4)**
- Team 4 provides `docker-compose.yml` with the `postgres` service.
- Team 1 configures `application.yml` and runs `schema.sql` DDL against it.
- Verify: `curl http://localhost:8080/actuator/health` → `{"status": "UP", "components": {"db": {"status": "UP"}}}`.

**Step 2 — AI Pipeline (Team 1 ↔ Team 2)**
- Team 1 replaces `MockAgentClient.java` with real calls to `http://python-agents:8000`.
- Feed Team 4's sample reports through Agent 1 → 2 → 3 → 4, pausing at each `WAITING_FOR_HUMAN` checkpoint.
- Verify: passing raw findings through the pipeline with `Continue` at each checkpoint produces deduplicated `CanonicalFinding` records with `composite_risk_score > 0` persisted in PostgreSQL.

**Step 3 — UI Connectivity (Team 3 ↔ Team 1)**
- Team 3 disables MSW/`json-server`, points `NEXT_PUBLIC_API_URL` to `http://localhost:8080`.
- Team 1 enables CORS for `http://localhost:3000`.
- Verify: triggering a scan in the UI shows live status transitions, Continue/Stop controls work at each checkpoint, and canonical findings render in the Risk Table.

**Step 4 — Full System E2E (Team 4 ↔ All)**
- Team 4 runs `scripts/test_e2e_pipeline.sh` inside Docker Compose against the full stack.
- Verify the complete HITL sequence in §9, culminating in GitHub issue creation strictly after Final Approval.
- Measure (do not hardcode): noise reduction %, canonical finding count, security score, actual ticket count (determined by human-approved results, not forced).

---

## 12. PR / Code-Review Process

- Feature branches (see §3) → PR into `develop`.
- Every PR into `develop` requires **at least 1 approval from another team's lead**.
- PRs must not modify files outside the submitting team's owned paths (see §1). A PR touching another team's directory is rejected on sight unless it is the designated integration PR performed by that owning team.
- Reviewers check: no schema drift from the 7 tables, no API contract changes, no new HITL states/endpoints, no unnecessary files (see §16 Minimal Implementation).
- CI (see §13) must pass before merge.

---

## 13. CI / Testing Requirements

Source: `implementation_plan.md` §18, §25; `team_integration_plan.md` §6. **Owner: Team 4** (`​.github/workflows/ci-cd.yml`), stages consume each team's own test suites.

**Pipeline stages** (exactly these, per `implementation_plan.md` §18):
1. Lint & Build — `mvn compile`, `npm run build`, `pytest` (collection/lint pass).
2. Security Scan — Trivy container scan & Dependency-Check.
3. Docker image verification — `docker-compose build`.

**Per-team test obligations** (each team runs these locally before pushing; CI re-verifies):
- Team 1: `mvn clean test` — JUnit 5 + Mockito, including risk engine tests.
- Team 2: Python `pytest` — must verify pandas MD5 deduplication accuracy at minimum.
- Team 3: `npm run build` — no additional test framework required unless explicitly added later.
- Team 4: `docker-compose build` succeeds; E2E harness (§14) passes.

No team introduces a testing framework not already named here (e.g., no Cypress/Jest for Team 3 unless the source documents are amended).

---

## 14. E2E Integration Process

**Owner: Team 4**, via `scripts/test_e2e_pipeline.sh`, exercising all other teams' live services together.

Required verification sequence (verbatim intent of `team_integration_plan.md` §6):
1. Scanner findings ingested (from `sample_reports/`).
2. Agent 1 executes → reaches `WAITING_FOR_HUMAN` (Human Review 1).
3. `Continue` → Agent 2 executes → `WAITING_FOR_HUMAN` (Human Review 2).
4. `Continue` → Agent 3 executes → `WAITING_FOR_HUMAN` (Human Review 3).
5. `Continue` → Agent 4 executes → produces score/priority/SLA/rationale/ticket payload.
6. Final Human Approval checkpoint reached (`WAITING_FOR_HUMAN`/`FINAL_APPROVAL`).
7. GitHub issue created **only** after approval, via `GitHubTicketingService.java`.
8. `Stop` (tested separately at any checkpoint) halts the pipeline, sets `STOPPED`, and confirms no GitHub issue is created.

**Rules**:
- The harness drives the real control contract (§9) — it does not call GitHub directly or bypass HITL checkpoints to save time.
- Human wait time at checkpoints is not counted against any automated-processing timing target.
- Verification numbers (2,500 raw findings, 15 canonical findings, 94% noise reduction, 96/100 score) are asserted against **measured** output, not injected as fixed values.

---

## 15. Final Integration Checklist

- [ ] `develop` contains merged, passing work from all 4 teams.
- [ ] `schema.sql` contains exactly the 7 authoritative tables — no more, no fewer.
- [ ] All API endpoints in §4 exist and match the frozen contract exactly.
- [ ] `CanonicalFinding` schema is byte-for-byte identical across backend persistence, agent output, and frontend rendering.
- [ ] `MockAgentClient.java` successfully replaced with live Team 2 calls.
- [ ] Frontend MSW/`json-server` successfully replaced with live Team 1 API + WebSocket.
- [ ] CORS enabled for `http://localhost:3000`.
- [ ] Every HITL checkpoint (`WAITING_FOR_HUMAN` after Agents 1–3, `FINAL_APPROVAL` after Agent 4) is functional with working `Continue`/`Stop`.
- [ ] No GitHub issue is ever created without passing through Final Human Approval.
- [ ] Team 2 contains zero GitHub API client code.
- [ ] `httpx` is the only HTTP client in `agents_service/`; no `requests` usage remains.
- [ ] `docker-compose up --build` brings up all four services (`postgres`, `python-agents`, `backend`, `frontend`) successfully.
- [ ] `scripts/test_e2e_pipeline.sh` passes against the full stack with real, measured verification numbers.
- [ ] CI pipeline (Lint & Build, Security Scan, Docker verification) is green on `develop`.
- [ ] No team's PR history shows direct edits to another team's owned files.
- [ ] All `OPEN DECISION` items below have been resolved or explicitly accepted as out-of-scope for the hackathon MVP.

---

## 16. Definition of Done

The integrated SentinelAI system is Done when:
1. A scan can be triggered from the UI end-to-end through all 4 agents with real human checkpoints, resulting in either a `STOPPED` pipeline (if rejected) or a live GitHub Issue (if approved) — with no shortcuts taken at any HITL gate.
2. The dashboard displays live, non-hardcoded metrics (`security_score`, noise reduction %, finding counts) sourced from `GET /api/dashboard`.
3. All 7 database tables are populated correctly through the real pipeline (not just seed data).
4. `docker-compose up --build` is the only command needed to run the full system locally.
5. CI is green on `main`.
6. The demo script (`docs/demo_script.md`) can be executed live using the real, integrated system — not a simulated/mocked version.

## Rules for Preventing Teams From Breaking Each Other's Modules

1. **Ownership is exclusive.** A team never edits another team's owned directory. Needs that cross a boundary are satisfied only through the documented contracts in §4–§9.
2. **Contracts are frozen.** Endpoint paths, request/response schemas, field names/types, the 7-table schema, the HITL state set, and the agent I/O contracts do not change without updating `implementation_plan.md` itself — no team may unilaterally alter them to unblock their own work.
3. **No silent adaptation.** If a team observes another team's actual implementation diverging from the documented contract, they report a `CONFLICT` (source, expected vs. current contract, affected team, action required) rather than quietly coding around the mismatch.
4. **No second implementations.** Only one team may implement any given interface (e.g., only Team 1 has a GitHub client; only Team 2 computes risk scores). Duplicate implementations are integration hazards and are rejected in review.
5. **Mocks are temporary and standardized.** Every team mocks its dependencies using only the mechanism specified in §10, and switches to the live dependency at the integration step specified in §11 — not before it's ready, not after without flagging the blocker.
6. **Minimal implementation.** No team creates files, tables, endpoints, or dependencies beyond what is explicitly required by `implementation_plan.md`. Extra "convenience" additions are the most common source of silent contract drift.
7. **PR review is the enforcement point.** Reviewers from other teams are the last line of defense against boundary violations before code lands in `develop`.

---

## OPEN DECISIONS

The following are not resolved by `implementation_plan.md` or `team_integration_plan.md`. They must be decided by the team leads before or during integration — this document does not guess at them.

1. **Seed data mechanism**: neither source document specifies the exact file/script location for the sample asset seed record beyond "insert the documented sample asset seed." Team 1 and Team 4 should agree where this lives (e.g., inside `schema.sql` vs. a separate seed script).
2. **NVD API endpoint path**: `implementation_plan.md` references "the NVD API" for CVSS/CWE/CPE data without giving an exact endpoint URL (unlike the explicit CISA KEV and FIRST.org EPSS URLs). Team 2 needs this resolved before Agent 3 can be fully implemented against live data.
3. **Benchmark dataset for XGBoost training**: the source documents require an XGBoost false-positive classifier but do not specify what data it should be trained/benchmarked on. Team 2 needs a decision here (e.g., a fixture dataset checked into the repo) before Phase 4 can be verified end-to-end.
4. **Exact WebSocket message schema**: `ws://localhost:8080/ws/pipeline` is specified as the channel, but the exact JSON message shape/fields for status-update events are not given in either document beyond "streams execution status updates." Team 1 and Team 3 must agree on this shape directly, consistent with the state set in §9, before wiring the live timeline.
5. **`/api/scans/{id}` `agent_output` shape**: the response is documented as `{scan_id, status, agent_output}`, but the internal structure of `agent_output` per agent stage is not specified. Team 1 and Team 3 must agree on a shape that can represent Agent 1–4 outputs consistently.
