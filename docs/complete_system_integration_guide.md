# VertexAI — Step-by-Step Master Integration Guide (Made Simple)

> **Who is this for:** Any developer or team lead wanting a simple, step-by-step walkthrough to merge all 4 team branches into one working application.

---

## 📖 Quick Overview: What Did Each Team Build?

Before combining everything, here is what each team created in plain English:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. TEAM 4 (DevOps & Scanners):                                              │
│    Built docker-compose.yml to run everything and sample scanner files.     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. TEAM 1 (Java Spring Boot Backend):                                       │
│    Built the Core API, Database setup (7 tables), and the GitHub Ticket     │
│    creator (GitHubTicketingService.java).                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. TEAM 2 (Python AI Engine):                                               │
│    Built the 4 AI Agents on Port 8000 that clean scanner noise, fetch       │
│    real threat data, calculate risk scores (0-100), and draft tickets.      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. TEAM 3 (Next.js Frontend UI):                                            │
│    Built the website dashboard on Port 3000 where security analysts see     │
│    vulnerabilities and click "Continue" or "Approve Ticket".                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌳 The Git Plan: How We Merge

We use a central branch called **`develop`** to test everything before touching **`main`**.

```text
  feature/team4-devops    ──(Merge 1st)──┐
  feature/team1-backend   ──(Merge 2nd)──┼──> develop (Integration Branch) ──> main (Production)
  feature/team2-ai-engine ──(Merge 3rd)──┤
  feature/team3-frontend  ──(Merge 4th)──┘
```

---

# 🚀 The 4 Simple Integration Steps

Follow these steps in exact order:

---

## STEP 1: Set Up the Database and Backend
> **Goal:** Get PostgreSQL and the Spring Boot Java Backend talking to each other.

### 1.1 Merge Team 4 (DevOps) into `develop`
Open your terminal at the root of the project:
```bash
git checkout develop
git merge feature/team4-devops
```
*What this adds:* `docker-compose.yml`, `.env.example`, and scanner scripts.

### 1.2 Merge Team 1 (Backend) into `develop`
```bash
git merge feature/team1-backend
```
*What this adds:* The `backend/` folder (Spring Boot API & database schema).

### 1.3 Run and Verify Step 1
Start only PostgreSQL and the Backend:
```bash
docker-compose up --build postgres backend
```

**How to verify it worked:**
1. Open a new terminal and run:
   ```bash
   curl http://localhost:8080/actuator/health
   ```
2. You should see:
   ```json
   {"status":"UP","components":{"db":{"status":"UP"}}}
   ```
✅ **Step 1 is complete!** Your backend and database are working.

---

## STEP 2: Connect the Python AI Engine
> **Goal:** Connect Team 2’s 4 AI Agents to Team 1’s Backend so the backend can send scan reports to Python.

### 2.1 Merge Team 2 (AI Engine) into `develop`
```bash
git merge feature/team2-ai-engine
```
*What this adds:* The `agents_service/` folder (Agent 1, Agent 2, Agent 3, Agent 4 on port 8000).

### 2.2 Configure Team 1 Backend to talk to Python
1. Open `backend/src/main/resources/application.yml`.
2. Make sure the Python URL is set to the Docker service name:
   ```yaml
   python:
     agent:
       url: http://python-agents:8000
   ```
3. In Team 1's code, ensure the backend is now making real HTTP requests to Python instead of using static mock files.

### 2.3 Run and Verify Step 2
Start the Database, Python AI Engine, and Backend together:
```bash
docker-compose up --build postgres python-agents backend
```

**How to verify it worked:**
1. Open your browser to: **`http://localhost:8000/docs`**
2. You will see the live Swagger UI showing all 4 agent endpoints:
   - `POST /api/v1/agent1/parse` (Parses ZAP, Nuclei, OpenVAS, Nmap)
   - `POST /api/v1/agent2/reduce-noise` (Deduplicates with MD5 & XGBoost)
   - `POST /api/v1/agent3/enrich` (Adds CISA KEV & EPSS threat scores)
   - `POST /api/v1/agent4/score-and-ticket` (Calculates 0-100 risk score and drafts ticket)
