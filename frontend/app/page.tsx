"use client";
import { useEffect, useState } from "react";
import { InteractivePipelineView } from "./components/InteractivePipelineView";
import { MetricsGauge } from "./components/MetricsGauge";
import { LiveTimelineStream } from "./components/LiveTimelineStream";
import { PrioritizedVulnerabilityTable } from "./components/PrioritizedVulnerabilityTable";
import { RequireAuth } from "./components/AuthProvider";
import { MOCK_DASHBOARD } from "./mocks/data";

type ViewTab = "Flow View" | "Traffic" | "Risk Heatmap";

export default function DashboardPage() {
  const [viewTab, setViewTab] = useState<ViewTab>("Flow View");
  const [mswReady, setMswReady] = useState(false);
  const dashboard = MOCK_DASHBOARD;

  // Start MSW in dev — browser-only dynamic import
  useEffect(() => {
    if (typeof window === "undefined") { setMswReady(true); return; }
    if (process.env.NODE_ENV !== "development") { setMswReady(true); return; }
    import("./mocks/browser")
      .then(({ worker }) => worker.start({ onUnhandledRequest: "bypass" }))
      .then(() => setMswReady(true))
      .catch(() => setMswReady(true));
  }, []);

  if (!mswReady) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Initialising VertexAI…</div>
      </div>
    );
  }

  const VIEW_TABS: ViewTab[] = ["Flow View", "Traffic", "Risk Heatmap"];

  return (
    <RequireAuth>
    <div style={{ background: "var(--bg-primary)", minHeight: "100vh", paddingTop: 56 }}>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", height: "calc(100vh - 56px)", overflow: "hidden" }}>

        {/* ── LEFT PANEL ── */}
        <aside style={{ borderRight: "1px solid var(--border)", padding: "20px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Greeting card */}
          <div className="card" style={{ padding: "16px", marginBottom: 16, background: "linear-gradient(135deg, var(--bg-card-2) 0%, var(--bg-card) 100%)" }}>
            <div style={{ color: "var(--text-primary)", fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
              Good morning,<br />Alex
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
              AI analyzed 18.4M security events overnight. One production incident requires your approval.
            </div>
            <button className="btn-primary" style={{ width: "100%", textAlign: "center" }}>
              Review Incident →
            </button>
          </div>

          {/* Metrics Gauge */}
          <div className="card" style={{ padding: 16, flex: 1 }}>
            <MetricsGauge />
          </div>
        </aside>

        {/* ── CENTER PANEL ── */}
        <main style={{ display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
          {/* Threat Overview */}
          <div style={{ flex: "0 0 auto", borderBottom: "1px solid var(--border)", padding: "16px 20px" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 16 }}>Threat Overview</div>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Live HITL Pipeline</div>
              </div>
              <div className="flex gap-1">
                {VIEW_TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setViewTab(t)}
                    style={{
                      padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: viewTab === t ? 600 : 400,
                      color: viewTab === t ? "#f04e1f" : "var(--text-muted)",
                      background: viewTab === t ? "rgba(240,78,31,0.12)" : "transparent",
                      transition: "all 0.2s",
                    }}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div style={{ minHeight: 250 }}>
              {viewTab === "Flow View" && <InteractivePipelineView />}
              {viewTab === "Traffic" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13, padding: 40 }}>
                  Traffic view — available when backend connected
                </div>
              )}
              {viewTab === "Risk Heatmap" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13, padding: 40 }}>
                  Risk Heatmap — available when backend connected
                </div>
              )}
            </div>
          </div>

          {/* Bottom metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            {/* Top Threats */}
            <div className="card" style={{ padding: 14 }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>Top Threats</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>Last 24h</span>
              </div>
              <div className="flex flex-col gap-2">
                {dashboard.top_threats.map((t) => (
                  <div key={t.name}>
                    <div className="flex justify-between mb-0.5">
                      <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{t.name}</span>
                      <span style={{ color: t.color, fontSize: 11, fontWeight: 700 }}>{t.pct}%</span>
                    </div>
                    <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2 }}>
                      <div style={{ width: `${t.pct}%`, height: "100%", background: t.color, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
              <button style={{ color: "#f04e1f", fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginTop: 10, padding: 0 }}>
                View all threats →
              </button>
            </div>

            {/* Infrastructure */}
            <div className="card" style={{ padding: 14 }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>Infrastructure</span>
                <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600 }}>✓ All Healthy</span>
              </div>
              <div className="flex flex-col gap-2">
                {dashboard.infrastructure.map((i) => (
                  <div key={i.name}>
                    <div className="flex justify-between mb-0.5">
                      <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{i.name}{i.count ? ` ${i.count.toLocaleString()}` : ""}</span>
                      <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 700 }}>{i.pct}%</span>
                    </div>
                    <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2 }}>
                      <div style={{ width: `${i.pct}%`, height: "100%", background: "#22c55e", borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Insights */}
            <div className="card" style={{ padding: 14 }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>AI Insights</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>Today</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {dashboard.ai_insights.map((ins) => (
                  <div key={ins.label} className="flex justify-between">
                    <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{ins.label}</span>
                    <span style={{ color: "#06b6d4", fontSize: 12, fontWeight: 700 }}>{ins.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "8px 10px", background: "rgba(6,182,212,0.07)", borderRadius: 7, border: "1px solid rgba(6,182,212,0.15)" }}>
                <div style={{ color: "#06b6d4", fontSize: 10, lineHeight: 1.5 }}>
                  ✦ AI recommends enabling rate limiting on <span style={{ fontFamily: "monospace" }}>/api/auth</span>
                </div>
              </div>
            </div>

            {/* Automation */}
            <div className="card" style={{ padding: 14 }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>Automation</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#22c55e", fontSize: 10, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} className="animate-pulse-dot" />
                  Active
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)", marginBottom: 2 }}>{dashboard.automation.playbooks_executed}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 12 }}>Playbooks Executed</div>
              {/* Donut gauge */}
              <div className="flex items-center gap-3">
                <svg width="54" height="54" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                  <circle cx="27" cy="27" r="22" fill="none" stroke="var(--surface-3)" strokeWidth="6" />
                  <circle
                    cx="27" cy="27" r="22" fill="none"
                    stroke="#06b6d4" strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 22}`}
                    strokeDashoffset={`${2 * Math.PI * 22 * (1 - dashboard.automation.auto_resolved_pct / 100)}`}
                    strokeLinecap="round"
                    style={{ filter: "drop-shadow(0 0 4px #06b6d4)" }}
                  />
                </svg>
                <div>
                  <div style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700 }}>{dashboard.automation.auto_resolved_pct}%</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Auto Resolved</div>
                </div>
              </div>
              <button style={{ color: "#f04e1f", fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginTop: 10, padding: 0 }}>
                View automation activity →
              </button>
            </div>
          </div>

          {/* Vulnerability Table */}
          <div style={{ padding: "14px 20px" }}>
            <PrioritizedVulnerabilityTable />
          </div>
        </main>

        {/* ── RIGHT PANEL ── */}
        <aside style={{ borderLeft: "1px solid var(--border)", padding: "20px 16px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <LiveTimelineStream scanId="scan-demo-0001" />
        </aside>
      </div>
    </div>
  );
}
