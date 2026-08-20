/**
 * MSW Request Handlers
 *
 * Mocks the Spring Boot backend (port 8080) during development/offline mode.
 * Full stateful implementation of all 10 API endpoints:
 * 1. POST /api/auth/login
 * 2. GET /api/dashboard
 * 3. GET /api/vulnerabilities
 * 4. GET /api/vulnerabilities/:id
 * 5. POST /api/vulnerabilities/:id/accept-risk
 * 6. POST /api/vulnerabilities/:id/ticket
 * 7. GET /api/assets & POST /api/assets
 * 8. POST /api/scans
 * 9. GET /api/scans/:id
 * 10. POST /api/scans/:id/control
 */

import { http, HttpResponse, delay } from 'msw';
import { mockDashboard, mockFindings, mockScanJob } from './data/fixtures';
import type {
  ScanStatusResponse,
  ControlActionRequest,
  Asset,
  CanonicalFinding,
  DashboardMetrics,
} from '@/types/contracts';

const BASE_URL = 'http://localhost:8080';

/** Illustrative per-agent durations for offline demo mode (not real measurements). */
const MOCK_STAGE_DURATIONS_MS: Record<number, number> = { 1: 1800, 2: 2400, 3: 3100, 4: 1600 };

const MOCK_STAGE_OUTPUT: Record<number, { summary: string; findings: number }> = {
  1: {
    summary:
      'Parsed 2,500 raw records from 4 scanners into UnifiedFinding schema via NVIDIA Nemotron semantic normalization.',
    findings: 2500,
  },
  2: {
    summary:
      'Deduplicated via MD5(cve+host+port) fingerprints and XGBoost false-positive filtering. 2,500 → 340 after merge, 15 after FP suppression.',
    findings: 15,
  },
  3: {
    summary:
      'Enriched 15 canonical findings against CISA KEV and FIRST EPSS. NVIDIA Nemotron summarized intelligence per CVE.',
    findings: 15,
  },
  4: {
    summary:
      'Computed composite risk scores (0–100), assigned P0–P3 priorities and SLA deadlines, drafted ticket narratives via NVIDIA Nemotron.',
    findings: 15,
  },
};

// In-memory state
let currentDashboard: DashboardMetrics = { ...mockDashboard };
const currentFindings: CanonicalFinding[] = [...mockFindings];
let currentScanState: ScanStatusResponse | null = null;
const registeredAssets: Asset[] = [
  {
    assetId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    hostname: 'prod-api-server-01.internal',
    ipAddress: '10.0.1.15',
    environment: 'PRODUCTION',
    criticalityRating: 5,
    ownerEmail: 'secops@vertexai.local',
    isAuthorized: true,
    createdAt: new Date().toISOString(),
  },
  {
    assetId: '4ab95f64-5717-4562-b3fc-2c963f66afa7',
    hostname: 'staging-k8s-cluster.internal',
    ipAddress: '10.0.2.20',
    environment: 'STAGING',
    criticalityRating: 3,
    ownerEmail: 'devops@vertexai.local',
    isAuthorized: true,
    createdAt: new Date().toISOString(),
  },
];

