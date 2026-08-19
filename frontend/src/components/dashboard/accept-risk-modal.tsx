'use client';

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { api, auth } from '@/lib/api';
import type { CanonicalFinding } from '@/types/contracts';

interface AcceptRiskModalProps {
  finding: CanonicalFinding | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (findingId: string) => void;
}

export function AcceptRiskModal({
  finding,
  isOpen,
  onClose,
  onSuccess,
}: AcceptRiskModalProps) {
  const [reason, setReason] = useState(
    'Compensating security control deployed (WAF virtual patch + network isolation). Scheduled for remediation in next maintenance cycle.'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !finding) return null;

  const currentRole = auth.getRole();
  const isAdmin = currentRole.toUpperCase() === 'ADMIN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A written business justification is required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.acceptRisk(finding.finding_id, reason.trim());
      setSuccess(true);
      onSuccess?.(finding.finding_id);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403') || !isAdmin) {
        setError(
          `Permission Denied (403): Business Risk Acceptance requires the ADMIN role. Your current role is ${currentRole}. Please switch to Admin in TopNav.`
        );
      } else {
        setError(`Failed to accept risk: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-amber-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-mono text-base font-bold text-slate-900">
                Accept Business Risk
              </h2>
              <p className="text-xs text-amber-800">
                Officially document accepted residual security risk (Admin Gate)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {/* Target Finding Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-slate-800">
                {finding.cve_id}
              </span>
              <span className="font-mono text-[10px] rounded bg-rose-100 text-rose-800 px-1.5 py-0.5 font-semibold">
                Score: {Math.round(finding.composite_risk_score || 85)} / 100
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium truncate">
              {finding.vulnerability_name}
            </p>
            <p className="text-[11px] font-mono text-slate-400">
              Target: {finding.target_host}:{finding.target_port}
            </p>
          </div>

          {/* Admin Role Check Banner */}
          {!isAdmin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-800">
              <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Admin Role Recommended</strong>: Backend endpoint{' '}
                <code>/api/vulnerabilities/*/accept-risk</code> enforces Spring Security{' '}
                <code>hasRole(&apos;ADMIN&apos;)</code>. Current session: <strong>{currentRole}</strong>.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Vulnerability successfully marked as accepted business risk.</span>
            </div>
          )}

          {/* Written Justification Text Area */}
          <div>
            <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Written Business Justification & Mitigation Rationale *
            </label>
            <textarea
              required
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Detail compensating controls, temporary mitigations, or business reasons for risk acceptance..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-xs text-slate-800 focus:bg-white focus:outline-brand leading-relaxed"
            />
            <p className="mt-1 text-[10px] text-slate-400 font-mono">
              Justification is permanently logged with the finding record in the database.
            </p>
          </div>

          {/* Policy Checklist */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="policy1" defaultChecked required className="rounded text-brand" />
              <label htmlFor="policy1" className="cursor-pointer text-[11px]">
                I verify that compensating security controls are in place.
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="policy2" defaultChecked required className="rounded text-brand" />
              <label htmlFor="policy2" className="cursor-pointer text-[11px]">
                I acknowledge this will suppress active SLA breach alerts.
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 font-mono text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2 font-mono text-xs font-bold text-white shadow-md hover:bg-amber-700 transition-all disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Confirm Risk Acceptance
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
