#!/usr/bin/env bash
# ==============================================================================
# VertexAI — sequential stack launcher
#
# Brings the whole stack up in dependency order, waiting on each service's
# health check before starting the next one, so the demo never races against
# a not-yet-ready Postgres/backend/agents service.
#
# Order: Postgres -> Python agents -> Spring Boot backend -> scanner-sandbox
#        -> Next.js frontend
#
# Usage:
#   ./run.sh            build + start everything, then tail logs
#   ./run.sh --no-build  skip the image rebuild step (faster if nothing changed)
#   ./run.sh --logs      just attach to logs of an already-running stack
# ==============================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE="docker compose"
BUILD=1
LOGS_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --logs) LOGS_ONLY=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
err() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1" >&2; }

if [[ $LOGS_ONLY -eq 1 ]]; then
  exec $COMPOSE logs -f
fi

# ------------------------------------------------------------------------------
# 0. Pre-flight checks
# ------------------------------------------------------------------------------
log "Pre-flight checks"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed or not on PATH. Install Docker Desktop first."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not running. Start Docker Desktop and re-run this script."
  exit 1
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    log "No .env found — creating one from .env.example"
    cp .env.example .env
    err "Edit .env now and set at least NVIDIA_API_KEY and GITHUB_TOKEN before re-running for a full demo."
  else
    err ".env and .env.example are both missing. Cannot continue."
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 1. Stop any previous instance cleanly first (idempotent re-run safety)
# ------------------------------------------------------------------------------
log "Stopping any previous instance"
$COMPOSE down --remove-orphans || true

# ------------------------------------------------------------------------------
# 2. Build images (unless skipped)
# ------------------------------------------------------------------------------
if [[ $BUILD -eq 1 ]]; then
  log "Building images (postgres, python-agents, backend, frontend, scanner-sandbox)"
  $COMPOSE build
else
  log "Skipping build (--no-build)"
fi

# ------------------------------------------------------------------------------
# Helper: wait for a container to report healthy (or just running, if it has
# no healthcheck defined) before moving to the next stage.
# ------------------------------------------------------------------------------
wait_for_service() {
  local service="$1"
  local container="$2"
  local timeout="${3:-120}"
  local waited=0

  log "Waiting for '$service' ($container) to become healthy"
  while true; do
    local status
    # Branch inside the Go template itself (rather than relying on a shell
    # fallback) — containers with no HEALTHCHECK defined make `.State.Health`
    # a missing map key, and docker's template-parse error on that leaks a
    # stray leading newline onto stdout even when stderr is redirected away,
    # which broke a naive `2>/dev/null || echo none` string comparison here.
    status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null)
    status=$(echo "$status" | tr -d '[:space:]')
    [[ -z "$status" ]] && status="unknown"

    if [[ "$status" == "healthy" ]]; then
      echo "  $container is healthy."
      return 0
    fi

    if [[ "$status" == "none" ]]; then
      # No healthcheck defined for this container — fall back to "is it running".
      local running
      running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
      if [[ "$running" == "true" ]]; then
        echo "  $container is running (no healthcheck defined)."
        return 0
      fi
    fi

    if [[ "$status" == "unhealthy" ]]; then
      err "$container reported unhealthy. Recent logs:"
      docker logs --tail 50 "$container" || true
      return 1
    fi

    if (( waited >= timeout )); then
      err "$container did not become healthy within ${timeout}s. Recent logs:"
      docker logs --tail 50 "$container" || true
      return 1
    fi

    sleep 2
    waited=$((waited + 2))
  done
}

# ------------------------------------------------------------------------------
# 3. Start services in strict dependency order
# ------------------------------------------------------------------------------
log "Starting PostgreSQL"
$COMPOSE up -d postgres
wait_for_service "postgres" "vertexai-postgres" 60

log "Starting Python AI agents service (Agents 1-4, NVIDIA Nemotron)"
$COMPOSE up -d python-agents
wait_for_service "python-agents" "vertexai-agents" 90

log "Starting Spring Boot backend"
$COMPOSE up -d backend
wait_for_service "backend" "vertexai-backend" 120

log "Starting scanner sandbox"
$COMPOSE up -d scanner-sandbox
wait_for_service "scanner-sandbox" "vertexai-scanner" 60

log "Starting Next.js frontend"
$COMPOSE up -d frontend
wait_for_service "frontend" "vertexai-frontend" 60

# ------------------------------------------------------------------------------
# 4. Final status
# ------------------------------------------------------------------------------
log "All services started"
$COMPOSE ps

cat <<'EOF'

--------------------------------------------------------------------------------
VertexAI is up:

  Frontend (HITL Dashboard) : http://localhost:3000
  Backend API / Swagger     : http://localhost:8080/swagger-ui.html
  Python Agents / Swagger   : http://localhost:8000/docs
  PostgreSQL                : localhost:5433

Tail logs any time with:   ./run.sh --logs
Stop everything with:      docker compose down
--------------------------------------------------------------------------------
EOF
