import LiveTimelineStream from "@/components/LiveTimelineStream"

export function LiveTimeline() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 2xl:p-4 shadow-sm">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <h2 className="font-mono text-base 2xl:text-lg font-semibold text-slate-800">
          Live Timeline
        </h2>
        {/* A decorative "View All" button used to sit here with no onClick handler.
            Removed rather than left as a dead control that does nothing when clicked. */}
      </div>

      {/* Dynamic WebSocket Event Stream */}
      <div className="relative mt-1 flex-1 min-h-0 overflow-hidden">
        <LiveTimelineStream />
      </div>
    </section>
  )
}
