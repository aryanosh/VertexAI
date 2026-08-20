-- ============================================================================
-- VertexAI Database Schema — Exactly 7 Tables
-- Per architecture_plan.md §8 (verbatim DDL)
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'ANALYST', 'VIEWER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ASSETS TABLE
CREATE TABLE IF NOT EXISTS assets (
    asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    environment VARCHAR(50) CHECK (environment IN ('PRODUCTION', 'STAGING', 'DEV')),
    criticality_rating INT CHECK (criticality_rating BETWEEN 1 AND 5),
    owner_email VARCHAR(255) NOT NULL,
    is_authorized BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. SCAN JOBS TABLE
CREATE TABLE IF NOT EXISTS scan_jobs (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(asset_id),
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'WAITING_FOR_HUMAN', 'COMPLETED', 'STOPPED', 'FAILED')),
    scanners_used TEXT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 3a. SCAN JOBS — authoritative HITL pipeline progress + per-agent timings.
-- Added as columns on the existing table so the schema stays at exactly 7 tables.
-- current_stage makes stage progress survive a backend restart (previously in-memory only).
-- stage_timings holds a JSON array of {stage, agent, started_at, completed_at, duration_ms}.
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS current_stage INT DEFAULT 0;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS stage_timings TEXT;

-- 3b. SCAN JOBS — per-run isolation support.
-- dedup_report_json: Agent 2's full per-finding dedup detail for THIS run (finding id,
-- CVE, scanner, asset, severity, description, duplicate-group id, duplicate status,
-- removal/retention reason) — served back via GET /api/scans/{id}/dedup-report[.csv].
-- is_seed_data: marks the one fixed demo/seed scan job (below) so every "current run"
-- query (dashboard, findings list, graphs) can exclude it by default and never silently
-- mix permanent demo rows into a real scan's results.
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS dedup_report_json TEXT;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS is_seed_data BOOLEAN DEFAULT FALSE;
-- raw_findings_count: Agent 1's output size for THIS run, persisted so the dashboard's
-- before/after noise-reduction numbers are real per-scan data (previously a single
-- mutable in-memory field on PipelineOrchestrator, shared/overwritten across every scan
-- and every dashboard viewer regardless of which run they were looking at). The "after"
-- count needs no equivalent column: it's simply count(canonical_vulnerabilities WHERE
-- scan_job_id = this run), always queried live from the real persisted rows.
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS raw_findings_count INT;

