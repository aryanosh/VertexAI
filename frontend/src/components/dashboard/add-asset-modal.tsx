'use client';

import React, { useState } from 'react';
import {
  X,
  Server,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Globe2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Asset, CreateAssetRequest } from '@/types/contracts';

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetCreated?: (asset: Asset) => void;
}

export function AddAssetModal({
  isOpen,
  onClose,
  onAssetCreated,
}: AddAssetModalProps) {
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('10.0.1.');
  const [environment, setEnvironment] = useState<'PRODUCTION' | 'STAGING' | 'DEV'>('PRODUCTION');
  const [criticalityRating, setCriticalityRating] = useState<number>(5);
  const [ownerEmail, setOwnerEmail] = useState('secops@vertexai.local');
  const [isAuthorized, setIsAuthorized] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim() || !ownerEmail.trim()) {
      setError('Hostname and Owner Email are required.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: CreateAssetRequest = {
      hostname: hostname.trim(),
      ipAddress: ipAddress.trim() || undefined,
      environment,
      criticalityRating,
      ownerEmail: ownerEmail.trim(),
      isAuthorized,
    };

    try {
      const created = await api.createAsset(payload);
      setSuccess(true);
      onAssetCreated?.(created);
      setTimeout(() => {
        setSuccess(false);
        setHostname('');
        onClose();
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to register asset: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-mono text-base font-bold text-slate-900">
                Register Target Asset
              </h2>
              <p className="text-xs text-slate-500">
                Add monitored host to authorized infrastructure catalog
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Target asset successfully registered in database!</span>
            </div>
          )}

          {/* Hostname */}
          <div>
            <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Hostname / FQDN *
            </label>
            <div className="relative">
              <Globe2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                required
                placeholder="e.g. prod-payment-gateway-01.internal"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-brand"
              />
            </div>
          </div>

          {/* IP & Environment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                IP Address
              </label>
              <input
                type="text"
                placeholder="e.g. 10.0.1.25"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 focus:bg-white focus:outline-brand"
              />
            </div>

            <div>
              <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Environment
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as 'PRODUCTION' | 'STAGING' | 'DEV')}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 focus:bg-white focus:outline-brand"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEV">DEVELOPMENT</option>
              </select>
            </div>
          </div>

          {/* Criticality Rating */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-700">
                Asset Criticality Rating (1–5)
              </label>
              <span className="font-mono text-xs font-bold text-brand">
                Level {criticalityRating}/5 · {criticalityRating >= 4 ? 'Mission Critical' : 'Standard'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setCriticalityRating(lvl)}
                  className={`flex-1 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                    criticalityRating >= lvl
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {lvl}★
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400 font-mono">
              Agent 4 multiplies Criticality by 4.0 in the Composite Risk Score equation.
            </p>
          </div>

          {/* Owner Email */}
          <div>
            <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Owner / SecOps Contact Email *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. secops@vertexai.local"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 focus:bg-white focus:outline-brand"
            />
          </div>

          {/* Authorization Checkbox */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-start gap-2.5">
            <input
              type="checkbox"
              id="auth-check"
              checked={isAuthorized}
              onChange={(e) => setIsAuthorized(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <label htmlFor="auth-check" className="text-xs text-emerald-900 leading-snug cursor-pointer">
              <strong className="font-mono">Authorization Gate Enforced (is_authorized = true)</strong>
              <span className="block text-[11px] text-emerald-700 mt-0.5">
                Explicit authorization required before Spring Boot initiates multi-scanner sandbox execution.
              </span>
            </label>
          </div>

          {/* Actions */}
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
              className="flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2 font-mono text-xs font-bold text-white shadow-md hover:bg-brand/90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Register Target
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
