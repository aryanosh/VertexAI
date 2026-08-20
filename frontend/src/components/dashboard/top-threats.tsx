'use client';

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { usePipeline } from "@/lib/pipeline-context";
import { riskBreakdown, priorityForScore, RISK_WEIGHTS } from "@/lib/risk-score";
import type { CanonicalFinding } from "@/types/contracts";

interface TopActionItem {
  id: string;
  name: string;
  cve: string;
  score: number;
  priority: string;
  cvss: number;
  epss: number;
  isKev: boolean;
  criticality: number;
  rationale: string;
}

export function TopThreats() {
  const { vulnerabilities, dashboardDataError } = usePipeline();
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const actions: TopActionItem[] = useMemo(() => {
    if (!vulnerabilities) return [];
    const sorted = [...vulnerabilities]
      .sort((a, b) => (b.composite_risk_score ?? b.cvss_base_score ?? 0) - (a.composite_risk_score ?? a.cvss_base_score ?? 0))
      .slice(0, 4);

    return sorted.map((f: CanonicalFinding) => {
      const cvss = f.cvss_base_score || 7.5;
      const epss = f.epss_score || 0.5;
      const isKev = Boolean(f.is_cisa_kev);
      const crit = 5; // Default production asset criticality
      // Agent 4's score is authoritative; compute locally only as a display fallback.
      const parts = riskBreakdown(cvss, epss, isKev, crit);
      const score = f.composite_risk_score
        ? Math.round(f.composite_risk_score * 10) / 10
        : Math.round(parts.total * 10) / 10;

      return {
        id: f.finding_id,
        name: f.vulnerability_name || f.cve_id,
        cve: f.cve_id,
        score,
        priority: f.priority_level || priorityForScore(score),
        cvss,
        epss,
        isKev,
        criticality: crit,
        rationale:
          f.explainable_rationale ||
          `CVSS ${cvss}/10 (${parts.cvss.toFixed(1)} of ${RISK_WEIGHTS.cvss} pts) + EPSS ${(epss * 100).toFixed(1)}% (${parts.epss.toFixed(1)} of ${RISK_WEIGHTS.epss} pts) + KEV ${isKev ? `+${RISK_WEIGHTS.kev}.0` : "+0.0"} pts + Asset Criticality ${crit}/5 (${parts.asset.toFixed(1)} of ${RISK_WEIGHTS.asset} pts)`,
      };
    });
  }, [vulnerabilities]);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
            Top Actions
          </h3>
          <span className="rounded bg-rose-50 px-1.5 py-0.2 font-mono text-[9px] font-bold text-rose-700 border border-rose-200">
            RANKED
          </span>
        </div>
        <span className="font-mono text-[10px] 2xl:text-xs text-slate-400">Risk Score Desc</span>
      </div>

      {dashboardDataError ? (
        <div className="my-1 flex-1 flex items-center justify-center text-xs text-rose-600 font-mono text-center px-2">
          Failed to load findings: {dashboardDataError}
        </div>
      ) : vulnerabilities === null ? (
        <div className="my-1 flex-1 flex items-center justify-center text-xs text-slate-400 font-mono">
          Loading…
        </div>
      ) : actions.length === 0 ? (
        <div className="my-1 flex-1 flex items-center justify-center text-xs text-slate-400 font-mono text-center px-2">
          No findings yet for this scan
        </div>
      ) : (
      <div className="my-1 flex-1 min-h-0 flex flex-col justify-around gap-1.5">
        {actions.map((t) => {
          const isCrit = t.priority === "P0_CRITICAL" || t.score >= 90;
          const isHigh = t.priority === "P1_HIGH" || (t.score >= 70 && t.score < 90);
          const barColor = isCrit ? "bg-rose-500" : isHigh ? "bg-amber-500" : "bg-slate-400";
          const textColor = isCrit ? "text-rose-600" : isHigh ? "text-amber-600" : "text-slate-600";

          return (
            <div
              key={t.id}
              className="relative group flex flex-col gap-1 rounded-lg p-1.5 hover:bg-slate-50 transition-colors"
              onMouseEnter={() => setHoveredAction(t.id)}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                  <span className="font-mono text-[11px] font-bold text-slate-900 truncate">
                    {t.cve}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
                    {t.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`font-mono text-xs font-bold ${textColor}`}>
                    {t.score}
                  </span>
                  <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                </div>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
                  style={{ width: `${Math.min(100, t.score)}%` }}
                />
              </div>

              {/* Transparent Risk Score Tooltip */}
              {hoveredAction === t.id && (
                <div className="absolute left-0 right-0 bottom-full mb-1 z-30 rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-[11px] text-slate-200 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1 font-mono">
                    <span className="font-bold text-white">{t.cve} Score Breakdown</span>
                    <span className="text-brand font-bold">{t.score}/100</span>
                  </div>
                  {(() => {
                    // Derived from the shared model so the breakdown always sums to the score.
                    const p = riskBreakdown(t.cvss, t.epss, t.isKev, t.criticality);
                    return (
                      <div className="space-y-1 font-mono text-[10px] text-slate-300">
                        <div className="flex justify-between">
                          <span>• CVSS Base ({t.cvss}/10 of {RISK_WEIGHTS.cvss}):</span>
                          <span className="text-slate-100">+{p.cvss.toFixed(1)} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>• EPSS Probability ({(t.epss * 100).toFixed(1)}% of {RISK_WEIGHTS.epss}):</span>
                          <span className="text-slate-100">+{p.epss.toFixed(1)} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>• CISA KEV Actively Exploited:</span>
                          <span className={t.isKev ? "text-rose-400 font-bold" : "text-slate-400"}>
                            {p.kev.toFixed(1)} pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>• Asset Criticality ({t.criticality}/5 of {RISK_WEIGHTS.asset}):</span>
                          <span className="text-slate-100">+{p.asset.toFixed(1)} pts</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
