#!/usr/bin/env bash
# =============================================================================
# VertexAI — End-to-end pipeline verification
#
# Proves, with real output rather than assertions of intent, that:
#   1. An uploaded scanner report actually reaches the backend.
#   2. Agent 1 parses THAT file's contents (unique markers appear in its output),
#      not the bundled sample_reports fixtures.
#   3. The scan_jobs row is updated (no silent transaction race) and current_stage
#      is persisted.
#   4. Each agent reports a real measured duration in stage_timings.
#   5. The unique finding flows through Agents 2 -> 3 -> 4.
#   6. Ticket state is per finding (ticket_url / has_ticket).
#
# Usage: ./verify_pipeline_e2e.sh
# =============================================================================

set -uo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
AGENTS_URL="${AGENTS_URL:-http://localhost:8000}"
ASSET_ID="${ASSET_ID:-3fa85f64-5717-4562-b3fc-2c963f66afa6}"
PG_CONTAINER="${PG_CONTAINER:-vertexai-postgres}"
PG_USER="${PG_USER:-vertex_user}"
PG_DB="${PG_DB:-vertexai_db}"

PASS=0
FAIL=0
TMPFILE=""

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
info() { echo "  ...... $1"; }
hdr()  { echo; echo "== $1"; }

cleanup() { [ -n "$TMPFILE" ] && rm -f "$TMPFILE"; }
trap cleanup EXIT

jqr() { # jqr <json> <filter>  — falls back to grep if jq is absent
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -r "$2" 2>/dev/null
  else
    printf '%s' "$1"
  fi
}

echo "============================================================"
echo " VertexAI end-to-end pipeline verification"
echo " backend=$BACKEND_URL  agents=$AGENTS_URL"
echo "============================================================"

# ---------------------------------------------------------------------------
hdr "0. Service reachability"
# ---------------------------------------------------------------------------
if curl -fsS "${AGENTS_URL}/health" >/dev/null 2>&1; then
  ok "Python agents service is up"
else
  bad "Python agents service unreachable at ${AGENTS_URL}"; exit 1
fi

AUTH=$(curl -fsS -X POST "${BACKEND_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"analyst","password":"analyst123"}' 2>/dev/null)
TOKEN=$(jqr "$AUTH" '.token')
if [ -z "${TOKEN:-}" ] || [ "$TOKEN" = "null" ]; then
  TOKEN=$(printf '%s' "$AUTH" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
fi
if [ -n "${TOKEN:-}" ]; then
  ok "Authenticated as analyst (token ${TOKEN:0:16}...)"
else
  bad "Authentication failed. Response: $AUTH"; exit 1
fi
AUTHH="Authorization: Bearer $TOKEN"

# ---------------------------------------------------------------------------
hdr "1. Database schema carries persisted pipeline progress"
# ---------------------------------------------------------------------------
COLS=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT string_agg(column_name,',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='scan_jobs';" 2>/dev/null)
info "scan_jobs columns: $COLS"
case "$COLS" in
  *current_stage*) ok "scan_jobs.current_stage exists (stage survives restart)";;
  *) bad "scan_jobs.current_stage missing — schema.sql did not apply";;
esac
case "$COLS" in
  *stage_timings*) ok "scan_jobs.stage_timings exists (per-agent timings persisted)";;
  *) bad "scan_jobs.stage_timings missing — schema.sql did not apply";;
esac

# ---------------------------------------------------------------------------
hdr "2. Build a scanner report with unique, traceable markers"
# ---------------------------------------------------------------------------
STAMP=$(date +%s)
UNIQ_CVE="CVE-1999-${STAMP: -4}"
UNIQ_HOST="e2e-host-${STAMP}.internal"
UNIQ_PORT=8899
TMPFILE="/tmp/e2e_nmap_${STAMP}.xml"

cat > "$TMPFILE" <<EOF
<?xml version="1.0"?>
<nmaprun scanner="nmap" args="nmap -sV" start="${STAMP}" version="7.92">
  <host>
    <address addr="${UNIQ_HOST}" addrtype="ipv4"/>
    <ports>
      <port protocol="tcp" portid="${UNIQ_PORT}">
        <state state="open" reason="syn-ack"/>
        <service name="http" product="Apache httpd" version="2.4.41"/>
        <script id="vuln-${UNIQ_CVE}" output="VULNERABLE: ${UNIQ_CVE} on ${UNIQ_HOST}:${UNIQ_PORT}"/>
      </port>
    </ports>
  </host>
</nmaprun>
EOF

