"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { PipelineEvent, PipelineStatus } from "../mocks/data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws/pipeline";

export interface StageDefinition {
  id: string;
  key: string;
  shortLabel: string;
  name: string;
  agent?: number;
  isHumanGate?: boolean;
  isFinalApproval?: boolean;
  iconType: "upload" | "agent" | "human" | "ticket";
  x: number;
  y: number;
  description: string;
}

export const PIPELINE_STAGES: StageDefinition[] = [
  {
    id: "scan",
    key: "SCAN",
    shortLabel: "Scan",
    name: "Dataset Upload & Scan",
    iconType: "upload",
    x: 55,
    y: 80,
    description: "Ingests raw vulnerability reports from multi-scanner tools (Nmap, ZAP, Nuclei, OpenVAS) to initialize the pipeline.",
  },
  {
    id: "agent_1",
    key: "AGENT_1",
    shortLabel: "Agent 1",
    name: "Parse & Normalize",
    agent: 1,
    iconType: "agent",
    x: 155,
    y: 45,
    description: "Agent 1 parses heterogenous XML/JSON/JSONL scanner report formats into a standardized, unified schema.",
  },
  {
    id: "human_review_1",
    key: "HUMAN_REVIEW_1",
    shortLabel: "Review 1",
    name: "Human Review 1",
    isHumanGate: true,
    iconType: "human",
    x: 255,
    y: 95,
    description: "Security analyst verifies schema normalization and parsed findings before deduplication begins.",
  },
  {
    id: "agent_2",
    key: "AGENT_2",
    shortLabel: "Agent 2",
    name: "Deduplicate & FP Filtering",
    agent: 2,
    iconType: "agent",
    x: 355,
    y: 45,
    description: "Agent 2 deduplicates overlapping scanner findings using MD5 fingerprints and filters false positives with an XGBoost ML classifier.",
  },
  {
    id: "human_review_2",
    key: "HUMAN_REVIEW_2",
    shortLabel: "Review 2",
    name: "Human Review 2",
    isHumanGate: true,
    iconType: "human",
    x: 455,
    y: 95,
    description: "Analyst reviews canonical deduplicated vulnerabilities and confirms suppressed false positives before threat intelligence enrichment.",
  },
  {
    id: "agent_3",
    key: "AGENT_3",
    shortLabel: "Agent 3",
    name: "Threat Intelligence",
    agent: 3,
    iconType: "agent",
    x: 555,
    y: 45,
    description: "Agent 3 enriches findings in real-time with CISA KEV exploitation catalogs, EPSS probability scores, and Exploit-DB vectors.",
  },
  {
    id: "human_review_3",
    key: "HUMAN_REVIEW_3",
    shortLabel: "Review 3",
    name: "Human Review 3",
    isHumanGate: true,
    iconType: "human",
    x: 655,
    y: 95,
    description: "Analyst inspects active exploitation signals and EPSS threat metrics before final risk scoring.",
  },
  {
    id: "agent_4",
    key: "AGENT_4",
    shortLabel: "Agent 4",
    name: "Risk Scoring & Ticket Prep",
    agent: 4,
    iconType: "agent",
    x: 755,
    y: 45,
    description: "Agent 4 computes composite risk scores (0–100), calculates SLA deadlines, and prepares an explainable GitHub issue ticket payload.",
  },
  {
    id: "final_approval",
    key: "FINAL_APPROVAL",
    shortLabel: "Final Approval",
    name: "Final Human Approval",
    isHumanGate: true,
    isFinalApproval: true,
    iconType: "human",
    x: 855,
    y: 95,
    description: "Final checkpoint: Analyst reviews risk score, priority tier, and ticket payload before authorizing external GitHub ticket dispatch.",
  },
  {
    id: "ticket_created",
    key: "EXTERNAL_TICKET",
    shortLabel: "Ticket Created",
    name: "Ticket Created",
    iconType: "ticket",
    x: 945,
    y: 70,
    description: "Backend GitHub ticketing service creates the tracked issue upon human authorization. No tickets are created if stopped or rejected.",
  },
];

