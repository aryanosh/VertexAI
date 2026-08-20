'use client';

import { useState } from 'react';
import { ShieldCheck, GitPullRequest, Clock, CheckCircle2 } from 'lucide-react';

export function Automation() {
  const [governance] = useState({
    ticketingPolicy: 'HITL Gated',
    p0Sla: '24 Hours',
    p1Sla: '72 Hours',
    githubIntegration: 'Connected',
  });

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm font-sans">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Governance & SLAs
        </h3>
        <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600 font-bold">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          Enforced
        </span>
      </div>

      <div className="my-2 space-y-2 text-xs">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
          <span className="text-slate-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            P0 Remediation SLA
          </span>
          <span className="font-mono font-bold text-slate-800">{governance.p0Sla}</span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
          <span className="text-slate-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            P1 Remediation SLA
          </span>
          <span className="font-mono font-bold text-slate-800">{governance.p1Sla}</span>
        </div>
      </div>

      <div className="shrink-0 space-y-1.5 border-t border-slate-100 pt-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Ticketing Policy</span>
          <span className="font-mono font-bold text-emerald-600">
            {governance.ticketingPolicy}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500 flex items-center gap-1">
            <GitPullRequest className="h-3 w-3 text-slate-400" />
            GitHub API Client
          </span>
          <span className="font-mono text-slate-700 font-medium">
            GitHubTicketingService
          </span>
        </div>
      </div>
    </section>
  );
}
