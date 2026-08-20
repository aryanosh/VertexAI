# VertexAI — System Architecture, Backend/Frontend Integration, and Agentic AI

This document explains, in depth, how VertexAI is actually built and wired together as it stands today: what the backend does, what the frontend does, exactly how the two talk to each other and to the Python AI agents, how the "AI" in each of the 4 agents actually works, and why NVIDIA Nemotron specifically was chosen as the model behind it.

---

## 1. What the system does, in one paragraph

VertexAI ingests raw, noisy output from multiple vulnerability scanners (OWASP ZAP, Nuclei, OpenVAS, Nmap), normalizes it into one schema, removes duplicate/false-positive findings, enriches the survivors with real threat intelligence (CISA KEV, FIRST EPSS), computes a transparent 0–100 composite risk score, and prepares a ticket — but never dispatches anything to GitHub without an explicit human approval at every stage. The guiding principle throughout the codebase is **"AI proposes, humans dispose"**: every agent's output is reviewed by a person before the pipeline is allowed to advance.

---

## 2. High-level architecture

```
┌─────────────────────┐        REST + WebSocket        ┌──────────────────────────┐
│   Next.js Frontend   │ ◄─────────────────────────────► │   Spring Boot Backend    │
│   (port 3000)        │        /api/*, /ws/pipeline      │   (port 8080)            │
└─────────────────────┘                                  └────────────┬─────────────┘
                                                                       │ internal REST
                                                                       │ (agents_service:8000)
                                                           ┌───────────▼─────────────┐
                                                           │  Python FastAPI Agents   │
                                                           │  (port 8000)             │
                                                           │  Agent 1·2·3·4           │
                                                           └───────────┬─────────────┘
                                                                       │ NVIDIA NIM API
                                                                       ▼
                                                           ┌──────────────────────────┐
                                                           │  NVIDIA Nemotron model    │
                                                           │  (hosted, OpenAI-compat)  │
                                                           └──────────────────────────┘

┌──────────────────────────┐        JDBC         ┌─────────────────┐
│   Spring Boot Backend    │ ───────────────────► │   PostgreSQL 16  │
└──────────────────────────┘                       └─────────────────┘

┌──────────────────────────┐   REST (server-side)  ┌─────────────────┐
│   Spring Boot Backend    │ ───────────────────► │   GitHub REST API │
│   (GitHubTicketingService, sole client)          │   (Issues)        │
└──────────────────────────┘                       └─────────────────┘
```

Three services, three languages, three clear responsibilities:

| Service | Stack | Responsibility |
|---|---|---|
| **Frontend** | Next.js 14, React 18, Tailwind, Anime.js | HITL dashboard: upload, live pipeline visualization, review/approve/reject, ticket confirmation |
| **Backend** | Spring Boot 3, Java 17, PostgreSQL, Spring Security (JWT) | Sole owner of the database, sole orchestrator of the 4-agent pipeline, sole authenticated caller of the AI agents, **sole client allowed to talk to the GitHub API** |
| **Agents service** | Python, FastAPI | The 4 AI agents themselves — parsing, dedup/ML, threat intel, risk scoring |

The backend is deliberately the "narrow waist" of the system: the frontend never talks to the Python agents directly, and the Python agents never talk to GitHub or the database directly. Every cross-service call flows through the Java backend, which is the only place authentication, authorization, and audit logging happen.

---

## 3. Backend (Spring Boot) — what it actually owns

### 3.1 Core responsibility: `PipelineOrchestrator`

This is the heart of the backend. For every scan, it:

1. Persists a `scan_jobs` row the moment files are uploaded (status `RUNNING`, `current_stage = 0`).
2. Calls Agent 1 (`agents_service:8000`) with the raw report files, parses the response, persists `raw_findings_count`, and flips status to `WAITING_FOR_HUMAN` at `current_stage = 1`.
3. Waits. Nothing advances until the frontend calls `POST /api/scans/{id}/control` with `{"action":"CONTINUE"}`.
4. On `CONTINUE`, it calls Agent 2 (dedup/XGBoost), persists the surviving `canonical_vulnerabilities` rows **and** the full per-finding dedup audit trail (`dedup_report_json` on `scan_jobs`), and pauses again at `current_stage = 2`.
5. Repeats for Agent 3 (threat intel → `vulnerability_intelligence`) and Agent 4 (risk scoring → `risk_scores`, plus a prepared `ticket_payload_json`), pausing after each one — four separate human gates, one per agent, never a bulk "continue to completion."
6. After Agent 4's gate is approved, status becomes `COMPLETED`. Ticket creation is then a **separate**, explicit action (`POST /api/vulnerabilities/{id}/ticket`) — closing the pipeline and dispatching a ticket are two different backend calls on purpose, so a human can review the scored findings and only then decide whether to actually file a GitHub issue.

