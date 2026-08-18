package com.vertexai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "assets")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Asset {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "asset_id")
    private UUID assetId;

    @Column(name = "hostname", unique = true, nullable = false, length = 255)
    private String hostname;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "environment", length = 50)
    private String environment;

    @Column(name = "criticality_rating")
    private Integer criticalityRating;

    @Column(name = "owner_email", nullable = false, length = 255)
    private String ownerEmail;

    @Column(name = "is_authorized")
    @Builder.Default
    private Boolean isAuthorized = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (isAuthorized == null) {
            isAuthorized = true;
        }
    }
}
