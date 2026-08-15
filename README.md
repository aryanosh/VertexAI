# VertexAI
Risk Prioritization and Deduplication

VertexAI is a security intelligence platform focused on risk prioritization, deduplication, and automation across vulnerability, repository, and threat workflows.

## Project Structure

- frontend/ — Team 3 — UI/UX
- backend/ — Team 1 — Spring Boot + DB + GitHub
- agents_service/ — Team 2 — AI Agents + ML + Threat Intel
- scanner-sandbox/ — Team 4 — Scanners + Docker + E2E
- docs/ — architecture and implementation guidance
- .github/ — CI/CD configuration and automation

## Getting Started

1. Copy .env.example to a local .env file and fill in the required values.
2. Start the stack with Docker Compose:
   ```bash
   docker compose up --build
   ```
3. Access the app through the frontend service and validate the backend and scanner integrations.

## Default Stack

- Frontend: web UI
- Backend: Spring Boot API
- AI agents: Python-based intelligence services
- Scanner sandbox: security scanning and automation environment
- Infrastructure: Docker Compose + environment variables

## Repository

https://github.com/aryanosh/VertexAI.git
