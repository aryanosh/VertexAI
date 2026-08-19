package com.vertexai.agent;

import java.util.List;
import java.util.Map;

public interface AgentClient {

    /**
     * Agent 1: Scanner Parser & Normalizer
     * Parses raw multi-scanner reports (XML/JSON/JSONL) into normalized UnifiedFinding records.
     */
    List<Map<String, Object>> parseReports(Map<String, Object> rawReports);

    /**
     * Agent 2: Noise Reduction (XGBoost + MD5 Deduplication)
     * Deduplicates findings and applies XGBoost false-positive filtering.
     */
    List<Map<String, Object>> reduceNoise(List<Map<String, Object>> unifiedFindings);

    /**
     * Agent 3: Threat Intelligence (CISA KEV + EPSS Enrichment)
     * Enriches findings with live CISA KEV, EPSS score/percentile, and Exploit-DB data.
     */
    List<Map<String, Object>> enrichThreats(List<Map<String, Object>> canonicalFindings);

    /**
     * Agent 4: Risk Scoring & Ticket Preparation
     * Computes 0-100 composite risk score, SLA deadline, rationale, and prepares ticket payload.
     * Note: Agent 4 NEVER calls GitHub directly.
     */
    Map<String, Object> scoreAndPrepareTicket(Map<String, Object> scoringPayload);
}
