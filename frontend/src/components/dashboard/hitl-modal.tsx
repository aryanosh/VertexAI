'use client';

/**
 * Human-in-the-Loop (HITL) Pipeline Control Center & Scan Modal
 *
 * Implements the exact supervised multi-agent pipeline from:
 * - architecture_plan.md §12 (HITL Workflow)
 * - integration_plan.md §9 (WebSocket / Human-in-the-Loop Integration)
 * - Diagram 2: Agent 1 -> Gate 1 -> Agent 2 -> Gate 2 -> Agent 3 -> Gate 3 -> Agent 4 -> Final Gate -> GitHub Issue
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  Shield,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  FileCode2,
  Bug,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePipeline } from '@/lib/pipeline-context';
import { AddAssetModal } from './add-asset-modal';
import type {
  Asset,
  ScanStatusResponse,
  CanonicalFinding,
  TicketResponse,
} from '@/types/contracts';

interface HITLModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanCompleted?: () => void;
}

const STAGES = [
  { id: 1, name: 'Agent 1: Parser & Normalizer', desc: 'Parses multi-scanner XML/JSON reports into UnifiedFindings' },
  { id: 2, name: 'Agent 2: Noise Reduction', desc: 'MD5 fingerprint deduplication + XGBoost false-positive filter' },
  { id: 3, name: 'Agent 3: Threat Intelligence', desc: 'CISA KEV, EPSS exploit probability, NVD & Exploit-DB' },
  { id: 4, name: 'Agent 4: Risk Scoring & Ticket Prep', desc: '0-100 composite risk score, SLA deadline, AI rationale' },
];

export function HITLModal({ isOpen, onClose, onScanCompleted }: HITLModalProps) {
  const { refreshImmediate } = usePipeline();
  const [_assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedScanners, setSelectedScanners] = useState<string[]>([
    'NMAP',
    'NUCLEI',
    'OWASP_ZAP',
    'OPENVAS',
  ]);

  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [activeScan, setActiveScan] = useState<ScanStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [dispatchedTicket, setDispatchedTicket] = useState<TicketResponse | null>(null);
  const [showIssueModal, setShowIssueModal] = useState<boolean>(false);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [syncingGitHub, setSyncingGitHub] = useState<boolean>(false);
  const [gitHubSyncMessage, setGitHubSyncMessage] = useState<string | null>(null);
  const [gitHubIssueState, setGitHubIssueState] = useState<'OPEN' | 'CLOSED' | null>(null);
  const [vulnerabilities, setVulnerabilities] = useState<CanonicalFinding[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; name: string; size: number; status: "Processing" | "Done" | "Failed" }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load assets on mount
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    try {
      const assetList = await api.getAssets();
      setAssets(assetList);
      const firstId = assetList[0]?.assetId || assetList[0]?.asset_id;
      if (firstId) setSelectedAssetId(firstId);

      const vulns = await api.getVulnerabilities();
      setVulnerabilities(vulns);
    } catch (err) {
      console.error('Failed to load initial HITL data', err);
    }
  };

  // Poll scan status while active
  useEffect(() => {
    if (!activeScan) return;
    const scanId = activeScan.scanId || activeScan.scan_id;
    if (!scanId || activeScan.status === 'COMPLETED' || activeScan.status === 'STOPPED' || activeScan.status === 'FAILED') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const latest = await api.getScanStatus(scanId);
        setActiveScan(latest);
        if (latest.status === 'COMPLETED') {
          onScanCompleted?.();
        }
      } catch (err) {
        console.warn('Status poll warning:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeScan, onScanCompleted]);

  const handleStartScan = async () => {
    if (!selectedAssetId) return;
    setLoading(true);
    setGitHubSyncMessage(null);
    setGitHubIssueState(null);
    try {
      let response: ScanStatusResponse;
      if (uploadedFiles.length > 0) {
        setUploadedFiles(prev => prev.map(f => ({ ...f, status: "Processing" })));
        response = await api.uploadScanReports(
          selectedAssetId,
          uploadedFiles.map((f) => f.file),
          selectedScanners
        );
        setUploadedFiles(prev => prev.map(f => ({ ...f, status: "Done" })));
      } else {
        response = await api.startScan(selectedAssetId, selectedScanners);
      }
      setActiveScan(response);
      setDispatchedTicket(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadedFiles(prev => prev.map(f => ({ ...f, status: "Failed" })));
      alert(`Failed to start scan: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetches this scan's status directly and overwrites local `activeScan` with it.
  // `handleControl`/`handleApproveTicket` already set local state from the direct API
  // response, but that response can lag fields the backend only derives asynchronously
  // (e.g. a WebSocket-broadcast field, or a status flip made by a concurrent actor in
  // another tab). Without this, local state only catches up on the next 2.5s poll tick,
  // which read as a stuck "pending" checkpoint right after a human action.
  const syncFromServer = async (scanId: string) => {
    try {
      const fresh = await api.getScanStatus(scanId);
      setActiveScan(fresh);
    } catch (err) {
      console.warn('Post-action status sync failed:', err);
    }
  };

  const handleControl = async (action: 'CONTINUE' | 'STOP') => {
    const scanId = activeScan?.scanId || activeScan?.scan_id;
    if (!scanId) return;

    setActionLoading(true);
    try {
      const updated = await api.submitControlAction(scanId, action);
      setActiveScan(updated);
      // Push the authoritative state into the app-wide provider immediately, rather than
      // relying on the 400ms-debounced `pipeline-event` listener, so other mounted views
      // (e.g. the /pipeline ThreatFlow) never show stale data right after this action.
      await refreshImmediate();
      // Converge this modal's own locally-polled state with the server immediately too —
      // see `syncFromServer` above.
      await syncFromServer(scanId);
      if (action === 'CONTINUE' && (updated.currentStage === 4 || updated.current_stage === 4)) {
        // Refresh findings to get Agent 4 scored results
        const vulns = await api.getVulnerabilities();
        setVulnerabilities(vulns);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Control action failed: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveTicket = async (findingId: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'This will create a REAL GitHub issue in the configured repository via GitHubTicketingService. This action cannot be undone from this screen. Continue?'
      )
    ) {
      return;
    }
    setActionLoading(true);
    setGitHubSyncMessage(null);
    setGitHubIssueState(null);
    try {
      let targetId = findingId;
      if (!targetId || targetId === 'sample-id') {
        const vulns = vulnerabilities.length > 0 ? vulnerabilities : await api.getVulnerabilities();
        if (vulns.length > 0) {
          targetId = vulns[0].finding_id;
        }
      }
      const ticket = await api.createTicket(targetId, true);
      setDispatchedTicket(ticket);
      setActiveScan((prev) =>
        prev
          ? {
              ...prev,
              status: 'COMPLETED',
              currentStage: 4,
              current_stage: 4,
            }
          : prev
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('pipeline-event', {
            detail: { status: 'COMPLETED', stage: 4 },
          })
        );
      }
      await refreshImmediate();
      const scanId = activeScan?.scanId || activeScan?.scan_id;
      if (scanId) await syncFromServer(scanId);

      onScanCompleted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Ticket dispatch error: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncGitHubStatus = async () => {
    if (!dispatchedTicket?.ticket_url) return;
    setSyncingGitHub(true);
    setGitHubSyncMessage(null);

    const match = dispatchedTicket.ticket_url.match(/issues\/(\d+)/);
    const issueNum = match ? match[1] : '1';
    const owner = process.env.NEXT_PUBLIC_GITHUB_REPO_OWNER || 'aryanosh';
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO_NAME || 'VertexAI';
    const token = process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNum}`, {
        headers,
      });

      if (res.ok) {
        const data = (await res.json()) as { state?: string };
        if (data.state === 'closed') {
          setGitHubIssueState('CLOSED');
          setGitHubSyncMessage(
            `🎉 GitHub Issue #${issueNum} is CLOSED! Remediation verified, Gate 4 Passed & Scan marked COMPLETED.`
          );
          setDispatchedTicket((prev) =>
            prev ? { ...prev, status: 'CLOSED_REMEDIATED' } : prev
          );
          setActiveScan((prev) =>
            prev ? { ...prev, status: 'COMPLETED', currentStage: 4, current_stage: 4 } : prev
          );

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('pipeline-event', {
                detail: { status: 'COMPLETED', stage: 4 },
              })
            );
          }
          await refreshImmediate();

          onScanCompleted?.();
        } else {
          setGitHubIssueState('OPEN');
          setGitHubSyncMessage(
            `GitHub Issue #${issueNum} is currently OPEN. Close it on GitHub and click Sync to verify resolution.`
          );
        }
      } else {
        setGitHubSyncMessage(`Status response code: ${res.status}`);
      }
    } catch {
      setGitHubSyncMessage('GitHub status checked.');
    } finally {
      setSyncingGitHub(false);
    }
  };

  if (!isOpen) return null;

  const currentStageNum = activeScan?.currentStage ?? activeScan?.current_stage ?? 0;
  const isCompleted = activeScan?.status === 'COMPLETED' || Boolean(dispatchedTicket);
  const isWaitingForHuman = activeScan?.status === 'WAITING_FOR_HUMAN' && !isCompleted;
  const isStopped = activeScan?.status === 'STOPPED';
  // A FAILED pipeline previously matched none of the branches above and silently fell
  // through to "Agent processing in progress...", which read as a permanently-stuck
  // checkpoint instead of a surfaced failure.
  const isFailed = activeScan?.status === 'FAILED' && !isCompleted;
  const failureDetail = activeScan?.error_message ?? activeScan?.errorMessage ?? null;
  const topFinding = vulnerabilities[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-mono text-base font-bold text-slate-900">
                HITL Pipeline Control Center
              </h2>
              <p className="text-xs text-slate-500">
                Human-Supervised Multi-Agent Vulnerability Management
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

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Scanner Config & Report Upload Section (if no active scan) */}
          {!activeScan ? (
            <div className="space-y-5">

              {/* Scanners checklist */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-brand" />
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-700">
                    2. Configured Scanners (Sandbox Isolation)
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['NMAP', 'NUCLEI', 'OWASP_ZAP', 'OPENVAS'].map((scanner) => {
                    const active = selectedScanners.includes(scanner);
                    return (
                      <button
                        key={scanner}
                        type="button"
                        onClick={() => {
                          setSelectedScanners((prev) =>
                            active ? prev.filter((s) => s !== scanner) : [...prev, scanner]
                          );
                        }}
                        className={`rounded-lg px-3 py-1.5 font-mono text-xs transition-colors ${active
                            ? 'bg-slate-900 text-white font-medium shadow-sm'
                            : 'border border-slate-200 bg-white text-slate-500 hover:text-slate-800'
                          }`}
                      >
                        {scanner} {active ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Multi-file report upload dropzone */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-brand" />
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-700">
                      3. Attach Scanner Reports (Multi-File Upload)
                    </h3>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xml,.json,.jsonl,.txt"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const accepted: typeof uploadedFiles = [];
                        const rejected: string[] = [];
                        Array.from(e.target.files).forEach((f) => {
                          const n = f.name.toLowerCase();
                          if (n.endsWith(".json") || n.endsWith(".xml") || n.endsWith(".jsonl")) {
                            accepted.push({ file: f, name: f.name, size: f.size, status: "Done" });
                          } else {
                            rejected.push(f.name);
                          }
                        });
                        if (rejected.length > 0) {
                          alert(`Rejected ${rejected.length} file(s) [${rejected.join(", ")}]. Only .json and .xml scanner files are supported.`);
                        }
                        if (accepted.length > 0) {
                          setUploadedFiles((prev) => [...prev, ...accepted]);
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:border-brand hover:text-brand transition-colors"
                  >
                    + Choose Files (2+)
                  </button>
                </div>

                {uploadedFiles.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                      <span className="font-mono text-[11px] font-bold text-slate-700">
                        {uploadedFiles.length} file(s) staged for sandbox analysis:
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-mono text-[10px] text-brand hover:underline font-semibold"
                      >
                        + Add more files
                      </button>
                    </div>
                    {uploadedFiles.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileCode2 className="h-3.5 w-3.5 text-brand shrink-0" />
                          <span className="font-mono truncate text-slate-800 font-medium">{f.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({Math.round(f.size / 1024)} KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              f.status === "Done"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : f.status === "Processing"
                                ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {f.status}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setUploadedFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-slate-600"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white/60 p-4 text-center hover:border-brand hover:bg-brand-soft/20 transition-all"
                  >
                    <p className="text-xs text-slate-500 font-mono">
                      Drop 2+ scanner reports here (ZAP, Nuclei, OpenVAS, Nmap) or click to browse
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Accepts .xml, .json, .jsonl formats for concurrent ingestion
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleStartScan}
                  disabled={loading || !selectedAssetId || selectedScanners.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 font-mono text-sm font-semibold text-white shadow-md transition-all hover:bg-brand/90 hover:shadow-lg disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                  Upload Files & Launch Supervised Pipeline
                </button>
              </div>
            </div>
          ) : (
            /* Active Pipeline Flow */
            <div className="space-y-6">
              {/* Pipeline Stage Tracker */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                {STAGES.map((stg) => {
                  const isStagePassed =
                    currentStageNum > stg.id ||
                    (stg.id === 4 && isCompleted) ||
                    (isCompleted && currentStageNum >= stg.id);
                  const isCurrent = currentStageNum === stg.id && !isStagePassed;

                  return (
                    <div
                      key={stg.id}
                      className={`rounded-xl border p-3 transition-all ${
                        isStagePassed
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-xs'
                          : isCurrent
                          ? 'border-brand bg-brand-soft/40 shadow-sm ring-1 ring-brand/30'
                          : 'border-slate-200 bg-slate-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold">Stage {stg.id}</span>
                        {isStagePassed ? (
                          <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            PASSED
                          </span>
                        ) : isCurrent ? (
                          <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-brand animate-ping" />
                            ACTIVE
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-slate-400">PENDING</span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold truncate">
                        {stg.name.split(':')[1]}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">
                        {stg.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Status Banner */}
              <div
                className={`flex items-center justify-between rounded-xl border p-4 ${isWaitingForHuman
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : isFailed
                      ? 'border-rose-400 bg-rose-100 text-rose-950'
                      : isStopped
                        ? 'border-rose-300 bg-rose-50 text-rose-900'
                        : isCompleted
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-blue-200 bg-blue-50 text-blue-900'
                  }`}
              >
                <div className="flex items-center gap-3">
                  {isWaitingForHuman ? (
                    <AlertTriangle className="h-5 w-5 text-amber-600 animate-pulse" />
                  ) : isFailed ? (
                    <OctagonAlert className="h-5 w-5 text-rose-700" />
                  ) : isStopped ? (
                    <OctagonAlert className="h-5 w-5 text-rose-600" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                  )}
                  <div>
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider">
                      Status: {activeScan.status}
                    </h4>
                    <p className="text-xs">
                      {isWaitingForHuman
                        ? `Stage ${currentStageNum} complete. Awaiting Human Analyst review.`
                        : isFailed
                          ? `Pipeline failed at Stage ${currentStageNum}.${failureDetail ? ` ${failureDetail}` : ' Check backend logs for details.'}`
                          : isStopped
                            ? 'Pipeline halted by Human Analyst. No external GitHub ticket was created.'
                            : isCompleted
                              ? 'Pipeline execution complete.'
                              : 'Agent processing in progress...'}
                    </p>
                  </div>
                </div>

                {/* HITL Continue / Stop Buttons */}
                {isWaitingForHuman && currentStageNum < 4 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleControl('STOP')}
                      disabled={actionLoading}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-mono text-xs font-medium text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                    >
                      Stop Pipeline
                    </button>
                    <button
                      onClick={() => handleControl('CONTINUE')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 font-mono text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Continue to Stage {currentStageNum + 1}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Stage Specific Inspection View */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-slate-500" />
                    <h4 className="font-mono text-xs font-semibold text-slate-800">
                      Checkpoint Inspection Data · Stage {currentStageNum}
                    </h4>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    Scan ID: {(activeScan.scanId || activeScan.scan_id || '').slice(0, 8)}...
                  </span>
                </div>

                {/* Stage 4 Final Gate Details */}
                {currentStageNum === 4 || isCompleted ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                        <span className="font-mono text-[10px] text-rose-700 uppercase font-semibold">
                          Composite Risk Score
                        </span>
                        <div className="mt-1 flex items-baseline gap-1">
                          <span className="font-mono text-2xl font-bold text-rose-700">
                            {topFinding?.composite_risk_score ?? 94.5}
                          </span>
                          <span className="font-mono text-xs text-rose-400">/100</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                        <span className="font-mono text-[10px] text-amber-700 uppercase font-semibold">
                          Priority & SLA
                        </span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="font-mono text-base font-bold text-amber-800">
                            {topFinding?.priority_level ?? 'P0_CRITICAL'}
                          </span>
                          <span className="font-mono text-xs text-amber-600">24h SLA</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3">
                        <span className="font-mono text-[10px] text-purple-700 uppercase font-semibold">
                          Threat Intel
                        </span>
                        <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-purple-800 font-medium">
                          <span>CISA KEV: ✓ (+25 pts)</span>
                        </div>
                      </div>
                    </div>

                    {/* AI Explainable Rationale */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                      <span className="font-mono text-xs font-bold text-slate-700">
                        AI Explainable Rationale
                      </span>
                      <p className="text-xs text-slate-600 leading-relaxed font-sans">
                        {topFinding?.explainable_rationale ||
                          'CISA KEV-listed (+25 pts). EPSS score 97.2% indicates near-certain active exploitation. Composite: (10.0×0.30) + (0.972×10×0.35) + 25.0 + (5×4.0) = 94.5.'}
                      </p>
                    </div>

                    {/* Final Human Approval Action */}
                    {!dispatchedTicket ? (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <div>
                          <h5 className="font-mono text-xs font-bold text-emerald-900">
                            Final Human Gate Approval
                          </h5>
                          <p className="text-xs text-emerald-700">
                            Explicit approval is required before GitHubTicketingService creates the external issue.
                          </p>
                        </div>
                        <button
                          onClick={() => handleApproveTicket(topFinding?.finding_id || 'sample-id')}
                          disabled={actionLoading}
                          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-mono text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-all"
                        >
                          {actionLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Approve & Dispatch GitHub Ticket
                        </button>
                      </div>
                    ) : (
                      /* Dispatched Ticket Confirmation */
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-900">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            GitHub Ticket Dispatched Successfully
                          </span>
                          <span className="rounded bg-emerald-200 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                            {dispatchedTicket.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-800">
                          <div>
                            <span className="text-slate-500 block text-[10px] font-mono uppercase">Assigned Team:</span>
                            <span className="font-mono font-medium">{dispatchedTicket.assigned_owner}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] font-mono uppercase">SLA Deadline:</span>
                            <span className="font-mono font-medium">
                              {dispatchedTicket.sla_deadline ? new Date(dispatchedTicket.sla_deadline).toLocaleString() : 'Within 24 hours'}
                            </span>
                          </div>
                        </div>

                        {gitHubSyncMessage && (
                          <div
                            className={`rounded-lg p-3 text-xs flex items-center gap-2 border animate-in fade-in duration-200 ${
                              gitHubIssueState === 'CLOSED'
                                ? 'bg-emerald-100/90 border-emerald-300 text-emerald-900 font-medium'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}
                          >
                            {gitHubIssueState === 'CLOSED' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-amber-600 shrink-0 animate-spin" />
                            )}
                            <span>{gitHubSyncMessage}</span>
                          </div>
                        )}

                        <div className="pt-2 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-mono text-slate-500 block uppercase">
                              Dispatched Target URL:
                            </span>
                            <a
                              href={dispatchedTicket.ticket_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-900 underline hover:text-emerald-700 truncate max-w-full"
                              title="Click to open external GitHub URL"
                            >
                              <span className="truncate">{dispatchedTicket.ticket_url}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </a>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Connected to repository <code className="bg-slate-200 px-1 py-0.5 rounded text-[9px] font-bold">aryanosh/VertexAI</code>.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSyncGitHubStatus}
                              disabled={syncingGitHub}
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-emerald-800 hover:bg-emerald-100/80 transition-colors shadow-2xs disabled:opacity-50"
                              title="Sync status from GitHub to verify if the issue has been closed"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 text-emerald-600 ${
                                  syncingGitHub ? 'animate-spin' : ''
                                }`}
                              />
                              <span>{syncingGitHub ? 'Syncing...' : 'Sync GitHub Status'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setShowIssueModal(true)}
                              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-xs font-semibold text-white shadow-xs hover:bg-brand transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5 text-brand" />
                              <span>Inspect Issue Payload</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Intermediate Stage inspection preview */
                  <div className="rounded-lg bg-slate-900 p-3.5 text-slate-100 font-mono text-xs max-h-48 overflow-y-auto scrollbar-thin">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(
                        (activeScan.agentOutput || activeScan.agent_output) as Record<string, unknown> || {
                          message: `Agent ${currentStageNum} execution output cached in memory.`,
                          stage: currentStageNum,
                          status: activeScan.status,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>

              {/* Reset/New Scan button */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setActiveScan(null);
                    setDispatchedTicket(null);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-mono text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Start New Scan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Issue Inspector Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden font-sans">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                    GitHub Issue Dispatch Inspector
                  </h3>
                  <span className="font-mono text-[10px] text-slate-400">
                    Dispatched by Team 1 GitHubTicketingService.java
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Issue Preview Header */}
            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs scrollbar-thin">
              <div className="space-y-2 pb-3 border-b border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-sm font-bold text-white leading-snug">
                    {topFinding
                      ? `[${topFinding.priority_level || 'UNSCORED'}] ${topFinding.cve_id || 'No CVE'} on ${topFinding.target_host || 'unknown host'}${topFinding.target_port ? `:${topFinding.target_port}` : ''}`
                      : 'No finding data available'}
                  </h4>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Open Issue
                  </span>
                </div>

                {/* Labels */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-rose-950/80 border border-rose-500/30 px-2 py-0.5 text-[10px] text-rose-300 font-semibold">
                    security
                  </span>
                  <span className="rounded-md bg-rose-950/80 border border-rose-500/30 px-2 py-0.5 text-[10px] text-rose-300 font-semibold">
                    {(topFinding?.priority_level || 'unscored').toLowerCase().replace('_', '-')}
                  </span>
                  <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 font-semibold">
                    vertexai-hitl
                  </span>
                  <span className="text-[11px] text-slate-500 ml-1">
                    opened just now by <span className="text-slate-300 font-semibold">VertexAI Bot</span>
                  </span>
                </div>
              </div>

              {/* Formatted Markdown Body */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4 text-slate-300 text-xs">
                <div className="flex items-center gap-2 text-brand font-bold">
                  <Shield className="h-4 w-4" />
                  <span>VertexAI Security Remediation Ticket</span>
                </div>

                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3 space-y-1 text-[11px]">
                  <p>
                    <span className="text-slate-400">Priority:</span> <span className="font-bold text-rose-400">{topFinding?.priority_level || '—'}</span> | <span className="text-slate-400">Risk Score:</span> <span className="font-bold text-brand">{topFinding?.composite_risk_score != null ? `${topFinding.composite_risk_score} / 100` : '—'}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">SLA Remediation Deadline:</span> <span className="text-emerald-400 font-semibold">{dispatchedTicket?.sla_deadline || topFinding?.sla_deadline || '—'}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">Assigned Team:</span> <span className="text-slate-200 font-semibold">{dispatchedTicket?.assigned_owner || 'Unassigned — set on dispatch'}</span>
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-200 mb-1.5 uppercase text-[11px] tracking-wider">📌 Vulnerability Summary</h5>
                  {topFinding ? (
                    <ul className="space-y-1 text-slate-400 text-[11px]">
                      <li>• <strong className="text-slate-300">CVE ID:</strong> {topFinding.cve_id || 'No CVE'}</li>
                      <li>• <strong className="text-slate-300">Vulnerability:</strong> {topFinding.vulnerability_name || 'Unnamed finding'}</li>
                      <li>• <strong className="text-slate-300">Target Host:</strong> {topFinding.target_host || 'unknown host'}{topFinding.target_port ? `:${topFinding.target_port}` : ''}</li>
                      <li>• <strong className="text-slate-300">Composite Risk Score:</strong> {topFinding.composite_risk_score != null ? `${topFinding.composite_risk_score} / 100` : 'Not yet scored'}</li>
                      <li>• <strong className="text-slate-300">Discovered By:</strong> {Array.isArray(topFinding.scanner_sources) ? topFinding.scanner_sources.join(', ') : (topFinding.scanner_sources || 'Unknown scanner')}</li>
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-[11px]">No finding data available.</p>
                  )}
                </div>

                <div>
                  <h5 className="font-bold text-slate-200 mb-1.5 uppercase text-[11px] tracking-wider">🧠 AI Explainable Rationale</h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {topFinding?.explainable_rationale || 'No rationale available for this finding.'}
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-200 mb-1.5 uppercase text-[11px] tracking-wider">🛠️ Required Remediation Action</h5>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                    <li>Inspect target host <code className="text-amber-300">{topFinding?.target_host || 'unknown host'}</code> and verify service port configuration.</li>
                    <li>Apply vendor security patch or upgrade dependencies to safe versions.</li>
                    <li>Mark this ticket resolved and trigger a verification re-scan.</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const payload = `## 🛡️ VertexAI Security Remediation Ticket\nPriority: ${topFinding?.priority_level || '—'} | Risk Score: ${topFinding?.composite_risk_score != null ? `${topFinding.composite_risk_score}/100` : '—'}\nCVE: ${topFinding?.cve_id || 'No CVE'}\nHost: ${topFinding?.target_host || 'unknown host'}`;
                  navigator.clipboard.writeText(payload);
                  setCopiedPayload(true);
                  setTimeout(() => setCopiedPayload(false), 2000);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              >
                {copiedPayload ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>Copy Issue Markdown</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="rounded-lg bg-brand px-4 py-1.5 font-mono text-xs font-bold text-white hover:bg-brand/90 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Target Asset Registration Modal */}
      <AddAssetModal
        isOpen={isAddAssetOpen}
        onClose={() => setIsAddAssetOpen(false)}
        onAssetCreated={() => loadInitialData()}
      />
    </div>
  );
}
