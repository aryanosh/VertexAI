/**
 * MSW Mock Fixture Data
 * Mirrors the exact CanonicalFinding contract from integration_plan.md §5.
 * Used by MSW handlers to simulate the Spring Boot backend on port 8080.
 */

import type {
  CanonicalFinding,
  DashboardMetrics,
  ScanJob,
} from '@/types/contracts';

// ---------------------------------------------------------------------------
// Canonical Findings fixtures
// ---------------------------------------------------------------------------
export const mockFindings: CanonicalFinding[] = [
  {
    finding_id: 'a1b2c3d4-0001-0000-0000-000000000001',
    fingerprint_hash: 'ab12cd34ef56ab12cd34ef56ab12cd34',
    cve_id: 'CVE-2021-44228',
    vulnerability_name: 'Apache Log4Shell Remote Code Execution',
    target_host: 'prod-api-server-01.internal',
    target_port: 8443,
    scanner_sources: ['NUCLEI', 'OWASP_ZAP'],
    false_positive_prob: 0.02,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: true,
    epss_score: 0.972,
    composite_risk_score: 94.5,
    priority_level: 'P0_CRITICAL',
    sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    explainable_rationale:
      'CISA KEV-listed (+25 pts). EPSS score 97.2% indicates near-certain active exploitation. ' +
      'CVSS 10.0 base score. Asset criticality 5/5 (production). ' +
      'Composite: (10.0×0.30) + (0.972×10×0.35) + 25.0 + (5×4.0) = 94.5.',
  },
  {
    finding_id: 'a1b2c3d4-0002-0000-0000-000000000002',
    fingerprint_hash: 'cd34ef56ab12cd34ef56ab12cd34ef56',
    cve_id: 'CVE-2023-44487',
    vulnerability_name: 'HTTP/2 Rapid Reset Attack (DDOS)',
    target_host: 'prod-api-server-01.internal',
    target_port: 443,
    scanner_sources: ['NMAP', 'NUCLEI'],
    false_positive_prob: 0.08,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: true,
    epss_score: 0.754,
    composite_risk_score: 77.4,
    priority_level: 'P1_HIGH',
    sla_deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    explainable_rationale:
      'CISA KEV-listed (+25 pts). EPSS 75.4%. CVSS 7.5. Asset criticality 4/5. ' +
      'Composite: (7.5×0.30) + (0.754×10×0.35) + 25.0 + (4×4.0) = 77.4.',
  },
  {
    finding_id: 'a1b2c3d4-0003-0000-0000-000000000003',
    fingerprint_hash: 'ef56ab12cd34ef56ab12cd34ef56ab12',
    cve_id: 'CVE-2022-22965',
    vulnerability_name: 'Spring4Shell Remote Code Execution',
    target_host: 'staging-backend-02.internal',
    target_port: 8080,
    scanner_sources: ['OWASP_ZAP'],
    false_positive_prob: 0.15,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: false,
    epss_score: 0.512,
    composite_risk_score: 51.9,
    priority_level: 'P2_MEDIUM',
    sla_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    explainable_rationale:
      'Not KEV-listed. EPSS 51.2%. CVSS 9.8 base but staging environment (criticality 2/5). ' +
      'Composite: (9.8×0.30) + (0.512×10×0.35) + 0 + (2×4.0) = 51.9.',
  },
  {
    finding_id: 'a1b2c3d4-0004-0000-0000-000000000004',
    fingerprint_hash: '1234567890abcdef1234567890abcdef',
    cve_id: 'CVE-2021-21985',
    vulnerability_name: 'VMware vCenter Server RCE',
    target_host: 'infra-vcenter.internal',
    target_port: 443,
    scanner_sources: ['OPENVAS', 'NUCLEI'],
    false_positive_prob: 0.04,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: true,
    epss_score: 0.891,
    composite_risk_score: 88.1,
    priority_level: 'P0_CRITICAL',
    sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    explainable_rationale:
      'CISA KEV-listed (+25 pts). EPSS 89.1%. CVSS 9.8. Infrastructure asset criticality 5/5. ' +
      'Composite: (9.8×0.30) + (0.891×10×0.35) + 25.0 + (5×4.0) = 88.1.',
  },
  {
    finding_id: 'a1b2c3d4-0005-0000-0000-000000000005',
    fingerprint_hash: 'fedcba0987654321fedcba0987654321',
    cve_id: 'CVE-2020-1472',
    vulnerability_name: 'Zerologon — Netlogon Privilege Escalation',
    target_host: 'corp-dc-01.internal',
    target_port: 445,
    scanner_sources: ['NMAP', 'OPENVAS'],
    false_positive_prob: 0.91,
    is_suppressed: true,
    is_accepted_risk: false,
    is_cisa_kev: false,
    epss_score: 0.12,
    composite_risk_score: 18.2,
    priority_level: 'P3_LOW',
    sla_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    explainable_rationale:
      'XGBoost FP probability 91% → suppressed. Port 445 filtered by host-based firewall. ' +
      'Low EPSS for this target environment. Composite: 18.2.',
  },
];

// ---------------------------------------------------------------------------
// Dashboard Metrics fixture
// ---------------------------------------------------------------------------
export const mockDashboard: DashboardMetrics = {
  security_score: 96,
  total_findings: 5,
  active_findings: 4,
  suppressed_findings: 1,
  noise_reduction_rate: 94.0,
  top_threats: mockFindings.filter((f) => !f.is_suppressed).slice(0, 3),
  pipeline_status: 'WAITING_FOR_HUMAN',
};

// ---------------------------------------------------------------------------
// Scan Job fixture
// ---------------------------------------------------------------------------
export const mockScanJob: ScanJob = {
  scan_id: 'scan-uuid-0001-0000-000000000001',
  asset_id: 'asset-uuid-0001-0000-000000000001',
  status: 'WAITING_FOR_HUMAN',
  scanners_used: 'NMAP,NUCLEI,OWASP_ZAP,OPENVAS',
  started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  completed_at: null,
  agent_output: {
    stage: 2,
    findings: mockFindings,
    message: 'Agent 2 Noise Reduction complete — awaiting human review.',
  },
};
