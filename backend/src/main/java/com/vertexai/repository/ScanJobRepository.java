package com.vertexai.repository;

import com.vertexai.entity.ScanJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ScanJobRepository extends JpaRepository<ScanJob, UUID> {

    List<ScanJob> findByAsset_AssetId(UUID assetId);

    List<ScanJob> findByStatus(String status);
}
