# SentinelAI: Live Demonstration Script
## 4-Minute Human-Supervised Multi-Agent Cybersecurity Pipeline Demo

> **Audience**: Hackathon Judges, Security Architects, and Engineering Leadership  
> **Presenters**: SentinelAI Implementation Team  
> **Key Value Proposition**: Transforming 2,500 noisy multi-scanner alerts into 15 prioritized, threat-enriched canonical vulnerabilities with strict Human-in-the-Loop governance.

---

### ⏱️ Timeline Overview

| Time Interval | Segment Title | Action / UI Screen | Key Talking Points |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:45** | **The Enterprise Bottleneck** | Architecture Slide / Dashboard Hero | Alert Fatigue, 4-scanner duplication, CVSS flaw, autonomous ticketing risks |
| **0:45 – 1:30** | **Report Ingestion & Agent 1** | Ingestion Screen $\rightarrow$ Flow View | Parsing Nmap, ZAP, Nuclei, OpenVAS; Human Review 1 checkpoint |
| **1:30 – 2:15** | **Agent 2: Noise Reduction** | Click `Continue` $\rightarrow$ Flow View | MD5 deduplication, XGBoost filtering, 94% noise reduction |
| **2:15 – 3:00** | **Agent 3 & Agent 4: Intel & Risk** | Click `Continue` $\rightarrow$ Ticket Inspection | `httpx` CISA KEV + EPSS (97.2%), composite risk scoring, SLA deadline |
| **3:00 – 3:30** | **The "Stop" Control Safety Test** | Secondary Scan $\rightarrow$ Click `Stop` | Failsafe audit: pipeline stops, 0 unauthorized tickets dispatched |
| **3:30 – 4:00** | **Final Approval & GitHub Issue** | Click `Approve` $\rightarrow$ GitHub UI | Team 1 `GitHubTicketingService.java` creates live issue; Security Score: 96/100 |

---

### 🎬 Detailed Step-by-Step Script

#### Part 1: The Problem (0:00 - 0:45)
- **Speaker**: "In enterprise security operations, security teams run multiple scanners—Nmap, OWASP ZAP, Nuclei, and OpenVAS. Running all four produces thousands of duplicate alerts, false positives, and static CVSS ratings that treat everything as an emergency.
- Unchecked AI auto-ticketing floods engineering backlogs with noise. SentinelAI solves this by orchestrating **4 specialized AI agents** under **strict Human-in-the-Loop checkpoints** at every stage."

---

#### Part 2: Multi-Scanner Ingestion & Agent 1 (0:45 - 1:30)
- **Action**: Click **"Run New Scan Assessment"** on the dashboard.
- **Visual**: The system uploads `nmap_scan.xml`, `zap_scan.json`, `nuclei_scan.jsonl`, and `openvas_scan.xml` (2,500 raw findings).
- **Speaker**: "Agent 1 ingests multi-format scanner outputs and normalizes them into a unified schema. Notice how the pipeline immediately pauses at **Human Review Checkpoint 1** with status `WAITING_FOR_HUMAN`. The AI never proceeds without analyst consent."

---

#### Part 3: Agent 2 Noise Reduction & Deduplication (1:30 - 2:15)
- **Action**: Analyst clicks **`Continue`** on the Review 1 modal.
- **Visual**: Flow View animates node activation. Deduplication metrics update live:
  - Raw findings: **2,500** $\rightarrow$ Canonical findings: **15**
  - Noise reduction: **94.0%**
- **Speaker**: "Agent 2 applies cryptographic MD5 fingerprinting and XGBoost false-positive classification. What was 2,500 raw alarms across 4 scanners collapses into 15 unique canonical vulnerabilities. The pipeline pauses again at **Human Review Checkpoint 2**."

---

#### Part 4: Agent 3 Threat Intel & Agent 4 Risk Scoring (2:15 - 3:00)
- **Action**: Analyst clicks **`Continue`**.
- **Visual**: Threat telemetry card lights up:
  - **CISA KEV**: `Flagged` (Active exploitation confirmed)
  - **FIRST.org EPSS**: `97.2% Probability` (Fetched via `httpx`)
  - **Composite Risk Score**: `98.5 / 100` (P0 Critical)
  - **SLA**: `24 Hours`
- **Speaker**: "Agent 3 enriches the findings in real-time with CISA Known Exploited Vulnerabilities and FIRST EPSS data. Agent 4 computes a composite risk formula combining exploit probability, CVSS, and asset criticality. It prepares a complete remediation payload, ready for human inspection."

---

#### Part 5: Demonstrating Safety & The Stop Control (3:00 - 3:30)
- **Action**: Switch to the secondary test scan and click **`Stop`**.
- **Visual**: Pipeline immediately transitions to `STOPPED` state in red.
- **Speaker**: "What happens if an analyst rejects a scan or spots an error? Clicking `Stop` halts the entire pipeline immediately. No downstream agents run, and no external tickets are created. Human supervision is absolute."

---

#### Part 6: Final Human Approval & Live GitHub Issue Creation (3:30 - 4:00)
- **Action**: Return to primary scan and click **`Approve & Create Ticket`**.
- **Visual**: 
  - Team 1's `GitHubTicketingService.java` dispatches the GitHub REST API call.
  - A green badge pops up with the clickable issue link: `https://github.com/aryanosh/VertexAI/issues/1`.
  - The platform **Security Health Score** updates dynamically to **96/100**.
- **Speaker**: "With one click, Team 1's backend generates the authorized engineering ticket on GitHub containing the full explainable AI rationale and remediation steps. SentinelAI turns scanner chaos into verified, actionable security resolution."
