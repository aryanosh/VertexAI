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
            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {}
            );
            return response.getBody() != null ? response.getBody() : Collections.emptyList();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 1 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 1 Parser invocation failed: " + e.getMessage(), e);
        }
    }

    @Override
    public List<Map<String, Object>> reduceNoise(List<Map<String, Object>> unifiedFindings) {
        String url = baseUrl + "/api/v1/agent2/reduce-noise";
        log.info("Calling Agent 2 Noise Reducer at: {}", url);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<List<Map<String, Object>>> request = new HttpEntity<>(unifiedFindings, headers);

        try {
            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {}
            );
            return response.getBody() != null ? response.getBody() : Collections.emptyList();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 2 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 2 Noise Reduction invocation failed: " + e.getMessage(), e);
        }
    }

    @Override
    public List<Map<String, Object>> enrichThreats(List<Map<String, Object>> canonicalFindings) {
        String url = baseUrl + "/api/v1/agent3/enrich";
        log.info("Calling Agent 3 Threat Intelligence at: {}", url);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<List<Map<String, Object>>> request = new HttpEntity<>(canonicalFindings, headers);

        try {
            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    request,
                    new ParameterizedTypeReference<>() {}
            );
            return response.getBody() != null ? response.getBody() : Collections.emptyList();
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
                    new ParameterizedTypeReference<>() {}
            );
            return response.getBody() != null ? response.getBody() : Collections.emptyMap();
        } catch (Exception e) {
            log.error("Failed to invoke Agent 4 at {}: {}", url, e.getMessage());
            throw new RuntimeException("Agent 4 Scoring & Ticket Prep invocation failed: " + e.getMessage(), e);
        }
    }
}
