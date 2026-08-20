'use client';

/**
 * LiveTimelineStream — Real-Time HITL Pipeline Event Timeline
 *
 * Chronological timeline stream rendering pipeline transitions, HITL checkpoints,
 * AI investigation steps, and containment actions.
 * Sourced from live WebSocket connection or API polling.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Radio } from 'lucide-react';
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
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Helper to append a timeline item
    const addTimelineEvent = (statusStr: string, stageNum?: number, customDesc?: string) => {
      let desc = customDesc || `Stage ${stageNum ?? ''} updated to ${statusStr}`;
      if (stageNum === 4 || statusStr.includes('STAGE_4')) {
        desc =
          'Agent 4 risk score calculated · Awaiting final human gate approval for GitHub ticket dispatch.';
      }

      const newItem: TimelineItem = {
        id: `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'default',
        title: stageNum ? `Stage ${stageNum}: ${statusStr}` : statusStr,
        description: desc,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        colorClass: getThemeForStatus(statusStr),
      };

      setTimelineItems((prev) => [...prev, newItem]);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };

    // 2. Local window event listener (for instant reactive UI feedback)
    const handleLocalEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ status?: string; stage?: number; message?: string }>;
      if (customEvent.detail) {
        addTimelineEvent(
          customEvent.detail.status || 'Pipeline Event',
          customEvent.detail.stage,
          customEvent.detail.message
        );
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pipeline-event', handleLocalEvent);
    }

    // 3. Spring Boot Raw JSON WebSocket client
    let ws: WebSocket | null = null;
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws/pipeline';

    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const raw = String(event.data);
          let jsonPayload: WebSocketMessage | null = null;

          if (raw.trim().startsWith('{')) {
            jsonPayload = JSON.parse(raw);
          } else if (raw.includes('MESSAGE') && raw.includes('{')) {
            const bodyStart = raw.indexOf('{');
            const bodyEnd = raw.lastIndexOf('}');
            if (bodyStart !== -1 && bodyEnd !== -1) {
              jsonPayload = JSON.parse(raw.substring(bodyStart, bodyEnd + 1));
            }
          }

          if (jsonPayload) {
            const status = jsonPayload.status || 'Pipeline Event';
            const stage = jsonPayload.current_stage || jsonPayload.stage;
            const message = typeof jsonPayload.payload === 'string' ? jsonPayload.payload : jsonPayload.message;

            addTimelineEvent(status, stage, message);

            // Propagate event across all dashboard components globally
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('pipeline-event', {
                  detail: {
                    status,
                    stage,
                    scanId: jsonPayload.scan_id,
                    message,
                    summary: typeof jsonPayload.payload === 'string' ? jsonPayload.payload : undefined,
                  },
                })
              );
            }
          }
        } catch (e) {
          console.warn('[WS] Frame parse error:', e);
        }
      };
    } catch {
      console.warn('WebSocket connection not available; using local stream');
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pipeline-event', handleLocalEvent);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col justify-start select-none overflow-y-auto max-h-[380px] 2xl:max-h-[440px] pr-1.5 scrollbar-thin">
      {timelineItems.length === 0 ? (
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center p-4 text-slate-400 my-auto">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100/80 text-slate-500 mb-2.5 shadow-2xs">
            <Radio className="h-5 w-5 animate-pulse text-brand" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="font-mono text-xs font-semibold text-slate-700">Live Timeline Ready</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-[200px] leading-snug">
            Awaiting scan pipeline events from WebSockets or Supervised Gate executions.
          </p>
        </div>
      ) : (
        <div className="relative w-full flex flex-col space-y-4 pt-1.5 pb-2">
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
      )}
    </div>
  );
}