export const handlers = [
  // 1. POST /api/auth/login
  http.post(`${BASE_URL}/api/auth/login`, async ({ request }) => {
    await delay(150);
    try {
      const body = (await request.json()) as { username?: string; password?: string };
      const uname = (body.username || 'analyst').toLowerCase().trim();
      let role = 'ANALYST';
      let cleanUsername = uname;

      if (uname === 'admin' || uname.includes('admin')) {
        role = 'ADMIN';
        cleanUsername = 'admin';
      } else if (uname === 'viewer' || uname.includes('viewer')) {
        role = 'VIEWER';
        cleanUsername = 'viewer';
      } else if (uname === 'analyst' || uname.includes('analyst')) {
        role = 'ANALYST';
        cleanUsername = 'analyst';
      }

      return HttpResponse.json(
        {
          token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ sub: cleanUsername, role: `ROLE_${role}` }))}`,
          username: cleanUsername,
          role: role,
        },
        { status: 200 }
      );
    } catch {
      return HttpResponse.json(
        {
          token: 'mock-jwt-token-analyst',
          username: 'analyst',
          role: 'ANALYST',
        },
        { status: 200 }
      );
    }
  }),

  // 2. GET /api/dashboard
  http.get(`${BASE_URL}/api/dashboard`, async () => {
    await delay(200);
    return HttpResponse.json(currentDashboard, { status: 200 });
  }),

  // 3. GET /api/vulnerabilities
  http.get(`${BASE_URL}/api/vulnerabilities`, async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    const priority = url.searchParams.get('priority');
    const includeSuppressed = url.searchParams.get('include_suppressed') === 'true';

    let results = currentFindings;
    if (!includeSuppressed) {
      results = results.filter((f) => !f.is_suppressed);
    }
    if (priority) {
      results = results.filter((f) => f.priority_level === priority);
    }

    return HttpResponse.json(results, { status: 200 });
  }),

  // 4. GET /api/vulnerabilities/:id
  http.get(`${BASE_URL}/api/vulnerabilities/:id`, async ({ params }) => {
    await delay(150);
    const finding = currentFindings.find((f) => f.finding_id === params.id) || currentFindings[0];
    return HttpResponse.json(finding, { status: 200 });
  }),

  // 5. POST /api/vulnerabilities/:id/accept-risk
  http.post(`${BASE_URL}/api/vulnerabilities/:id/accept-risk`, async ({ params }) => {
    await delay(250);
    const finding = currentFindings.find((f) => f.finding_id === params.id) || currentFindings[0];
    finding.is_accepted_risk = true;
    return HttpResponse.json(finding, { status: 200 });
  }),

  // 6. POST /api/vulnerabilities/:id/ticket
  http.post(`${BASE_URL}/api/vulnerabilities/:id/ticket`, async ({ request }) => {
    await delay(400);
    const body = (await request.json()) as { approved: boolean };

    if (!body.approved) {
      return HttpResponse.json(
        { error: 'Final human approval required to dispatch GitHub issue.' },
        { status: 400 }
      );
    }

    const ghToken = process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
    const owner = process.env.NEXT_PUBLIC_GITHUB_REPO_OWNER || 'aryanosh';
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO_NAME || 'VertexAI';

    let liveIssueUrl = `https://github.com/${owner}/${repo}/issues/1`;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      };
      if (ghToken) {
        headers['Authorization'] = `Bearer ${ghToken}`;
      }

      const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `[P0_CRITICAL] CVE-2021-44228 on 10.0.1.15:8080`,
          body: `## 🛡️ VertexAI Security Remediation Ticket\n\n> **Priority:** \`P0_CRITICAL\` | **Composite Risk Score:** \`94.5 / 100\`\n> **SLA Remediation Deadline:** \`${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()}\`\n\n---\n\n### 📌 Vulnerability Summary\n* **CVE ID:** \`CVE-2021-44228\`\n* **Vulnerability Name:** Apache Log4j2 JNDI Remote Code Execution\n* **Target Host:** \`10.0.1.15\`\n* **Port / Service:** \`8080\`\n* **Discovered By:** \`NUCLEI, OWASP_ZAP\`\n* **CVSS Base Score:** \`10.0\`\n\n---\n\n### 🧠 AI Explainable Rationale\nComposite Risk Score 94.5/100 [P0_CRITICAL]. CVSS Base Score: 10.0 (3.0 pts). EPSS Score: 0.972 (34.0 pts). CISA KEV: Listed in Known Exploited Vulnerabilities (+25.0 pts). Asset Criticality: 5/5 (+20.0 pts).\n\n---\n\n### 🛠️ Required Action\n1. Inspect target host \`10.0.1.15\` and verify service configuration.\n2. Apply recommended vendor security patch or upgrade packages.\n3. Mark this ticket resolved and request a re-scan.\n\n*Dispatched automatically by VertexAI Platform after Final Human Approval.*`,
          labels: ['security', 'p0-critical'],
        }),
      });

      if (ghRes.ok) {
        const ghData = (await ghRes.json()) as { html_url?: string };
        if (ghData.html_url) {
          liveIssueUrl = ghData.html_url;
        }
      }
    } catch (err) {
      console.warn('Live GitHub API dispatch fallback:', err);
    }

    const ticket = {
      ticket_id: '8f92b450-4717-4562-b3fc-2c963f66afa9',
      ticket_url: liveIssueUrl,
      status: 'OPEN',
      assigned_owner: 'secops@vertexai.local',
      sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    // Update dashboard metrics
    currentDashboard = {
      ...currentDashboard,
      security_score: 98.0,
      active_findings: Math.max(0, currentDashboard.active_findings - 1),
    };

    return HttpResponse.json(ticket, { status: 201 });
  }),

  // 7. GET /api/assets & POST /api/assets
  http.get(`${BASE_URL}/api/assets`, async () => {
    await delay(150);
    return HttpResponse.json(registeredAssets, { status: 200 });
  }),

  http.post(`${BASE_URL}/api/assets`, async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as Asset;
    const newAsset: Asset = {
      ...body,
      assetId: `asset-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    registeredAssets.push(newAsset);
    return HttpResponse.json(newAsset, { status: 201 });
  }),

  // 8. POST /api/scans (Start Scan)
  http.post(`${BASE_URL}/api/scans`, async ({ request }) => {
    await delay(350);
    const body = (await request.json()) as { assetId?: string; scanners?: string[] };

    const startedAt = new Date().toISOString();
    currentScanState = {
      scanId: `scan-${Date.now()}`,
      scan_id: `scan-${Date.now()}`,
      assetId: body.assetId || registeredAssets[0].assetId,
      status: 'WAITING_FOR_HUMAN',
      scannersUsed: (body.scanners || ['NMAP', 'NUCLEI', 'OWASP_ZAP']).join(', '),
      startedAt,
      completedAt: null,
      currentStage: 1,
      current_stage: 1,
      agentOutput: {
        stage: 1,
        stage_summary: MOCK_STAGE_OUTPUT[1].summary,
        findings_processed: MOCK_STAGE_OUTPUT[1].findings,
      },
      stage_timings: [
        {
          stage: 1,
          agent: 'Agent 1: Parser & Normalizer',
          started_at: startedAt,
          completed_at: new Date(Date.now() + MOCK_STAGE_DURATIONS_MS[1]).toISOString(),
          duration_ms: MOCK_STAGE_DURATIONS_MS[1],
          status: 'COMPLETED',
        },
      ],
      total_duration_ms: MOCK_STAGE_DURATIONS_MS[1],
      intel_source: null,
      reasoning_mode: null,
    };

    return HttpResponse.json(currentScanState, { status: 201 });
  }),

  // 9. GET /api/scans/:id
  http.get(`${BASE_URL}/api/scans/:id`, async ({ params }) => {
    await delay(150);
    if (!currentScanState) {
      currentScanState = {
        ...mockScanJob,
        scanId: params.id as string,
        scan_id: params.id as string,
        currentStage: 1,
        status: 'WAITING_FOR_HUMAN',
      };
    }
    return HttpResponse.json(currentScanState, { status: 200 });
  }),

  // 10. POST /api/scans/:id/control (HITL Step Advancer)
  http.post(`${BASE_URL}/api/scans/:id/control`, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as ControlActionRequest;

    if (body.action === 'STOP') {
      if (currentScanState) {
        currentScanState.status = 'STOPPED';
      }
      return HttpResponse.json(currentScanState, { status: 200 });
    }

    if (body.action === 'CONTINUE') {
      const currentStage = currentScanState?.currentStage ?? currentScanState?.current_stage ?? 1;
      const nextStage = currentStage + 1;
      const prevTimings = currentScanState?.stage_timings || currentScanState?.stageTimings || [];

      if (nextStage > 4) {
        currentScanState = {
          ...currentScanState!,
          status: 'COMPLETED',
          currentStage: 4,
          current_stage: 4,
          completedAt: new Date().toISOString(),
        };
      } else {
        const startedAt = new Date().toISOString();
        const durationMs = MOCK_STAGE_DURATIONS_MS[nextStage] ?? 2000;
        const output = MOCK_STAGE_OUTPUT[nextStage];
        const newTiming = {
          stage: nextStage,
          agent: `Agent ${nextStage}`,
          started_at: startedAt,
          completed_at: new Date(Date.now() + durationMs).toISOString(),
          duration_ms: durationMs,
          status: 'COMPLETED',
        };
        currentScanState = {
          ...currentScanState!,
          status: 'WAITING_FOR_HUMAN',
          currentStage: nextStage,
          current_stage: nextStage,
          agentOutput: {
            stage: nextStage,
            stage_summary: output?.summary || `Stage ${nextStage} complete. Checkpoint waiting for analyst review.`,
            findings_processed: output?.findings,
          },
          stage_timings: [...prevTimings, newTiming],
          total_duration_ms: [...prevTimings, newTiming].reduce(
            (sum, t) => sum + (t.duration_ms || 0),
            0
          ),
          // Stage 3 (Threat Intel) is the only agent whose reasoning mode/intel provenance
          // the UI surfaces — mirrors agents_service defaults (offline mocks, deterministic
          // fallback unless LLM_ENABLED=true).
          intel_source: nextStage >= 3 ? 'MOCK_FIXTURES' : currentScanState?.intel_source ?? null,
          reasoning_mode: nextStage >= 3 ? 'AGENTIC' : currentScanState?.reasoning_mode ?? null,
        };
      }

      return HttpResponse.json(currentScanState, { status: 200 });
    }

    return HttpResponse.json({ error: 'Invalid control action' }, { status: 400 });
  }),
];

// Helper to reset scan
export const resetMockScan = () => {
  currentScanState = null;
  currentDashboard = { ...mockDashboard };
};

