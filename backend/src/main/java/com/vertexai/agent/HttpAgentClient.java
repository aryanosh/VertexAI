package com.vertexai.agent;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@ConditionalOnProperty(name = "app.python-agents.mock", havingValue = "false", matchIfMissing = true)
public class HttpAgentClient implements AgentClient {

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public HttpAgentClient(
            RestTemplateBuilder builder,
            @Value("${app.python-agents.base-url:http://localhost:8000}") String baseUrl) {
        this.restTemplate = builder
                .setConnectTimeout(Duration.ofSeconds(10))
                .setReadTimeout(Duration.ofSeconds(60))
                .build();
        this.baseUrl = baseUrl;
    }

    @Override
    public List<Map<String, Object>> parseReports(Map<String, Object> rawReports) {
        String url = baseUrl + "/api/v1/agent1/parse";
        log.info("Calling Agent 1 Parser at: {}", url);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(rawReports, headers);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {
                    });
            if (response.getBody() != null && response.getBody().containsKey("findings")) {
                Object findings = response.getBody().get("findings");
                if (findings instanceof List) {
                    return (List<Map<String, Object>>) findings;
                }
            }
            return Collections.emptyList();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 1 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 1 Parser invocation failed: " + e.getMessage(), e);
        }
    }

    /**
     * Agent 2's full raw response body (statistics + dedup_detail) from its most
     * recent run, so the orchestrator can persist and serve the per-finding dedup
     * report without re-shaping this client's return type.
     */
    private volatile Map<String, Object> lastDedupResponse = Collections.emptyMap();

    @Override
    public Map<String, Object> getLastDedupResponse() {
        return lastDedupResponse;
    }

    @Override
    public List<Map<String, Object>> reduceNoise(List<Map<String, Object>> unifiedFindings) {
        String url = baseUrl + "/api/v1/agent2/reduce-noise";
        log.info("Calling Agent 2 Noise Reducer at: {}", url);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> payload = Collections.singletonMap("findings", unifiedFindings);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {
                    });
            if (response.getBody() != null) {
                this.lastDedupResponse = response.getBody();
                Object findings = response.getBody().get("findings");
                if (findings instanceof List) {
                    return (List<Map<String, Object>>) findings;
                }
            } else {
                this.lastDedupResponse = Collections.emptyMap();
            }
            return Collections.emptyList();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 2 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 2 Noise Reduction invocation failed: " + e.getMessage(), e);
        }
    }

    /**
     * Provenance reported by Agent 3 on its most recent run: {@code LIVE_FEEDS} or
     * {@code MOCK_FIXTURES}. Surfaced so the dashboard can state plainly whether
     * threat
     * intelligence came from live CISA KEV / FIRST EPSS calls or bundled offline
     * fixtures.
     */
    private volatile String lastIntelSource = "UNKNOWN";

    /**
     * How Agent 3 reached its conclusions on the most recent run: {@code AGENTIC}
     * (the model
     * chose which intel tools to call), {@code AGENTIC_PARTIAL} (some CVEs fell
     * back), or
     * {@code DETERMINISTIC} (the original fixed two-call sequence).
     */
    private volatile String lastReasoningMode = "UNKNOWN";

    public String getLastIntelSource() {
        return lastIntelSource;
    }

    public String getLastReasoningMode() {
        return lastReasoningMode;
    }

    @Override
    public List<Map<String, Object>> enrichThreats(List<Map<String, Object>> canonicalFindings) {
        String url = baseUrl + "/api/v1/agent3/enrich";
        log.info("Calling Agent 3 Threat Intelligence at: {}", url);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> payload = Collections.singletonMap("findings", canonicalFindings);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {
                    });
            if (response.getBody() != null) {
                Object src = response.getBody().get("intel_source");
                if (src instanceof String s) {
                    this.lastIntelSource = s;
                    if ("MOCK_FIXTURES".equals(s)) {
                        log.warn("Agent 3 enriched findings from OFFLINE MOCK FIXTURES (USE_MOCKS=true). "
                                + "These are NOT live CISA KEV / FIRST EPSS results.");
                    } else {
                        log.info("Agent 3 enriched findings from LIVE threat intelligence feeds");
                    }
                }

                Object mode = response.getBody().get("reasoning_mode");
                if (mode instanceof String m) {
                    this.lastReasoningMode = m;
                    Object toolsUsed = response.getBody().get("tools_used");
                    Object fallback = response.getBody().get("fallback_reason");
                    if (m.startsWith("AGENTIC")) {
                        log.info("Agent 3 reasoning mode: {} — tools selected by the agent: {}", m, toolsUsed);
                        if (fallback != null) {
                            log.warn("Agent 3 partially fell back to deterministic lookup: {}", fallback);
                        }
                    } else {
                        log.info("Agent 3 reasoning mode: DETERMINISTIC ({})",
                                fallback != null ? fallback : "agentic reasoning disabled");
                    }
                }
                if (response.getBody().containsKey("findings")) {
                    Object findings = response.getBody().get("findings");
                    if (findings instanceof List) {
                        return (List<Map<String, Object>>) findings;
                    }
                }
            }
            return Collections.emptyList();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 3 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 3 Threat Intelligence invocation failed: " + e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> scoreAndPrepareTicket(Map<String, Object> scoringPayload) {
        String url = baseUrl + "/api/v1/agent4/score-and-ticket";
        log.info("Calling Agent 4 Risk Scoring & Ticket Prep at: {}", url);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(scoringPayload, headers);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {
                    });
            return response.getBody() != null ? response.getBody() : Collections.emptyMap();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 4 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 4 Scoring & Ticket Prep invocation failed: " + e.getMessage(), e);
        }
    }
}
