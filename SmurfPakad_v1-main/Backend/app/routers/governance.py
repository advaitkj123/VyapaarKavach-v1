"""
Governance Router — AI Model Governance & Responsible AI
=========================================================
Provides endpoints for model fairness, bias detection, and drift monitoring.
Compatible with IBM watsonx.governance principles.
"""
from fastapi import APIRouter

from app.services.governance_service import governance_service


router = APIRouter(prefix="/governance", tags=["AI Governance"])


@router.get("/fairness")
async def get_fairness_report():
    """
    Get AI fairness and bias detection report.
    
    Shows:
    - Demographic parity across wallet categories
    - Flag rate disparity detection
    - Platform bias analysis
    - Overall fairness score (A-F grade)
    """
    return governance_service.get_fairness_report()


@router.get("/drift")
async def get_drift_report():
    """
    Get model prediction drift report.
    
    Monitors:
    - Daily prediction distribution changes
    - Mean risk score trends
    - Flag rate stability
    """
    return governance_service.get_drift_report()


@router.get("/audit")
async def get_audit_summary():
    """
    Get compliance audit trail summary.
    
    Includes:
    - Total predictions logged
    - Model version history
    - Compliance certifications
    - Audit timeline
    """
    return governance_service.get_audit_summary()


@router.get("/summary")
async def get_governance_summary():
    """Get combined governance overview for the dashboard."""
    fairness = governance_service.get_fairness_report()
    drift = governance_service.get_drift_report()
    audit = governance_service.get_audit_summary()
    
    return {
        "fairnessScore": fairness["fairnessScore"],
        "fairnessGrade": fairness["fairnessGrade"],
        "driftStatus": drift["driftStatus"],
        "complianceStatus": audit["complianceStatus"],
        "biasAlerts": len([a for a in fairness["biasAlerts"] if a["severity"] in ("HIGH", "MEDIUM")]),
        "totalPredictions": fairness["totalPredictions"],
        "poweredBy": "IBM watsonx.governance",
    }
