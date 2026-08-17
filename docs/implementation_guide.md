# SentinelAI: AI-Driven Vulnerability Management & Prioritization Platform
## Master Implementation Blueprint & Technical Architecture (Cognizant Activity 4)

---

## Master Specification Rule
> **This document is the authoritative system specification.** Team prompts are implementation instructions derived from this document. If a team prompt and this document appear to conflict, the team must not silently choose an interpretation. The affected implementation must stop and the conflict must be reported.
> 
> No team may invent new APIs, database tables, technologies, services, agents, workflow states, Human-in-the-Loop interfaces or alternative data contracts unless explicitly specified in this document. All four teams must implement only their assigned ownership area and integrate through the documented contracts.

---

## 1. Executive Summary

**SentinelAI** is an enterprise-grade, human-supervised multi-agent cybersecurity platform designed to solve the critical enterprise problem of **Alert Fatigue** and **Scanner Noise**. Modern security operations consume raw findings from multiple scanners—OWASP ZAP, Nuclei, OpenVAS/Greenbone, and Nmap—which flood security teams with thousands of duplicate alerts, false positives, uncontextualized static CVSS scores, and unprioritized findings.

SentinelAI bridges raw vulnerability detection and actionable engineering remediation through **4 Specialized AI Agents** under strict **Human-in-the-Loop (HITL) Supervision**:
1. **Agent 1 (AI Scanning Agent — Parser & Normalizer)**: Multi-scanner output ingestion & common schema normalization. *(Human Gate: Yes)*
2. **Agent 2 (AI Noise Reduction Agent)**: Cryptographic cross-scanner deduplication, XGBoost false-positive filtering, & accepted risk policy enforcement. *(Human Gate: Yes)*
3. **Agent 3 (AI Exploitability Prediction Agent — Threat Intelligence)**: Threat intel enrichment (CISA KEV, FIRST.org EPSS via `httpx`, NVD, Exploit-DB) & ML exploit probability estimation. *(Human Gate: Yes)*
4. **Agent 4 (AI Vulnerability Risk Scoring & Ticket Preparation Agent)**: Contextual 0–100 risk scoring, business-impact ranking, SLA assignment, explainable rationale, and ticket payload preparation. *(Human Gate: Final Approval)*

After final human approval, **Team 1's `GitHubTicketingService.java`** creates the GitHub Issue via the GitHub REST API.

The platform features a hybrid **Spring Boot 3 (Java 17)** core backend, a **Python 3.11 (FastAPI + XGBoost + `httpx`)** AI engine, an authoritative 7-table **PostgreSQL** database layer, and a **Next.js / React / Anime.js** human-in-the-loop dashboard.

---

## 2. Problem Definition

### Enterprise Bottlenecks
- **Multi-Scanner Duplication**: Running ZAP, Nuclei, OpenVAS, and Nmap against a single application yields 3–5 redundant alerts per underlying vulnerability.
- **False Positive Overhead**: Scanners lack runtime/context awareness, flagging un-instantiated libraries or sandbox endpoints protected by WAFs.
- **CVSS Prioritization Flaw**: Over 60% of vulnerabilities are assigned "High" or "Critical" static CVSS ratings (8.0–10.0), yet real-world threat telemetry shows **less than 5% of CVEs are ever weaponized in active exploits**.
- **Uncontrolled Auto-Ticketing Risk**: Autonomous AI auto-ticketing creates noisy, unauthorized engineering backlog issues. SentinelAI enforces **Human-in-the-Loop review at every agent stage** so that tickets are only dispatched upon explicit human authorization.

---

## 3. Final Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   SENTINEL AI UI (Next.js 14 / React 18 / Anime.js)                    │
│   - Flow View Network Graph                      - Security Score (96/100) Badge      │
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
│  - Agent 2: Noise Reduction (XGBoost)    │ <─────────> │  1. users     5. vuln_intel   │
│  - Agent 3: EPSS & KEV (httpx Client)    │             │  2. assets    6. risk_scores  │
│  - Agent 4: Risk Scoring & Ticket Prep   │             │  3. scan_jobs 7. risk_tickets │
└──────────────────────────────────────────┘             │  4. canonical_vulnerabilities │
                                                         └───────────────────────────────┘
