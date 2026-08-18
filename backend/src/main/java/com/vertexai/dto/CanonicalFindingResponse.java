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
}
