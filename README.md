# VertexAI — AI-Driven Vulnerability Prioritization & Deduplication

Reliable, explainable, human-supervised pipeline that converts raw scanner output into prioritized, actionable engineering tickets. VertexAI reduces alert fatigue and scanner noise by combining multi-scanner ingestion, deduplication, threat enrichment, and explainable composite risk scoring — with Human‑In‑The‑Loop (HITL) review checkpoints before any automated ticket creation.

## Key features
- Multi-scanner ingestion and normalization (Nmap, OWASP ZAP, Nuclei, OpenVAS)
- Cross-scanner deduplication and noise reduction (cryptographic hashing + ML filtering)
- Threat intelligence enrichment (CISA KEV, EPSS, NVD, Exploit-DB)
- Explainable 0–100 composite risk scoring and business-impact ranking
- Human-in-the-loop checkpoints before ticket creation and SLA assignment
- End-to-end demo and verification harness for reproducible testing
- Containerized, multi-service architecture orchestrated with Docker Compose

## What this is for
VertexAI is designed for security teams and SRE/engineering teams who need to turn noisy scanner output into prioritized remediation tasks while keeping humans in the loop for final validation and triage.

### Stack
- Languages: TypeScript (frontend), Java (backend), Python (AI agents)
- Backend: Java 17 + Spring Boot 3
- Agents: Python 3.11 + FastAPI (4 AI agent services)
- Frontend: Next.js (React)
- Database: PostgreSQL (containerized)
- Notable libraries/tools: FastAPI, httpx (agent tooling), Spring Boot Web, Next.js, Docker Compose

## Repository layout (annotated)
```
.
├── .github/                       # CI/CD pipeline & workflow configs
├── agents_service/                # Python FastAPI: 4 AI agents (parser, noise, threat, scoring)
│   ├── main.py                    # FastAPI app + health & runtime endpoints
│   ├── agent1_parser.py
│   ├── agent2_noise.py
│   ├── agent3_threat.py
│   ├── agent4_scoring.py
│   ├── agent_runtime.py
│   ├── agent_schemas.py
│   └── requirements.txt
├── backend/                        # Java Spring Boot backend (orchestration & GitHub client)
│   ├── pom.xml
│   └── src/...                     # controllers, services, repositories, security, etc.
├── frontend/                       # Next.js HITL dashboard and flow controls
├── database/                       # DB schema, init scripts
├── sample_reports/                 # Canonical raw scanner outputs for tests/demos
├── scripts/                        # E2E verification and helper scripts
├── docker-compose.yml              # Local orchestration for all services
├── .env.example                    # Environment variable template
├── README.md                       # This file
└── docs/                           # Architecture guides, demo scripts, presentation assets
```

How it fits together:
- The Java backend orchestrates pipeline runs and provides the REST API and GitHub ticketing integration.
- The Python agent service exposes FastAPI endpoints for the four agent stages and is called by the backend.
- The Next.js frontend provides the human-in-the-loop dashboard for reviewing checkpoints, approving runs, and viewing flow/state.
- PostgreSQL stores authoritative findings, deduplication state, scores, and operational metadata.

## Quick start (local development)
Prerequisites:
- Docker Desktop (recommended v24+)
- Docker Compose (v2.20+)
- Git
- Set required tokens/variables in a local `.env` (see `.env.example`)

From a fresh clone:
```bash
git clone https://github.com/aryanosh/VertexAI.git
cd VertexAI
cp .env.example .env
# Edit .env to add any required secrets (example: GITHUB_TOKEN, GITHUB_REPO)
docker-compose up --build
```

Access:
- Frontend UI (HITL Dashboard): http://localhost:3000
- Backend API: http://localhost:8080
- Backend Swagger docs: http://localhost:8080/swagger-ui.html
- Python Agents docs (FastAPI): http://localhost:8000/docs
- PostgreSQL: host `localhost`, port `5433` (container port 5432)

Health endpoints:
- Agents service: GET /health (responds with service status)
- Agents runtime: GET /agent-runtime (reports agent mode and runtime status)

## Environment variables
Copy `.env.example` to `.env` and supply secrets required by your environment. Typical variables the system expects:
- GITHUB_TOKEN — token used by backend to create GitHub issues (set carefully)
- GITHUB_REPO — repository target for ticket creation
- DATABASE_URL / POSTGRES credentials — Database connectivity for backend
- MODEL / AGENT configuration — Model and API keys used by AI agents

(Refer to `.env.example` for the authoritative list before running.)

## Running end-to-end verification
A verification harness and scripts are provided to simulate a full pipeline run and validate expected behavior:
```bash
# Example E2E verification (from project root)
bash scripts/test_e2e_pipeline.sh
# Or for the agent-level verify script:
python3 agents_service/verify_pipeline.py
```
Expected verifications include parsing of sample_reports, deduplication, enrichment, scoring, human checkpoints, and automated GitHub issue creation after approval.

## Development notes
- Agents: agents_service contains the four core agent implementations. main.py registers routers and exposes `/docs`.
- Backend: backend is a Spring Boot app. Look for the GitHubTicketingService class to see how final ticket creation is performed.
- Frontend: frontend uses Next.js; app entry at `frontend/app/page.tsx`. Run `npm run dev` inside `frontend` for local UI dev.
- Database: database schema and seed data are in `database/`. The stack assumes PostgreSQL for persistence.

## Testing
- Unit tests (where present) live alongside service code (agents_service/tests, backend tests).
- CI/CD pipeline configured under `.github/workflows/` runs lint, test, scan, and build stages.

## Security & operational considerations
- Never commit production tokens or secrets. Use environment variables or a secrets manager.
- The HITL checkpoints exist so humans can validate and block automated ticket creation; treat those controls as operational safeguards.
- Review the backend GitHub integration before enabling in production to validate repository and permission scopes.

## Contributing
- Use feature branches and open pull requests against the default branch.
- Add tests for new agent logic and controller changes.
- Run the E2E verification harness after significant pipeline changes to ensure integration correctness.

Suggested workflow:
1. Fork & branch: feature/your-change
2. Run unit tests & E2E locally
3. Open PR with a clear description and mention which team owns the change (Agents / Backend / Frontend / DevOps)
4. Include reviewer(s) from the owning team

## Governance / Ownership
- Team 1 — Backend & DB: backend/ and schema-related changes, GitHub ticketing integration
- Team 2 — AI Engine: agents_service/ and agent models
- Team 3 — Frontend: frontend/ UI and human-in-the-loop controls
- Team 4 — DevOps & E2E: sample_reports/, docker-compose.yml, scripts/, CI workflows, and docs

## Useful links & assets
- Architecture diagrams and presentation artifacts: docs/ and VertexAI_Project_Presentation_Overview.pdf
- Example raw scanner outputs for local testing: sample_reports/
- Agent runtime reference images: vertexai_motion_reference.png, vertexai_ui_reference.png

## License & contact
- License: Add your chosen license file (e.g., LICENSE) to the repository.
- Maintainer / Contact: Project owner or primary maintainer (update as appropriate)

---

If you'd like, I can:
- Produce a ready-to-commit updated README.md file (diff) for this repository.
- Generate a short "Quickstart for contributors" that expands the development and testing steps per service (backend, agents, frontend).
- Extract environment variables from .env.example and generate a secure checklist for running in staging/production.
