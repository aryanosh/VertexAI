# VertexAI — Risk Prioritization & Deduplication

VertexAI is a human-supervised vulnerability triage platform for security and engineering teams that converts noisy multi-scanner findings into deduplicated, threat-enriched, prioritized remediation work.

[![CI](https://img.shields.io/badge/CI-placeholder-lightgrey)](https://github.com/aryanosh/VertexAI/actions) [![Coverage](https://img.shields.io/badge/coverage-placeholder-lightgrey)](#ci--testing) [![License](https://img.shields.io/badge/license-placeholder-lightgrey)](#license--contact)

## Table of Contents

* [Key Features](#key-features)
* [What This Is For](#what-this-is-for)
* [Stack](#stack)
* [Repository Layout](#repository-layout)
* [How It Fits Together](#how-it-fits-together)
* [Quick Start](#quick-start)
* [Services & Endpoints](#services--endpoints)
* [Environment Variables](#environment-variables)
* [Running Verification & Tests](#running-verification--tests)
* [Development Notes](#development-notes)
* [CI & Testing](#ci--testing)
* [Security & Operational Considerations](#security--operational-considerations)
* [Contributing](#contributing)
* [Ownership / Governance](#ownership--governance)
* [Useful Links & Assets](#useful-links--assets)
* [Try Asking](#try-asking)
* [Files Referenced While Generating This README](#files-referenced-while-generating-this-readme)
* [License & Contact](#license--contact)

## Key Features

* Multi-scanner ingestion for Nmap, OWASP ZAP, Nuclei, and OpenVAS.
* Agent 1 normalization into a shared vulnerability schema.
* Agent 2 cross-scanner deduplication using deterministic fingerprints and XGBoost-based false-positive scoring.
* Agent 3 threat-intelligence enrichment using CISA KEV, FIRST EPSS, NVD, and Exploit-DB, with mock-fixture and agentic/deterministic modes.
* Agent 4 deterministic composite risk scoring, P0–P3 prioritization, SLA calculation, explainable rationale, and ticket preparation.
* Human-in-the-Loop checkpoints between pipeline stages, including explicit `CONTINUE` and `STOP` controls.
* Final human approval gate before GitHub issue creation.
* Next.js dashboard with live pipeline state and WebSocket support.
* PostgreSQL persistence for scan state, canonical vulnerabilities, risk scores, tickets, and deduplication audit data.
* Docker Compose orchestration for the complete local stack.
* E2E verification harness covering the full HITL workflow.

## What This Is For

VertexAI is intended for:

* Security operations and vulnerability-management teams managing large scanner volumes.
* SRE and engineering teams that need prioritized remediation rather than raw alert streams.
* Reviewers who require explainable risk decisions and explicit human approval before external ticket creation.
* Developers integrating scanner data into a controlled vulnerability-management workflow.

## Stack

| Area               | Technology                                                       |
| ------------------ | ---------------------------------------------------------------- |
| Frontend           | Next.js 14.2.35, React 18, TypeScript                            |
| Backend            | Java 17, Spring Boot 3.2.5, Spring Web, JPA, Security, WebSocket |
| AI/Agent service   | Python 3.11, FastAPI, Uvicorn                                    |
| Database           | PostgreSQL 16                                                    |
| ML                 | XGBoost 2.1.4, scikit-learn 1.6.1, pandas 2.2.3                  |
| HTTP / Intel       | httpx 0.28.1                                                     |
| Authentication     | JWT via JJWT 0.12.5, BCrypt-backed password handling             |
| API documentation  | Springdoc OpenAPI / Swagger                                      |
| Frontend utilities | Tailwind CSS, Anime.js, Chart.js, Lucide React, MSW              |
| Runtime            | Docker / Docker Compose                                          |
| CI                 | GitHub Actions and GitLab CI configuration                       |

The agent dependency versions are pinned in `agents_service/requirements.txt`, and the Java dependencies are defined in `backend/pom.xml`.

## Repository Layout

```text
.
├── .github/
│   └── workflows/
│       └── ci-cd.yml                    # GitHub Actions build/test/security pipeline
├── .env.example                         # Single environment template for the stack
├── .gitlab-ci.yml                       # GitLab CI build/test configuration
├── agents_service/                      # Python FastAPI multi-agent service
│   ├── main.py                          # FastAPI application, /health, /agent-runtime
│   ├── agent1_parser.py                 # Scanner parsing + normalization
│   ├── agent1_tools.py                  # Agent 1 investigation tools
│   ├── agent2_noise.py                  # Deduplication + XGBoost FP scoring
│   ├── agent2_tools.py                  # Agent 2 investigation tools
│   ├── agent3_threat.py                 # Threat-intelligence enrichment
│   ├── agent3_tools.py                  # CISA / EPSS / NVD / Exploit-DB tools
│   ├── agent4_scoring.py                # Risk scoring + ticket preparation
│   ├── agent4_tools.py                  # Agent 4 investigation tools
│   ├── agent_runtime.py                 # Agentic runtime and model integration
│   ├── agent_schemas.py                 # Shared Pydantic schemas
│   ├── verify_pipeline.py               # Agent-level end-to-end verification
│   ├── requirements.txt                  # Python dependencies
│   ├── Dockerfile                        # Python 3.11 container
│   └── mocks/                            # Offline agent fixtures
├── backend/
│   ├── pom.xml                           # Spring Boot / Java 17 build definition
│   ├── Dockerfile                        # Maven build + JRE runtime image
│   └── src/
│       ├── main/java/com/vertexai/
│       │   ├── controller/
│       │   │   ├── AuthController.java
│       │   │   ├── AssetController.java
│       │   │   ├── ScanController.java
│       │   │   ├── VulnerabilityController.java
│       │   │   └── DashboardController.java
│       │   ├── service/
│       │   │   ├── PipelineOrchestrator.java
│       │   │   └── GitHubTicketingService.java
│       │   └── agent/
│       │       ├── HttpAgentClient.java
│       │       └── MockAgentClient.java
│       └── main/resources/
│           ├── application.yml
│           ├── schema.sql
│           └── mocks/
├── frontend/
│   ├── package.json                      # Next.js scripts and dependencies
│   ├── Dockerfile
│   └── src/
│       ├── app/
│       │   ├── page.tsx                  # Application entry page
│       │   ├── layout.tsx
│       │   ├── dashboard/
│       │   ├── findings/
│       │   ├── pipeline/
│       │   ├── reports/
│       │   └── uploads/
│       ├── components/
│       ├── lib/
│       ├── mocks/
│       └── types/
├── sample_reports/
│   ├── nmap_scan.xml
│   ├── nuclei_scan.jsonl
│   ├── openvas_scan.xml
│   └── zap_scan.json
├── scripts/
│   └── test_e2e_pipeline.sh              # Full backend/HITL verification harness
├── docs/
│   └── demo_script.md                    # Live demonstration walkthrough
├── docker-compose.yml                    # Five-service local orchestration
├── architecture_plan.md                  # Architecture reference
├── BACKEND_EXPLAINED.md                  # Backend implementation notes
├── PRESENTATION_PLAN.md                  # Presentation planning
├── VertexAI_Project_Presentation_Overview.pdf
└── README.md
```

The frontend uses `frontend/src/app/page.tsx` as its Next.js app entry page; the previous root-level `frontend/app/page.tsx` path referenced by the older README is not present in the current repository structure.

## How It Fits Together

A scan is created through the Spring Boot backend in `ScanService`, which persists the scan and starts the asynchronous `PipelineOrchestrator` after transaction commit. The orchestrator calls the Python agents through `HttpAgentClient`: Agent 1 parses scanner reports, Agent 2 deduplicates and suppresses likely false positives, Agent 3 enriches findings with threat intelligence, and Agent 4 calculates risk and prepares a remediation ticket. The frontend exposes the HITL controls and pipeline state, while PostgreSQL stores authoritative scan and vulnerability state.

Agent 1 accepts ZAP, Nuclei, OpenVAS, and Nmap inputs and standardizes them into a unified finding structure. Agent 2 fingerprints findings using `target_host:target_port:cve_id`, then uses XGBoost or the documented fallback heuristic for false-positive probability. Agent 3 supports live feeds or bundled mocks, and Agent 4 derives explainable output from the same scoring components used for the risk score.

## Quick Start

### Prerequisites

* Git
* Docker Desktop or Docker Engine with Docker Compose v2
* For service-level development:

  * Java 17 + Maven
  * Python 3.11
  * Node.js 18+

### Full stack with Docker

```bash
git clone https://github.com/aryanosh/VertexAI.git
cd VertexAI

cp .env.example .env
# Edit .env and replace development credentials / tokens as required.

docker-compose up --build
```

The Compose stack defines PostgreSQL, the Python agents, Spring Boot backend, Next.js frontend, and scanner sandbox.

### Local backend

Start PostgreSQL first, then from the repository root:

```bash
cd backend
mvn spring-boot:run
```

The backend is configured for host PostgreSQL port `5433` during local development. `backend/src/main/resources/application.yml` loads `schema.sql` automatically.

### Local agents service

```bash
cd agents_service

python3.11 -m venv .venv

# Linux/macOS
source .venv/bin/activate

# Windows PowerShell
# .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

uvicorn main:app --host 0.0.0.0 --port 8000
```

The container uses the same Python 3.11 runtime and launches `uvicorn main:app` on port 8000.

### Local frontend

```bash
cd frontend
npm ci
npm run dev
```

Then open `http://localhost:3000`. The frontend also supports `yarn dev` and `pnpm dev` according to `frontend/README.md`.

## Services & Endpoints

| Service         | Host port | Main purpose                                                                    |
| --------------- | --------: | ------------------------------------------------------------------------------- |
| Frontend        |    `3000` | Next.js HITL dashboard                                                          |
| Backend         |    `8080` | REST API, pipeline orchestration, authentication, persistence, GitHub ticketing |
| Agents          |    `8000` | Four FastAPI agent stages                                                       |
| PostgreSQL      |    `5433` | Persistent database; container listens on `5432`                                |
| Scanner sandbox |    `9000` | SAST / dependency / secret scanning sandbox                                     |

Ports are defined in `docker-compose.yml`.

### Backend API

Authentication:

```http
POST /api/auth/login
POST /api/auth/change-password
```

Asset management:

```http
POST /api/assets
GET  /api/assets
GET  /api/assets/{id}
```

Scan lifecycle:

```http
POST /api/scans
GET  /api/scans/{id}
GET  /api/scans/latest
POST /api/scans/{id}/control
POST /api/scans/upload
GET  /api/scans/{id}/dedup-report
GET  /api/scans/{id}/dedup-report.csv
```

Vulnerabilities and ticketing:

```http
GET  /api/vulnerabilities
GET  /api/vulnerabilities/{id}
POST /api/vulnerabilities/{id}/accept-risk
POST /api/vulnerabilities/{id}/ticket
```

Dashboard:

```http
GET /api/dashboard
```

The controller implementations are in `backend/src/main/java/com/vertexai/controller/`.

### Python agents

FastAPI health:

```http
GET /health
GET /agent-runtime
```

Agent routes:

```http
POST /api/v1/agent1/parse
POST /api/v1/agent2/reduce-noise
POST /api/v1/agent3/enrich
POST /api/v1/agent4/score-and-ticket
```

Interactive API documentation is available at:

```text
http://localhost:8000/docs
```

The exact router prefixes are defined in the four agent modules and registered by `agents_service/main.py`.

### Basic health checks

```bash
curl http://localhost:8000/health
curl http://localhost:8000/agent-runtime
```

Example `health` response:

```json
{
  "status": "UP",
  "service": "python-agents"
}
```

## Environment Variables

`.env.example` is the authoritative stack-level configuration template. It is intended to be copied to `.env`; real credentials must not be committed.

| Variable                | Description                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| `POSTGRES_DB`           | PostgreSQL database name                                                   |
| `POSTGRES_USER`         | PostgreSQL username                                                        |
| `POSTGRES_PASSWORD`     | PostgreSQL password                                                        |
| `POSTGRES_PORT`         | Host PostgreSQL port; Compose maps `5433:5432`                             |
| `DB_HOST`               | Backend database hostname for local execution                              |
| `DB_PORT`               | Backend database port for local execution                                  |
| `DB_NAME`               | Backend database name                                                      |
| `DB_USER`               | Backend database username                                                  |
| `DB_PASSWORD`           | Backend database password                                                  |
| `JWT_SECRET`            | JWT signing secret; use a long random value in real deployments            |
| `JWT_EXPIRATION_MS`     | JWT lifetime in milliseconds                                               |
| `ADMIN_PASSWORD`        | Development admin seed password                                            |
| `ANALYST_PASSWORD`      | Development analyst seed password                                          |
| `VIEWER_PASSWORD`       | Development viewer seed password                                           |
| `GITHUB_TOKEN`          | GitHub token used for final issue creation; blank disables ticket dispatch |
| `GITHUB_REPO_OWNER`     | GitHub repository owner                                                    |
| `GITHUB_REPO_NAME`      | GitHub repository name                                                     |
| `AGENTS_PORT`           | Python agent service port                                                  |
| `AGENTS_SERVICE_URL`    | Backend-to-agents service URL                                              |
| `BACKEND_URL`           | Agents-to-backend service URL                                              |
| `USE_MOCKS`             | Enables bundled Agent 3 threat-intel fixtures when `true`                  |
| `CISA_KEV_URL`          | CISA Known Exploited Vulnerabilities feed                                  |
| `FIRST_EPSS_URL`        | FIRST.org EPSS API                                                         |
| `NVD_API_URL`           | NVD CVE API                                                                |
| `EXPLOITDB_CSV_URL`     | Exploit-DB CSV source                                                      |
| `LLM_ENABLED`           | Enables Agent 3 agentic reasoning                                          |
| `NVIDIA_API_KEY`        | NVIDIA NIM-compatible API key                                              |
| `NVIDIA_BASE_URL`       | OpenAI-compatible NVIDIA API base URL                                      |
| `NVIDIA_MODEL`          | Agentic model identifier                                                   |
| `LLM_ENABLE_THINKING`   | Enables recorded model reasoning mode                                      |
| `LLM_REASONING_BUDGET`  | Reasoning token budget                                                     |
| `LLM_TOP_P`             | LLM sampling `top_p`                                                       |
| `LLM_MAX_TOKENS`        | Maximum generated tokens                                                   |
| `AGENT_TIMEOUT_SECONDS` | Overall agent execution limit                                              |
| `AGENT_MAX_ITERATIONS`  | Maximum agentic loop iterations                                            |
| `LLM_REQUEST_TIMEOUT`   | Individual LLM request timeout                                             |
| `LLM_TEMPERATURE`       | LLM sampling temperature                                                   |
| `INTEL_HTTP_TIMEOUT`    | Threat-intelligence HTTP timeout                                           |
| `AGENT3_CONCURRENCY`    | Maximum concurrent Agent 3 CVE investigations                              |
| `AGENT3_MAX_CVES`       | Maximum CVEs treated through the agentic path per request                  |
| `FRONTEND_PORT`         | Frontend port                                                              |
| `NEXT_PUBLIC_API_URL`   | Browser-visible backend URL                                                |
| `NEXT_PUBLIC_WS_URL`    | Browser-visible pipeline WebSocket URL                                     |
| `SCAN_TIMEOUT_SECONDS`  | Scanner sandbox timeout                                                    |

Do not place credentials behind `NEXT_PUBLIC_*`; those values are embedded into the browser bundle at build time.

For the default Docker setup, the Compose file overrides container-internal connectivity to use `postgres:5432`, `backend:8080`, and `python-agents:8000`.

## Running Verification & Tests

### Agent pipeline verification

`agents_service/verify_pipeline.py` exercises all four agents with a representative Log4j finding:

```bash
cd agents_service
python verify_pipeline.py
```

The script covers:

1. Agent 1 parsing and normalization.
2. Agent 2 deduplication and XGBoost false-positive analysis.
3. Agent 3 threat-intelligence enrichment.
4. Agent 4 risk scoring and ticket preparation.
5. Final HITL approval boundary before ticket dispatch.

### Full E2E HITL harness

From the repository root:

```bash
bash scripts/test_e2e_pipeline.sh
```

For syntax/control-flow validation without making real backend requests:

```bash
E2E_DRY_RUN=true bash scripts/test_e2e_pipeline.sh
```

The harness exercises authentication, asset registration, scan creation, all HITL checkpoints, `CONTINUE`, `STOP`, final ticket approval, and the GitHub ticket endpoint. It uses:

```text
POST /api/auth/login
POST /api/assets
POST /api/scans
GET  /api/scans/{id}
POST /api/scans/{id}/control
GET  /api/vulnerabilities
POST /api/vulnerabilities/{id}/ticket
```

### CI-local checks

Backend:

```bash
cd backend
mvn clean verify
```

Agents:

```bash
cd agents_service
pip install -r requirements.txt
pytest tests -v
```

Frontend:

```bash
cd frontend
npm ci
npm run build
```

The repository’s GitLab pipeline runs equivalent backend tests, Python tests, and frontend builds.

## Development Notes

### Frontend

The frontend is a Next.js 14 application.

Entry point:

```text
frontend/src/app/page.tsx
```

Application routes include `dashboard`, `findings`, `pipeline`, `reports`, and `uploads` under `frontend/src/app/`.

Run locally:

```bash
cd frontend
npm ci
npm run dev
```

Useful scripts from `frontend/package.json`:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

The frontend uses React 18, Tailwind CSS, Anime.js, Chart.js, Lucide React, and MSW.

### Agents service

Core files:

```text
agents_service/main.py
agents_service/agent1_parser.py
agents_service/agent2_noise.py
agents_service/agent3_threat.py
agents_service/agent4_scoring.py
agents_service/agent_runtime.py
```

Install and run:

```bash
cd agents_service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Agent 1 supports ZAP, Nuclei, OpenVAS, and Nmap. When reports are omitted, it can load bundled fixtures such as `zap_scan.json`, `nuclei_scan.jsonl`, `openvas_scan.xml`, and `nmap_scan.xml`.

Agent 2 uses a deterministic fingerprint based on:

```text
target_host:target_port:cve_id
```

and groups findings by that fingerprint before calculating false-positive probabilities.

Agent 3 records whether enrichment came from `LIVE_FEEDS` or `MOCK_FIXTURES`, and whether the reasoning path was `AGENTIC`, `AGENTIC_PARTIAL`, or `DETERMINISTIC`.

Agent 4 produces a deterministic composite score and explainable rationale from CVSS, EPSS, CISA KEV state, asset criticality, and exploit availability.

### Backend

Spring Boot entry/build configuration:

```text
backend/pom.xml
backend/src/main/resources/application.yml
backend/src/main/resources/schema.sql
```

Run locally:

```bash
cd backend
mvn spring-boot:run
```

Build and test:

```bash
mvn clean verify
```

The pipeline orchestration is in:

```text
backend/src/main/java/com/vertexai/service/PipelineOrchestrator.java
```

The backend communicates with the Python service through:

```text
backend/src/main/java/com/vertexai/agent/HttpAgentClient.java
```

and can use:

```text
backend/src/main/java/com/vertexai/agent/MockAgentClient.java
```

for fixture-backed agent responses when the corresponding Spring configuration is enabled.

For GitHub ticket creation, start with:

```text
backend/src/main/java/com/vertexai/service/GitHubTicketingService.java
```

It requires explicit approval, checks that a `RiskScore` exists, then calls the GitHub Issues REST API only when a valid `GITHUB_TOKEN` is configured.

## CI & Testing

GitHub Actions is configured in:

```text
.github/workflows/ci-cd.yml
```

The workflow runs on pushes to `main`, `develop`, and `feature/**`, and on pull requests targeting `main` or `develop`.

Current stages include:

* Backend Java 17/Maven compilation.

* Python 3.11 dependency installation and syntax checks.

* Next.js frontend build.

* Backend and Python unit tests.

* Trivy filesystem scanning for `CRITICAL,HIGH`.

* OWASP Dependency-Check stage.

* Docker Compose configuration validation with `docker compose config`.

A GitLab CI configuration also exists in `.gitlab-ci.yml`; it runs backend Maven verification, Python pytest, and the frontend production build.

Note that the current CI configuration treats some security checks as non-blocking and the Trivy step uses `exit-code: '0'`. This means a scan finding is reported but does not fail that job by itself.

## Security & Operational Considerations

* Never commit `.env` or real secrets. `.env.example` intentionally contains development placeholders.
* Replace development values for `JWT_SECRET`, database passwords, and seed account passwords before any shared or production deployment.
* Use a narrowly scoped GitHub token. The repository template explicitly expects Issues read/write access only on the target repository.
* GitHub ticket creation is a security boundary: `GitHubTicketingService.createTicket(...)` rejects requests without explicit final approval and independently verifies that a risk score exists.
* `STOP` is an explicit pipeline control and should remain protected by the existing RBAC controls on `/api/scans/{id}/control`.
* Agent 3 mock mode is not live threat intelligence. With `USE_MOCKS=true`, bundled fixtures are used instead of live CISA/EPSS data.
* `NEXT_PUBLIC_*` variables are client-visible by design; never store credentials there.
* The scanner sandbox is configured as `privileged: true` in Compose. Treat it as an isolated execution boundary and do not expose it directly to untrusted networks without additional hardening.
* Agentic execution is bounded by timeout, iteration, concurrency, and CVE ceilings through `AGENT_TIMEOUT_SECONDS`, `AGENT_MAX_ITERATIONS`, `AGENT3_CONCURRENCY`, and `AGENT3_MAX_CVES`.
* Agent 3 explicitly requires tool-derived values and is instructed not to invent numeric intelligence values.

## Contributing

Use short-lived feature branches:

```text
feature/<change>
fix/<issue>
chore/<maintenance>
```

Before opening a pull request:

```bash
cd backend && mvn clean verify
cd ../agents_service && pytest tests -v
cd ../frontend && npm ci && npm run build
```

For pipeline changes, also run:

```bash
bash scripts/test_e2e_pipeline.sh
```

A PR should:

* Explain the change and affected service.
* Include tests for new agent, controller, service, or UI behavior.
* Identify whether the change affects HITL controls, risk scoring, threat intelligence, or ticket dispatch.
* Receive review from the owning team before merge.
* Avoid introducing secrets, hard-coded production endpoints, or bypasses around human-approval controls.

## Ownership / Governance

| Team   | Ownership              | Primary paths                                                                              |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------ |
| Team 1 | Backend & Database     | `backend/`, `backend/src/main/resources/schema.sql`, GitHub ticketing                      |
| Team 2 | AI Engine              | `agents_service/`, agent models, threat-intelligence logic                                 |
| Team 3 | Frontend               | `frontend/`, HITL UI and pipeline visualization                                            |
| Team 4 | DevOps, Scanners & E2E | `docker-compose.yml`, `sample_reports/`, `scripts/`, CI, scanner sandbox, operational docs |

`GitHubTicketingService.java` is the main implementation point for Team 1's external GitHub issue dispatch. `scripts/test_e2e_pipeline.sh` identifies itself as Team 4-owned.

## Useful Links & Assets

* Repository: `https://github.com/aryanosh/VertexAI`
* Architecture: `architecture_plan.md`
* Backend notes: `BACKEND_EXPLAINED.md`
* Implementation / supporting documentation: `docs/`
* Demonstration script: `docs/demo_script.md`
* Sample scanner data: `sample_reports/`
* Project presentation: `VertexAI_Project_Presentation_Overview.pdf`
* Existing implementation / presentation planning: `PRESENTATION_PLAN.md`
* Backend API documentation: `http://localhost:8080/swagger-ui.html` when the local application exposes Swagger UI
* Python agent API documentation: `http://localhost:8000/docs`

The current repository also contains frontend/UI assets and reference files outside the core runtime tree; inspect the repository root and `docs/` for the latest presentation and visual material.

## Try Asking

* How does `PipelineOrchestrator.java` enforce the Human-in-the-Loop stage transitions and prevent later agents from running after `STOP`?
* How does `agent2_noise.py` combine deterministic fingerprinting with XGBoost false-positive probability, and where is the deduplication audit exposed through `/api/scans/{id}/dedup-report`?
* What exact checks must pass before `GitHubTicketingService.java` can create a GitHub issue through `POST /api/vulnerabilities/{id}/ticket`?

## Files Referenced While Generating This README

* `.env.example`
* `.github/workflows/ci-cd.yml`
* `.gitlab-ci.yml`
* `README.md`
* `docker-compose.yml`
* `agents_service/main.py`
* `agents_service/agent1_parser.py`
* `agents_service/agent2_noise.py`
* `agents_service/agent3_threat.py`
* `agents_service/agent4_scoring.py`
* `agents_service/agent_runtime.py`
* `agents_service/requirements.txt`
* `agents_service/Dockerfile`
* `agents_service/verify_pipeline.py`
* `backend/pom.xml`
* `backend/Dockerfile`
* `backend/src/main/resources/application.yml`
* `backend/src/main/resources/schema.sql`
* `backend/src/main/java/com/vertexai/controller/AuthController.java`
* `backend/src/main/java/com/vertexai/controller/AssetController.java`
* `backend/src/main/java/com/vertexai/controller/ScanController.java`
* `backend/src/main/java/com/vertexai/controller/VulnerabilityController.java`
* `backend/src/main/java/com/vertexai/controller/DashboardController.java`
* `backend/src/main/java/com/vertexai/service/ScanService.java`
* `backend/src/main/java/com/vertexai/service/PipelineOrchestrator.java`
* `backend/src/main/java/com/vertexai/service/GitHubTicketingService.java`
* `backend/src/main/java/com/vertexai/agent/HttpAgentClient.java`
* `backend/src/main/java/com/vertexai/agent/MockAgentClient.java`
* `frontend/package.json`
* `frontend/README.md`
* `frontend/src/app/page.tsx`
* `scripts/test_e2e_pipeline.sh`
* `docs/demo_script.md`
* `sample_reports/nmap_scan.xml`
* `sample_reports/nuclei_scan.jsonl`
* `sample_reports/openvas_scan.xml`
* `sample_reports/zap_scan.json`
* `architecture_plan.md`
* `BACKEND_EXPLAINED.md`
* `PRESENTATION_PLAN.md`
* `VertexAI_Project_Presentation_Overview.pdf`

## License & Contact

License: no `LICENSE` file was identified during repository inspection. Add the project's chosen license before publishing the repository as an explicitly licensed open-source project.

Maintainer/contact: update this section with the preferred maintainer name, GitHub handle, or project contact address.

---

chore: update README (ready to commit)
