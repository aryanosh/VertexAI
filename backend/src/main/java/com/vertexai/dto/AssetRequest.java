package com.vertexai.dto;

import jakarta.validation.constraints.*;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AssetRequest {

    @NotBlank(message = "Hostname is required")
    private String hostname;

    private String ipAddress;

    @Pattern(regexp = "^(PRODUCTION|STAGING|DEV)$", message = "Environment must be PRODUCTION, STAGING, or DEV")
    private String environment;

    @Min(value = 1, message = "Criticality rating must be between 1 and 5")
    @Max(value = 5, message = "Criticality rating must be between 1 and 5")
    private Integer criticalityRating;

    @NotBlank(message = "Owner email is required")
    @Email(message = "Owner email must be a valid email address")
    private String ownerEmail;

    @Builder.Default
    private Boolean isAuthorized = true;
}
