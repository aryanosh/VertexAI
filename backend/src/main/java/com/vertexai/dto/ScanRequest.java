package com.vertexai.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScanRequest {

    @NotNull(message = "Asset ID is required")
    private UUID assetId;

    @NotEmpty(message = "At least one scanner must be selected")
    private List<String> scanners;
}