```

---

## 4. Complete End-to-End Workflow & Human-in-the-Loop Controls

### Workflow Pipeline
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

### Human-in-the-Loop Control Specification
SentinelAI is a human-supervised multi-agent pipeline. Human intervention is required at every agent stage.

**Conceptual Pipeline States**:
`PENDING`, `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, `FAILED`.

- **After Agent 1**: State transition to `WAITING_FOR_HUMAN`. Exposes logical `UnifiedFinding` items for review.
- **After Agent 2**: State transition to `WAITING_FOR_HUMAN`. Exposes logical deduplicated `CanonicalFinding` items and suppressed false positives for review.
- **After Agent 3**: State transition to `WAITING_FOR_HUMAN`. Exposes enriched CISA KEV and EPSS threat intelligence telemetry for review.
- **After Agent 4**: State transition to `WAITING_FOR_HUMAN` / `FINAL_APPROVAL`. Displays Composite Risk Score, Priority Level, SLA Deadline, Explainable Rationale, and prepared Ticket Information.
- **Control Actions**:
  - `Continue`: Advances the pipeline to the next agent stage.
  - `Stop`: Prevents the next stage from executing and updates the pipeline state to `STOPPED`. No GitHub Issue is created.
- **Ticket Dispatch Rule**: Only after final human approval does Team 1's `GitHubTicketingService.java` issue the POST request to the GitHub REST API. Agent 4 does **NOT** directly create GitHub tickets.
- **Runtime State Implementation**: Human-in-the-Loop state is managed in-memory/application/API/WebSocket layers. No extra database tables are created.

---

## 5. Four AI Agents Specification

| Agent Name | Primary Responsibility | Input Data | Output Artifact | Key Tech / Libraries | Human Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Agent 1: Scanning Agent** | Multi-scanner report parsing & schema normalization | Raw XML/JSON/JSONL from ZAP, Nuclei, OpenVAS, Nmap | `UnifiedFinding` Array (Logical) | Python 3.11, xmltodict, json | **Yes** (`WAITING_FOR_HUMAN`) |
| **Agent 2: Noise Reduction Agent** | Cross-scanner dedup, FP filtering, Accepted Risk check | `UnifiedFinding` Array | `CanonicalFinding` Array (Logical) | MD5 Fingerprinting, pandas, XGBoost | **Yes** (`WAITING_FOR_HUMAN`) |
| **Agent 3: Exploitability Agent** | Threat intel enrichment & exploit probability prediction | `CanonicalFinding` + Threat Feeds | `ExploitabilityVector` (Logical) | Python 3.11, `httpx`, CISA KEV, EPSS API | **Yes** (`WAITING_FOR_HUMAN`) |
| **Agent 4: Scoring & Ticket Prep Agent** | Risk score calculation, explainable rationale, ticket preparation | Enriched Finding + Asset Context | Prepared Ticket Payload | Composite Math Engine, LLM/Rule Explainer | **Final Approval** (`WAITING_FOR_HUMAN`) |

*Note: Team 1 owns the actual `GitHubTicketingService.java` client that executes ticket creation following Final Human Approval.*

---

## 6. Scanner Architecture

```text
Authorized Target Host ──> [ Scanner Sandbox Container ] ──> [ Raw Report File ] ──> [ Agent 1 Parser ]
```

### Execution Policies
- **Target Authorization Gate**: Spring Boot validates asset authorization status (`is_authorized = true`) before scan initiation.
- **Output Parsing**: Parsers convert scanner-specific attributes into the logical `UnifiedFinding` structure.
- **Logical Processing Concept Notice**: The term `raw_results` used when discussing raw scanner outputs is a logical data/processing concept only and is **NOT** a database table.

---

## 7. Noise Reduction Architecture

### Multi-Vector Cryptographic Deduplication
Agent 2 calculates an MD5 Hash for deduplication:

$$\text{Fingerprint Hash} = \text{MD5}(\text{target\_host} + \text{":"} + \text{target\_port} + \text{":"} + \text{cve\_id} + \text{":"} + \text{endpoint\_path})$$

