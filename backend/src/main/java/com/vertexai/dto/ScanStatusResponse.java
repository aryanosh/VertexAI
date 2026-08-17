package com.vertexai.dto;

import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScanStatusResponse {

    private UUID scanId;
    private UUID assetId;
    private String status;
    private String scannersUsed;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
    private Integer currentStage;
    private Object agentOutput;
}
