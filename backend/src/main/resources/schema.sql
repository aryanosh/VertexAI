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

-- 5. VULNERABILITY INTELLIGENCE TABLE
CREATE TABLE IF NOT EXISTS vulnerability_intelligence (
    cve_id VARCHAR(50) PRIMARY KEY,
    is_cisa_kev BOOLEAN DEFAULT FALSE,
    epss_score DOUBLE PRECISION DEFAULT 0.0,
    epss_percentile DOUBLE PRECISION DEFAULT 0.0,
    exploit_db_available BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. RISK SCORES TABLE
CREATE TABLE IF NOT EXISTS risk_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID REFERENCES canonical_vulnerabilities(finding_id),
    composite_risk_score DOUBLE PRECISION NOT NULL,
    priority_level VARCHAR(20) NOT NULL,
    explainable_rationale TEXT NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
