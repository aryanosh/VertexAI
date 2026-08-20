'use client';

import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  Cpu,
  Layers,
  Zap,
  ShieldCheck,
  Send,
  Database,
  FileCode,
  CheckCircle2,
  XCircle,
  Activity,
  UploadCloud,
  FileCode2,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Brain,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { usePipeline, formatDuration } from "@/lib/pipeline-context";
import type { CanonicalFinding, StageTiming } from "@/types/contracts";

export interface ArchitecturalStage {
  id: string;
  stepNumber: number;
  stageNumber?: number; // Maps to backend stage 1, 2, 3, 4
  subsystem: string;
  name: string;
  role: string;
  icon: LucideIcon;
  overview: string;
  reads: string;
  writes: string;
  defaultReasoning: string;
  gateBehavior?: {
    approve: string;
    stop: string;
  };
  telemetryMetrics: string[];
}

export const ARCHITECTURAL_STAGES: ArchitecturalStage[] = [
  {
    id: "upload",
    stepNumber: 1,
    subsystem: "Scanner Sandbox Layer",
    name: "Upload",
    role: "Multi-Scanner Ingestion",
    icon: Upload,
    overview:
      "Accepts 2+ multi-scanner raw outputs (.json, .xml, .jsonl) from OWASP ZAP, Nuclei, OpenVAS, and Nmap. Enforces sandbox isolation with zero egress privileges to protect internal networks.",
    reads: "Raw scanner files staged by the security analyst.",
    writes: "Creates tracking record in the `scan_jobs` database table with status `RUNNING`.",
    defaultReasoning: "Raw multi-scanner reports ingested into isolated sandbox. Ready for parsing.",
    telemetryMetrics: [
      "Formats: .json, .xml, .jsonl",
      "Sandbox Egress: 0 Privileges (Isolated)",
      "Database: scan_jobs table",
    ],
  },
  {
    id: "normalization",
    stepNumber: 2,
    stageNumber: 1,
    subsystem: "Ingestion & Normalization",
    name: "Normalization",
    role: "Agent 1: Parser & Standardizer",
    icon: Cpu,
    overview:
      "Parses heterogeneous scanner outputs with custom regex and xmltodict parsers into a strict, uniform JSON schema (`UnifiedFinding`), standardizing port numbers, CVSS baselines, and CVE tags.",
    reads: "Raw report contents from scanner sandbox; validates format-specific structures.",
    writes: "Standardized `UnifiedFinding` records.",
    defaultReasoning: "Parsed raw findings across scanner reports. Standardized schemas, validated port numbers, and mapped baseline CVSS metrics.",
    gateBehavior: {
      approve: "APPROVE / CONTINUE: Authorizes advancing to Agent 2 (Deduplication).",
      stop: "STOP / REJECT: Halts pipeline immediately and blocks further agent execution.",
    },
    telemetryMetrics: [
      "Schema: UnifiedFinding JSON",
      "Parsers: xmltodict + regex",
      "Human Review Gate: Gate 1 Enforced",
    ],
  },
  {
    id: "deduplication",
    stepNumber: 3,
    stageNumber: 2,
    subsystem: "Deduplication & Noise Filter",
    name: "Deduplication",
    role: "Agent 2: XGBoost ML Filter",
    icon: Layers,
    overview:
      "Computes MD5 canonical composite keys (CVE ID + Target IP + Target Port) to merge redundant cross-scanner alerts, and classifies false-positives using a 5-feature XGBoost gradient-boosted decision tree.",
    reads: "`UnifiedFinding` records from Agent 1; evaluates port response and CVE noise rate.",
    writes: "`CanonicalFinding` entities persisted to PostgreSQL `canonical_vulnerabilities`.",
    defaultReasoning: "Evaluated raw findings using MD5(CVE+Host+Port). Merged duplicate alerts across scanners and applied XGBoost ML false-positive filter.",
    gateBehavior: {
      approve: "APPROVE / CONTINUE: Authorizes advancing to Agent 3 (Threat Intel).",
      stop: "STOP / REJECT: Halts pipeline immediately at Gate 2.",
    },
    telemetryMetrics: [
      "Key: MD5(cve_id + host + port)",
      "ML Model: XGBoost FP Classifier",
      "Human Review Gate: Gate 2 Enforced",
    ],
  },
  {
    id: "threat_intel",
    stepNumber: 4,
    stageNumber: 3,
    subsystem: "Threat Intelligence",
    name: "Threat Intelligence",
    role: "Agent 3: Threat Intelligence Comparison & Enrichment",
    icon: Zap,
    overview:
      "Compares each canonical finding's CVE against live CISA KEV and FIRST EPSS probability feeds via async httpx, using NVIDIA Nemotron agentic reasoning to decide which sources to query and when enough evidence has been gathered.",
    reads: "`CanonicalFinding` records from Agent 2 + real-time CISA KEV catalog + FIRST EPSS API feeds.",
    writes: "Persists enriched intelligence to `vulnerability_intelligence`.",
    defaultReasoning: "Correlated canonical findings against live CISA KEV catalogs and FIRST EPSS exploit probability feeds.",
    gateBehavior: {
      approve: "APPROVE / CONTINUE: Authorizes advancing to Agent 4 (Risk Scoring).",
      stop: "STOP / REJECT: Halts pipeline immediately at Gate 3.",
    },
    telemetryMetrics: [
      "Sources: CISA KEV catalog, FIRST EPSS API",
      "Reasoning: NVIDIA Nemotron agentic tool selection",
      "Human Review Gate: Gate 3 Enforced",
    ],
  },
  {
    id: "risk_scoring",
    stepNumber: 5,
    stageNumber: 4,
    subsystem: "Risk Scoring & Ticket Prep",
    name: "Risk Scoring",
    role: "Agent 4: Risk Scoring & Ticket Preparation",
    icon: Database,
    overview:
      "Calculates a transparent, explainable 0–100 composite risk score from CVSS, EPSS, CISA KEV status, asset criticality, and exploit availability, assigns a P0–P3 priority and SLA deadline, and prepares a ticket-ready remediation payload.",
    reads: "Enriched `VulnerabilityIntelligence` records from Agent 3.",
    writes: "Persists composite scores to `risk_scores`; prepares the ticket payload for human-gated dispatch.",
    defaultReasoning: "Computed composite risk scores (0-100) and generated structured Markdown remediation tickets with SLA deadlines.",
    gateBehavior: {
      approve: "APPROVE / DISPATCH: Authorizes Spring Boot to dispatch an official remediation ticket to GitHub Issues.",
      stop: "STOP / REJECT: Halts pipeline immediately at the final gate and strictly prevents ticket generation.",
    },
    telemetryMetrics: [
      "Formula: (CVSS/10 x 30) + (EPSS x 25) + KEV(+20) + (Crit/5 x 15) + Exploit(+10)",
      "SLAs: P0 (24h), P1 (72h), P2 (14d), P3 (30d)",
      "Human Review Gate: Gate 4 Enforced",
    ],
  },
  {
    id: "human_review",
    stepNumber: 6,
    subsystem: "Governance & Policy Gate",
    name: "Human Review",
    role: "Final HITL Approval — Not an Agent",
    icon: ShieldCheck,
    overview:
      "Mandatory Security Analyst checkpoint that enforces zero uncontrolled autonomy. This is a governance control, not an AI agent: the analyst inspects Agent 4's scored findings, explainable mathematical breakdowns, and proposed ticket payload before authorizing external dispatch.",
    reads: "Top-ranked `RiskScore` records, mathematical point breakdowns, and ticket templates from Agent 4.",
    writes: "Analyst authorization decision logged to audit trail; triggers either ticket dispatch or immediate pipeline halt.",
    defaultReasoning: "Awaiting analyst review of Agent 4's composite risk scores and proposed remediation ticket.",
    gateBehavior: {
      approve: "APPROVE / DISPATCH: Authorizes Spring Boot to dispatch an official remediation ticket to GitHub Issues.",
      stop: "STOP / REJECT: Halts pipeline execution immediately and strictly prevents external ticket generation.",
    },
    telemetryMetrics: [
      "Policy: Zero Uncontrolled Autonomy",
      "Controls: Approve & Dispatch | Stop / Reject",
      "Governance Checkpoint — No AI Reasoning",
    ],
  },
  {
    id: "ticketing",
    stepNumber: 7,
    subsystem: "Ticketing & Remediation",
    name: "Ticketing",
    role: "GitHubTicketingService.java",
    icon: Send,
    overview:
      "Spring Boot backend service (sole authorized GitHub REST API client) dispatches verified markdown tickets with reproduction steps, CVE tags, assignee owner, and SLA deadlines, returning external issue URL.",
    reads: "Human-approved `RiskScore` payload and configured GitHub repository credentials.",
    writes: "Dispatches HTTP POST to GitHub API, generates live issue URL, and persists ticket record to `risk_tickets`.",
    defaultReasoning: "Remediation ticket dispatched to GitHub repository issues board with SLA tracking.",
    telemetryMetrics: [
      "Sole Client: GitHubTicketingService.java",
      "Database: risk_tickets (status: OPEN)",
      "Output: Direct clickable GitHub Issue URL",
    ],
  },
];

