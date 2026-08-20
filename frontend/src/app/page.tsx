'use client';

import { useState, useEffect } from "react";
import { auth } from "@/lib/api";
import { LoginScreen } from "@/components/auth/login-screen";
import { TopNav } from "@/components/dashboard/top-nav";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { ThreatOverview } from "@/components/dashboard/threat-overview";
import { LiveTimeline } from "@/components/dashboard/live-timeline";
import { TopThreats } from "@/components/dashboard/top-threats";
import { Infrastructure } from "@/components/dashboard/infrastructure";
import { AIInsights } from "@/components/dashboard/ai-insights";
import { Automation } from "@/components/dashboard/automation";
import { HITLModal } from "@/components/dashboard/hitl-modal";
import { KeyAlertsView } from "@/components/dashboard/views/key-alerts-view";
import { InsightsView } from "@/components/dashboard/views/insights-view";
import { ExecutionsView } from "@/components/dashboard/views/executions-view";

export default function Page() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<string>("Overview");
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
    <main className="flex min-h-screen w-full flex-col bg-background p-3 md:p-4 2xl:p-5 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-3 2xl:gap-4">
        <TopNav activeTab={activeTab} onSelectTab={setActiveTab} />

        <div className="grid grid-cols-1 gap-3 2xl:gap-4 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
          {/* Left column — Persistent SOC Metrics */}
          <LeftSidebar onOpenHITL={handleOpenHITL} refreshTrigger={refreshTrigger} />

          {/* Right area — Dynamic View Container */}
          <div className="flex flex-col gap-3 2xl:gap-4 min-w-0">
            {activeTab === "Overview" && (
              <>
                {/* Top row: Threat Overview (Reference B Circular Flow) + Live Timeline */}
                <div className="grid grid-cols-1 gap-3 2xl:gap-4 lg:grid-cols-[minmax(0,1fr)_310px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
                  <ThreatOverview />
                  <LiveTimeline />
                </div>

                {/* Bottom row: 4 Metric Cards */}
                <div className="grid grid-cols-1 gap-3 2xl:gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <TopThreats />
                  <Infrastructure />
                  <AIInsights />
                  <Automation />
                </div>
              </>
            )}

            {activeTab === "Key Alerts" && (
              <KeyAlertsView onOpenHITL={handleOpenHITL} />
            )}

            {activeTab === "Insights" && (
              <InsightsView />
            )}

            {activeTab === "Executions" && (
              <ExecutionsView onOpenHITL={handleOpenHITL} />
            )}
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