Every stage transition is broadcast live over WebSocket (`broadcastStatus`) and logged with `runId, input count, output count, duration, status` — the audit trail the frontend's activity timeline and this doc's Section 6 depend on.

### 3.2 Run isolation (why every scan is independent)

Early in this project's life, `canonical_vulnerabilities`, `vulnerability_intelligence`, and `risk_scores` had no notion of "which scan produced this row" — every query returned the same unscoped, ever-growing pool of data, including 5 permanent seed/demo rows. This was the root cause of results looking "random" between runs. It's fixed now:

- Every finding/score row carries a `scan_job_id` foreign key.
- `canonical_vulnerabilities` is uniquely keyed on `(scan_job_id, fingerprint_hash)` instead of `fingerprint_hash` alone, so two different scans can each have their own row for the same underlying vulnerability.
- `GET /api/dashboard` and `GET /api/vulnerabilities` both accept an optional `scan_id` — omit it and the backend resolves to the most recent **real** (non-seed) completed scan, never silently mixing in another run's data.
- The 5 seed/demo rows are tagged with one dedicated, well-known `scan_jobs` row (`is_seed_data = true`) so they only ever appear if you explicitly ask for that scan ID.

### 3.3 Database — 7 tables, deliberately frozen

`users`, `assets`, `scan_jobs`, `canonical_vulnerabilities`, `vulnerability_intelligence`, `risk_scores`, `risk_tickets`. New columns get added to existing tables as features grow (e.g. `dedup_report_json`, `ticket_payload_json`); no 8th table gets created, per the architecture's own constraint.

### 3.4 REST API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Returns a signed JWT (HS512) for a seeded user (admin/analyst/viewer) |
| `POST /api/scans/upload` | Multipart upload of 2+ scanner reports → starts a new scan, returns its `scan_id` |
| `GET /api/scans/{id}` | Current status, stage, live agent output, stage timings |
| `GET /api/scans/latest` | Most recent scan (used sparingly — see §3.5) |
| `POST /api/scans/{id}/control` | `CONTINUE` or `STOP` at a human gate |
| `GET /api/scans/{id}/dedup-report[.csv]` | Agent 2's full per-finding audit (kept/removed/reason) |
| `GET /api/vulnerabilities?scan_id=` | Findings for one scan, sorted descending by risk score |
| `POST /api/vulnerabilities/{id}/ticket` | The **only** way a GitHub issue gets created |
| `GET /api/dashboard?scan_id=` | Summary metrics for one scan |

### 3.5 Security

- Spring Security 6, stateless JWT (HS512), BCrypt password hashing, real `AuthenticationManager`-backed login — verified end-to-end (wrong password → 400, correct password → signed token, unauthenticated request to a protected endpoint → 403).
- Default-deny (`anyRequest().authenticated()`), role-gated write endpoints (`@PreAuthorize`).
- `GitHubTicketingService` is the **only** class in the entire codebase allowed to call the GitHub API, and it independently re-verifies a `RiskScore` exists for a finding before dispatching — it never trusts a caller-supplied `approved` flag alone.
- The frontend never auto-restores a previous session's active scan on page load/app restart — a fresh load starts idle; only an explicit new upload (or an explicit request for a specific past `scan_id`) makes a scan "active."

---

## 4. Frontend (Next.js) — what it actually owns

### 4.1 `PipelineProvider` — single source of truth

Mounted once in the root layout, so it survives route changes and keeps one app-wide WebSocket connection alive no matter which page you're on. It exposes:

- `activeScanId`, `status`, `currentStage`, `stageTimings`, `agentOutput`, `dashboardMetrics`, `vulnerabilities` — every chart, table, and node in the app reads from this **one** context instead of independently calling the API, so a graph can never show a different run than the table sitting next to it.
- `applyStatus(resp, {source})` — merges a status update into state. WebSocket-sourced updates are strictly dropped if their `scan_id` doesn't match the currently active scan, so a broadcast from someone else's run can never hijack your view.
- `resetForNewScan()` — clears every piece of per-scan state before a new scan's first response arrives, so a previous run's data never lingers alongside a new one.

