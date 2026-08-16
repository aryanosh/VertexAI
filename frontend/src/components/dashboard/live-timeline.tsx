import { ArrowRight } from "lucide-react"

type Tone = "rose" | "violet" | "orange" | "emerald" | "green"

type Event = {
  tag: string
  tone: Tone
  title: string
  time: string
}

const EVENTS: Event[] = [
  { tag: "Threat Detected", tone: "rose", title: "Credential stuffing via /api/auth", time: "09:23:12" },
  { tag: "AI Investigation", tone: "violet", title: "Analyzing 214 behavioral signals", time: "09:23:14" },
  { tag: "Playbook Started", tone: "orange", title: "SOC-Auto-04 initiated", time: "09:23:18" },
  { tag: "Threat Contained", tone: "emerald", title: "Traffic blocked at edge layer", time: "09:23:22" },
  { tag: "Resolved", tone: "green", title: "Incident closed · 49s response", time: "09:24:01" },
]

const TONE: Record<Tone, { dot: string; tagBg: string; tagText: string }> = {
  rose: { dot: "bg-rose-500", tagBg: "bg-rose-50", tagText: "text-rose-600" },
  violet: { dot: "bg-violet-500", tagBg: "bg-violet-50", tagText: "text-violet-600" },
  orange: { dot: "bg-orange-500", tagBg: "bg-orange-50", tagText: "text-orange-600" },
  emerald: { dot: "bg-emerald-500", tagBg: "bg-emerald-50", tagText: "text-emerald-600" },
  green: { dot: "bg-green-500", tagBg: "bg-green-50", tagText: "text-green-600" },
}

function TimelineItem({ e }: { e: Event }) {
  const t = TONE[e.tone]
  return (
    <div className="relative pb-7 pl-6">
      <span className="absolute left-0 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-white">
        <span className={`block h-full w-full rounded-full ${t.dot}`} />
      </span>
      <span
        className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${t.tagBg} ${t.tagText}`}
      >
        {e.tag}
      </span>
      <p className="mt-2 text-sm leading-snug text-slate-700">{e.title}</p>
      <p className="mt-1 font-mono text-xs text-slate-400">{e.time}</p>
    </div>
  )
}

export function LiveTimeline() {
  const loop = [...EVENTS, ...EVENTS]
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-lg font-semibold text-slate-800">
          Live Timeline
        </h2>
        <button className="flex items-center gap-1 font-mono text-xs font-medium text-brand">
          View All
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="timeline-mask relative mt-5 flex-1 overflow-hidden">
        <div className="timeline-scroll relative">
          {/* vertical rail */}
          <span className="absolute bottom-0 left-0 top-1 w-px bg-slate-200" />
          {loop.map((e, i) => (
            <TimelineItem key={i} e={e} />
          ))}
        </div>
      </div>
    </section>
  )
}
