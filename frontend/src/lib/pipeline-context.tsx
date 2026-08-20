'use client';

/**
 * App-wide pipeline state.
 *
 * WHY THIS EXISTS
 * ---------------
 * The "Upload Dataset" box lives on /uploads while the Threat Overview pipeline
 * visualization lives on /dashboard. Those are separate Next.js routes, so they are
 * separate React mounts. Progress used to be announced with
 * `window.dispatchEvent(new CustomEvent('pipeline-event'))`, and a window event is only
 * received by components mounted at that exact moment. The Threat Overview was unmounted
 * during the upload, so the event was lost permanently and the pipeline appeared frozen.
 * It only "started" once the user navigated to the dashboard, because mounting the
 * component triggered a fetch of the latest scan.
 *
 * Hoisting the state into a provider mounted in the root layout means it survives route
 * changes, and a single app-wide WebSocket keeps every route live without any tab switch.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, auth } from '@/lib/api';
import type { DashboardMetrics, CanonicalFinding, ScanStatusResponse, StageTiming } from '@/types/contracts';

const TERMINAL_STATUSES = ['COMPLETED', 'STOPPED', 'FAILED'];
const ACTIVE_STATUSES = ['RUNNING', 'PENDING'];

interface PipelineContextValue {
  activeScanId: string | null;
  status: string;
  currentStage: number;
  stageSummaries: Record<number, string>;
  stageTimings: StageTiming[];
  totalDurationMs: number;
  agentOutput: unknown;
  errorMessage: string | null;
  /** 'LIVE_FEEDS' | 'MOCK_FIXTURES' | null — provenance of Agent 3 threat intel. */
  intelSource: string | null;
  /** 'AGENTIC' | 'AGENTIC_PARTIAL' | 'DETERMINISTIC' | null — how Agent 3 reasoned. */
  reasoningMode: string | null;
  ticketUrl: string | null;
  wsConnected: boolean;
  /** Milliseconds elapsed in the currently running stage, for a live counter. */
  runningElapsedMs: number;

  // Single source of truth for the current scan's dashboard/findings data. Every chart and
  // table in the app reads from these instead of independently calling the API, so a graph
  // can never show a different run than the findings table sitting next to it.
  dashboardMetrics: DashboardMetrics | null;
  vulnerabilities: CanonicalFinding[] | null;
  dashboardDataError: string | null;
  dashboardDataLoading: boolean;

  applyStatus: (resp: ScanStatusResponse | null) => void;
  setTicketUrl: (url: string | null) => void;
  refresh: () => Promise<void>;
  /** Bypasses the 400ms pipeline-event debounce for an immediate, authoritative refetch. */
  refreshImmediate: () => Promise<void>;
  /** Re-fetches dashboardMetrics/vulnerabilities for the current scan on demand. */
  refreshDashboardData: () => Promise<void>;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

