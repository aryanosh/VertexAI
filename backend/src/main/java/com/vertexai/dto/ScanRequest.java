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

    /**
     * Optional raw scanner report payloads uploaded by the analyst.
     * Agent 1 already accepts inline reports; when this list is absent or empty
     * it falls back to its bundled sample report fixtures (existing behavior).
     */
    private List<ReportEntry> reports;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ReportEntry {
        private String scannerType;
        private String content;
    }
}
