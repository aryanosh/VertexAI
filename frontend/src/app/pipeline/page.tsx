'use client';

import { useState, useEffect } from "react";
import { auth } from "@/lib/api";
import { LoginScreen } from "@/components/auth/login-screen";
import { TopNav } from "@/components/dashboard/top-nav";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { ThreatOverview } from "@/components/dashboard/threat-overview";
import { LiveTimeline } from "@/components/dashboard/live-timeline";
import { DedupReportPanel } from "@/components/dashboard/dedup-report-panel";
import { HITLModal } from "@/components/dashboard/hitl-modal";
import { ShieldCheck, Play } from "lucide-react";

export default function PipelinePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isHITLOpen, setIsHITLOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    setIsAuthenticated(auth.isAuthenticated());

    const handleAuthChange = (e: Event) => {
      const custom = e as CustomEvent<{ isAuthenticated?: boolean; token?: string | null }>;
      if (custom.detail) {
        if (custom.detail.isAuthenticated !== undefined) {
          setIsAuthenticated(custom.detail.isAuthenticated);
        } else {
          setIsAuthenticated(Boolean(custom.detail.token));
        }
      }
    };

    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  const handleOpenHITL = () => setIsHITLOpen(true);
  const handleCloseHITL = () => setIsHITLOpen(false);
  const handleScanCompleted = () => setRefreshTrigger((prev) => prev + 1);

  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-background p-3 md:p-4 2xl:p-5">
      <div className="mx-auto flex h-full w-full max-w-[1720px] min-h-0 flex-col gap-2.5 2xl:gap-3.5">
        <TopNav />

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-2.5 2xl:gap-3.5 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
          <LeftSidebar onOpenHITL={handleOpenHITL} refreshTrigger={refreshTrigger} />

          <div className="flex h-full min-h-0 flex-col gap-2.5 2xl:gap-3.5 overflow-y-auto pr-1 scrollbar-thin">
            {/* Header Card */}
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h2 className="font-mono text-base font-bold text-slate-900">
                    Human-in-the-Loop Multi-Agent Pipeline
                  </h2>
                  <span className="rounded bg-sky-50 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-700 border border-sky-200">
                    GATED WORKFLOW
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Upload → Normalization → Human Gate 1 → Deduplication → Human Gate 2 → Threat Intel → Risk Scoring → Human Review → Ticketing
                </p>
              </div>

              <button
                onClick={handleOpenHITL}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 font-mono text-xs font-semibold text-white shadow-sm hover:bg-brand/90 transition-all"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Upload & Launch Pipeline
              </button>
            </div>

            {/* Visual Curved Workflow with Human Gates */}
            <div className="shrink-0">
              <ThreatOverview />
            </div>

            {/* Timeline */}
            <div className="shrink-0 min-h-[300px]">
              <LiveTimeline />
            </div>

            {/* Agent 2 per-finding dedup audit */}
            <div className="shrink-0">
              <DedupReportPanel />
            </div>
          </div>
        </div>
      </div>

      <HITLModal
        isOpen={isHITLOpen}
        onClose={handleCloseHITL}
        onScanCompleted={handleScanCompleted}
      />
    </main>
  );
}
