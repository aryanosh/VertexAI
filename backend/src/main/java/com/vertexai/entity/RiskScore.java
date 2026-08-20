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

    /**
     * Denormalized from finding.scanJobId at write time so scan-scoped dashboard/graph
     * queries can filter/aggregate directly without an extra join.
     */
    @Column(name = "scan_job_id")
    private UUID scanJobId;

    @Column(name = "composite_risk_score", nullable = false)
    private Double compositeRiskScore;

    @Column(name = "priority_level", nullable = false, length = 20)
    private String priorityLevel;

    @Column(name = "explainable_rationale", nullable = false, columnDefinition = "TEXT")
    private String explainableRationale;

    @Column(name = "calculated_at")
    private LocalDateTime calculatedAt;

    /**
     * Agent 4's ticket-ready draft (title/body/labels/suggested owner/SLA) as a
     * JSON string, so GitHubTicketingService can render it and the frontend can
     * preview it before a human approves ticket creation. Nullable — older rows
     * or agent responses without a ticket payload simply leave this unset.
     */
    @Column(name = "ticket_payload_json", columnDefinition = "TEXT")
    private String ticketPayloadJson;

    @PrePersist
    protected void onCreate() {
        if (calculatedAt == null) {
            calculatedAt = LocalDateTime.now();
        }
    }
}
