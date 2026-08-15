# VertexAI — Architecture Plan

> Derived strictly from `implementation_plan.md` (authoritative specification) and `team_integration_plan.md` (team-division instructions derived from it). No technology, agent, API, table, workflow state, or service is introduced beyond what these two documents specify. Any ambiguity or conflict is marked `OPEN DECISION`.

---

## 1. System Overview

VertexAI is an enterprise-grade, **human-supervised multi-agent cybersecurity platform** that converts raw, noisy multi-scanner vulnerability output into prioritized, explainable, human-approved GitHub tickets.

It addresses:
- **Multi-scanner duplication** — ZAP, Nuclei, OpenVAS, and Nmap each report the same underlying vulnerability redundantly.
- **False-positive overhead** — scanners lack runtime/context awareness.
- **Static CVSS prioritization flaws** — CVSS scores alone do not reflect real-world exploitation likelihood.
- **Uncontrolled auto-ticketing risk** — VertexAI enforces **Human-in-the-Loop (HITL) review at every agent stage**, so tickets are dispatched only upon explicit human authorization.

The platform is composed of four subsystems:
1. A **Spring Boot 3 (Java 17)** core backend (auth/RBAC, asset & scan management, pipeline orchestration, sole GitHub REST client).
2. A **Python 3.11 (FastAPI)** AI engine running 4 sequential agents.
3. An authoritative **PostgreSQL** database with **exactly 7 tables**.
4. A **Next.js 14 / React 18 / Anime.js** dashboard exposing HITL review and control at every stage.

---

## 2. Four-Team Ownership & Boundaries

| Team | Domain | Owns | Tech Stack |
| :--- | :--- | :--- | :--- |
| **Team 1** | Core Backend & Data | REST API, Auth/RBAC, Asset & Scan Management, 7-table PostgreSQL schema, **sole GitHub REST client** (`GitHubTicketingService.java`), Pipeline Orchestrator, WebSocket status streaming | Java 17, Spring Boot 3, PostgreSQL 16, Spring Security, JPA |
| **Team 2** | AI Engine & Threat Intel | Agents 1–4 (Parser, Noise Reduction, Threat Intel, Risk Scoring & Ticket Prep) | Python 3.11, FastAPI, pandas, XGBoost, scikit-learn, xmltodict, `httpx` (no `requests`, no Python GitHub client) |
| **Team 3** | Security Dashboard & UI | VertexAI UI, Flow View Canvas, HITL review controls (`Continue`/`Stop`), Timeline | Next.js 14, React 18, Tailwind CSS, Anime.js, Chart.js, MSW or `json-server` |
| **Team 4** | DevOps, Scanners & E2E | Multi-scanner sandbox, sample reports, Docker Compose, CI/CD, HITL E2E test harness | Docker, Nmap, Nuclei, OWASP ZAP, OpenVAS, GitHub Actions |

**Boundary rules:**
- No team may invent new APIs, database tables, technologies, services, agents, workflow states, HITL interfaces, or data contracts beyond what is specified.
- Team 2 must not implement a Python GitHub API client — GitHub issue creation is exclusively `GitHubTicketingService.java` (Team 1).
- A team prompt that appears to conflict with `implementation_plan.md` must stop implementation and report the conflict rather than silently resolving it.

---

## 3. Complete Component Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   VERTEX AI UI (Next.js 14 / React 18 / Anime.js)                    │
│   - Flow View Network Graph                      - Security Score Badge               │
│   - Human-in-the-Loop Stage Review & Approval    - Live Timeline & Continue/Stop      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ REST API / WebSockets
                                            v
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    SPRING BOOT 3 CORE API BACKEND (Java 17 / JPA / Security)           │
│   - Auth & RBAC (JWT)               - Asset & Scan Management                          │
│   - Threat Intel Sync Daemon        - Pipeline Orchestrator (HITL Checkpoints)         │
│   - GitHubTicketingService.java (Sole GitHub REST API Client)                          │
└─────────────────────┬───────────────────────────────────────────────────┬──────────────┘
                      │ HTTP / REST                                       │ JPA / SQL
                      v                                                   v
