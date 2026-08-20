package com.vertexai.service;

import com.vertexai.dto.CanonicalFindingResponse;
import com.vertexai.dto.DashboardResponse;
import com.vertexai.entity.RiskScore;
import com.vertexai.entity.ScanJob;
import com.vertexai.exception.ResourceNotFoundException;
import com.vertexai.repository.CanonicalVulnerabilityRepository;
import com.vertexai.repository.RiskScoreRepository;
import com.vertexai.repository.ScanJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final CanonicalVulnerabilityRepository canonicalVulnerabilityRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final ScanJobRepository scanJobRepository;
    private final VulnerabilityService vulnerabilityService;

    /**
     * Scan-scoped dashboard metrics — every number here is computed only from rows
     * tagged with the resolved scan_id, never a global all-time aggregate. Previously
     * this method queried every table unfiltered (plus two hardcoded fallback numbers,
     * 2500/15), so a fresh scan's dashboard would silently include every prior scan's
     * findings and the permanent seed rows mixed together — the root cause of
     * "random"-looking metrics between runs.
     *
     * @param requestedScanId explicit run to show, or null to default to the most
     *                        recent real (non-seed) scan
     */
    @Transactional(readOnly = true)
    public DashboardResponse getDashboardMetrics(UUID requestedScanId) {
        UUID scanId = resolveScanId(requestedScanId);
        if (scanId == null) {
            log.info("No scan_id given and no completed scan exists yet — returning empty dashboard");
            return DashboardResponse.builder()
                    .scanId(null)
                    .securityScore(null)
                    .totalFindings(0L)
                    .suppressedFindings(0L)
                    .activeFindings(0L)
                    .noiseReductionPercent(0.0)
                    .beforeNoise(0L)
                    .afterNoise(0L)
                    .topThreats(List.of())
                    .build();
        }

        log.info("Calculating dashboard metrics for scan_id={}", scanId);

        long totalFindings = canonicalVulnerabilityRepository.countByScanJobId(scanId);
        long suppressedFindings = canonicalVulnerabilityRepository.countByScanJobIdAndIsSuppressedTrue(scanId);
        long activeFindings = canonicalVulnerabilityRepository.countByScanJobIdAndIsSuppressedFalse(scanId);

        // Real Before (Agent 1's raw output, persisted per-run) vs After (this run's
        // actual persisted canonical rows) — both scoped to this exact scan_id.
        ScanJob job = scanJobRepository.findById(scanId).orElse(null);
        long rawBefore = job != null && job.getRawFindingsCount() != null ? job.getRawFindingsCount() : totalFindings;
        long dedupAfter = totalFindings;

        double noiseReductionPercent = 0.0;
        if (rawBefore > 0) {
            noiseReductionPercent = Math.round(((double) (rawBefore - dedupAfter) / rawBefore) * 1000.0) / 10.0;
        }

        Double avgRisk = riskScoreRepository.calculateAverageRiskScoreForScan(scanId);
        double securityScore = 100.0;
        if (avgRisk != null && activeFindings > 0) {
            securityScore = Math.max(0.0, Math.min(100.0, Math.round((100.0 - avgRisk) * 10.0) / 10.0));
        }

        List<CanonicalFindingResponse> topThreats = riskScoreRepository.findTopThreatsForScan(scanId).stream()
                .limit(5)
                .map(RiskScore::getFinding)
                .map(vulnerabilityService::mapToFindingResponse)
                .collect(Collectors.toList());

        log.info("Scan-scoped metrics scan_id={}: securityScore={}, totalFindings={}, rawBefore={}, dedupAfter={}, noiseReduction={}%",
                scanId, securityScore, totalFindings, rawBefore, dedupAfter, noiseReductionPercent);

        return DashboardResponse.builder()
                .scanId(scanId)
                .securityScore(securityScore)
                .totalFindings(totalFindings)
                .suppressedFindings(suppressedFindings)
                .activeFindings(activeFindings)
                .noiseReductionPercent(noiseReductionPercent)
                .beforeNoise(rawBefore)
                .afterNoise(dedupAfter)
                .topThreats(topThreats)
                .build();
    }

    /**
     * Resolves an explicit scan_id (validating it exists) or defaults to the most
     * recent completed non-seed scan; falls back to the most recent non-seed scan of
     * any status if none are completed yet; returns null only when no real scan has
     * ever been run.
     */
    UUID resolveScanId(UUID requestedScanId) {
        if (requestedScanId != null) {
            scanJobRepository.findById(requestedScanId)
                    .orElseThrow(() -> new ResourceNotFoundException("ScanJob", "id", requestedScanId));
            return requestedScanId;
        }
        return scanJobRepository.findLatestCompletedNonSeed()
                .or(scanJobRepository::findLatestNonSeed)
                .map(ScanJob::getScanId)
                .orElse(null);
    }
}