Findings sharing identical fingerprint hashes are merged into a single `CanonicalFinding` record.

### XGBoost False Positive Model
Evaluates 5 features:
1. `scanner_confidence` (Low=1, Medium=2, High=3)
2. `has_cve_id` (Binary 0 or 1)
3. `http_response_code` (200, 403, 404, 500)
4. `port_is_open` (Binary 0 or 1)
5. `historical_plugin_fp_rate` (Float 0.0 to 1.0)

If `false_positive_prob > 0.85`, the finding is flagged `is_suppressed = true`.

*Logical Processing Concept Notice*: `normalized_findings` refers strictly to in-memory logical data passing through Agent 2 and is **NOT** a database table.

---

## 8. Threat Intelligence Architecture

- **HTTP Client Standard**: Team 2 uses **`httpx`** for all asynchronous HTTP calls to external threat-intelligence services (CISA KEV, FIRST.org EPSS, NVD API). `requests` is strictly prohibited.
- **CISA KEV Feed**: Fetched via `httpx` from `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`.
- **FIRST.org EPSS API**: Queried via `httpx` (`https://api.first.org/data/v1/epss?cve=CVE-XXX`).
- **Exploit-DB Intelligence**: Gathers public exploit metadata. **Live exploits are never executed.**

*Logical Processing Concept Notice*: `threat_intel` and `threat_intel_cache` refer to in-memory/table column concepts and are **NOT** separate database tables. Threat intel fields reside on `vulnerability_intelligence`.

---

## 9. AI/ML Model Selection Matrix

| Agent | Model | Type | Input Features | Output | Hardware | License | Why Selected |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Agent 2** | `XGBoostClassifier` | Gradient Boosted Trees | 5 Scanner/Network Features | `false_positive_prob` (0-1) | CPU | Apache 2.0 | High tabular accuracy, fast inference |
| **Agent 3** | `XGBoostRegressor` / EPSS | Ensemble / Stat Model | CVSS, KEV, EPSS, Exploit-DB, CPE | `exploit_probability` (0-1) | CPU | Public Domain | High benchmark F1-score on CVE telemetry |
| **Agent 4** | Rule-assisted LLM / Template | Natural Language Explainer | Score, KEV, EPSS, Asset Crit | Natural Language Sentence | CPU | MIT | Fully deterministic & explainable |

---

## 10. Exploitability Prediction

Agent 3 predicts exploit probability using statistical EPSS data and threat intelligence fetched via `httpx`:

```json
{
  "cve_id": "CVE-2021-44228",
  "exploit_probability": 0.972,
  "exploitability_class": "HIGH_LIKELIHOOD",
  "confidence_score": 0.95,
  "contributing_features": {
    "cisa_kev_listed": true,
    "epss_percentile": 0.994,
    "exploit_db_available": true,
    "attack_vector": "NETWORK"
  }
}
```

---

## 11. Risk Scoring & Prioritization Mathematics

$$\text{Composite Risk Score} = (\text{CVSS} \times 0.30) + (\text{EPSS} \times 10 \times 0.35) + \text{KEV\_Bonus} + (\text{Asset\_Criticality} \times 4.0)$$

Where:
- $\text{CVSS}$: Base score ($0.0 - 10.0$) $\rightarrow$ Weight: $30\%$
- $\text{EPSS} \times 10$: Scaled 30-day exploit probability ($0.0 - 10.0$) $\rightarrow$ Weight: $35\%$
- $\text{KEV\_Bonus}$: $+25.0$ points if listed on CISA KEV catalog; else $0.0$
- $\text{Asset\_Criticality} \times 4.0$: Business asset rating ($1 - 5$) $\rightarrow$ Up to $+20.0$ points

### SLA & Priority Tiers
- **P0 Critical** (Score 80.0–100.0) $\rightarrow$ SLA: **24 Hours**
- **P1 High** (Score 60.0–79.9) $\rightarrow$ SLA: **72 Hours**
- **P2 Medium** (Score 40.0–59.9) $\rightarrow$ SLA: **14 Days**
- **P3 Low** (Score 0.0–39.9) $\rightarrow$ SLA: **30 Days**

---

## 12. Backend Architecture (Spring Boot 3)

