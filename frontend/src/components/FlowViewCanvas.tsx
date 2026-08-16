'use client';

/**
 * FlowViewCanvas — Pipeline Flow Network Graph
 *
 * Visual network graph representing the live AI network and asset relationships.
 * Renders nodes, animated flow lines (via Anime.js), active threat indicators, and status legend.
 */

import React, { useState, useEffect, useRef } from 'react';
import { animate, type JSAnimation } from 'animejs';
import type { ScanJob, WebSocketMessage } from '@/types/contracts';

interface FlowViewCanvasProps {
  scanJob?: ScanJob | null;
  liveEvent?: WebSocketMessage | null;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
}

export default function FlowViewCanvas({
  scanJob: _scanJob,
  liveEvent: _liveEvent,
  selectedNodeId: externalSelectedNode,
  onSelectNode,
}: FlowViewCanvasProps) {
  const [internalSelectedNode, setInternalSelectedNode] = useState<string>('firewall');
  const selectedNode = externalSelectedNode ?? internalSelectedNode;

  // Refs for Anime.js targets
  const pathsRef = useRef<(SVGPathElement | null)[]>([]);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const validPaths = pathsRef.current.filter((p): p is SVGPathElement => p !== null);

    // 1. Animate the data flow along the SVG paths
    const flowAnimation = validPaths.length > 0 ? animate(validPaths, {
      strokeDashoffset: [24, 0], // Matches the strokeDasharray cycle
      ease: 'linear',
      duration: 1000,
      loop: true,
    }) : null;

    // 2. Animate the pulsing halo on the active/threat node
    let pulseAnimation: JSAnimation | null = null;
    if (activeNodeRef.current) {
      pulseAnimation = animate(activeNodeRef.current, {
        scale: [1, 1.05, 1],
        boxShadow: [
          '0 0 0 0 rgba(249, 115, 22, 0.4)',
          '0 0 0 15px rgba(249, 115, 22, 0)',
        ],
        ease: 'inOutSine',
        duration: 1500,
        loop: true,
      });
    }

    // Cleanup animations on unmount to prevent memory leaks in strict mode
    return () => {
      flowAnimation?.pause();
      pulseAnimation?.pause();
    };
  }, [selectedNode]);

  const handleNodeClick = (id: string) => {
    setInternalSelectedNode(id);
    onSelectNode?.(id);
  };

  const setPathRef = (index: number) => (el: SVGPathElement | null) => {
    pathsRef.current[index] = el;
  };

  return (
    <div className="relative w-full h-[280px] sm:h-[320px] bg-white rounded-xl flex flex-col justify-between p-4 select-none overflow-hidden">
      {/* SVG Canvas for Connecting Paths */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="threatGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Path 1: Internet to Firewall */}
        <path
          ref={setPathRef(0)}
          d="M 120 145 C 150 145, 175 145, 210 145"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeDasharray="6 6"
        />

        {/* Path 2: Firewall to Identity */}
        <path
          ref={setPathRef(1)}
          d="M 270 145 C 300 145, 325 145, 360 145"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeDasharray="6 6"
        />

        {/* Path 3: Identity to Cloud Services */}
        <path
          ref={setPathRef(2)}
          d="M 420 145 C 470 145, 480 85, 545 85"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeDasharray="6 6"
          className="opacity-75"
        />

        {/* Path 4: Identity to Applications */}
        <path
          ref={setPathRef(3)}
          d="M 420 145 C 470 145, 480 205, 545 205"
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeDasharray="6 6"
          className="opacity-75"
        />

        {/* Path 5: Cloud Services to Critical Assets */}
        <path
          ref={setPathRef(4)}
          d="M 605 85 C 660 85, 680 145, 730 145"
          fill="none"
          stroke="#0d9488"
          strokeWidth="2"
          strokeDasharray="6 6"
        />

        {/* Path 6: Applications to Critical Assets */}
        <path
          ref={setPathRef(5)}
          d="M 605 205 C 660 205, 680 145, 730 145"
          fill="none"
          stroke="#0d9488"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
      </svg>

      {/* Nodes Container */}
      <div className="relative w-full h-full flex items-center justify-between px-2 sm:px-6 z-10">

        {/* Node 1: Internet */}
        <div
          onClick={() => handleNodeClick('internet')}
          className="flex flex-col items-center cursor-pointer group transition-transform duration-200 hover:scale-105"
        >
          <div className="w-14 h-14 rounded-full bg-white border-2 border-zinc-200 flex items-center justify-center shadow-sm group-hover:border-zinc-300">
            <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="1.8" />
              <path strokeWidth="1.5" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </div>
          <span className="mt-2 text-xs font-semibold text-zinc-800">Internet</span>
          <span className="text-[11px] text-zinc-400 font-mono">5.4M events</span>
        </div>

        {/* Node 2: Firewall (Active Threat Indicator) */}
        <div
          onClick={() => handleNodeClick('firewall')}
          className="relative flex flex-col items-center cursor-pointer group"
        >
          {selectedNode === 'firewall' && (
            <div className="absolute -top-12 z-20 flex flex-col items-center animate-bounce duration-1000">
              <div className="bg-[#fff7ed] border border-orange-200 px-2.5 py-1 rounded-md shadow-md flex flex-col items-center whitespace-nowrap">
                <span className="text-[11px] font-bold text-orange-700">Credential Stuffing</span>
                <span className="text-[10px] text-orange-500 font-mono">91% Confidence</span>
              </div>
              <div className="w-2 h-2 bg-[#fff7ed] border-r border-b border-orange-200 transform rotate-45 -mt-1" />
            </div>
          )}

          <div
            ref={selectedNode === 'firewall' ? activeNodeRef : null}
            className={`w-14 h-14 rounded-full flex items-center justify-center relative transition-colors duration-300 ${
              selectedNode === 'firewall'
                ? 'bg-orange-50 border-2 border-orange-500 z-10'
                : 'bg-white border-2 border-zinc-200 group-hover:border-orange-300'
            }`}
          >
            <svg
              className={`w-6 h-6 ${selectedNode === 'firewall' ? 'text-orange-600' : 'text-zinc-600'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="mt-2 text-xs font-semibold text-zinc-800">Firewall</span>
          <span className="text-[11px] text-zinc-400 font-mono">2 Monitors</span>
        </div>

        {/* Node 3: Identity */}
        <div
          onClick={() => handleNodeClick('identity')}
          className="flex flex-col items-center cursor-pointer group transition-transform duration-200 hover:scale-105"
        >
          <div className="w-14 h-14 rounded-full bg-white border-2 border-zinc-200 flex items-center justify-center shadow-sm group-hover:border-zinc-300">
            <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <span className="mt-2 text-xs font-semibold text-zinc-800">Identity</span>
          <span className="text-[11px] text-zinc-400 font-mono">1.9M events</span>
        </div>

        {/* Middle Branch: Cloud Services (Top) & Applications (Bottom) */}
        <div className="flex flex-col justify-between h-56 py-1">
          <div
            onClick={() => handleNodeClick('cloud')}
            className="flex flex-col items-center cursor-pointer group transition-transform duration-200 hover:scale-105"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-50/70 border-2 border-emerald-200/80 flex items-center justify-center shadow-sm group-hover:border-emerald-300">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <span className="mt-1 text-[11px] font-semibold text-zinc-800 text-center leading-tight">Cloud<br />Services</span>
            <span className="text-[10px] text-emerald-600 font-medium">Healthy</span>
          </div>

          <div
            onClick={() => handleNodeClick('applications')}
            className="flex flex-col items-center cursor-pointer group transition-transform duration-200 hover:scale-105"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-50/70 border-2 border-emerald-200/80 flex items-center justify-center shadow-sm group-hover:border-emerald-300">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="1.8" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth="1.8" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth="1.8" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="1.8" />
              </svg>
            </div>
            <span className="mt-1 text-[11px] font-semibold text-zinc-800 text-center leading-tight">Applications</span>
            <span className="text-[10px] text-emerald-600 font-medium">Healthy</span>
          </div>
        </div>

        {/* Node 5: Critical Assets */}
        <div
          onClick={() => handleNodeClick('critical-assets')}
          className="flex flex-col items-center cursor-pointer group transition-transform duration-200 hover:scale-105"
        >
          <div className="w-16 h-16 rounded-full bg-teal-50 ring-8 ring-teal-50/80 border-2 border-teal-500/60 flex items-center justify-center shadow-lg shadow-teal-500/10 group-hover:ring-teal-100">
            <svg className="w-7 h-7 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="1.8" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 11V7a4 4 0 118 0v4" />
            </svg>
          </div>
          <span className="mt-2 text-xs font-semibold text-zinc-800 text-center">Critical<br />Assets</span>
          <span className="text-[11px] text-teal-600 font-medium font-mono">Protected</span>
        </div>

      </div>

      {/* Bottom Status Legend */}
      <div className="flex items-center justify-center gap-6 pt-2 border-t border-zinc-100/80 text-[11px] text-zinc-500 z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-emerald-500 rounded-full inline-block" />
          <span>Healthy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-orange-500 rounded-full inline-block" />
          <span>Threat Flow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-rose-500 rounded-full inline-block" />
          <span>Critical</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-teal-500 rounded-full inline-block" />
          <span>AI Containment</span>
        </div>
      </div>
    </div>
  );
}