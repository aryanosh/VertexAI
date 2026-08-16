'use client';

/**
 * MetricsGauge — Security Score & Metrics Dashboard Gauge
 *
 * Responsibility (Team 3, Dev 5):
 *   Renders the aggregate security score (0–100) and key pipeline metrics
 *   as Chart.js gauge/doughnut charts. Values are sourced from the live
 *   GET /api/dashboard API — never hardcoded.
 *
 * Data source: GET /api/dashboard → DashboardMetrics
 *   - security_score      → primary gauge
 *   - noise_reduction_rate → secondary gauge
 *   - active_findings / suppressed_findings → breakdown ring
 *
 * Metrics verified from live API per integration_plan.md §7:
 *   "Verification metrics (94% noise reduction, 96/100 score, 15 findings)
 *    are rendered from live API values only — never hardcoded in the UI."
 *
 * TODO (Dev 5):
 *   - Import Chart.js and react-chartjs-2
 *   - Register Chart.js components (DoughnutController, ArcElement, Tooltip, Legend)
 *   - Render a Doughnut gauge for security_score
 *   - Render noise_reduction_rate and findings breakdown
 *   - Animate gauge fill on data load
 */

import type { DashboardMetrics } from '@/types/contracts';

interface MetricsGaugeProps {
  metrics?: DashboardMetrics | null;
}

export default function MetricsGauge({ metrics: _metrics }: MetricsGaugeProps) {
  // TODO: implement Chart.js gauge visualization for security_score and noise_reduction_rate
  return (
    <div className="flex items-center justify-center w-full h-48 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300">
      <p className="text-gray-500 text-sm">
        MetricsGauge — Security Score &amp; Metrics (TODO)
      </p>
    </div>
  );
}
