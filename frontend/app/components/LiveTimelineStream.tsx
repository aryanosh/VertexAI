"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { INITIAL_PIPELINE_EVENTS, type PipelineEvent, type PipelineStatus } from "../mocks/data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const WS_URL   = "ws://localhost:8080/ws/pipeline";

const PIPELINE_STAGES = [
  { key: "SCAN",           label: "Scan",                          agent: null },
  { key: "PARSE",          label: "Parse & Normalize",             agent: 1    },
  { key: "HUMAN_REVIEW_1", label: "Human Review 1",               agent: null },
  { key: "DEDUPLICATE",    label: "Deduplicate & FP Filtering",    agent: 2    },
  { key: "HUMAN_REVIEW_2", label: "Human Review 2",               agent: null },
  { key: "THREAT_INTEL",   label: "Threat Intelligence",           agent: 3    },
  { key: "HUMAN_REVIEW_3", label: "Human Review 3",               agent: null },
  { key: "RISK_SCORING",   label: "Risk Scoring & Ticket Prep",    agent: 4    },
  { key: "FINAL_APPROVAL", label: "Final Human Approval",          agent: null },
  { key: "TICKET_ACTION",  label: "External Ticket Action",        agent: null },
];

function statusColor(status: PipelineStatus): string {
  switch (status) {
    case "RUNNING":           return "#06b6d4";
    case "WAITING_FOR_HUMAN": return "#fbbf24";
    case "COMPLETED":         return "#22c55e";
    case "STOPPED":           return "#ef4444";
    case "FAILED":            return "#ef4444";
    default:                  return "#6b7280";
  }
}

