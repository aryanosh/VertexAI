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
import { Layers, ArrowDownRight, TrendingDown } from "lucide-react";
import { usePipeline } from "@/lib/pipeline-context";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export function NoiseReductionChart() {
  const { dashboardMetrics: metrics, dashboardDataLoading: loading, dashboardDataError } = usePipeline();

  // No fallback numbers: if the backend hasn't reported real before/after counts yet
  // (no scan run, or the fields are genuinely null), this renders an explicit empty
  // state below instead of fabricating a chart that looks like a completed scan.
  const hasData = metrics != null && metrics.before_noise != null && metrics.after_noise != null;
  const rawCount = metrics?.before_noise ?? 0;
  const prioritizedCount = metrics?.after_noise ?? 0;

  // Calculate percentage reduction: (raw - prioritized) / raw * 100 rounded to whole number
  const reductionPct = rawCount > 0
    ? Math.round(((rawCount - prioritizedCount) / rawCount) * 100)
    : 0;

  const data = {
    labels: ["Raw Findings", "Prioritized Findings"],
    datasets: [
      {
        label: "Finding Count",
        data: [rawCount, prioritizedCount],
        backgroundColor: [
          "rgba(148, 163, 184, 0.85)", // Slate for Raw
          "rgba(249, 115, 22, 0.9)",   // Brand Orange for Prioritized
        ],
        borderColor: [
          "rgb(100, 116, 139)",
          "rgb(234, 88, 12)",
        ],
        borderWidth: 1.5,
        borderRadius: 8,
        barPercentage: 0.55,
      },
    ],
  };

  const options = {
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
          label: (context: TooltipItem<"bar">) => ` ${context.parsed.y} findings`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            family: "IBM Plex Mono, monospace",
            size: 11,
            weight: 600 as const,
          },
          color: "#475569",
        },
      },
      y: {
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
    },
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm font-sans">
      {/* Header with Callout */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-brand border border-orange-200 shadow-2xs">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold text-slate-900">
              Before vs. After Analysis
            </h3>
            <p className="text-xs text-slate-500 font-sans">
              Raw scanner ingestion vs. final prioritized action count
            </p>
          </div>
        </div>

        {/* Reduction Callout Badge */}
        <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 border border-emerald-200">
          <TrendingDown className="h-4 w-4 text-emerald-600" />
          <span className="font-mono text-xs font-bold text-emerald-800">
            {reductionPct}% Noise Reduction
          </span>
        </div>
      </div>

      {/* Primary Chart Area */}
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
            No scan data yet — run a scan to see noise reduction
          </div>
        ) : (
          <Bar data={data} options={options} />
        )}
      </div>

      {/* Summary Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-mono text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          <span>Raw Ingested: <strong className="text-slate-900">{rawCount}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" />
          <span>Prioritized Findings: <strong className="text-brand">{prioritizedCount}</strong></span>
        </div>
      </div>
    </div>
  );
}
