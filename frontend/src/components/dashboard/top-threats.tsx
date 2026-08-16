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
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          Top Threats
        </h3>
        <span className="font-mono text-[10px] 2xl:text-xs text-slate-400">Last 24h</span>
      </div>

      <div className="my-1 flex-1 min-h-0 flex flex-col justify-around gap-1.5">
        {THREATS.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.name} className="flex items-center gap-2">
              <span className="flex h-6 w-6 2xl:h-7 2xl:w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                <Icon className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs text-slate-700">{t.name}</p>
                  <span className={`font-mono text-xs font-medium ${t.text}`}>
                    {t.value}%
                  </span>
                </div>
                <div className="mt-1 h-1 2xl:h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
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

      <button className="shrink-0 flex items-center gap-1 font-mono text-[11px] 2xl:text-xs font-medium text-brand">
        View all threats
        <ArrowRight className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
      </button>
    </section>
  )
}