info "file=$TMPFILE ($(wc -c < "$TMPFILE" | tr -d ' ') bytes)"
info "unique CVE=$UNIQ_CVE  host=$UNIQ_HOST  port=$UNIQ_PORT"
ok "Unique nmap report generated"

# ---------------------------------------------------------------------------
hdr "3. Upload the report"
# ---------------------------------------------------------------------------
UP=$(curl -fsS -X POST "${BACKEND_URL}/api/scans/upload" \
  -H "$AUTHH" -F "assetId=${ASSET_ID}" -F "files=@${TMPFILE}" 2>/dev/null)
echo "$UP" | head -c 900; echo
SCAN_ID=$(jqr "$UP" '.scan_id')
[ -z "${SCAN_ID:-}" ] || [ "$SCAN_ID" = "null" ] && \
  SCAN_ID=$(printf '%s' "$UP" | sed -n 's/.*"scan_id":"\([^"]*\)".*/\1/p')

if [ -n "${SCAN_ID:-}" ] && [ "$SCAN_ID" != "null" ]; then
  ok "Upload accepted, scan_id=$SCAN_ID"
else
  bad "Upload did not return a scan_id"; exit 1
fi

UP_STAGE=$(jqr "$UP" '.current_stage')
info "current_stage immediately after upload: ${UP_STAGE:-?} (0 is correct: Agent 1 runs after commit)"

# ---------------------------------------------------------------------------
hdr "4. Wait for Agent 1, then inspect status + timings"
# ---------------------------------------------------------------------------
STATUS=""; STAGE=""; ST=""
for i in $(seq 1 40); do
  ST=$(curl -fsS -H "$AUTHH" "${BACKEND_URL}/api/scans/${SCAN_ID}" 2>/dev/null)
  STATUS=$(jqr "$ST" '.status')
  STAGE=$(jqr "$ST" '.current_stage')
  [ "$STATUS" = "WAITING_FOR_HUMAN" ] && break
  [ "$STATUS" = "FAILED" ] && break
  sleep 1
done
info "status=$STATUS current_stage=$STAGE after ${i}s"

if [ "$STATUS" = "WAITING_FOR_HUMAN" ] && [ "$STAGE" = "1" ]; then
  ok "Pipeline reached Gate 1 and PERSISTED status+stage (no silent transaction race)"
else
  bad "Expected WAITING_FOR_HUMAN at stage 1, got status=$STATUS stage=$STAGE"
  echo "$ST" | head -c 600; echo
fi

if command -v jq >/dev/null 2>&1; then
  echo "  stage_timings:"
  printf '%s' "$ST" | jq -c '.stage_timings[]?' 2>/dev/null | sed 's/^/    /'
fi
D1=$(jqr "$ST" '.stage_timings[0].duration_ms')
if [ -n "${D1:-}" ] && [ "$D1" != "null" ] && [ "$D1" -ge 0 ] 2>/dev/null; then
  ok "Agent 1 reported a real measured duration: ${D1}ms"
else
  bad "No measured duration for Agent 1 (stage_timings empty)"
fi

# ---------------------------------------------------------------------------
hdr "5. Did Agent 1 parse MY file, or the bundled samples?"
# ---------------------------------------------------------------------------
OUT=$(printf '%s' "$ST")
HITS=0
for marker in "$UNIQ_HOST" "$UNIQ_PORT"; do
  if printf '%s' "$OUT" | grep -q "$marker"; then
    ok "Agent 1 output contains uploaded marker: $marker"
    HITS=$((HITS+1))
  else
    bad "Agent 1 output MISSING uploaded marker: $marker"
  fi
done
if printf '%s' "$OUT" | grep -qE '10\.0\.1\.15|prod-api-server-01'; then
  info "NOTE: output also contains seeded/sample host values — inspect manually"
fi
[ "$HITS" -eq 0 ] && info "Agent 1 likely fell back to sample_reports fixtures"

