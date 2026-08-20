'use client';

import { useState, useEffect } from "react";
import { auth } from "@/lib/api";
import { LoginScreen } from "@/components/auth/login-screen";
import { TopNav } from "@/components/dashboard/top-nav";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { InsightsView } from "@/components/dashboard/views/insights-view";
import { HITLModal } from "@/components/dashboard/hitl-modal";

export default function ReportsPage() {
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

          <div className="flex h-full min-h-0 flex-col gap-2.5 2xl:gap-3.5">
            <InsightsView />
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
