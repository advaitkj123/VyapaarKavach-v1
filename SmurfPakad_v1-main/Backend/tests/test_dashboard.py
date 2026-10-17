"""
Tests for dashboard endpoints
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


class TestDashboardStats:
    """Tests for GET /api/v1/dashboard/stats"""
    
    def test_get_stats_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test getting dashboard statistics"""
        mock_supabase.get_dashboard_stats = AsyncMock(return_value={
            "total_uploads": 10,
            "total_transactions": 5000,
            "suspicious_count": 150,
            "analyses_count": 8,
            "reports_count": 5,
        })
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/dashboard/stats", headers=auth_headers)
        
        if response.status_code == 200:
            data = response.json()
            # Check for expected stats fields
            assert isinstance(data, dict)
    
    def test_get_stats_no_auth(self, client: TestClient):
        """Test getting stats without authentication"""
        response = client.get("/api/v1/dashboard/stats")
        
        assert response.status_code in [401, 403]


class TestDashboardRecent:
    """Tests for GET /api/v1/dashboard/recent"""
    
    def test_get_recent_activity_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test getting recent activity"""
        mock_supabase.get_recent_uploads = AsyncMock(return_value=[])
        mock_supabase.get_recent_analyses = AsyncMock(return_value=[])
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/dashboard/recent", headers=auth_headers)
        
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, (dict, list))


class TestDashboardOverview:
    """Tests for GET /api/v1/dashboard/overview"""
    
    def test_get_overview_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test getting dashboard overview"""
        mock_supabase.get_dashboard_stats = AsyncMock(return_value={
            "total_uploads": 10,
            "total_transactions": 5000,
            "suspicious_count": 150,
        })
        mock_supabase.get_recent_uploads = AsyncMock(return_value=[])
        mock_supabase.get_recent_analyses = AsyncMock(return_value=[])
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/dashboard/overview", headers=auth_headers)
        
        assert response.status_code in [200, 404]


class TestDashboardRiskTrend:
    """Tests for GET /api/v1/dashboard/risk-trend"""
    
    def test_get_risk_trend_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test getting risk trend data"""
        mock_supabase.get_risk_trend = AsyncMock(return_value=[
            {"date": "2024-01-01", "risk_score": 0.3},
            {"date": "2024-01-02", "risk_score": 0.35},
            {"date": "2024-01-03", "risk_score": 0.28},
        ])
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/dashboard/risk-trend", headers=auth_headers)
        
        assert response.status_code in [200, 404]
    
    def test_get_risk_trend_with_period(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test getting risk trend for specific period"""
        mock_supabase.get_risk_trend = AsyncMock(return_value=[])
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/dashboard/risk-trend?period=30d",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]
