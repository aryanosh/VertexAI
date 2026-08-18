"use client";
import { useEffect, useRef, useState } from "react";

interface Node {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  icon: string;
  status: "healthy" | "threat" | "critical" | "ai";
  size?: number;
}

interface Edge {
  from: string;
  to: string;
  type: "healthy" | "threat" | "ai";
}

const NODES: Node[] = [
  { id: "internet",       label: "Internet",       sublabel: "5.4M events", x: 80,  y: 200, icon: "🌐", status: "threat",  size: 52 },
  { id: "firewall",       label: "Firewall",        sublabel: "2 Monitors",  x: 240, y: 200, icon: "🛡",  status: "threat",  size: 52 },
  { id: "identity",       label: "Identity",        sublabel: "1.9M events", x: 400, y: 200, icon: "👤", status: "healthy", size: 52 },
  { id: "cloud",          label: "Cloud Services",  sublabel: "Healthy",     x: 540, y: 110, icon: "☁️", status: "healthy", size: 56 },
  { id: "applications",   label: "Applications",    sublabel: "Healthy",     x: 540, y: 290, icon: "⚙️", status: "healthy", size: 52 },
  { id: "critical_assets",label: "Critical Assets", sublabel: "Protected",   x: 700, y: 200, icon: "🔒", status: "ai",      size: 58 },
];

const EDGES: Edge[] = [
  { from: "internet",     to: "firewall",        type: "threat"  },
  { from: "firewall",     to: "identity",        type: "threat"  },
  { from: "identity",     to: "cloud",           type: "healthy" },
  { from: "identity",     to: "applications",    type: "healthy" },
  { from: "cloud",        to: "critical_assets", type: "ai"      },
  { from: "applications", to: "critical_assets", type: "healthy" },
];

const STATUS_COLORS = {
  healthy: "#22c55e",
  threat:  "#ef4444",
  critical:"#f97316",
  ai:      "#06b6d4",
};

const EDGE_COLORS = {
  healthy: "#22c55e",
  threat:  "#ef4444",
  ai:      "#06b6d4",
};

function nodeById(id: string): Node {
  return NODES.find((n) => n.id === id)!;
}

export function FlowViewCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [dashOffset, setDashOffset] = useState(0);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    let offset = 0;
    const animate = () => {
      offset -= 0.4;
      setDashOffset(offset);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const getPath = (from: Node, to: Node) => {
    const mx = (from.x + to.x) / 2;
    const dy = to.y - from.y;
    const cy = dy !== 0 ? (from.y + to.y) / 2 - Math.abs(dy) * 0.3 : from.y - 30;
    return `M ${from.x} ${from.y} Q ${mx} ${cy} ${to.x} ${to.y}`;
  };

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        className="w-full h-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-teal">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {EDGES.map((edge) => {
          const from = nodeById(edge.from);
          const to   = nodeById(edge.to);
          const key  = `${edge.from}-${edge.to}`;
          const color = EDGE_COLORS[edge.type];
          const isHovered = hoveredEdge === key;
          const path = getPath(from, to);

          return (
            <g key={key}>
              {/* Hit area */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredEdge(key)}
                onMouseLeave={() => setHoveredEdge(null)}
              />
              {/* Glow track */}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 3 : 1.5}
                strokeOpacity={isHovered ? 0.4 : 0.15}
                strokeDasharray="none"
              />
              {/* Animated dashes */}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.8}
                strokeDasharray="8 6"
                strokeDashoffset={dashOffset}
                strokeOpacity={isHovered ? 1 : 0.7}
                filter={edge.type === "threat" ? "url(#glow-red)" : edge.type === "ai" ? "url(#glow-teal)" : "url(#glow-green)"}
              />
              {/* Hover label */}
              {isHovered && (
                <text
                  x={(from.x + to.x) / 2}
                  y={Math.min(from.y, to.y) - 18}
                  textAnchor="middle"
                  fill={color}
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {edge.type === "threat" ? "Threat Flow" : edge.type === "ai" ? "AI Containment" : "Healthy"}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const color = STATUS_COLORS[node.status];
          const r = (node.size || 52) / 2;
          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              {/* Outer glow ring */}
              <circle
                r={r + 8}
                fill="none"
                stroke={color}
                strokeWidth={1}
                strokeOpacity={0.2}
              />
              {/* Main circle */}
              <circle
                r={r}
                fill="#111318"
                stroke={color}
                strokeWidth={node.status === "ai" ? 2.5 : 1.5}
                strokeOpacity={node.status === "ai" ? 1 : 0.8}
              />
              {/* Icon */}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                y={-4}
                fontSize={node.status === "ai" ? "20" : "18"}
              >
                {node.icon}
              </text>
              {/* Label */}
              <text
                textAnchor="middle"
                y={r + 16}
                fill="#f1f5f9"
                fontSize="11"
                fontWeight="600"
                fontFamily="Inter, sans-serif"
              >
                {node.label}
              </text>
              {/* Sublabel */}
              {node.sublabel && (
                <text
                  textAnchor="middle"
                  y={r + 30}
                  fill="#6b7280"
                  fontSize="9.5"
                  fontFamily="Inter, sans-serif"
                >
                  {node.sublabel}
                </text>
              )}
              {/* Status dot */}
              <circle
                cx={r - 4}
                cy={-r + 4}
                r={5}
                fill={color}
                opacity={0.9}
              />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 px-2">
        {[
          { color: "#22c55e", label: "Healthy" },
          { color: "#ef4444", label: "Threat Flow" },
          { color: "#f97316", label: "Critical" },
          { color: "#06b6d4", label: "AI Containment" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="w-6 h-0.5 rounded-full"
              style={{ background: item.color, boxShadow: `0 0 4px ${item.color}` }}
            />
            <span style={{ color: "#6b7280", fontSize: 11 }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
