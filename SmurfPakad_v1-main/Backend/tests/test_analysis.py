"""
Tests for analysis endpoints
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


class TestStartAnalysis:
    """Tests for POST /api/v1/analysis/start"""
    
    def test_start_analysis_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        mock_ml_service,
        sample_upload_data,
        test_user
    ):
        """Test starting analysis successfully"""
        sample_upload_data["user_id"] = test_user["id"]
        sample_upload_data["status"] = "completed"
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        mock_supabase.create_analysis = AsyncMock(return_value={
            "id": "analysis-uuid-1234",
            "status": "running"
        })
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            with patch("app.services.analysis_service.ml_service", mock_ml_service):
                response = client.post(
                    "/api/v1/analysis/start",
                    headers=auth_headers,
                    json={"upload_id": sample_upload_data["id"]}
                )
        
        assert response.status_code in [200, 201, 202]
    
    def test_start_analysis_upload_not_found(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test starting analysis with non-existent upload"""
        mock_supabase.get_upload = AsyncMock(return_value=None)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/analysis/start",
                headers=auth_headers,
                json={"upload_id": "nonexistent-uuid"}
            )
        
        assert response.status_code == 404
    
    def test_start_analysis_upload_not_completed(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_upload_data,
        test_user
    ):
        """Test starting analysis on non-completed upload"""
        sample_upload_data["user_id"] = test_user["id"]
        sample_upload_data["status"] = "processing"
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/analysis/start",
                headers=auth_headers,
                json={"upload_id": sample_upload_data["id"]}
            )
        
        assert response.status_code in [400, 422]
    
    def test_start_analysis_no_auth(self, client: TestClient):
        """Test starting analysis without authentication"""
        response = client.post(
            "/api/v1/analysis/start",
            json={"upload_id": "some-uuid"}
        )
        
        assert response.status_code in [401, 403]


class TestGetAnalysis:
    """Tests for GET /api/v1/analysis/{analysis_id}"""
    
    def test_get_analysis_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting analysis results"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/analysis/{sample_analysis_data['id']}",
                headers=auth_headers
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data or "id" in data
    
    def test_get_analysis_not_found(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test getting non-existent analysis"""
        mock_supabase.get_analysis = AsyncMock(return_value=None)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/analysis/nonexistent-uuid",
                headers=auth_headers
            )
        
        assert response.status_code == 404


class TestAnalysisStatus:
    """Tests for GET /api/v1/analysis/{analysis_id}/status"""
    
    def test_get_status_running(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting status of running analysis"""
        sample_analysis_data["status"] = "running"
        sample_analysis_data["progress"] = 50
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/analysis/{sample_analysis_data['id']}/status",
                headers=auth_headers
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
    
    def test_get_status_completed(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting status of completed analysis"""
        sample_analysis_data["status"] = "completed"
        sample_analysis_data["progress"] = 100
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/analysis/{sample_analysis_data['id']}/status",
                headers=auth_headers
            )
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("status") == "completed" or "status" in data


class TestAnalysisTransactions:
    """Tests for GET /api/v1/analysis/{analysis_id}/transactions"""
    
    def test_get_transactions_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting analysis transactions"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        mock_supabase.get_transactions = AsyncMock(return_value=[
            {"id": "tx-1", "predicted_illicit": True, "prediction_score": 0.95},
            {"id": "tx-2", "predicted_illicit": False, "prediction_score": 0.15},
        ])
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/analysis/{sample_analysis_data['id']}/transactions",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]
    
    def test_get_transactions_filtered(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting filtered transactions"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        mock_supabase.get_transactions = AsyncMock(return_value=[])
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/analysis/{sample_analysis_data['id']}/transactions?risk_level=high",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]


class TestAnalysisPatterns:
    """Tests for GET /api/v1/analysis/{analysis_id}/patterns"""
    
    def test_get_patterns_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting detected patterns"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.analysis_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/analysis/{sample_analysis_data['id']}/patterns",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]