┌──────────────────────────────────────────┐             ┌───────────────────────────────┐
│     PYTHON AI AGENT SERVICES (FastAPI)   │             │     POSTGRESQL DATABASE       │
│  - Agent 1: Scanner Parser & Normalizer  │             │     (EXACTLY 7 TABLES)        │
│  - Agent 2: Noise Reduction (XGBoost)    │ <─────────> │  1. users     5. vulnerability │
│  - Agent 3: EPSS & KEV (httpx Client)    │             │  2. assets      _intelligence  │
│  - Agent 4: Risk Scoring & Ticket Prep   │             │  3. scan_jobs 6. risk_scores   │
└──────────────────────────────────────────┘             │  4. canonical 7. risk_tickets  │
                                                          │     _vulnerabilities           │
                                                          └───────────────────────────────┘

Scanner Layer (Nmap / Nuclei / OWASP ZAP / OpenVAS) ──> Raw Report File ──> Agent 1 (Team 2)
```

---

## 4. Frontend Architecture (Team 3)

- **Stack**: Next.js 14, React 18, Tailwind CSS, Anime.js (animation), Chart.js (metrics), MSW or `json-server` (mocking).
- **Responsibilities**:
  - **Flow View Network Graph** — visual representation of pipeline/asset relationships.
  - **Status Indicator Badges** — `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, `FAILED`.
  - **Human Review Checkpoints** — renders `Continue` and `Stop` controls at every agent stage.
  - **Post-Agent-4 Inspection View** — displays Composite Risk Score, Priority Level, SLA Deadline, Explainable Rationale, and prepared Ticket Payload.
  - **Timeline Entry** (fixed text, replacing any implied "auto-created" language):
    `"Agent 4 risk score generated → Final human approval pending → GitHub ticket created after approval"`
  - The dashboard must **never** display a ticket as created prior to explicit final human approval.
- **Communication**: REST API calls to Spring Boot backend; WebSocket subscription for live pipeline status updates at each HITL checkpoint.

---

## 5. Spring Boot Backend Architecture (Team 1)

```text
backend/src/main/java/com/vertexai/
├── controller/        # REST Endpoint Controllers (@RestController)
├── service/           # Core Business Logic & Orchestration Services
│   └── GitHubTicketingService.java   # SOLE GitHub REST API Client
├── repository/        # Spring Data JPA Repositories (exactly 7 entities)
├── entity/            # JPA Database Entities (@Entity)
├── dto/               # Request/Response Data Transfer Objects
├── mapper/            # MapStruct DTO <-> Entity Converters
├── security/          # Spring Security, JWT Filters, RBAC Rules
├── exception/         # Global Exception Handler (@ControllerAdvice)
├── config/            # OpenAPI, WebSockets, Security Configs
├── integration/       # External Clients Gateway
├── agent/             # Python Agent REST Communication Gateway (httpx receiver)
└── util/              # Common Utilities & Math Formulas
```

**Core responsibilities:**
- Auth & RBAC via JWT (roles: `ADMIN`, `ANALYST`, `VIEWER`).
- Asset registration/authorization gate (`is_authorized = true` required before scan initiation).
- Scan job lifecycle management.
- Pipeline Orchestrator — drives HITL checkpoints and pipeline state transitions.
- Threat Intel Sync Daemon.
- `GitHubTicketingService.java` — the **only** component in the system permitted to call the GitHub REST API.
- WebSocket streaming of execution status to the Next.js dashboard at every HITL checkpoint.

---

## 6. Python AI-Agent Architecture (Team 2)

```text
agents_service/
├── agent1_parser.py        # Parser & Normalizer
├── agent2_noise.py         # Noise Reduction & XGBoost
├── agent3_threat.py        # Threat Intel & EPSS (httpx)
├── agent4_scoring.py       # Risk Scoring & Ticket Preparation (No GitHub Client)
├── main.py
└── requirements.txt
```

- **Stack**: Python 3.11, FastAPI, pandas, XGBoost, scikit-learn, xmltodict.
- **HTTP Client Standard**: `httpx` for all outbound HTTP (internal and external). `requests` is strictly prohibited.
- **Communication with Spring Boot**: Spring Boot invokes agent microservices over HTTP (`http://python-agents:8000/api/v1/agent/...`).
- **Restriction**: Team 2 must **not** implement a Python GitHub API client; GitHub issue creation is exclusively performed by Team 1's `GitHubTicketingService.java` after final human approval.

---

## 7. Scanner Sandbox Architecture (Team 4)

```text
Authorized Target Host ──> [ Scanner Sandbox Container ] ──> [ Raw Report File ] ──> [ Agent 1 Parser ]
```

