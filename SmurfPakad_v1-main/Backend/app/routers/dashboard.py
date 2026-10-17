"""
Dashboard Router
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.dashboard import (
    DashboardResponse,
    DashboardStats,
    DashboardChanges,
    RecentUploadsResponse,
    RecentUpload
)
from app.core.database_service import database_service
from app.dependencies import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardResponse)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get dashboard statistics"""
    user_id = current_user["sub"]
    
    stats_data = await database_service.get_dashboard_stats(user_id)
    
    # Calculate risk score improvement (mock for now - could be computed from historical data)
    risk_score = int(min(100, max(0, 100 - (stats_data.get("max_risk_score", 0) * 100))))
    
    return DashboardResponse(
        stats=DashboardStats(
            totalTransactions=stats_data.get("total_transactions", 0),
            suspiciousCount=stats_data.get("suspicious_count", 0),
            activeCases=stats_data.get("total_uploads", 0),
            riskScore=stats_data.get("max_risk_score", 0.0),
            patternsCount=stats_data.get("patterns_count", 0),
            addressesMonitored=stats_data.get("addresses_monitored", 0)
        ),
        changes=DashboardChanges(
            transactions="+12.5%",
            suspicious="+4.2%",
            cases="+8.1%",
            risk="+18.3%"
        )
    )


@router.get("/recent-uploads", response_model=RecentUploadsResponse)
@router.get("/recent")
async def get_recent_uploads(current_user: dict = Depends(get_current_user)):
    """Get recent uploads"""
    user_id = current_user["sub"]
    
    uploads, _ = await database_service.get_uploads_by_user(user_id, page=1, limit=5)
    
    return RecentUploadsResponse(
        uploads=[
            RecentUpload(
                id=u["id"],
                name=u.get("filename", "Unnamed"),
                date=u.get("uploaded_at", ""),
                status=u.get("status", "unknown"),
                records=u.get("row_count", 0)
            )
            for u in uploads
        ]
    )


@router.get("/overview")
async def get_dashboard_overview(current_user: dict = Depends(get_current_user)):
    """Get comprehensive dashboard overview"""
    user_id = current_user["sub"]
    stats_data = await database_service.get_dashboard_stats(user_id)
    uploads, _ = await database_service.get_uploads_by_user(user_id, page=1, limit=5)
    return {
        "stats": stats_data,
        "recent_uploads": uploads,
        "active_cases": stats_data.get("total_uploads", 0),
        "total_transactions": stats_data.get("total_transactions", 0),
        "suspicious_count": stats_data.get("suspicious_count", 0)
    }


@router.get("/risk-trend")
async def get_dashboard_risk_trend(
    period: str = "7d",
    current_user: dict = Depends(get_current_user)
):
    """Get risk score trends over time"""
    # Return trend points based on analysis history or synthetic timeline
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    points = [
        {"date": (now - timedelta(days=i)).strftime("%Y-%m-%d"), "risk_score": 0.25 + (i % 3) * 0.05}
        for i in reversed(range(7))
    ]
    return points

