'use client';

/**
 * FlowViewCanvas — Pipeline Flow Network Graph
 *
 * Responsibility (Team 3, Dev 5):
 *   Visual network graph representing the 4-agent pipeline and its asset
 *   relationships. Animated with Anime.js. Each node represents an agent
 *   stage; edges represent data flow. Node states reflect the current
 *   PipelineStatus: RUNNING, WAITING_FOR_HUMAN, COMPLETED, STOPPED, FAILED.
 *
 * Data source: GET /api/scans/{id} → ScanJob (stage, status)
 * WebSocket:   ws://localhost:8080/ws/pipeline → WebSocketMessage (live updates)
 *
 * TODO (Dev 5):
 *   - Render SVG/Canvas network nodes for each pipeline stage (Agent 1–4)
 *   - Animate node transitions using Anime.js (animejs)
 *   - Color-code nodes by PipelineStatus
 *   - Display HITL checkpoint badges at WAITING_FOR_HUMAN stages
 *   - Accept WebSocketMessage updates to update node state in real time
 */

import type { ScanJob, WebSocketMessage } from '@/types/contracts';

interface FlowViewCanvasProps {
  scanJob?: ScanJob | null;
  liveEvent?: WebSocketMessage | null;
}

export default function FlowViewCanvas({ scanJob: _scanJob, liveEvent: _liveEvent }: FlowViewCanvasProps) {
  // TODO: implement pipeline flow network graph with Anime.js animations
  return (
    <div className="flex items-center justify-center w-full h-64 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300">
      <p className="text-gray-500 text-sm">
        FlowViewCanvas — Pipeline Network Graph (TODO)
      </p>
    </div>
  );
}