- **Scanners**: Nmap, Nuclei, OWASP ZAP, OpenVAS.
- **Execution Policy**: Spring Boot validates asset authorization (`is_authorized = true`) before scan initiation.
- **Sandbox Policy**: Scanners run inside isolated containers with **zero egress privileges**.
- **Output**: Scanner-specific raw XML/JSON/JSONL report files, parsed by Agent 1 into the logical `UnifiedFinding` structure.
- *Logical concept notice*: `raw_results` refers to the raw scanner output as a logical/processing concept only — it is **not** a database table.

---

## 8. PostgreSQL Architecture (Team 1)

The schema is strictly frozen to **exactly seven tables**. No additional tables (e.g. `raw_results`, `normalized_findings`, `threat_intel`, `threat_intel_cache`, `human_reviews`, `agent_states`, `pipeline_states`) may be created; these terms are logical data/processing concepts only.

| # | Table | Purpose |
| :--- | :--- | :--- |
| 1 | `users` | Accounts, RBAC role (`ADMIN`, `ANALYST`, `VIEWER`) |
| 2 | `assets` | Registered/authorized scan targets, criticality rating |
| 3 | `scan_jobs` | Scan execution lifecycle, pipeline `status` |
| 4 | `canonical_vulnerabilities` | Deduplicated findings, fingerprint hash, FP probability |
| 5 | `vulnerability_intelligence` | CISA KEV / EPSS / Exploit-DB enrichment per CVE |
| 6 | `risk_scores` | Composite risk score, priority level, explainable rationale |
| 7 | `risk_tickets` | Dispatched GitHub ticket records (created post-approval only) |

```sql
-- 1. USERS TABLE
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'ANALYST', 'VIEWER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ASSETS TABLE
CREATE TABLE assets (
    asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    environment VARCHAR(50) CHECK (environment IN ('PRODUCTION', 'STAGING', 'DEV')),
    criticality_rating INT CHECK (criticality_rating BETWEEN 1 AND 5),
    owner_email VARCHAR(255) NOT NULL,
    is_authorized BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. SCAN JOBS TABLE
CREATE TABLE scan_jobs (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(asset_id),
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'WAITING_FOR_HUMAN', 'COMPLETED', 'STOPPED', 'FAILED')),
    scanners_used TEXT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 4. CANONICAL VULNERABILITIES TABLE
CREATE TABLE canonical_vulnerabilities (
    finding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint_hash VARCHAR(64) UNIQUE NOT NULL,
    cve_id VARCHAR(50) NOT NULL,
    vulnerability_name VARCHAR(255) NOT NULL,
    target_host VARCHAR(255) NOT NULL,
    target_port INT NOT NULL,
    cvss_base_score DOUBLE PRECISION NOT NULL,
    scanner_sources TEXT NOT NULL,
    false_positive_prob DOUBLE PRECISION DEFAULT 0.0,
    is_suppressed BOOLEAN DEFAULT FALSE,
    is_accepted_risk BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. VULNERABILITY INTELLIGENCE TABLE
CREATE TABLE vulnerability_intelligence (
    cve_id VARCHAR(50) PRIMARY KEY,
    is_cisa_kev BOOLEAN DEFAULT FALSE,
    epss_score DOUBLE PRECISION DEFAULT 0.0,
    epss_percentile DOUBLE PRECISION DEFAULT 0.0,
    exploit_db_available BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. RISK SCORES TABLE
CREATE TABLE risk_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID REFERENCES canonical_vulnerabilities(finding_id),
    composite_risk_score DOUBLE PRECISION NOT NULL,
    priority_level VARCHAR(20) NOT NULL,
    explainable_rationale TEXT NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. RISK TICKETS TABLE
CREATE TABLE risk_tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID REFERENCES canonical_vulnerabilities(finding_id),
    ticket_system VARCHAR(50) NOT NULL,
    external_ticket_url VARCHAR(500) NOT NULL,
    assigned_owner VARCHAR(255) NOT NULL,
    sla_deadline TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'OPEN'
);
```

**HITL runtime state**: Human-in-the-Loop pipeline state is managed via application/API/WebSocket mechanisms (in-memory), not via additional database tables.

---

## 9. GitHub Ticketing Architecture (Team 1)

- **Sole client**: `GitHubTicketingService.java`, owned exclusively by Team 1.
- **Trigger condition**: Executed **only** after Final Human Approval on Agent 4's prepared ticket payload.
- **Agent 4 does NOT create GitHub tickets directly** — it only prepares the ticket payload; dispatch is a separate, backend-only action gated by human approval.
- **API endpoint (Spring Boot)**: `POST /api/vulnerabilities/{id}/ticket` — `{approved: true}` → `{ticket_url, status}`.
- **Persistence**: Successful dispatch is recorded in the `risk_tickets` table.
- **Rule**: No GitHub Issue is created if the pipeline is `STOPPED` or rejected at any stage, including final approval.

