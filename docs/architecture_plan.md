# Architecture Plan

## Overview

SentinelAI is designed as a modular security platform with clear separation between user experience, API services, AI-driven analysis, and scanning infrastructure.

## Core Components

### 1. Frontend
- UI for alerts, dashboards, and policy workflows
- Role-based access control and dashboard visualizations
- Integration with backend APIs

### 2. Backend
- Spring Boot application layer
- PostgreSQL persistence
- GitHub integration and workflow orchestration

### 3. Agents Service
- AI orchestration layer
- Threat intelligence enrichment
- ML-powered triage and reasoning

### 4. Scanner Sandbox
- Containerized vulnerability and network scanning
- Automated execution and result reporting
- Integration with the backend and agent pipeline

## Communication Flow

1. User interacts with the frontend.
2. Frontend calls backend APIs.
3. Backend triggers agent analysis and scanner jobs.
4. Results are aggregated and presented to the user.

## Design Goals

- Scalability
- Security-first architecture
- Observable operations
- Team ownership by domain
- Clear module boundaries
