package com.vertexai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "risk_scores")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RiskScore {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "score_id")
    private UUID scoreId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "finding_id", nullable = false)
    private CanonicalVulnerability finding;

    @Column(name = "composite_risk_score", nullable = false)
    private Double compositeRiskScore;

    @Column(name = "priority_level", nullable = false, length = 20)
    private String priorityLevel;

    @Column(name = "explainable_rationale", nullable = false, columnDefinition = "TEXT")
    private String explainableRationale;

    @Column(name = "calculated_at")
    private LocalDateTime calculatedAt;

    @PrePersist
    protected void onCreate() {
        if (calculatedAt == null) {
            calculatedAt = LocalDateTime.now();
        }
    }
}
