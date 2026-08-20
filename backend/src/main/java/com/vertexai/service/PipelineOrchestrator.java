package com.vertexai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vertexai.agent.AgentClient;
import com.vertexai.config.PipelineWebSocketHandler;
import com.vertexai.dto.ScanRequest;
import com.vertexai.dto.ScanStatusResponse;
import com.vertexai.dto.StageTiming;
import com.vertexai.entity.*;
import com.vertexai.event.PipelineStageEvent;
import com.vertexai.event.ScanStartedEvent;
import com.vertexai.exception.BadRequestException;
import com.vertexai.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class PipelineOrchestrator {

    private final AgentClient agentClient;
    private final ScanJobRepository scanJobRepository;
    private final CanonicalVulnerabilityRepository canonicalVulnerabilityRepository;
    private final VulnerabilityIntelligenceRepository vulnerabilityIntelligenceRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PipelineWebSocketHandler pipelineWebSocketHandler;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * In-memory cache for the large intermediate agent payloads that are
     * intentionally not
     * persisted. Authoritative status and stage now live on the {@code scan_jobs}
     * row, so a
     * cache miss after a restart degrades gracefully instead of losing the
     * pipeline.
     */
    private final Map<UUID, PipelineState> pipelineCache = new ConcurrentHashMap<>();

    private static final Map<Integer, String> AGENT_LABELS = Map.of(
            1, "Agent 1 - Parser & Normalizer",
            2, "Agent 2 - Noise Reduction & XGBoost",
            3, "Agent 3 - Threat Intelligence & EPSS",
            4, "Agent 4 - Risk Scoring & Ticket Prep");

    // NOTE: raw/dedup finding counts used to live here as two mutable fields
    // (`latestRawCount`/`latestDedupCount`), shared and overwritten by every scan and
    // read by every dashboard viewer regardless of which run they were looking at —
    // the root cause of "random"-looking before/after numbers between runs. They are
    // now real per-scan data: raw count is persisted on the scan_jobs row
    // (`persistRawFindingsCount`), and the "after" count is simply
    // `count(canonical_vulnerabilities WHERE scan_job_id = <this run>)`, queried live
    // from the actually-persisted rows by DashboardService.

    public static class PipelineState {
        public UUID scanId;
        public Asset asset;
        public List<String> scanners;
        public List<ScanRequest.ReportEntry> reports;
        public int currentStage = 0; // 0=Not started, 1=Parsed, 2=Deduplicated, 3=Enriched, 4=Scored
        public String status = "PENDING";
        public Object currentStageOutput;
        public List<Map<String, Object>> agent1Output;
        public List<Map<String, Object>> agent2Output;
        public List<Map<String, Object>> agent3Output;
        public Map<String, Object> agent4Output;
        public String errorMessage;
        /** LIVE_FEEDS or MOCK_FIXTURES, reported by Agent 3. */
        public String intelSource;
        /** AGENTIC, AGENTIC_PARTIAL or DETERMINISTIC, reported by Agent 3. */
        public String reasoningMode;
        /** Measured execution time per stage, keyed by stage number. */
        public final Map<Integer, StageTiming> timings = new ConcurrentHashMap<>();
    }

    // =========================================================================
    // Pipeline entry point
    // =========================================================================

    /**
     * Starts the HITL pipeline once the {@code ScanJob} row is committed and
     * visible.
     *
     * <p>
     * {@code AFTER_COMMIT} is essential: the previous implementation invoked this
     * directly from inside {@code ScanService.startScan}'s transaction, so this
     * worker
     * thread frequently could not see the {@code scan_jobs} row it was supposed to
     * update.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onScanStarted(ScanStartedEvent event) {
        UUID scanId = event.scanId();
        int reportCount = event.reports() != null ? event.reports().size() : 0;
        log.info("Pipeline [Scan {}] -> transaction committed, starting HITL pipeline with {} uploaded report(s)",
                scanId, reportCount);

        PipelineState state = new PipelineState();
        state.scanId = scanId;
        state.asset = event.asset();
        state.scanners = event.scanners();
        state.reports = event.reports();
        state.status = "RUNNING";
        pipelineCache.put(scanId, state);

        executeStage1(scanId);
    }

    /**
     * Executes an approved stage off the request thread so the control endpoint
     * returns immediately.
     */
    @Async
    @EventListener
    public void onStageRequested(PipelineStageEvent event) {
        switch (event.stage()) {
            case 2 -> executeStage2(event.scanId());
            case 3 -> executeStage3(event.scanId());
            case 4 -> executeStage4(event.scanId());
            default -> log.error("Pipeline [Scan {}] -> refusing to execute unknown stage {}",
                    event.scanId(), event.stage());
        }
    }

    // =========================================================================
    // Agent stages
    // =========================================================================

    public void executeStage1(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status))
            return;

        beginStage(state, 1);
        try {
            log.info("Agent 1 START scan={} (Parser & Normalizer)", scanId);
            broadcastStatus(scanId, "RUNNING", 1, "Agent 1 parsing multi-scanner reports...");
            updateScanJobProgress(scanId, "RUNNING", 0);

            Map<String, Object> rawReportsPayload = new HashMap<>();
            rawReportsPayload.put("target_host", state.asset.getHostname());
            rawReportsPayload.put("scanners", state.scanners);
            if (state.reports != null && !state.reports.isEmpty()) {
                log.info("Agent 1 scan={} forwarding {} analyst-uploaded report(s); first={} ({} bytes)",
                        scanId, state.reports.size(),
                        state.reports.get(0).getScannerType(),
                        state.reports.get(0).getContent() != null ? state.reports.get(0).getContent().length() : 0);
                rawReportsPayload.put("reports", state.reports);
            } else {
                log.warn(
                        "Agent 1 scan={} has NO uploaded reports in pipeline state — Agent 1 will fall back to its bundled sample fixtures",
                        scanId);
            }

            List<Map<String, Object>> unifiedFindings = agentClient.parseReports(rawReportsPayload);
            if ("STOPPED".equals(state.status))
                return; // STOP arrived while agent was running
            int outCount = unifiedFindings != null ? unifiedFindings.size() : 0;
            persistRawFindingsCount(scanId, outCount);
            state.agent1Output = unifiedFindings;
            state.currentStageOutput = unifiedFindings;
            state.currentStage = 1;
            state.status = "WAITING_FOR_HUMAN";

            long ms = endStage(state, 1, "COMPLETED", outCount);
            updateScanJobProgress(scanId, "WAITING_FOR_HUMAN", 1);
            persistStageTimings(scanId, state);
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 1, state.currentStageOutput);
            log.info("Agent 1 COMPLETED scan={} durationMs={} inputReports={} outputFindings={} -> paused at Gate 1 (WAITING_FOR_HUMAN)",
                    scanId, ms, state.reports != null ? state.reports.size() : 0, outCount);

        } catch (Exception e) {
            endStage(state, 1, "FAILED");
            handlePipelineFailure(scanId, 1, "Agent 1 execution failed: " + e.getMessage(), e);
        }
    }

    public void executeStage2(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status))
            return;

        beginStage(state, 2);
        try {
            log.info("Agent 2 START scan={} (Noise Reduction & XGBoost) inputFindings={}",
                    scanId, state.agent1Output != null ? state.agent1Output.size() : 0);
            broadcastStatus(scanId, "RUNNING", 2, "Agent 2 deduplicating and running XGBoost FP filter...");
            updateScanJobProgress(scanId, "RUNNING", 1);

            List<Map<String, Object>> canonicalFindings = agentClient.reduceNoise(state.agent1Output);
            if ("STOPPED".equals(state.status))
                return;
            int outCount = canonicalFindings != null ? canonicalFindings.size() : 0;
            state.agent2Output = canonicalFindings;
            state.currentStageOutput = canonicalFindings;
            state.currentStage = 2;
            state.status = "WAITING_FOR_HUMAN";

            persistCanonicalFindings(scanId, canonicalFindings);
            persistDedupReport(scanId, agentClient.getLastDedupResponse());

            long ms = endStage(state, 2, "COMPLETED", outCount);
            updateScanJobProgress(scanId, "WAITING_FOR_HUMAN", 2);
            persistStageTimings(scanId, state);
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 2, state.currentStageOutput);
            log.info("Agent 2 COMPLETED scan={} durationMs={} inputFindings={} outputCanonicalFindings={} -> paused at Gate 2",
                    scanId, ms, state.agent1Output != null ? state.agent1Output.size() : 0, outCount);

        } catch (Exception e) {
            endStage(state, 2, "FAILED");
            handlePipelineFailure(scanId, 2, "Agent 2 execution failed: " + e.getMessage(), e);
        }
    }

    public void executeStage3(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status))
            return;

        beginStage(state, 3);
        try {
            log.info("Agent 3 START scan={} (Threat Intelligence & EPSS) inputFindings={}",
                    scanId, state.agent2Output != null ? state.agent2Output.size() : 0);
            broadcastStatus(scanId, "RUNNING", 3, "Agent 3 querying CISA KEV and EPSS threat intelligence...");
            updateScanJobProgress(scanId, "RUNNING", 2);

            List<Map<String, Object>> enrichedFindings = agentClient.enrichThreats(state.agent2Output);
            if ("STOPPED".equals(state.status))
                return;
            state.intelSource = agentClient.getLastIntelSource();
            state.reasoningMode = agentClient.getLastReasoningMode();
            if ("MOCK_FIXTURES".equals(state.intelSource)) {
                log.warn(
                        "Agent 3 scan={} used OFFLINE MOCK threat intel fixtures, NOT live CISA KEV / FIRST EPSS feeds",
                        scanId);
            }
            if (state.reasoningMode != null && state.reasoningMode.startsWith("AGENTIC")) {
                log.info("Agent 3 scan={} ran a goal-directed agentic investigation (mode={})",
                        scanId, state.reasoningMode);
            }
            state.agent3Output = enrichedFindings;
            state.currentStageOutput = enrichedFindings;
            state.currentStage = 3;
            state.status = "WAITING_FOR_HUMAN";

            persistThreatIntelligence(scanId, enrichedFindings);

            int outCount3 = enrichedFindings != null ? enrichedFindings.size() : 0;
            long ms = endStage(state, 3, "COMPLETED", outCount3);
            updateScanJobProgress(scanId, "WAITING_FOR_HUMAN", 3);
            persistStageTimings(scanId, state);
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 3, state.currentStageOutput);
            log.info("Agent 3 COMPLETED scan={} durationMs={} inputFindings={} outputEnrichedFindings={} -> paused at Gate 3",
                    scanId, ms, state.agent2Output != null ? state.agent2Output.size() : 0, outCount3);

        } catch (Exception e) {
            endStage(state, 3, "FAILED");
            handlePipelineFailure(scanId, 3, "Agent 3 execution failed: " + e.getMessage(), e);
        }
    }

    public void executeStage4(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status))
            return;

        beginStage(state, 4);
        try {
            log.info("Agent 4 START scan={} (Risk Scoring & Ticket Prep)", scanId);
            broadcastStatus(scanId, "RUNNING", 4,
                    "Agent 4 calculating composite risk score and preparing ticket payload...");
            updateScanJobProgress(scanId, "RUNNING", 3);

            Map<String, Object> scoringPayload = new HashMap<>();
            scoringPayload.put("asset_criticality", state.asset.getCriticalityRating());
            scoringPayload.put("findings", state.agent3Output != null ? state.agent3Output : state.agent2Output);

            Map<String, Object> scoredResult = agentClient.scoreAndPrepareTicket(scoringPayload);
            if ("STOPPED".equals(state.status))
                return;
            state.agent4Output = scoredResult;
            state.currentStageOutput = scoredResult;
            state.currentStage = 4;
            state.status = "WAITING_FOR_HUMAN"; // Final Human Approval checkpoint

            persistRiskScore(scanId, scoredResult, state.agent2Output);

            int scoredCount = scoredFindingsCount(scoredResult, state.agent2Output);
            long ms = endStage(state, 4, "COMPLETED", scoredCount);
            updateScanJobProgress(scanId, "WAITING_FOR_HUMAN", 4);
            persistStageTimings(scanId, state);
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 4, state.currentStageOutput);
            log.info("Agent 4 COMPLETED scan={} durationMs={} inputFindings={} outputScoredFindings={} -> paused at FINAL HUMAN APPROVAL gate",
                    scanId, ms, state.agent3Output != null ? state.agent3Output.size() : (state.agent2Output != null ? state.agent2Output.size() : 0), scoredCount);

        } catch (Exception e) {
            endStage(state, 4, "FAILED");
            handlePipelineFailure(scanId, 4, "Agent 4 execution failed: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // HITL gate control
    // =========================================================================

    public ScanStatusResponse handleControl(ScanJob scanJob, String action) {
        UUID scanId = scanJob.getScanId();
        PipelineState state = pipelineCache.get(scanId);

        if ("STOP".equalsIgnoreCase(action)) {
            int stoppedAt = state != null ? state.currentStage : orZero(scanJob.getCurrentStage());
            log.warn("Human Review REJECTED runId={} gate={} (PENDING -> REJECTED) — halting pipeline", scanId, stoppedAt);
            if (state != null) {
                state.status = "STOPPED";
            }
            updateScanJobProgress(scanId, "STOPPED", stoppedAt);
            broadcastStatus(scanId, "STOPPED", stoppedAt, "Pipeline stopped by analyst.");
            return buildStatusResponse(scanJobRepository.findById(scanId).orElse(scanJob));
        }

        if ("CONTINUE".equalsIgnoreCase(action)) {
            if (state == null) {
                // Intermediate agent payloads are deliberately not persisted, so they cannot
                // be rebuilt after a restart. Fail with an actionable message instead of the
                // previous cryptic "No active pipeline state found in memory".
                log.error(
                        "CONTINUE rejected for scan {}: in-memory agent payloads are gone (backend restarted). Persisted stage={}, status={}",
                        scanId, scanJob.getCurrentStage(), scanJob.getStatus());
                throw new BadRequestException(
                        "This scan's in-flight agent data was lost because the backend restarted. "
                                + "Re-upload the scanner reports to start a new scan.");
            }
            if (!"WAITING_FOR_HUMAN".equals(state.status)) {
                throw new BadRequestException(
                        "Pipeline is not waiting at a human checkpoint (current status: " + state.status + ")");
            }

            int currentStage = state.currentStage;
            log.info("Human Review APPROVED runId={} gate={} (PENDING -> APPROVED) — dispatching next stage asynchronously",
                    scanId, currentStage);

            if (currentStage == 4) {
                state.status = "COMPLETED";
                updateScanJobCompleted(scanId);
                broadcastStatus(scanId, "COMPLETED", 4, "Pipeline execution completed. Ready for ticket approval.");
                return buildStatusResponse(scanJobRepository.findById(scanId).orElse(scanJob));
            }

            if (currentStage < 1 || currentStage > 3) {
                throw new BadRequestException("Cannot advance pipeline from current stage: " + currentStage);
            }

            // Flip to RUNNING synchronously so a double-click cannot launch the same agent
            // twice.
            state.status = "RUNNING";
            updateScanJobProgress(scanId, "RUNNING", currentStage);
            eventPublisher.publishEvent(new PipelineStageEvent(scanId, currentStage + 1));

            return buildStatusResponse(scanJobRepository.findById(scanId).orElse(scanJob));
        }

        throw new BadRequestException("Invalid control action: '" + action + "'. Must be CONTINUE or STOP.");
    }

    // =========================================================================
    // Stage timing
    // =========================================================================

    private void beginStage(PipelineState state, int stage) {
        state.timings.put(stage, StageTiming.builder()
                .stage(stage)
                .agent(AGENT_LABELS.getOrDefault(stage, "Agent " + stage))
                .startedAt(LocalDateTime.now())
                .status("RUNNING")
                .build());
    }

    /**
     * Closes out a stage timing and returns the measured duration in milliseconds.
     */
    private long endStage(PipelineState state, int stage, String status) {
        return endStage(state, stage, status, null);
    }

    private long endStage(PipelineState state, int stage, String status, Integer findingsProcessed) {
        StageTiming timing = state.timings.get(stage);
        if (timing == null)
            return 0L;
        LocalDateTime now = LocalDateTime.now();
        timing.setCompletedAt(now);
        timing.setStatus(status);
        long ms = timing.getStartedAt() != null
                ? Duration.between(timing.getStartedAt(), now).toMillis()
                : 0L;
        timing.setDurationMs(ms);
        if (findingsProcessed != null) {
            timing.setFindingsProcessed(findingsProcessed);
        }
        return ms;
    }

    private List<StageTiming> sortedTimings(PipelineState state) {
        List<StageTiming> list = new ArrayList<>(state.timings.values());
        list.sort(Comparator.comparing(StageTiming::getStage));
        return list;
    }

    private void persistStageTimings(UUID scanId, PipelineState state) {
        try {
            String json = objectMapper.writeValueAsString(sortedTimings(state));
            scanJobRepository.findById(scanId).ifPresentOrElse(job -> {
                job.setStageTimings(json);
                scanJobRepository.save(job);
            }, () -> log.error("Cannot persist stage timings: scan_jobs row {} not found", scanId));
        } catch (Exception e) {
            log.error("Failed to serialize stage timings for scan {}: {}", scanId, e.getMessage());
        }
    }

    private List<StageTiming> readPersistedTimings(ScanJob job) {
        if (job.getStageTimings() == null || job.getStageTimings().isBlank()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(job.getStageTimings(), new TypeReference<List<StageTiming>>() {
            });
        } catch (Exception e) {
            log.warn("Could not parse persisted stage_timings for scan {}: {}", job.getScanId(), e.getMessage());
            return Collections.emptyList();
        }
    }

    // =========================================================================
    // Persistence of agent output
    // =========================================================================

    /**
     * Persists Agent 1's output size on the scan_jobs row for THIS run — the real,
     * durable, per-scan replacement for the old global mutable `latestRawCount` field.
     */
    private void persistRawFindingsCount(UUID scanId, int count) {
        scanJobRepository.findById(scanId).ifPresentOrElse(job -> {
            job.setRawFindingsCount(count);
            scanJobRepository.save(job);
        }, () -> log.error("Cannot persist raw findings count: scan_jobs row {} not found", scanId));
    }

    /**
     * Persists Agent 2's full per-finding dedup audit (dedup_detail: one row per INPUT
     * finding, including every one merged away, with its group id, KEPT/REMOVED_*
     * status and reason) onto the scan_jobs row for THIS run — served back via
     * GET /api/scans/{id}/dedup-report[.csv]. Tolerates an older/mocked agent response
     * that has no dedup_detail field: stores nothing rather than failing the stage.
     */
    private void persistDedupReport(UUID scanId, Map<String, Object> dedupResponse) {
        if (dedupResponse == null || !dedupResponse.containsKey("dedup_detail")) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(dedupResponse.get("dedup_detail"));
            scanJobRepository.findById(scanId).ifPresentOrElse(job -> {
                job.setDedupReportJson(json);
                scanJobRepository.save(job);
            }, () -> log.error("Cannot persist dedup report: scan_jobs row {} not found", scanId));
        } catch (Exception e) {
            log.warn("Failed to serialize dedup_detail for scan {}: {}", scanId, e.getMessage());
        }
    }

    /**
     * Scoped to (scanId, fingerprint_hash) — NOT fingerprint_hash alone. The previous
     * version looked up/inserted by fingerprint_hash globally, so the first scan ever
     * to detect a given finding "owned" that row forever and every later scan of the
     * same finding was silently skipped (an insert-if-absent that never updates). That
     * is the root cause of findings/graphs looking "random" between runs: every query
     * always read the same unscoped, ever-growing shared pool. Now every run gets its
     * own row per finding (insert on first sight this run, update if this exact
     * scan+fingerprint pair recurs — e.g. a retry within the same run).
     */
    @Transactional
    protected void persistCanonicalFindings(UUID scanId, List<Map<String, Object>> findings) {
        if (findings == null)
            return;
        for (Map<String, Object> map : findings) {
            String hash = (String) map.get("fingerprint_hash");
            if (hash == null)
                continue;

            CanonicalVulnerability vuln = canonicalVulnerabilityRepository
                    .findByScanJobIdAndFingerprintHash(scanId, hash)
                    .orElse(CanonicalVulnerability.builder().scanJobId(scanId).fingerprintHash(hash).build());

            vuln.setCveId((String) map.getOrDefault("cve_id", "CVE-UNKNOWN"));
            vuln.setVulnerabilityName((String) map.getOrDefault("vulnerability_name", "Unknown Vulnerability"));
            vuln.setTargetHost((String) map.getOrDefault("target_host", "localhost"));
            vuln.setTargetPort(
                    map.get("target_port") instanceof Number ? ((Number) map.get("target_port")).intValue() : 80);
            vuln.setCvssBaseScore(map.get("cvss_base_score") instanceof Number
                    ? ((Number) map.get("cvss_base_score")).doubleValue()
                    : 5.0);
            vuln.setScannerSources(String.valueOf(map.getOrDefault("scanner_sources", "SCANNER")));
            vuln.setFalsePositiveProb(map.get("false_positive_prob") instanceof Number
                    ? ((Number) map.get("false_positive_prob")).doubleValue()
                    : 0.0);
            vuln.setIsSuppressed(Boolean.TRUE.equals(map.get("is_suppressed")));
            if (vuln.getIsAcceptedRisk() == null) {
                vuln.setIsAcceptedRisk(false);
            }

            canonicalVulnerabilityRepository.save(vuln);
        }
    }

    /**
     * Kept globally keyed by cve_id on purpose — CISA KEV/EPSS/NVD facts about a CVE
     * are not scan-specific, so this table remains a shared cache. lastScanJobId is
     * provenance only (which run most recently refreshed this row).
     */
    @Transactional
    protected void persistThreatIntelligence(UUID scanId, List<Map<String, Object>> findings) {
        if (findings == null)
            return;
        for (Map<String, Object> map : findings) {
            String cveId = (String) map.get("cve_id");
            if (cveId == null || "CVE-UNKNOWN".equals(cveId))
                continue;

            VulnerabilityIntelligence intel = vulnerabilityIntelligenceRepository.findById(cveId)
                    .orElse(VulnerabilityIntelligence.builder().cveId(cveId).build());

            if (map.containsKey("is_cisa_kev"))
                intel.setIsCisaKev(Boolean.TRUE.equals(map.get("is_cisa_kev")));
            if (map.containsKey("epss_score") && map.get("epss_score") instanceof Number) {
                intel.setEpssScore(((Number) map.get("epss_score")).doubleValue());
            }
            if (map.containsKey("epss_percentile") && map.get("epss_percentile") instanceof Number) {
                intel.setEpssPercentile(((Number) map.get("epss_percentile")).doubleValue());
            }
            if (map.containsKey("exploit_db_available")) {
                intel.setExploitDbAvailable(Boolean.TRUE.equals(map.get("exploit_db_available")));
            }
            intel.setLastSyncedAt(LocalDateTime.now());
            intel.setLastScanJobId(scanId);
            vulnerabilityIntelligenceRepository.save(intel);
        }
    }

    @Transactional
    protected void persistRiskScore(UUID scanId, Map<String, Object> scoredResult, List<Map<String, Object>> findings) {
        if (scoredResult == null || findings == null || findings.isEmpty())
            return;

        Double compositeScore = scoredResult.get("composite_risk_score") instanceof Number
                ? ((Number) scoredResult.get("composite_risk_score")).doubleValue()
                : 50.0;
        String priority = (String) scoredResult.getOrDefault("priority_level", "P2_MEDIUM");
        String rationale = (String) scoredResult.getOrDefault("explainable_rationale", "Calculated risk score");

        // Agent 4 returns per-finding scores in scored_findings; prefer those when
        // present
        Object scoredFindingsObj = scoredResult.get("scored_findings");
        Map<String, Map<String, Object>> scoredByHash = new HashMap<>();
        if (scoredFindingsObj instanceof List<?> scoredList) {
            for (Object o : scoredList) {
                if (o instanceof Map<?, ?> m && m.get("fingerprint_hash") instanceof String h) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> sm = (Map<String, Object>) m;
                    scoredByHash.put(h, sm);
                }
            }
        }

        // Agent 4's ticket-ready drafts, previously dropped entirely. May be shaped
        // either as a per-finding list keyed by fingerprint_hash (preferred) or a
        // single top-level payload applied to every finding in this batch.
        Object ticketPayloadsObj = scoredResult.get("ticket_payloads");
        Map<String, Object> ticketByHash = new HashMap<>();
        Object singleTicketPayload = null;
        if (ticketPayloadsObj instanceof List<?> ticketList) {
            for (Object o : ticketList) {
                if (o instanceof Map<?, ?> m && m.get("fingerprint_hash") instanceof String h) {
                    ticketByHash.put(h, m);
                }
            }
        } else if (ticketPayloadsObj instanceof Map<?, ?>) {
            singleTicketPayload = ticketPayloadsObj;
        }

        for (Map<String, Object> f : findings) {
            String hash = (String) f.get("fingerprint_hash");
            if (hash == null)
                continue;

            Map<String, Object> scored = scoredByHash.get(hash);
            final double findingScore = scored != null && scored.get("composite_risk_score") instanceof Number n
                    ? n.doubleValue()
                    : compositeScore;
            final String findingPriority = scored != null && scored.get("priority_level") instanceof String p
                    ? p
                    : priority;
            final String findingRationale = scored != null && scored.get("explainable_rationale") instanceof String r
                    ? r
                    : rationale;

            Object ticketPayload = ticketByHash.containsKey(hash) ? ticketByHash.get(hash) : singleTicketPayload;
            final String ticketPayloadJson;
            if (ticketPayload != null) {
                String json;
                try {
                    json = objectMapper.writeValueAsString(ticketPayload);
                } catch (Exception e) {
                    log.warn("Failed to serialize ticket_payload for finding hash={}: {}", hash, e.getMessage());
                    json = null;
                }
                ticketPayloadJson = json;
            } else {
                ticketPayloadJson = null;
            }

            canonicalVulnerabilityRepository.findByScanJobIdAndFingerprintHash(scanId, hash).ifPresent(vuln -> {
                RiskScore riskScore = riskScoreRepository.findByFinding_FindingId(vuln.getFindingId())
                        .orElse(RiskScore.builder().finding(vuln).scanJobId(scanId).build());
                riskScore.setScanJobId(scanId);
                riskScore.setCompositeRiskScore(findingScore);
                riskScore.setPriorityLevel(findingPriority);
                riskScore.setExplainableRationale(findingRationale);
                riskScore.setTicketPayloadJson(ticketPayloadJson);
                riskScore.setCalculatedAt(LocalDateTime.now());
                riskScoreRepository.save(riskScore);
            });
        }
    }

    // =========================================================================
    // Scan job state
    // =========================================================================

    /**
     * Persists status and stage together. Logs an ERROR when the row is missing
     * instead of
     * silently discarding the update, which is what previously hid the transaction
     * race and
     * left the database reporting {@code RUNNING} forever.
     */
    private void updateScanJobProgress(UUID scanId, String status, Integer stage) {
        scanJobRepository.findById(scanId).ifPresentOrElse(job -> {
            job.setStatus(status);
            if (stage != null) {
                job.setCurrentStage(stage);
            }
            scanJobRepository.save(job);
        }, () -> log.error(
                "FAILED to update scan job {}: scan_jobs row not found. Status '{}' (stage {}) was NOT persisted.",
                scanId, status, stage));
    }

    private void updateScanJobCompleted(UUID scanId) {
        scanJobRepository.findById(scanId).ifPresentOrElse(job -> {
            job.setStatus("COMPLETED");
            job.setCurrentStage(4);
            job.setCompletedAt(LocalDateTime.now());
            scanJobRepository.save(job);
        }, () -> log.error("FAILED to mark scan job {} COMPLETED: scan_jobs row not found", scanId));
    }

    private void handlePipelineFailure(UUID scanId, int stage, String errorMessage, Exception cause) {
        log.error("Pipeline FAILED for scan {} at stage {}: {}", scanId, stage, errorMessage, cause);
        PipelineState state = pipelineCache.get(scanId);
        if (state != null) {
            state.status = "FAILED";
            state.errorMessage = errorMessage;
            state.currentStageOutput = Collections.singletonMap("error", errorMessage);
            persistStageTimings(scanId, state);
        }
        updateScanJobProgress(scanId, "FAILED", stage);
        broadcastStatus(scanId, "FAILED", stage, errorMessage);
    }

    private void broadcastStatus(UUID scanId, String status, int stage, Object payload) {
        PipelineState state = pipelineCache.get(scanId);

        Map<String, Object> message = new HashMap<>();
        message.put("scan_id", scanId);
        message.put("status", status);
        message.put("current_stage", stage);
        message.put("payload", payload);
        message.put("timestamp", LocalDateTime.now().toString());
        if (state != null) {
            message.put("stage_timings", sortedTimings(state));
            message.put("intel_source", state.intelSource);
            message.put("reasoning_mode", state.reasoningMode);
        }

        try {
            messagingTemplate.convertAndSend("/topic/pipeline", (Object) message);
            messagingTemplate.convertAndSend("/topic/scans/" + scanId, (Object) message);
        } catch (Exception e) {
            log.warn("STOMP broadcast failed for scan {}: {}", scanId, e.getMessage());
        }

        try {
            pipelineWebSocketHandler.broadcast(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            log.warn("Raw WebSocket broadcast failed for scan {}: {}", scanId, e.getMessage());
        }
    }

    /**
     * Builds the API status response from a single authoritative source: the
     * persisted
     * {@code scan_jobs} row supplies status, stage and timings. The in-memory cache
     * is
     * consulted only for the large agent payload, which is intentionally not
     * persisted.
     */
    public ScanStatusResponse buildStatusResponse(ScanJob scanJob) {
        PipelineState state = pipelineCache.get(scanJob.getScanId());

        List<StageTiming> timings = state != null && !state.timings.isEmpty()
                ? sortedTimings(state)
                : readPersistedTimings(scanJob);

        long total = timings.stream()
                .filter(t -> t.getDurationMs() != null)
                .mapToLong(StageTiming::getDurationMs)
                .sum();

        return ScanStatusResponse.builder()
                .scanId(scanJob.getScanId())
                .assetId(scanJob.getAsset() != null ? scanJob.getAsset().getAssetId() : null)
                .status(scanJob.getStatus())
                .scannersUsed(scanJob.getScannersUsed())
                .startedAt(scanJob.getStartedAt())
                .completedAt(scanJob.getCompletedAt())
                .currentStage(orZero(scanJob.getCurrentStage()))
                .agentOutput(state != null ? state.currentStageOutput : null)
                .stageTimings(timings)
                .totalDurationMs(total)
                .errorMessage(state != null ? state.errorMessage : null)
                .intelSource(state != null ? state.intelSource : null)
                .reasoningMode(state != null ? state.reasoningMode : null)
                .build();
    }

    private int scoredFindingsCount(Map<String, Object> scoredResult, List<Map<String, Object>> fallback) {
        if (scoredResult != null && scoredResult.get("scored_findings") instanceof List<?> list) {
            return list.size();
        }
        return fallback != null ? fallback.size() : 0;
    }

    private int orZero(Integer value) {
        return value != null ? value : 0;
    }
}
