/**
 * VertexAI / SentinelAI — TypeScript Data Contracts
 *
 * AUTHORITATIVE SOURCE: integration_plan.md §5, architecture_plan.md §8, §11
 * All field names match the Spring Boot backend DTOs and PostgreSQL schema.
 */

// ---------------------------------------------------------------------------
// Pipeline Status (scan_jobs.status)
// ---------------------------------------------------------------------------
export type PipelineStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_FOR_HUMAN'
  | 'COMPLETED'
  | 'STOPPED'
  | 'FAILED';

// ---------------------------------------------------------------------------
// Priority Level (risk_scores.priority_level)
// ---------------------------------------------------------------------------
export type PriorityLevel =
  | 'P0_CRITICAL'
  | 'P1_HIGH'
  | 'P2_MEDIUM'
  | 'P3_LOW';

// ---------------------------------------------------------------------------
// Scanner Sources (canonical_vulnerabilities.scanner_sources)
// ---------------------------------------------------------------------------
export type ScannerSource = 'NMAP' | 'NUCLEI' | 'OWASP_ZAP' | 'OPENVAS';

// ---------------------------------------------------------------------------
// CanonicalFinding — FROZEN CONTRACT (16 fields)
// Matches CanonicalFindingResponse DTO in backend
// ---------------------------------------------------------------------------
export interface CanonicalFinding {
  finding_id: string;
  fingerprint_hash: string;
  cve_id: string;
  vulnerability_name: string;
  target_host: string;
  target_port: number;
  scanner_sources: string[] | ScannerSource[];
  false_positive_prob: number;
  is_suppressed: boolean;
  is_accepted_risk: boolean;
  is_cisa_kev: boolean;
  epss_score: number;
  cvss_base_score?: number;
  composite_risk_score: number;
  priority_level: PriorityLevel | string;
  sla_deadline: string;
  explainable_rationale: string;

  // Per-finding ticket state, authoritative from the backend (risk_tickets table).
  // Never track dispatch state in component state: it leaks across findings and is
  // lost on reload.
  ticket_url?: string | null;
  ticket_status?: string | null;
  has_ticket?: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard Metrics — GET /api/dashboard response
// Matches DashboardResponse DTO in backend
// ---------------------------------------------------------------------------
export interface DashboardMetrics {
  /** The scan these metrics were computed for. Null only when no real scan exists yet. */
  scan_id?: string | null;
  security_score: number;
  total_findings: number;
  suppressed_findings: number;
  active_findings: number;
  noise_reduction_percent: number;
  before_noise?: number;
  after_noise?: number;
  top_threats: CanonicalFinding[];
}

// ---------------------------------------------------------------------------
// Agent 2 dedup report — GET /api/scans/{scanId}/dedup-report
// Covers every raw input finding, including ones merged away as duplicates or
// suppressed as false positives, not just the surviving canonical findings.
// ---------------------------------------------------------------------------
export type DuplicateStatus = 'KEPT' | 'REMOVED_DUPLICATE' | 'REMOVED_FALSE_POSITIVE' | 'ACCEPTED_RISK' | string;

export interface DedupRecord {
  finding_id: string;
  cve_id: string | null;
  scanner_source: string;
  target_host: string;
  severity: string;
  description: string;
  duplicate_group_id: string;
  duplicate_status: DuplicateStatus;
  reason: string;
}

// ---------------------------------------------------------------------------
// Asset — GET/POST /api/assets
// Matches AssetResponse DTO in backend (supports both camelCase and snake_case)
// ---------------------------------------------------------------------------
export interface Asset {
  assetId?: string;
  asset_id?: string;
  hostname: string;
  ipAddress?: string;
  ip_address?: string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEV' | string;
  criticalityRating?: number;
  criticality_rating?: number;
  ownerEmail?: string;
  owner_email?: string;
  isAuthorized?: boolean;
  is_authorized?: boolean;
  createdAt?: string;
  created_at?: string;
}

export interface CreateAssetRequest {
  hostname: string;
  ipAddress?: string;
  environment?: string;
  criticalityRating?: number;
  ownerEmail: string;
  isAuthorized?: boolean;
}

// ---------------------------------------------------------------------------
// ScanJob / ScanStatusResponse — GET /api/scans/{id}, POST /api/scans
// Matches ScanStatusResponse DTO in backend
// ---------------------------------------------------------------------------
export interface ScanStatusResponse {
  scanId?: string;
  scan_id?: string;
  assetId?: string;
  asset_id?: string;
  status: PipelineStatus;
  scannersUsed?: string;
  scanners_used?: string;
  startedAt?: string;
  started_at?: string;
  completedAt?: string | null;
  completed_at?: string | null;
  currentStage?: number;
  current_stage?: number;
  agentOutput?: unknown;
  agent_output?: unknown;

