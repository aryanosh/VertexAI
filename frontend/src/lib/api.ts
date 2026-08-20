/**
 * Centralized API & Authentication Client for VertexAI
 * Connects Next.js Frontend (Team 3) with Spring Boot Backend (Team 1) on port 8080.
 *
 * Implements:
 * - JWT Token negotiation and automatic Bearer header injection
 * - Frozen REST contracts per integration_plan.md §4 & architecture_plan.md §11
 * - Resilient fallback handling
 */

import {
  DashboardMetrics,
  CanonicalFinding,
  Asset,
  CreateAssetRequest,
  ScanStatusResponse,
  ScanRequest,
  ControlActionRequest,
  TicketApprovalRequest,
  TicketResponse,
  LoginRequest,
  LoginResponse,
  DedupRecord,
} from '@/types/contracts';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// In-memory token store with sessionStorage in browser (fresh login on each dev launch)
let authToken: string | null = null;
let currentRole: string | null = null;
let currentUsername: string | null = null;

if (typeof window !== 'undefined') {
  authToken = sessionStorage.getItem('vertexai_token');
  currentRole = sessionStorage.getItem('vertexai_role');
  currentUsername = sessionStorage.getItem('vertexai_username');
}

export const auth = {
  getToken: () => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('vertexai_token') || authToken;
    }
    return authToken;
  },
  getRole: () => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('vertexai_role') || currentRole || 'ANALYST';
    }
    return currentRole || 'ANALYST';
  },
  getUsername: () => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('vertexai_username') || currentUsername || 'analyst';
    }
    return currentUsername || 'analyst';
  },
  isAuthenticated: () => {
    if (typeof window !== 'undefined') {
      return Boolean(sessionStorage.getItem('vertexai_token'));
    }
    return Boolean(authToken);
  },
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password } as LoginRequest),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Authentication failed with status ${res.status}`);
    }

    const data = (await res.json()) as LoginResponse;
    auth.setSession(data.token, data.username, data.role);
    return data;
  },
  setSession: (token: string, username: string, role: string) => {
    authToken = token;
    currentUsername = username;
    currentRole = role;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('vertexai_token', token);
      sessionStorage.setItem('vertexai_username', username);
      sessionStorage.setItem('vertexai_role', role);
      // Clean up any legacy localStorage tokens
      localStorage.removeItem('vertexai_token');
      localStorage.removeItem('vertexai_username');
      localStorage.removeItem('vertexai_role');
      window.dispatchEvent(
        new CustomEvent('auth-changed', {
          detail: { token, username, role, isAuthenticated: true },
        })
      );
    }
  },
  clearSession: () => {
    authToken = null;
    currentRole = null;
    currentUsername = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('vertexai_token');
      sessionStorage.removeItem('vertexai_username');
      sessionStorage.removeItem('vertexai_role');
      localStorage.removeItem('vertexai_token');
      localStorage.removeItem('vertexai_username');
      localStorage.removeItem('vertexai_role');
      window.dispatchEvent(
        new CustomEvent('auth-changed', {
          detail: { token: null, username: null, role: null, isAuthenticated: false },
        })
      );
    }
  },
};

/**
 * Ensure user has a valid JWT token.
 */
async function ensureAuthenticated(): Promise<string> {
  if (authToken) return authToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('vertexai_token');
    if (stored) {
      authToken = stored;
      currentRole = sessionStorage.getItem('vertexai_role');
      currentUsername = sessionStorage.getItem('vertexai_username');
      return stored;
    }
  }
  return '';
}

/**
 * Authenticated HTTP Request Helper
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await ensureAuthenticated();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && token) {
      // The token sessionStorage held was rejected by the backend (expired or
      // invalid). There is no way to "refresh" it client-side — a retry here
      // would just resend the same now-cleared token and fail identically,
      // forever, on every subsequent call. Clear the session and force the
      // user back through a real login; auth.clearSession() dispatches
      // 'auth-changed' with isAuthenticated:false, which the app root listens
      // to in order to show the login screen.
      auth.clearSession();
      throw new Error(
        `Session expired — please sign in again. [${response.status}] ${endpoint}`
      );
    }
    const errBody = await response.text();
    throw new Error(`API Error [${response.status}] ${endpoint}: ${errBody}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API Gateway Functions