/** Reads a field that the backend may emit as snake_case or camelCase. */
function pick<T>(resp: Record<string, unknown>, snake: string, camel: string): T | undefined {
  const a = resp[snake];
  if (a !== undefined && a !== null) return a as T;
  const b = resp[camel];
  if (b !== undefined && b !== null) return b as T;
  return undefined;
}

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('IDLE');
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [stageSummaries, setStageSummaries] = useState<Record<number, string>>({});
  const [stageTimings, setStageTimings] = useState<StageTiming[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState<number>(0);
  const [agentOutput, setAgentOutput] = useState<unknown>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [intelSource, setIntelSource] = useState<string | null>(null);
  const [reasoningMode, setReasoningMode] = useState<string | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [runningElapsedMs, setRunningElapsedMs] = useState(0);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [vulnerabilities, setVulnerabilities] = useState<CanonicalFinding[] | null>(null);
  const [dashboardDataError, setDashboardDataError] = useState<string | null>(null);
  const [dashboardDataLoading, setDashboardDataLoading] = useState(false);

  // Mirrors of state for use inside long-lived callbacks (WebSocket handlers) without
  // making them stale or forcing reconnects on every state change.
  const scanIdRef = useRef<string | null>(null);
  const statusRef = useRef<string>('IDLE');
  useEffect(() => {
    scanIdRef.current = activeScanId;
  }, [activeScanId]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /**
   * Clears every piece of per-scan state before a new scan's first response arrives.
   * Without this, a previous scan's agentOutput/ticketUrl/stageSummaries/etc. lingered
   * and rendered alongside the new scan's data until each field individually happened to
   * get overwritten — the root cause of findings/graphs looking "random" between runs.
   */
  const resetForNewScan = useCallback(() => {
    setStatus('PENDING');
    setCurrentStage(0);
    setStageSummaries({});
    setStageTimings([]);
    setTotalDurationMs(0);
    setAgentOutput(null);
    setErrorMessage(null);
    setIntelSource(null);
    setReasoningMode(null);
    setTicketUrl(null);
    setRunningElapsedMs(0);
    setDashboardMetrics(null);
    setVulnerabilities(null);
    setDashboardDataError(null);
  }, []);

  /**
   * Merges a scan status payload (REST response or WebSocket broadcast) into state.
   * `source: 'ws'` enforces strict same-scan filtering: a broadcast is only applied if its
   * scan_id matches the scan currently active in this tab. Without this, the single
   * app-wide raw WebSocket (which has no per-scan topic subscription semantics) could apply
   * — and even silently switch the active scan to — a broadcast belonging to a completely
   * different run. REST responses (`source: 'rest'`, the default) are always trusted,
   * since those come from a fetch this tab explicitly initiated for a specific scan.
   */
  const applyStatus = useCallback((resp: ScanStatusResponse | null, opts?: { source?: 'rest' | 'ws' }) => {
    if (!resp) return;
    const raw = resp as unknown as Record<string, unknown>;

    const scanId = pick<string>(raw, 'scan_id', 'scanId');

    if (opts?.source === 'ws') {
      if (scanIdRef.current && scanId && scanId !== scanIdRef.current) {
        // Broadcast belongs to a different scan than the one this tab is viewing — drop
        // the entire message rather than merging any part of it into current state.
        return;
      }
    } else if (scanId && scanId !== scanIdRef.current) {
      // A REST fetch just resolved for a different (usually brand-new) scan than what was
      // previously active — clear stale per-scan state before adopting the new one.
      resetForNewScan();
    }

    if (scanId) setActiveScanId(scanId);

    if (resp.status) setStatus(resp.status);

    const stage = pick<number>(raw, 'current_stage', 'currentStage');
    if (typeof stage === 'number') setCurrentStage(stage);

    const timings = pick<StageTiming[]>(raw, 'stage_timings', 'stageTimings');
    if (Array.isArray(timings)) setStageTimings(timings);

    const total = pick<number>(raw, 'total_duration_ms', 'totalDurationMs');
    if (typeof total === 'number') setTotalDurationMs(total);

    const err = pick<string>(raw, 'error_message', 'errorMessage');
    setErrorMessage(err ?? null);

    const src = pick<string>(raw, 'intel_source', 'intelSource');
    if (src) setIntelSource(src);

    const mode = pick<string>(raw, 'reasoning_mode', 'reasoningMode');
    if (mode) setReasoningMode(mode);

    // Agent payload arrives as `agentOutput` over REST and as `payload` over WebSocket.
    const output = pick<unknown>(raw, 'agent_output', 'agentOutput') ?? raw.payload;
    if (output !== undefined && output !== null) {
      setAgentOutput(output);

      // Agent 1 returns a human-readable stage_summary; keep it per stage.
      if (typeof output === 'object' && !Array.isArray(output)) {
        const summary = (output as Record<string, unknown>).stage_summary;
        if (typeof summary === 'string' && typeof stage === 'number') {
          setStageSummaries((prev) => ({ ...prev, [stage]: summary }));
        }
      }
    }
  }, [resetForNewScan]);

  const refresh = useCallback(async () => {
    if (!auth.isAuthenticated()) return;
    const id = scanIdRef.current;
    // No active scan in this session — do NOT fall back to api.getLatestScan(). That
    // fallback used to run on every fresh app load/restart (activeScanId is always null at
    // that point) and silently adopted whatever scan happened to be latest in the database
    // as "the active pipeline" — including a stale WAITING_FOR_HUMAN gate from a run that
    // had already ended. Historical scans stay in the database; they must only become the
    // active pipeline through an explicit action in this session (a new upload/start-scan),
    // never automatically on load.
    if (!id) return;
    try {
      const latest = await api.getScanStatus(id);
      applyStatus(latest);
    } catch (err) {
      console.warn('[pipeline] status refresh failed', err);
    }
  }, [applyStatus]);

  // Identical to `refresh`, but callers use this name at the exact moment a human just
  // took an action (Continue/Approve/Stop) to make clear the fetch must happen NOW, not
  // after the shared 400ms `pipeline-event` debounce (see effect #5 below). Using the
  // debounced path for a just-performed action was the stale-UI-after-approval bug.
  const refreshImmediate = refresh;

  /**
   * Fetches dashboard metrics and the vulnerabilities list for one specific scan and
   * stores them in shared context state. This is the ONLY place either endpoint is called
   * for normal dashboard/graph/table rendering — every consumer (top-threats,
   * noise-reduction-chart, funnel-breakdown-chart, network-comparison-graph, the findings
   * table) reads from this single fetch via `usePipeline()` instead of independently
   * calling the API, so a graph can never show a different run than the table beside it.
   */
  const refreshDashboardData = useCallback(async () => {
    if (!auth.isAuthenticated()) return;
    // No active scan in this session — do NOT call the API with an omitted scan_id.
    // Both /api/dashboard and /api/vulnerabilities fall back to "the most recent
    // completed scan" on the backend when scan_id is left off, which would silently
    // repopulate the dashboard with a historical run's data on every fresh app load
    // (see the identical guard in `refresh` above). Historical scans stay in the
    // database; they must only become visible here through an explicit action in this
    // session (a new upload/start-scan), never automatically on load.
    if (!scanIdRef.current) {
      setDashboardMetrics(null);
      setVulnerabilities([]);
      setDashboardDataError(null);
      setDashboardDataLoading(false);
      return;
    }
    setDashboardDataLoading(true);
    try {
      const scanId = scanIdRef.current;
      const [metrics, vulns] = await Promise.all([
        api.getDashboardMetrics(scanId),
        api.getVulnerabilities(scanId),
      ]);
      setDashboardMetrics(metrics);
      setVulnerabilities(vulns);
      setDashboardDataError(null);
    } catch (err) {
      console.warn('[pipeline] dashboard data refresh failed', err);
      setDashboardDataError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setDashboardDataLoading(false);
    }
  }, []);

  // --- 1. Restore state once on app load -----------------------------------
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // --- 1b. Keep the shared dashboard/findings data in sync with the active scan and its
  // stage progression, so every chart/table updates together as the pipeline advances. ---
  useEffect(() => {
    void refreshDashboardData();
  }, [activeScanId, status, currentStage, refreshDashboardData]);

  // --- 2. Single app-wide WebSocket, with reconnect backoff -----------------
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws/pipeline';

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const raw = String(event.data);
          if (!raw.trim().startsWith('{')) return;
          const msg = JSON.parse(raw) as ScanStatusResponse;
          applyStatus(msg, { source: 'ws' });
        } catch {
          // Ignore non-JSON frames (e.g. STOMP handshake noise).
        }
      };

      ws.onerror = () => setWsConnected(false);

      ws.onclose = () => {
        setWsConnected(false);
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (closed) return;
      attempt += 1;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [applyStatus]);

  // --- 3. Polling fallback --------------------------------------------------
  // The old implementation bailed out unless status was RUNNING/PENDING, so it stopped
  // polling exactly when a HITL gate opened. Poll whenever the scan is not in a terminal
  // state and either the socket is down or an agent is actively executing.
  useEffect(() => {
    const isTerminal = TERMINAL_STATUSES.includes(status);
    const isActive = ACTIVE_STATUSES.includes(status);
    const shouldPoll = !isTerminal && (!wsConnected || isActive);
    if (!shouldPoll) return;

    const intervalMs = isActive ? 1500 : 4000;
    const interval = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [status, wsConnected, refresh]);

  // --- 4. Live elapsed counter for the stage currently executing ------------
  useEffect(() => {
    if (status !== 'RUNNING') {
      setRunningElapsedMs(0);
      return;
    }
    const running = stageTimings.find((t) => t.status === 'RUNNING' && t.started_at);
    const startedAt = running?.started_at ? new Date(running.started_at).getTime() : Date.now();

    const tick = () => setRunningElapsedMs(Math.max(0, Date.now() - startedAt));
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [status, stageTimings]);

  // --- 5. Keep consuming the legacy window CustomEvents --------------------
  // api.ts and several widgets still dispatch these on upload / gate action / ticket
  // dispatch. Now that the provider is always mounted, they are finally received no matter
  // which route fired them.
  //
  // The follow-up refresh is debounced because LiveTimelineStream re-broadcasts every
  // WebSocket frame as a `pipeline-event`; without debouncing, each frame would trigger its
  // own REST call.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        status?: string;
        stage?: number;
        scanId?: string;
        ticketUrl?: string;
        summary?: string;
      }>).detail;
      if (!detail) return;

      if (detail.scanId) {
        if (detail.scanId !== scanIdRef.current) {
          // A genuinely new scan just started (upload/startScan) — clear the previous
          // scan's lingering state before adopting the new id.
          resetForNewScan();
        }
        setActiveScanId(detail.scanId);
      }
      // Only accept real pipeline statuses; some callers emit UI-only labels.
      if (detail.status && detail.status !== 'TICKET_DISPATCHED') setStatus(detail.status);
      if (typeof detail.stage === 'number') setCurrentStage(detail.stage);
      if (detail.ticketUrl) setTicketUrl(detail.ticketUrl);
      if (detail.summary && typeof detail.stage === 'number') {
        setStageSummaries((prev) => ({ ...prev, [detail.stage as number]: detail.summary as string }));
      }

      // Pull authoritative state shortly after any local optimistic update.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void refresh(), 400);
    };

    window.addEventListener('pipeline-event', handler);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('pipeline-event', handler);
    };
  }, [refresh, resetForNewScan]);

  const value = useMemo<PipelineContextValue>(
    () => ({
      activeScanId,
      status,
      currentStage,
      stageSummaries,
      stageTimings,
      totalDurationMs,
      agentOutput,
      errorMessage,
      intelSource,
      reasoningMode,
      ticketUrl,
      wsConnected,
      runningElapsedMs,
      dashboardMetrics,
      vulnerabilities,
      dashboardDataError,
      dashboardDataLoading,
      applyStatus,
      setTicketUrl,
      refresh,
      refreshImmediate,
      refreshDashboardData,
    }),
    [
      activeScanId,
      status,
      currentStage,
      stageSummaries,
      stageTimings,
      totalDurationMs,
      agentOutput,
      errorMessage,
      intelSource,
      reasoningMode,
      ticketUrl,
      dashboardMetrics,
      vulnerabilities,
      dashboardDataError,
      dashboardDataLoading,
      refreshDashboardData,
      wsConnected,
      runningElapsedMs,
      applyStatus,
      refresh,
      refreshImmediate,
    ]
  );

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) {
    throw new Error('usePipeline must be used inside a PipelineProvider (mounted in app/layout.tsx)');
  }
  return ctx;
}

/** Formats a duration for display, e.g. 4213 -> "4.2s". */
export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
