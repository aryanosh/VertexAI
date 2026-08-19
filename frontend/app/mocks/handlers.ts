import { http, HttpResponse } from "msw";
import {
  MOCK_DASHBOARD,
  MOCK_VULNERABILITIES,
  MOCK_SCAN,
} from "./data";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Mutable scan state for HITL controls
let scanState = { ...MOCK_SCAN };

export const handlers = [
  // POST /api/auth/login
  http.post(`${BASE}/api/auth/login`, async ({ request }) => {
    const body = await request.json() as { username: string; password: string };
    if (body.username && body.password) {
      return HttpResponse.json({
        token: "mock-jwt-token-sentinelai",
        user: { username: body.username, role: "ANALYST" },
      });
    }
    return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }),

  // GET /api/dashboard
  http.get(`${BASE}/api/dashboard`, () => {
    return HttpResponse.json(MOCK_DASHBOARD);
  }),

  // GET /api/vulnerabilities
  http.get(`${BASE}/api/vulnerabilities`, () => {
    return HttpResponse.json(MOCK_VULNERABILITIES);
  }),

  // POST /api/assets
  http.post(`${BASE}/api/assets`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ asset_id: "asset-new-001", ...body as object, is_authorized: true }, { status: 201 });
  }),

  // GET /api/assets
  http.get(`${BASE}/api/assets`, () => {
    return HttpResponse.json([
      { asset_id: "asset-demo-0001", hostname: "prod-api-01.internal", ip_address: "10.0.1.45", environment: "PRODUCTION", criticality_rating: 5, owner_email: "ops@company.com", is_authorized: true },
      { asset_id: "asset-demo-0002", hostname: "staging-web-02.internal", ip_address: "10.0.2.12", environment: "STAGING", criticality_rating: 3, owner_email: "dev@company.com", is_authorized: true },
    ]);
  }),

  // POST /api/scans
  http.post(`${BASE}/api/scans`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ scan_id: "scan-demo-0001", ...body as object, status: "PENDING", started_at: new Date().toISOString() }, { status: 201 });
  }),

  // GET /api/scans/:id
  http.get(`${BASE}/api/scans/:id`, () => {
    return HttpResponse.json(scanState);
  }),

  // POST /api/scans/:id/control  — HITL Continue / Stop
  http.post(`${BASE}/api/scans/:id/control`, async ({ request }) => {
    const body = await request.json() as { action: "CONTINUE" | "STOP" };
    if (body.action === "STOP") {
      scanState = { ...scanState, status: "STOPPED" };
      return HttpResponse.json({ scan_id: scanState.scan_id, status: "STOPPED" });
    }
    if (body.action === "CONTINUE") {
      const nextAgent = (scanState.current_agent || 2) + 1;
      if (nextAgent > 4) {
        scanState = { ...scanState, status: "WAITING_FOR_HUMAN", current_stage: "FINAL_APPROVAL", current_agent: 4 };
      } else {
        scanState = { ...scanState, status: "RUNNING", current_agent: nextAgent, current_stage: `AGENT_${nextAgent}` };
      }
      return HttpResponse.json({ scan_id: scanState.scan_id, status: scanState.status });
    }
    return HttpResponse.json({ error: "Unknown action" }, { status: 400 });
  }),

  // POST /api/vulnerabilities/:id/accept-risk
  http.post(`${BASE}/api/vulnerabilities/:id/accept-risk`, ({ params }) => {
    return HttpResponse.json({ finding_id: params.id, is_accepted_risk: true });
  }),

  // POST /api/vulnerabilities/:id/ticket  — Final Approval
  http.post(`${BASE}/api/vulnerabilities/:id/ticket`, async ({ request, params }) => {
    const body = await request.json() as { approved: boolean };
    if (body.approved) {
      return HttpResponse.json({
        ticket_url: `https://github.com/org/repo/issues/${Math.floor(Math.random() * 900) + 100}`,
        status: "OPEN",
        finding_id: params.id,
      });
    }
    return HttpResponse.json({ error: "Not approved" }, { status: 400 });
  }),
];
