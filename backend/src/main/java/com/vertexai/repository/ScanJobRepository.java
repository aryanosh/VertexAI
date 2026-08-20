package com.vertexai.repository;

import com.vertexai.entity.ScanJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ScanJobRepository extends JpaRepository<ScanJob, UUID> {

    List<ScanJob> findByAsset_AssetId(UUID assetId);

    List<ScanJob> findByStatus(String status);

    /** Most recent non-seed scan, used as the default "current run" when a caller
     *  doesn't specify scan_id. Seed data is explicitly excluded so it can never be
     *  picked up as "the current scan" by a fresh install with no real scans yet. */
    @Query("SELECT s FROM ScanJob s WHERE (s.isSeedData = false OR s.isSeedData IS NULL) "
            + "AND s.status = 'COMPLETED' ORDER BY s.startedAt DESC LIMIT 1")
    Optional<ScanJob> findLatestCompletedNonSeed();

    @Query("SELECT s FROM ScanJob s WHERE (s.isSeedData = false OR s.isSeedData IS NULL) "
            + "ORDER BY s.startedAt DESC LIMIT 1")
    Optional<ScanJob> findLatestNonSeed();
}
