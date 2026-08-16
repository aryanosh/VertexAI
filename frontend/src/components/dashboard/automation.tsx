"use client"

import { ArrowRight } from "lucide-react"
import { useCountUp } from "./use-count-up"

function Gauge({ value }: { value: number }) {
  const r = 40
  const c = 2 * Math.PI * r
  const pct = useCountUp(value, 1600)
  const offset = c * (1 - (typeof pct === "number" ? pct : value) / 100)

  return (
    <div className="relative flex h-[110px] w-[110px] items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#eef0f3"
          strokeWidth="7"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute font-mono text-2xl font-bold text-slate-800">
        {pct}%
      </span>
    </div>
  )
}

export function Automation() {
  const playbooks = useCountUp(152, 1400)

  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-base font-semibold text-slate-800">
          Automation
        </h3>
        <span className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      </div>

      <div className="mt-4 flex flex-1 items-center justify-between gap-2">
        <div>
          <p className="font-mono text-4xl font-bold text-slate-900">
            {playbooks}
          </p>
          <p className="mt-1 text-sm text-slate-500">Playbooks Executed</p>
        </div>
        <div className="flex flex-col items-center">
          <Gauge value={94} />
          <span className="mt-1 font-mono text-xs text-slate-400">
            Auto Resolved
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Avg Response Time</span>
          <span className="font-mono text-xs font-medium text-slate-700">
            32s
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Automation Coverage</span>
          <span className="font-mono text-xs font-medium text-slate-700">
            94%
          </span>
        </div>
      </div>

      <button className="mt-4 flex items-center gap-1 font-mono text-sm font-medium text-brand">
        View automation activity
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>
  )
}
