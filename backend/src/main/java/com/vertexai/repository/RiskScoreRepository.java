package com.vertexai.repository;

import com.vertexai.entity.RiskScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RiskScoreRepository extends JpaRepository<RiskScore, UUID> {

    Optional<RiskScore> findByFinding_FindingId(UUID findingId);

    List<RiskScore> findByPriorityLevel(String priorityLevel);

    /** Global aggregate, retained only for admin/cross-scan tooling — never used by a
     *  default user-facing dashboard endpoint. Use the scan-scoped overload instead. */
    @Query("SELECT AVG(r.compositeRiskScore) FROM RiskScore r")
    Double calculateAverageRiskScore();

    @Query("SELECT r FROM RiskScore r ORDER BY r.compositeRiskScore DESC")
    List<RiskScore> findTopThreatsOrdered();

    @Query("SELECT AVG(r.compositeRiskScore) FROM RiskScore r WHERE r.scanJobId = :scanJobId")
    Double calculateAverageRiskScoreForScan(UUID scanJobId);

    @Query("SELECT r FROM RiskScore r WHERE r.scanJobId = :scanJobId ORDER BY r.compositeRiskScore DESC")
    List<RiskScore> findTopThreatsForScan(UUID scanJobId);

    List<RiskScore> findByScanJobId(UUID scanJobId);
}
