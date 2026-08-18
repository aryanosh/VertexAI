'use client';

import { useState, useEffect } from 'react';
import { Cloud, Monitor, Server, Database, CircleCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { Asset } from '@/types/contracts';

type Item = {
  icon: LucideIcon;
  name: string;
  count?: string;
  value: number;
  bar: string;
  text: string;
};

export function Infrastructure() {
  const [items, setItems] = useState<Item[]>([
    { icon: Server, name: 'Production Hosts', count: '1', value: 100, bar: 'bg-emerald-500', text: 'text-emerald-600' },
    { icon: Cloud, name: 'Monitored Endpoints', count: '4', value: 98, bar: 'bg-emerald-500', text: 'text-emerald-600' },
    { icon: Database, name: 'Database Clusters', count: '1', value: 100, bar: 'bg-emerald-500', text: 'text-emerald-600' },
    { icon: Monitor, name: 'Scanner Sandbox', count: '4 active', value: 100, bar: 'bg-emerald-500', text: 'text-emerald-600' },
  ]);
  const [assetCount, setAssetCount] = useState<number>(1);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const assets: Asset[] = await api.getAssets();
        setAssetCount(assets.length);
        if (assets.length > 0) {
          const authCount = assets.filter((a) => a.isAuthorized ?? a.is_authorized ?? true).length;
          setItems([
            {
              icon: Server,
              name: 'Authorized Targets',
              count: `${authCount}/${assets.length}`,
              value: Math.round((authCount / assets.length) * 100),
              bar: 'bg-emerald-500',
              text: 'text-emerald-600',
            },
            {
              icon: Cloud,
              name: 'Primary Host',
              count: assets[0].hostname.slice(0, 16),
              value: 100,
              bar: 'bg-emerald-500',
              text: 'text-emerald-600',
            },
            {
              icon: Database,
              name: 'PostgreSQL 16 (7-Table)',
              count: 'Connected',
              value: 100,
              bar: 'bg-emerald-500',
              text: 'text-emerald-600',
            },
            {
              icon: Monitor,
              name: 'Scanner Sandbox',
              count: 'Isolated',
              value: 100,
              bar: 'bg-emerald-500',
              text: 'text-emerald-600',
            },
          ]);
        }
      } catch (err) {
        console.warn('Failed to fetch infrastructure assets', err);
      }
    };

    fetchAssets();
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          Infrastructure
        </h3>
        <span className="flex items-center gap-1 font-mono text-[10px] 2xl:text-xs text-emerald-600">
          <CircleCheck className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
          {assetCount} Target{assetCount > 1 ? 's' : ''} Ready
        </span>
      </div>

      <div className="my-1 flex-1 min-h-0 flex flex-col justify-around gap-1.5">
        {items.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.name} className="flex items-center gap-2">
              <span className="flex h-6 w-6 2xl:h-7 2xl:w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                <Icon className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs text-slate-700">
                    {t.name}
                    {t.count && (
                      <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                        {t.count}
                      </span>
                    )}
                  </p>
                  <span className={`font-mono text-xs font-medium ${t.text}`}>
                    {t.value}%
                  </span>
                </div>
                <div className="mt-1 h-1 2xl:h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`bar-grow h-full rounded-full ${t.bar} transition-all duration-1000 ease-out`}
                    style={{ width: `${t.value}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex items-center justify-between border-t border-slate-100 pt-1.5">
        <span className="font-mono text-xs font-medium text-slate-600">
          Backend Service
        </span>
        <span className="font-mono text-xs 2xl:text-sm font-bold text-emerald-600 transition-all duration-500">
          Spring Boot 3
        </span>
      </div>
    </section>
  );
}