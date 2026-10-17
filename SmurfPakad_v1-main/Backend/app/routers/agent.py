"""
AML Agent Router — Autonomous Investigation API
=================================================
Provides endpoints for the AI-powered AML investigation agent.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, List

from app.services.aml_agent_service import aml_agent, AMLAgentService
from app.services.ibm_watsonx_service import ibm_watsonx_service
from app.services.fatf_service import FATFService
from app.services.audit_logger import audit_logger


router = APIRouter(prefix="/agent", tags=["AML Agent"])


# Initialize agent with dependencies
_fatf = FATFService()
aml_agent._ibm = ibm_watsonx_service
aml_agent._fatf = _fatf


class InvestigateRequest(BaseModel):
    wallet_id: str = Field(..., description="Wallet address or UPI ID to investigate")
    context: Optional[Dict] = Field(
        default=None,
        description="Optional context: risk_score, transactions, platforms, etc."
    )


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message to the agent")
    wallet_id: Optional[str] = Field(default=None, description="Wallet context for investigation")
    context: Optional[Dict] = Field(default=None, description="Additional context")


@router.post("/investigate")
async def investigate_wallet(request: InvestigateRequest):
    """
    Run a full autonomous investigation on a wallet.
    
    The agent orchestrates 6 tools:
    1. GNN Risk Scorer → suspicion score
    2. Pattern Detector → pattern type + hops
    3. FATF Mapper → red flag indicators
    4. Transaction Context → neighbors + amounts
    5. Cross-Platform Scanner → multi-silo detection
    6. watsonx.ai Synthesis → cohesive report + action
    
    Returns a complete investigation report with evidence chain.
    """
    try:
        import time
        t0 = time.time()
        result = await aml_agent.investigate(
            wallet_id=request.wallet_id,
            context=request.context,
        )
        elapsed_ms = (time.time() - t0) * 1000

        # Log to IBM Db2 (or SQLite fallback) for audit trail
        audit_logger.log_investigation(
            investigation_id=result.get("investigationId", ""),
            wallet_id=request.wallet_id,
            risk_score=result.get("riskScore", 0.0),
            risk_level=result.get("riskLevel", "UNKNOWN"),
            recommendation=result.get("recommendation", ""),
            patterns_found=result.get("patternsFound", []),
            fatf_flags=result.get("fatfFlags", []),
            ibm_model_used="ibm/granite-3-3-8b-instruct",
            investigation_time_ms=round(elapsed_ms, 2),
        )

        result["auditBackend"] = audit_logger.backend
        result["isIBMDb2"] = audit_logger.is_ibm_db2
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")


@router.post("/chat")
async def agent_chat(request: ChatRequest):
    """
    Chat with the AML agent. 
    
    If a wallet_id is provided, the agent will investigate it.
    Otherwise, it responds to general AML questions using IBM watsonx.ai.
    """
    message = request.message.strip().lower()
    
    # If user provides a wallet ID or asks to investigate
    if request.wallet_id or any(kw in message for kw in ["investigate", "check", "analyze", "scan", "score"]):
        wallet_id = request.wallet_id
        
        # Try to extract wallet ID from message if not provided
        if not wallet_id:
            parts = request.message.split()
            # Look for something that looks like a wallet/UPI ID
            for part in parts:
                if "@" in part or len(part) > 10 or "0x" in part:
                    wallet_id = part.strip(".,;:!?\"'")
                    break
        
        if wallet_id:
            report = await aml_agent.investigate(
                wallet_id=wallet_id,
                context=request.context,
            )
            return {
                "type": "investigation",
                "message": f"Investigation complete for {wallet_id}. Risk: {report['summary']['riskLevel']}. Recommended: {report['summary']['recommendedAction']}.",
                "report": report,
            }
    
    # General chat — use IBM watsonx.ai or local response
    if ibm_watsonx_service.is_configured:
        try:
            prompt = f"""You are the SmurfPakad AML Investigation Assistant. 
You help compliance officers detect money laundering in blockchain and UPI payment networks.
You have access to GNN (Graph Neural Network) models, FATF Red Flag indicators, and cross-platform analysis.

User question: {request.message}

Provide a helpful, accurate, and concise response. If the user asks about a specific wallet, suggest they use the /investigate endpoint."""
            
            response = await ibm_watsonx_service._call_watsonx(prompt, max_tokens=500)
            return {
                "type": "chat",
                "message": response,
                "poweredBy": "IBM watsonx.ai Granite 3.3",
            }
        except Exception:
            pass
    
    # Local fallback
    return {
        "type": "chat",
        "message": (
            "I'm the SmurfPakad AML Agent. I can help you investigate suspicious wallets "
            "and detect money laundering patterns. Try:\n\n"
            "• \"Investigate wallet mule_wallet_x@paytm\"\n"
            "• \"Scan 0x7f3a... for smurfing patterns\"\n"
            "• \"What FATF indicators apply to Fan-Out patterns?\"\n\n"
            "Provide a wallet ID and I'll run a full autonomous investigation using "
            "GNN scoring, pattern detection, FATF mapping, and IBM watsonx.ai analysis."
        ),
        "poweredBy": "SmurfPakad Local Engine",
    }


@router.get("/history")
async def get_investigation_history():
    """Get recent investigation history."""
    return {
        "investigations": aml_agent.get_history(),
        "total": len(aml_agent.get_history()),
    }


@router.get("/capabilities")
async def get_agent_capabilities():
    """List the agent's available tools and capabilities."""
    return {
        "agent": "SmurfPakad AML Investigation Agent",
        "version": "1.0.0",
        "engine": "IBM watsonx.ai Granite 3.3",
        "ibmConfigured": ibm_watsonx_service.is_configured,
        "tools": [
            {
                "name": "GNN Risk Scorer",
                "description": "Scores wallets using GATv2 graph neural network",
                "model": "SmurfHunter GATv2 v2.0",
            },
            {
                "name": "Pattern Detector",
                "description": "Detects structural patterns (smurfing, layering, peeling chains)",
                "patterns": ["SMURFING", "LAYERING", "STRUCTURING", "PEELING_CHAIN"],
            },
            {
                "name": "FATF Red Flag Mapper",
                "description": "Maps patterns to FATF compliance indicators",
                "indicators": 10,
            },
            {
                "name": "Transaction Context",
                "description": "Gathers transaction history and neighbor information",
            },
            {
                "name": "Cross-Platform Scanner",
                "description": "Detects cross-platform laundering across Paytm, PhonePe, GPay",
                "platforms": ["Paytm", "PhonePe", "GPay"],
            },
            {
                "name": "watsonx.ai Synthesis",
                "description": "IBM Granite model synthesizes evidence into investigation report",
                "model": "ibm/granite-3-3-8b-instruct",
            },
        ],
    }
