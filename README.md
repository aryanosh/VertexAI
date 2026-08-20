# VertexAI: AI-Driven Vulnerability Management & Prioritization Platform

> **Master Specification**: Authoritative implementation blueprint for VertexAI (Cognizant Activity 4). Human-supervised multi-agent cybersecurity platform solving Alert Fatigue and Scanner Noise across enterprise infrastructure.

---

## 1. Overview

**VertexAI** bridges raw security vulnerability detection and actionable engineering remediation through **4 Specialized AI Agents** under strict **Human-in-the-Loop (HITL) Supervision**:

1. **Agent 1 (AI Scanning Agent — Parser & Normalizer)**: Multi-scanner output ingestion (Nmap, OWASP ZAP, Nuclei, OpenVAS) and schema normalization. *(HITL Checkpoint: Review 1)*
2. **Agent 2 (AI Noise Reduction Agent)**: Cryptographic cross-scanner deduplication (MD5), XGBoost false-positive filtering, and accepted-risk policy enforcement. *(HITL Checkpoint: Review 2)*
3. **Agent 3 (AI Exploitability Prediction Agent)**: Threat intelligence enrichment (CISA KEV, FIRST.org EPSS via `httpx`, NVD, Exploit-DB) and exploit probability estimation. *(HITL Checkpoint: Review 3)*
4. **Agent 4 (AI Risk Scoring & Ticket Preparation Agent)**: Contextual 0–100 composite risk scoring, business-impact ranking, SLA assignment, explainable rationale, and ticket payload preparation. *(HITL Checkpoint: Final Approval)*

After explicit Final Human Approval, Team 1's `GitHubTicketingService.java` creates the GitHub Issue via the GitHub REST API.

---

## 2. Platform Architecture & Service Ports

VertexAI runs as an integrated multi-service containerized architecture orchestrated via Docker Compose:

| Service | Technology Stack | Container Name | Port Mapping | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | PostgreSQL 16 Alpine | `vertexai-postgres` | `5433:5432` | Authoritative 7-table database (host port **5433**) |
| **Python Agents** | Python 3.11 / FastAPI | `vertexai-agents` | `8000:8000` | AI Agents 1–4 microservices |
| **Backend API** | Java 17 / Spring Boot 3 | `vertexai-backend` | `8080:8080` | Core API, Orchestration, Auth, GitHub Client |
| **Frontend UI** | Next.js 14 / React 18 | `vertexai-frontend` | `3000:3000` | HITL Dashboard, Flow View, Live Controls |

---

## 3. Monorepo Structure

```text
vertexai/
├── .github/workflows/ci-cd.yml   # Team 4: 4-Stage CI/CD pipeline (Lint, Test, Scan, Build)
├── backend/                      # Team 1: Spring Boot 3 Core Backend & GitHub Client
├── agents_service/               # Team 2: Python 3.11 AI Agents (FastAPI & httpx)
├── frontend/                     # Team 3: Next.js 14 Human-in-the-Loop Dashboard
├── database/                     # Team 1 & 4: PostgreSQL 7-Table Schema & Init
├── sample_reports/               # Team 4: Canonical raw scanner outputs (Nmap, ZAP, Nuclei, OpenVAS)
├── scripts/                      # Team 4: End-to-End verification harness (test_e2e_pipeline.sh)
├── docs/                         # Architecture guides, integration specs, and demo scripts
├── docker-compose.yml            # Team 4: Multi-container orchestration
├── .env.example                  # Team 4: Authoritative environment variable template
└── README.md                     # Team 4: Master repository guide
```

---

## 4. Prerequisites

- **Docker Desktop** (version 24.0+ recommended)
- **Docker Compose** (version 2.20+)
- **Git**

---

## 5. Quick Start (Local Setup)

### 1. Clone & Setup Environment
```bash
git clone https://github.com/aryanosh/VertexAI.git
cd VertexAI
cp .env.example .env
```
*(Configure any required tokens in `.env` such as `GITHUB_TOKEN` and `GITHUB_REPO`)*

### 2. Build & Launch Containers
```bash
docker-compose up --build
```

### 3. Access Services
- **Dashboard UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:8080](http://localhost:8080)
- **Backend Swagger Docs**: [http://localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html)
- **Python Agents Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Database**: `localhost:5433` (`vertexai_db`)

---

## 6. End-to-End Testing & Verification

Run the automated E2E pipeline verification harness:
```bash
bash scripts/test_e2e_pipeline.sh
```

The E2E test validates:
- Ingestion of 2,500 raw scanner findings across all 4 scanners.
- Agent 1 parsing & normalization with Human Review 1 checkpoint.
- Agent 2 noise reduction & deduplication with Human Review 2 checkpoint.
- Agent 3 threat intelligence enrichment with Human Review 3 checkpoint.
- Agent 4 composite risk scoring and ticket preparation.
- Final Human Approval gate enforcement.
- Automated creation of GitHub issue upon approval.
- Stop control behavior halting subsequent agent execution.

---

## 7. Team Ownership & Integration Rules

- **Team 1 (Backend & DB)**: Owns `backend/`, `schema.sql` content, sole `GitHubTicketingService.java`.
- **Team 2 (AI Engine)**: Owns `agents_service/` (Agents 1–4, FastAPI, `httpx`). Does NOT call GitHub API.
- **Team 3 (Frontend UI)**: Owns `frontend/` (Next.js dashboard, HITL controls).
- **Team 4 (DevOps & E2E)**: Owns `sample_reports/`, `docker-compose.yml`, `.github/workflows/ci-cd.yml`, `scripts/test_e2e_pipeline.sh`, `.env.example`, `README.md`, and `docs/demo_script.md`.