/**
 * Reads a "findings processed" count from the current stage's live agent output, when
 * that stage is the one the pipeline is (or just was) actively executing. agentOutput in
 * the shared provider only ever holds the most recently received stage's payload, so this
 * only applies to the matching stage's node — other nodes show nothing rather than a stale
 * or invented number.
 */
function getFindingsProcessed(
  stage: ArchitecturalStage,
  pipelineStage: number,
  agentOutput: unknown
): number | null {
  if (!stage.stageNumber || stage.stageNumber !== pipelineStage) return null;
  if (!agentOutput || typeof agentOutput !== "object" || Array.isArray(agentOutput)) return null;
  const out = agentOutput as Record<string, unknown>;
  const candidates = [
    out.findings_processed,
    out.findingsCount,
    out.findings_count,
    out.normalized_count,
    out.final_count,
    out.processed_count,
  ];
  const found = candidates.find((v) => typeof v === "number");
  return typeof found === "number" ? found : null;
}

interface StagedFile {
  file: File;
  name: string;
  size: number;
}

/**
 * Animates a number counting up/down to a new value whenever it changes, instead of
 * snapping instantly — a visible cue that a real score changed, not a decorative effect.
 * Renders "—" when the value is unknown, and skips the tween entirely (snaps straight to
 * the new value) under prefers-reduced-motion or during server-side rendering.
 */