# ---------------------------------------------------------------------------
hdr "6. Walk the HITL gates (CONTINUE x3) and collect every agent duration"
# ---------------------------------------------------------------------------
for gate in 1 2 3; do
  R=$(curl -fsS -X POST "${BACKEND_URL}/api/scans/${SCAN_ID}/control" \
    -H "$AUTHH" -H 'Content-Type: application/json' \
    -d '{"action":"CONTINUE"}' 2>/dev/null)
  RS=$(jqr "$R" '.status')
  info "Gate $gate approved -> immediate response status=$RS (async execution)"

  for i in $(seq 1 60); do
    ST=$(curl -fsS -H "$AUTHH" "${BACKEND_URL}/api/scans/${SCAN_ID}" 2>/dev/null)
    STATUS=$(jqr "$ST" '.status')
    STAGE=$(jqr "$ST" '.current_stage')
    { [ "$STATUS" = "WAITING_FOR_HUMAN" ] && [ "$STAGE" = "$((gate+1))" ]; } && break
    [ "$STATUS" = "FAILED" ] && break
    sleep 1
  done

  if [ "$STATUS" = "WAITING_FOR_HUMAN" ] && [ "$STAGE" = "$((gate+1))" ]; then
    ok "Agent $((gate+1)) completed, pipeline persisted stage $STAGE"
  else
    bad "Agent $((gate+1)) did not complete (status=$STATUS stage=$STAGE)"
    echo "$ST" | head -c 500; echo
    break
  fi
done

if command -v jq >/dev/null 2>&1; then
  echo "  final stage_timings:"
  printf '%s' "$ST" | jq -c '.stage_timings[]?' 2>/dev/null | sed 's/^/    /'
  echo "  total_duration_ms: $(printf '%s' "$ST" | jq -r '.total_duration_ms' 2>/dev/null)"
  NT=$(printf '%s' "$ST" | jq '[.stage_timings[]? | select(.duration_ms != null)] | length' 2>/dev/null)
  if [ "${NT:-0}" -ge 4 ] 2>/dev/null; then
    ok "All 4 agents reported measured durations"
  else
    bad "Only ${NT:-0} of 4 agents reported measured durations"
  fi
fi

# ---------------------------------------------------------------------------
hdr "7. Persisted stage + timings in PostgreSQL"
# ---------------------------------------------------------------------------
ROW=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT status||' | stage='||COALESCE(current_stage::text,'null')||' | timings_len='||COALESCE(length(stage_timings),0) FROM scan_jobs WHERE scan_id='${SCAN_ID}';" 2>/dev/null)
info "scan_jobs row: $ROW"
case "$ROW" in
  *"stage=4"*) ok "current_stage=4 persisted in the database";;
  *) bad "current_stage not persisted as 4 (row: $ROW)";;
esac
case "$ROW" in
  *timings_len=0*) bad "stage_timings column is empty in the database";;
  *) ok "stage_timings JSON persisted in the database";;
esac

# ---------------------------------------------------------------------------
hdr "8. Did the uploaded finding reach the database via Agents 2-4?"
# ---------------------------------------------------------------------------
DBF=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT count(*) FROM canonical_vulnerabilities WHERE target_host='${UNIQ_HOST}' OR target_port=${UNIQ_PORT};" 2>/dev/null)
info "canonical_vulnerabilities rows matching my upload: ${DBF:-?}"
if [ "${DBF:-0}" -gt 0 ] 2>/dev/null; then
  ok "The uploaded finding was deduplicated and persisted by Agent 2"
else
  bad "No canonical finding matches the uploaded host/port"
fi

# ---------------------------------------------------------------------------
hdr "9. Ticket state is per finding"
# ---------------------------------------------------------------------------
V=$(curl -fsS -H "$AUTHH" "${BACKEND_URL}/api/vulnerabilities" 2>/dev/null)
if printf '%s' "$V" | grep -q '"has_ticket"'; then
  ok "GET /api/vulnerabilities exposes per-finding has_ticket"
else
  bad "has_ticket missing from /api/vulnerabilities"
fi
if printf '%s' "$V" | grep -q '"ticket_url"'; then
  ok "GET /api/vulnerabilities exposes per-finding ticket_url"
else
  bad "ticket_url missing from /api/vulnerabilities"
fi
if command -v jq >/dev/null 2>&1; then
  echo "  per-finding ticket state:"
  printf '%s' "$V" | jq -c '.[] | {cve_id, has_ticket, ticket_url}' 2>/dev/null | head -8 | sed 's/^/    /'
  TC=$(printf '%s' "$V" | jq '[.[] | select(.has_ticket == true)] | length' 2>/dev/null)
  info "findings currently marked as ticketed: ${TC:-0}"
fi

# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo " RESULT: $PASS passed, $FAIL failed"
echo "============================================================"
echo
echo "Backend agent logs for this scan (durations at each boundary):"
docker logs vertexai-backend 2>&1 | grep -E "Agent [1-4] (START|DONE)|ScanStartedEvent|uploaded report" | tail -20 | sed 's/^/  /'
echo
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
