import { Shield, Bell, ChevronDown } from "lucide-react"

const NAV = ["Overview", "Key Alerts", "Insights", "Executions"]

export function TopNav() {
  return (
    <header className="flex items-center justify-between px-2 py-1">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
          <Shield className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <span className="text-lg font-semibold tracking-tight text-foreground">
          VertexAI
        </span>
      </div>

      {/* Center nav */}
      <nav className="hidden items-center gap-1 md:flex">
        {NAV.map((item) => {
          const active = item === "Overview"
          return (
            <button
              key={item}
              className={
                "rounded-lg px-4 py-1.5 font-mono text-sm transition-colors " +
                (active
                  ? "bg-brand-soft text-brand"
                  : "text-slate-500 hover:text-slate-800")
              }
            >
              {item}
            </button>
          )
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm text-slate-600 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Production
          <span className="text-slate-300">·</span>
          US-East
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>

        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand" />
        </button>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-200 font-mono text-xs font-semibold text-violet-700">
          AK
        </div>
      </div>
    </header>
  )
}
