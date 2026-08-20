package com.vertexai.event;

import java.util.UUID;

/**
 * Requests asynchronous execution of a single pipeline stage after a human analyst
 * approved the preceding gate.
 *
 * <p>Published by {@code PipelineOrchestrator.handleControl} so the {@code POST
 * /api/scans/{id}/control} request returns immediately with status {@code RUNNING}
 * instead of blocking for the whole agent call. The dashboard then observes the real
 * {@code RUNNING -> WAITING_FOR_HUMAN} transition (and the measured duration) over the
 * WebSocket broadcast, which is what makes agent processing time visible in the UI.
 *
 * <p>Routed through the event publisher rather than a direct {@code this.method()} call
 * because self-invocation bypasses the Spring proxy, which would silently make
 * {@code @Async} a no-op.
 */
public record PipelineStageEvent(UUID scanId, int stage) {
}