### 4.2 The pipeline visualization (`ThreatFlow` component)

This is the primary navigation surface. All 7 stages — Upload → Agent 1 (Normalize) → Agent 2 (Dedup) → Agent 3 (Threat Intel) → Agent 4 (Risk Score) → Human Review → Ticketing — render as **one continuous horizontal row** (`flex flex-nowrap`, never a grid, never wraps; scrolls horizontally on narrow screens instead). Selecting a stage keeps the whole row visible and expands a workspace directly below it — never a separate page.

Each stage's workspace shows exactly 8 fields, sourced from real pipeline data, never the model's raw internal reasoning:

**Agent · Current Task · Tool · Execution Trace · Evidence · Result · Confidence · Action**

Animations (Anime.js) are all tied to real state transitions, not decorative loops: a pulse travels along the connector on a genuine agent-to-agent handoff, a node pops when it genuinely completes, the gate panel pulses the moment the pipeline genuinely pauses for review, and the risk-score badge counts up/down when the real score changes. A small `prefers-reduced-motion`-aware "shimmer" hover effect sits on the three primary action buttons.

### 4.3 Talking to the backend

`lib/api.ts` wraps every REST call with the JWT bearer token; `lib/pipeline-context.tsx` owns the WebSocket connection (`ws://.../ws/pipeline`) with reconnect backoff and a REST-polling fallback for whenever the socket is down. Nothing in the frontend calls the Python agents service directly — it only ever exists behind the backend.

---

## 5. How a scan actually flows through all three services

```
1. Analyst drops files on /uploads
     → POST /api/scans/upload  (frontend → backend)
     → backend creates scan_jobs row, returns scan_id immediately (status RUNNING)

2. Backend calls Agent 1 asynchronously
     → POST agents_service:8000/api/v1/agent1/... (backend → Python)
     → Agent 1 parses ZAP/Nuclei/OpenVAS/Nmap into one UnifiedFinding schema
     → backend persists raw_findings_count, broadcasts WAITING_FOR_HUMAN (stage 1) over WebSocket

3. Frontend (subscribed to the WebSocket) updates the pipeline row live —
   Agent 1's node turns green, Agent 2's node is next in line, no polling needed.

4. Analyst reviews Agent 1's output, clicks Approve & Continue
     → POST /api/scans/{id}/control {"action":"CONTINUE"}
     → backend calls Agent 2 (dedup + XGBoost false-positive filter)
     → backend persists canonical_vulnerabilities + the full dedup audit trail
     → repeat for Agent 3 (threat intel) and Agent 4 (risk scoring)

5. After Agent 4's gate, status becomes COMPLETED.
   Analyst reviews the top-scored (correctly numerically sorted) finding and clicks
   Approve & Dispatch:
     → POST /api/vulnerabilities/{id}/ticket {"approved": true}
     → GitHubTicketingService independently re-verifies a RiskScore exists
     → backend calls the real GitHub REST API (POST /repos/{owner}/{repo}/issues)
     → backend stores the real returned issue URL, frontend displays it
```

Nothing in this chain skips a step: a missing GitHub token or a GitHub API rejection surfaces as a real error, never a fabricated success URL.

---

## 6. The 4 AI agents — what's deterministic, what's actually agentic

A useful way to think about each agent: **a deterministic, always-correct core, with an LLM layer on top that explains or investigates — never one that decides the outcome.**

| Agent | Deterministic core (never touched by the LLM) | Agentic/LLM layer |
|---|---|---|
| **1 — Parser & Normalizer** | Regex/`xmltodict` parsers per scanner format → `UnifiedFinding` schema | Nemotron reconciles ambiguous/missing fields and writes a plain-language summary of what was parsed |
| **2 — Deduplication** | MD5/fingerprint grouping (CVE+host+port) + a real, loaded XGBoost false-positive classifier | Nemotron explains *why* a finding was kept/merged/suppressed, grounded in the classifier's actual feature values — it never overrides the classifier |
| **3 — Threat Intelligence** | Live/mocked CISA KEV and FIRST EPSS lookups via `httpx` | **Genuinely agentic**: Nemotron runs a real tool-calling loop, deciding for itself which of KEV/EPSS/NVD/Exploit-DB to query, in what order, and when it has enough evidence — up to an iteration/time budget, with an automatic fallback to a fixed two-call sequence if the model is unavailable or budget runs out |
| **4 — Risk Scoring & Ticket Prep** | A fixed weighted formula — CVSS 30% + EPSS 25% + CISA KEV +20 + asset criticality 15% + exploit availability +10, capped at 100 — assigning P0–P3 and an SLA | Nemotron writes the evidence-grounded rationale and the polished GitHub ticket narrative from the already-computed number; it is explicitly instructed it can never change the score |

