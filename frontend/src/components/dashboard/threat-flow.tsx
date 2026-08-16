"use client"

import {
  Globe,
  ShieldCheck,
  User,
  Cloud,
  LayoutGrid,
  Lock,
  type LucideIcon,
} from "lucide-react"

const VW = 900
const VH = 420

type Node = {
  id: string
  icon: LucideIcon
  label: string
  sub?: string
  x: number
  y: number
  tone: "neutral" | "healthy" | "alert" | "protected"
  size?: number
}

const NODES: Node[] = [
  { id: "internet", icon: Globe, label: "Internet", sub: "5.4M events", x: 70, y: 210, tone: "neutral" },
  { id: "firewall", icon: ShieldCheck, label: "Firewall", sub: "2 Monitors", x: 240, y: 210, tone: "neutral" },
  { id: "identity", icon: User, label: "Identity", sub: "1.9M events", x: 410, y: 210, tone: "neutral" },
  { id: "cloud", icon: Cloud, label: "Cloud\nServices", sub: "Healthy", x: 650, y: 110, tone: "healthy", size: 76 },
  { id: "apps", icon: LayoutGrid, label: "Applications", sub: "Healthy", x: 650, y: 310, tone: "healthy", size: 76 },
  { id: "critical", icon: Lock, label: "Critical\nAssets", sub: "Protected", x: 830, y: 210, tone: "protected", size: 76 },
]

const PATHS: { d: string; color: "orange" | "green" }[] = [
  { d: "M70,210 C 120,180 190,240 240,210 S 350,240 410,210", color: "orange" },
  { d: "M410,210 C 500,210 560,110 650,110", color: "orange" },
  { d: "M410,210 C 500,210 560,310 650,310", color: "green" },
  { d: "M650,110 C 740,110 780,210 830,210", color: "green" },
  { d: "M650,310 C 740,310 780,210 830,210", color: "green" },
]

const COLORS = { orange: "#e8613c", green: "#10b981" }

function pct(v: number, total: number) {
  return `${(v / total) * 100}%`
}

function NodeCircle({ node }: { node: Node }) {
  const Icon = node.icon
  const size = node.size ? Math.min(node.size, 60) : 50

  const toneBorder =
    node.tone === "alert"
      ? "border-brand/40 group-hover:border-brand"
      : node.tone === "healthy" || node.tone === "protected"
        ? "border-emerald-300 group-hover:border-emerald-500"
        : "border-slate-200 group-hover:border-slate-400"

  const toneBg =
    node.tone === "healthy" || node.tone === "protected"
      ? "bg-emerald-50"
      : "bg-white"

  const hoverRing =
    node.tone === "alert"
      ? "group-hover:ring-4 group-hover:ring-brand/25 group-hover:shadow-[0_0_22px_rgba(232,97,60,0.45)]"
      : node.tone === "healthy" || node.tone === "protected"
        ? "group-hover:ring-4 group-hover:ring-emerald-500/25 group-hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
        : "group-hover:ring-4 group-hover:ring-slate-400/25 group-hover:shadow-[0_0_20px_rgba(100,116,139,0.35)]"

  const hoverGlow =
    node.tone === "alert"
      ? "bg-brand/35"
      : node.tone === "healthy" || node.tone === "protected"
        ? "bg-emerald-400/35"
        : "bg-slate-400/25"

  return (
    <div
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center pointer-events-auto"
      style={{ left: pct(node.x, VW), top: pct(node.y, VH) }}
    >
      {/* Soft ambient glow appearing smoothly only on hover */}
      <span
        className={`absolute -z-10 h-20 w-20 rounded-full blur-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${hoverGlow}`}
      />

      <div
        className={`flex items-center justify-center rounded-full border ${toneBorder} ${toneBg} shadow-sm transition-all duration-300 group-hover:scale-105 ${hoverRing}`}
        style={{ width: size, height: size }}
      >
        <Icon
          className={`transition-colors duration-200 ${
            node.tone === "alert"
              ? "text-brand"
              : node.tone === "healthy" || node.tone === "protected"
                ? "text-emerald-600"
                : "text-slate-500 group-hover:text-slate-800"
          }`}
          style={{ width: size * 0.42, height: size * 0.42 }}
          strokeWidth={1.75}
        />
      </div>
      <div className="mt-1 whitespace-pre text-center transition-transform duration-200 group-hover:translate-y-0.5">
        <p className="text-[11px] 2xl:text-[12px] font-medium leading-tight text-slate-700">
          {node.label}
        </p>
        {node.sub && (
          <p
            className={
              "font-mono text-[9px] 2xl:text-[10px] " +
              (node.tone === "healthy" || node.tone === "protected"
                ? "text-emerald-500"
                : "text-slate-400")
            }
          >
            {node.sub}
          </p>
        )}
      </div>
    </div>
  )
}

export function ThreatFlow() {
  return (
    <div className="relative flex-1 min-h-[160px] w-full my-auto flex items-center justify-center">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {PATHS.map((p, i) => (
          <g key={i}>
            <path
              d={p.d}
              fill="none"
              stroke={COLORS[p.color]}
              strokeOpacity={0.18}
              strokeWidth={2}
            />
            <path
              d={p.d}
              fill="none"
              stroke={COLORS[p.color]}
              strokeWidth={2}
              strokeLinecap="round"
              className="flow-line"
            />
          </g>
        ))}
        {/* junction dots */}
        <circle cx="410" cy="210" r="5" fill={COLORS.orange} />
        <circle cx="650" cy="110" r="4" fill={COLORS.green} />
        <circle cx="650" cy="310" r="4" fill={COLORS.green} />
      </svg>

      {NODES.map((n) => (
        <NodeCircle key={n.id} node={n} />
      ))}
    </div>
  )
}
