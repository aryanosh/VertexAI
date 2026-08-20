'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Flame,
  ShieldAlert,
  GitPullRequest,
  CheckCircle2,
  ExternalLink,
  X,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: 'critical' | 'gate' | 'ticket' | 'info';
  title: string;
  message: string;
  time: string;
  unread: boolean;
  link?: string;
}

// Deliberately empty: these used to be permanent, hardcoded sample notifications
// (a specific CVE, a specific composite score, a specific GitHub issue number) shown
// unconditionally on every load, indistinguishable from real pipeline events. The feed
// now only ever contains genuine 'pipeline-event' broadcasts received during this session.
const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

interface NotificationsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNotification?: (item: NotificationItem) => void;
}

export function NotificationsPopover({
  isOpen,
  onClose,
  onSelectNotification,
}: NotificationsPopoverProps) {
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  useEffect(() => {
    const handlePipelineEvent = (e: Event) => {
      const custom = e as CustomEvent<{ status?: string; stage?: number; message?: string }>;
      if (custom.detail) {
        const newItem: NotificationItem = {
          id: `notif-${Date.now()}`,
          type: custom.detail.status?.includes('TICKET')
            ? 'ticket'
            : custom.detail.status?.includes('WAITING')
            ? 'gate'
            : 'info',
          title: `Pipeline: ${custom.detail.status || 'Event'}`,
          message: custom.detail.message || `Stage ${custom.detail.stage} updated.`,
          time: 'Just now',
          unread: true,
        };
        setItems((prev) => [newItem, ...prev.slice(0, 7)]);
      }
    };

    window.addEventListener('pipeline-event', handlePipelineEvent);
    return () => window.removeEventListener('pipeline-event', handlePipelineEvent);
  }, []);

  if (!isOpen) return null;

  const unreadCount = items.filter((i) => i.unread).length;

  const markAllAsRead = () => {
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'critical':
        return <Flame className="h-4 w-4 text-rose-600" />;
      case 'gate':
        return <ShieldAlert className="h-4 w-4 text-amber-600" />;
      case 'ticket':
        return <GitPullRequest className="h-4 w-4 text-emerald-600" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-brand" />;
    }
  };

  return (
    <div className="absolute right-0 top-11 z-50 w-80 2xl:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 px-1">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand" />
          <span className="font-mono text-xs font-bold text-slate-900">
            SOC Alert Feed
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-50 px-1.5 py-0.2 font-mono text-[10px] font-bold text-rose-700">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-slate-800 transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Read All</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="my-2 max-h-80 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
        {items.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400 font-mono">
            No alerts yet — events will appear here as the pipeline runs.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              item.unread = false;
              setItems([...items]);
              onSelectNotification?.(item);
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              item.unread
                ? 'bg-slate-50 border-slate-200/80 shadow-2xs'
                : 'bg-white border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">{getIcon(item.type)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="font-mono text-xs font-bold text-slate-800 truncate">
                    {item.title}
                  </h4>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {item.time}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600 leading-snug break-words">
                  {item.message}
                </p>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-brand hover:underline font-semibold"
                  >
                    <span>View GitHub Issue</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 pt-2 px-1 text-center font-mono text-[10px] text-slate-400">
        Supervised multi-agent event stream active
      </div>
    </div>
  );
}
