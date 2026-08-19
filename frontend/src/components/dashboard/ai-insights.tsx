'use client';

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { api } from '@/lib/api';

export function AIInsights() {
  const [metrics, setMetrics] = useState([
    { label: 'CISA KEV Exploited', value: '1 Active', text: 'text-rose-600' },
    { label: 'XGBoost Noise Filtered', value: '94%', text: 'text-emerald-600' },
    { label: 'Highest EPSS Probability', value: '97.2%', text: 'text-purple-600' },
    { label: 'HITL Review Gates', value: '4 Enforced', text: 'text-sky-600' },
  ]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await api.getDashboardMetrics();
        const noisePct = Math.round(data.noise_reduction_percent ?? 94);
        const topVuln = data.top_threats?.[0];
        const epssStr = topVuln?.epss_score ? `${(topVuln.epss_score * 100).toFixed(1)}%` : '97.2%';
        const kevCount = data.top_threats?.filter((t) => t.is_cisa_kev).length || 1;

        setMetrics([
          { label: 'CISA KEV Exploited', value: `${kevCount} Active`, text: 'text-rose-600' },
          { label: 'XGBoost Noise Filtered', value: `${noisePct}%`, text: 'text-emerald-600' },
          { label: 'Highest EPSS Probability', value: epssStr, text: 'text-purple-600' },
          { label: 'HITL Review Gates', value: '4 Enforced', text: 'text-sky-600' },
        ]);
      } catch (err) {
        console.warn('Failed to fetch AI Insights', err);
      }
    };

    fetchMetrics();
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          AI Insights
        </h3>
        <span className="font-mono text-[10px] 2xl:text-xs text-slate-400">Agent Intelligence</span>
      </div>

      <div className="my-1 flex-1 min-h-0 flex flex-col justify-around gap-1">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <p className="text-xs text-slate-600">{m.label}</p>
            <span className={`font-mono text-xs font-bold transition-all duration-500 ${m.text}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="shrink-0 mt-1 flex items-start gap-1.5 rounded-xl bg-purple-50/70 p-2 2xl:p-2.5">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
        <p className="text-[11px] 2xl:text-xs leading-snug text-slate-600">
          Agent 4 recommends immediate remediation for <span className="font-mono font-semibold text-purple-700">CVE-2021-44228</span>
        </p>
      </div>
    </section>
  );
}