-- 4. CANONICAL VULNERABILITIES TABLE
CREATE TABLE IF NOT EXISTS canonical_vulnerabilities (
    finding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint_hash VARCHAR(64) UNIQUE NOT NULL,
    cve_id VARCHAR(50) NOT NULL,
    vulnerability_name VARCHAR(255) NOT NULL,
    target_host VARCHAR(255) NOT NULL,
    target_port INT NOT NULL,
    cvss_base_score DOUBLE PRECISION NOT NULL,
    scanner_sources TEXT NOT NULL,
    false_positive_prob DOUBLE PRECISION DEFAULT 0.0,
    is_suppressed BOOLEAN DEFAULT FALSE,
    is_accepted_risk BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4a. CANONICAL VULNERABILITIES — run isolation.
-- Previously this table had a single GLOBAL unique constraint on fingerprint_hash, so
-- every scan ever run shared ONE pool of rows: the first scan to insert a given
-- fingerprint "owned" it forever and every later scan of the same finding was silently
-- dropped (an insert-if-absent, never update). Dashboards/graphs/tables then always
-- read this same unscoped shared pool — which is why results looked "random" between
-- runs. Fix: tag every row with the scan that produced it, and make the uniqueness
-- constraint (scan_job_id, fingerprint_hash) instead of fingerprint_hash alone, so each
-- run gets its own row even for a finding it shares with a previous run.
ALTER TABLE canonical_vulnerabilities ADD COLUMN IF NOT EXISTS scan_job_id UUID REFERENCES scan_jobs(scan_id);

-- Plain, single-statement, idempotent DDL only below — Spring Boot's default SQL script
-- runner (`ScriptUtils`) splits schema.sql on bare semicolons with no PL/pgSQL awareness,
-- so a `DO $$ ... END $$;` block here gets sliced apart at the first semicolon INSIDE the
-- block and handed to the driver as a truncated, unterminated statement (crashes the whole
-- backend on startup with "Unterminated dollar quote"). `DROP CONSTRAINT IF EXISTS` is
-- already natively idempotent, and a unique index gives identical uniqueness guarantees to
-- a named UNIQUE constraint (Postgres enforces both the same way, and `ON CONFLICT
-- (scan_job_id, fingerprint_hash)` below works against either) — so neither needs a DO block.
ALTER TABLE canonical_vulnerabilities DROP CONSTRAINT IF EXISTS canonical_vulnerabilities_fingerprint_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_canon_vuln_scan_fingerprint ON canonical_vulnerabilities(scan_job_id, fingerprint_hash);

CREATE INDEX IF NOT EXISTS idx_canon_vuln_scan_job ON canonical_vulnerabilities(scan_job_id);

-- 5. VULNERABILITY INTELLIGENCE TABLE
-- Deliberately kept keyed by cve_id (not scan-scoped): CISA KEV/EPSS/NVD intel is a
-- genuine global fact about a CVE, correctly shared/cached across every scan that
-- references it — scoping it per-run would just force redundant re-fetching of
-- identical intel. last_scan_job_id below is provenance/audit only (which run most
-- recently refreshed this row), never part of its identity or uniqueness.
CREATE TABLE IF NOT EXISTS vulnerability_intelligence (
    cve_id VARCHAR(50) PRIMARY KEY,
    is_cisa_kev BOOLEAN DEFAULT FALSE,
    epss_score DOUBLE PRECISION DEFAULT 0.0,
    epss_percentile DOUBLE PRECISION DEFAULT 0.0,
    exploit_db_available BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE vulnerability_intelligence ADD COLUMN IF NOT EXISTS last_scan_job_id UUID REFERENCES scan_jobs(scan_id);

-- 6. RISK SCORES TABLE
CREATE TABLE IF NOT EXISTS risk_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID REFERENCES canonical_vulnerabilities(finding_id),
    composite_risk_score DOUBLE PRECISION NOT NULL,
    priority_level VARCHAR(20) NOT NULL,
    explainable_rationale TEXT NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6a. RISK SCORES — Agent 4's ticket-ready draft (title/body/labels/owner/sla),
-- persisted alongside the score so it survives past the in-memory pipeline cache
-- and the frontend/backend can show it before a human approves ticket creation.
ALTER TABLE risk_scores ADD COLUMN IF NOT EXISTS ticket_payload_json TEXT;

-- 6b. RISK SCORES — run isolation. Denormalized from finding.scan_job_id at write
-- time (kept in sync by PipelineOrchestrator) purely so scan-scoped dashboard/graph
-- queries can filter/aggregate without an extra join.
ALTER TABLE risk_scores ADD COLUMN IF NOT EXISTS scan_job_id UUID REFERENCES scan_jobs(scan_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_scan_job ON risk_scores(scan_job_id);

-- 7. RISK TICKETS TABLE
CREATE TABLE IF NOT EXISTS risk_tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID REFERENCES canonical_vulnerabilities(finding_id),
    ticket_system VARCHAR(50) NOT NULL,
    external_ticket_url VARCHAR(500) NOT NULL,
    assigned_owner VARCHAR(255) NOT NULL,
    sla_deadline TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'OPEN'
);

-- ============================================================================
-- Seed Data — Default admin user for development
-- ============================================================================
-- Password: admin123 (BCrypt hash)
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@vertexai.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ADMIN')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, password_hash, role)
VALUES ('analyst', 'analyst@vertexai.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ANALYST')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, password_hash, role)
VALUES ('viewer', 'viewer@vertexai.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'VIEWER')
ON CONFLICT (username) DO NOTHING;

-- Seed Authorized Asset
INSERT INTO assets (asset_id, hostname, ip_address, environment, criticality_rating, owner_email, is_authorized)
VALUES ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'prod-api-server-01.internal', '10.0.1.15', 'PRODUCTION', 5, 'secops@vertexai.local', TRUE)
ON CONFLICT (hostname) DO NOTHING;

-- Seed Scan Job — a single, well-known, permanently-marked "not a real run" job that
-- every seed finding/score/intel row below is tagged with via scan_job_id. Every
-- scan-scoped API query (dashboard, findings list, graphs, dedup report) filters out
-- is_seed_data=TRUE by default, so this demo data can never silently mix into or get
-- mistaken for a real scan's results.
INSERT INTO scan_jobs (scan_id, asset_id, status, scanners_used, current_stage, is_seed_data, completed_at)
VALUES ('00000000-0000-0000-0000-000000000001', '3fa85f64-5717-4562-b3fc-2c963f66afa6', 'COMPLETED', 'SEED_DATA', 4, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (scan_id) DO NOTHING;

-- Seed Canonical Vulnerabilities
INSERT INTO canonical_vulnerabilities (finding_id, scan_job_id, fingerprint_hash, cve_id, vulnerability_name, target_host, target_port, cvss_base_score, scanner_sources, false_positive_prob, is_suppressed, is_accepted_risk)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '00000000-0000-0000-0000-000000000001', 'e9b0c290d0fb1ca068ffaddf22cbd0a1', 'CVE-2021-44228', 'Apache Log4j2 JNDI Remote Code Execution', '10.0.1.15', 8080, 10.0, 'NUCLEI, OWASP_ZAP', 0.02, FALSE, FALSE),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '00000000-0000-0000-0000-000000000001', 'f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6', 'CVE-2023-44487', 'HTTP/2 Rapid Reset Denial of Service', '10.0.1.15', 443, 7.5, 'NUCLEI', 0.05, FALSE, FALSE),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', '00000000-0000-0000-0000-000000000001', 'a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4', 'CVE-2021-21985', 'VMware vCenter Server Remote Code Execution', '10.0.1.15', 443, 9.8, 'OPENVAS', 0.04, FALSE, FALSE),
  ('d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a', '00000000-0000-0000-0000-000000000001', 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', 'CVE-2022-22965', 'Spring Framework Spring4Shell RCE', '10.0.1.15', 8080, 5.2, 'OWASP_ZAP', 0.08, FALSE, FALSE),
  ('e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b', '00000000-0000-0000-0000-000000000001', 'd2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7', 'CVE-1999-0524', 'ICMP Timestamp Request Information Disclosure', '10.0.1.15', 80, 3.0, 'OPENVAS', 0.92, TRUE, FALSE)
ON CONFLICT (scan_job_id, fingerprint_hash) DO NOTHING;

-- Seed Threat Intelligence
INSERT INTO vulnerability_intelligence (cve_id, is_cisa_kev, epss_score, epss_percentile, exploit_db_available, last_scan_job_id)
VALUES
  ('CVE-2021-44228', TRUE, 0.972, 0.999, TRUE, '00000000-0000-0000-0000-000000000001'),
  ('CVE-2023-44487', TRUE, 0.770, 0.980, TRUE, '00000000-0000-0000-0000-000000000001'),
  ('CVE-2021-21985', TRUE, 0.880, 0.990, TRUE, '00000000-0000-0000-0000-000000000001'),
  ('CVE-2022-22965', FALSE, 0.520, 0.850, FALSE, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (cve_id) DO NOTHING;

-- Seed Risk Scores
INSERT INTO risk_scores (score_id, finding_id, scan_job_id, composite_risk_score, priority_level, explainable_rationale)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '00000000-0000-0000-0000-000000000001', 94.5, 'P0_CRITICAL', 'Composite Risk Score: 94.5/100.0 [P0_CRITICAL]. CVSS Base Score: 10.0 (contributes 3.0 pts). EPSS Score: 0.972 (contributes 34.0 pts). CISA KEV: Listed in Known Exploited Vulnerabilities (+25.0 pts). Asset Criticality: 5/5 (contributes 20.0 pts). Scanners: NUCLEI, OWASP_ZAP.'),
  ('22222222-2222-2222-2222-222222222222', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '00000000-0000-0000-0000-000000000001', 77.0, 'P1_HIGH', 'Composite Risk Score: 77.0/100.0 [P1_HIGH]. High exploit probability on production web server.'),
  ('33333333-3333-3333-3333-333333333333', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', '00000000-0000-0000-0000-000000000001', 88.0, 'P0_CRITICAL', 'Composite Risk Score: 88.0/100.0 [P0_CRITICAL]. Critical remote execution vulnerability on production infrastructure.'),
  ('44444444-4444-4444-4444-444444444444', 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a', '00000000-0000-0000-0000-000000000001', 52.0, 'P2_MEDIUM', 'Composite Risk Score: 52.0/100.0 [P2_MEDIUM]. Medium risk vulnerability with moderate exploit likelihood.')
ON CONFLICT (score_id) DO NOTHING;

-- ============================================================================
-- Backfill — tags pre-existing rows from an already-running database (created
-- before this migration added scan_job_id) so an upgrade never leaves old seed
-- data unscoped and mixed into "current run" queries. No-op on a fresh install
-- (the INSERTs above already set scan_job_id, so nothing here matches).
-- ============================================================================
UPDATE canonical_vulnerabilities SET scan_job_id = '00000000-0000-0000-0000-000000000001'
WHERE scan_job_id IS NULL AND fingerprint_hash IN (
  'e9b0c290d0fb1ca068ffaddf22cbd0a1', 'f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6',
  'a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4', 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  'd2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7'
);

UPDATE risk_scores SET scan_job_id = '00000000-0000-0000-0000-000000000001'
WHERE scan_job_id IS NULL AND score_id IN (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'
);

UPDATE vulnerability_intelligence SET last_scan_job_id = '00000000-0000-0000-0000-000000000001'
WHERE last_scan_job_id IS NULL AND cve_id IN (
  'CVE-2021-44228', 'CVE-2023-44487', 'CVE-2021-21985', 'CVE-2022-22965'
);

