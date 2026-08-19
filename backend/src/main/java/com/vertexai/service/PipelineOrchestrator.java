package com.vertexai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vertexai.agent.AgentClient;
import com.vertexai.config.PipelineWebSocketHandler;
import com.vertexai.dto.ScanStatusResponse;
import com.vertexai.entity.*;
import com.vertexai.exception.BadRequestException;
import com.vertexai.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    // In-memory HITL pipeline state cache (NO extra DB tables per architecture_plan.md §8)
    private final Map<UUID, PipelineState> pipelineCache = new ConcurrentHashMap<>();

    public static class PipelineState {
        public UUID scanId;
        public Asset asset;
        public List<String> scanners;
        public int currentStage = 0; // 0=Not started, 1=Parsed, 2=Deduplicated, 3=Enriched, 4=Scored
        public String status = "PENDING";
        public Object currentStageOutput;
        public List<Map<String, Object>> agent1Output;
        public List<Map<String, Object>> agent2Output;
        public List<Map<String, Object>> agent3Output;
        public Map<String, Object> agent4Output;
    }

    /**
     * Starts the HITL pipeline asynchronously (called via Spring proxy from ScanService,
     * so @Async applies and POST /api/scans returns immediately with status RUNNING).
     */
    @Async
    public void startPipeline(UUID scanId, Asset asset, List<String> scanners) {
        log.info("Starting HITL Pipeline for scan: {}", scanId);

        PipelineState state = new PipelineState();
        state.scanId = scanId;
        state.asset = asset;
        state.scanners = scanners;
        state.status = "RUNNING";
        pipelineCache.put(scanId, state);

        executeStage1(scanId);
    }

    public void executeStage1(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status)) return;

        try {
            log.info("Pipeline [Scan {}] -> Running Agent 1 (Parser & Normalizer)...", scanId);
            broadcastStatus(scanId, "RUNNING", 1, "Agent 1 parsing multi-scanner reports...");

            Map<String, Object> rawReportsPayload = new HashMap<>();
            rawReportsPayload.put("target_host", state.asset.getHostname());
            rawReportsPayload.put("scanners", state.scanners);

            List<Map<String, Object>> unifiedFindings = agentClient.parseReports(rawReportsPayload);
            if ("STOPPED".equals(state.status)) return; // STOP arrived while agent was running
            state.agent1Output = unifiedFindings;
            state.currentStageOutput = unifiedFindings;
            state.currentStage = 1;
            state.status = "WAITING_FOR_HUMAN";

            updateScanJobStatus(scanId, "WAITING_FOR_HUMAN");
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 1, state.currentStageOutput);
            log.info("Pipeline [Scan {}] -> Stage 1 Complete. Paused at WAITING_FOR_HUMAN checkpoint.", scanId);

        } catch (Exception e) {
            handlePipelineFailure(scanId, "Agent 1 execution failed: " + e.getMessage());
        }
    }

    public void executeStage2(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status)) return;

        try {
            log.info("Pipeline [Scan {}] -> Running Agent 2 (Noise Reduction & XGBoost)...", scanId);
            broadcastStatus(scanId, "RUNNING", 2, "Agent 2 deduplicating and running XGBoost FP filter...");
            updateScanJobStatus(scanId, "RUNNING");

            List<Map<String, Object>> canonicalFindings = agentClient.reduceNoise(state.agent1Output);
            if ("STOPPED".equals(state.status)) return; // STOP arrived while agent was running
            state.agent2Output = canonicalFindings;
            state.currentStageOutput = canonicalFindings;
            state.currentStage = 2;
            state.status = "WAITING_FOR_HUMAN";

            // Persist deduplicated canonical findings to database
            persistCanonicalFindings(canonicalFindings);

            updateScanJobStatus(scanId, "WAITING_FOR_HUMAN");
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 2, state.currentStageOutput);
            log.info("Pipeline [Scan {}] -> Stage 2 Complete. Paused at WAITING_FOR_HUMAN checkpoint.", scanId);

        } catch (Exception e) {
            handlePipelineFailure(scanId, "Agent 2 execution failed: " + e.getMessage());
        }
    }

    public void executeStage3(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status)) return;

        try {
            log.info("Pipeline [Scan {}] -> Running Agent 3 (Threat Intelligence & EPSS)...", scanId);
            broadcastStatus(scanId, "RUNNING", 3, "Agent 3 querying CISA KEV and EPSS threat intelligence...");
            updateScanJobStatus(scanId, "RUNNING");

            List<Map<String, Object>> enrichedFindings = agentClient.enrichThreats(state.agent2Output);
            if ("STOPPED".equals(state.status)) return; // STOP arrived while agent was running
            state.agent3Output = enrichedFindings;
            state.currentStageOutput = enrichedFindings;
            state.currentStage = 3;
            state.status = "WAITING_FOR_HUMAN";

            // Persist threat intelligence telemetry to database
            persistThreatIntelligence(enrichedFindings);

            updateScanJobStatus(scanId, "WAITING_FOR_HUMAN");
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 3, state.currentStageOutput);
            log.info("Pipeline [Scan {}] -> Stage 3 Complete. Paused at WAITING_FOR_HUMAN checkpoint.", scanId);

        } catch (Exception e) {
            handlePipelineFailure(scanId, "Agent 3 execution failed: " + e.getMessage());
        }
    }

    public void executeStage4(UUID scanId) {
        PipelineState state = pipelineCache.get(scanId);
        if (state == null || "STOPPED".equals(state.status)) return;

        try {
            log.info("Pipeline [Scan {}] -> Running Agent 4 (Risk Scoring & Ticket Prep)...", scanId);
            broadcastStatus(scanId, "RUNNING", 4, "Agent 4 calculating composite risk score and preparing ticket payload...");
            updateScanJobStatus(scanId, "RUNNING");

            Map<String, Object> scoringPayload = new HashMap<>();
            scoringPayload.put("asset_criticality", state.asset.getCriticalityRating());
            scoringPayload.put("findings", state.agent3Output != null ? state.agent3Output : state.agent2Output);

            Map<String, Object> scoredResult = agentClient.scoreAndPrepareTicket(scoringPayload);
            if ("STOPPED".equals(state.status)) return; // STOP arrived while agent was running
            state.agent4Output = scoredResult;
            state.currentStageOutput = scoredResult;
            state.currentStage = 4;
            state.status = "WAITING_FOR_HUMAN"; // Final Human Approval checkpoint

            // Persist risk score calculation to database
            persistRiskScore(scoredResult, state.agent2Output);

            updateScanJobStatus(scanId, "WAITING_FOR_HUMAN");
            broadcastStatus(scanId, "WAITING_FOR_HUMAN", 4, state.currentStageOutput);
            log.info("Pipeline [Scan {}] -> Stage 4 Complete. Paused at FINAL HUMAN APPROVAL checkpoint.", scanId);

        } catch (Exception e) {
            handlePipelineFailure(scanId, "Agent 4 execution failed: " + e.getMessage());
        }
    }

    public ScanStatusResponse handleControl(ScanJob scanJob, String action) {
        UUID scanId = scanJob.getScanId();
        PipelineState state = pipelineCache.get(scanId);

        if ("STOP".equalsIgnoreCase(action)) {
            log.warn("Human analyst clicked STOP at checkpoint. Halting pipeline for scan: {}", scanId);
            if (state != null) {
                state.status = "STOPPED";
            }
            updateScanJobStatus(scanId, "STOPPED");
            broadcastStatus(scanId, "STOPPED", state != null ? state.currentStage : 0, "Pipeline stopped by analyst.");
            return buildStatusResponse(scanJobRepository.findById(scanId).orElse(scanJob));
        }

        if ("CONTINUE".equalsIgnoreCase(action)) {
            if (state == null) {
                throw new BadRequestException("No active pipeline state found in memory for scan: " + scanId);
            }
            if (!"WAITING_FOR_HUMAN".equals(state.status)) {
                throw new BadRequestException("Pipeline is not waiting at a human checkpoint (current status: " + state.status + ")");
            }

            int currentStage = state.currentStage;
            log.info("Human analyst clicked CONTINUE at Stage {}. Advancing pipeline for scan: {}", currentStage, scanId);

            switch (currentStage) {
                case 1 -> executeStage2(scanId);
                case 2 -> executeStage3(scanId);
                case 3 -> executeStage4(scanId);
                case 4 -> {
                    // Final approval reached; state complete
                    state.status = "COMPLETED";
                    updateScanJobCompleted(scanId);
                    broadcastStatus(scanId, "COMPLETED", 4, "Pipeline execution completed. Ready for ticket approval.");
                }
                default -> throw new BadRequestException("Cannot advance pipeline from current stage: " + currentStage);
            }

            return buildStatusResponse(scanJobRepository.findById(scanId).orElse(scanJob));
        }

        throw new BadRequestException("Invalid control action: '" + action + "'. Must be CONTINUE or STOP.");
    }

    @Transactional
    protected void persistCanonicalFindings(List<Map<String, Object>> findings) {
        if (findings == null) return;
        for (Map<String, Object> map : findings) {
            String hash = (String) map.get("fingerprint_hash");
            if (hash == null) continue;

            if (canonicalVulnerabilityRepository.findByFingerprintHash(hash).isEmpty()) {
                CanonicalVulnerability vuln = CanonicalVulnerability.builder()
                        .fingerprintHash(hash)
                        .cveId((String) map.getOrDefault("cve_id", "CVE-UNKNOWN"))
                        .vulnerabilityName((String) map.getOrDefault("vulnerability_name", "Unknown Vulnerability"))
                        .targetHost((String) map.getOrDefault("target_host", "localhost"))
                        .targetPort(map.get("target_port") instanceof Number ? ((Number) map.get("target_port")).intValue() : 80)
                        .cvssBaseScore(map.get("cvss_base_score") instanceof Number ? ((Number) map.get("cvss_base_score")).doubleValue() : 5.0)
                        .scannerSources(String.valueOf(map.getOrDefault("scanner_sources", "SCANNER")))
                        .falsePositiveProb(map.get("false_positive_prob") instanceof Number ? ((Number) map.get("false_positive_prob")).doubleValue() : 0.0)
                        .isSuppressed(Boolean.TRUE.equals(map.get("is_suppressed")))
                        .isAcceptedRisk(false)
                        .build();

                canonicalVulnerabilityRepository.save(vuln);
            }
        }
    }

    @Transactional
    protected void persistThreatIntelligence(List<Map<String, Object>> findings) {
        if (findings == null) return;
        for (Map<String, Object> map : findings) {
            String cveId = (String) map.get("cve_id");
            if (cveId == null || "CVE-UNKNOWN".equals(cveId)) continue;

            VulnerabilityIntelligence intel = vulnerabilityIntelligenceRepository.findById(cveId)
                    .orElse(VulnerabilityIntelligence.builder().cveId(cveId).build());

            if (map.containsKey("is_cisa_kev")) intel.setIsCisaKev(Boolean.TRUE.equals(map.get("is_cisa_kev")));
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
            vulnerabilityIntelligenceRepository.save(intel);
        }
    }

    @Transactional
    protected void persistRiskScore(Map<String, Object> scoredResult, List<Map<String, Object>> findings) {
        if (scoredResult == null || findings == null || findings.isEmpty()) return;

        Double compositeScore = scoredResult.get("composite_risk_score") instanceof Number
                ? ((Number) scoredResult.get("composite_risk_score")).doubleValue() : 50.0;
        String priority = (String) scoredResult.getOrDefault("priority_level", "P2_MEDIUM");
        String rationale = (String) scoredResult.getOrDefault("explainable_rationale", "Calculated risk score");

        // Agent 4 returns per-finding scores in scored_findings; prefer those when present
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

        for (Map<String, Object> f : findings) {
            String hash = (String) f.get("fingerprint_hash");
            if (hash == null) continue;

            Map<String, Object> scored = scoredByHash.get(hash);
            final double findingScore = scored != null && scored.get("composite_risk_score") instanceof Number n
                    ? n.doubleValue() : compositeScore;
            final String findingPriority = scored != null && scored.get("priority_level") instanceof String p
                    ? p : priority;
            final String findingRationale = scored != null && scored.get("explainable_rationale") instanceof String r
                    ? r : rationale;

            canonicalVulnerabilityRepository.findByFingerprintHash(hash).ifPresent(vuln -> {
                if (riskScoreRepository.findByFinding_FindingId(vuln.getFindingId()).isEmpty()) {
                    RiskScore riskScore = RiskScore.builder()
                            .finding(vuln)
                            .compositeRiskScore(findingScore)
                            .priorityLevel(findingPriority)
                            .explainableRationale(findingRationale)
                            .calculatedAt(LocalDateTime.now())
                            .build();
                    riskScoreRepository.save(riskScore);
                }
            });
        }
    }

    private void updateScanJobStatus(UUID scanId, String status) {
        scanJobRepository.findById(scanId).ifPresent(job -> {
            job.setStatus(status);
            scanJobRepository.save(job);
        });
    }

    private void updateScanJobCompleted(UUID scanId) {
        scanJobRepository.findById(scanId).ifPresent(job -> {
            job.setStatus("COMPLETED");
            job.setCompletedAt(LocalDateTime.now());
            scanJobRepository.save(job);
        });
    }

    private void handlePipelineFailure(UUID scanId, String errorMessage) {
        log.error("Pipeline failure for scan {}: {}", scanId, errorMessage);
        PipelineState state = pipelineCache.get(scanId);
        if (state != null) {
            state.status = "FAILED";
            state.currentStageOutput = Collections.singletonMap("error", errorMessage);
        }
        updateScanJobStatus(scanId, "FAILED");
        broadcastStatus(scanId, "FAILED", state != null ? state.currentStage : 0, errorMessage);
    }

    private void broadcastStatus(UUID scanId, String status, int stage, Object payload) {
        Map<String, Object> message = new HashMap<>();
        message.put("scan_id", scanId);
        message.put("status", status);
        message.put("current_stage", stage);
        message.put("payload", payload);
        message.put("timestamp", LocalDateTime.now().toString());

        try {
            messagingTemplate.convertAndSend("/topic/pipeline", (Object) message);
            messagingTemplate.convertAndSend("/topic/scans/" + scanId, (Object) message);
        } catch (Exception e) {
            log.warn("STOMP broadcast failed: {}", e.getMessage());
        }

        try {
            pipelineWebSocketHandler.broadcast(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            log.warn("Raw WebSocket broadcast failed: {}", e.getMessage());
        }
    }

    public ScanStatusResponse buildStatusResponse(ScanJob scanJob) {
        PipelineState state = pipelineCache.get(scanJob.getScanId());

        return ScanStatusResponse.builder()
                .scanId(scanJob.getScanId())
                .assetId(scanJob.getAsset() != null ? scanJob.getAsset().getAssetId() : null)
                .status(scanJob.getStatus())
                .scannersUsed(scanJob.getScannersUsed())
                .startedAt(scanJob.getStartedAt())
                .completedAt(scanJob.getCompletedAt())
                .currentStage(state != null ? state.currentStage : 0)
                .agentOutput(state != null ? state.currentStageOutput : null)
                .build();
    }
}
