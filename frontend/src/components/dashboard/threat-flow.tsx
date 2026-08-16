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
  { id: "firewall", icon: ShieldCheck, label: "Firewall", sub: "2 Monitors", x: 240, y: 210, tone: "alert" },
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
  const size = node.size ?? 68
  const toneRing =
    node.tone === "alert"
      ? "border-brand ring-4 ring-brand/15"
      : "border-slate-200"
  const toneBg =
    node.tone === "healthy" || node.tone === "protected"
      ? "bg-emerald-50/70"
      : "bg-white"

  return (
    <div
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: pct(node.x, VW), top: pct(node.y, VH) }}
    >
      {node.tone === "protected" && (
        <span className="absolute -z-10 h-24 w-24 rounded-full bg-emerald-400/25 blur-xl" />
      )}
      <div
        className={`flex items-center justify-center rounded-full border ${toneRing} ${toneBg} shadow-sm ${
          node.tone === "alert" ? "node-pulse" : ""
        }`}
        style={{ width: size, height: size }}
      >
        <Icon
          className={
            node.tone === "alert"
              ? "text-brand"
              : node.tone === "healthy" || node.tone === "protected"
                ? "text-emerald-600"
                : "text-slate-500"
          }
          style={{ width: size * 0.4, height: size * 0.4 }}
          strokeWidth={1.75}
        />
      </div>
      <div className="mt-2 whitespace-pre text-center">
        <p className="text-[13px] font-medium leading-tight text-slate-700">
          {node.label}
        </p>
        {node.sub && (
          <p
            className={
              "font-mono text-[11px] " +
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

function Tooltip({
  x,
  y,
  title,
  value,
  tone,
}: {
  x: number
  y: number
  title: string
  value: string
  tone: "orange" | "green"
}) {
  return (
    <div
      className="float-in absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center shadow-md"
      style={{ left: pct(x, VW), top: pct(y, VH) }}
    >
      <p
        className={
          "font-mono text-[12px] font-medium " +
          (tone === "orange" ? "text-brand" : "text-emerald-600")
        }
      >
        {title}
      </p>
      <p className="font-mono text-[11px] text-slate-400">{value}</p>
    </div>
  )
}

export function ThreatFlow() {
  return (
    <div className="relative h-[460px] w-full">
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

      <Tooltip
        x={240}
        y={150}
        title="Credential Stuffing"
        value="91% Confidence"
        tone="orange"
      />
      <Tooltip
        x={760}
        y={72}
        title="AI Containment"
        value="94% Effective"
        tone="green"
      />
    </div>
  )
}