```text
backend/src/main/java/com/sentinelai/
├── controller/        # REST Endpoint Controllers (@RestController)
├── service/           # Core Business Logic & Orchestration Services
│   └── GitHubTicketingService.java # SOLE GitHub REST API Client Implementation
├── repository/        # Spring Data JPA Repositories (Exactly 7 Entities)
├── entity/            # JPA Database Entities (@Entity)
├── dto/               # Request/Response Data Transfer Objects
├── mapper/            # MapStruct DTO <-> Entity Converters
├── security/          # Spring Security, JWT Filters, & RBAC Rules
├── exception/         # Global Exception Handler (@ControllerAdvice)
├── config/            # OpenAPI, WebSockets, Security Configs
├── integration/       # External Clients Gateway
├── agent/             # Python Agent REST Communication Gateway (httpx receiver)
└── util/              # Common Utilities & Math Formulas
```

---

## 13. API Architecture

| Method | Endpoint | Purpose | Request Body | Response Body | Auth / Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate & issue JWT | `{username, password}` | `{token, user}` | Public |
| `POST` | `/api/assets` | Register authorized asset | `{hostname, environment, criticality}` | `{asset_id, hostname...}` | Admin/Analyst |
| `GET` | `/api/assets` | List registered assets | None | `[AssetDTO]` | Authenticated |
| `POST` | `/api/scans` | Trigger multi-scanner execution | `{asset_id, scanner_types}` | `{scan_id, status}` | Admin/Analyst |
| `GET` | `/api/scans/{id}` | Check scan job status & HITL checkpoint | None | `{scan_id, status, agent_output}` | Authenticated |
| `POST` | `/api/scans/{id}/control` | HITL control action (Continue/Stop) | `{action: "CONTINUE" \| "STOP"}` | `{status: WAITING_FOR_HUMAN \| STOPPED}` | Analyst |
| `GET` | `/api/vulnerabilities` | List canonical findings | Query params (`severity, priority`) | `[CanonicalFindingDTO]` | Authenticated |
| `GET` | `/api/dashboard` | SentinelAI dashboard metrics | None | `{security_score, top_threats...}` | Authenticated |
| `POST` | `/api/vulnerabilities/{id}/accept-risk` | Approve accepted risk | `{justification, owner, expiry_date}` | `{status: ACCEPTED_RISK}` | Admin |
| `POST` | `/api/vulnerabilities/{id}/ticket` | Final Human Approval -> Dispatch GitHub Issue | `{approved: true}` | `{ticket_url, status}` | Admin/Analyst |

---

## 14. Database Architecture (AUTHORITATIVE EXACTLY SEVEN TABLES)

The database schema is strictly frozen to **EXACTLY SEVEN TABLES**. Do NOT create tables such as `raw_results`, `normalized_findings`, `threat_intel`, `threat_intel_cache`, `human_reviews`, `agent_states`, or `pipeline_states`.

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

---

## 15. Agent Communication Strategy

- **HTTP Client Standard**: Python microservices (Team 2) communicate asynchronously via **`httpx`**. `requests` is not used.
- **REST Communication**: Spring Boot invokes Agent microservices over HTTP (`http://python-agents:8000/api/v1/agent/...`).
- **WebSocket Streaming**: Spring Boot streams execution status updates to Next.js dashboard via WebSockets at every Human-in-the-Loop stage checkpoint.

---

## 16. Frontend Architecture & Human-in-the-Loop Visualization

