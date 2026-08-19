import hashlib
import os
import uuid
import pandas as pd
import xgboost as xgb
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/v1/agent2")

class UnifiedFinding(BaseModel):
    scanner_source: str
    cve_id: str
    vulnerability_name: str
    target_host: str
    target_port: int
    endpoint_path: str
    cvss_base_score: float
    scanner_confidence: int
    http_response_code: int
    port_is_open: int
    historical_plugin_fp_rate: float

class CanonicalFinding(BaseModel):
    finding_id: str
    fingerprint_hash: str
    cve_id: str
    vulnerability_name: str
    target_host: str
    target_port: int
    cvss_base_score: float
    scanner_sources: List[str]
    false_positive_prob: float
    is_suppressed: bool
    is_accepted_risk: bool
    is_cisa_kev: Optional[bool] = None
    epss_score: Optional[float] = None
    composite_risk_score: Optional[float] = None
    priority_level: Optional[str] = None
    sla_deadline: Optional[str] = None
    explainable_rationale: Optional[str] = None

class Agent2Request(BaseModel):
    findings: List[UnifiedFinding]

class Agent2Statistics(BaseModel):
    input_count: int
    output_count: int
    duplicate_reduction_pct: float
    suppressed_count: int

class Agent2Response(BaseModel):
    status: str = "WAITING_FOR_HUMAN"
    findings: List[CanonicalFinding]
    statistics: Agent2Statistics

def load_model():
    model_path = os.path.join(os.path.dirname(__file__), "models", "xgboost_fp.json")
    if os.path.exists(model_path):
        try:
            model = xgb.XGBClassifier()
            model.load_model(model_path)
            return model
        except Exception as e:
            # Model file may have been produced by a newer XGBoost version than the
            # one installed. Never crash the pipeline: fall back to the heuristic.
            print(f"WARNING: Failed to load XGBoost model ({e}); using heuristic FP scoring.")
            return None
    return None

def heuristic_fp_prob(scanner_confidence, has_cve_id, http_response_code, port_is_open, fp_rate):
    prob = fp_rate * 0.4
    if not has_cve_id:
        prob += 0.3
    if scanner_confidence == 1:
        prob += 0.2
    elif scanner_confidence == 2:
        prob += 0.1
    if http_response_code == 404:
        prob += 0.15
    if not port_is_open:
        prob += 0.2
    return min(prob, 1.0)

@router.post("/reduce-noise", response_model=Agent2Response)
async def reduce_noise(request: Agent2Request):
    input_count = len(request.findings)
    if input_count == 0:
        return Agent2Response(
            findings=[],
            statistics=Agent2Statistics(
                input_count=0,
                output_count=0,
                duplicate_reduction_pct=0.0,
                suppressed_count=0
            )
        )

    # Convert to dict for pandas
    findings_dicts = [f.model_dump() for f in request.findings]
    
    # Calculate fingerprints
    for f in findings_dicts:
        fingerprint = hashlib.md5(
            f"{f['target_host']}:{f['target_port']}:{f['cve_id']}:{f['endpoint_path']}".encode()
        ).hexdigest()
        f['fingerprint_hash'] = fingerprint
        f['has_cve_id'] = 1 if f['cve_id'].startswith("CVE-") else 0
        
    df = pd.DataFrame(findings_dicts)
    
    canonical_findings = []
    suppressed_count = 0
    
    model = load_model()

    # Group by fingerprint_hash
    grouped = df.groupby('fingerprint_hash')
    for fingerprint_hash, group in grouped:
        first_finding = group.iloc[0]
        
        # Aggregate scanner sources
        scanner_sources = group['scanner_source'].unique().tolist()
        
        # Mean features for model
        avg_confidence = group['scanner_confidence'].mean()
        avg_has_cve_id = group['has_cve_id'].mean()
        avg_http = group['http_response_code'].mean()
        avg_port = group['port_is_open'].mean()
        avg_fp_rate = group['historical_plugin_fp_rate'].mean()
        
        if model is not None:
            # Predict using model (assumes model can handle this specific numpy array shape)
            import numpy as np
            features = np.array([[avg_confidence, avg_has_cve_id, avg_http, avg_port, avg_fp_rate]])
            false_positive_prob = float(model.predict_proba(features)[0][1]) # Assuming class 1 is FP
        else:
            # Fallback heuristic
            false_positive_prob = heuristic_fp_prob(
                round(avg_confidence),
                bool(round(avg_has_cve_id)),
                round(avg_http),
                round(avg_port),
                avg_fp_rate
            )
            
        is_suppressed = false_positive_prob > 0.85
        if is_suppressed:
            suppressed_count += 1
            
        canonical_findings.append(CanonicalFinding(
            finding_id=str(uuid.uuid4()),
            fingerprint_hash=str(fingerprint_hash),
            cve_id=str(first_finding['cve_id']),
            vulnerability_name=str(first_finding['vulnerability_name']),
            target_host=str(first_finding['target_host']),
            target_port=int(first_finding['target_port']),
            cvss_base_score=float(group['cvss_base_score'].max()),
            scanner_sources=scanner_sources,
            false_positive_prob=float(false_positive_prob),
            is_suppressed=is_suppressed,
            is_accepted_risk=False
        ))
        
    output_count = len(canonical_findings)
    duplicate_reduction_pct = ((input_count - output_count) / input_count * 100.0) if input_count > 0 else 0.0
    
    return Agent2Response(
        findings=canonical_findings,
        statistics=Agent2Statistics(
            input_count=input_count,
            output_count=output_count,
            duplicate_reduction_pct=duplicate_reduction_pct,
            suppressed_count=suppressed_count
        )
    )
