"use client";
import { useEffect, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { MOCK_DASHBOARD } from "../mocks/data";
import { useAuth } from "./AuthProvider";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface DashboardData {
  security_score: number;
  open_incidents: number;
  auto_resolution_pct: number;
  ai_confidence_pct: number;
  before_noise: number;
  after_noise: number;
  top_threats: { name: string; pct: number; color: string }[];
  infrastructure: { name: string; pct: number; count: number | null }[];
  ai_insights: { label: string; value: string }[];
  automation: { playbooks_executed: number; auto_resolved_pct: number; active: boolean };
}

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 1400;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  return <span>{value}{suffix}</span>;
}

function CircularGauge({ score }: { score: number }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 1400;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [score]);

  const offset = circ - (displayed / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#21262f" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.05s linear", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-white">{displayed}</span>
        <span style={{ color: "#6b7280", fontSize: 12 }}>/100</span>
        <span style={{ color, fontSize: 11, fontWeight: 600, marginTop: 2 }}>
          {score >= 80 ? "Excellent" : score >= 60 ? "Good" : "At Risk"}
        </span>
      </div>
    </div>
  );
}

export function MetricsGauge() {
  const { apiFetch, token } = useAuth();
  const [data, setData] = useState<DashboardData>(MOCK_DASHBOARD as DashboardData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    apiFetch(`/api/dashboard`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => {
        // Merge live backend metrics over defaults so panels that rely on
        // fields the backend does not provide keep rendering.
        setData((prev) => ({
          ...prev,
          security_score: typeof d.security_score === "number" ? d.security_score : prev.security_score,
          before_noise: typeof d.before_noise === "number" ? d.before_noise : prev.before_noise,
          after_noise: typeof d.after_noise === "number" ? d.after_noise : prev.after_noise,
          open_incidents: typeof d.active_findings === "number" ? d.active_findings : prev.open_incidents,
        }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, apiFetch]);

  const noiseChartData = {
    labels: ["Before AI", "After AI"],
    datasets: [
      {
        label: "Findings",
        data: [data.before_noise, data.after_noise],
        backgroundColor: ["rgba(239,68,68,0.6)", "rgba(34,197,94,0.6)"],
        borderColor: ["#ef4444", "#22c55e"],
        borderWidth: 1.5,
        borderRadius: 6,
      },
    ],
  };

  const noiseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: (ctx: TooltipItem<"bar">) => ` ${ctx.parsed.y} findings`
    }}},
    scales: {
      x: { ticks: { color: "#6b7280", font: { size: 11 } }, grid: { display: false }, border: { display: false } },
      y: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" }, border: { display: false } },
    },
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full" style={{ color: "#6b7280" }}>Loading metrics…</div>;
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Security Score */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Security Score
          </span>
          <span style={{ color: "#22c55e", fontSize: 11 }}>↑ +2 pts vs yesterday</span>
        </div>
        <div className="flex flex-col gap-6 mt-2">
          <div className="flex justify-center">
            <CircularGauge score={data.security_score} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Open Incidents */}
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 12, border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Open Incidents</div>
              <div className="text-2xl font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>
                <AnimatedNumber target={data.open_incidents} />
              </div>
              <div className="flex flex-col gap-1.5 mt-2">
                <span className="badge w-fit" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 10 }}>● High · 1</span>
                <span className="badge w-fit" style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", fontSize: 10 }}>● Med · 1</span>
              </div>
            </div>
            {/* Auto Resolution */}
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 12, border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Auto Resolve</div>
              <div className="text-2xl font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>
                <AnimatedNumber target={data.auto_resolution_pct} suffix="%" />
              </div>
              <div style={{ color: "#22c55e", fontSize: 11, marginTop: 6, fontWeight: 500 }}>↑ 3% vs 24h</div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Confidence */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Confidence</div>
        <div className="text-xl font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>
          <AnimatedNumber target={data.ai_confidence_pct} suffix="%" />
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>AI model confidence high</div>
      </div>

      {/* Noise Reduction Chart */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
          Before / After Noise Reduction
        </div>
        <div style={{ height: 90 }}>
          <Bar data={noiseChartData} options={noiseChartOptions} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{data.before_noise} raw findings</span>
          <span style={{ color: "#22c55e", fontSize: 11 }}>→ {data.after_noise} canonical</span>
        </div>
      </div>
    </div>
  );
}
