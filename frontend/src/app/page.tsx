import { TopNav } from "@/components/dashboard/top-nav"
import { LeftSidebar } from "@/components/dashboard/left-sidebar"
import { ThreatOverview } from "@/components/dashboard/threat-overview"
import { LiveTimeline } from "@/components/dashboard/live-timeline"
import { TopThreats } from "@/components/dashboard/top-threats"
import { Infrastructure } from "@/components/dashboard/infrastructure"
import { AIInsights } from "@/components/dashboard/ai-insights"
import { Automation } from "@/components/dashboard/automation"

export default function Page() {
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-background p-3 md:p-4 2xl:p-5">
      <div className="mx-auto flex h-full w-full max-w-[1720px] min-h-0 flex-col gap-2.5 2xl:gap-3.5">
        <TopNav />

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-2.5 2xl:gap-3.5 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
          {/* Left column */}
          <LeftSidebar />

          {/* Right area */}
          <div className="flex h-full min-h-0 flex-col gap-2.5 2xl:gap-3.5">
            {/* Top row: threat overview + timeline */}
            <div className="grid flex-[1.4] 2xl:flex-[1.5] min-h-0 grid-cols-1 gap-2.5 2xl:gap-3.5 lg:grid-cols-[minmax(0,1fr)_310px] 2xl:grid-cols-[minmax(0,1fr)_330px]">
              <ThreatOverview />
              <LiveTimeline />
            </div>

            {/* Bottom row: four cards */}
            <div className="grid flex-1 min-h-0 grid-cols-1 gap-2.5 2xl:gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <TopThreats />
              <Infrastructure />
              <AIInsights />
              <Automation />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}


