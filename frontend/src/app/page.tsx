import { FitToScreen } from "@/components/dashboard/fit-to-screen"
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
    <FitToScreen>
      <div className="w-[1560px] rounded-[28px] bg-background p-7">
        <TopNav />

        <div className="mt-5 grid grid-cols-[300px_minmax(0,1fr)] gap-4">
          {/* Left column */}
          <LeftSidebar />

          {/* Right area */}
          <div className="flex flex-col gap-4">
            {/* Top row: threat overview + timeline */}
            <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-4">
              <ThreatOverview />
              <LiveTimeline />
            </div>

            {/* Bottom row: four cards */}
            <div className="grid grid-cols-4 gap-4">
              <TopThreats />
              <Infrastructure />
              <AIInsights />
              <Automation />
            </div>
          </div>
        </div>
      </div>
    </FitToScreen>
  )
}