3. Send a test scan request from the backend to verify that rows are saved into PostgreSQL:
   - `canonical_vulnerabilities` table gets the deduplicated findings.
   - `risk_scores` table gets the calculated 0–100 risk scores.

✅ **Step 2 is complete!** The Backend and AI Engine are integrated.

---

## STEP 3: Connect the Next.js Frontend Dashboard
> **Goal:** Connect the web UI so security analysts can see findings in the browser and click "Continue".

### 3.1 Merge Team 3 (Frontend) into `develop`
```bash
git merge feature/team3-frontend
```
*What this adds:* The `frontend/` folder (Next.js 14, React 18, visual graphs, buttons).

### 3.2 Configure Team 3 Frontend to talk to the Backend
1. In `frontend/.env.local` (or `docker-compose.yml`), make sure:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8080
   ```
2. Make sure any temporary UI mock data (like MSW or `json-server`) is turned off so the frontend fetches real data from `http://localhost:8080`.
3. In Team 1's Spring Boot backend, make sure CORS is enabled for `http://localhost:3000`.

### 3.3 Run and Verify Step 3
Start the entire system with Docker:
```bash
docker-compose up --build
```

**How to verify it worked:**
1. Open your browser and go to: **`http://localhost:3000`**
2. Log in with your test account.
3. Click **"Start Scan"**.
4. You should see the live graph animate through the agents:
   - **Agent 1 finishes:** Dashboard pauses at `WAITING_FOR_HUMAN`. You see the parsed findings.
   - **Click "Continue":** Agent 2 runs $\rightarrow$ shows deduplication stats (e.g. 90% noise reduced).
   - **Click "Continue":** Agent 3 runs $\rightarrow$ shows live CISA KEV and EPSS threat scores.
   - **Click "Continue":** Agent 4 runs $\rightarrow$ displays the Composite Risk Score (e.g. 51.3/100) and ticket preview.

✅ **Step 3 is complete!** The Frontend, Backend, and AI Engine are all working in the browser.

---

## STEP 4: Test the Final Human Approval & GitHub Ticket Creation
> **Goal:** Verify that a real GitHub ticket is created **only** when the user clicks "Approve".

### 4.1 Test the "Stop" Button (Safety Check)
1. Run a scan in the UI.
2. When prompted at any checkpoint, click **"Stop"**.
3. **Verify:**
   - The status immediately turns to **`STOPPED`**.
   - **No** GitHub Issue is created.
   - The next agent does not run.

### 4.2 Test the "Approve" Button (Live Ticket Creation)
1. Run a scan through all 4 agents until it reaches the final screen.
2. Inspect the prepared ticket details on the screen (Title, SLA, Priority, Rationale).
3. Click **"Approve Ticket"**.
4. **Verify:**
   - Team 1's `GitHubTicketingService.java` sends the ticket to the GitHub repository.
   - A real GitHub Issue is created.
   - The link to the GitHub Issue appears on your UI timeline!

✅ **Step 4 is complete!** The entire end-to-end platform is verified.

---

## 🏆 Final Step: Release to `main`

Now that everything works together seamlessly on `develop`, merge it into `main`:

```bash
# 1. Switch to main
git checkout main

# 2. Merge develop into main
git merge develop

# 3. Tag the release
git tag -a v1.0.0 -m "VertexAI v1.0.0 Complete Integration"

# 4. Push to remote repository
git push origin main --tags
```

---

## 📋 Simple Checklist Before You Finish

Check off these items to ensure your integration is 100% compliant:

- [ ] **1 Command to Run:** `docker-compose up --build` starts everything without errors.
- [ ] **Exact 7 Tables:** PostgreSQL has only the 7 required tables (no extra temporary tables).
- [ ] **Only 1 GitHub Client:** Only Team 1's Java code creates GitHub tickets (Python creates 0 tickets).
- [ ] **Human-in-the-Loop Works:** The pipeline pauses with `WAITING_FOR_HUMAN` at each stage and waits for a human click.
- [ ] **No Accidental Tickets:** If a user clicks "Stop", 0 GitHub tickets are created.
- [ ] **Live UI Updates:** The dashboard shows real-time WebSocket status changes.