---

## 10. Four AI Agents & Responsibilities (Team 2)

| Agent | Name | Responsibility | Input | Output (Logical) | Key Tech | Human Gate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Agent 1** | Scanning Agent (Parser & Normalizer) | Multi-scanner report parsing & schema normalization | Raw XML/JSON/JSONL from ZAP, Nuclei, OpenVAS, Nmap | `UnifiedFinding` array | Python 3.11, xmltodict, json | Yes (`WAITING_FOR_HUMAN`) |
| **Agent 2** | Noise Reduction Agent | Cross-scanner deduplication (MD5 fingerprint), XGBoost false-positive filtering, accepted-risk policy enforcement | `UnifiedFinding` array | `CanonicalFinding` array | MD5 fingerprinting, pandas, XGBoost | Yes (`WAITING_FOR_HUMAN`) |
| **Agent 3** | Exploitability Prediction Agent | Threat-intel enrichment (CISA KEV, FIRST.org EPSS, NVD, Exploit-DB) via `httpx`; ML exploit-probability estimation | `CanonicalFinding` + threat feeds | `ExploitabilityVector` | Python 3.11, `httpx`, XGBoostRegressor/EPSS | Yes (`WAITING_FOR_HUMAN`) |
| **Agent 4** | Risk Scoring & Ticket Preparation Agent | Contextual 0–100 composite risk scoring, priority/SLA assignment, explainable rationale, ticket payload preparation | Enriched finding + asset context | Prepared Ticket Payload | Composite math engine, rule-assisted explainer | Final Approval (`WAITING_FOR_HUMAN`) |

**Fingerprint hash (Agent 2 dedup key):**
`MD5(target_host + ":" + target_port + ":" + cve_id + ":" + endpoint_path)`

**XGBoost false-positive features (Agent 2):** `scanner_confidence`, `has_cve_id`, `http_response_code`, `port_is_open`, `historical_plugin_fp_rate`. If `false_positive_prob > 0.85` → `is_suppressed = true`.

**Composite Risk Score formula (Agent 4):**
`Composite Risk Score = (CVSS × 0.30) + (EPSS × 10 × 0.35) + KEV_Bonus + (Asset_Criticality × 4.0)`
- `KEV_Bonus` = +25.0 if CISA KEV-listed, else 0.0
- `Asset_Criticality × 4.0` — up to +20.0 points

**SLA / Priority tiers:**
| Tier | Score Range | SLA |
| :--- | :--- | :--- |
| P0 Critical | 80.0–100.0 | 24 hours |
| P1 High | 60.0–79.9 | 72 hours |
| P2 Medium | 40.0–59.9 | 14 days |
| P3 Low | 0.0–39.9 | 30 days |

**Ticket creation**: Team 1's `GitHubTicketingService.java` owns the actual GitHub Issue dispatch, executed only after Final Human Approval.

---

## 11. REST and WebSocket Communication

### REST API (Spring Boot, Team 1)

| Method | Endpoint | Purpose | Auth / Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate & issue JWT | Public |
| `POST` | `/api/assets` | Register authorized asset | Admin/Analyst |
| `GET` | `/api/assets` | List registered assets | Authenticated |
| `POST` | `/api/scans` | Trigger multi-scanner execution | Admin/Analyst |
| `GET` | `/api/scans/{id}` | Check scan job status & HITL checkpoint | Authenticated |
| `POST` | `/api/scans/{id}/control` | HITL control action (`CONTINUE`/`STOP`) | Analyst |
| `GET` | `/api/vulnerabilities` | List canonical findings | Authenticated |
| `GET` | `/api/dashboard` | Dashboard metrics | Authenticated |
| `POST` | `/api/vulnerabilities/{id}/accept-risk` | Approve accepted risk | Admin |
| `POST` | `/api/vulnerabilities/{id}/ticket` | Final Human Approval → dispatch GitHub Issue | Admin/Analyst |

### Internal service-to-service
- Spring Boot → Python agents: HTTP/REST, `http://python-agents:8000/api/v1/agent/...`.
- Python agents (Team 2) use `httpx` exclusively for all outbound HTTP calls (internal and to threat-intel feeds); `requests` is prohibited.

