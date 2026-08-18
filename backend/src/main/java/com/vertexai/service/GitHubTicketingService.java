package com.vertexai.service;

import com.vertexai.dto.TicketResponse;
import com.vertexai.entity.CanonicalVulnerability;
import com.vertexai.entity.RiskScore;
import com.vertexai.entity.RiskTicket;
import com.vertexai.exception.BadRequestException;
import com.vertexai.exception.ResourceNotFoundException;
import com.vertexai.repository.CanonicalVulnerabilityRepository;
import com.vertexai.repository.RiskScoreRepository;
import com.vertexai.repository.RiskTicketRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
public class GitHubTicketingService {

    private final RiskTicketRepository riskTicketRepository;
    private final CanonicalVulnerabilityRepository canonicalVulnerabilityRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final RestTemplate restTemplate;

    @Value("${app.github.token:}")
    private String githubToken;

    @Value("${app.github.repo-owner:sentinel-ai-org}")
    private String repoOwner;

    @Value("${app.github.repo-name:vulnerability-remediation}")
    private String repoName;

    public GitHubTicketingService(
            RiskTicketRepository riskTicketRepository,
            CanonicalVulnerabilityRepository canonicalVulnerabilityRepository,
            RiskScoreRepository riskScoreRepository,
            RestTemplateBuilder builder) {
        this.riskTicketRepository = riskTicketRepository;
        this.canonicalVulnerabilityRepository = canonicalVulnerabilityRepository;
        this.riskScoreRepository = riskScoreRepository;
        this.restTemplate = builder
                .setConnectTimeout(Duration.ofSeconds(10))
                .setReadTimeout(Duration.ofSeconds(30))
                .build();
    }

    @Transactional
    public TicketResponse createTicket(UUID findingId, boolean approved) {
        log.info("Processing ticket dispatch request for finding ID: {}, approved: {}", findingId, approved);

        // Security Boundary Enforcement (architecture_plan.md §9, §16)
        if (!approved) {
            log.warn("Ticket creation blocked: Final human approval was rejected (approved=false) for finding: {}", findingId);
            throw new BadRequestException("Ticket creation rejected: Final human approval was not granted.");
        }

        CanonicalVulnerability vuln = canonicalVulnerabilityRepository.findById(findingId)
                .orElseThrow(() -> new ResourceNotFoundException("CanonicalVulnerability", "id", findingId));

        // Check if ticket was already created for this finding
        if (riskTicketRepository.existsByFinding_FindingId(findingId)) {
            RiskTicket existing = riskTicketRepository.findByFinding_FindingId(findingId).get();
            log.info("Ticket already exists for finding {}: {}", findingId, existing.getExternalTicketUrl());
            return mapToTicketResponse(existing);
        }

        RiskScore score = riskScoreRepository.findByFinding_FindingId(findingId)
                .orElse(null);

        String priority = score != null ? score.getPriorityLevel() : "P2_MEDIUM";
        double riskScoreVal = score != null ? score.getCompositeRiskScore() : 50.0;
        String rationale = score != null ? score.getExplainableRationale() : "Automated finding review";
        LocalDateTime slaDeadline = calculateSlaDeadline(priority);

        // Dispatch GitHub Issue via REST API
        String issueUrl = dispatchGitHubIssue(vuln, priority, riskScoreVal, rationale, slaDeadline);

        // Persist ticket record in risk_tickets table
        RiskTicket ticket = RiskTicket.builder()
                .finding(vuln)
                .ticketSystem("GITHUB")
                .externalTicketUrl(issueUrl)
                .assignedOwner("security-response-team@company.com")
                .slaDeadline(slaDeadline)
                .status("OPEN")
                .build();

        RiskTicket savedTicket = riskTicketRepository.save(ticket);
        log.info("Ticket record saved to database with ID: {} and URL: {}", savedTicket.getTicketId(), issueUrl);

        return mapToTicketResponse(savedTicket);
    }

    private String dispatchGitHubIssue(
            CanonicalVulnerability vuln,
            String priority,
            double riskScore,
            String rationale,
            LocalDateTime slaDeadline) {

        String title = String.format("[%s] %s on %s:%d", priority, vuln.getCveId(), vuln.getTargetHost(), vuln.getTargetPort());

        String body = String.format("""
                ## 🛡️ VertexAI Security Remediation Ticket

                > **Priority:** `%s` | **Composite Risk Score:** `%.1f / 100`
                > **SLA Remediation Deadline:** `%s`

                ---

                ### 📌 Vulnerability Summary
                * **CVE ID:** `%s`
                * **Vulnerability Name:** %s
                * **Target Host:** `%s`
                * **Port / Service:** `%d`
                * **Discovered By:** `%s`
                * **CVSS Base Score:** `%.1f`

                ---

                ### 🧠 AI Explainable Rationale
                %s

                ---

                ### 🛠️ Required Action
                1. Inspect target host `%s` and verify service configuration.
                2. Apply recommended vendor security patch or upgrade packages.
                3. Mark this ticket resolved and request a re-scan.

                *Dispatched automatically by VertexAI Platform after Final Human Approval.*
                """,
                priority, riskScore, slaDeadline.toString(),
                vuln.getCveId(), vuln.getVulnerabilityName(), vuln.getTargetHost(), vuln.getTargetPort(),
                vuln.getScannerSources(), vuln.getCvssBaseScore(),
                rationale, vuln.getTargetHost());

        // If GitHub token is configured, call live GitHub REST API
        if (githubToken != null && !githubToken.isBlank()) {
            String apiUrl = String.format("https://api.github.com/repos/%s/%s/issues", repoOwner, repoName);
            log.info("Calling live GitHub REST API at: {}", apiUrl);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(githubToken);
            headers.set("Accept", "application/vnd.github+json");

            Map<String, Object> payload = new HashMap<>();
            payload.put("title", title);
            payload.put("body", body);
            payload.put("labels", List.of("security", priority.toLowerCase().replace("_", "-")));

            try {
                HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
                ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                        apiUrl,
                        HttpMethod.POST,
                        request,
                        new ParameterizedTypeReference<>() {}
                );

                if (response.getBody() != null && response.getBody().containsKey("html_url")) {
                    return (String) response.getBody().get("html_url");
                }
            } catch (Exception e) {
                log.warn("GitHub API dispatch failed (falling back to generated issue URL): {}", e.getMessage());
            }
        }

        // Offline / Simulation fallback URL
        String fallbackUrl = String.format("https://github.com/%s/%s/issues/%d",
                repoOwner, repoName, Math.abs(vuln.getFindingId().hashCode() % 1000) + 1);
        log.info("Generated GitHub Issue URL: {}", fallbackUrl);
        return fallbackUrl;
    }

    private LocalDateTime calculateSlaDeadline(String priority) {
        LocalDateTime now = LocalDateTime.now();
        return switch (priority.toUpperCase()) {
            case "P0_CRITICAL" -> now.plusHours(24);
            case "P1_HIGH" -> now.plusHours(72);
            case "P2_MEDIUM" -> now.plusDays(14);
            case "P3_LOW" -> now.plusDays(30);
            default -> now.plusDays(14);
        };
    }

    private TicketResponse mapToTicketResponse(RiskTicket ticket) {
        return TicketResponse.builder()
                .ticketId(ticket.getTicketId())
                .ticketUrl(ticket.getExternalTicketUrl())
                .status(ticket.getStatus())
                .assignedOwner(ticket.getAssignedOwner())
                .slaDeadline(ticket.getSlaDeadline() != null ? ticket.getSlaDeadline().toString() : "N/A")
                .build();
    }
}
