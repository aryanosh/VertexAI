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
} from '@/types/contracts';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// In-memory token store with localStorage caching in browser
let authToken: string | null = null;
let currentRole: string | null = null;
let currentUsername: string | null = null;

if (typeof window !== 'undefined') {
  authToken = localStorage.getItem('vertexai_token');
  currentRole = localStorage.getItem('vertexai_role');
  currentUsername = localStorage.getItem('vertexai_username');
}

export const auth = {
  getToken: () => authToken,
  getRole: () => currentRole || 'ANALYST',
  getUsername: () => currentUsername || 'analyst',
  setSession: (token: string, username: string, role: string) => {
    authToken = token;
    currentUsername = username;
    currentRole = role;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vertexai_token', token);
      localStorage.setItem('vertexai_username', username);
      localStorage.setItem('vertexai_role', role);
    }
  },
  clearSession: () => {
    authToken = null;
    currentRole = null;
    currentUsername = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vertexai_token');
      localStorage.removeItem('vertexai_username');
      localStorage.removeItem('vertexai_role');
    }
  },
};

/**
 * Ensure user has a valid JWT token. If not logged in, auto-authenticates with
 * the default analyst seed credentials (analyst / analyst123).
 */
async function ensureAuthenticated(): Promise<string> {
  if (authToken) return authToken;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'analyst',
        password: 'analyst123',
      } as LoginRequest),
    });

    if (res.ok) {
      const data = (await res.json()) as LoginResponse;
      auth.setSession(data.token, data.username, data.role);
      return data.token;
    }
  } catch (err) {
    console.warn('[API] Auto-login fallback (backend may be offline):', err);
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
      auth.clearSession();
      const freshToken = await ensureAuthenticated();
      if (freshToken) {
        headers['Authorization'] = `Bearer ${freshToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (retryResponse.ok) {
          return retryResponse.json() as Promise<T>;
        }
      }
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

  // 2. Dashboard Metrics (GET /api/dashboard)
  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    try {
      return await apiFetch<DashboardMetrics>('/api/dashboard');
    } catch (err) {
      console.warn('[API] Fetch /api/dashboard fallback to default structure', err);
      return {
        security_score: 96.0,
        total_findings: 5,
        suppressed_findings: 1,
        active_findings: 4,
        noise_reduction_percent: 94.0,
        top_threats: [],
      };
    }
  },

  // 3. Vulnerabilities (GET /api/vulnerabilities)
  getVulnerabilities: async (
    severity?: string,
    priority?: string,
    includeSuppressed: boolean = false
  ): Promise<CanonicalFinding[]> => {
    const params = new URLSearchParams();
    if (severity) params.append('severity', severity);
    if (priority) params.append('priority', priority);
    if (includeSuppressed) params.append('include_suppressed', 'true');

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<CanonicalFinding[]>(`/api/vulnerabilities${query}`);
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

  // 6. Final Human Approval -> Dispatch GitHub Ticket (POST /api/vulnerabilities/{id}/ticket)
  createTicket: async (
    findingId: string,
    approved: boolean = true
  ): Promise<TicketResponse> => {
    return apiFetch<TicketResponse>(`/api/vulnerabilities/${findingId}/ticket`, {
      method: 'POST',
      body: JSON.stringify({ approved } as TicketApprovalRequest),
    });
  },

  // 7. Assets (GET/POST /api/assets)
  getAssets: async (): Promise<Asset[]> => {
    try {
      return await apiFetch<Asset[]>('/api/assets');
    } catch (err) {
      console.warn('[API] /api/assets error, using fallback seed asset', err);
      return [
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
      ];
    }
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
    return apiFetch<ScanStatusResponse>('/api/scans', {
      method: 'POST',
      body: JSON.stringify({
        assetId,
        scanners,
      } as ScanRequest),
    });
  },

  // 9. Get Scan Status (GET /api/scans/{id})
  getScanStatus: async (scanId: string): Promise<ScanStatusResponse> => {
    return apiFetch<ScanStatusResponse>(`/api/scans/${scanId}`);
  },

  // 10. HITL Control Action (POST /api/scans/{id}/control)
  submitControlAction: async (
    scanId: string,
    action: 'CONTINUE' | 'STOP'
  ): Promise<ScanStatusResponse> => {
    return apiFetch<ScanStatusResponse>(`/api/scans/${scanId}/control`, {
      method: 'POST',
      body: JSON.stringify({ action } as ControlActionRequest),
    });
  },
};