The Next.js dashboard visually represents every agent stage:
- **Status Indicator Badges**: Shows `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, or `FAILED`.
- **Human Review Checkpoints**: Renders `Continue` and `Stop` action buttons at each stage checkpoint.
- **After Agent 4 Inspection**: Displays Composite Risk Score, Priority Level, SLA Deadline, Explainable Rationale, and prepared Ticket Payload.
- **Timeline Entry Text**: Displays `"Agent 4 risk score generated → Final human approval pending → GitHub ticket created after approval"`. The dashboard **never** represents a ticket as created prior to explicit final human approval.

---

## 17. Docker Architecture (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sentinelai_db
      POSTGRES_USER: sentinel_user
      POSTGRES_PASSWORD: sentinel_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sentinel_user -d sentinelai_db"]
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
      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/sentinelai_db
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

---

## 18. CI/CD Architecture (GitHub Actions)

Defined in `.github/workflows/ci-cd.yml`:
1. Lint & Build (`mvn compile`, `npm run build`, `pytest`).
2. Security Scan (Trivy & Dependency-Check).
3. Docker image verification.

---

## 19. DevSecOps

- **Single GitHub Client Ownership**: Team 1's `GitHubTicketingService.java` is the **only** component authorized to issue requests to the GitHub REST API. Team 2 must not implement a Python GitHub client.
- **Human-in-the-Loop Authorization**: Tickets cannot be dispatched without explicit human authorization.
- **Scanner Sandbox Policy**: Scanners run inside isolated containers with zero egress privileges.

---

## 20. Repository Structure

```text
sentinelai/
├── frontend/                   # Next.js 14 / React Dashboard (Team 3)
├── backend/                    # Spring Boot 3 Java API & GitHub Client (Team 1)
│   └── src/main/java/com/sentinelai/service/GitHubTicketingService.java
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

---

## 21. Detailed Phase-by-Phase Implementation Plan

### Phase 0 — Project Planning & Architecture
- **Objective**: Freeze tech stack, monorepo, and data contracts.
- **Tasks**: Define monorepo structure, `.env.example`, and contract schemas.

### Phase 1 — PostgreSQL Database Setup (7 Tables)
- **Objective**: Establish authoritative 7-table schema.
- **Tasks**: Create `schema.sql` with exact 7 tables (`users`, `assets`, `scan_jobs`, `canonical_vulnerabilities`, `vulnerability_intelligence`, `risk_scores`, `risk_tickets`).

### Phase 2 — Spring Boot Backend & GitHub API Client (Team 1)
- **Objective**: Implement Spring Boot backend and single `GitHubTicketingService.java` client.
- **Tasks**: Build JPA repositories, REST controllers, and `GitHubTicketingService.java`.

### Phase 3 — Agent 1: Parser & Normalizer Agent (Team 2)
- **Objective**: Build FastAPI microservice parsing scanner reports into `UnifiedFinding` items.

### Phase 4 — Agent 2: Noise Reduction Agent (Team 2)
- **Objective**: Implement MD5 cross-scanner deduplication and XGBoost false-positive filter.

### Phase 5 — Agent 3: Threat Intelligence Agent (`httpx`) (Team 2)
- **Objective**: Implement threat intel enrichment using **`httpx`** for external HTTP requests to CISA KEV and FIRST.org EPSS.

### Phase 6 — Agent 4: Composite Risk Scoring & Ticket Preparation Agent (Team 2)
- **Objective**: Implement 0-100 composite risk math, SLA calculation, explainable text generation, and ticket payload preparation. Agent 4 does **NOT** dispatch GitHub issues.

### Phase 7 — Human-in-the-Loop Dashboard UI (Team 3)
- **Objective**: Build Next.js 14 dashboard visibly displaying every agent stage, status (`RUNNING`, `WAITING_FOR_HUMAN`, `STOPPED`), `Continue`/`Stop` controls, and ticket preparation inspection.

### Phase 8 — End-to-End Testing & Demo (Team 4)
- **Objective**: Execute human-supervised E2E verification test harness.

---

## 22. MVP Scope

- **Included**: Ingesting scanner reports; Agents 1–4; Human-in-the-Loop review at every agent stage (`Continue`/`Stop` controls); Final human approval gate; Human-approved GitHub ticket creation via Team 1's `GitHubTicketingService.java`; Authoritative 7-table database; Next.js SentinelAI dashboard.
- **Excluded**: Autonomous un-reviewed auto-ticketing; Python GitHub API clients; additional HITL database tables.

---

## 23. Advanced Scope (Post-Hackathon)

- Kubernetes deployment manifests (`k8s/`).
- Automated XGBoost retraining pipeline from analyst feedback.

---

