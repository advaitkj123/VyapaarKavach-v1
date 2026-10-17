"""
Safeguard Router - Real-time payment security endpoints
Used by the Chrome Extension SafeGuard feature.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from app.services.safeguard_service import safeguard_service
from app.core.websocket import ws_manager

router = APIRouter(prefix="/safeguard", tags=["safeguard"])


# ============================================================================
# Request / Response Models
# ============================================================================

class TransactionCheckRequest(BaseModel):
    recipient: str = Field(..., description="Recipient UPI ID, wallet address, or account")
    amount: float = Field(..., ge=0, description="Transaction amount")
    platform: str = Field(default="unknown", description="Payment platform (paytm/gpay/phonepe)")
    senderId: Optional[str] = Field(default=None, description="Sender identifier")
    senderHistory: Optional[List[dict]] = Field(default=None, description="Recent sender history")
    currency: str = Field(default="INR", description="Currency code (INR/USD/EUR)")
    timestamp: Optional[str] = Field(default=None, description="Transaction timestamp")


class TransactionCheckResponse(BaseModel):
    riskScore: float
    riskLevel: str
    reasons: List[str]
    message: str
    checkedAt: str


class ReportRequest(BaseModel):
    recipient: str
    amount: float = 0
    platform: str = "unknown"
    riskScore: float = 0
    reasons: List[str] = []
    action: str = "cancelled"


class ReportResponse(BaseModel):
    success: bool
    message: str
    recipientFlagCount: int = 0


class StatsResponse(BaseModel):
    totalChecks: int
    totalFlagged: int
    flaggedRecipients: int
    blacklistedRecipients: int
    flagRate: float


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/check", response_model=TransactionCheckResponse)
async def check_transaction(request: TransactionCheckRequest):
    """
    Check a transaction for fraud risk in real-time.
    Called by the Chrome Extension before a payment is processed.
    
    Returns risk score (0-1), risk level, and specific reasons.
    If risk is high (>=0.5), broadcasts a live alert to the dashboard via WebSocket.
    """
    result = await safeguard_service.check_transaction(
        recipient=request.recipient,
        amount=request.amount,
        platform=request.platform,
        sender_id=request.senderId,
        sender_history=request.senderHistory,
        currency=request.currency,
    )
    
    # Broadcast to dashboard if high risk — this powers the Live Threat Map
    if result.get("riskScore", 0) >= 0.5:
        await ws_manager.broadcast_safeguard_alert({
            "recipient": request.recipient,
            "amount": request.amount,
            "platform": request.platform,
            "senderId": request.senderId,
            "currency": request.currency,
            "riskScore": result["riskScore"],
            "riskLevel": result["riskLevel"],
            "reasons": result["reasons"],
            "timestamp": datetime.now().isoformat(),
        })
    
    return result


@router.post("/report", response_model=ReportResponse)
async def report_suspicious(request: ReportRequest):
    """
    Report a suspicious transaction.
    Called when user clicks 'Cancel & Report' on the warning overlay.
    """
    result = await safeguard_service.report_transaction(
        recipient=request.recipient,
        amount=request.amount,
        platform=request.platform,
        risk_score=request.riskScore,
        reasons=request.reasons,
        reporter_action=request.action,
    )
    return result


@router.get("/history")
async def get_check_history(sender_id: str, limit: int = 50):
    """Get transaction check history for a sender."""
    history = await safeguard_service.get_check_history(sender_id, limit)
    return {"history": history}


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get global threat statistics."""
    return await safeguard_service.get_stats()


@router.post("/bulk-check")
async def bulk_check(transactions: List[TransactionCheckRequest]):
    """
    Check multiple transactions at once.
    Useful for batch analysis or retroactive scanning.
    """
    if len(transactions) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 transactions per batch")
    
    results = []
    for tx in transactions:
        result = await safeguard_service.check_transaction(
            recipient=tx.recipient,
            amount=tx.amount,
            platform=tx.platform,
            sender_id=tx.senderId,
            sender_history=tx.senderHistory,
            currency=tx.currency,
        )
        results.append(result)
    
    return {"results": results, "count": len(results)}
