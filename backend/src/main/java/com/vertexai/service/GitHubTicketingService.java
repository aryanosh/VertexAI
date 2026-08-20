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
import org.springframework.web.client.HttpClientErrorException;
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

    @Value("${app.github.repo-owner:aryanosh}")
    private String repoOwner;

    @Value("${app.github.repo-name:VertexAI}")
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

        // Check if ticket was already created with a live ticket URL
        RiskTicket existing = riskTicketRepository.findByFinding_FindingId(findingId).orElse(null);
        if (existing != null && existing.getExternalTicketUrl() != null 
                && !existing.getExternalTicketUrl().endsWith("/issues/1") 
                && !existing.getExternalTicketUrl().endsWith("/issues")
                && !existing.getExternalTicketUrl().endsWith("/pull/1")) {
            log.info("Valid live ticket already exists for finding {}: {}", findingId, existing.getExternalTicketUrl());
            return mapToTicketResponse(existing);
        }

        // Independently verify a RiskScore exists rather than trusting the caller's
        // `approved` flag alone — Agent 4 must have actually scored this finding
        // before any GitHub ticket can be dispatched.
        RiskScore score = riskScoreRepository.findByFinding_FindingId(findingId)
                .orElseThrow(() -> {
                    log.warn("Ticket creation blocked: no RiskScore found for finding {} — Agent 4 has not scored it yet",
                            findingId);
                    return new BadRequestException(
                            "Cannot create ticket: no risk score exists for this finding. "
                                    + "Complete the risk-scoring stage (Agent 4) and re-approve before dispatching a ticket.");
                });

        String priority = score.getPriorityLevel();
        double riskScoreVal = score.getCompositeRiskScore();
        String rationale = score.getExplainableRationale();
        LocalDateTime slaDeadline = calculateSlaDeadline(priority);

        // Dispatch GitHub Issue via REST API
        String issueUrl = dispatchGitHubIssue(vuln, priority, riskScoreVal, rationale, slaDeadline);

        // Persist or update ticket record in risk_tickets table
        RiskTicket ticket = existing != null ? existing : RiskTicket.builder().finding(vuln).build();
        ticket.setTicketSystem("GITHUB");
        ticket.setExternalTicketUrl(issueUrl);
        ticket.setAssignedOwner("security-response-team@company.com");
        ticket.setSlaDeadline(slaDeadline);
        ticket.setStatus("OPEN");

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

        // A GitHub token is required to actually create an issue. Previously, when no
        // valid token was configured, this method silently returned the repo's generic
        // issues-list URL (https://github.com/{owner}/{repo}/issues) and the caller stored
        // it as a successful ticket — which looked like a real issue link in the UI even
        // though no GitHub API call was ever made and no issue was ever created. Fail loudly
        // instead, so a missing token is never mistaken for a dispatched ticket.
        if (githubToken == null || githubToken.isBlank() || githubToken.startsWith("dummy") || githubToken.startsWith("ghp_placeholder")) {
            log.error("Ticket dispatch blocked: GITHUB_TOKEN is not configured for repository {}/{}", repoOwner, repoName);
            throw new BadRequestException(
                    "Cannot create GitHub issue: GITHUB_TOKEN is not configured. Set a valid GitHub personal access " +
                            "token (with Issues: read-and-write on " + repoOwner + "/" + repoName + ") in the backend environment.");
        }

        String apiUrl = String.format("https://api.github.com/repos/%s/%s/issues", repoOwner, repoName);
        log.info("Calling live GitHub REST API at: {} for repo {}/{}", apiUrl, repoOwner, repoName);

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
                String liveUrl = (String) response.getBody().get("html_url");
                log.info("Live GitHub Issue created successfully: {}", liveUrl);
                return liveUrl;
            }

            // GitHub returned 2xx but the response body didn't contain the expected field —
            // this is not a successful issue creation, so it must not be treated as one.
            log.error("GitHub API returned an unexpected response body (no html_url): {}", response.getBody());
            throw new BadRequestException("GitHub API response did not contain an issue URL (html_url). " +
                    "Response: " + response.getBody());
        } catch (HttpClientErrorException e) {
            String errorDetails = e.getResponseBodyAsString();
            log.error("GitHub API returned error {}: {}", e.getStatusCode(), errorDetails);
            throw new BadRequestException("GitHub ticket dispatch failed (" + e.getStatusCode() + "): " +
                    (errorDetails.contains("message") ? errorDetails : e.getMessage()) +
                    ". Verify GITHUB_TOKEN and access to repository " + repoOwner + "/" + repoName);
        } catch (Exception e) {
            log.error("GitHub API communication failure: {}", e.getMessage());
            throw new BadRequestException("Failed to contact GitHub API: " + e.getMessage());
        }
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
