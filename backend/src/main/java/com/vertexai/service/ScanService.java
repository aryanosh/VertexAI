package com.vertexai.service;

import com.vertexai.dto.ControlActionRequest;
import com.vertexai.dto.ScanRequest;
import com.vertexai.dto.ScanStatusResponse;
import com.vertexai.entity.Asset;
import com.vertexai.entity.ScanJob;
import com.vertexai.exception.BadRequestException;
import com.vertexai.exception.ResourceNotFoundException;
import com.vertexai.repository.ScanJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Slf4j
@Service
public class ScanService {

    private final ScanJobRepository scanJobRepository;
    private final AssetService assetService;
    private final PipelineOrchestrator pipelineOrchestrator;

    public ScanService(
            ScanJobRepository scanJobRepository,
            AssetService assetService,
            @Lazy PipelineOrchestrator pipelineOrchestrator) {
        this.scanJobRepository = scanJobRepository;
        this.assetService = assetService;
        this.pipelineOrchestrator = pipelineOrchestrator;
    }

    @Transactional
    public ScanStatusResponse startScan(ScanRequest request) {
        log.info("Initiating scan request for asset ID: {}", request.getAssetId());

        Asset asset = assetService.getAssetEntityById(request.getAssetId());

        // Asset Authorization Gate (architecture_plan.md §7, §16)
        if (Boolean.FALSE.equals(asset.getIsAuthorized())) {
            log.warn("Scan blocked: Asset {} ({}) is NOT authorized for scanning", asset.getHostname(), asset.getAssetId());
            throw new BadRequestException("Asset '" + asset.getHostname() + "' is not authorized for vulnerability scanning.");
        }

        String scannersUsed = String.join(",", request.getScanners());

        ScanJob scanJob = ScanJob.builder()
                .asset(asset)
                .status("RUNNING")
                .scannersUsed(scannersUsed)
                .build();

        ScanJob savedJob = scanJobRepository.save(scanJob);
        log.info("ScanJob created with ID: {} and status: RUNNING", savedJob.getScanId());

        // Trigger the asynchronous Human-in-the-Loop AI pipeline
        pipelineOrchestrator.startPipeline(savedJob.getScanId(), asset, request.getScanners(), request.getReports());

        return getScanStatus(savedJob.getScanId());
    }

    @Transactional(readOnly = true)
    public ScanStatusResponse getScanStatus(UUID scanId) {
        ScanJob scanJob = scanJobRepository.findById(scanId)
                .orElseThrow(() -> new ResourceNotFoundException("ScanJob", "id", scanId));

        return pipelineOrchestrator.buildStatusResponse(scanJob);
    }

    public ScanStatusResponse handleControlAction(UUID scanId, ControlActionRequest controlRequest) {
        log.info("Received control action '{}' for scan ID: {}", controlRequest.getAction(), scanId);

        ScanJob scanJob = scanJobRepository.findById(scanId)
                .orElseThrow(() -> new ResourceNotFoundException("ScanJob", "id", scanId));

        return pipelineOrchestrator.handleControl(scanJob, controlRequest.getAction());
    }
}
