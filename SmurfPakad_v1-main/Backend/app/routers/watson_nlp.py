"""
Watson NLP Router — Transaction Narration Analysis API
=======================================================
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

from app.services.watson_nlp_service import watson_nlp


router = APIRouter(prefix="/watson-nlp", tags=["Watson NLP"])


class NarrationRequest(BaseModel):
    narration: str = Field(..., description="Transaction remark or description")
    amount: float = Field(default=0.0, description="Transaction amount in INR")


class BatchNarrationRequest(BaseModel):
    transactions: List[Dict] = Field(..., description="List of transactions with narration/amount fields")


@router.post("/analyze")
async def analyze_narration(request: NarrationRequest):
    """
    Analyze a transaction narration for suspicious patterns.

    Uses IBM Watson NLU (if configured) or keyword rule engine fallback.
    Returns FATF indicators, suspicion score, and flag categories.
    """
    return watson_nlp.analyze_narration(
        narration=request.narration,
        amount=request.amount,
    )


@router.post("/batch")
async def analyze_batch(request: BatchNarrationRequest):
    """Analyze a batch of transactions for suspicious narration patterns."""
    return {"results": watson_nlp.analyze_batch(request.transactions)}


@router.get("/status")
async def get_watson_status():
    """Check IBM Watson NLU connection status."""
    return {
        "backend": "ibm_watson_nlu" if watson_nlp.is_watson_nlu else "keyword_rules",
        "isIBMWatson": watson_nlp.is_watson_nlu,
        "capabilities": [
            "Suspicious keyword detection",
            "FATF Red Flag mapping",
            "Round amount evasion detection",
            "Missing narration alerts",
        ] + (["IBM Watson semantic analysis", "Sentiment scoring"] if watson_nlp.is_watson_nlu else []),
    }