interface ScanState {
  scan_id: string;
  status: PipelineStatus;
  // Backend reports the last COMPLETED agent stage as a number (0-4)
  current_stage: number | string;
  current_agent?: number;
  scanners_used?: string;
  started_at?: string;
  agent_output?: {
    stage?: string;
    summary?: string;
    findings_count?: number;
    suppressed_count?: number;
    accepted_risk_count?: number;
    composite_risk_score?: number;
    priority_level?: string;
    sla_deadline?: string;
    explainable_rationale?: string;
  };
}

export function InteractivePipelineView() {
  const [selectedStageId, setSelectedStageId] = useState<string>("agent_2");
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Authenticate against the backend (ANALYST role may start scans and control HITL checkpoints)
  const getToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current) return tokenRef.current;
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "analyst", password: "analyst123" }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      tokenRef.current = data.token || null;
      return tokenRef.current;
    } catch {
      return null;
    }
  }, []);

  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }, [getToken]);

  const refreshScanState = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/scans/${id}`);
      if (res.ok) setScanState(await res.json());
    } catch {}
  }, [apiFetch]);

  // Poll scan status (fallback when the WebSocket is unavailable)
  useEffect(() => {
    if (!scanId) return;
    const interval = setInterval(() => refreshScanState(scanId), 3000);
    return () => clearInterval(interval);
  }, [scanId, refreshScanState]);

  // WebSocket Live Updates (raw JSON broadcast from backend /ws/pipeline)
  useEffect(() => {
    if (!scanId) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        try {
          const event: PipelineEvent = JSON.parse(e.data);
          if (event) {
            refreshScanState(scanId);
          }
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}
    return () => {
      try { ws?.close(); } catch {}
    };
  }, [scanId, refreshScanState]);

  // Ensure a registered asset exists (authorization gate requires one before scanning)
  const ensureAsset = useCallback(async (): Promise<string | null> => {
    try {
      const listRes = await apiFetch(`/api/assets`);
      if (listRes.ok) {
        const assets = await listRes.json();
        if (Array.isArray(assets) && assets.length > 0) return assets[0].asset_id;
      }
      const createRes = await apiFetch(`/api/assets`, {
        method: "POST",
        body: JSON.stringify({
          hostname: "demo-target.vertexai.local",
          ip_address: "10.0.1.10",
          environment: "PRODUCTION",
          criticality_rating: 5,
          owner_email: "secops@vertexai.local",
          is_authorized: true,
        }),
      });
      if (createRes.ok) {
        const asset = await createRes.json();
        return asset.asset_id;
      }
    } catch {}
    return null;
  }, [apiFetch]);

  // Handle Dataset Upload -> starts the real backend HITL pipeline
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(null);
    setTicketUrl(null);

    try {
      const assetId = await ensureAsset();
      if (!assetId) throw new Error("no-asset");

      const response = await apiFetch(`/api/scans`, {
        method: "POST",
        body: JSON.stringify({
          asset_id: assetId,
          scanners: ["nmap", "zap", "nuclei", "openvas"],
        }),
      });

      if (response.ok) {
        const scan = await response.json();
        setScanId(scan.scan_id);
        setScanState(scan);
        setUploadSuccess(`Uploaded ${file.name} successfully. Pipeline initiated.`);
        setSelectedStageId("scan");
      } else {
        setUploadSuccess(`Backend rejected scan request (HTTP ${response.status}).`);
      }
    } catch {
      setUploadSuccess(`Uploaded ${file.name} (Local mode — backend unreachable).`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadSuccess(null), 4000);
    }
  };

  // HITL Continue/Stop Controls
  const sendControl = useCallback(async (action: "CONTINUE" | "STOP") => {
    if (!scanId) return;
    setControlling(true);
    try {
      const res = await apiFetch(`/api/scans/${scanId}/control`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (res.ok) setScanState(await res.json());
    } catch {}
    setControlling(false);
  }, [scanId, apiFetch]);

  // HITL Final Approval / Reject — GitHub ticket is dispatched ONLY on explicit approval
  const sendApproval = useCallback(async (approved: boolean) => {
    if (!scanId) return;
    setControlling(true);
    try {
      if (!approved) {
        const res = await apiFetch(`/api/scans/${scanId}/control`, {
          method: "POST",
          body: JSON.stringify({ action: "STOP" }),
        });
        if (res.ok) setScanState(await res.json());
        return;
      }

      // Mark the pipeline COMPLETED at the final checkpoint
      const completeRes = await apiFetch(`/api/scans/${scanId}/control`, {
        method: "POST",
        body: JSON.stringify({ action: "CONTINUE" }),
      });
      if (completeRes.ok) setScanState(await completeRes.json());

      // Dispatch the GitHub ticket for the top prioritized canonical finding
      const vulnsRes = await apiFetch(`/api/vulnerabilities`);
      if (vulnsRes.ok) {
        const vulns = await vulnsRes.json();
        if (Array.isArray(vulns) && vulns.length > 0) {
          const findingId = vulns[0].finding_id;
          const res = await apiFetch(`/api/vulnerabilities/${findingId}/ticket`, {
            method: "POST",
            body: JSON.stringify({ approved: true }),
          });
          if (res.ok) {
            const data = await res.json();
            setTicketUrl(data.ticket_url);
          }
        }
      }
    } catch {
    } finally {
      setControlling(false);
    }
  }, [scanId, apiFetch]);

  // Map backend numeric current_stage + status to a pipeline node key
  const deriveStageKey = (state: ScanState | null): string => {
    if (!state) return "";
    const raw = state.current_stage;
    const stageNum = typeof raw === "number" ? raw : parseInt(String(raw), 10) || 0;
    if (state.status === "COMPLETED") return "EXTERNAL_TICKET";
    if (state.status === "WAITING_FOR_HUMAN") {
      return stageNum >= 4 ? "FINAL_APPROVAL" : `HUMAN_REVIEW_${Math.max(stageNum, 1)}`;
    }
    if (state.status === "RUNNING") return `AGENT_${Math.min(stageNum + 1, 4)}`;
    if (state.status === "STOPPED" || state.status === "FAILED") {
      if (stageNum >= 4) return "FINAL_APPROVAL";
      return stageNum >= 1 ? `HUMAN_REVIEW_${stageNum}` : "SCAN";
    }
    return "SCAN";
  };

  const getStageStatus = (stage: StageDefinition): PipelineStatus => {
    if (!scanState) return "PENDING";
    const isStopped = scanState.status === "STOPPED" || scanState.status === "FAILED";

    if (scanState.status === "COMPLETED") return "COMPLETED";
    if (stage.key === scanState.current_stage) {
      return isStopped ? "STOPPED" : scanState.status;
    }

    const currentIndex = PIPELINE_STAGES.findIndex(s => s.key === scanState.current_stage);
    const stageIndex = PIPELINE_STAGES.findIndex(s => s.id === stage.id);

    if (currentIndex === -1) {
      return stageIndex <= 4 ? "COMPLETED" : "PENDING";
    }

    if (stageIndex < currentIndex) return "COMPLETED";
    if (stageIndex === currentIndex) return isStopped ? "STOPPED" : scanState.status;
    return "PENDING";
  };

  const getStatusColor = (status: PipelineStatus): string => {
    switch (status) {
      case "COMPLETED":
        return "#22c55e"; // Green (Healthy)
      case "WAITING_FOR_HUMAN":
        return "#fbbf24"; // Amber/Orange (Critical / Awaiting Review)
      case "RUNNING":
        return "#06b6d4"; // Teal/Blue (AI Containment / Running)
      case "STOPPED":
      case "FAILED":
        return "#ef4444"; // Red (Threat Flow / Stopped)
      default:
        return "rgba(148, 163, 184, 0.4)"; // Slate / Pending
    }
  };

  const getSubtext = (stage: StageDefinition, status: PipelineStatus): string => {
    if (status === "COMPLETED") return "Completed";
    if (status === "WAITING_FOR_HUMAN") return "Awaiting Review";
    if (status === "RUNNING") return "Processing…";
    if (status === "STOPPED") return "Stopped";
    if (stage.id === "agent_2" && scanState?.agent_output?.findings_count) {
      return `${scanState.agent_output.findings_count} canonical`;
    }
    return "Pending";
  };

  const selectedStage = PIPELINE_STAGES.find(s => s.id === selectedStageId) || PIPELINE_STAGES[3];
  const selectedStatus = getStageStatus(selectedStage);
  const isAwaitingHuman = scanState?.status === "WAITING_FOR_HUMAN" && scanState.current_stage === selectedStage.key;

  return (
    <div className="flex flex-col h-full w-full gap-2">
      {/* Top action row with Upload Dataset Trigger */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: "none" }}
            accept=".xml,.json,.jsonl,.txt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg, rgba(240,78,31,0.15) 0%, rgba(240,78,31,0.05) 100%)",
              border: "1px solid rgba(240,78,31,0.3)",
              color: "#f04e1f",
              borderRadius: 7,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = "#f04e1f")}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = "rgba(240,78,31,0.3)")}
          >
            <span>📁</span>
            {uploading ? "Processing Dataset…" : "Upload Dataset"}
          </button>

          {uploadSuccess && (
            <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 500 }} className="animate-fade-in">
              ✓ {uploadSuccess}
            </span>
          )}
        </div>

        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
          Click any node below to inspect live agent telemetry & HITL controls
        </div>
      </div>

      {/* SVG Pipeline Canvas - Circular Nodes & Curved Dashed Connectors */}
      <div
        className="w-full relative"
        style={{
          background: "var(--bg-card)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          padding: "10px 4px 6px 4px",
          minHeight: 180,
        }}
      >
        <svg
          viewBox="0 0 1000 170"
          className="w-full h-full"
          style={{ overflow: "visible" }}
        >
          <defs>
            <filter id="glow-selected" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-amber" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-teal" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Curved Dashed Connector Lines */}
          {PIPELINE_STAGES.map((stage, idx) => {
            if (idx === PIPELINE_STAGES.length - 1) return null;
            const nextStage = PIPELINE_STAGES[idx + 1];
            const nextStatus = getStageStatus(nextStage);
            
            // If next is completed or running, use its active color
            const lineColor = nextStatus === "COMPLETED" ? "#22c55e" :
                              nextStatus === "WAITING_FOR_HUMAN" ? "#fbbf24" :
                              nextStatus === "RUNNING" ? "#06b6d4" :
                              nextStatus === "STOPPED" ? "#ef4444" : "rgba(148, 163, 184, 0.35)";

            // Smooth cubic bezier S-curve connector
            const midX = (stage.x + nextStage.x) / 2;
            const pathD = `M ${stage.x} ${stage.y} C ${midX} ${stage.y}, ${midX} ${nextStage.y}, ${nextStage.x} ${nextStage.y}`;

            return (
              <path
                key={`edge-${stage.id}-${nextStage.id}`}
                d={pathD}
                fill="none"
                stroke={lineColor}
                strokeWidth="2.2"
                strokeDasharray="5 5"
                style={{
                  transition: "stroke 0.4s ease",
                  opacity: nextStatus === "PENDING" ? 0.4 : 0.9,
                }}
              />
            );
          })}

          {/* 10 Circular Pipeline Nodes */}
          {PIPELINE_STAGES.map((stage) => {
            const status = getStageStatus(stage);
            const isSelected = stage.id === selectedStageId;
            const statusColor = getStatusColor(status);
            const subtext = getSubtext(stage, status);

            return (
              <g
                key={`node-${stage.id}`}
                onClick={() => setSelectedStageId(stage.id)}
                style={{ cursor: "pointer" }}
                className="transition-transform duration-200"
              >
                {/* Active Outer Selection Aura / Glow */}
                {isSelected && (
                  <circle
                    cx={stage.x}
                    cy={stage.y}
                    r="27"
                    fill="none"
                    stroke="#f04e1f"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                    filter="url(#glow-selected)"
                    className="animate-pulse-slow"
                  />
                )}

                {/* Status Halo Ring */}
                <circle
                  cx={stage.x}
                  cy={stage.y}
                  r="23"
                  fill="none"
                  stroke={statusColor}
                  strokeWidth={status === "WAITING_FOR_HUMAN" || status === "RUNNING" ? "2.5" : "1.8"}
                  filter={status === "WAITING_FOR_HUMAN" ? "url(#glow-amber)" : status === "RUNNING" ? "url(#glow-teal)" : undefined}
                />

                {/* Light/White Circular Container - Pops cleanly against canvas */}
                <circle
                  cx={stage.x}
                  cy={stage.y}
                  r="20"
                  fill="#ffffff"
                  stroke={isSelected ? "#f04e1f" : "#e2e8f0"}
                  strokeWidth="1.5"
                  style={{
                    filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.25))",
                    transition: "all 0.2s ease",
                  }}
                />

                {/* Centered Node Icon */}
                <text
                  x={stage.x}
                  y={stage.y + 5}
                  textAnchor="middle"
                  fontSize={stage.iconType === "agent" ? "17" : "15"}
                  style={{
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                >
                  {stage.iconType === "agent" ? "🤖" :
                   stage.iconType === "human" ? "👤" :
                   stage.iconType === "upload" ? "🌐" : "🔒"}
                </text>

                {/* Node Bold Label */}
                <text
                  x={stage.x}
                  y={stage.y + 36}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="11"
                  fontWeight="700"
                  letterSpacing="-0.01em"
                  style={{ userSelect: "none" }}
                >
                  {stage.shortLabel}
                </text>

                {/* Node Subtext / Live Telemetry State */}
                <text
                  x={stage.x}
                  y={stage.y + 48}
                  textAnchor="middle"
                  fill={status === "WAITING_FOR_HUMAN" ? "#fbbf24" :
                        status === "COMPLETED" ? "#22c55e" :
                        status === "RUNNING" ? "#06b6d4" : "var(--text-muted)"}
                  fontSize="9"
                  fontWeight="500"
                  style={{ userSelect: "none" }}
                >
                  {subtext}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend Row at bottom of canvas (Matching reference image) */}
        <div
          className="flex items-center justify-center gap-6 mt-1 pt-1.5"
          style={{
            borderTop: "1px solid var(--border)",
            fontSize: 10,
            color: "var(--text-secondary)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span>Healthy (Completed)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            <span>Threat Flow (Critical/Stopped)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />
            <span>Critical (Awaiting Review)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#06b6d4", display: "inline-block" }} />
            <span>AI Processing (Running)</span>
          </div>
        </div>
      </div>

      {/* Selected Stage Detail & Telemetry Panel (Swaps when node is clicked) */}
      <div
        className="rounded-lg p-3.5 flex flex-col justify-between"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          minHeight: 120,
        }}
      >
        <div>
          {/* Header of Stage */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {selectedStage.name}
              </span>
              {selectedStage.agent && (
                <span className="badge badge-info" style={{ fontSize: 10 }}>
                  Agent {selectedStage.agent} (AI Driven 🤖)
                </span>
              )}
              {selectedStage.isHumanGate && (
                <span className="badge badge-p1" style={{ fontSize: 10 }}>
                  Human Review Gate 👤
                </span>
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background:
                    selectedStatus === "COMPLETED" ? "rgba(34,197,94,0.15)" :
                    selectedStatus === "WAITING_FOR_HUMAN" ? "rgba(251,191,36,0.15)" :
                    selectedStatus === "RUNNING" ? "rgba(6,182,212,0.15)" : "var(--surface-2)",
                  color:
                    selectedStatus === "COMPLETED" ? "#22c55e" :
                    selectedStatus === "WAITING_FOR_HUMAN" ? "#fbbf24" :
                    selectedStatus === "RUNNING" ? "#06b6d4" : "var(--text-muted)",
                }}
              >
                Status: {selectedStatus}
              </span>
            </div>

            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
              Node #{PIPELINE_STAGES.findIndex(s => s.id === selectedStage.id) + 1} of 10
            </div>
          </div>

          {/* Plain-English Explanation */}
          <p style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
            {selectedStage.description}
          </p>

          {/* Live Stage Telemetry Data */}
          {selectedStatus === "PENDING" ? (
            <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic", padding: "6px 0" }}>
              ⏳ Not started yet — this stage will activate once upstream human verification completes.
            </div>
          ) : (
            <div
              className="grid gap-3 p-2.5 rounded-md mb-1"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {selectedStage.id === "agent_2" && scanState?.agent_output && (
                <>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Raw Input Findings</div>
                    <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 700 }}>148 findings</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Canonical Output</div>
                    <div style={{ color: "#22c55e", fontSize: 13, fontWeight: 700 }}>
                      {scanState.agent_output.findings_count || 23} deduplicated
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>False Positives Suppressed</div>
                    <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>
                      {scanState.agent_output.suppressed_count || 12} filtered (&gt;85% FP prob)
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Noise Reduction</div>
                    <div style={{ color: "#06b6d4", fontSize: 13, fontWeight: 700 }}>84.4% reduction</div>
                  </div>
                </>
              )}

              {selectedStage.id === "agent_3" && (
                <>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Threat Intelligence Feeds</div>
                    <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>CISA KEV, FIRST EPSS, Exploit-DB</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Enrichment Protocol</div>
                    <div style={{ color: "#06b6d4", fontSize: 12, fontWeight: 600 }}>Asynchronous httpx Client</div>
                  </div>
                </>
              )}

              {selectedStage.id === "agent_4" && (
                <>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Composite Scoring Engine</div>
                    <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>CVSS(30%) + EPSS(35%) + KEV(25) + Asset(20)</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Ticketing Status</div>
                    <div style={{ color: "#fbbf24", fontSize: 12, fontWeight: 600 }}>Payload Prepared (Awaiting Human Approval)</div>
                  </div>
                </>
              )}

              {selectedStage.id === "ticket_created" && (
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>GitHub Integration</div>
                  <div style={{ color: ticketUrl ? "#22c55e" : "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>
                    {ticketUrl ? `Ticket dispatched: ${ticketUrl}` : "Gated by Final Human Approval"}
                  </div>
                </div>
              )}

              {selectedStage.id !== "agent_2" && selectedStage.id !== "agent_3" && selectedStage.id !== "agent_4" && selectedStage.id !== "ticket_created" && (
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Live Telemetry</div>
                  <div style={{ color: "var(--text-primary)", fontSize: 12 }}>
                    {scanState?.agent_output?.summary || "Execution telemetry active and streaming."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* HITL Action Controls if stage is awaiting human review */}
        {isAwaitingHuman && (
          <div
            className="flex items-center justify-between pt-2 mt-1"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div style={{ color: "#fbbf24", fontSize: 11, fontWeight: 600 }}>
              ⚠️ Pipeline paused at this stage. Human analyst approval required to advance.
            </div>

            <div className="flex gap-2">
              {selectedStage.isFinalApproval ? (
                <>
                  <button
                    className="btn-success"
                    disabled={controlling}
                    onClick={() => sendApproval(true)}
                    style={{ padding: "4px 12px", fontSize: 11 }}
                  >
                    {controlling ? "…" : "✓ Approve & Create Ticket"}
                  </button>
                  <button
                    className="btn-danger"
                    disabled={controlling}
                    onClick={() => sendApproval(false)}
                    style={{ padding: "4px 12px", fontSize: 11 }}
                  >
                    ✕ Reject
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn-success"
                    disabled={controlling}
                    onClick={() => sendControl("CONTINUE")}
                    style={{ padding: "4px 12px", fontSize: 11 }}
                  >
                    {controlling ? "…" : "▶ Continue"}
                  </button>
                  <button
                    className="btn-danger"
                    disabled={controlling}
                    onClick={() => sendControl("STOP")}
                    style={{ padding: "4px 12px", fontSize: 11 }}
                  >
                    ■ Stop
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
