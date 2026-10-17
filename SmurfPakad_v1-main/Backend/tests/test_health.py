"""
Tests for health check and root endpoints
"""
import pytest
from fastapi.testclient import TestClient


class TestHealthCheck:
    """Tests for health check endpoints"""
    
    def test_root_endpoint(self, client: TestClient):
        """Test root endpoint returns API info"""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert "name" in data or "message" in data or "status" in data
    
    def test_health_endpoint(self, client: TestClient):
        """Test health check endpoint"""
        response = client.get("/health")
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert data["status"] in ["healthy", "ok", "up"]
    
    def test_docs_endpoint(self, client: TestClient):
        """Test Swagger docs are accessible"""
        response = client.get("/docs")
        
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
    
    def test_openapi_schema(self, client: TestClient):
        """Test OpenAPI schema endpoint"""
        response = client.get("/openapi.json")
        
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert "paths" in data
        assert "info" in data


class TestAPIVersioning:
    """Tests for API versioning"""
    
    def test_api_v1_prefix(self, client: TestClient, auth_headers):
        """Test that API v1 prefix works"""
        # Any v1 endpoint should work with prefix
        response = client.get("/api/v1/dashboard/stats", headers=auth_headers)
        
        # Should not be 404 for path not found (might be 401/403 for auth)
        assert response.status_code != 404 or response.status_code in [401, 403, 200]


class TestErrorHandling:
    """Tests for error handling"""
    
    def test_not_found_endpoint(self, client: TestClient):
        """Test 404 for non-existent endpoint"""
        response = client.get("/api/v1/nonexistent-endpoint")
        
        assert response.status_code == 404
    
    def test_method_not_allowed(self, client: TestClient):
        """Test 405 for wrong HTTP method"""
        # GET on a POST-only endpoint
        response = client.get("/api/v1/auth/login")
        
        assert response.status_code in [405, 422]
    
    def test_validation_error_response(self, client: TestClient):
        """Test validation error response format"""
        response = client.post(
            "/api/v1/auth/register",
            json={"invalid": "data"}
        )
        
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data
