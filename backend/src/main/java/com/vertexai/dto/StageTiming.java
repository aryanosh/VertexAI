package com.vertexai.dto;

import lombok.*;

import java.time.LocalDateTime;

/**
 * Real measured execution time for a single agent stage of the HITL pipeline.
 *
 * <p>Serialized with the application-wide SNAKE_CASE strategy, so the JSON keys are
 * {@code stage}, {@code agent}, {@code started_at}, {@code completed_at},
 * {@code duration_ms} and {@code status}. The same representation is persisted into
 * {@code scan_jobs.stage_timings} and returned by the scan status endpoints, so the UI
 * displays genuine backend measurements rather than a client-side estimate.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StageTiming {

    /** Pipeline stage number: 1=Parser, 2=Dedup, 3=Threat Intel, 4=Scoring. */
    private Integer stage;

    /** Human readable agent label, e.g. "Agent 1 - Parser & Normalizer". */
    private String agent;

    private LocalDateTime startedAt;

    private LocalDateTime completedAt;

    /** Wall-clock duration of the agent call in milliseconds. Null while still running. */
    private Long durationMs;

    /** RUNNING, COMPLETED or FAILED. */
    private String status;

    /** Number of findings the agent processed/returned in this stage, when known. */
    private Integer findingsProcessed;
}
