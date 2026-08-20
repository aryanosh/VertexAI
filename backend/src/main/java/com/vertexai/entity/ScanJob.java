package com.vertexai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "scan_jobs")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScanJob {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "scan_id")
    private UUID scanId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "asset_id", nullable = false)
    private Asset asset;

    @Column(name = "status", nullable = false, length = 50)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "scanners_used", nullable = false, columnDefinition = "TEXT")
    private String scannersUsed;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    /**
     * Authoritative HITL pipeline stage (0=not started, 1=parsed, 2=deduplicated,
     * 3=enriched, 4=scored). Persisted so progress survives a backend restart —
     * previously this lived only in an in-memory cache.
     */
    @Column(name = "current_stage")
    @Builder.Default
    private Integer currentStage = 0;

    /**
     * JSON array of per-agent timings:
     * [{"stage":1,"agent":"Agent 1 -
     * Parser","started_at":"...","completed_at":"...","duration_ms":4213}]
     */
    @Column(name = "stage_timings", columnDefinition = "TEXT")
    private String stageTimings;

    /**
     * Agent 2's full per-finding dedup detail for this run — finding id, CVE, scanner,
     * asset, severity, description, duplicate-group id, duplicate status, and the
     * removal/retention reason for every raw input finding (not just survivors). Served
     * back via GET /api/scans/{id}/dedup-report[.csv].
     */
    @Column(name = "dedup_report_json", columnDefinition = "TEXT")
    private String dedupReportJson;

    /**
     * Marks the one fixed demo/seed scan job. Every "current run" query (dashboard,
     * findings list, graphs) excludes rows tagged with this by default, so permanent
     * seed data can never silently mix into or be mistaken for a real scan's results.
     */
    @Column(name = "is_seed_data")
    @Builder.Default
    private Boolean isSeedData = false;

    /**
     * Agent 1's output size for THIS run — persisted per-scan so the dashboard's
     * before/after noise-reduction numbers are real, run-scoped data instead of a
     * single mutable field shared across every scan and every viewer.
     */
    @Column(name = "raw_findings_count")
    private Integer rawFindingsCount;

    @PrePersist
    protected void onCreate() {
        if (startedAt == null) {
            startedAt = LocalDateTime.now();
        }
        if (status == null) {
            status = "PENDING";
        }
        if (currentStage == null) {
            currentStage = 0;
        }
        if (isSeedData == null) {
            isSeedData = false;
        }
    }
}
