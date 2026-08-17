package com.vertexai.controller;

import com.vertexai.dto.AssetRequest;
import com.vertexai.dto.AssetResponse;
import com.vertexai.service.AssetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
@Tag(name = "Assets", description = "Monitored infrastructure asset management endpoints")
public class AssetController {

    private final AssetService assetService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYST')")
    @Operation(summary = "Register Asset", description = "Registers a new monitored server or website asset with criticality rating and authorization.")
    public ResponseEntity<AssetResponse> createAsset(@Valid @RequestBody AssetRequest assetRequest) {
        log.info("Received request to register asset: {}", assetRequest.getHostname());
        AssetResponse response = assetService.createAsset(assetRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    @Operation(summary = "List Assets", description = "Retrieves all registered infrastructure assets.")
    public ResponseEntity<List<AssetResponse>> getAllAssets() {
        log.info("Received request to list all assets");
        List<AssetResponse> assets = assetService.getAllAssets();
        return ResponseEntity.ok(assets);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get Asset by ID", description = "Retrieves a single asset's details by its UUID.")
    public ResponseEntity<AssetResponse> getAssetById(@PathVariable("id") UUID id) {
        log.info("Received request to fetch asset by ID: {}", id);
        AssetResponse asset = assetService.getAssetById(id);
        return ResponseEntity.ok(asset);
    }
}
