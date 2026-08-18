'use client';

/**
 * Key Alerts View — High-Severity Vulnerability Triage & Active Threats
 *
 * Displays prioritized P0 Critical and P1 High vulnerabilities with
 * CISA KEV active exploitation badges, EPSS exploit probabilities,
 * SLA deadlines, deep-dive inspection drawer, risk acceptance controls,
 * and CSV/JSON compliance reporting.
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Flame,
  Clock,
  CheckCircle2,
  Search,
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileCode,
  ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CanonicalFinding } from '@/types/contracts';
import { VulnerabilityDrawer } from '../vulnerability-drawer';
import { AcceptRiskModal } from '../accept-risk-modal';

interface KeyAlertsViewProps {
  onOpenHITL?: () => void;
}

export function KeyAlertsView({ onOpenHITL }: KeyAlertsViewProps) {
  const [findings, setFindings] = useState<CanonicalFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  // Drawer state
  const [selectedFinding, setSelectedFinding] = useState<CanonicalFinding | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Accept risk modal state
  const [riskModalFinding, setRiskModalFinding] = useState<CanonicalFinding | null>(null);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);

  // Export dropdown state
  const [isExportOpen, setIsExportOpen] = useState(false);

  useEffect(() => {
    loadFindings();
  }, []);

  const loadFindings = async () => {
    setLoading(true);
    try {
      const data = await api.getVulnerabilities(undefined, undefined, false);
      setFindings(data);
    } catch (err) {
      console.warn('Failed to fetch vulnerabilities', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawer = (item: CanonicalFinding) => {
    setSelectedFinding(item);
    setIsDrawerOpen(true);
  };

  const handleOpenRiskModal = (item: CanonicalFinding, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRiskModalFinding(item);
    setIsRiskModalOpen(true);
  };

  const handleRiskAccepted = (findingId: string) => {
    setFindings((prev) =>
      prev.map((f) =>
        f.finding_id === findingId ? { ...f, is_accepted_risk: true } : f
      )
    );
    if (selectedFinding?.finding_id === findingId) {
      setSelectedFinding((prev) => (prev ? { ...prev, is_accepted_risk: true } : null));
    }
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = [
      'CVE ID',
      'Vulnerability Name',
      'Target Host',
      'Target Port',
      'Priority Level',
      'Composite Risk Score',
      'EPSS Score',
      'CISA KEV',
      'SLA Deadline',
      'Status',
      'Fingerprint Hash',
    ];

    const rows = filtered.map((f) => [
      f.cve_id,
      `"${(f.vulnerability_name || '').replace(/"/g, '""')}"`,
      f.target_host,
      f.target_port,
      f.priority_level || 'P0_CRITICAL',
      f.composite_risk_score || 85,
      f.epss_score ? (f.epss_score * 100).toFixed(1) + '%' : '97.2%',
      f.is_cisa_kev ? 'YES' : 'NO',
      f.sla_deadline || '24h',
      f.is_accepted_risk ? 'ACCEPTED_RISK' : 'ACTIVE',
      f.fingerprint_hash || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vertexai_vulnerabilities_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportOpen(false);
  };

  // JSON Export
  const exportToJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(filtered, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `vertexai_vulnerabilities_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportOpen(false);
  };

  const filtered = findings.filter((f) => {
    const matchesSearch =
      (f.vulnerability_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.cve_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.target_host || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority =
      filterPriority === 'ALL'
        ? true
        : f.priority_level === filterPriority;

    return matchesSearch && matchesPriority;
  });

  return (
    <>
      <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <h2 className="font-mono text-base font-bold text-slate-800">
                Key Alerts & Prioritized Threats
              </h2>
              <span className="rounded-md bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-700 border border-rose-200">
                P0 / P1 ACTIVE
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 font-sans">
              High-severity threats correlated with CISA KEV and EPSS telemetry requiring active SLA triage
            </p>
          </div>

          {/* Filter & Export Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search CVE, Host..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-40 2xl:w-48 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-brand"
              />
            </div>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 font-mono text-xs text-slate-700 focus:bg-white focus:outline-brand"
            >
              <option value="ALL">All Priorities</option>
              <option value="P0_CRITICAL">P0 Critical</option>
              <option value="P1_HIGH">P1 High</option>
              <option value="P2_MEDIUM">P2 Medium</option>
            </select>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                title="Export Findings Report"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {isExportOpen && (
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                  <button
                    onClick={exportToCSV}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <span>Export as CSV</span>
                  </button>
                  <button
                    onClick={exportToJSON}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                  >
                    <FileCode className="h-4 w-4 text-purple-600" />
                    <span>Export as JSON</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={loadFindings}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              title="Refresh findings"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 min-h-0 overflow-y-auto my-2 scrollbar-thin">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 font-mono text-[11px] uppercase tracking-wider border-b border-slate-200 z-10">
              <tr>
                <th className="py-2.5 px-3">Vulnerability & CVE</th>
                <th className="py-2.5 px-3">Target Endpoint</th>
                <th className="py-2.5 px-3">CVSS</th>
                <th className="py-2.5 px-3">Threat Telemetry</th>
                <th className="py-2.5 px-3">Risk Score</th>
                <th className="py-2.5 px-3">Priority / SLA</th>
                <th className="py-2.5 px-3 text-right">Triage Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const isCrit = item.priority_level === 'P0_CRITICAL';
                const score = Math.round(item.composite_risk_score || 85);
                const epssVal = item.epss_score ? (item.epss_score * 100).toFixed(1) : '97.2';
                const approxCvss = (score / 10).toFixed(1);

                return (
                  <tr
                    key={item.finding_id}
                    onClick={() => handleOpenDrawer(item)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    {/* Name & CVE */}
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 group-hover:text-brand transition-colors line-clamp-1">
                        {item.vulnerability_name || item.cve_id}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] text-slate-500 font-semibold">
                          {item.cve_id}
                        </span>
                        {item.scanner_sources && (
                          <span className="rounded bg-slate-100 px-1 py-0.2 font-mono text-[9px] text-slate-600">
                            {Array.isArray(item.scanner_sources)
                              ? item.scanner_sources.join(', ')
                              : String(item.scanner_sources)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Target */}
                    <td className="py-3 px-3 font-mono text-xs text-slate-700">
                      <div>{item.target_host}</div>
                      <div className="text-slate-400 text-[10px]">Port {item.target_port}</div>
                    </td>

                    {/* CVSS Estimate */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block font-mono text-xs font-bold rounded px-1.5 py-0.5 ${
                          Number(approxCvss) >= 9
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {approxCvss}
                      </span>
                    </td>

                    {/* Threat Intel Badges */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1 items-start">
                        {item.is_cisa_kev && (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-700 border border-rose-200">
                            <Flame className="h-3 w-3 text-rose-500 fill-current" />
                            CISA KEV (+25)
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-purple-700">
                          EPSS: <strong>{epssVal}%</strong>
                        </span>
                      </div>
                    </td>

                    {/* Composite Score */}
                    <td className="py-3 px-3">
                      <div className="font-mono text-sm font-bold text-slate-900">
                        {score} <span className="text-[10px] text-slate-400">/ 100</span>
                      </div>
                      <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${isCrit ? 'bg-rose-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, score)}%` }}
                        />
                      </div>
                    </td>

                    {/* Priority & SLA */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`font-mono text-[11px] font-bold ${
                            isCrit ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        >
                          {item.priority_level || (isCrit ? 'P0_CRITICAL' : 'P1_HIGH')}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          {isCrit ? '24h SLA' : '72h SLA'}
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.is_accepted_risk ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Risk Accepted
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={(e) => handleOpenRiskModal(item, e)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              Accept Risk
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenHITL?.();
                              }}
                              className="rounded-lg bg-brand px-2.5 py-1 font-mono text-[11px] font-semibold text-white hover:bg-brand/90 transition-colors shadow-xs"
                            >
                              Review & Ticket
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="shrink-0 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>
            Showing {filtered.length} active findings ·{' '}
            <span className="text-slate-400">Click any row to open Deep-Dive Inspection</span>
          </span>
          <span className="text-slate-400">Database Table: canonical_vulnerabilities</span>
        </div>
      </section>

      {/* Vulnerability Deep-Dive Drawer */}
      <VulnerabilityDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onAcceptRisk={(_id) => {
          if (selectedFinding) handleOpenRiskModal(selectedFinding);
        }}
        onOpenHITL={onOpenHITL}
      />

      {/* Risk Acceptance Justification Modal */}
      <AcceptRiskModal
        finding={riskModalFinding}
        isOpen={isRiskModalOpen}
        onClose={() => setIsRiskModalOpen(false)}
        onSuccess={handleRiskAccepted}
      />
    </>
  );
}