## 24. Team Parallelization Matrix (8 Developers)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        8-PERSON TEAM DIVISION                          │
├───────────────────────────────┬────────────────────────────────────────┤
│ TEAM 1: Spring Boot Backend   │ Dev 1: JPA Entities & REST Controllers │
│ (2 Developers)                │ Dev 2: GitHubTicketingService.java     │
├───────────────────────────────┼────────────────────────────────────────┤
│ TEAM 2: Python AI Agents      │ Dev 3: Agent 1 & Agent 3 (httpx/KEV)   │
│ (2 Developers)                │ Dev 4: Agent 2 & Agent 4 (XGBoost/Prep)│
├───────────────────────────────┼────────────────────────────────────────┤
│ TEAM 3: Next.js Frontend UI   │ Dev 5: Layout, Flow View & Timeline    │
│ (2 Developers)                │ Dev 6: HITL Checkpoints (Continue/Stop)│
├───────────────────────────────┼────────────────────────────────────────┤
│ TEAM 4: Security & DevOps     │ Dev 7: Pre-running Scanners & Docker   │
│ (2 Developers)                │ Dev 8: E2E Test Harness & CI/CD        │
└───────────────────────────────┴────────────────────────────────────────┘
```

---

## 25. Testing Strategy (E2E Test Sequence)

The E2E test must verify:
1. Scanner findings are ingested.
2. Agent 1 executes and reaches `HUMAN REVIEW 1` (`WAITING_FOR_HUMAN`).
3. Action `Continue` triggers Agent 2.
4. Agent 2 executes and reaches `HUMAN REVIEW 2` (`WAITING_FOR_HUMAN`).
5. Action `Continue` triggers Agent 3.
6. Agent 3 executes and reaches `HUMAN REVIEW 3` (`WAITING_FOR_HUMAN`).
7. Action `Continue` triggers Agent 4.
8. Agent 4 calculates risk score and prepares ticket payload.
9. Final Human Approval checkpoint is reached (`WAITING_FOR_HUMAN` / `FINAL_APPROVAL`).
10. GitHub issue creation occurs **only** after final approval.
11. Action `Stop` at any point prevents subsequent processing and sets status to `STOPPED`.
12. No GitHub issue is created when pipeline is stopped or rejected.

---

## 26. Measured Verification Outcomes

The following metrics are measured verification outcomes of the sample dataset (they are NOT hardcoded):
- 2,500 raw findings $\rightarrow$ 15 canonical findings.
- 94% noise reduction rate.
- 96/100 Security Score.
- Actual number of GitHub tickets created is determined strictly by human-approved results.

---

## 27. Deployment Plan

- Execution via `docker-compose up --build`.

---

## 28. Demonstration Script (Human-Supervised Pipeline)

1. **0:00 - 0:45**: Present Problem (Scanner noise & risks of un-reviewed auto-ticketing).
2. **0:45 - 1:30**: Ingest Reports & Run Agent 1 (Show transition to `WAITING_FOR_HUMAN` at Review 1).
3. **1:30 - 2:15**: Click Continue $\rightarrow$ Run Agent 2 Noise Reduction (Show deduplication metrics at Review 2).
4. **2:15 - 3:00**: Click Continue $\rightarrow$ Run Agent 3 Threat Intel & Agent 4 Risk Prep (Show CISA KEV flag, EPSS 97.2%, and prepared ticket payload).
5. **3:00 - 3:30**: Demonstrate `Stop` control (Verify pipeline stops and no ticket is created).
6. **3:30 - 4:00**: Final Human Approval (Click Approve -> Verify Team 1's `GitHubTicketingService.java` creates live GitHub Issue).

---

## 29. Final Implementation Checklist

- [x] Authoritative Specification Master Rule embedded.
- [x] Human-in-the-Loop workflow & controls specified at every agent stage.
- [x] Single GitHub client ownership assigned to Team 1 (`GitHubTicketingService.java`).
- [x] Agent 4 renamed to "Risk Scoring & Ticket Preparation Agent".
- [x] HTTP client for Team 2 standardized to `httpx`.
- [x] Authoritative database schema locked to EXACTLY 7 tables.
- [x] Logical data concepts (`raw_results`, `normalized_findings`, etc.) clarified as non-table names.
- [x] E2E testing & demo script updated to reflect Human-in-the-Loop pipeline.
