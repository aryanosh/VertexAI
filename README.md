# VertexAI — Risk Prioritization & Deduplication

> A human-supervised cybersecurity platform that transforms noisy vulnerability scanner results into deduplicated, threat-enriched, prioritized remediation findings.

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue)](https://github.com/aryanosh/VertexAI/actions)
[![Coverage](https://img.shields.io/badge/Coverage-placeholder-lightgrey)](#)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## Overview

VertexAI uses four specialized agents to process findings from Nmap, OWASP ZAP, Nuclei, and OpenVAS:

1. **Agent 1 — Parser & Normalizer**: Converts scanner reports into a common schema.
2. **Agent 2 — Noise Reduction**: Deduplicates findings and uses XGBoost for false-positive classification.
3. **Agent 3 — Threat Intelligence**: Enriches findings using CISA KEV, EPSS, NVD, and Exploit-DB.
4. **Agent 4 — Risk Scoring**: Calculates risk, assigns P0–P3 priority, and prepares remediation tickets.

Every stage includes a Human-in-the-Loop approval checkpoint before the pipeline proceeds.

## Key Features

- Multi-scanner vulnerability ingestion
- Finding deduplication and noise reduction
- XGBoost-based false-positive detection
- CISA KEV and EPSS enrichment
- Explainable risk scoring
- P0–P3 prioritization
- Human approval and stop controls
- GitHub issue generation after final approval
- Next.js security dashboard
- PostgreSQL persistence
- Dockerized deployment

## Architecture

```mermaid
flowchart LR
    U[Security Analyst] --> FE[Next.js Frontend]

    FE --> BE[Spring Boot Backend]
    FE -. WebSocket .-> BE

    BE --> DB[(PostgreSQL)]

    SC[Scanner Reports<br/>Nmap / ZAP / Nuclei / OpenVAS] --> A1[Agent 1<br/>Parser & Normalizer]

    BE --> A1

    A1 --> H1{Human Review}
    H1 -->|Continue| A2[Agent 2<br/>Deduplication + XGBoost]
    H1 -->|Stop| STOP[Pipeline Stopped]

    A2 --> H2{Human Review}
    H2 -->|Continue| A3[Agent 3<br/>Threat Intelligence]
    H2 -->|Stop| STOP

    A3 --> KEV[CISA KEV]
    A3 --> EPSS[FIRST EPSS]
    A3 --> NVD[NVD]
    A3 --> EDB[Exploit-DB]

    A3 --> H3{Human Review}
    H3 -->|Continue| A4[Agent 4<br/>Risk Scoring]
    H3 -->|Stop| STOP

    A4 --> H4{Final Approval}
    H4 -->|Approve| GH[GitHub Issue]
    H4 -->|Reject| STOP

    BE --> DB
