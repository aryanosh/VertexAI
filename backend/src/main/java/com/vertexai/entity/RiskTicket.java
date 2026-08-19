package com.vertexai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "risk_tickets")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RiskTicket {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "ticket_id")
    private UUID ticketId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "finding_id", nullable = false)
    private CanonicalVulnerability finding;

    @Column(name = "ticket_system", nullable = false, length = 50)
    @Builder.Default
    private String ticketSystem = "GITHUB";

    @Column(name = "external_ticket_url", nullable = false, length = 500)
    private String externalTicketUrl;

    @Column(name = "assigned_owner", nullable = false, length = 255)
    private String assignedOwner;

    @Column(name = "sla_deadline", nullable = false)
    private LocalDateTime slaDeadline;

    @Column(name = "status", length = 50)
    @Builder.Default
    private String status = "OPEN";

    @PrePersist
    protected void onCreate() {
        if (ticketSystem == null) {
            ticketSystem = "GITHUB";
        }
        if (status == null) {
            status = "OPEN";
        }
    }
}
