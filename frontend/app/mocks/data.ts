// Mock data matching the exact CanonicalFinding data contract
export const MOCK_DASHBOARD = {
  security_score: 82,
  open_incidents: 6,
  auto_resolution_pct: 35,
  ai_confidence_pct: 94,
  before_noise: 148,
  after_noise: 23,
  top_threats: [
    { name: "Credential Stuffing", pct: 87, color: "#ef4444" },
    { name: "API Abuse",           pct: 56, color: "#f97316" },
    { name: "Ransomware",          pct: 17, color: "#a855f7" },
    { name: "Privilege Escalation",pct: 8,  color: "#06b6d4" },
  ],
  infrastructure: [
    { name: "Cloud Services", pct: 71, count: null },
    { name: "Endpoints",      pct: 46, count: 4692 },
    { name: "Servers",        pct: 28, count: 128 },
    { name: "Databases",      pct: 19, count: 56 },
  ],
  ai_insights: [
    { label: "Threats detected by AI",  value: "32%" },
    { label: "False positives reduced", value: "18%" },
    { label: "Mean time to detect",     value: "3h" },
  ],
  automation: {
    playbooks_executed: 47,
    auto_resolved_pct: 8,
    active: true,
  },
};

export const MOCK_VULNERABILITIES = [
  {
    finding_id: "a1b2c3d4-0001-0000-0000-000000000001",
    fingerprint_hash: "5d41402abc4b2a76b9719d911017c592",
    cve_id: "CVE-2024-21762",
    vulnerability_name: "Fortinet FortiOS SSL-VPN Out-of-Bound Write",
    target_host: "10.0.1.45",
    target_port: 443,
    scanner_sources: ["nuclei", "openvas"],
    false_positive_prob: 0.03,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: true,
    epss_score: 0.97,
    composite_risk_score: 94.2,
    priority_level: "P0_CRITICAL",
    sla_deadline: new Date(Date.now() + 86400000).toISOString(),
    explainable_rationale:
      "CISA KEV-listed with EPSS 0.97 indicating near-certain exploitation. Asset criticality 5/5. Immediate remediation required.",
  },
  {
    finding_id: "a1b2c3d4-0002-0000-0000-000000000002",
    fingerprint_hash: "7215ee9c7d9dc229d2921a40e899ec5f",
    cve_id: "CVE-2024-3400",
    vulnerability_name: "PAN-OS Command Injection via GlobalProtect",
    target_host: "10.0.2.12",
    target_port: 443,
    scanner_sources: ["nuclei", "zap"],
    false_positive_prob: 0.06,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: true,
    epss_score: 0.95,
    composite_risk_score: 87.5,
    priority_level: "P0_CRITICAL",
    sla_deadline: new Date(Date.now() + 86400000).toISOString(),
    explainable_rationale:
      "Active exploitation detected in the wild. CISA KEV-listed. EPSS 0.95. Critical infrastructure asset.",
  },
  {
    finding_id: "a1b2c3d4-0003-0000-0000-000000000003",
    fingerprint_hash: "b14a7b8059d9c055954c92674ce60032",
    cve_id: "CVE-2023-44487",
    vulnerability_name: "HTTP/2 Rapid Reset Attack (DoS)",
    target_host: "10.0.3.77",
    target_port: 80,
    scanner_sources: ["nmap", "nuclei"],
    false_positive_prob: 0.12,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: false,
    epss_score: 0.72,
    composite_risk_score: 71.3,
    priority_level: "P1_HIGH",
    sla_deadline: new Date(Date.now() + 259200000).toISOString(),
    explainable_rationale:
      "High-volume exploitation pattern. EPSS 0.72 with confirmed PoC available on Exploit-DB. Patch within 72h SLA.",
  },
  {
    finding_id: "a1b2c3d4-0004-0000-0000-000000000004",
    fingerprint_hash: "eccbc87e4b5ce2fe28308fd9f2a7baf3",
    cve_id: "CVE-2024-1709",
    vulnerability_name: "ConnectWise ScreenConnect Auth Bypass",
    target_host: "10.0.4.23",
    target_port: 8040,
    scanner_sources: ["openvas"],
    false_positive_prob: 0.18,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: true,
    epss_score: 0.88,
    composite_risk_score: 79.1,
    priority_level: "P1_HIGH",
    sla_deadline: new Date(Date.now() + 259200000).toISOString(),
    explainable_rationale:
      "Authentication bypass on remote access tool. CISA KEV-listed. High lateral-movement potential.",
  },
  {
    finding_id: "a1b2c3d4-0005-0000-0000-000000000005",
    fingerprint_hash: "c4ca4238a0b923820dcc509a6f75849b",
    cve_id: "CVE-2023-36884",
    vulnerability_name: "Windows Search RCE via Office Documents",
    target_host: "10.0.5.102",
    target_port: 445,
    scanner_sources: ["nmap", "openvas"],
    false_positive_prob: 0.22,
    is_suppressed: false,
    is_accepted_risk: false,
    is_cisa_kev: false,
    epss_score: 0.48,
    composite_risk_score: 54.7,
    priority_level: "P2_MEDIUM",
    sla_deadline: new Date(Date.now() + 1209600000).toISOString(),
    explainable_rationale:
      "RCE vector via Office documents. EPSS 0.48. Mitigated by macro-blocking policy on this host.",
  },
];

