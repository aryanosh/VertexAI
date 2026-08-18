package com.vertexai.dto;

import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AssetResponse {

    private UUID assetId;
    private String hostname;
    private String ipAddress;
    private String environment;
    private Integer criticalityRating;
    private String ownerEmail;
    private Boolean isAuthorized;
    private LocalDateTime createdAt;
}
