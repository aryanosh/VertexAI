'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useCountUp } from './use-count-up';

function Gauge({ value }: { value: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = useCountUp(value, 1600);
  const offset = c * (1 - (typeof pct === 'number' ? pct : value) / 100);

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
    rawFindings: 2500,
    noiseReductionPct: 94,
    avgResponseTime: '24h SLA',
    githubTicketing: 'HITL Gated',
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await api.getDashboardMetrics();
        const noise = Math.round(data.noise_reduction_percent ?? 94);
        setStats((prev) => ({
          ...prev,
          noiseReductionPct: noise,
        }));
      } catch (err) {
        console.warn('Failed to fetch automation stats', err);
      }
    };

    fetchMetrics();
  }, []);

  const animatedFindings = useCountUp(stats.rawFindings, 1400);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          Noise Filter
        </h3>
        <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] 2xl:text-xs text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          XGBoost
        </span>
      </div>

      <div className="my-1 flex flex-1 min-h-0 items-center justify-between gap-2">
        <div>
          <p className="font-mono text-2xl 2xl:text-3xl font-bold text-slate-900">
            {animatedFindings}
          </p>
          <p className="mt-0.5 text-[11px] 2xl:text-xs text-slate-500">Raw Findings Ingested</p>
        </div>
        <div className="flex flex-col items-center">
          <Gauge value={stats.noiseReductionPct} />
          <span className="mt-0.5 font-mono text-[9px] 2xl:text-[10px] text-slate-400">
            Noise Reduction
          </span>
        </div>
      </div>

      <div className="shrink-0 space-y-1 border-t border-slate-100 pt-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] 2xl:text-xs text-slate-500">Ticketing Policy</span>
          <span className="font-mono text-[11px] 2xl:text-xs font-semibold text-emerald-600">
            {stats.githubTicketing}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] 2xl:text-xs text-slate-500">P0 Remediation SLA</span>
          <span className="font-mono text-[11px] 2xl:text-xs font-medium text-slate-700">
            {stats.avgResponseTime}
          </span>
        </div>
      </div>
    </section>
  );
}