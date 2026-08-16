'use client';

import { useState, useEffect } from "react";
import { Cloud, Monitor, Server, Database, CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Item = {
  icon: LucideIcon;
  name: string;
  count?: string;
  value: number;
  bar: string;
  text: string;
};

const DEFAULT_ITEMS: Item[] = [
  { icon: Cloud, name: "Cloud Services", value: 99, bar: "bg-emerald-500", text: "text-emerald-600" },
  { icon: Monitor, name: "Endpoints", count: "4,692", value: 97, bar: "bg-emerald-500", text: "text-emerald-600" },
  { icon: Server, name: "Servers", count: "128", value: 99, bar: "bg-emerald-500", text: "text-emerald-600" },
  { icon: Database, name: "Databases", count: "56", value: 97, bar: "bg-amber-400", text: "text-amber-600" },
];

export function Infrastructure() {
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [uptime, setUptime] = useState<string>("99.6%");

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (data?.infrastructure && Array.isArray(data.infrastructure)) {
          const updatedItems = DEFAULT_ITEMS.map((defaultItem, index) => {
            const apiItem = data.infrastructure[index];
            if (apiItem) {
              return { 
                ...defaultItem, 
                value: apiItem.status ?? defaultItem.value,
                count: apiItem.count ? apiItem.count.toLocaleString() : defaultItem.count 
              };
            }
            return defaultItem;
          });
          setItems(updatedItems);
          
          if (data.overallUptime) {
             setUptime(`${data.overallUptime}%`);
          }
        }
      } catch (err) {
        console.error("Failed to fetch infrastructure metrics", err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 2xl:p-3.5 shadow-sm">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-mono text-xs 2xl:text-sm font-semibold text-slate-800">
          Infrastructure
        </h3>
        <span className="flex items-center gap-1 font-mono text-[10px] 2xl:text-xs text-emerald-600">
          <CircleCheck className="h-3 w-3 2xl:h-3.5 2xl:w-3.5" />
          All Healthy
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
          Overall Uptime
        </span>
        <span className="font-mono text-xs 2xl:text-sm font-bold text-emerald-600 transition-all duration-500">
          {uptime}
        </span>
      </div>
    </section>
  );
}