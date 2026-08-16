import { Shield, Bell, ChevronDown } from "lucide-react"

const NAV = ["Overview", "Key Alerts", "Insights", "Executions"]

export function TopNav() {
  return (
    <header className="shrink-0 flex items-center justify-between px-2 py-0.5 2xl:py-1">
      {/* Brand */}
      <div className="flex items-center gap-2.5 2xl:gap-3">
        <div className="flex h-8 w-8 2xl:h-9 2xl:w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
          <Shield className="h-4.5 w-4.5 2xl:h-5 2xl:w-5" strokeWidth={2.25} />
        </div>
        <span className="text-base 2xl:text-lg font-semibold tracking-tight text-foreground">
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
                "rounded-lg px-3 2xl:px-4 py-1 2xl:py-1.5 font-mono text-xs 2xl:text-sm transition-colors " +
                (active
                  ? "border border-brand/30 bg-brand-soft font-medium text-brand"
                  : "text-slate-500 hover:text-slate-800")
              }
            >
              {item}
            </button>
          )
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-2.5 2xl:gap-3">
        <button className="flex items-center gap-1.5 2xl:gap-2 rounded-lg border border-slate-200 bg-white px-2.5 2xl:px-3 py-1 2xl:py-1.5 font-mono text-xs 2xl:text-sm text-slate-600 shadow-sm">
          <span className="h-1.5 w-1.5 2xl:h-2 2xl:w-2 rounded-full bg-emerald-500" />
          Production
          <span className="text-slate-300">·</span>
          US-East
          <ChevronDown className="h-3 w-3 2xl:h-3.5 2xl:w-3.5 text-slate-400" />
        </button>

        <button
          className="relative flex h-8 w-8 2xl:h-9 2xl:w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 2xl:h-4.5 2xl:w-4.5" />
          <span className="absolute right-1.5 top-1.5 2xl:right-2 2xl:top-2 h-1.5 w-1.5 rounded-full bg-brand" />
        </button>

        <div className="flex h-8 w-8 2xl:h-9 2xl:w-9 items-center justify-center rounded-full bg-violet-200 font-mono text-xs font-semibold text-violet-700">
          AK
        </div>
      </div>
    </header>
  )
}
