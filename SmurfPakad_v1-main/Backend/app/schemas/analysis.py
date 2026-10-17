"""
Analysis Schemas
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class AnalysisSummary(BaseModel):
    totalTransactions: int
    suspiciousTransactions: int
    riskScore: float
    patternsDetected: int


class RiskDistribution(BaseModel):
    high: int
    medium: int
    low: int


class ModelMetrics(BaseModel):
    confidence: float
    processingTime: float


class AnalysisResponse(BaseModel):
    uploadId: str
    status: str
    summary: AnalysisSummary
    riskDistribution: RiskDistribution
    modelMetrics: ModelMetrics


class DetectedPattern(BaseModel):
    id: str
    type: str
    description: str
    confidence: float
    transactions: List[str] = []
    detectedAt: Optional[datetime] = None


class PatternResponse(BaseModel):
    patterns: List[Dict[str, Any]]
    total: int


class SuspiciousAddress(BaseModel):
    address: str
    riskScore: float
    transactionCount: int
    totalVolume: float
    patterns: List[str] = []
    firstSeen: Optional[datetime] = None
    lastSeen: Optional[datetime] = None


class SuspiciousAddressResponse(BaseModel):
    addresses: List[SuspiciousAddress]
    pagination: Dict[str, int]
