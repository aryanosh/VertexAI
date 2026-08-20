package com.vertexai.controller;

import com.vertexai.dto.ControlActionRequest;
import com.vertexai.dto.ScanRequest;
import com.vertexai.dto.ScanStatusResponse;
import com.vertexai.service.ScanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/scans")
@RequiredArgsConstructor
@Tag(name = "Scans", description = "Vulnerability scan lifecycle and Human-in-the-Loop control endpoints")
public class ScanController {

    private final ScanService scanService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYST')")
    @Operation(summary = "Trigger Scan", description = "Validates asset authorization and initiates the asynchronous 4-agent scan pipeline.")
    public ResponseEntity<ScanStatusResponse> startScan(@Valid @RequestBody ScanRequest scanRequest) {
        log.info("Received request to start scan on asset: {}", scanRequest.getAssetId());
        ScanStatusResponse response = scanService.startScan(scanRequest);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get Scan Status", description = "Retrieves live scan status, current stage number, and current agent output for review.")
    public ResponseEntity<ScanStatusResponse> getScanStatus(@PathVariable("id") UUID id) {
        log.info("Received request to fetch scan status for: {}", id);
        ScanStatusResponse response = scanService.getScanStatus(id);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/latest")
    @Operation(summary = "Get Latest Scan Status", description = "Retrieves the most recent scan job and its live stage output.")
    public ResponseEntity<ScanStatusResponse> getLatestScan() {
        ScanStatusResponse latest = scanService.getLatestScanStatus();
        return latest != null ? ResponseEntity.ok(latest) : ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/control")
    @PreAuthorize("hasAnyRole('ANALYST', 'ADMIN')")
    @Operation(summary = "Submit HITL Control Action", description = "Submits a human review decision (CONTINUE to advance stage, STOP to halt pipeline).")
    public ResponseEntity<ScanStatusResponse> handleControl(
            @PathVariable("id") UUID id,
            @Valid @RequestBody ControlActionRequest controlRequest) {
        log.info("Received HITL control action '{}' for scan: {}", controlRequest.getAction(), id);
        ScanStatusResponse response = scanService.handleControlAction(id, controlRequest);
        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYST')")
    @Operation(summary = "Upload Multi-File Reports ", description = "Accepts 2+ raw scanner files at once and initiates pipeline processing.")
    public ResponseEntity<ScanStatusResponse> uploadScanFiles(
            @RequestParam("assetId") UUID assetId,
            @RequestParam(value = "files", required = true) MultipartFile[] files,
            @RequestParam(value = "scanners", required = false) List<String> scanners) {
        log.info("Received multi-file scan upload: {} files for asset {}", files != null ? files.length : 0, assetId);
        ScanStatusResponse response = scanService.uploadAndStartScan(assetId, files, scanners);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/{id}/dedup-report")
    @Operation(summary = "Get Agent 2 Dedup Report", description = "Retrieves Agent 2's full per-finding deduplication audit for this scan: every raw input finding, including ones merged away as duplicates or false positives, with its duplicate-group id, status, and reason.")
    public ResponseEntity<List<Map<String, Object>>> getDedupReport(@PathVariable("id") UUID id) {
        log.info("Fetching dedup report for scan: {}", id);
        return ResponseEntity.ok(scanService.getDedupReport(id));
    }

    @GetMapping(value = "/{id}/dedup-report.csv", produces = "text/csv")
    @Operation(summary = "Download Agent 2 Dedup Report as CSV", description = "Same data as GET /dedup-report, formatted as a downloadable CSV.")
    public ResponseEntity<String> getDedupReportCsv(@PathVariable("id") UUID id) {
        log.info("Fetching dedup report CSV for scan: {}", id);
        String csv = scanService.getDedupReportCsv(id);
        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=\"dedup-report-" + id + ".csv\"")
                .body(csv);
    }

}
