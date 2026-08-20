'use client';

import { ThreatFlow } from "./threat-flow";

export function ThreatOverview() {
  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 2xl:p-4 shadow-sm">
      {/* Header matching SentinelAI Overview */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base 2xl:text-lg font-semibold text-slate-800">
              Threat Overview
            </h2>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-200">
              LIVE AI NETWORK
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Multi-Agent Pipeline · Normalization, Deduplication, Threat Intel & HITL Approval
          </p>
        </div>

        {/* A fake "Flow View / HITL Enforced" segmented toggle used to sit here. Both
            segments were plain <span> elements with no handler and no second view to
            switch to, so they looked interactive but did nothing. Replaced with a
            single honest status label. */}
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 border border-slate-200">
          HITL Enforced
        </span>
      </div>

      {/* Visual Flow with Human In The Loop Node Circles */}
      <ThreatFlow />
    </section>
  );
}