### WebSocket
- Spring Boot streams execution/status updates to the Next.js dashboard via WebSockets at every HITL stage checkpoint (`RUNNING`, `WAITING_FOR_HUMAN`, `STOPPED`, etc.).

---

## 12. Human-in-the-Loop (HITL) Workflow

### Conceptual Pipeline States
`PENDING`, `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, `FAILED`.

### Sequence

```text
Scanner Layer (Nmap / Nuclei / OWASP ZAP / OpenVAS)
│
▼
Agent 1 — Parser & Normalizer
│
▼
HUMAN REVIEW 1  ───[Stop]───> PIPELINE STOPPED (Status: STOPPED)
│ [Continue]
▼
Agent 2 — Noise Reduction
│
▼
HUMAN REVIEW 2  ───[Stop]───> PIPELINE STOPPED (Status: STOPPED)
│ [Continue]
▼
Agent 3 — Threat Intelligence
│
▼
HUMAN REVIEW 3  ───[Stop]───> PIPELINE STOPPED (Status: STOPPED)
│ [Continue]
▼
Agent 4 — Risk Scoring & Ticket Preparation
│
▼
FINAL HUMAN APPROVAL ───[Reject/Stop]───> PIPELINE STOPPED (No GitHub Issue created)
│ [Approve]
▼
Team 1 GitHubTicketingService.java creates GitHub Issue via REST API
```

### Review content at each checkpoint
- **After Agent 1**: `WAITING_FOR_HUMAN` — exposes `UnifiedFinding` items.
- **After Agent 2**: `WAITING_FOR_HUMAN` — exposes deduplicated `CanonicalFinding` items and suppressed false positives.
- **After Agent 3**: `WAITING_FOR_HUMAN` — exposes enriched CISA KEV/EPSS threat-intelligence telemetry.
- **After Agent 4**: `WAITING_FOR_HUMAN` / `FINAL_APPROVAL` — displays Composite Risk Score, Priority Level, SLA Deadline, Explainable Rationale, and prepared Ticket Payload.

### Control actions
- `Continue`: advances pipeline to next stage.
- `Stop`: prevents next stage execution, sets state to `STOPPED`; no GitHub Issue is created.

### Ticket dispatch rule
Only after Final Human Approval does `GitHubTicketingService.java` issue the `POST` request to the GitHub REST API. Agent 4 never creates tickets directly.

### Runtime state implementation
HITL state lives in application/API/WebSocket layers (in-memory) — no additional database tables.

---

## 13. End-to-End Data Flow

1. Analyst registers an authorized asset (`is_authorized = true`) and triggers a scan (`POST /api/scans`).
2. Scanner sandbox containers (Nmap, Nuclei, ZAP, OpenVAS) run against the target and produce raw report files.
3. Agent 1 (Team 2) parses raw reports into `UnifiedFinding` items → pipeline state `WAITING_FOR_HUMAN`.
4. Analyst reviews and issues `Continue` → Agent 2 deduplicates (MD5 fingerprint) and applies XGBoost false-positive filtering, producing `CanonicalFinding` items (persisted to `canonical_vulnerabilities`) → `WAITING_FOR_HUMAN`.
5. Analyst issues `Continue` → Agent 3 enriches with CISA KEV / EPSS / NVD / Exploit-DB data via `httpx` (persisted to `vulnerability_intelligence`) → `WAITING_FOR_HUMAN`.
6. Analyst issues `Continue` → Agent 4 computes the Composite Risk Score, Priority Level, SLA, and Explainable Rationale (persisted to `risk_scores`) and prepares the ticket payload → `WAITING_FOR_HUMAN` / `FINAL_APPROVAL`.
7. Analyst/Admin reviews the final payload:
   - **Reject/Stop** → pipeline `STOPPED`; no ticket created.
   - **Approve** → `POST /api/vulnerabilities/{id}/ticket` triggers `GitHubTicketingService.java`, which creates the GitHub Issue via the GitHub REST API and persists the result to `risk_tickets`.
8. At every stage, Spring Boot streams status via WebSocket to the Next.js dashboard, which reflects the current stage, HITL controls, and (post-approval only) ticket status in its timeline.

---

## 14. Repository Structure

```text
vertexai/
├── frontend/                   # Next.js 14 / React Dashboard (Team 3)
├── backend/                    # Spring Boot 3 Java API & GitHub Client (Team 1)
│   └── src/main/java/com/vertexai/service/GitHubTicketingService.java
├── agents_service/             # Python 3.11 FastAPI AI Agents (httpx) (Team 2)
│   ├── agent1_parser.py        # Parser & Normalizer
│   ├── agent2_noise.py         # Noise Reduction & XGBoost
│   ├── agent3_threat.py        # Threat Intel & EPSS (httpx)
│   ├── agent4_scoring.py       # Risk Scoring & Ticket Preparation (No GitHub Client)
│   ├── main.py
│   └── requirements.txt
├── docker-compose.yml          # Infrastructure Orchestration (Team 4)
└── README.md
```

*OPEN DECISION*: `implementation_plan.md` does not enumerate the Team 4 scanner-sandbox or CI/CD directory structure within the repository tree (e.g. a `scanners/` or `.github/workflows/` path is referenced narratively in §17–18 but not shown in the tree in §20). Exact placement is left unspecified in the source.

---

## 15. Docker / Service Architecture

`docker-compose.yml` (Team 4, per `implementation_plan.md` §17):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vertexai_db
      POSTGRES_USER: vertex_user
      POSTGRES_PASSWORD: vertex_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vertex_user -d vertexai_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  python-agents:
    build:
      context: ./agents_service
    ports:
      - "8000:8000"
    environment:
      - DB_HOST=postgres
    depends_on:
      postgres:
        condition: service_healthy

  backend:
    build:
      context: ./backend
    ports:
      - "8080:8080"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/vertexai_db
      - PYTHON_AGENT_URL=http://python-agents:8000
    depends_on:
      postgres:
        condition: service_healthy
      python-agents:
        condition: service_started

  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8080

volumes:
  postgres_data:
```

