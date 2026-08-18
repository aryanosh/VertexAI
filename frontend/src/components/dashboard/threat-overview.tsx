'use client';

import { ThreatFlow } from './threat-flow';
import { Play } from 'lucide-react';

interface ThreatOverviewProps {
  onOpenHITL?: () => void;
}

export function ThreatOverview({ onOpenHITL }: ThreatOverviewProps) {
  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 2xl:p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base 2xl:text-lg font-semibold text-slate-800">
              AI Multi-Agent Pipeline
            </h2>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-200">
              HITL ENFORCED
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Sequential Human-in-the-Loop Supervised Workflow · Agents 1–4
          </p>
        </div>

        {/* Quick Review / Launch Button */}
        <button
          onClick={onOpenHITL}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-1.5 font-mono text-xs font-semibold text-white shadow-sm hover:bg-brand/90 hover:shadow transition-all"
        >
          <Play className="h-3 w-3 fill-current" />
          Launch / Inspect
        </button>
      </div>

      {/* 4-Agent Pipeline Visualization */}
      <ThreatFlow onSelectNode={() => onOpenHITL?.()} />
    </section>
  );
}