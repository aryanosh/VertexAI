"use client";
import { PrioritizedVulnerabilityTable } from "../components/PrioritizedVulnerabilityTable";
import { MetricsGauge } from "../components/MetricsGauge";
import { RequireAuth } from "../components/AuthProvider";

export default function ReportsPage() {
  return (
    <RequireAuth>
      <div style={{ background: "var(--bg-primary)", minHeight: "100vh", paddingTop: 56 }}>
        <div style={{ padding: "20px 24px 8px" }}>
          <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 16 }}>Reports</div>
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Security posture, before/after noise reduction, and prioritized vulnerability findings
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, padding: "12px 24px 24px", alignItems: "start" }}>
          <aside className="card" style={{ padding: 16 }}>
            <MetricsGauge />
          </aside>
          <main className="card" style={{ padding: 16, minHeight: 400 }}>
            <PrioritizedVulnerabilityTable />
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
