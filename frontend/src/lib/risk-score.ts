/**
 * Composite risk score model — single source of truth for the frontend.
 *
 * These weights mirror `agents_service/agent4_scoring.py` exactly (W_CVSS/W_EPSS/W_KEV/
 * W_ASSET/W_EXPLOIT, agent4_scoring.py:75-79). Agent 4 is authoritative: prefer the
 * backend's `composite_risk_score` whenever it is present and only fall back to this local
 * computation for display when the backend has not scored a finding yet.
 */

/** Maximum point contribution of each dimension, out of 100. */
export const RISK_WEIGHTS = {
  cvss: 30,
  epss: 25,
  kev: 20,
  asset: 15,
  exploit: 10,
} as const;

export const CVSS_MAX = 10;
export const CRITICALITY_MAX = 5;

export interface RiskBreakdown {
  cvss: number;
  epss: number;
  kev: number;
  asset: number;
  exploit: number;
  total: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(n, 1));

/** Per-dimension point contributions for a finding. */
export function riskBreakdown(
  cvss: number,
  epss: number,
  isKev: boolean,
  criticality: number,
  exploitAvailable: boolean = false
): RiskBreakdown {
  const parts = {
    cvss: clamp01((cvss || 0) / CVSS_MAX) * RISK_WEIGHTS.cvss,
    epss: clamp01(epss || 0) * RISK_WEIGHTS.epss,
    kev: isKev ? RISK_WEIGHTS.kev : 0,
    asset: clamp01((criticality || 0) / CRITICALITY_MAX) * RISK_WEIGHTS.asset,
    exploit: exploitAvailable ? RISK_WEIGHTS.exploit : 0,
  };
  return {
    ...parts,
    total: Math.min(parts.cvss + parts.epss + parts.kev + parts.asset + parts.exploit, 100),
  };
}

/** Composite score rounded to one decimal place. */
export function compositeRiskScore(
  cvss: number,
  epss: number,
  isKev: boolean,
  criticality: number,
  exploitAvailable: boolean = false
): number {
  return Math.round(riskBreakdown(cvss, epss, isKev, criticality, exploitAvailable).total * 10) / 10;
}

/** Priority band matching Agent 4's thresholds (agent4_scoring.py:113-122). */
export function priorityForScore(score: number): string {
  if (score >= 90) return 'P0_CRITICAL';
  if (score >= 70) return 'P1_HIGH';
  if (score >= 40) return 'P2_MEDIUM';
  return 'P3_LOW';
}

/** Human-readable formula, for display next to a score breakdown. */
export const RISK_FORMULA_LABEL =
  '(CVSS/10 × 30) + (EPSS × 25) + KEV(+20) + (Criticality/5 × 15) + Exploit Availability(+10), capped at 100';
