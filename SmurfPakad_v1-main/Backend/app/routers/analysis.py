"""
Analysis Router
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from typing import Optional
import json
import asyncio

from app.schemas.analysis import (
    AnalysisResponse,
    AnalysisSummary,
    RiskDistribution,
    ModelMetrics,
    PatternResponse,
    SuspiciousAddressResponse,
    SuspiciousAddress
)
from app.services.analysis_service import analysis_service
from app.dependencies import get_current_user

router = APIRouter(prefix="/analysis", tags=["Analysis"])


# IMPORTANT: Specific routes MUST come before the /{upload_id} wildcard route
# Otherwise "/patterns" gets matched as upload_id="patterns"

@router.get("/patterns", response_model=PatternResponse)
async def get_patterns(
    upload_id: Optional[str] = Query(default=None),
    pattern_type: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user)
):
    """Get detected patterns for an upload"""
    try:
        user_id = current_user["sub"]
        
        patterns = await analysis_service.get_patterns(
            user_id=user_id,
            upload_id=upload_id,
            pattern_type=pattern_type
        )
        
        return PatternResponse(
            patterns=patterns,
            total=len(patterns)
        )
    except Exception as e:
        import traceback
        print(f"ERROR in get_patterns: {e}")
        traceback.print_exc()
        raise


@router.get("/suspicious-addresses/{upload_id}", response_model=SuspiciousAddressResponse)
async def get_suspicious_addresses(
    upload_id: str,
    risk_level: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get suspicious addresses for an upload"""
    try:
        user_id = current_user["sub"]
        
        addresses, pagination = await analysis_service.get_suspicious_addresses(
            user_id=user_id,
            upload_id=upload_id,
            risk_level=risk_level,
            page=page,
            limit=limit
        )
        
        return SuspiciousAddressResponse(
            addresses=[
                SuspiciousAddress(
                    address=a["address"],
                    riskScore=a.get("suspiciousScore", 0.0),
                    transactionCount=a.get("transactionCount", 0),
                    totalVolume=a.get("totalAmount", 0.0),
                    patterns=a.get("flags", []),
                    firstSeen=a.get("firstSeen"),
                    lastSeen=a.get("lastSeen")
                )
                for a in addresses
            ],
            pagination=pagination
        )
    except Exception as e:
        import traceback
        print(f"ERROR in get_suspicious_addresses: {e}")
        traceback.print_exc()
        raise


@router.post("/run/{upload_id}")
async def run_ml_analysis(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Trigger full ML analysis on an upload
    
    This endpoint runs the complete Smurf Hunter ML pipeline:
    1. Loads all transactions for the upload
    2. Runs GraphSAGE model to score each transaction
    3. Detects patterns (structuring, layering, smurfing)
    4. Identifies suspicious addresses
    5. Generates visualization subgraph
    6. Saves all results to database
    
    Returns:
    - **summary**: Overall statistics and risk distribution
    - **patterns**: Detected money laundering patterns
    - **suspicious_addresses**: Flagged addresses with risk levels
    - **subgraph**: Top suspicious nodes with k-hop neighborhoods
    """
    user_id = current_user["sub"]
    
    try:
        results = await analysis_service.run_ml_analysis(upload_id, user_id)
        return {
            "status": "completed",
            "uploadId": upload_id,
            **results
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )


@router.get("/subgraph/{upload_id}")
async def get_visualization_subgraph(
    upload_id: str,
    top_k: int = Query(default=20, ge=1, le=100),
    hop: int = Query(default=2, ge=1, le=4),
    current_user: dict = Depends(get_current_user)
):
    """
    Get suspicious subgraph for visualization
    
    Returns the top-K most suspicious nodes and their k-hop neighborhoods,
    optimized for graph visualization on the frontend.
    """
    user_id = current_user["sub"]
    
    try:
        subgraph = await analysis_service.get_subgraph_for_visualization(
            upload_id=upload_id,
            user_id=user_id,
            top_k=top_k,
            hop=hop
        )
        return subgraph
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/stream/{upload_id}")
async def stream_analysis_progress(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Server-Sent Events endpoint for real-time analysis progress.
    Returns a stream of analysis stages: parsing -> graph_building -> scoring -> pattern_detection -> subgraph_extraction -> complete
    """
    from fastapi.responses import StreamingResponse
    import asyncio
    
    user_id = current_user["sub"]
    
    async def event_generator():
        # This endpoint is primarily for clients that prefer SSE over WebSocket
        # The real-time updates are pushed via WebSocket by the upload_service
        # This just provides a fallback
        yield f"data: {json.dumps({'stage': 'connected', 'uploadId': upload_id})}\n\n"
        
        # In a real implementation, you'd subscribe to a message queue here
        # For now, we'll just send a heartbeat
        for i in range(60):  # 60 seconds timeout
            await asyncio.sleep(1)
            yield f"data: {json.dumps({'stage': 'heartbeat', 'progress': i})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# This MUST be last - it's a wildcard that matches any path like /analysis/{upload_id}
@router.get("/{upload_id}", response_model=AnalysisResponse)
async def get_analysis_results(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get analysis results for an upload"""
    user_id = current_user["sub"]
    
    analysis = await analysis_service.get_analysis_results(upload_id, user_id)
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    summary = analysis.get("summary", {})
    
    return AnalysisResponse(
        uploadId=upload_id,
        status="completed",
        summary=AnalysisSummary(
            totalTransactions=summary.get("totalTransactions", 0),
            suspiciousTransactions=summary.get("suspiciousTransactions", 0),
            riskScore=summary.get("riskScore", 0.0),
            patternsDetected=summary.get("patternsDetected", 0)
        ),
        riskDistribution=RiskDistribution(
            high=summary.get("high_risk", 0),
            medium=summary.get("medium_risk", 0),
            low=summary.get("low_risk", 0)
        ),
        modelMetrics=ModelMetrics(
            confidence=summary.get("confidence", 0.0),
            processingTime=summary.get("processing_time", 0.0)
        )
    )
