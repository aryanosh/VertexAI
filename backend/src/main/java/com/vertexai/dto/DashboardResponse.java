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

    @JsonProperty("top_threats")
    private List<CanonicalFindingResponse> topThreats;
}
