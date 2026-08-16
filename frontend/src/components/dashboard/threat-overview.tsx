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
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 2xl:p-4 shadow-sm">
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h2 className="font-mono text-base 2xl:text-lg font-semibold text-slate-800">
            Threat Overview
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">Live AI Network</p>
        </div>
        <div className="flex items-center gap-1">
          {TOGGLES.map((t) => {
            const active = t === "Flow View"
            return (
              <button
                key={t}
                className={
                  "rounded-lg px-2.5 py-1 2xl:px-3 2xl:py-1.5 font-mono text-xs 2xl:text-sm transition-colors " +
                  (active
                    ? "border border-brand/30 bg-brand-soft font-medium text-brand"
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

      <div className="mt-1 flex flex-wrap items-center justify-center gap-4 2xl:gap-6 shrink-0">
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 2xl:gap-2">
            <span
              className="inline-block h-0.5 w-4 2xl:w-5 rounded-full"
              style={{
                backgroundColor: l.color,
                backgroundImage: l.dashed
                  ? `repeating-linear-gradient(to right, ${l.color} 0 3px, transparent 3px 6px)`
                  : undefined,
              }}
            />
            <span className="font-mono text-[10px] 2xl:text-xs text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
