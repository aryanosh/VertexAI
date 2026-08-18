/**
 * MSW Request Handlers
 *
 * Mocks the Spring Boot backend (port 8080) during development.
 * Endpoints: GET /api/dashboard, GET /api/vulnerabilities, POST /api/scans
 * WebSocket: ws://localhost:8080/ws/pipeline (simulated via HTTP SSE-style polling mock)
 *
 * Source: integration_plan.md §4 (REST), §9 (WebSocket)
 */

import { http, HttpResponse, delay } from 'msw';
import { mockDashboard, mockFindings, mockScanJob } from './data/fixtures';
import type { ScanJob, ControlActionRequest } from '@/types/contracts';

const BASE_URL = 'http://localhost:8080';

export const handlers = [
  // ---------------------------------------------------------------------------
  // GET /api/dashboard
  // Returns DashboardMetrics: security_score, top_threats, noise_reduction_percent, etc.
  // ---------------------------------------------------------------------------
  http.get(`${BASE_URL}/api/dashboard`, async () => {
    await delay(300);
    return HttpResponse.json(mockDashboard, { status: 200 });
  }),

  // ---------------------------------------------------------------------------
  // GET /api/vulnerabilities
  // Returns array of CanonicalFinding objects.
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
  // ---------------------------------------------------------------------------
  http.post(`${BASE_URL}/api/scans`, async ({ request }) => {
    await delay(500);
    const body = (await request.json()) as { asset_id?: string; assetId?: string };

    const newScan: ScanJob = {
      ...mockScanJob,
      scan_id: `scan-uuid-${Date.now()}`,
      asset_id: body.assetId || body.asset_id || mockScanJob.asset_id,
      status: 'PENDING',
      started_at: new Date().toISOString(),
      completed_at: null,
      agent_output: null,
    };

    return HttpResponse.json(newScan, { status: 201 });
  }),

  // ---------------------------------------------------------------------------
  // GET /api/scans/:id
  // ---------------------------------------------------------------------------
  http.get(`${BASE_URL}/api/scans/:id`, async ({ params }) => {
    await delay(200);
    const scan = { ...mockScanJob, scan_id: params.id as string };
    return HttpResponse.json(scan, { status: 200 });
  }),

  // ---------------------------------------------------------------------------
  // POST /api/scans/:id/control
  // ---------------------------------------------------------------------------
  http.post(`${BASE_URL}/api/scans/:id/control`, async ({ request, params }) => {
    await delay(300);
    const body = (await request.json()) as ControlActionRequest;

    const nextStatus = body.action === 'CONTINUE' ? 'RUNNING' : 'STOPPED';
    return HttpResponse.json(
      { scan_id: params.id, status: nextStatus },
      { status: 200 }
    );
  }),

  // ---------------------------------------------------------------------------
  // POST /api/vulnerabilities/:id/ticket
  // ---------------------------------------------------------------------------
  http.post(`${BASE_URL}/api/vulnerabilities/:id/ticket`, async ({ request }) => {
    await delay(800);
    const body = (await request.json()) as { approved: boolean };

    if (!body.approved) {
      return HttpResponse.json(
        { error: 'Approval required to dispatch ticket.' },
        { status: 400 }
      );
    }

    return HttpResponse.json(
      {
        ticket_id: 'ticket-uuid-001',
        ticket_url: `https://github.com/org/vertexai/issues/${Math.floor(Math.random() * 900) + 100}`,
        status: 'COMPLETED',
        assigned_owner: 'security-response-team@company.com',
        sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { status: 200 }
    );
  }),
];

// ---------------------------------------------------------------------------
// WebSocket Simulation Helper
// ---------------------------------------------------------------------------
export const simulatePipelineWebSocket = (
  onMessage: (event: MessageEvent) => void,
  scanId: string = mockScanJob.scan_id || 'scan-uuid-0001'
): WebSocket => {
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