export const MOCK_SCAN = {
  scan_id: "scan-demo-0001",
  asset_id: "asset-demo-0001",
  status: "WAITING_FOR_HUMAN",
  current_stage: "HUMAN_REVIEW_2",
  current_agent: 2,
  scanners_used: "nmap,nuclei,zap,openvas",
  started_at: new Date(Date.now() - 300000).toISOString(),
  completed_at: null,
  agent_output: {
    stage: "Agent 2 — Noise Reduction",
    summary: "Deduplicated 148 raw findings → 23 canonical findings. Suppressed 12 as false-positives (FP prob > 0.85). 3 accepted-risk findings excluded.",
    findings_count: 23,
    suppressed_count: 12,
    accepted_risk_count: 3,
  },
};

export type PipelineStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_FOR_HUMAN"
  | "COMPLETED"
  | "STOPPED"
  | "FAILED";

export interface PipelineEvent {
  id: string;
  timestamp: string;
  status: PipelineStatus;
  stage: string;
  message: string;
  agent?: number;
}

export const INITIAL_PIPELINE_EVENTS: PipelineEvent[] = [
  {
    id: "evt-001",
    timestamp: new Date(Date.now() - 300000).toISOString(),
    status: "COMPLETED",
    stage: "Scan",
    message: "Multi-scanner execution completed. 4 scanners: Nmap, Nuclei, ZAP, OpenVAS.",
    agent: undefined,
  },
  {
    id: "evt-002",
    timestamp: new Date(Date.now() - 240000).toISOString(),
    status: "COMPLETED",
    stage: "Parse & Normalize",
    message: "Agent 1 parsed 148 raw findings into UnifiedFinding format.",
    agent: 1,
  },
  {
    id: "evt-003",
    timestamp: new Date(Date.now() - 180000).toISOString(),
    status: "COMPLETED",
    stage: "Human Review 1",
    message: "Analyst approved Agent 1 output. Pipeline advanced.",
    agent: undefined,
  },
  {
    id: "evt-004",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    status: "COMPLETED",
    stage: "Deduplicate & FP Filtering",
    message: "Agent 2 deduplicated findings. 23 canonical findings retained.",
    agent: 2,
  },
  {
    id: "evt-005",
    timestamp: new Date(Date.now() - 30000).toISOString(),
    status: "WAITING_FOR_HUMAN",
    stage: "Human Review 2",
    message: "Awaiting analyst review of deduplicated findings before threat intelligence enrichment.",
    agent: undefined,
  },
];