  // Real backend-measured per-agent execution times.
  stage_timings?: StageTiming[];
  stageTimings?: StageTiming[];
  total_duration_ms?: number;
  totalDurationMs?: number;
  error_message?: string | null;
  errorMessage?: string | null;

  /**
   * Provenance of Agent 3 threat intelligence. 'MOCK_FIXTURES' means bundled offline data
   * was used (USE_MOCKS=true) and the enrichment is NOT live exploit intelligence.
   */
  intel_source?: string | null;
  intelSource?: string | null;

  /**
   * How Agent 3 reached its conclusions.
   * 'AGENTIC'        — the model chose which threat-intel tools to call, per CVE.
   * 'AGENTIC_PARTIAL'— some CVEs fell back to the fixed lookup.
   * 'DETERMINISTIC'  — the original two-call sequence.
   */
  reasoning_mode?: string | null;
  reasoningMode?: string | null;
}

// ---------------------------------------------------------------------------
// StageTiming — matches StageTiming DTO in backend
// Genuine wall-clock measurement of each agent call, so the UI can display
// processing time instead of simulating it with a client-side timer.
// ---------------------------------------------------------------------------
export interface StageTiming {
  stage: number;
  agent: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  status?: string;
}

// For legacy references
export type ScanJob = ScanStatusResponse;

// ---------------------------------------------------------------------------
// Scan Trigger Request — POST /api/scans
// Matches ScanRequest DTO in backend
// ---------------------------------------------------------------------------
export interface ScanRequest {
  assetId: string;
  scanners: string[];
}

// ---------------------------------------------------------------------------
// HITL Control Action — POST /api/scans/{id}/control
// Matches ControlActionRequest DTO in backend
// ---------------------------------------------------------------------------
export interface ControlActionRequest {
  action: 'CONTINUE' | 'STOP';
}

// ---------------------------------------------------------------------------
// Ticket Dispatch Request & Response — POST /api/vulnerabilities/{id}/ticket
// Matches TicketApprovalRequest & TicketResponse DTOs in backend
// ---------------------------------------------------------------------------
export interface TicketApprovalRequest {
  approved: boolean;
}

export interface TicketResponse {
  ticket_id: string;
  ticket_url: string;
  status: string;
  assigned_owner: string;
  sla_deadline: string;
}

// ---------------------------------------------------------------------------
// Auth Login Request & Response — POST /api/auth/login
// Matches LoginRequest & LoginResponse DTOs in backend
// ---------------------------------------------------------------------------
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER' | string;
}

// ---------------------------------------------------------------------------
// WebSocket Message — ws://localhost:8080/ws/pipeline (/topic/pipeline)
// Broadcast from PipelineOrchestrator.java
// ---------------------------------------------------------------------------
export interface WebSocketPipelineMessage {
  scan_id: string;
  status: PipelineStatus;
  current_stage: number;
  payload: unknown;
  timestamp: string;
}

// Generic WebSocket event message for UI timeline
export interface WebSocketMessage {
  scan_id?: string;
  status?: string;
  stage?: number;
  message?: string;
  payload?: unknown;
  timestamp?: string;
  current_stage?: number;
}
