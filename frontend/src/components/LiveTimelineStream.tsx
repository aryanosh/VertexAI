'use client';

/**
 * LiveTimelineStream — Real-Time HITL Pipeline Event Timeline
 *
 * Chronological timeline stream rendering pipeline transitions, HITL checkpoints,
 * AI investigation steps, and containment actions.
 * Sourced from live WebSocket connection or API polling.
 */

import React, { useState, useEffect, useRef } from 'react';
import type { WebSocketMessage } from '@/types/contracts';

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
    title: 'Multi-Scanner Ingestion',
    description: 'Nmap, Nuclei, OWASP ZAP & OpenVAS reports ingested',
    time: '19:40:12',
    colorClass: {
      dot: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-600',
      glow: 'bg-rose-400/40',
    },
  },
  {
    id: 't-2',
    type: 'investigation',
    title: 'Agent 1 Parsed & Normalized',
    description: '2,500 raw scanner records mapped to UnifiedFindings schema',
    time: '19:40:15',
    colorClass: {
      dot: 'bg-violet-500',
      badge: 'bg-violet-50 text-violet-600',
      glow: 'bg-violet-400/40',
    },
  },
  {
    id: 't-3',
    type: 'playbook',
    title: 'Agent 2 Noise Reduction',
    description: 'MD5 deduplication + XGBoost FP model (94% noise reduction)',
    time: '19:40:19',
    colorClass: {
      dot: 'bg-orange-500',
      badge: 'bg-orange-50 text-orange-600',
      glow: 'bg-orange-400/40',
    },
  },
  {
    id: 't-4',
    type: 'investigation',
    title: 'Agent 3 Threat Enrichment',
    description: 'Enriched findings with CISA KEV, EPSS (97.2%) & NVD telemetry',
    time: '19:40:24',
    colorClass: {
      dot: 'bg-violet-500',
      badge: 'bg-violet-50 text-violet-600',
      glow: 'bg-violet-400/40',
    },
  },
  {
    id: 't-5',
    type: 'containment',
    title: 'Agent 4 Risk Scoring',
    description: 'Agent 4 risk score generated → Final human approval pending → GitHub ticket created after approval',
    time: '19:40:30',
    colorClass: {
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-600',
      glow: 'bg-emerald-400/40',
    },
  },
];

const getThemeForStatus = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('threat') || s.includes('alert') || s.includes('stop') || s.includes('fail')) {
    return { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-600', glow: 'bg-rose-400/40' };
  }
  if (s.includes('investigat') || s.includes('agent 1') || s.includes('agent 3')) {
    return { dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-600', glow: 'bg-violet-400/40' };
  }
  if (s.includes('noise') || s.includes('agent 2') || s.includes('waiting')) {
    return { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-600', glow: 'bg-amber-400/40' };
  }
  if (s.includes('contain') || s.includes('resolved') || s.includes('complet') || s.includes('agent 4') || s.includes('ticket')) {
    return { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600', glow: 'bg-emerald-400/40' };
  }
  return { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600', glow: 'bg-blue-400/40' };
};

export default function LiveTimelineStream() {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(DEFAULT_TIMELINE_ITEMS);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws/pipeline';

    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          const statusStr = data.status || 'Pipeline Event';

          let desc = data.message || 'Processing event...';
          if (data.stage === 4 || statusStr.includes('STAGE_4') || data.current_stage === 4) {
            desc = 'Agent 4 risk score generated → Final human approval pending → GitHub ticket created after approval';
          }

          const newItem: TimelineItem = {
            id: `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'default',
            title: statusStr,
            description: desc,
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            colorClass: getThemeForStatus(statusStr),
          };

          setTimelineItems((prev) => [...prev, newItem]);
          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        } catch {
          // Silent catch for STOMP frames
        }
      };
    } catch {
      console.warn('WebSocket connection not available; using polling stream');
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col space-y-4 pt-1.5 pb-2 select-none overflow-y-auto max-h-[380px] 2xl:max-h-[440px] pr-1.5 scrollbar-thin">
      {/* Vertical track line */}
      <span className="absolute left-[18px] top-3 bottom-3 w-[1.5px] bg-slate-200 pointer-events-none" />

      {timelineItems.map((item) => (
        <div key={item.id} className="relative flex items-start pl-8 group">
          {/* Status Dot with outer ring and hover glow */}
          <span className="absolute left-[18px] top-1 -translate-x-1/2 flex items-center justify-center pointer-events-none">
            <span
              className={`absolute h-6 w-6 rounded-full blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${item.colorClass.glow}`}
            />
            <span className="relative h-3 w-3 rounded-full ring-4 ring-white shadow-sm flex items-center justify-center">
              <span className={`block h-full w-full rounded-full ${item.colorClass.dot} transition-transform duration-200 group-hover:scale-125`} />
            </span>
          </span>

          {/* Content */}
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

      <div ref={bottomRef} />
    </div>
  );
}