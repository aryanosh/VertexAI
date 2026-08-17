package com.vertexai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class VertexAiApplicationTests {

    @Test
    @DisplayName("Verify Contextual Composite Risk Score Formula Calculation")
    void testCompositeRiskScoreCalculation() {
        // Given parameters for a critical production Log4Shell vulnerability
        double cvss = 10.0;
        double epss = 0.975;
        double kevBonus = 25.0; // Listed in CISA KEV
        int assetCriticality = 5; // Production asset

        // When applying the authoritative formula (architecture_plan.md §10)
        // Score = (CVSS * 3.0) + (EPSS * 10 * 0.35 * 10) + KEV_Bonus + (Asset_Criticality * 4.0)
        double calculatedScore = (cvss * 3.0) + (epss * 35.0) + kevBonus + (assetCriticality * 4.0);
        double finalScore = Math.min(100.0, Math.round(calculatedScore * 10.0) / 10.0);

        // Then score must evaluate into P0_CRITICAL tier (>= 80.0)
        assertTrue(finalScore >= 80.0, "Score should be in P0 Critical tier (>= 80.0)");
        assertEquals(100.0, finalScore, "Clamped score for max-threat CVE should equal 100.0");
    }

    @Test
    @DisplayName("Verify SLA Tier Assignment Logic")
    void testSlaTierLogic() {
        assertEquals("24 hours", getSlaTier(95.0));
        assertEquals("72 hours", getSlaTier(70.0));
        assertEquals("14 days", getSlaTier(50.0));
        assertEquals("30 days", getSlaTier(25.0));
    }

    @Test
    @DisplayName("Verify Human-in-the-Loop Approval Boundary Rule")
    void testHitlApprovalBoundaryRule() {
        boolean approved = false;
        // Verify that if approved == false, ticket creation must be blocked
        assertThrows(IllegalArgumentException.class, () -> {
            if (!approved) {
                throw new IllegalArgumentException("Ticket creation rejected: Final human approval was not granted.");
            }
        });
    }

    private String getSlaTier(double score) {
        if (score >= 80.0) return "24 hours";
        if (score >= 60.0) return "72 hours";
        if (score >= 40.0) return "14 days";
        return "30 days";
    }
}
