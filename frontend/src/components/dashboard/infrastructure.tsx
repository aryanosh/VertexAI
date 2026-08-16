import { Cloud, Monitor, Server, Database, CircleCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Item = {
  icon: LucideIcon
  name: string
  count?: string
  value: number
  bar: string
  text: string
}

const ITEMS: Item[] = [
  { icon: Cloud, name: "Cloud Services", value: 99, bar: "bg-emerald-500", text: "text-emerald-600" },
  { icon: Monitor, name: "Endpoints", count: "4,692", value: 97, bar: "bg-emerald-500", text: "text-emerald-600" },
  { icon: Server, name: "Servers", count: "128", value: 99, bar: "bg-emerald-500", text: "text-emerald-600" },
  { icon: Database, name: "Databases", count: "56", value: 97, bar: "bg-amber-400", text: "text-amber-600" },
]

export function Infrastructure() {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-base font-semibold text-slate-800">
          Infrastructure
        </h3>
        <span className="flex items-center gap-1 font-mono text-xs text-emerald-600">
          <CircleCheck className="h-3.5 w-3.5" />
          All Healthy
        </span>
      </div>

      <div className="mt-4 flex-1 space-y-4">
        {ITEMS.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.name} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm text-slate-700">
                    {t.name}
                    {t.count && (
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {t.count}
                      </span>
                    )}
                  </p>
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

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="font-mono text-sm font-medium text-slate-600">
          Overall Uptime
        </span>
        <span className="font-mono text-sm font-bold text-emerald-600">
          99.6%
        </span>
      </div>
    </section>
  )
}
