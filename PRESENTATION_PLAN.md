# 🎤 VertexAI Backend — 10-Minute Presentation Plan (2 Presenters)

**Total time: 10 minutes | Person A: 5 min | Person B: 5 min**  
**Goal:** Explain the Spring Boot backend — what it does, why it's built this way, and how it fits into the bigger VertexAI system — to an audience or panel that may not know backend concepts deeply.

---

## Split of Responsibility

| Who | Time | Covers |
| :--- | :--- | :--- |
| **Person A** | 0:00 – 5:00 | Big picture: what the backend is, why it exists, its architecture layers, database |
| **Person B** | 5:00 – 10:00 | Deep dive: security, one real endpoint flow end-to-end, HITL pipeline trigger, wrap-up |

> ⏱️ **Tip:** Practice with a timer. If you run long anywhere, cut the "if time allows" lines first.

---

## PERSON A — Minutes 0:00 to 5:00

### 1. Open with the problem (0:00 – 0:45)
> "Security teams run multiple scanners — Nmap, Nuclei, ZAP, OpenVAS — against their systems. The problem is these scanners report thousands of duplicate and false-positive findings, and there's no safe way to auto-create tickets without a human checking first. VertexAI solves this with an AI pipeline that's supervised by a human at every single step."

### 2. What the backend's job is (0:45 – 1:45)
> "Our project has four pieces: a Next.js dashboard, a Python AI engine with 4 agents, a PostgreSQL database, and our part — the Spring Boot backend, built in Java. The backend is the **gatekeeper and coordinator** of the whole system. It's the only piece that talks to the database directly, the only piece allowed to create GitHub tickets, and it manages authentication so only the right people can trigger scans."

*(Optional visual cue: point to system diagram — Frontend → Backend → Agents/Database → GitHub.)*

### 3. Why Spring Boot specifically (1:45 – 2:30)
> "We used Spring Boot 3 on Java 17. Spring Boot handles a lot of repetitive backend work for us automatically — things like receiving HTTP requests, managing database connections, and enforcing security rules — so we can focus on our actual business logic instead of writing plumbing code from scratch."

**One-liners to have ready if asked "what is Spring Boot":**
* "It's a Java framework that makes building REST APIs fast, by handling common backend setup automatically."

### 4. The three-layer architecture (2:30 – 3:45)
> "Our backend follows a standard 3-layer structure: Controller, Service, and Repository."
* **Controller:** "The front door — receives HTTP requests like `POST /api/scans`, and passes them along."
* **Service:** "Where our actual business rules live — for example, checking whether an asset is authorized before allowing a scan."
* **Repository:** "Talks directly to the database — saving and retrieving data, no decision-making."

> "This separation means each piece has one clear job, and we can change one layer without breaking the others."

### 5. The database — 7 tables, no more, no less (3:45 – 5:00)
> "We use PostgreSQL with exactly 7 tables — this was a strict architectural rule for the project, not a suggestion."

**Name all 7, one phrase each:**
1. `users` — accounts and roles
2. `assets` — the systems we're allowed to scan
3. `scan_jobs` — tracks each scan and its pipeline status
4. `canonical_vulnerabilities` — deduplicated findings
5. `vulnerability_intelligence` — threat intel like CISA KEV / EPSS scores
6. `risk_scores` — the AI's calculated risk score and reasoning
7. `risk_tickets` — GitHub tickets that were actually created

> "Each Java class representing a table is called an Entity — that's the technical term — and Spring automatically maps these Java objects to database rows for us, instead of us writing raw SQL by hand."

*🤝 **Hand off:** "Now [Person B] will walk you through how a real request actually flows through this system, and how we keep it secure."*

---

## PERSON B — Minutes 5:00 to 10:00

### 1. Security first (5:00 – 6:15)
> "Before anything else, every request has to prove who it is. We use JWT — JSON Web Tokens — for authentication. When you log in, the backend gives you a signed token. Every request after that includes this token, and the backend checks it before doing anything."

