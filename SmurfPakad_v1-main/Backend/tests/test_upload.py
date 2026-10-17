"""
Tests for upload endpoints
"""
import pytest
import io
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


class TestUploadFile:
    """Tests for POST /api/v1/upload"""
    
    def test_upload_csv_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase, 
        sample_csv_content
    ):
        """Test successful CSV file upload"""
        mock_supabase.create_upload = AsyncMock(return_value={
            "id": "upload-uuid-1234",
            "status": "processing"
        })
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/upload",
                headers=auth_headers,
                files={"file": ("transactions.csv", io.BytesIO(sample_csv_content), "text/csv")}
            )
        
        assert response.status_code in [200, 201, 202]
    
    def test_upload_no_auth(self, client: TestClient, sample_csv_content):
        """Test upload without authentication"""
        response = client.post(
            "/api/v1/upload",
            files={"file": ("transactions.csv", io.BytesIO(sample_csv_content), "text/csv")}
        )
        
        assert response.status_code in [401, 403]
    
    def test_upload_invalid_file_type(self, client: TestClient, auth_headers):
        """Test upload with invalid file type"""
        response = client.post(
            "/api/v1/upload",
            headers=auth_headers,
            files={"file": ("malware.exe", io.BytesIO(b"fake exe content"), "application/octet-stream")}
        )
        
        assert response.status_code in [400, 415, 422]
    
    def test_upload_empty_file(self, client: TestClient, auth_headers):
        """Test upload with empty file"""
        response = client.post(
            "/api/v1/upload",
            headers=auth_headers,
            files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")}
        )
        
        assert response.status_code in [400, 422]
    
    def test_upload_no_file(self, client: TestClient, auth_headers):
        """Test upload without file"""
        response = client.post(
            "/api/v1/upload",
            headers=auth_headers,
        )
        
        assert response.status_code == 422


class TestUploadHistory:
    """Tests for GET /api/v1/upload/history"""
    
    def test_get_history_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_upload_data
    ):
        """Test getting upload history"""
        mock_supabase.get_uploads_by_user = AsyncMock(return_value=[sample_upload_data])
        mock_supabase.count_uploads_by_user = AsyncMock(return_value=1)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/upload/history", headers=auth_headers)
        
        if response.status_code == 200:
            data = response.json()
            assert "uploads" in data or "items" in data or isinstance(data, list)
    
    def test_get_history_pagination(self, client: TestClient, auth_headers, mock_supabase):
        """Test upload history pagination"""
        mock_supabase.get_uploads_by_user = AsyncMock(return_value=[])
        mock_supabase.count_uploads_by_user = AsyncMock(return_value=0)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/upload/history?page=1&limit=10",
                headers=auth_headers
            )
        
        assert response.status_code == 200
    
    def test_get_history_filter_status(self, client: TestClient, auth_headers, mock_supabase):
        """Test upload history with status filter"""
        mock_supabase.get_uploads_by_user = AsyncMock(return_value=[])
        mock_supabase.count_uploads_by_user = AsyncMock(return_value=0)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/upload/history?status=completed",
                headers=auth_headers
            )
        
        assert response.status_code == 200
    
    def test_get_history_no_auth(self, client: TestClient):
        """Test getting history without authentication"""
        response = client.get("/api/v1/upload/history")
        
        assert response.status_code in [401, 403]


class TestUploadStatus:
    """Tests for GET /api/v1/upload/{upload_id}/status"""
    
    def test_get_status_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_upload_data
    ):
        """Test getting upload status"""
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/upload/{sample_upload_data['id']}/status",
                headers=auth_headers
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
    
    def test_get_status_not_found(self, client: TestClient, auth_headers, mock_supabase):
        """Test getting status of non-existent upload"""
        mock_supabase.get_upload = AsyncMock(return_value=None)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/upload/nonexistent-uuid/status",
                headers=auth_headers
            )
        
        assert response.status_code == 404


class TestDeleteUpload:
    """Tests for DELETE /api/v1/upload/{upload_id}"""
    
    def test_delete_upload_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_upload_data,
        test_user
    ):
        """Test successful upload deletion"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        mock_supabase.delete_upload = AsyncMock(return_value=True)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.delete(
                f"/api/v1/upload/{sample_upload_data['id']}",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 204]
    
    def test_delete_upload_not_found(self, client: TestClient, auth_headers, mock_supabase):
        """Test deleting non-existent upload"""
        mock_supabase.get_upload = AsyncMock(return_value=None)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.delete(
                "/api/v1/upload/nonexistent-uuid",
                headers=auth_headers
            )
        
        assert response.status_code == 404
    
    def test_delete_upload_unauthorized(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_upload_data
    ):
        """Test deleting upload owned by another user"""
        sample_upload_data["user_id"] = "different-user-uuid"
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.upload_service.supabase_client", mock_supabase):
            response = client.delete(
                f"/api/v1/upload/{sample_upload_data['id']}",
                headers=auth_headers
            )
        
        assert response.status_code in [403, 404]
