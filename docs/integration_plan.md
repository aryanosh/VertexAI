# Integration Plan

## Objective

Define how services interact across the SentinelAI platform and with external systems.

## Integration Points

### Frontend ↔ Backend
- REST API requests for dashboards, alerts, and user actions
- Authentication and token propagation
- Event-driven updates for live status

### Backend ↔ Database
- Persistent storage for users, findings, jobs, and incidents
- Transactional operations for security workflows

### Backend ↔ GitHub
- Repository metadata collection
- Pull request and issue synchronization
- CI/CD and code review signal ingestion

### Backend ↔ Agents Service
- Threat analysis requests
- Enrichment payloads and result processing
- Triage and prioritization workflows

### Backend ↔ Scanner Sandbox
- Scan initiation
- Job result ingestion
- Status tracking and artifact collection

## Data Contracts

- Findings payload
- Scan job payload
- Agent analysis response
- GitHub event payload

## Deployment Considerations

- Use environment-based configuration
- Secure secrets via .env and platform secret stores
- Ensure service-to-service network isolation
- Add health checks and retries for external APIs