> "We also enforce Role-Based Access Control — RBAC. We have three roles: Admin, Analyst, and Viewer. Not everyone can trigger a scan or approve a ticket — the backend checks your role on every protected endpoint."

*(Optional, if asked): "We also configure CORS — this is what allows our frontend, running on a different address, to actually be allowed to call our backend from the browser. Without it, browsers block cross-origin requests by default for security."*

### 2. Walk through one real request, end to end (6:15 – 8:15)
> "Let's trace what happens when someone clicks 'Start Scan' on the dashboard."

1. **Frontend** sends `POST /api/scans` with the asset ID and which scanners to run.
2. **Controller** receives it, passes the data to `ScanService`.
3. **Service layer runs the actual business rule**: "Is this asset authorized to be scanned?" — if not, it's rejected immediately with a clear error. This is a real security gate, not just a formality.
4. If authorized, the service **saves a new scan job** to the database with status `RUNNING`.
5. The service then **triggers the Pipeline Orchestrator** — this hands off to our AI pipeline: Agent 1 parses the scan data, and the system pauses, waiting for a human to review before continuing.
6. The backend immediately sends a response back to the dashboard — it doesn't wait for the AI agents to finish. This happens in the background.

> "This 'trigger and move on' behavior is intentional — we don't want the user's browser frozen waiting for AI processing to complete."

### 3. Human-in-the-Loop and GitHub (8:15 – 9:30)
> "This is the core safety feature of the whole project. After every single AI agent — Parser, Noise Reduction, Threat Intelligence, and Risk Scoring — the pipeline stops and waits for a human. It literally sets the status to `WAITING_FOR_HUMAN`. Nothing proceeds until a person clicks Continue."

> "And critically — GitHub tickets are never created automatically. Only one class in our entire backend, `GitHubTicketingService`, is allowed to call the GitHub API, and it only does so after a human gives final approval. If someone clicks Stop at any point, the pipeline halts and no ticket is ever created."

### 4. Close (9:30 – 10:00)
> "So to summarize: our backend is the secure, central coordinator of VertexAI. It authenticates users, enforces authorization, manages a strict 7-table database, and orchestrates a human-supervised AI pipeline — without ever letting AI act on its own without sign-off. That's our part of the system."

*(Thank the audience, open for questions.)*

---

## Anticipated Q&A — Have Quick Answers Ready

| Likely Question | Short Answer |
| :--- | :--- |
| **"Why Java/Spring Boot and not just Python for everything?"** | "Team division — Spring Boot is well-suited for secure, structured APIs and RBAC; Python/FastAPI is better suited for the ML/AI work like XGBoost. Splitting them let each part use the best tool for its job." |
| **"What stops the AI from creating a ticket by itself?"** | "Architecturally, only `GitHubTicketingService.java` can call GitHub, and it's only invoked after a human clicks Approve — the AI agents never have GitHub access at all." |
| **"What if two scanners report the same vulnerability?"** | "That's handled in Agent 2 (Team 2's Noise Reduction agent) using deduplication — on our side, the deduplicated result is what actually gets stored in `canonical_vulnerabilities`." |
| **"Is the database schema fixed forever?"** | "For this project, yes — it's a strict architectural rule: exactly 7 tables, no extras, to keep the system's scope controlled." |
| **"How does the frontend know when to update the screen?"** | "WebSockets — the backend pushes live status updates so the dashboard updates without needing to refresh or repeatedly ask." |

---

## Delivery Tips
* **Don't read word-for-word:** Rehearse the bullet points and speak naturally.
* **Practice the Hand-off:** Rehearse the transition at minute 5:00 between Person A and Person B.
* **Core Mental Model:**
  * **Controller:** Front door
  * **Service:** Brain & business logic
  * **Repository:** Filing clerk
  * **Database:** 7 labeled drawers
  * **GitHub:** Locked vault only one person can open after human sign-off.
