import { Shield, Zap, ShieldAlert, Layers, ArrowRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Threat = {
  icon: LucideIcon
  name: string
  value: number
  bar: string
  text: string
}

const THREATS: Threat[] = [
  { icon: Shield, name: "Credential Stuffing", value: 91, bar: "bg-rose-500", text: "text-rose-600" },
  { icon: Zap, name: "API Abuse", value: 74, bar: "bg-amber-400", text: "text-amber-600" },
  { icon: ShieldAlert, name: "Ransomware", value: 31, bar: "bg-violet-500", text: "text-violet-600" },
  { icon: Layers, name: "Privilege Escalation", value: 22, bar: "bg-slate-400", text: "text-slate-500" },
]

export function TopThreats() {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-base font-semibold text-slate-800">
          Top Threats
        </h3>
        <span className="font-mono text-xs text-slate-400">Last 24h</span>
      </div>

      <div className="mt-4 flex-1 space-y-4">
        {THREATS.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.name} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm text-slate-700">{t.name}</p>
                  <span className={`font-mono text-sm font-medium ${t.text}`}>
                    {t.value}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`bar-grow h-full rounded-full ${t.bar}`}
                    style={{ width: `${t.value}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button className="mt-5 flex items-center gap-1 font-mono text-sm font-medium text-brand">
        View all threats
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>
  )
}
