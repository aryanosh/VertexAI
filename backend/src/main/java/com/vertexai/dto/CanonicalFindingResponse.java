package com.vertexai.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CanonicalFindingResponse {

    @JsonProperty("finding_id")
    private UUID findingId;

    @JsonProperty("fingerprint_hash")
    private String fingerprintHash;

    @JsonProperty("cve_id")
    private String cveId;

    @JsonProperty("vulnerability_name")
    private String vulnerabilityName;

    @JsonProperty("target_host")
    private String targetHost;

    @JsonProperty("target_port")
    private Integer targetPort;

    @JsonProperty("scanner_sources")
    private List<String> scannerSources;

    @JsonProperty("false_positive_prob")
    private Double falsePositiveProb;

    @JsonProperty("is_suppressed")
    private Boolean isSuppressed;

    @JsonProperty("is_accepted_risk")
    private Boolean isAcceptedRisk;

    @JsonProperty("is_cisa_kev")
    private Boolean isCisaKev;

    @JsonProperty("epss_score")
    private Double epssScore;

    @JsonProperty("composite_risk_score")
    private Double compositeRiskScore;

    @JsonProperty("priority_level")
    private String priorityLevel;

    @JsonProperty("sla_deadline")
    private String slaDeadline;

    @JsonProperty("explainable_rationale")
    private String explainableRationale;

    // ------------------------------------------------------------------
    // Per-finding ticket state.
    //
    // Without these fields the dashboard had no server-side truth about which
    // findings already had a GitHub ticket, so it tracked dispatch state in
    // ephemeral React state. That state bled across findings (dispatching a
    // ticket for one finding made others render as already dispatched) and was
    // lost on every page reload. These fields make ticket state authoritative.
    // ------------------------------------------------------------------

    /**
     * Live GitHub issue URL for THIS finding, or null when no ticket exists yet.
     */
    @JsonProperty("ticket_url")
    private String ticketUrl;

    /** Ticket lifecycle status (e.g. OPEN), or null when no ticket exists yet. */
    @JsonProperty("ticket_status")
    private String ticketStatus;

    /** True only when this specific finding has a dispatched ticket. */
    @JsonProperty("has_ticket")
    private Boolean hasTicket;

    /**
     * Agent 4's ticket-ready draft (title/body/labels/suggested owner/SLA) as raw
     * JSON, so the frontend can preview the proposed GitHub issue before a human
     * approves ticket creation. Null until Agent 4 has scored this finding.
     */
    @JsonProperty("ticket_payload")
    private String ticketPayload;
}
