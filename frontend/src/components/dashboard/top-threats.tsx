'use client';

import { useState, useEffect } from 'react';
import { Shield, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { CanonicalFinding } from '@/types/contracts';

interface ThreatItem {
  name: string;
  cve: string;
  value: number;
  priority: string;
  bar: string;
  text: string;
}

interface TopThreatsProps {
  onOpenHITL?: () => void;
  refreshTrigger?: number;
}

const DEFAULT_THREATS: ThreatItem[] = [
  { name: 'Apache Log4Shell RCE', cve: 'CVE-2021-44228', value: 95, priority: 'P0_CRITICAL', bar: 'bg-rose-500', text: 'text-rose-600' },
  { name: 'HTTP/2 Rapid Reset DDOS', cve: 'CVE-2023-44487', value: 77, priority: 'P1_HIGH', bar: 'bg-amber-400', text: 'text-amber-600' },
  { name: 'VMware vCenter RCE', cve: 'CVE-2021-21985', value: 88, priority: 'P0_CRITICAL', bar: 'bg-rose-500', text: 'text-rose-600' },
  { name: 'Spring4Shell RCE', cve: 'CVE-2022-22965', value: 52, priority: 'P2_MEDIUM', bar: 'bg-slate-400', text: 'text-slate-500' },
];

export function TopThreats({ onOpenHITL, refreshTrigger }: TopThreatsProps) {
  const [threats, setThreats] = useState<ThreatItem[]>(DEFAULT_THREATS);

  useEffect(() => {
    const fetchTopThreats = async () => {
      try {
        const data = await api.getDashboardMetrics();
        if (data.top_threats && data.top_threats.length > 0) {
          const mapped: ThreatItem[] = data.top_threats.slice(0, 4).map((f: CanonicalFinding) => {
            const score = Math.round(f.composite_risk_score || 50);
            const isCrit = f.priority_level === 'P0_CRITICAL' || score >= 80;
            const isHigh = f.priority_level === 'P1_HIGH' || (score >= 60 && score < 80);

            return {
              name: f.vulnerability_name || f.cve_id,
              cve: f.cve_id,
              value: score,
              priority: f.priority_level,
              bar: isCrit ? 'bg-rose-500' : isHigh ? 'bg-amber-400' : 'bg-slate-400',
              text: isCrit ? 'text-rose-600' : isHigh ? 'text-amber-600' : 'text-slate-500',
            };
          });
          setThreats(mapped);
        }
      } catch (err) {
        console.warn('Failed to fetch top threats from live API', err);
      }
    };

    fetchTopThreats();
  }, [refreshTrigger]);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          Top Threats
        </h3>
        <span className="font-mono text-[10px] 2xl:text-xs text-slate-400">Composite Score</span>
      </div>

      <div className="my-1 flex-1 min-h-0 flex flex-col justify-around gap-1.5">
        {threats.map((t, idx) => (
          <div
            key={t.name + idx}
            onClick={onOpenHITL}
            className="group flex cursor-pointer items-center gap-2 rounded-lg p-1 -mx-1 hover:bg-slate-50 transition-colors"
          >
            <span className="flex h-6 w-6 2xl:h-7 2xl:w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-brand-soft group-hover:text-brand">
              <Shield className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-xs text-slate-700 font-medium group-hover:text-brand transition-colors">
                  {t.name}
                </p>
                <span className={`font-mono text-xs font-bold ${t.text}`}>
                  {t.value}
                </span>
              </div>
              <div className="mt-1 h-1 2xl:h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`bar-grow h-full rounded-full ${t.bar} transition-all duration-1000 ease-out`}
                  style={{ width: `${Math.min(100, t.value)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onOpenHITL}
        className="shrink-0 flex items-center gap-1 font-mono text-[11px] 2xl:text-xs font-medium text-brand hover:underline"
      >
        Inspect all canonical findings
        <ArrowRight className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
      </button>
    </section>
  );
}