// ---------------------------------------------------------------------------

export const api = {
  // 1. Authentication
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) {
      throw new Error(`Login failed with status ${res.status}`);
    }
    const data = (await res.json()) as LoginResponse;
    auth.setSession(data.token, data.username, data.role);
    return data;
  },

  // 2. Dashboard Metrics (GET /api/dashboard?scan_id=...)
  // `scanId` omitted -> backend defaults to the most recent completed non-seed scan.
  // No fallback data on error: a failed fetch must surface as a real error state in the
  // UI, never as fabricated numbers that look like genuine results.
  getDashboardMetrics: async (scanId?: string): Promise<DashboardMetrics> => {
    const query = scanId ? `?scan_id=${encodeURIComponent(scanId)}` : '';
    return apiFetch<DashboardMetrics>(`/api/dashboard${query}`);
  },

  // 3. Vulnerabilities (GET /api/vulnerabilities?scan_id=...)
  getVulnerabilities: async (
    scanId?: string,
    severity?: string,
    priority?: string,
    includeSuppressed: boolean = false
  ): Promise<CanonicalFinding[]> => {
    const params = new URLSearchParams();
    if (scanId) params.append('scan_id', scanId);
    if (severity) params.append('severity', severity);
    if (priority) params.append('priority', priority);
    if (includeSuppressed) params.append('include_suppressed', 'true');

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<CanonicalFinding[]>(`/api/vulnerabilities${query}`);
  },

  // 3b. Agent 2 per-finding dedup report (GET /api/scans/{scanId}/dedup-report)
  // Every raw input finding, including ones merged away as duplicates or suppressed as
  // false positives — not just the surviving canonical findings.
  getDedupReport: async (scanId: string): Promise<DedupRecord[]> => {
    return apiFetch<DedupRecord[]>(`/api/scans/${scanId}/dedup-report`);
  },

  // 3c. Download the same report as CSV (GET /api/scans/{scanId}/dedup-report.csv)
  // A plain <a href> can't carry the Bearer token, and the sandboxed-download restriction
  // that blocks script-driven saves applies only to the Artifacts environment this code was
  // authored in — not to the real browser this Next.js app runs in — so a fetch-as-blob +
  // temporary object URL is the correct approach here.
  downloadDedupReportCsv: async (scanId: string): Promise<void> => {
    const token = auth.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/dedup-report.csv`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to download dedup report [${res.status}]`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dedup-report-${scanId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // 4. Vulnerability by ID (GET /api/vulnerabilities/{id})
  getVulnerabilityById: async (id: string): Promise<CanonicalFinding> => {
    return apiFetch<CanonicalFinding>(`/api/vulnerabilities/${id}`);
  },

  // 5. Accept Business Risk (POST /api/vulnerabilities/{id}/accept-risk)
  acceptRisk: async (id: string, reason: string): Promise<CanonicalFinding> => {
    return apiFetch<CanonicalFinding>(`/api/vulnerabilities/${id}/accept-risk`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // 6. Create Ticket (POST /api/vulnerabilities/{id}/ticket)
  createTicket: async (
    findingId: string,
    approved: boolean = true
  ): Promise<TicketResponse> => {
    const res = await apiFetch<TicketResponse>(`/api/vulnerabilities/${findingId}/ticket`, {
      method: 'POST',
      body: JSON.stringify({ approved } as TicketApprovalRequest),
    });

    if (typeof window !== 'undefined') {
      // Announce the ticket URL only. Deliberately no `status` here: 'TICKET_DISPATCHED'
      // is not a real pipeline status and would overwrite the genuine backend state.
      window.dispatchEvent(
        new CustomEvent('pipeline-event', {
          detail: {
            ticketUrl: res.ticket_url,
            message: `GitHub issue successfully dispatched: ${res.ticket_url || 'Issue created'}`,
          },
        })
      );
    }
    return res;
  },

  // 7. Assets (GET/POST /api/assets)
  // No fallback data on error — propagate so the caller can show a real error state.
  getAssets: async (): Promise<Asset[]> => {
    return apiFetch<Asset[]>('/api/assets');
  },

  createAsset: async (asset: CreateAssetRequest): Promise<Asset> => {
    return apiFetch<Asset>('/api/assets', {
      method: 'POST',
      body: JSON.stringify(asset),
    });
  },

  // 8. Start Scan (POST /api/scans)
  startScan: async (
    assetId: string,
    scanners: string[] = ['NMAP', 'NUCLEI', 'OWASP_ZAP', 'OPENVAS']
  ): Promise<ScanStatusResponse> => {
    const res = await apiFetch<ScanStatusResponse>('/api/scans', {
      method: 'POST',
      body: JSON.stringify({
        assetId,
        scanners,
      } as ScanRequest),
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('pipeline-event', {
          detail: {
            status: res.status,
            stage: res.current_stage ?? res.currentStage ?? 0,
            scanId: res.scan_id || res.scanId,
            message: `Sandbox scan launched with ${scanners.join(', ')}. Agent 1 is parsing the reports.`,
          },
        })
      );
    }
    return res;
  },

  // 9. Get Scan Status (GET /api/scans/{id})
  getScanStatus: async (scanId: string): Promise<ScanStatusResponse> => {
    return apiFetch<ScanStatusResponse>(`/api/scans/${scanId}`);
  },

  // 9b. Get Latest Scan Status (GET /api/scans/latest)
  getLatestScan: async (): Promise<ScanStatusResponse | null> => {
    try {
      return await apiFetch<ScanStatusResponse>('/api/scans/latest');
    } catch {
      return null;
    }
  },

  // 10. HITL Control Action (POST /api/scans/{id}/control)
  submitControlAction: async (
    scanId: string,
    action: 'CONTINUE' | 'STOP'
  ): Promise<ScanStatusResponse> => {
    const res = await apiFetch<ScanStatusResponse>(`/api/scans/${scanId}/control`, {
      method: 'POST',
      body: JSON.stringify({ action } as ControlActionRequest),
    });

    if (typeof window !== 'undefined') {
      const stage = res.currentStage ?? res.current_stage ?? 1;
      const status = res.status ?? 'WAITING_FOR_HUMAN';
      const msg =
        action === 'STOP'
          ? `Pipeline stopped by analyst at Gate ${stage}.`
          : status === 'COMPLETED'
            ? 'Pipeline execution completed. All human approval gates passed.'
            : `Gate ${stage - 1 || 1} approved. Agent ${stage} complete — Checkpoint Gate ${stage} ready for review.`;

      window.dispatchEvent(
        new CustomEvent('pipeline-event', {
          detail: {
            status: status === 'COMPLETED' ? 'COMPLETED' : `GATE_${stage}_READY`,
            stage,
            scanId,
            message: msg,
          },
        })
      );
    }
    return res;
  },

  // 11. Multi-file Upload (POST /api/scans/upload)
  uploadScanReports: async (
    assetId: string,
    files: File[],
    scanners?: string[]
  ): Promise<ScanStatusResponse> => {
    const formData = new FormData();
    formData.append('assetId', assetId);
    files.forEach((file) => formData.append('files', file));
    if (scanners && scanners.length > 0) {
      scanners.forEach((sc) => formData.append('scanners', sc));
    }

    const token = auth.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/scans/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Failed to upload scan files with status ${res.status}`);
    }

    const data = (await res.json()) as ScanStatusResponse;
    const scanId = data.scanId || data.scan_id || '';
    if (typeof window !== 'undefined' && scanId) {
      // Deliberately not cached in sessionStorage: PipelineContext's `refresh()` already
      // restores the correct scan on page load via GET /api/scans/latest, which always
      // reflects the true latest scan server-side. A cached id here would go stale the
      // moment a second scan started in another tab and could resurrect an abandoned run.
      // Report the stage the backend actually reported. Defaulting to 1 used to claim
      // Agent 1 had finished the instant the upload returned, while it had only just
      // been queued.
      const stage = data.current_stage ?? data.currentStage ?? 0;
      window.dispatchEvent(
        new CustomEvent('pipeline-event', {
          detail: {
            status: data.status || 'RUNNING',
            stage,
            scanId,
            message: `Uploaded ${files.length} report file(s). Agent 1 is now parsing them for scan ${scanId}`,
          },
        })
      );
    }
    return data;
  },
};
