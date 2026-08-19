package com.vertexai.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.*;

@Slf4j
@Service
@ConditionalOnProperty(name = "app.python-agents.mock", havingValue = "true")
public class MockAgentClient implements AgentClient {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public List<Map<String, Object>> parseReports(Map<String, Object> rawReports) {
        log.info("[MOCK] Agent 1 Parser invoked with {} reports", rawReports != null ? rawReports.size() : 0);
        return loadMockList("mocks/agent1_response.json", createFallbackAgent1());
    }

    @Override
    public List<Map<String, Object>> reduceNoise(List<Map<String, Object>> unifiedFindings) {
        log.info("[MOCK] Agent 2 Noise Reduction invoked with {} findings", unifiedFindings != null ? unifiedFindings.size() : 0);
        return loadMockList("mocks/agent2_response.json", createFallbackAgent2());
    }

    @Override
    public List<Map<String, Object>> enrichThreats(List<Map<String, Object>> canonicalFindings) {
        log.info("[MOCK] Agent 3 Threat Intelligence invoked with {} findings", canonicalFindings != null ? canonicalFindings.size() : 0);
        return loadMockList("mocks/agent3_response.json", createFallbackAgent3());
    }

    @Override
    public Map<String, Object> scoreAndPrepareTicket(Map<String, Object> scoringPayload) {
        log.info("[MOCK] Agent 4 Scoring & Ticket Prep invoked");
        return loadMockMap("mocks/agent4_response.json", createFallbackAgent4());
    }

    private List<Map<String, Object>> loadMockList(String resourcePath, List<Map<String, Object>> fallback) {
        try {
            ClassPathResource resource = new ClassPathResource(resourcePath);
            if (resource.exists()) {
                try (InputStream is = resource.getInputStream()) {
                    return objectMapper.readValue(is, new TypeReference<>() {});
                }
            }
        } catch (Exception e) {
            log.warn("Could not load mock resource at {}: {}. Using in-memory fallback.", resourcePath, e.getMessage());
        }
        return fallback;
    }

    private Map<String, Object> loadMockMap(String resourcePath, Map<String, Object> fallback) {
        try {
            ClassPathResource resource = new ClassPathResource(resourcePath);
            if (resource.exists()) {
                try (InputStream is = resource.getInputStream()) {
                    return objectMapper.readValue(is, new TypeReference<>() {});
                }
            }
        } catch (Exception e) {
            log.warn("Could not load mock resource at {}: {}. Using in-memory fallback.", resourcePath, e.getMessage());
        }
        return fallback;
    }

    private List<Map<String, Object>> createFallbackAgent1() {
        Map<String, Object> finding1 = new HashMap<>();
        finding1.put("cve_id", "CVE-2021-44228");
        finding1.put("vulnerability_name", "Apache Log4j Remote Code Execution");
        finding1.put("target_host", "10.0.1.10");
        finding1.put("target_port", 8080);
        finding1.put("scanner_source", "NUCLEI");
        finding1.put("cvss_score", 10.0);
        return List.of(finding1);
    }

    private List<Map<String, Object>> createFallbackAgent2() {
        Map<String, Object> finding = new HashMap<>();
        finding.put("fingerprint_hash", "e4d909c290d0fb1ca068ffaddf22cbd0");
        finding.put("cve_id", "CVE-2021-44228");
        finding.put("vulnerability_name", "Apache Log4j Remote Code Execution");
        finding.put("target_host", "10.0.1.10");
        finding.put("target_port", 8080);
        finding.put("scanner_sources", List.of("NUCLEI", "OWASP_ZAP"));
        finding.put("cvss_base_score", 10.0);
        finding.put("false_positive_prob", 0.02);
        finding.put("is_suppressed", false);
        return List.of(finding);
    }

    private List<Map<String, Object>> createFallbackAgent3() {
        Map<String, Object> finding = new HashMap<>();
        finding.put("fingerprint_hash", "e4d909c290d0fb1ca068ffaddf22cbd0");
        finding.put("cve_id", "CVE-2021-44228");
        finding.put("is_cisa_kev", true);
        finding.put("epss_score", 0.975);
        finding.put("epss_percentile", 0.999);
        finding.put("exploit_db_available", true);
        return List.of(finding);
    }

    private Map<String, Object> createFallbackAgent4() {
        Map<String, Object> result = new HashMap<>();
        result.put("composite_risk_score", 96.5);
        result.put("priority_level", "P0_CRITICAL");
        result.put("sla_deadline", "2026-08-17T18:00:00Z");
        result.put("explainable_rationale", "Score elevated to P0 Critical: Actively listed in CISA KEV and EPSS probability is 97.5% on a production asset.");

        Map<String, Object> ticketPayload = new HashMap<>();
        ticketPayload.put("title", "[P0 CRITICAL] CVE-2021-44228 Log4j RCE on 10.0.1.10");
        ticketPayload.put("body", "### Vulnerability Notice\n**Severity:** P0 Critical\n**Target:** 10.0.1.10:8080\n**Remediation:** Upgrade log4j to >= 2.17.1");
        result.put("ticket_payload", ticketPayload);

        return result;
    }
}
