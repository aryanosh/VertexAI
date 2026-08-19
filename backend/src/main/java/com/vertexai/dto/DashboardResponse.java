package com.vertexai.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardResponse {

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