Every agent's Nemotron output is passed through a fixed, sanitizing schema before it ever reaches an analyst — five sections only: **Processing Summary, Evidence Used, Tools and Sources, Decision Rationale, Confidence and Limitations** (surfaced in the frontend's 8-field workspace). The model's raw chain-of-thought/reasoning tokens are never stored or displayed — only these clean, auditable sections.

Each of the 4 stages still passes through its own independent human-review gate regardless of how "agentic" it is — the AI layer changes how much investigation happens *inside* a stage, never whether a human signs off on what comes out of it.

---

## 7. Why NVIDIA Nemotron, specifically

The model in use is `nvidia/nemotron-3.5-lightning-30b-a3b`, called through **NVIDIA NIM** — a hosted, OpenAI-compatible REST endpoint (`https://integrate.api.nvidia.com/v1`) reached from Python with plain `httpx`, no proprietary SDK. Concretely, this is what that choice buys the project:

1. **Real function/tool-calling support.** Agent 3's entire value proposition — an agent that *decides* which threat-intel source to query next instead of following a hardcoded sequence — depends on the model reliably emitting structured tool calls. Nemotron supports this directly against an OpenAI-compatible tool-calling schema, so `agent_runtime.py`'s tool loop (`run_agent`) didn't need a custom prompting/parsing scheme.
2. **An OpenAI-compatible API shape.** Because NIM speaks the same request/response format as the OpenAI Chat Completions API, the same `httpx`-based client code works against Nemotron with no vendor SDK lock-in — swapping to a different NIM-hosted model, or a self-hosted one later, is a config change (`NVIDIA_MODEL`, `NVIDIA_BASE_URL`), not a rewrite.
3. **A cost/latency profile that fits an iteration budget.** The tool-calling loop is capped (`AGENT_MAX_ITERATIONS=8`, `AGENT_TIMEOUT_SECONDS=45`) because a real HITL pipeline can't afford an agent that thinks indefinitely before a human ever sees output. Nemotron's Lightning variant is tuned for fast inference, which is what makes a multi-turn tool-selection loop practical inside a 45-second budget instead of a multi-minute one.
4. **Optional, explicit reasoning-trace control.** The model can return its thinking in a separate `reasoning_content` field (`LLM_ENABLE_THINKING`), which the runtime deliberately does **not** forward to analysts (see §6) — it's recorded server-side for audit purposes only, but the choice of model made it straightforward to separate "the model's private scratchpad" from "the clean explanation a human should see," rather than having to scrub free-form prose.
5. **Safe, automatic degradation.** `LLM_ENABLED` defaults to `true`, but every agent falls back to its deterministic path automatically if `NVIDIA_API_KEY` is unset, the API call fails, or the iteration/time budget is exceeded — the pipeline is never blocked on an external LLM being available, which matters for a demo environment that needs to run reliably offline.

Nothing about the composite risk-score formula, the dedup decision, or the parsing logic depends on Nemotron at all — those stay pure, deterministic Python, byte-for-byte reproducible on identical input. Nemotron is deliberately confined to the parts of the system where genuine judgment/explanation adds value (deciding what to investigate, writing a clear rationale) and is never in the path of a number that has to be exactly reproducible or a decision that has to be independently auditable by formula alone.

---

## 8. Quick reference — ports, env vars, containers

| Service | Container | Port | Key env vars |
|---|---|---|---|
| PostgreSQL 16 | `vertexai-postgres` | 5433→5432 | `POSTGRES_DB/USER/PASSWORD` |
| Python agents | `vertexai-agents` | 8000 | `USE_MOCKS`, `LLM_ENABLED`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_BASE_URL`, `AGENT_MAX_ITERATIONS`, `AGENT_TIMEOUT_SECONDS` |
| Spring Boot backend | `vertexai-backend` | 8080 | `JWT_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO_OWNER/NAME`, `SPRING_DATASOURCE_*` |
| Next.js frontend | `vertexai-frontend` | 3000 | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` |
| Scanner sandbox | `vertexai-scanner` | 9000 | `SCAN_TIMEOUT_SECONDS` |

Bring the whole stack up with `./run.sh` from the `VertexAI/` directory (see `INSTRUCTIONS.md` for full setup steps).