function statusClass(status: PipelineStatus): string {
  switch (status) {
    case "RUNNING":           return "stage-running";
    case "WAITING_FOR_HUMAN": return "stage-waiting";
    case "COMPLETED":         return "stage-completed";
    case "STOPPED":           return "stage-stopped";
    case "FAILED":            return "stage-failed";
    default:                  return "stage-pending";
  }
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface AgentOutput {
  stage: string;
  summary: string;
  findings_count?: number;
  suppressed_count?: number;
  accepted_risk_count?: number;
  composite_risk_score?: number;
  priority_level?: string;
  sla_deadline?: string;
  explainable_rationale?: string;
}

interface ScanState {
  scan_id: string;
  status: PipelineStatus;
  current_stage: string;
  current_agent: number;
  agent_output: AgentOutput | null;
}

export function LiveTimelineStream({ scanId }: { scanId?: string }) {
  const [events, setEvents] = useState<PipelineEvent[]>(INITIAL_PIPELINE_EVENTS);
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentScanId = scanId || "scan-demo-0001";

  // Fetch initial scan state
  useEffect(() => {
    fetch(`${API_BASE}/api/scans/${currentScanId}`)
      .then((r) => r.json())
      .then((d) => setScanState(d))
      .catch(() => {});
  }, [currentScanId]);

  // WebSocket connection
  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const event: PipelineEvent = JSON.parse(e.data);
          setEvents((prev) => [event, ...prev].slice(0, 50));
          if (listRef.current) listRef.current.scrollTop = 0;
          // Refresh scan state on new WS event
          fetch(`${API_BASE}/api/scans/${currentScanId}`)
            .then((r) => r.json())
            .then((d) => setScanState(d))
            .catch(() => {});
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}
    return () => { try { ws?.close(); } catch {} };
  }, [currentScanId]);

  const sendControl = useCallback(async (action: "CONTINUE" | "STOP") => {
    setControlling(true);
    try {
      const res = await fetch(`${API_BASE}/api/scans/${currentScanId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setScanState((prev) => prev ? { ...prev, status: data.status } : prev);
      const label = action === "CONTINUE" ? "Analyst approved. Pipeline advancing…" : "Pipeline stopped by analyst.";
      const newEvt: PipelineEvent = {
        id: `evt-ctrl-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: action === "CONTINUE" ? "RUNNING" : "STOPPED",
        stage: action === "CONTINUE" ? "Human Review" : "Stopped",
        message: label,
      };
      setEvents((prev) => [newEvt, ...prev]);
    } catch {}
    setControlling(false);
  }, [currentScanId]);

  const sendApproval = useCallback(async (approved: boolean, findingId?: string) => {
    if (!findingId) return;
    setControlling(true);
    try {
      const res = await fetch(`${API_BASE}/api/vulnerabilities/${findingId}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (approved) {
        const data = await res.json();
        setTicketUrl(data.ticket_url);
        const newEvt: PipelineEvent = {
          id: `evt-ticket-${Date.now()}`,
          timestamp: new Date().toISOString(),
          status: "COMPLETED",
          stage: "External Ticket Action",
          message: `GitHub ticket created after final approval. URL: ${data.ticket_url}`,
        };
        setEvents((prev) => [newEvt, ...prev]);
        setScanState((prev) => prev ? { ...prev, status: "COMPLETED" } : prev);
      } else {
        setScanState((prev) => prev ? { ...prev, status: "STOPPED" } : prev);
        const newEvt: PipelineEvent = {
          id: `evt-reject-${Date.now()}`,
          timestamp: new Date().toISOString(),
          status: "STOPPED",
          stage: "Final Human Approval",
          message: "Final approval rejected. No GitHub ticket created.",
        };
        setEvents((prev) => [newEvt, ...prev]);
      }
    } catch {}
    setControlling(false);
  }, []);

  const isWaiting = scanState?.status === "WAITING_FOR_HUMAN";
  const isStopped = scanState?.status === "STOPPED" || scanState?.status === "FAILED";
  const isFinalApproval = scanState?.current_stage === "FINAL_APPROVAL";
  const agentOut = scanState?.agent_output;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 14 }}>AI Investigation Playbook</span>
            {scanState && (
              <span className={`badge ${statusClass(scanState.status)}`} style={{ fontSize: 10 }}>
                {scanState.status.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>Live pipeline · ws://localhost:8080/ws/pipeline</div>
        </div>
        <button style={{ color: "#f04e1f", fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
          View All →
        </button>
      </div>

      {/* Pipeline stage ladder */}
      <div className="flex flex-col gap-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 10 }}>
        {PIPELINE_STAGES.map((stage) => {
          const completedKeys = events.filter((e) => e.status === "COMPLETED").map((e) => e.stage);
          const isActive = scanState?.current_stage === stage.key;
          const isDone = completedKeys.some((k) => k.toLowerCase().includes(stage.label.toLowerCase().split(" ")[0].toLowerCase()));
          const isStop = isStopped && isActive;
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <div style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: isStop ? "#ef4444" : isDone ? "#22c55e" : isActive ? "#fbbf24" : "#2a303c",
                boxShadow: isActive ? `0 0 6px ${isDone ? "#22c55e" : "#fbbf24"}` : "none",
              }} />
              <span style={{
                fontSize: 11,
                color: isStop ? "#ef4444" : isDone ? "#22c55e" : isActive ? "#fbbf24" : "var(--text-secondary)",
                fontWeight: isActive ? 600 : 400,
              }}>
                {stage.label}
                {stage.agent && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · Agent {stage.agent}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* HITL Controls — shown when waiting */}
      {isWaiting && agentOut && (
        <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "12px 14px" }} className="animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: "#d97706", fontSize: 12, fontWeight: 700 }}>⏸ Awaiting Human Review</span>
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text-primary)" }}>{agentOut.stage}</strong><br />
            {agentOut.summary}
          </div>
          {agentOut.findings_count != null && (
            <div className="flex gap-3 mb-8">
              <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>
                {agentOut.findings_count} canonical findings
              </span>
              {agentOut.suppressed_count != null && (
                <span style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>
                  {agentOut.suppressed_count} suppressed
                </span>
              )}
            </div>
          )}
          {/* Final Approval specific */}
          {isFinalApproval && agentOut.composite_risk_score != null && (
            <div className="flex flex-col gap-1.5 mb-3 p-3" style={{ background: "var(--bg-card-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)", fontSize: 11 }}>Composite Risk Score</span><span style={{ color: "#ef4444", fontWeight: 700 }}>{agentOut.composite_risk_score}/100</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)", fontSize: 11 }}>Priority Level</span><span style={{ color: "#f97316", fontWeight: 600 }}>{agentOut.priority_level}</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)", fontSize: 11 }}>SLA Deadline</span><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{agentOut.sla_deadline ? new Date(agentOut.sla_deadline).toLocaleDateString() : "—"}</span></div>
              {agentOut.explainable_rationale && (
                <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{agentOut.explainable_rationale}</div>
              )}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            {isFinalApproval ? (
              <>
                <button
                  className="btn-success"
                  disabled={controlling}
                  onClick={() => sendApproval(true, "a1b2c3d4-0001-0000-0000-000000000001")}
                >
                  {controlling ? "Processing…" : "✓ Approve & Create Ticket"}
                </button>
                <button
                  className="btn-danger"
                  disabled={controlling}
                  onClick={() => sendApproval(false)}
                >
                  ✕ Reject
                </button>
              </>
            ) : (
              <>
                <button className="btn-success" disabled={controlling} onClick={() => sendControl("CONTINUE")}>
                  {controlling ? "…" : "▶ Continue"}
                </button>
                <button className="btn-danger" disabled={controlling} onClick={() => sendControl("STOP")}>
                  ■ Stop
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stopped banner */}
      {isStopped && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px" }}>
          <span style={{ color: "#ef4444", fontWeight: 600, fontSize: 12 }}>■ Pipeline Stopped — No GitHub ticket created.</span>
        </div>
      )}

      {/* Ticket created confirmation — only after approval */}
      {ticketUrl && (
        <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "10px 14px" }} className="animate-fade-up">
          <div style={{ color: "#22c55e", fontWeight: 600, fontSize: 12, marginBottom: 4 }}>✓ GitHub Ticket Created</div>
          <a href={ticketUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#06b6d4", fontSize: 11, wordBreak: "break-all" }}>{ticketUrl}</a>
        </div>
      )}

      {/* Event feed */}
      <div ref={listRef} className="flex flex-col gap-2 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
        {events.map((evt) => (
          <div key={evt.id} className="animate-slide-in flex gap-2.5" style={{ paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ paddingTop: 3, flexShrink: 0 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: statusColor(evt.status),
                boxShadow: `0 0 6px ${statusColor(evt.status)}`,
              }} className={evt.status === "RUNNING" || evt.status === "WAITING_FOR_HUMAN" ? "animate-pulse-dot" : ""} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`badge ${statusClass(evt.status)}`} style={{ fontSize: 10 }}>
                  {evt.stage}
                </span>
                <span style={{ color: "#4a5368", fontSize: 10 }}>{timeAgo(evt.timestamp)}</span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>{evt.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
