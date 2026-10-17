"""
IBM AI Router — IBM watsonx.ai powered endpoints
Provides AI-generated analyst briefs, advisories, and service status.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional

from app.services.ibm_watsonx_service import ibm_watsonx_service

router = APIRouter(prefix="/ibm-ai", tags=["IBM AI"])


# ============================================================================
# Request / Response Models
# ============================================================================

class AnalystBriefRequest(BaseModel):
    walletId: str = Field(..., description="Wallet address or ID to analyze")
    riskScore: float = Field(..., ge=0, le=1, description="ML model risk score")
    riskLevel: str = Field(default="medium", description="Risk level")
    patterns: List[Dict] = Field(default=[], description="Detected structural patterns")
    featureImportance: List[Dict] = Field(default=[], description="Feature importance data")
    graphMetrics: Optional[Dict] = Field(default=None, description="Graph metrics")
    narrative: Optional[str] = Field(default=None, description="Pre-generated XAI narrative")


class AnalystBriefResponse(BaseModel):
    walletId: str
    brief: str
    recommendations: List[str]
    regulatoryFlags: List[str]
    riskAssessment: str
    generatedBy: str
    modelId: str
    generatedAt: str
    confidence: float


class SafeguardAdvisoryRequest(BaseModel):
    recipient: str
    amount: float = Field(ge=0)
    riskScore: float = Field(ge=0, le=1)
    riskLevel: str = "medium"
    reasons: List[str] = []
    platform: str = "unknown"


class SafeguardAdvisoryResponse(BaseModel):
    advisory: str
    generatedBy: str
    generatedAt: str


class ServiceStatusResponse(BaseModel):
    configured: bool
    provider: str
    model: str
    endpoint: str
    status: str
    message: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/analyst-brief", response_model=AnalystBriefResponse)
async def generate_analyst_brief(request: AnalystBriefRequest):
    """
    Generate an AI-powered analyst brief for a flagged wallet.
    
    Uses IBM watsonx.ai Granite model to produce:
    - Executive summary
    - Risk assessment with pattern analysis
    - FATF regulatory flag mapping
    - Investigation recommendations
    
    Falls back to local template engine if IBM API is unavailable.
    """
    try:
        result = await ibm_watsonx_service.generate_analyst_brief(
            wallet_id=request.walletId,
            risk_score=request.riskScore,
            risk_level=request.riskLevel,
            patterns=request.patterns,
            feature_importance=request.featureImportance,
            graph_metrics=request.graphMetrics,
            narrative=request.narrative,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Brief generation failed: {str(e)}")


@router.post("/safeguard-advisory", response_model=SafeguardAdvisoryResponse)
async def generate_safeguard_advisory(request: SafeguardAdvisoryRequest):
    """
    Generate a real-time advisory for Chrome Extension payment interceptions.
    Shorter and more actionable than full analyst briefs.
    """
    try:
        result = await ibm_watsonx_service.generate_safeguard_advisory(
            recipient=request.recipient,
            amount=request.amount,
            risk_score=request.riskScore,
            risk_level=request.riskLevel,
            reasons=request.reasons,
            platform=request.platform,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Advisory generation failed: {str(e)}")


@router.get("/status", response_model=ServiceStatusResponse)
async def get_ibm_service_status():
    """
    Check IBM watsonx.ai service connectivity and configuration status.
    
    Returns whether the service is configured, connected, and operational.
    """
    return await ibm_watsonx_service.get_service_status()
