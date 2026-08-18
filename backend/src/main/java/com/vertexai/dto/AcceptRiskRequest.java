package com.vertexai.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AcceptRiskRequest {

    @NotBlank(message = "Reason for accepting risk is required")
    private String reason;
}
