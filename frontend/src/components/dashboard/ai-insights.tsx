import { Zap } from "lucide-react"

const METRICS: { label: string; value: string; text: string }[] = [
  { label: "Threats detected by AI", value: "67%", text: "text-emerald-600" },
  { label: "False positives reduced", value: "63%", text: "text-emerald-600" },
  { label: "Mean time to detect", value: "18m", text: "text-sky-600" },
  { label: "Risk reduced", value: "32%", text: "text-emerald-600" },
]

export function AIInsights() {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-base font-semibold text-slate-800">
          AI Insights
        </h3>
        <span className="font-mono text-xs text-slate-400">Today</span>
      </div>

      <div className="mt-4 flex-1 space-y-4">
        {METRICS.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <p className="text-sm text-slate-600">{m.label}</p>
            <span className={`font-mono text-sm font-medium ${m.text}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50/70 p-3">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p className="text-xs leading-relaxed text-slate-600">
          AI recommends enabling rate limiting on{" "}
          <span className="font-mono text-emerald-700">/api/auth</span>
        </p>
      </div>
    </section>
  )
}
