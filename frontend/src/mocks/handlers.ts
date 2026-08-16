/**
 * MSW Request Handlers
 *
 * Mocks the Spring Boot backend (port 8080) during development.
 * Endpoints: GET /api/dashboard, GET /api/vulnerabilities, POST /api/scans
 * WebSocket: ws://localhost:8080/ws/pipeline (simulated via HTTP SSE-style polling mock)
 *
 * Source: integration_plan.md §4 (REST), §9 (WebSocket)
 * Switch-over: At Integration Step 3, disable MSW and point NEXT_PUBLIC_API_URL
 *              at the real Spring Boot backend (http://localhost:8080).
 */

import { http, HttpResponse, delay } from 'msw';
import { mockDashboard, mockFindings, mockScanJob } from './data/fixtures';
import type { ScanJob, HITLControl } from '@/types/contracts';

const BASE_URL = 'http://localhost:8080';

export const handlers = [
  // ---------------------------------------------------------------------------
  // GET /api/dashboard
  // Returns DashboardMetrics: security_score, top_threats, pipeline_status, etc.
  // Source: integration_plan.md §4
  // ---------------------------------------------------------------------------
  http.get(`${BASE_URL}/api/dashboard`, async () => {
    await delay(300);
    return HttpResponse.json(mockDashboard, { status: 200 });
  }),

  // ---------------------------------------------------------------------------
  // GET /api/vulnerabilities
  // Returns array of CanonicalFinding objects.
  // Supports optional query params: severity, priority (passed through, not filtered in mock)
  // Source: integration_plan.md §4
  // ---------------------------------------------------------------------------
  http.get(`${BASE_URL}/api/vulnerabilities`, async ({ request }) => {
    await delay(400);
    const url = new URL(request.url);
    const priority = url.searchParams.get('priority');

    const results = priority
      ? mockFindings.filter((f) => f.priority_level === priority)
      : mockFindings;

    return HttpResponse.json(results, { status: 200 });
  }),

  // ---------------------------------------------------------------------------
  // POST /api/scans
  // Triggers a new scan. Request: { asset_id, scanner_types }
  // Returns: { scan_id, status: 'PENDING' }
  // Source: integration_plan.md §4
  // ---------------------------------------------------------------------------
  http.post(`${BASE_URL}/api/scans`, async ({ request }) => {
    await delay(500);
    const body = await request.json() as { asset_id: string; scanner_types: string[] };

    const newScan: ScanJob = {
      ...mockScanJob,
      scan_id: `scan-uuid-${Date.now()}`,
      asset_id: body.asset_id ?? mockScanJob.asset_id,
      status: 'PENDING',
      started_at: new Date().toISOString(),
      completed_at: null,
      agent_output: null,
    };

    return HttpResponse.json(newScan, { status: 201 });
  }),

  // ---------------------------------------------------------------------------
  // GET /api/scans/:id
  // Returns current scan status + agent_output for HITL review.
  // Source: integration_plan.md §4
  // ---------------------------------------------------------------------------
  http.get(`${BASE_URL}/api/scans/:id`, async ({ params }) => {
    await delay(200);
    const scan = { ...mockScanJob, scan_id: params.id as string };
    return HttpResponse.json(scan, { status: 200 });
  }),

  // ---------------------------------------------------------------------------
  // POST /api/scans/:id/control
  // HITL control action: { action: "CONTINUE" | "STOP" }
  // Source: integration_plan.md §4, §9
  // ---------------------------------------------------------------------------
  http.post(`${BASE_URL}/api/scans/:id/control`, async ({ request, params }) => {
    await delay(300);
    const body = await request.json() as HITLControl;

    const nextStatus = body.action === 'CONTINUE' ? 'RUNNING' : 'STOPPED';
    return HttpResponse.json(
      { scan_id: params.id, status: nextStatus },
      { status: 200 }
    );
  }),

  // ---------------------------------------------------------------------------
  // POST /api/vulnerabilities/:id/ticket
  // Final Human Approval → dispatches GitHub Issue (via Team 1 backend).
  // Request: { approved: true }
  // Response: { ticket_url, status }
  // Source: integration_plan.md §4, §9
  // ---------------------------------------------------------------------------
  http.post(`${BASE_URL}/api/vulnerabilities/:id/ticket`, async ({ request }) => {
    await delay(800);
    const body = await request.json() as { approved: boolean };

    if (!body.approved) {
      return HttpResponse.json(
        { error: 'Approval required to dispatch ticket.' },
        { status: 400 }
      );
    }

    return HttpResponse.json(
      {
        ticket_url: `https://github.com/org/vertexai/issues/${Math.floor(Math.random() * 900) + 100}`,
        status: 'COMPLETED',
      },
      { status: 200 }
    );
  }),
];

// ---------------------------------------------------------------------------
// WebSocket Simulation — ws://localhost:8080/ws/pipeline
//
// MSW 2.x does not natively support WebSocket interception in browsers (still
// experimental). The simulation is implemented as a helper that the
// LiveTimelineStream component can import and use during development.
// At Integration Step 3, replace with a real WebSocket connection.
//
// Source: integration_plan.md §9
// ---------------------------------------------------------------------------
export const simulatePipelineWebSocket = (
  onMessage: (event: MessageEvent) => void,
  scanId: string = mockScanJob.scan_id
): WebSocket => {
  // Use the real WebSocket so MSW can intercept in supported environments.
  // During development, the LiveTimelineStream component falls back to
  // polling GET /api/scans/:id if the WebSocket connection fails.
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws/pipeline';
  const ws = new WebSocket(`${wsUrl}?scan_id=${scanId}`);

  const statusSequence = [
    { status: 'RUNNING', stage: 1, message: 'Agent 1 — Parsing scanner reports...' },
    { status: 'WAITING_FOR_HUMAN', stage: 1, message: 'Agent 1 complete. Human review required.' },
    { status: 'RUNNING', stage: 2, message: 'Agent 2 — Noise reduction running...' },
    { status: 'WAITING_FOR_HUMAN', stage: 2, message: 'Agent 2 complete. 94% noise reduction. Human review required.' },
    { status: 'RUNNING', stage: 3, message: 'Agent 3 — Threat intelligence enrichment...' },
    { status: 'WAITING_FOR_HUMAN', stage: 3, message: 'Agent 3 complete. CISA KEV & EPSS data loaded. Human review required.' },
    { status: 'RUNNING', stage: 4, message: 'Agent 4 — Risk scoring & ticket preparation...' },
    { status: 'WAITING_FOR_HUMAN', stage: 4, message: 'Agent 4 risk score generated → Final human approval pending → GitHub ticket created after approval' },
  ] as const;

  let idx = 0;
  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (idx >= statusSequence.length) {
      clearInterval(interval);
      return;
    }
    const payload = {
      scan_id: scanId,
      timestamp: new Date().toISOString(),
      ...statusSequence[idx++],
    };
    const event = new MessageEvent('message', { data: JSON.stringify(payload) });
    onMessage(event);
  }, 3000);

  ws.addEventListener('close', () => clearInterval(interval));
  return ws;
};
