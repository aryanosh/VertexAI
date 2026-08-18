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

    @Query("SELECT AVG(r.compositeRiskScore) FROM RiskScore r")
    Double calculateAverageRiskScore();

    @Query("SELECT r FROM RiskScore r ORDER BY r.compositeRiskScore DESC")
    List<RiskScore> findTopThreatsOrdered();
}