**Deployment**: `docker-compose up --build`.

**CI/CD** (`.github/workflows/ci-cd.yml`, Team 4):
1. Lint & Build (`mvn compile`, `npm run build`, `pytest`).
2. Security Scan (Trivy & Dependency-Check).
3. Docker image verification.

---

## 16. Security Boundaries

- **Single GitHub Client Ownership**: `GitHubTicketingService.java` (Team 1) is the **only** component in the entire system authorized to call the GitHub REST API. Team 2 must not implement any Python GitHub client.
- **Human-in-the-Loop Authorization**: No ticket may be dispatched without explicit human authorization at the Final Approval checkpoint.
- **Asset Authorization Gate**: Spring Boot validates `is_authorized = true` on the target asset before any scan is initiated.
- **Scanner Sandbox Isolation**: Scanner containers (Nmap, Nuclei, ZAP, OpenVAS) run isolated with **zero egress privileges**.
- **Auth & RBAC**: JWT-based authentication; roles `ADMIN`, `ANALYST`, `VIEWER` enforced via Spring Security on REST endpoints.
- **Exploit Handling**: Exploit-DB intelligence gathers public exploit metadata only — **live exploits are never executed**.
- **HTTP Client Restriction**: Team 2 must use `httpx` exclusively; `requests` is strictly prohibited, preventing a second, inconsistent HTTP client surface.
- **No Additional Attack Surface via Extra Tables/Services**: The 7-table database and 4-agent/4-team boundaries are frozen; no team may introduce new services, tables, or workflow states that could bypass the HITL gate.

---

## 17. Exact Technology Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 14, React 18, Tailwind CSS, Anime.js, Chart.js, MSW or `json-server` |
| Backend | Java 17, Spring Boot 3, Spring Security, JPA |
| Database | PostgreSQL 16 (exactly 7 tables) |
| AI Engine | Python 3.11, FastAPI, pandas, XGBoost, scikit-learn, xmltodict, `httpx` |
| Scanners | Nmap, Nuclei, OWASP ZAP, OpenVAS |
| Orchestration | Docker, Docker Compose |
| CI/CD | GitHub Actions (`mvn compile`, `npm run build`, `pytest`, Trivy, Dependency-Check) |
| Ticketing | GitHub REST API (via `GitHubTicketingService.java` only) |
| Inter-service comms | REST/HTTP (Spring Boot ↔ FastAPI), WebSockets (Spring Boot → Next.js) |

**Prohibited in this architecture**: Python `requests` library, any Python GitHub API client, un-reviewed auto-ticketing, and any database table beyond the authoritative 7.

---

## 18. MVP Scope (for architectural completeness)

- **Included**: Scanner report ingestion; Agents 1–4; HITL review at every agent stage (`Continue`/`Stop`); final human approval checkpoint; GitHub issue creation after approval via `GitHubTicketingService.java`; 7-table database; Next.js security dashboard.
- **Excluded**: Un-reviewed auto-ticketing; Python GitHub API clients; additional HITL database tables.
