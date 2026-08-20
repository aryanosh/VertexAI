# VertexAI — How to Run the Project

Exact steps to bring the full stack up from a cold start, plus what to check if something doesn't come up cleanly.

## 1. Prerequisites

- **Docker Desktop 24+** with Compose v2/v5 (`docker compose version` should print a version, not an error)
- Docker daemon running (open Docker Desktop and wait for it to say "Running")
- Ports **3000, 5433, 8000, 8080, 9000** free on your machine

Verify:
```bash
docker --version
docker compose version
docker info >/dev/null && echo "Docker daemon is running"
```

## 2. Configure environment variables

The whole stack reads a single `.env` file at the repo root (`VertexAI/.env`), generated from `.env.example`.

```bash
cd "VertexAI"
cp .env.example .env   # skip if .env already exists
```

Open `.env` and set, at minimum:

| Variable | Why it matters |
|---|---|
| `NVIDIA_API_KEY` | Powers the 4 agents' Nemotron reasoning (normalization, dedup explanation, threat-intel summarization, ticket rationale). Leave blank and the agents automatically fall back to deterministic-only mode — the pipeline still runs, just without AI narrative text. |
| `GITHUB_TOKEN` | Needed for the final HITL-approved ticket to actually create a GitHub Issue. Leave blank to disable ticket dispatch (everything else in the demo still works). |
| `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` | Target repo for created tickets. |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD` / `ANALYST_PASSWORD` / `VIEWER_PASSWORD` | Change from the template defaults for anything beyond a local demo. |
| `USE_MOCKS` | `true` (default) = Agent 3 reads offline KEV/EPSS fixtures, no internet required, fully deterministic and demo-safe. `false` = queries live CISA/FIRST.org/NVD feeds. |

Everything else in `.env` has a sensible default and does not need to change for a local demo.

## 3. Start the stack

From the `VertexAI/` directory:

```bash
./run.sh
```

This builds all five service images and starts them **in dependency order** — PostgreSQL → Python agents → Spring Boot backend → scanner sandbox → Next.js frontend — waiting for each one to report healthy before starting the next, so you never hit a race where the frontend boots before the backend is ready.

Options:
```bash
./run.sh --no-build   # skip rebuilding images (faster, use when only .env changed)
./run.sh --logs       # attach to logs of an already-running stack
```

The script is idempotent — it always runs `docker compose down` first, so re-running it after code changes cleanly replaces the previous instance instead of stacking duplicates.

## 4. Verify it's up

```bash
docker compose ps
```

All five containers should show `Up` (postgres and python-agents will additionally show `(healthy)`).

Open:
- **Dashboard**: http://localhost:3000
- **Backend Swagger**: http://localhost:8080/swagger-ui.html
- **Python Agents Swagger**: http://localhost:8000/docs

## 5. Run a demo pipeline

1. Log in on the dashboard with one of the seeded accounts (`admin` / value of `ADMIN_PASSWORD` in `.env`, default `admin123`).
2. Go to **Uploads**, upload one or more sample scanner reports from `sample_reports/` (ZAP/Nuclei/OpenVAS/Nmap formats supported).
3. Watch the animated 4-agent pipeline view (`/pipeline`) — each agent node shows live state (idle → running → waiting for human review → completed), a "NVIDIA Nemotron" badge, and findings-processed count.
4. At each HITL checkpoint, review the findings and click **Continue** to advance, **Stop** to halt, or mark individual findings **Accepted Risk**.
5. At the final checkpoint, **Approve** a finding to dispatch a real GitHub Issue (requires `GITHUB_TOKEN` to be set) — this is the only step in the entire system that creates a ticket, always gated on human approval.

## 6. Stop the stack

```bash
docker compose down
```

Add `-v` if you also want to wipe the Postgres volume (deletes all data — do not use this if you want to keep your demo data between sessions):
```bash
docker compose down -v
```

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: command not found` | Install Docker Desktop and restart your shell. |
| `Cannot connect to the Docker daemon` | Open Docker Desktop and wait for it to fully start, then re-run `./run.sh`. |
| A container never reports healthy / `run.sh` times out | The script prints the last 50 log lines from the failing container automatically. Common cause: a port (3000/5433/8000/8080/9000) is already in use by something else — check with `lsof -i :<port>` and stop the conflicting process, or change the port mapping in `docker-compose.yml`. |
| Agent 3 shows "MOCK_FIXTURES" instead of live intel | Expected when `USE_MOCKS=true` (the default). Set it to `false` in `.env` and restart for live CISA KEV / FIRST.org EPSS / NVD data. |
| No AI-generated rationale text, only deterministic scores | `NVIDIA_API_KEY` is blank or invalid — the agents fall back to deterministic-only mode by design rather than failing the demo. Set a valid key and restart. |
| GitHub ticket doesn't get created after Approve | `GITHUB_TOKEN` is blank, expired, or lacks `Issues: read and write` on the target repo. Check backend logs: `docker compose logs backend`. |
| Backend fails to start / schema errors | Postgres data volume may be stale from a previous schema version. Run `docker compose down -v` (wipes data) then `./run.sh` again for a clean slate. |
