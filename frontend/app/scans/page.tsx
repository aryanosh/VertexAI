"use client";
import { InteractivePipelineView } from "../components/InteractivePipelineView";
import { LiveTimelineStream } from "../components/LiveTimelineStream";
import { RequireAuth } from "../components/AuthProvider";

export default function ScansPage() {
  return (
    <RequireAuth>
      <div style={{ background: "var(--bg-primary)", minHeight: "100vh", paddingTop: 56 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", height: "calc(100vh - 56px)", overflow: "hidden" }}>
          <main style={{ padding: "16px 20px", overflowY: "auto" }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 16 }}>Scans</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                Start vulnerability scans and control the Human-in-the-Loop pipeline
              </div>
            </div>
            <InteractivePipelineView />
          </main>
          <aside style={{ borderLeft: "1px solid var(--border)", padding: "20px 16px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <LiveTimelineStream scanId="scan-demo-0001" />
          </aside>
        </div>
      </div>
    </RequireAuth>
  );
}
