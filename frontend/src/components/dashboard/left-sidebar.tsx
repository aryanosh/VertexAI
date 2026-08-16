"use client"

import { Activity, ArrowRight, TrendingUp } from "lucide-react"
import { useCountUp } from "./use-count-up"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
      {children}
    </p>
  )
}

export function LeftSidebar() {
  const score = useCountUp(96, 1400)
  const incidents = useCountUp(2, 900)
  const autoRes = useCountUp(94, 1300)
  const confidence = useCountUp(94, 1500)

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Greeting */}
      <div className="bg-gradient-to-br from-[#fdefe7] via-white to-white p-6">
        <h1 className="font-mono text-3xl font-bold leading-tight tracking-tight text-slate-900">
          Good morning,
          <br />
          Alex
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          AI analyzed 18.4M security events overnight. One production incident
          requires your approval.
        </p>
        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-mono text-sm font-medium text-brand-foreground shadow-sm transition-transform hover:-translate-y-0.5">
          Review Incident
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Security score */}
      <div className="border-t border-slate-100 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-base font-semibold text-slate-800">
            Security Score
          </h2>
          <Activity className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="font-mono text-5xl font-bold text-slate-900">
            {score}
          </span>
          <span className="font-mono text-lg text-slate-400">/100</span>
        </div>
        <span className="mt-3 inline-block rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-medium text-emerald-600">
          Excellent
        </span>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="bar-grow h-full rounded-full bg-emerald-500"
            style={{ width: "96%" }}
          />
        </div>
        <p className="mt-3 flex items-center gap-1.5 font-mono text-xs text-slate-500">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          +2 pts vs yesterday
        </p>
      </div>

      {/* Open incidents */}
      <div className="border-t border-slate-100 p-6">
        <SectionLabel>Open Incidents</SectionLabel>
        <div className="mt-3 flex items-end gap-2">
          <span className="font-mono text-4xl font-bold text-brand">
            {incidents}
          </span>
          <span className="pb-1 text-sm text-slate-500">Require attention</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 font-mono text-xs text-rose-600">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            High · 1
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 px-2 py-1 font-mono text-xs text-orange-600">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            Medium · 1
          </span>
        </div>
      </div>

      {/* Auto resolution */}
      <div className="border-t border-slate-100 p-6">
        <SectionLabel>Auto Resolution</SectionLabel>
        <div className="mt-2 flex items-baseline">
          <span className="font-mono text-4xl font-bold text-slate-900">
            {autoRes}
          </span>
          <span className="font-mono text-xl font-bold text-slate-400">%</span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-slate-500">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-emerald-600">↑ 3%</span> vs yesterday
        </p>
      </div>

      {/* AI confidence */}
      <div className="border-t border-slate-100 p-6">
        <SectionLabel>AI Confidence</SectionLabel>
        <div className="mt-2 flex items-baseline">
          <span className="font-mono text-4xl font-bold text-slate-900">
            {confidence}
          </span>
          <span className="font-mono text-xl font-bold text-slate-400">%</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">AI model confidence high</p>
      </div>
    </aside>
  )
}
