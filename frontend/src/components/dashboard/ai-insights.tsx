"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

type Metric = {
  label: string;
  value: string;
  text: string;
};

const DEFAULT_METRICS: Metric[] = [
  { label: "Threats detected by AI", value: "67%", text: "text-emerald-600" },
  { label: "False positives reduced", value: "63%", text: "text-emerald-600" },
  { label: "Mean time to detect", value: "18m", text: "text-sky-600" },
  { label: "Risk reduced", value: "32%", text: "text-emerald-600" },
];

export function AIInsights() {
  const [metrics, setMetrics] = useState<Metric[]>(DEFAULT_METRICS);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;

        const data = await res.json();

        // Safely merge incoming API data with default styling
        if (data?.aiInsights && Array.isArray(data.aiInsights)) {
          const updated = DEFAULT_METRICS.map((defaultItem, index) => {
            const apiItem = data.aiInsights[index];
            if (apiItem) {
              return {
                ...defaultItem,
                value: apiItem.value ?? defaultItem.value,
              };
            }
            return defaultItem;
          });
          setMetrics(updated);
        }
      } catch (err) {
        console.error("Failed to fetch AI Insights", err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          AI Insights
        </h3>
        <span className="font-mono text-[10px] 2xl:text-xs text-slate-400">Today</span>
      </div>

      <div className="my-1 flex-1 min-h-0 flex flex-col justify-around gap-1">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <p className="text-xs text-slate-600">{m.label}</p>
            <span className={`font-mono text-xs font-medium transition-all duration-500 ${m.text}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="shrink-0 mt-1 flex items-start gap-1.5 rounded-xl bg-emerald-50/70 p-2 2xl:p-2.5">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <p className="text-[11px] 2xl:text-xs leading-snug text-slate-600">
          AI recommends enabling rate limiting on{" "}
          <span className="font-mono text-emerald-700">/api/auth</span>
        </p>
      </div>
    </section>
  );
}