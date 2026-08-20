package com.vertexai.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardResponse {

    /**
     * The scan these metrics were computed for — echoed back so the frontend can
     * display "showing results for scan X" and detect a mismatch if it expected a
     * different run than the one actually resolved (e.g. "no scan_id given, defaulted
     * to the latest real scan"). Null only when there is no real (non-seed) scan yet.
     */
    @JsonProperty("scan_id")
    private UUID scanId;

    @JsonProperty("security_score")
    private Double securityScore;

    @JsonProperty("total_findings")
    private Long totalFindings;

    @JsonProperty("suppressed_findings")
    private Long suppressedFindings;

    @JsonProperty("active_findings")
    private Long activeFindings;

    @JsonProperty("noise_reduction_percent")
    private Double noiseReductionPercent;

    /** Findings detected before AI noise reduction (total canonical findings). */
    @JsonProperty("before_noise")
    private Long beforeNoise;

    /** Findings remaining after AI noise reduction (active, non-suppressed). */
    @JsonProperty("after_noise")
    private Long afterNoise;

    @JsonProperty("top_threats")
    private List<CanonicalFindingResponse> topThreats;
}
