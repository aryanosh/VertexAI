package com.vertexai.service;

import com.vertexai.dto.CanonicalFindingResponse;
import com.vertexai.dto.DashboardResponse;
import com.vertexai.entity.CanonicalVulnerability;
import com.vertexai.entity.RiskScore;
import com.vertexai.repository.CanonicalVulnerabilityRepository;
import com.vertexai.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final CanonicalVulnerabilityRepository canonicalVulnerabilityRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final VulnerabilityService vulnerabilityService;

    @Transactional(readOnly = true)
    public DashboardResponse getDashboardMetrics() {
        log.info("Calculating live dashboard security metrics from database...");

        long totalFindings = canonicalVulnerabilityRepository.count();
        long suppressedFindings = canonicalVulnerabilityRepository.countByIsSuppressedTrue();
        long activeFindings = canonicalVulnerabilityRepository.countByIsSuppressedFalse();

        // Calculate live noise reduction percentage (measured, NOT hardcoded)
        double noiseReductionPercent = 0.0;
        if (totalFindings > 0) {
            noiseReductionPercent = Math.round(((double) suppressedFindings / totalFindings) * 1000.0) / 10.0;
        }

        // Calculate live organizational security score: 100 - average risk score of active findings
        Double avgRisk = riskScoreRepository.calculateAverageRiskScore();
        double securityScore = 100.0;
        if (avgRisk != null && activeFindings > 0) {
            securityScore = Math.max(0.0, Math.min(100.0, Math.round((100.0 - avgRisk) * 10.0) / 10.0));
        }

        // Fetch top threats ordered by risk score descending
        List<CanonicalFindingResponse> topThreats = riskScoreRepository.findTopThreatsOrdered().stream()
                .limit(5)
                .map(RiskScore::getFinding)
                .map(vulnerabilityService::mapToFindingResponse)
                .collect(Collectors.toList());

        log.info("Live metrics: securityScore={}, totalFindings={}, noiseReduction={}%",
                securityScore, totalFindings, noiseReductionPercent);

        return DashboardResponse.builder()
                .securityScore(securityScore)
                .totalFindings(totalFindings)
                .suppressedFindings(suppressedFindings)
                .activeFindings(activeFindings)
                .noiseReductionPercent(noiseReductionPercent)
                .topThreats(topThreats)
                .build();
    }
}
