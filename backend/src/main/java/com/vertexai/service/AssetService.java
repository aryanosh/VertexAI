package com.vertexai.service;

import com.vertexai.dto.AssetRequest;
import com.vertexai.dto.AssetResponse;
import com.vertexai.entity.Asset;
import com.vertexai.exception.BadRequestException;
import com.vertexai.exception.ResourceNotFoundException;
import com.vertexai.repository.AssetRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AssetService {

    private final AssetRepository assetRepository;

    @Transactional
    public AssetResponse createAsset(AssetRequest request) {
        log.info("Registering new target asset: {}", request.getHostname());

        if (assetRepository.existsByHostname(request.getHostname())) {
            throw new BadRequestException("An asset with hostname '" + request.getHostname() + "' already exists");
        }

        Asset asset = Asset.builder()
                .hostname(request.getHostname().trim())
                .ipAddress(request.getIpAddress() != null ? request.getIpAddress().trim() : null)
                .environment(request.getEnvironment() != null ? request.getEnvironment() : "PRODUCTION")
                .criticalityRating(request.getCriticalityRating() != null ? request.getCriticalityRating() : 3)
                .ownerEmail(request.getOwnerEmail().trim())
                .isAuthorized(request.getIsAuthorized() != null ? request.getIsAuthorized() : true)
                .build();

        Asset saved = assetRepository.save(asset);
        log.info("Asset registered successfully with ID: {}", saved.getAssetId());

        return mapToResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<AssetResponse> getAllAssets() {
        return assetRepository.findAll().stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AssetResponse getAssetById(UUID assetId) {
        Asset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new ResourceNotFoundException("Asset", "id", assetId));
        return mapToResponse(asset);
    }

    @Transactional(readOnly = true)
    public Asset getAssetEntityById(UUID assetId) {
        return assetRepository.findById(assetId)
                .orElseThrow(() -> new ResourceNotFoundException("Asset", "id", assetId));
    }

    private AssetResponse mapToResponse(Asset asset) {
        return AssetResponse.builder()
                .assetId(asset.getAssetId())
                .hostname(asset.getHostname())
                .ipAddress(asset.getIpAddress())
                .environment(asset.getEnvironment())
                .criticalityRating(asset.getCriticalityRating())
                .ownerEmail(asset.getOwnerEmail())
                .isAuthorized(asset.getIsAuthorized())
                .createdAt(asset.getCreatedAt())
                .build();
    }
}
