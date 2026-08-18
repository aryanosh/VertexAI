'use client';

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  Zap,
  Bot,
  Bug,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';

interface StageData {
  id: string;
  step: number;
  name: string;
  role: string;
  tag: string;
  tagColor: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  gateLabel?: string;
}

const STAGES: StageData[] = [
  {
    id: 'scanners',
    step: 0,
    name: 'Scanners',
    role: 'Nmap · Nuclei · ZAP',
    tag: 'Ingest',
    tagColor: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Bug,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-700',
    gateLabel: 'Sandbox',
  },
  {
    id: 'agent1',
    step: 1,
    name: 'Agent 1',
    role: 'Normalizer',
    tag: 'Unified',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: Cpu,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    gateLabel: 'Gate 1',
  },
  {
    id: 'agent2',
    step: 2,
    name: 'Agent 2',
    role: 'Noise Reduction',
    tag: '94% Filter',
    tagColor: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: Layers,
    iconBg: 'bg-orange-50',
    iconColor: 'text-brand',
    gateLabel: 'Gate 2',
  },
  {
    id: 'agent3',
    step: 3,
    name: 'Agent 3',
    role: 'Threat Intel',
    tag: 'KEV + EPSS',
    tagColor: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: Zap,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    gateLabel: 'Gate 3',
  },
  {
    id: 'agent4',
    step: 4,
    name: 'Agent 4',
    role: 'Risk & Ticket',
    tag: 'Score 94.5',
    tagColor: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: Bot,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    gateLabel: 'Final Gate',
  },
];

interface ThreatFlowProps {
  currentStage?: number;
  status?: string;
}

export function ThreatFlow({ currentStage: propStage, status: propStatus }: ThreatFlowProps) {
  const [activeStage, setActiveStage] = useState<number>(propStage ?? 0);
  const [activeStatus, setActiveStatus] = useState<string>(propStatus ?? 'IDLE');

  useEffect(() => {
    if (propStage !== undefined) setActiveStage(propStage);
    if (propStatus !== undefined) setActiveStatus(propStatus);
  }, [propStage, propStatus]);

  useEffect(() => {
    const handlePipelineEvent = (e: Event) => {
      const custom = e as CustomEvent<{ status?: string; stage?: number }>;
      if (custom.detail) {
        if (custom.detail.stage !== undefined) {
          setActiveStage(custom.detail.stage);
        }
        if (custom.detail.status) {
          setActiveStatus(custom.detail.status);
        }
      }
    };

    window.addEventListener('pipeline-event', handlePipelineEvent);
    return () => window.removeEventListener('pipeline-event', handlePipelineEvent);
  }, []);

  return (
    <div className="relative w-full flex-1 flex flex-col justify-center px-1 2xl:px-3 py-2">
      {/* Horizontal Stepper Grid */}
      <div className="grid grid-cols-5 gap-2 2xl:gap-3 items-center">
        {STAGES.map((stg, idx) => {
          const Icon = stg.icon;
          const isLast = idx === STAGES.length - 1;
          const isStatusDone =
            activeStatus === 'COMPLETED' ||
            activeStatus === 'TICKET_DISPATCHED' ||
            activeStatus === 'STAGE_4_PASSED' ||
            activeStatus === 'RESOLVED';
          const isPassed =
            activeStage > stg.step ||
            (stg.step === 4 && (isStatusDone || activeStage === 4 && activeStatus === 'COMPLETED')) ||
            (isStatusDone && activeStage >= stg.step);
          const isCurrent = activeStage === stg.step && activeStage > 0 && !isPassed;
          const isWaiting = isCurrent && activeStatus.includes('WAITING');

          return (
            <div key={stg.id} className="relative flex items-center">
              {/* Stage Card */}
              <div
                className={`relative flex-1 cursor-default flex flex-col justify-between rounded-xl border p-2.5 2xl:p-3 transition-all duration-300 ${
                  isPassed
                    ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950 shadow-xs'
                    : isCurrent
                    ? 'border-brand bg-brand-soft/40 shadow-md ring-2 ring-brand/30 -translate-y-0.5'
                    : 'border-slate-200 bg-white shadow-xs opacity-90'
                }`}
              >
                {/* Top header row */}
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-7 w-7 2xl:h-8 2xl:w-8 items-center justify-center rounded-lg ${
                      isPassed
                        ? 'bg-emerald-100 text-emerald-700'
                        : isCurrent
                        ? 'bg-brand text-white'
                        : `${stg.iconBg} ${stg.iconColor}`
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" strokeWidth={2} />
                  </div>

                  {isPassed ? (
                    <span className="flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                      PASSED
                    </span>
                  ) : isCurrent ? (
                    <span className="flex items-center gap-1 rounded-md bg-brand px-1.5 py-0.5 font-mono text-[9px] font-bold text-white animate-pulse">
                      {isWaiting ? 'GATE READY' : 'ACTIVE'}
                    </span>
                  ) : (
                    <span
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] 2xl:text-[10px] font-semibold ${stg.tagColor}`}
                    >
                      {stg.tag}
                    </span>
                  )}
                </div>

                {/* Body details */}
                <div className="mt-2 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs 2xl:text-sm font-bold text-slate-800 truncate">
                      {stg.name}
                    </span>
                    {stg.step > 0 && (
                      <span className="font-mono text-[9px] text-slate-400">
                        S{stg.step}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] 2xl:text-[11px] text-slate-500 truncate mt-0.5">
                    {stg.role}
                  </p>
                </div>

                {/* Bottom Human Review Gate Indicator */}
                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-mono text-[9px] text-slate-600 font-semibold flex items-center gap-1">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isPassed
                          ? 'bg-emerald-500'
                          : isCurrent
                          ? 'bg-brand animate-ping'
                          : 'bg-slate-300'
                      }`}
                    />
                    {stg.gateLabel}
                  </span>
                  <span className="font-mono text-[9px] text-slate-400">
                    Stage {stg.step}
                  </span>
                </div>
              </div>

              {/* Connecting arrow between cards */}
              {!isLast && (
                <div className="hidden sm:flex -mr-2 z-10 items-center justify-center pl-1">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-2xs transition-colors ${
                      isPassed
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pipeline Summary Sub-bar */}
      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-2 w-2 rounded-full ${
              activeStage > 0 ? 'bg-brand animate-ping' : 'bg-emerald-500 animate-pulse'
            }`}
          />
          <span className="font-mono text-[11px] text-slate-700 font-semibold">
            {activeStage > 0
              ? `Supervised Scan In Progress: Stage ${activeStage} (${activeStatus})`
              : 'Supervised DAG: Agent 1 ➔ Agent 2 ➔ Agent 3 ➔ Agent 4 ➔ Human Approval'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>GitHub Dispatch Strictly on Stage 4 Approval</span>
        </div>
      </div>
    </div>
  );
}

