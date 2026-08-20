package com.vertexai.dto;

import lombok.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScanStatusResponse {

    private UUID scanId;
    private UUID assetId;
    private String status;
    private String scannersUsed;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
    private Integer currentStage;
    private Object agentOutput;

    /**
     * Real per-agent execution timings measured by the backend. Serialized as
     * {@code stage_timings}. Lets the dashboard display "Agent 1: 4.2s" from actual
     * measurements instead of a simulated client-side timer.
     */
    private List<StageTiming> stageTimings;

    /** Total elapsed milliseconds across all completed agent stages. */
    private Long totalDurationMs;

    /**
     * Provenance of Agent 3 threat intelligence: LIVE_FEEDS, MOCK_FIXTURES or
     * UNKNOWN.
     * Serialized as {@code intel_source}.
     */
    private String intelSource;

    /**
     * How Agent 3 reached its conclusions: AGENTIC, AGENTIC_PARTIAL or
     * DETERMINISTIC.
     * Serialized as {@code reasoning_mode}.
     */
    private String reasoningMode;

    /** Populated when the pipeline fails, so the UI can surface the reason. */
    private String errorMessage;
}
