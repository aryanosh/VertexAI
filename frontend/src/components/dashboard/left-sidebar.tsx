'use client';

import { Activity, ShieldCheck } from 'lucide-react';
import { usePipeline } from '@/lib/pipeline-context';
import { useCountUp } from './use-count-up';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] 2xl:text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
      {children}
    </p>
  );
}

interface LeftSidebarProps {
  onOpenHITL?: () => void;
  refreshTrigger?: number;
}

export function LeftSidebar({ refreshTrigger: _refreshTrigger }: LeftSidebarProps) {
  // Reads from the same scan-scoped dashboardMetrics as every other widget instead of
  // independently polling `/api/dashboard` with no scan_id and falling back to hardcoded
  // non-zero numbers — that combination is why this panel used to show fake data before
  // any scan had run. `null` (no active scan yet) now renders as an explicit 0/empty state.
  const { dashboardMetrics: data } = usePipeline();
  const metrics = {
    securityScore: Math.round(data?.security_score ?? 0),
    totalFindings: data?.total_findings ?? 0,
    activeFindings: data?.active_findings ?? 0,
    suppressedFindings: data?.suppressed_findings ?? 0,
    noiseReduction: Math.round((data?.noise_reduction_percent ?? 0) * 10) / 10,
  };

  const score = useCountUp(metrics.securityScore, 1400);
  const incidents = useCountUp(metrics.activeFindings, 900);
  const noiseRed = useCountUp(Math.round(metrics.noiseReduction), 1300);

  // These badges used to be hardcoded "P0 · 1" / "P1 · 1" regardless of any real data.
  // Derive real counts from the current scan's top threats instead.
  const p0Count = data?.top_threats?.filter((t) => t.priority_level === 'P0_CRITICAL').length ?? 0;
  const p1Count = data?.top_threats?.filter((t) => t.priority_level === 'P1_HIGH').length ?? 0;

  return (
    <aside className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm font-sans">
      {/* Greeting & SOC Operational Enclave Status (Issue 1 & 4) */}
      <div className="bg-gradient-to-br from-[#fdefe7] via-white to-white p-4 2xl:p-5">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-xl 2xl:text-2xl font-bold leading-tight tracking-tight text-slate-900">
            Good morning,
            <br />
            Alex
          </h1>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-200">
            SOC ONLINE
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500 font-sans">
          Supervised AI enclave active. Review and authorize multi-agent pipeline stages directly in the Threat Overview.
        </p>
      </div>

      {/* Consolidated Risk & Noise Efficiency Summary (Issue 4) */}
      <div className="border-t border-slate-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Risk & Efficiency Summary</SectionLabel>
          <Activity className="h-3.5 w-3.5 text-slate-400" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5">
            <span className="text-[11px] font-medium text-slate-500 block">Security Score</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-slate-900">{score}</span>
              <span className="font-mono text-xs text-slate-400">/100</span>
            </div>
            <span className="mt-1 inline-block rounded bg-emerald-50 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-600">
              {metrics.securityScore >= 80 ? "Healthy" : "Attention"}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5">
            <span className="text-[11px] font-medium text-slate-500 block">Noise Reduction</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-emerald-600">{noiseRed}%</span>
            </div>
            <span className="mt-1 inline-block text-[9px] font-mono text-slate-500">
              {metrics.suppressedFindings} suppressed
            </span>
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(100, metrics.securityScore)}%` }}
          />
        </div>
      </div>

      {/* Active Canonical Findings (Issue 4) */}
      <div className="border-t border-slate-100 p-4 space-y-2">
        <SectionLabel>Active Canonical Findings</SectionLabel>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl 2xl:text-3xl font-bold text-brand">
              {incidents}
            </span>
            <span className="text-xs text-slate-500">Unsuppressed</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-600 font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              P0 · {p0Count}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 font-mono text-[10px] text-orange-600 font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              P1 · {p1Count}
            </span>
          </div>
        </div>
      </div>

      {/* Governance & HITL Status (Issue 4) */}
      <div className="border-t border-slate-100 p-4 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-semibold text-slate-700 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            HITL Enclave
          </span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-800">
            ACTIVE
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 leading-snug">
          Zero uncontrolled autonomy. Stage progression requires explicit human authorization.
        </p>
      </div>
    </aside>
  );
}
