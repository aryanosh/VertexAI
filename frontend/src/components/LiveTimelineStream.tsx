'use client';

/**
 * LiveTimelineStream — Real-Time HITL Pipeline Event Timeline
 *
 * Responsibility (Team 3, Dev 5 / Dev 6):
 *   Subscribes to ws://localhost:8080/ws/pipeline and renders a chronological
 *   timeline of pipeline stage transitions and HITL checkpoint events.
 *
 * Required timeline entry text (verbatim, per integration_plan.md §7):
 *   "Agent 4 risk score generated → Final human approval pending →
 *    GitHub ticket created after approval"
 *
 * CRITICAL RULE (integration_plan.md §7):
 *   The dashboard must NEVER display a ticket as created prior to explicit
 *   Final Human Approval succeeding. The timeline entry after Agent 4 must
 *   show the above verbatim text until POST /api/vulnerabilities/{id}/ticket
 *   returns { status: 'COMPLETED' }.
 *
 * Data source: ws://localhost:8080/ws/pipeline → WebSocketMessage
 * Fallback:    Poll GET /api/scans/{id} if WebSocket connection fails.
 *
 * TODO (Dev 5 / Dev 6):
 *   - Connect to WebSocket (use simulatePipelineWebSocket from mocks/handlers.ts in dev)
 *   - Render each WebSocketMessage as a timeline entry with timestamp, status badge, message
 *   - Colour-code status badges: RUNNING=blue, WAITING_FOR_HUMAN=amber, COMPLETED=green,
 *     STOPPED=red, FAILED=red
 *   - Animate new entries sliding in with Anime.js
 *   - At WAITING_FOR_HUMAN, render Continue/Stop control buttons (calls POST /api/scans/{id}/control)
 *   - At FINAL_APPROVAL (stage 4, WAITING_FOR_HUMAN), render Approve button
 *     (calls POST /api/vulnerabilities/{id}/ticket with { approved: true })
 *   - Only show ticket URL in timeline AFTER the approval response succeeds
 */

import type { WebSocketMessage, ScanJob } from '@/types/contracts';

interface LiveTimelineStreamProps {
  scanJob?: ScanJob | null;
  events?: WebSocketMessage[];
  onContinue?: (scanId: string) => void;
  onStop?: (scanId: string) => void;
  onApprove?: (findingId: string) => void;
}

export default function LiveTimelineStream({
  scanJob: _scanJob,
  events: _events = [],
  onContinue: _onContinue,
  onStop: _onStop,
  onApprove: _onApprove,
}: LiveTimelineStreamProps) {
  // TODO: implement real-time WebSocket timeline with HITL Continue/Stop/Approve controls
  return (
    <div className="flex items-center justify-center w-full h-64 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300">
      <p className="text-gray-500 text-sm">
        LiveTimelineStream — Real-Time Pipeline Events (TODO)
      </p>
    </div>
  );
}
