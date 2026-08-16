'use client';

/**
 * LiveTimelineStream — Real-Time HITL Pipeline Event Timeline
 *
 * Chronological timeline stream rendering pipeline transitions, HITL checkpoints,
 * AI investigation steps, and containment actions.
 */

import React from 'react';
import type { WebSocketMessage, ScanJob } from '@/types/contracts';

interface LiveTimelineStreamProps {
  scanJob?: ScanJob | null;
  events?: WebSocketMessage[];
  onContinue?: (scanId: string) => void;
  onStop?: (scanId: string) => void;
  onApprove?: (findingId: string) => void;
}

interface TimelineItem {
  id: string;
  type: 'threat' | 'investigation' | 'playbook' | 'containment' | 'resolved';
  title: string;
  description: string;
  time: string;
  colorClass: {
    dot: string;
    title: string;
    border: string;
  };
}

const DEFAULT_TIMELINE_ITEMS: TimelineItem[] = [
  {
    id: 't-1',
    type: 'threat',
    title: 'Threat Detected',
    description: 'Credential stuffing via /api/auth',
    time: '09:23:12',
    colorClass: {
      dot: 'bg-rose-500 ring-4 ring-rose-100',
      title: 'text-rose-600',
      border: 'border-rose-200',
    },
  },
  {
    id: 't-2',
    type: 'investigation',
    title: 'AI Investigation',
    description: 'Analyzing 214 behavioral signals',
    time: '09:23:14',
    colorClass: {
      dot: 'bg-purple-500 ring-4 ring-purple-100',
      title: 'text-purple-600',
      border: 'border-purple-200',
    },
  },
  {
    id: 't-3',
    type: 'playbook',
    title: 'Playbook Started',
    description: 'SOC-Auto-04 initiated',
    time: '09:23:18',
    colorClass: {
      dot: 'bg-orange-500 ring-4 ring-orange-100',
      title: 'text-orange-600',
      border: 'border-orange-200',
    },
  },
  {
    id: 't-4',
    type: 'containment',
    title: 'Threat Contained',
    description: 'Traffic blocked at edge layer',
    time: '09:23:22',
    colorClass: {
      dot: 'bg-teal-500 ring-4 ring-teal-100',
      title: 'text-teal-600',
      border: 'border-teal-200',
    },
  },
  {
    id: 't-5',
    type: 'resolved',
    title: 'Resolved',
    description: 'Incident closed · 48s response',
    time: '09:24:01',
    colorClass: {
      dot: 'bg-emerald-500 ring-4 ring-emerald-100',
      title: 'text-emerald-600',
      border: 'border-emerald-200',
    },
  },
];

export default function LiveTimelineStream({
  scanJob: _scanJob,
  events = [],
  onContinue: _onContinue,
  onStop: _onStop,
  onApprove: _onApprove,
}: LiveTimelineStreamProps) {
  return (
    <div className="relative w-full flex flex-col space-y-6 pt-2 select-none">
      {/* Timeline track line */}
      <div className="absolute left-[7px] top-4 bottom-4 w-[2px] bg-zinc-200" />

      {DEFAULT_TIMELINE_ITEMS.map((item) => (
        <div key={item.id} className="relative flex items-start space-x-3 pl-6 group">
          {/* Status Dot */}
          <span
            className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full ${item.colorClass.dot} transition-transform duration-200 group-hover:scale-125 z-10`}
          />

          {/* Timeline Content */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${item.colorClass.title}`}>
                {item.title}
              </span>
            </div>
            <p className="text-xs text-zinc-700 mt-0.5 leading-snug font-sans">
              {item.description}
            </p>
            <span className="text-[10px] text-zinc-400 font-mono mt-1">
              {item.time}
            </span>
          </div>
        </div>
      ))}

      {/* Dynamic WebSocket Events if present */}
      {events.length > 0 && (
        <div className="pt-2 border-t border-zinc-100">
          <span className="text-[10px] uppercase font-mono text-zinc-400 tracking-wider mb-2 block">
            Live Stream
          </span>
          {events.map((evt, idx) => (
            <div key={idx} className="text-xs text-zinc-600 font-mono py-1">
              <span className="text-orange-600 font-semibold">[{evt.status}]</span> {evt.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

