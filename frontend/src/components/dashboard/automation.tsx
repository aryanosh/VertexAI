"use client";

import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { useCountUp } from "./use-count-up";

function Gauge({ value }: { value: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = useCountUp(value, 1600);
  const offset = c * (1 - (typeof pct === "number" ? pct : value) / 100);

  return (
    <div className="relative flex h-[68px] w-[68px] 2xl:h-[78px] 2xl:w-[78px] items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#eef0f3"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="absolute font-mono text-base 2xl:text-lg font-bold text-slate-800">
        {pct}%
      </span>
    </div>
  );
}

export function Automation() {
  const [stats, setStats] = useState({
    playbooks: 152,
    autoResolved: 94,
    avgResponseTime: "32s",
    automationCoverage: "94%",
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;

        const data = await res.json();

        if (data?.automation) {
          setStats((prev) => ({
            ...prev,
            playbooks: data.automation.playbooks ?? prev.playbooks,
            autoResolved: data.automation.autoResolved ?? prev.autoResolved,
            avgResponseTime: data.automation.avgResponseTime ?? prev.avgResponseTime,
            automationCoverage: data.automation.automationCoverage ?? prev.automationCoverage,
          }));
        }
      } catch (err) {
        console.error("Failed to fetch automation metrics", err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Pass the dynamic state into the local count-up hook
  const animatedPlaybooks = useCountUp(stats.playbooks, 1400);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          Automation
        </h3>
        <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] 2xl:text-xs text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      </div>

      <div className="my-1 flex flex-1 min-h-0 items-center justify-between gap-2">
        <div>
          <p className="font-mono text-2xl 2xl:text-3xl font-bold text-slate-900">
            {animatedPlaybooks}
          </p>
          <p className="mt-0.5 text-[11px] 2xl:text-xs text-slate-500">Playbooks Executed</p>
        </div>
        <div className="flex flex-col items-center">
          <Gauge value={stats.autoResolved} />
          <span className="mt-0.5 font-mono text-[9px] 2xl:text-[10px] text-slate-400">
            Auto Resolved
          </span>
        </div>
      </div>

      <div className="shrink-0 space-y-1 border-t border-slate-100 pt-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] 2xl:text-xs text-slate-500">Avg Response Time</span>
          <span className="font-mono text-[11px] 2xl:text-xs font-medium text-slate-700 transition-all duration-500">
            {stats.avgResponseTime}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] 2xl:text-xs text-slate-500">Automation Coverage</span>
          <span className="font-mono text-[11px] 2xl:text-xs font-medium text-slate-700 transition-all duration-500">
            {stats.automationCoverage}
          </span>
        </div>
      </div>

      <button className="shrink-0 mt-1 flex items-center gap-1 font-mono text-[11px] 2xl:text-xs font-medium text-brand hover:underline">
        View automation activity
        <ArrowRight className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
      </button>
    </section>
  );
}