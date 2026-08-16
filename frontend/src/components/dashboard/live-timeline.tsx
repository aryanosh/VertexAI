import { ArrowRight } from "lucide-react"
import LiveTimelineStream from "@/components/LiveTimelineStream"

export function LiveTimeline() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 2xl:p-4 shadow-sm">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <h2 className="font-mono text-base 2xl:text-lg font-semibold text-slate-800">
          Live Timeline
        </h2>
        <button className="flex items-center gap-1 font-mono text-xs font-medium text-brand">
          View All
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Dynamic WebSocket Event Stream */}
      <div className="relative mt-1 flex-1 min-h-0 overflow-hidden">
        <LiveTimelineStream />
      </div>
    </section>
  )
}