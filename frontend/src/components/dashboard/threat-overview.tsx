import { ThreatFlow } from "./threat-flow"

const TOGGLES = ["Flow View", "Traffic", "Risk Heatmap"]

const LEGEND: { label: string; color: string; dashed?: boolean }[] = [
  { label: "Healthy", color: "#10b981" },
  { label: "Threat Flow", color: "#e8613c" },
  { label: "Critical", color: "#f43f5e" },
  { label: "AI Containment", color: "#10b981", dashed: true },
]

export function ThreatOverview() {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-mono text-xl font-semibold text-slate-800">
            Threat Overview
          </h2>
          <p className="mt-1 text-sm text-slate-400">Live AI Network</p>
        </div>
        <div className="flex items-center gap-1">
          {TOGGLES.map((t) => {
            const active = t === "Flow View"
            return (
              <button
                key={t}
                className={
                  "rounded-lg px-3 py-1.5 font-mono text-sm transition-colors " +
                  (active
                    ? "border border-brand/30 bg-brand-soft text-brand"
                    : "text-slate-500 hover:text-slate-700")
                }
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <ThreatFlow />

      <div className="mt-2 flex flex-wrap items-center justify-center gap-6">
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-5 rounded-full"
              style={{
                backgroundColor: l.color,
                backgroundImage: l.dashed
                  ? `repeating-linear-gradient(to right, ${l.color} 0 3px, transparent 3px 6px)`
                  : undefined,
              }}
            />
            <span className="font-mono text-xs text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
