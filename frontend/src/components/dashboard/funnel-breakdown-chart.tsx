'use client';

import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Filter } from "lucide-react";
import { usePipeline } from "@/lib/pipeline-context";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export function FunnelBreakdownChart() {
  const { dashboardMetrics: metrics, dashboardDataLoading: loading, dashboardDataError } = usePipeline();

  // No fallback numbers — an explicit empty state renders below when there's no real data.
  const hasData = metrics != null && metrics.before_noise != null && metrics.after_noise != null;
  const rawCount = metrics?.before_noise ?? 0;
  const dedupCount = metrics?.after_noise ?? 0;
  const suppressedCount = metrics?.suppressed_findings ?? 0;
  const filteredCount = Math.max(0, dedupCount - suppressedCount); // Stage 3: After XGBoost FP Filtering
  const topActionsCount = metrics?.top_threats && metrics.top_threats.length > 0
    ? metrics.top_threats.length
    : Math.min(5, filteredCount); // Stage 4: Top Prioritized Actions

  const data = {
    labels: [
      "1. Raw Ingested (Agent 1)",
      "2. Deduplicated (Agent 2)",
      "3. FP Filtered (XGBoost)",
      "4. Top Action Tickets",
    ],
    datasets: [
      {
        label: "Findings at Stage",
        data: [rawCount, dedupCount, filteredCount, topActionsCount],
        backgroundColor: [
          "rgba(148, 163, 184, 0.8)", // Stage 1: Slate
          "rgba(59, 130, 246, 0.8)",  // Stage 2: Blue
          "rgba(16, 185, 129, 0.85)", // Stage 3: Emerald
          "rgba(249, 115, 22, 0.9)",  // Stage 4: Brand Orange
        ],
        borderColor: [
          "rgb(100, 116, 139)",
          "rgb(37, 99, 235)",
          "rgb(5, 150, 105)",
          "rgb(234, 88, 12)",
        ],
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.65,
      },
    ],
  };

  const options = {
    indexAxis: "y" as const, // Native horizontal bar chart for funnel visual
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleFont: {
          family: "IBM Plex Mono, monospace",
          size: 12,
        },
        bodyFont: {
          family: "IBM Plex Mono, monospace",
          size: 12,
        },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context: TooltipItem<"bar">) => ` ${context.parsed.x} findings`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: "rgba(226, 232, 240, 0.6)",
        },
        ticks: {
          font: {
            family: "IBM Plex Mono, monospace",
            size: 10,
          },
          color: "#64748b",
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            family: "IBM Plex Mono, monospace",
            size: 11,
            weight: 600 as const,
          },
          color: "#334155",
        },
      },
    },
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm font-sans">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shadow-2xs">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold text-slate-900">
              Pipeline Stage Funnel Breakdown
            </h3>
            <p className="text-xs text-slate-500 font-sans">
              Progressive reduction through parsing, deduplication, FP filtering, and scoring
            </p>
          </div>
        </div>

        <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700 border border-slate-200">
          Stage-by-Stage
        </span>
      </div>

      {/* Horizontal Bar Chart Area */}
      <div className="relative my-3 flex-1 w-full min-h-[220px]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : dashboardDataError ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-rose-600 font-mono text-center px-4">
            Failed to load metrics: {dashboardDataError}
          </div>
        ) : !hasData ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 font-mono text-center px-4">
            No scan data yet
          </div>
        ) : (
          <Bar data={data} options={options} />
        )}
      </div>

      {/* Funnel Stage Summary Footer */}
      <div className="grid grid-cols-4 gap-1 border-t border-slate-100 pt-2.5 text-[11px] font-mono text-slate-600 text-center">
        <div className="p-1 rounded bg-slate-50 border border-slate-100">
          <span className="text-slate-400 block text-[10px]">Raw</span>
          <strong className="text-slate-900">{rawCount}</strong>
        </div>
        <div className="p-1 rounded bg-blue-50/60 border border-blue-100">
          <span className="text-blue-500 block text-[10px]">Dedup</span>
          <strong className="text-blue-900">{dedupCount}</strong>
        </div>
        <div className="p-1 rounded bg-emerald-50/60 border border-emerald-100">
          <span className="text-emerald-500 block text-[10px]">Active</span>
          <strong className="text-emerald-900">{filteredCount}</strong>
        </div>
        <div className="p-1 rounded bg-orange-50/60 border border-orange-100">
          <span className="text-orange-500 block text-[10px]">Top Actions</span>
          <strong className="text-brand">{topActionsCount}</strong>
        </div>
      </div>
    </div>
  );
}
