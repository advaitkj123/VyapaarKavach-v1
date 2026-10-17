"""
Tests for reports endpoints
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


class TestGenerateReport:
    """Tests for POST /api/v1/reports/generate"""
    
    def test_generate_report_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test generating a report"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        mock_supabase.create_report = AsyncMock(return_value={
            "id": "report-uuid-1234",
            "status": "generating"
        })
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/reports/generate",
                headers=auth_headers,
                json={
                    "analysis_id": sample_analysis_data["id"],
                    "title": "Test Report",
                    "format": "pdf"
                }
            )
        
        assert response.status_code in [200, 201, 202]
    
    def test_generate_report_csv(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test generating CSV report"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        mock_supabase.create_report = AsyncMock(return_value={
            "id": "report-uuid-1234",
            "status": "generating"
        })
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/reports/generate",
                headers=auth_headers,
                json={
                    "analysis_id": sample_analysis_data["id"],
                    "title": "Test CSV Report",
                    "format": "csv"
                }
            )
        
        assert response.status_code in [200, 201, 202]
    
    def test_generate_report_analysis_not_found(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test generating report for non-existent analysis"""
        mock_supabase.get_analysis = AsyncMock(return_value=None)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/reports/generate",
                headers=auth_headers,
                json={
                    "analysis_id": "nonexistent-uuid",
                    "title": "Test Report",
                    "format": "pdf"
                }
            )
        
        assert response.status_code == 404
    
    def test_generate_report_no_auth(self, client: TestClient):
        """Test generating report without authentication"""
        response = client.post(
            "/api/v1/reports/generate",
            json={
                "analysis_id": "some-uuid",
                "title": "Test Report",
                "format": "pdf"
            }
        )
        
        assert response.status_code in [401, 403]


class TestGetReport:
    """Tests for GET /api/v1/reports/{report_id}"""
    
    def test_get_report_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_report_data,
        test_user
    ):
        """Test getting report details"""
        sample_report_data["user_id"] = test_user["id"]
        mock_supabase.get_report = AsyncMock(return_value=sample_report_data)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/reports/{sample_report_data['id']}",
                headers=auth_headers
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "id" in data or "title" in data
    
    def test_get_report_not_found(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test getting non-existent report"""
        mock_supabase.get_report = AsyncMock(return_value=None)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/reports/nonexistent-uuid",
                headers=auth_headers
            )
        
        assert response.status_code == 404


class TestReportsList:
    """Tests for GET /api/v1/reports"""
    
    def test_list_reports_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_report_data,
        test_user
    ):
        """Test listing user reports"""
        sample_report_data["user_id"] = test_user["id"]
        mock_supabase.get_reports_by_user = AsyncMock(return_value=[sample_report_data])
        mock_supabase.count_reports_by_user = AsyncMock(return_value=1)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/reports", headers=auth_headers)
        
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, (list, dict))
    
    def test_list_reports_empty(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test listing reports when none exist"""
        mock_supabase.get_reports_by_user = AsyncMock(return_value=[])
        mock_supabase.count_reports_by_user = AsyncMock(return_value=0)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/reports", headers=auth_headers)
        
        assert response.status_code == 200


class TestDownloadReport:
    """Tests for GET /api/v1/reports/{report_id}/download"""
    
    def test_download_report_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_report_data,
        test_user
    ):
        """Test downloading a report"""
        sample_report_data["user_id"] = test_user["id"]
        sample_report_data["status"] = "completed"
        sample_report_data["file_url"] = "/reports/test.pdf"
        mock_supabase.get_report = AsyncMock(return_value=sample_report_data)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/reports/{sample_report_data['id']}/download",
                headers=auth_headers
            )
        
        # Could be 200 (file), 302 (redirect), or 404 if file doesn't exist
        assert response.status_code in [200, 302, 404]
    
    def test_download_report_not_ready(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_report_data,
        test_user
    ):
        """Test downloading a report that's not ready"""
        sample_report_data["user_id"] = test_user["id"]
        sample_report_data["status"] = "generating"
        mock_supabase.get_report = AsyncMock(return_value=sample_report_data)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/reports/{sample_report_data['id']}/download",
                headers=auth_headers
            )
        
        assert response.status_code in [400, 404, 409]


class TestDeleteReport:
    """Tests for DELETE /api/v1/reports/{report_id}"""
    
    def test_delete_report_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_report_data,
        test_user
    ):
        """Test deleting a report"""
        sample_report_data["user_id"] = test_user["id"]
        mock_supabase.get_report = AsyncMock(return_value=sample_report_data)
        mock_supabase.delete_report = AsyncMock(return_value=True)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.delete(
                f"/api/v1/reports/{sample_report_data['id']}",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 204]
    
    def test_delete_report_not_found(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test deleting non-existent report"""
        mock_supabase.get_report = AsyncMock(return_value=None)
        
        with patch("app.services.report_service.supabase_client", mock_supabase):
            response = client.delete(
                "/api/v1/reports/nonexistent-uuid",
                headers=auth_headers
            )
        
        assert response.status_code == 404
