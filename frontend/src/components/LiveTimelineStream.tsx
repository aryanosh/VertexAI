'use client';

/**
 * LiveTimelineStream — Real-Time HITL Pipeline Event Timeline
 *
 * Chronological timeline stream rendering pipeline transitions, HITL checkpoints,
 * AI investigation steps, and containment actions via live WebSocket connection.
 */

import React, { useState, useEffect, useRef } from 'react';
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
  type: 'threat' | 'investigation' | 'playbook' | 'containment' | 'resolved' | 'default';
  title: string;
  description: string;
  time: string;
  colorClass: {
    dot: string;
    badge: string;
    glow: string;
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
      dot: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-600',
      glow: 'bg-rose-400/40',
    },
  },
  {
    id: 't-2',
    type: 'investigation',
    title: 'AI Investigation',
    description: 'Analyzing 214 behavioral signals',
    time: '09:23:14',
    colorClass: {
      dot: 'bg-violet-500',
      badge: 'bg-violet-50 text-violet-600',
      glow: 'bg-violet-400/40',
    },
  },
  {
    id: 't-3',
    type: 'playbook',
    title: 'Playbook Started',
    description: 'SOC-Auto-04 initiated',
    time: '09:23:18',
    colorClass: {
      dot: 'bg-orange-500',
      badge: 'bg-orange-50 text-orange-600',
      glow: 'bg-orange-400/40',
    },
  },
  {
    id: 't-4',
    type: 'containment',
    title: 'Threat Contained',
    description: 'Traffic blocked at edge layer',
    time: '09:23:22',
    colorClass: {
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-600',
      glow: 'bg-emerald-400/40',
    },
  },
  {
    id: 't-5',
    type: 'resolved',
    title: 'Resolved',
    description: 'Incident closed · 49s response',
    time: '09:24:01',
    colorClass: {
      dot: 'bg-green-500',
      badge: 'bg-green-50 text-green-600',
      glow: 'bg-green-400/40',
    },
  },
];

// Helper to map backend WebSocket status strings to UI colors
const getThemeForStatus = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('threat') || s.includes('alert')) {
    return { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-600', glow: 'bg-rose-400/40' };
  }
  if (s.includes('investigat')) {
    return { dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-600', glow: 'bg-violet-400/40' };
  }
  if (s.includes('playbook')) {
    return { dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-600', glow: 'bg-orange-400/40' };
  }
  if (s.includes('contain') || s.includes('resolved') || s.includes('success')) {
    return { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600', glow: 'bg-emerald-400/40' };
  }
  return { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600', glow: 'bg-blue-400/40' };
};

export default function LiveTimelineStream({
  scanJob: _scanJob,
  events: _propEvents = [],
  onContinue: _onContinue,
  onStop: _onStop,
  onApprove: _onApprove,
}: LiveTimelineStreamProps) {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(DEFAULT_TIMELINE_ITEMS);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws/pipeline';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        
        const newItem: TimelineItem = {
          id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'default',
          title: data.status || 'System Update',
          description: data.message || 'Processing event...',
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          colorClass: getThemeForStatus(data.status || ''),
        };

        setTimelineItems((prev) => [...prev, newItem]);
        
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);

      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col space-y-4 pt-1.5 pb-2 select-none overflow-y-auto max-h-[380px] 2xl:max-h-[440px] pr-1.5 scrollbar-thin">
      {/* Timeline track vertical line */}
      <span className="absolute left-[18px] top-3 bottom-3 w-[1.5px] bg-slate-200 pointer-events-none" />

      {timelineItems.map((item) => (
        <div key={item.id} className="relative flex items-start pl-8 group">
          {/* Status Dot with outer ring and hover glow */}
          <span className="absolute left-[18px] top-1 -translate-x-1/2 flex items-center justify-center pointer-events-none">
            {/* Ambient blur glow on hover */}
            <span
              className={`absolute h-6 w-6 rounded-full blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${item.colorClass.glow}`}
            />
            {/* Dot & white ring */}
            <span className="relative h-3 w-3 rounded-full ring-4 ring-white shadow-sm flex items-center justify-center">
              <span className={`block h-full w-full rounded-full ${item.colorClass.dot} transition-transform duration-200 group-hover:scale-125`} />
            </span>
          </span>

          {/* Timeline Content */}
          <div className="flex-1 min-w-0">
            <span
              className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11px] font-medium leading-none ${item.colorClass.badge}`}
            >
              {item.title}
            </span>
            <p className="mt-1.5 text-xs 2xl:text-[13px] leading-snug text-slate-700 break-words font-sans">
              {item.description}
            </p>
            <p className="mt-0.5 font-mono text-[10px] 2xl:text-[11px] text-slate-400">
              {item.time}
            </p>
          </div>
        </div>
      ))}

      {/* Auto-scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}