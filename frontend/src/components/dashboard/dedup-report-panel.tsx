'use client';

/**
 * Agent 2 Deduplication Report — per-finding audit trail
 *
 * Surfaces the concrete, persisted output of Agent 2 (GET /api/scans/{scanId}/dedup-report)
 * for the currently active scan: every raw input finding, including the ones merged away
 * as duplicates or suppressed as false positives, with its duplicate-group id, status, and
 * reason — plus the required summary metrics (raw count, duplicates detected, findings
 * removed, final unique count, deduplication percentage). Previously this data existed only
 * as an internal Python response object; nothing in the UI showed it.
 */

import { useEffect, useState } from 'react';
import { Layers, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { usePipeline } from '@/lib/pipeline-context';
import type { DedupRecord, DuplicateStatus } from '@/types/contracts';

function statusBadge(status: DuplicateStatus) {
  switch (status) {
    case 'KEPT':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'REMOVED_DUPLICATE':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'REMOVED_FALSE_POSITIVE':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ACCEPTED_RISK':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}

export function DedupReportPanel() {
  const { activeScanId, status: pipelineStatus, currentStage } = usePipeline();
  const [records, setRecords] = useState<DedupRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!activeScanId) {
      setRecords(null);
      return;
    }
    // Agent 2 hasn't run yet before stage 2 — avoid a needless 404-driven error flash.
    if (currentStage < 2) {
      setRecords(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getDedupReport(activeScanId)
      .then((data) => {
        if (!cancelled) {
          setRecords(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dedup report');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeScanId, pipelineStatus, currentStage]);

  const handleDownload = async () => {
    if (!activeScanId) return;
    setDownloading(true);
    try {
      await api.downloadDedupReportCsv(activeScanId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download CSV');
    } finally {
      setDownloading(false);
    }
  };

  const raw = records?.length ?? 0;
  const kept = records?.filter((r) => r.duplicate_status === 'KEPT').length ?? 0;
  const duplicates = records?.filter((r) => r.duplicate_status === 'REMOVED_DUPLICATE').length ?? 0;
  const falsePositives = records?.filter((r) => r.duplicate_status === 'REMOVED_FALSE_POSITIVE').length ?? 0;
  const removed = duplicates + falsePositives;
  const dedupPct = raw > 0 ? Math.round((removed / raw) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shadow-2xs">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold text-slate-900">Agent 2 Deduplication Report</h3>
            <p className="text-xs text-slate-500">Per-finding audit: every raw finding, kept or removed, with a reason</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono text-center">
            <div className="p-2 rounded bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block text-[10px]">Raw Findings</span>
              <strong className="text-slate-900">{raw}</strong>
            </div>
            <div className="p-2 rounded bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block text-[10px]">Duplicates Detected</span>
              <strong className="text-slate-900">{duplicates}</strong>
            </div>
            <div className="p-2 rounded bg-amber-50/60 border border-amber-100">
              <span className="text-amber-600 block text-[10px]">False Positives</span>
              <strong className="text-amber-900">{falsePositives}</strong>
            </div>
            <div className="p-2 rounded bg-emerald-50/60 border border-emerald-100">
              <span className="text-emerald-600 block text-[10px]">Final Unique</span>
              <strong className="text-emerald-900">{kept}</strong>
            </div>
            <div className="p-2 rounded bg-orange-50/60 border border-orange-100">
              <span className="text-orange-500 block text-[10px]">Dedup %</span>
              <strong className="text-brand">{raw > 0 ? `${dedupPct}%` : '—'}</strong>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-mono">
              {activeScanId ? `Scan ${activeScanId.slice(0, 8)}…` : 'No active scan'}
            </span>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!activeScanId || !records || records.length === 0 || downloading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Download CSV
            </button>
          </div>

          {/* Table */}
          <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            ) : error ? (
              <p className="py-6 text-center text-xs text-rose-600 font-mono px-4">{error}</p>
            ) : !activeScanId ? (
              <p className="py-6 text-center text-xs text-slate-400 font-mono">No active scan yet</p>
            ) : currentStage < 2 ? (
              <p className="py-6 text-center text-xs text-slate-400 font-mono">Agent 2 hasn&apos;t run yet for this scan</p>
            ) : !records || records.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400 font-mono">No dedup detail available for this scan</p>
            ) : (
              <table className="w-full text-left border-collapse font-sans text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 font-mono text-[10px] uppercase tracking-wider border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2 px-2.5">Finding ID</th>
                    <th className="py-2 px-2.5">CVE</th>
                    <th className="py-2 px-2.5">Scanner</th>
                    <th className="py-2 px-2.5">Asset</th>
                    <th className="py-2 px-2.5">Severity</th>
                    <th className="py-2 px-2.5">Group ID</th>
                    <th className="py-2 px-2.5">Status</th>
                    <th className="py-2 px-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.finding_id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-2.5 font-mono text-slate-500">{r.finding_id.slice(0, 8)}…</td>
                      <td className="py-2 px-2.5 font-mono font-semibold text-slate-800">{r.cve_id || '—'}</td>
                      <td className="py-2 px-2.5 text-slate-600">{r.scanner_source}</td>
                      <td className="py-2 px-2.5 text-slate-600 truncate max-w-[140px]">{r.target_host}</td>
                      <td className="py-2 px-2.5 text-slate-600">{r.severity}</td>
                      <td className="py-2 px-2.5 font-mono text-slate-400">{r.duplicate_group_id.slice(0, 8)}…</td>
                      <td className="py-2 px-2.5">
                        <span className={`rounded px-1.5 py-0.5 border font-mono text-[10px] font-bold ${statusBadge(r.duplicate_status)}`}>
                          {r.duplicate_status}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-500 max-w-[220px] truncate" title={r.reason}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
