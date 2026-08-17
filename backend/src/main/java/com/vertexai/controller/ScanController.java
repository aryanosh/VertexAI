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
}