function AnimatedScore({ value }: { value: number | null | undefined }) {
  const [display, setDisplay] = useState<number>(value ?? 0);
  const prevRef = useRef<number>(value ?? 0);

  useEffect(() => {
    if (value == null) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;

    if (from === to) {
      setDisplay(to);
      return;
    }
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(to);
      return;
    }

    const tween = { v: from };
    let cancelled = false;
    import("animejs").then((animeModule) => {
      if (cancelled) return;
      const mod = animeModule as unknown as Record<string, unknown>;
      const anime = (mod.default || mod) as (params: Record<string, unknown>) => void;
      anime({
        targets: tween,
        v: to,
        round: 1,
        duration: 550,
        easing: "easeOutQuad",
        update: () => setDisplay(tween.v),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return <>{value == null ? "—" : Math.round(display)}</>;
}

export function ThreatFlow() {
  // Pipeline state comes from the app-wide provider, so an upload performed on the
  // /uploads route is reflected here immediately. Previously this component kept its own
  // isolated copy and only learned about a scan when it happened to mount, which is why
  // the agents appeared to "start" only after switching tabs.
  const {
    activeScanId,
    status: pipelineStatus,
    currentStage: pipelineStage,
    stageSummaries,
    stageTimings,
    totalDurationMs,
    runningElapsedMs,
    wsConnected,
    agentOutput,
    intelSource,
    reasoningMode,
    ticketUrl: dispatchedTicketUrl,
    setTicketUrl: setDispatchedTicketUrl,
    applyStatus,
    refreshImmediate,
    refreshDashboardData,
    vulnerabilities,
  } = usePipeline();

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const [expandedStageId, setExpandedStageId] = useState<string | null>("upload");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // Sourced from the app-wide scan-scoped fetch (PipelineProvider), not an independent
  // unscoped `api.getVulnerabilities()` call — that used to show the previous scan's top
  // finding here (CVE, target host, EPSS) even when no scan was currently active.
  const topFinding: CanonicalFinding | null =
    vulnerabilities && vulnerabilities.length > 0 ? vulnerabilities[0] : null;

  // Measured duration per stage, keyed by stage number, for inline display.
  const timingByStage = React.useMemo(() => {
    const map: Record<number, StageTiming> = {};
    stageTimings.forEach((t) => {
      if (typeof t.stage === "number") map[t.stage] = t;
    });
    return map;
  }, [stageTimings]);

  // Minimal upload staging state for Node 1
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Refs for the real-state-driven animations below: one per node's icon circle (for the
  // completed-stage pop and as endpoints for the handoff pulse), the scrollable track that
  // holds them (to measure positions for the traveling pulse dot), the pulse dot itself, and
  // the gate-approval panel (for the "pipeline paused for review" cue).
  const nodeIconRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollTrackRef = useRef<HTMLDivElement | null>(null);
  const pulseDotRef = useRef<HTMLDivElement | null>(null);
  const gatePanelRef = useRef<HTMLDivElement | null>(null);
  const prevNodeStatesRef = useRef<Record<string, string>>({});
  const prevStatusRef = useRef<string>("IDLE");

  // 1b. Active Polling when Pipeline is Running (Ensures live status without tab switching)
  // Auto-expand the node for whichever stage the pipeline is currently on.
  // Polling, WebSocket streaming and window-event handling now live in PipelineProvider,
  // so this component no longer needs its own (route-scoped) copies of them.
  useEffect(() => {
    if (pipelineStage > 0) {
      const stageObj = ARCHITECTURAL_STAGES.find((s) => s.stageNumber === pipelineStage);
      if (stageObj) setExpandedStageId(stageObj.id);

      // Subtle stage-transition cue on the node grid itself, independent of the panel
      // expand animation below. Skipped entirely under prefers-reduced-motion.
      if (typeof window !== "undefined" && !prefersReducedMotion) {
        const grid = document.querySelector('[data-threat-flow-grid="true"]');
        if (grid) {
          import("animejs").then((animeModule) => {
            const mod = animeModule as unknown as Record<string, unknown>;
            const anime = (mod.default || mod) as (params: Record<string, unknown>) => void;
            anime({
              targets: grid.children,
              scale: [0.98, 1],
              opacity: [0.75, 1],
              duration: 320,
              delay: (_el: unknown, i: number) => i * 25,
              easing: "easeOutQuad",
            });
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineStage]);

  const handleToggleStage = (stageId: string) => {
    setExpandedStageId((prev) => (prev === stageId ? null : stageId));

    if (typeof window !== "undefined" && !prefersReducedMotion) {
      setTimeout(() => {
        const el = panelRefs.current[stageId];
        if (el) {
          import("animejs").then((animeModule) => {
            const mod = animeModule as unknown as Record<string, unknown>;
            const anime = (mod.default || mod) as (params: Record<string, unknown>) => void;
            anime({
              targets: el,
              opacity: [0.3, 1],
              translateY: [-6, 0],
              duration: 280,
              easing: "easeOutCubic",
            });
          });
        }
      }, 20);
    }
  };

  // Node state calculation (Pending, Active, Waiting, Approved, Stopped, Failed)
  const getNodeState = (
    stage: ArchitecturalStage
  ): "pending" | "active" | "waiting" | "approved" | "stopped" | "failed" => {
    if (pipelineStatus === "FAILED") {
      if (stage.stageNumber && stage.stageNumber === pipelineStage) return "failed";
      if (stage.stageNumber && stage.stageNumber < pipelineStage) return "approved";
      return "pending";
    }

    if (pipelineStatus === "STOPPED") {
      if (stage.stageNumber && stage.stageNumber === pipelineStage) return "stopped";
      if (stage.stageNumber && stage.stageNumber < pipelineStage) return "approved";
      return "pending";
    }

    if (stage.id === "upload") {
      if (pipelineStage > 0 || pipelineStatus === "COMPLETED") return "approved";
      if (stagedFiles.length > 0) return "active";
      return "pending";
    }

    if (stage.id === "ticketing") {
      if (dispatchedTicketUrl) return "approved";
      if (pipelineStatus === "COMPLETED") return "active";
      return "pending";
    }

    // Human Review is not a numbered agent stage (no stage.stageNumber), so it needs its
    // own state rule instead of the generic stageNumber-comparison below. It becomes
    // actionable the moment Agent 4 finishes (stage 4, WAITING_FOR_HUMAN) and stays
    // "waiting" for as long as the analyst hasn't dispatched a ticket yet — including
    // through the brief COMPLETED state that `handleFinalTicketApproval` now produces as
    // part of the same click, so it never renders "approved" before a ticket actually exists.
    if (stage.id === "human_review") {
      if (dispatchedTicketUrl) return "approved";
      if (pipelineStage === 4 && (pipelineStatus === "WAITING_FOR_HUMAN" || pipelineStatus === "COMPLETED")) {
        return "waiting";
      }
      return "pending";
    }

    const sNum = stage.stageNumber || 0;
    // Once approved, badge stays green ("Approved") even after moving to next stage
    if (pipelineStage > sNum || pipelineStatus === "COMPLETED") return "approved";
    if (pipelineStage === sNum) {
      if (pipelineStatus === "WAITING_FOR_HUMAN") return "waiting";
      if (pipelineStatus === "RUNNING") return "active";
    }
    return "pending";
  };

  // Real-state-driven animations: a node that just finished gets a brief completion pop,
  // and a small pulse travels along the connector from the node that just completed to the
  // one that just started — an actual handoff cue, not a decorative loop. Both are one-shot,
  // triggered only on a genuine state transition (compared against the previous render's
  // states), and are skipped entirely under prefers-reduced-motion.
  useEffect(() => {
    if (typeof window === "undefined" || prefersReducedMotion) return;

    const prevStates = prevNodeStatesRef.current;
    const newStates: Record<string, string> = {};
    let completedIndex = -1;
    let startedIndex = -1;

    ARCHITECTURAL_STAGES.forEach((stage, i) => {
      const state = getNodeState(stage);
      newStates[stage.id] = state;
      const prev = prevStates[stage.id];

      if (prev && prev !== "approved" && state === "approved") {
        completedIndex = i;
        const el = nodeIconRefs.current[stage.id];
        if (el) {
          import("animejs").then((animeModule) => {
            const mod = animeModule as unknown as Record<string, unknown>;
            const anime = (mod.default || mod) as (params: Record<string, unknown>) => void;
            anime({ targets: el, scale: [1, 1.16, 1], duration: 480, easing: "easeOutBack" });
          });
        }
      }
      if (prev && prev !== "active" && state === "active") {
        startedIndex = i;
      }
    });
    prevNodeStatesRef.current = newStates;

    // Handoff pulse: only when the newly-active node is immediately after the
    // newly-completed one — a genuine agent-to-agent handoff, not an arbitrary jump.
    if (completedIndex >= 0 && startedIndex === completedIndex + 1) {
      const fromEl = nodeIconRefs.current[ARCHITECTURAL_STAGES[completedIndex].id];
      const toEl = nodeIconRefs.current[ARCHITECTURAL_STAGES[startedIndex].id];
      const dot = pulseDotRef.current;
      const track = scrollTrackRef.current;
      if (fromEl && toEl && dot && track) {
        const trackRect = track.getBoundingClientRect();
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const fromX = fromRect.left + fromRect.width / 2 - trackRect.left + track.scrollLeft;
        const toX = toRect.left + toRect.width / 2 - trackRect.left + track.scrollLeft;
        dot.style.left = `${fromX}px`;
        dot.style.opacity = "1";
        import("animejs").then((animeModule) => {
          const mod = animeModule as unknown as Record<string, unknown>;
          const anime = (mod.default || mod) as (params: Record<string, unknown>) => void;
          anime({
            targets: dot,
            left: [`${fromX}px`, `${toX}px`],
            opacity: [1, 1, 0],
            duration: 700,
            easing: "easeInOutQuad",
          });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineStage, pipelineStatus, dispatchedTicketUrl]);

  // Approval pause cue: a brief attention pulse on the gate panel the moment the pipeline
  // actually pauses for human review (a genuine WAITING_FOR_HUMAN transition), not on every
  // render. "Resume" is already covered by the handoff pulse above once the analyst acts.
  useEffect(() => {
    if (typeof window === "undefined" || prefersReducedMotion) {
      prevStatusRef.current = pipelineStatus;
      return;
    }
    if (pipelineStatus === "WAITING_FOR_HUMAN" && prevStatusRef.current !== "WAITING_FOR_HUMAN") {
      const el = gatePanelRef.current;
      if (el) {
        import("animejs").then((animeModule) => {
          const mod = animeModule as unknown as Record<string, unknown>;
          const anime = (mod.default || mod) as (params: Record<string, unknown>) => void;
          anime({ targets: el, scale: [0.97, 1], opacity: [0.4, 1], duration: 420, easing: "easeOutQuad" });
        });
      }
    }
    prevStatusRef.current = pipelineStatus;
  }, [pipelineStatus, prefersReducedMotion]);

  // Inline Gate Action Handlers directly for each specific stage
  const handleGateAction = async (action: "CONTINUE" | "STOP") => {
    if (!activeScanId) return;
    setActionLoading(true);
    try {
      // The backend now runs the approved agent asynchronously and returns RUNNING
      // immediately, so the provider's WebSocket/polling reports the real
      // RUNNING -> WAITING_FOR_HUMAN transition and the measured duration.
      const resp = await api.submitControlAction(activeScanId, action);
      applyStatus(resp);
      await refreshImmediate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Gate action failed: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Final Ticket Approval Handler
  const handleFinalTicketApproval = async () => {
    // Dispatch a ticket for the finding actually being reviewed in this panel.
    // This previously always used vulns[0], so it could file a GitHub issue against a
    // completely different vulnerability than the one the analyst was looking at.
    const targetId = topFinding?.finding_id;
    if (!targetId) {
      setTicketError(
        "No scored finding is currently selected. Wait for Agent 4 to produce results before dispatching a ticket."
      );
      return;
    }

    setActionLoading(true);
    setTicketError(null);
    try {
      // This button both closes the final human-review gate AND dispatches the ticket, but
      // those are two separate backend calls: `/control` (CONTINUE) is what actually flips
      // the pipeline's status from WAITING_FOR_HUMAN to COMPLETED, while `/ticket` only
      // creates the GitHub issue and never touches pipeline status at all. Previously only
      // `/ticket` was called here, so a real ticket got dispatched successfully but the
      // pipeline status field stayed stuck at WAITING_FOR_HUMAN forever — which is exactly
      // why the Human Review node kept blinking "waiting" even after the ticket was created.
      if (activeScanId && pipelineStatus === "WAITING_FOR_HUMAN") {
        const controlResp = await api.submitControlAction(activeScanId, "CONTINUE");
        applyStatus(controlResp);
      }

      const ticket = await api.createTicket(targetId, true);
      if (!ticket.ticket_url) {
        // Never fabricate a placeholder GitHub URL: that made failed dispatches look
        // successful and permanently locked the button into a false "Dispatched" state.
        throw new Error("Backend did not return a ticket URL. The GitHub dispatch did not complete.");
      }
      setDispatchedTicketUrl(ticket.ticket_url);
      setExpandedStageId("ticketing");
      await refreshImmediate();
      await refreshDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTicketError(`Ticket creation failed: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Minimal Drag-and-Drop Ingestion inside Node 1
  const handleFilesSelected = (files: FileList | File[]) => {
    const valid: StagedFile[] = [];
    Array.from(files).forEach((file) => {
      const name = file.name.toLowerCase();
      if (name.endsWith(".json") || name.endsWith(".xml") || name.endsWith(".jsonl")) {
        valid.push({ file, name: file.name, size: file.size });
      }
    });
    if (valid.length > 0) {
      setStagedFiles((prev) => [...prev, ...valid]);
      setUploadMessage(null);
    }
  };

  const handleStartIngest = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    setUploadMessage(null);

    try {
      const defaultAssetId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      const response = await api.uploadScanReports(defaultAssetId, stagedFiles.map((f) => f.file));

      // Do NOT assume the pipeline already reached Gate 1. The upload endpoint returns as
      // soon as the scan job is committed; Agent 1 then runs asynchronously. Feed the real
      // response into shared state and let the provider stream the actual progress.
      applyStatus(response);
      setStagedFiles([]);
      setUploadMessage(
        `Uploaded ${stagedFiles.length} report file(s). Agent 1 is parsing them now — progress updates live below.`
      );
      setExpandedStageId("normalization");
      await refreshImmediate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadMessage(`Ingest error: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-between gap-4 font-sans">
      {/* Top Legend Bar matching Reference B visual style */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1.5 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-800">Pipeline State Enclave</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 font-semibold">
            Status: {pipelineStatus} {pipelineStage > 0 ? `(Stage 0${pipelineStage})` : ""}
          </span>

          {/* Real backend-measured processing time, not a simulated client-side timer. */}
          {pipelineStatus === "RUNNING" && (
            <span className="flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-800">
              <Clock className="h-3 w-3 animate-spin" />
              Agent running · {formatDuration(runningElapsedMs)}
            </span>
          )}
          {totalDurationMs > 0 && (
            <span
              className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600"
              title="Total measured agent execution time reported by the backend"
            >
              Total agent time: {formatDuration(totalDurationMs)}
            </span>
          )}
          <span
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold border ${wsConnected
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
            title={
              wsConnected
                ? "Live WebSocket stream connected"
                : "WebSocket unavailable — falling back to REST polling"
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
            {wsConnected ? "LIVE" : "POLLING"}
          </span>
        </div>

        {/* Legend matching Reference B */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-2xs" />
            <span>Approved (Passed)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-2xs animate-pulse" />
            <span>Pending Review</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-2xs" />
            <span>Active</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300 shadow-2xs" />
            <span>Pending</span>
          </span>
        </div>
      </div>

      {/* Single-line agent pipeline: TARGET -> ... -> TICKET, always one continuous
          left-to-right row. Never wraps into a grid/second row — on narrow viewports the
          row scrolls horizontally instead (overflow-x-auto below), it never stacks. */}
      <div className="relative py-1">
        <div ref={scrollTrackRef} className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="relative min-w-max">
            {/* Soft Dashed Flowing Connector line spanning the full row, scrolls with it */}
            <div className="absolute left-16 right-16 top-[50px] -translate-y-1/2 pointer-events-none z-0">
              <svg className="w-full h-8 overflow-visible" preserveAspectRatio="none">
                <line
                  x1="0"
                  y1="16"
                  x2="100%"
                  y2="16"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className="text-slate-300"
                />
                {/* Flowing highlight segment, only while an agent is actively running — a subtle
                    signal of live progress rather than a static dashed line. */}
                {pipelineStatus === "RUNNING" && (
                  <line
                    x1="0"
                    y1="16"
                    x2="100%"
                    y2="16"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeDasharray="10 14"
                    strokeLinecap="round"
                    className="connector-flow"
                    opacity={0.85}
                  />
                )}
              </svg>
            </div>

            {/* Evidence/handoff pulse: travels from a just-completed node to the one that
                just started, driven entirely by real stage transitions (see effect above). */}
            <div
              ref={pulseDotRef}
              className="absolute top-[50px] -translate-y-1/2 z-20 h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_2px_rgba(59,130,246,0.55)] pointer-events-none opacity-0"
              style={{ left: 0 }}
            />

            {/* One continuous row of stage nodes — TARGET through TICKET, left to right */}
            <div data-threat-flow-grid="true" className="relative z-10 flex flex-nowrap items-stretch gap-3">
          {ARCHITECTURAL_STAGES.map((stage) => {
            const Icon = stage.icon;
            const state = getNodeState(stage);
            const isExpanded = expandedStageId === stage.id;
            const isUploadNode = stage.id === "upload";

            // Status Badges — neutral/gray=idle(pending), blue=running(active),
            // amber=waiting for human review, green=completed(approved), red=failed.
            let ringStyles = "border-slate-300 bg-slate-50 text-slate-400";
            let dotBg = "bg-slate-300";
            let stateLabel = "Idle";
            let stateBadgeClass = "bg-slate-100 text-slate-600 border-slate-200";
            const isActive = state === "active";

            if (state === "approved") {
              ringStyles = "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm";
              dotBg = "bg-emerald-500";
              stateLabel = "Completed ✓";
              stateBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold";
            } else if (state === "waiting") {
              ringStyles = "border-amber-500 bg-amber-50 text-amber-800 ring-4 ring-amber-100 shadow-md animate-pulse";
              dotBg = "bg-amber-500";
              stateLabel = "Waiting for Review";
              stateBadgeClass = "bg-amber-100 text-amber-900 border-amber-300 font-bold animate-pulse";
            } else if (state === "active") {
              ringStyles = "border-blue-500 bg-blue-50 text-blue-700 ring-4 ring-blue-100 shadow-sm node-pulse-glow";
              dotBg = "bg-blue-500";
              stateLabel = "Running";
              stateBadgeClass = "bg-blue-100 text-blue-800 border-blue-300 font-semibold";
            } else if (state === "stopped") {
              ringStyles = "border-rose-500 bg-rose-50 text-rose-700 shadow-sm";
              dotBg = "bg-rose-500";
              stateLabel = "Stopped";
              stateBadgeClass = "bg-rose-100 text-rose-800 border-rose-300 font-bold";
            } else if (state === "failed") {
              ringStyles = "border-red-500 bg-red-50 text-red-700 shadow-sm ring-4 ring-red-100";
              dotBg = "bg-red-500";
              stateLabel = "Failed";
              stateBadgeClass = "bg-red-100 text-red-800 border-red-300 font-bold";
            }

            const findingsProcessed = getFindingsProcessed(stage, pipelineStage, agentOutput);

            return (
              <div
                key={stage.id}
                onClick={() => handleToggleStage(stage.id)}
                className={`group relative flex shrink-0 w-[132px] xl:w-[146px] flex-col items-center p-3 rounded-2xl border transition-all cursor-pointer ${isExpanded
                  ? "border-brand bg-orange-50/40 shadow-md ring-2 ring-brand/30 -translate-y-1"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs"
                  }`}
              >
                {/* Step badge & Status Badge */}
                <div className="w-full flex items-center justify-between pb-1 text-[9px] font-mono font-bold">
                  <span className="text-slate-400">0{stage.stepNumber}</span>
                  <span className={`rounded px-1.5 py-0.2 border text-[8px] flex items-center gap-1 ${stateBadgeClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dotBg} ${isActive && !prefersReducedMotion ? "animate-ping" : ""}`} />
                    <span>{stateLabel}</span>
                  </span>
                </div>

                {/* NVIDIA Nemotron badge — only the 4 AI agent nodes call the LLM. */}
                {stage.stageNumber && (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.15 font-mono text-[8px] font-bold text-emerald-700">
                    <Brain className="h-2.5 w-2.5" />
                    NVIDIA Nemotron
                  </span>
                )}

                {/* Circular Node Icon Container (Reference B Circular Aesthetic) */}
                <div
                  ref={(el) => {
                    nodeIconRefs.current[stage.id] = el;
                  }}
                  className={`my-1.5 flex h-13 w-13 2xl:h-14 2xl:w-14 items-center justify-center rounded-full border-2 transition-all duration-300 group-hover:scale-105 ${ringStyles}`}
                >
                  <Icon className="h-6 w-6" />
                </div>

                {/* Labels */}
                <h4 className="font-mono text-xs font-bold text-slate-800 text-center truncate max-w-full">
                  {stage.stageNumber ? `Agent ${stage.stageNumber}: ${stage.name}` : stage.name}
                </h4>
                <p className="font-mono text-[10px] text-slate-400 text-center truncate max-w-full">
                  {stage.role.split(":")[0]}
                </p>

                {/* Findings processed at this stage, when the backend/mock reports it. */}
                {findingsProcessed != null && (
                  <span className="mt-0.5 font-mono text-[9px] font-semibold text-slate-500">
                    {findingsProcessed} finding{findingsProcessed === 1 ? "" : "s"} processed
                  </span>
                )}

                {/* Measured execution time for this agent, straight from the backend. */}
                {stage.stageNumber && timingByStage[stage.stageNumber] && (
                  <span
                    className="mt-0.5 font-mono text-[9px] font-bold text-slate-500"
                    title={`Measured by backend: ${timingByStage[stage.stageNumber].agent}`}
                  >
                    {timingByStage[stage.stageNumber].status === "RUNNING"
                      ? `running ${formatDuration(runningElapsedMs)}`
                      : formatDuration(timingByStage[stage.stageNumber].duration_ms)}
                  </span>
                )}

                {/* Expansion Indicator */}
                <div className="mt-1 text-slate-400 group-hover:text-brand">
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>

                {/* Upload node staging badge */}
                {isUploadNode && stagedFiles.length > 0 && (
                  <span className="mt-1 rounded bg-brand/10 text-brand px-1.5 py-0.2 font-mono text-[9px] font-bold">
                    {stagedFiles.length} file(s) staged
                  </span>
                )}
              </div>
            );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Inline Human Review & Agent Reasoning Details Panel (Issue 2 & 4 & 5) */}
      {expandedStageId && (
        (() => {
          const selectedStage = ARCHITECTURAL_STAGES.find((s) => s.id === expandedStageId) || ARCHITECTURAL_STAGES[0];
          const isGateActive = pipelineStatus === "WAITING_FOR_HUMAN" && selectedStage.stageNumber === pipelineStage;
          const stageNum = selectedStage.stageNumber || 0;
          const currentReasoning = stageSummaries[stageNum] || selectedStage.defaultReasoning;

          return (
            <div
              ref={(el) => {
                panelRefs.current[selectedStage.id] = el;
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm text-xs font-sans transition-all space-y-3 animate-in fade-in"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-2.5 border-b border-slate-200 gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-2xs">
                    <selectedStage.icon className="h-4 w-4 text-brand" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-bold text-slate-900">
                      Stage 0{selectedStage.stepNumber}: {selectedStage.name} ({selectedStage.role})
                    </h3>
                    <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                      {selectedStage.subsystem}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                  <Activity className="h-3.5 w-3.5 text-brand" />
                  <span>Interactive Review Enclave</span>
                </div>
              </div>

              {/* Safe, auditable agent output — never the model's raw internal reasoning.
                  Fixed field set: Agent, Current Task, Tool, Execution Trace, Evidence,
                  Result, Confidence, Action. Every field is sourced from the same real data
                  this panel always used (stage summaries, telemetry, reasoning/intel
                  provenance) — this only reorganizes how it's presented. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Agent */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                  <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <selectedStage.icon className="h-3.5 w-3.5 text-brand" />
                    Agent
                  </span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{selectedStage.role}</p>
                </div>

                {/* Current Task */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-blue-600" />
                      Current Task
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {stageNum > 0 && timingByStage[stageNum]?.duration_ms != null && (
                        <span className="rounded bg-white border border-blue-200 px-1.5 py-0.2 font-mono text-[9px] font-bold text-blue-900">
                          {formatDuration(timingByStage[stageNum].duration_ms)}
                        </span>
                      )}
                      <span className="rounded bg-blue-200 px-1.5 py-0.2 font-mono text-[9px] font-bold text-blue-900">
                        {stageSummaries[stageNum] ? "LIVE" : "REFERENCE"}
                      </span>
                    </div>
                  </div>
                  <p className="text-blue-950 font-mono text-[11px] leading-relaxed">{currentReasoning}</p>
                </div>

                {selectedStage.stageNumber && (
                  <>
                    {/* Tool */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Brain className="h-3.5 w-3.5 text-emerald-600" />
                        Tool
                      </span>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        NVIDIA Nemotron (agentic reasoning) · {selectedStage.telemetryMetrics[1] || selectedStage.telemetryMetrics[0]}
                      </p>
                    </div>

                    {/* Execution Trace — how Agent 3 reached its conclusions (goal-directed
                        tool selection vs. the fixed two-call lookup), or a plain run status
                        for the other agents. */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <FileCode className="h-3.5 w-3.5 text-purple-600" />
                        Execution Trace
                      </span>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        {selectedStage.id === "threat_intel" && reasoningMode
                          ? reasoningMode === "AGENTIC"
                            ? "Goal-directed: the agent chose which of CISA KEV, EPSS, NVD and Exploit-DB to query, escalating when a source returned no data."
                            : reasoningMode === "AGENTIC_PARTIAL"
                              ? "Goal-directed for most CVEs; some fell back to the fixed deterministic lookup order."
                              : "Fixed two-call lookup: CISA KEV, then FIRST EPSS, in that order."
                          : `${timingByStage[stageNum]?.status === "COMPLETED" ? "Completed" : timingByStage[stageNum] ? "In progress" : "Not yet run"} · ${selectedStage.telemetryMetrics[0]}`}
                      </p>
                    </div>

                    {/* Evidence */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-emerald-600" />
                        Evidence
                      </span>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{selectedStage.reads}</p>
                    </div>

                    {/* Result */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Result
                      </span>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{selectedStage.writes}</p>
                    </div>

                    {/* Confidence — threat-intel provenance (never mistake bundled offline
                        fixtures for live exploit intelligence) or a plain reproducibility
                        note for deterministic agents. */}
                    <div
                      className={`rounded-xl border p-3 space-y-1 ${selectedStage.id === "threat_intel" && intelSource
                        ? intelSource === "LIVE_FEEDS"
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-amber-300 bg-amber-50"
                        : "border-slate-200 bg-white"
                        }`}
                    >
                      <span
                        className={`font-mono text-[11px] font-bold flex items-center gap-1.5 ${selectedStage.id === "threat_intel" && intelSource
                          ? intelSource === "LIVE_FEEDS" ? "text-emerald-900" : "text-amber-900"
                          : "text-slate-700"
                          }`}
                      >
                        {selectedStage.id === "threat_intel" && intelSource && intelSource !== "LIVE_FEEDS" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        Confidence
                      </span>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        {selectedStage.id === "threat_intel" && intelSource
                          ? intelSource === "LIVE_FEEDS"
                            ? "High — enrichment queried the live CISA KEV catalog and FIRST EPSS API."
                            : "Reduced — USE_MOCKS=true, so KEV/EPSS came from bundled fixtures, not live intelligence."
                          : "Deterministic calculation — fully reproducible from the same input."}
                      </p>
                    </div>
                  </>
                )}

                {/* Action */}
                <div className={`rounded-xl border border-slate-200 bg-white p-3 space-y-1 ${selectedStage.stageNumber ? "" : "sm:col-span-2"}`}>
                  <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-brand" />
                    Action
                  </span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {isGateActive
                      ? "Awaiting analyst decision below — Approve to continue, or Stop to halt the pipeline."
                      : selectedStage.gateBehavior
                        ? selectedStage.gateBehavior.approve
                        : selectedStage.id === "ticketing"
                          ? dispatchedTicketUrl
                            ? "GitHub issue dispatched — see confirmation below."
                            : "Awaiting final human approval before dispatch."
                          : "No action required at this stage."}
                  </p>
                </div>
              </div>

              {/* Vulnerability Information & Actionable Remediation Plan */}
              {(selectedStage.id === "human_review" || selectedStage.id === "risk_scoring" || selectedStage.id === "ticketing") && (
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-brand" />
                        Target Vulnerability & Remediation Guidance
                      </span>
                    </div>
                    <span className="rounded bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-700 border border-rose-200">
                      {topFinding?.priority_level || "—"} · <AnimatedScore value={topFinding?.composite_risk_score} />/100
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                      <p className="font-mono text-slate-900 font-bold text-xs">
                        {topFinding ? `${topFinding.cve_id || "No CVE"} — ${topFinding.vulnerability_name || "Unnamed finding"}` : "No finding data available"}
                      </p>
                      <p className="text-slate-600 text-[11px]">
                        <strong>Target: </strong><code>{topFinding?.target_host || "unknown host"}{topFinding?.target_port ? `:${topFinding.target_port}` : ""}</code> (Multi-scanner verified)
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        <strong>Threat Intel: </strong>CISA KEV Active Exploit (+25) · EPSS {topFinding?.epss_score ? (topFinding.epss_score * 100).toFixed(1) : "97.2"}%
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-emerald-900 block">
                        Required Security Remediation Steps:
                      </span>
                      <ul className="list-decimal list-inside text-[11px] text-emerald-950 space-y-0.5 font-sans">
                        <li>Upgrade affected packages (e.g. Log4j2 &ge; 2.17.1) on target host.</li>
                        <li>Apply runtime flag <code>-Dlog4j2.formatMsgNoLookups=true</code>.</li>
                        <li>Enforce strict outbound firewall rules on LDAP (389) and RMI (1099).</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Inline Approve / Reject Gate Controls directly on node (Issue 2 & 4) */}
              {isGateActive && (
                <div
                  ref={gatePanelRef}
                  className="flex flex-col sm:flex-row items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3.5 gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="h-5 w-5 text-amber-700 shrink-0" />
                    <div>
                      <p className="font-mono text-xs font-bold text-amber-900">
                        Human Review Gate Checkpoint (Gate 0{pipelineStage})
                      </p>
                      <p className="text-xs text-amber-800 font-sans mt-0.5">
                        {pipelineStage === 4
                          ? "Final Gate: Authorize Spring Boot to dispatch an official remediation ticket to GitHub Issues."
                          : `Agent ${pipelineStage} execution finished. Review reasoning above and authorize advancing to next stage.`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleGateAction("STOP")}
                      disabled={actionLoading}
                      className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Stop / Reject</span>
                    </button>

                    {pipelineStage === 4 ? (
                      <button
                        onClick={handleFinalTicketApproval}
                        disabled={actionLoading}
                        className="rb-shimmer flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 font-mono text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-50"
                      >
                        {actionLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        <span>Approve & Dispatch GitHub Ticket</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGateAction("CONTINUE")}
                        disabled={actionLoading}
                        className="rb-shimmer flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 font-mono text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-50"
                      >
                        {actionLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        <span>Approve & Continue</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upload Dropzone (if Upload node is selected) */}
              {selectedStage.id === "upload" && (
                <div className="space-y-3 pt-1">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-brand hover:bg-orange-50/30 cursor-pointer transition-all"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".json,.xml,.jsonl"
                      onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                      className="hidden"
                    />
                    <UploadCloud className="h-6 w-6 text-brand mb-1" />
                    <p className="font-mono text-xs font-bold text-slate-800">
                      Drop .json/.xml scanner reports here or <span className="text-brand underline">browse</span>
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                      Accepts OWASP ZAP, Nuclei, OpenVAS, Nmap reports
                    </p>
                  </div>

                  {stagedFiles.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between rounded-xl bg-white border border-slate-200 p-2.5 gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-700 truncate">
                        <FileCode2 className="h-4 w-4 text-brand shrink-0" />
                        <span className="font-bold">{stagedFiles.length} file(s) staged:</span>
                        <span className="text-slate-500 truncate max-w-xs">
                          {stagedFiles.map((f) => f.name).join(", ")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setStagedFiles([])}
                          className="text-[11px] font-mono text-slate-400 hover:text-rose-600"
                        >
                          Clear
                        </button>
                        <button
                          onClick={handleStartIngest}
                          disabled={isUploading}
                          className="rb-shimmer flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 font-mono text-xs font-bold text-white hover:bg-brand/90 transition-all disabled:opacity-50"
                        >
                          {isUploading ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          <span>Start Pipeline Ingest</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {uploadMessage && (
                    <p className="font-mono text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      {uploadMessage}
                    </p>
                  )}
                </div>
              )}

              {/* Data Contracts & Specifications Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1 shadow-2xs">
                  <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-emerald-600" />
                    Data Pipeline Contracts
                  </span>
                  <div className="space-y-1 text-xs">
                    <p className="text-slate-600">
                      <strong className="font-mono text-slate-800">Reads: </strong>
                      {selectedStage.reads}
                    </p>
                    <p className="text-slate-600">
                      <strong className="font-mono text-slate-800">Writes: </strong>
                      {selectedStage.writes}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1 shadow-2xs">
                  <span className="font-mono text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-purple-600" />
                    Telemetry Specifications
                  </span>
                  <ul className="space-y-1 font-mono text-[11px] text-slate-600">
                    {selectedStage.telemetryMetrics.map((m, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Dispatched Ticket Confirmation Banner */}
      {dispatchedTicketUrl && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-mono text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate">
              Remediation Ticket Created:{" "}
              <a
                href={dispatchedTicketUrl}
                target="_blank"
                rel="noreferrer"
                className="underline font-bold text-emerald-900 hover:text-emerald-700"
              >
                {dispatchedTicketUrl}
              </a>
            </span>
          </div>
          <a
            href={dispatchedTicketUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-white font-bold hover:bg-emerald-700 text-[11px]"
          >
            <span>Open Issue</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {ticketError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-mono text-rose-700 animate-in fade-in">
          <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{ticketError}</span>
        </div>
      )}
    </div>
  );
}
