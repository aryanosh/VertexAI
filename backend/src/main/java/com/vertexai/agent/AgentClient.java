package com.vertexai.agent;

import java.util.Collections;
import java.util.List;
import java.util.Map;

public interface AgentClient {

    /**
     * Agent 1: Scanner Parser & Normalizer
     * Parses raw multi-scanner reports (XML/JSON/JSONL) into normalized
     * UnifiedFinding records.
     */
    List<Map<String, Object>> parseReports(Map<String, Object> rawReports);

    /**
     * Agent 2: Noise Reduction (XGBoost + MD5 Deduplication)
     * Deduplicates findings and applies XGBoost false-positive filtering.
     */
    List<Map<String, Object>> reduceNoise(List<Map<String, Object>> unifiedFindings);

    /**
     * Agent 2's full raw response from its most recent run — {@code statistics}
     * (raw/duplicate/removed/final counts and dedup percentage) and {@code
     * dedup_detail} (one audit row per INPUT finding, including the ones merged away,
     * with its duplicate-group id, KEPT/REMOVED_DUPLICATE/REMOVED_FALSE_POSITIVE
     * status, and a reason). This is the concrete, persisted, UI-visible dedup output
     * the platform is required to show — distinct from {@link #reduceNoise} which only
     * returns the surviving findings that feed Agent 3.
     */
    default Map<String, Object> getLastDedupResponse() {
        return Collections.emptyMap();
    }

    /**
     * Agent 3: Threat Intelligence (CISA KEV + EPSS Enrichment)
     * Enriches findings with live CISA KEV, EPSS score/percentile, and Exploit-DB
     * data.
     */
    List<Map<String, Object>> enrichThreats(List<Map<String, Object>> canonicalFindings);

    /**
     * Provenance of the threat intelligence used by the most recent Agent 3 run:
     * {@code LIVE_FEEDS}, {@code MOCK_FIXTURES} or {@code UNKNOWN}.
     *
     * <p>
     * Exposed so the dashboard can state plainly whether enrichment came from live
     * CISA KEV / FIRST EPSS calls or bundled offline fixtures. Presenting mock
     * exploit
     * data as live intelligence would mislead an analyst triaging real risk.
     */
    default String getLastIntelSource() {
        return "UNKNOWN";
    }

    /**
     * How Agent 3 reached its conclusions on the most recent run: {@code AGENTIC}
     * (the model
     * selected which intel tools to call), {@code AGENTIC_PARTIAL} (some CVEs fell
     * back to
     * the fixed lookup), or {@code DETERMINISTIC}.
     *
     * <p>
     * Surfaced so an analyst can tell whether a conclusion came from a
     * goal-directed
     * investigation or the original two-call sequence.
     */
    default String getLastReasoningMode() {
        return "UNKNOWN";
    }

    /**
     * Agent 4: Risk Scoring & Ticket Preparation
     * Computes 0-100 composite risk score, SLA deadline, rationale, and prepares
     * ticket payload.
     * Note: Agent 4 NEVER calls GitHub directly.
     */
    Map<String, Object> scoreAndPrepareTicket(Map<String, Object> scoringPayload);
}
