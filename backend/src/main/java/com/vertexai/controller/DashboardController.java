package com.vertexai.controller;

import com.vertexai.dto.DashboardResponse;
import com.vertexai.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
@Tag(name = "Dashboard", description = "Executive overview and aggregated security metrics endpoints")
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping
    @Operation(summary = "Get Dashboard Metrics", description = "Retrieves aggregated security scores, noise reduction rates, and top threats for one scan run. Defaults to the most recent completed scan when scan_id is omitted.")
    public ResponseEntity<DashboardResponse> getDashboardMetrics(
            @RequestParam(name = "scan_id", required = false) UUID scanId) {
        log.info("Received request for dashboard metrics, scan_id={}", scanId);
        DashboardResponse response = dashboardService.getDashboardMetrics(scanId);
        return ResponseEntity.ok(response);
    }
}
