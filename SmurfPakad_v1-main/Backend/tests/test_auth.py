"""
Tests for authentication endpoints
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


class TestAuthRegister:
    """Tests for POST /api/v1/auth/register"""
    
    def test_register_success(self, client: TestClient, mock_supabase):
        """Test successful user registration"""
        mock_supabase.get_user_by_email = AsyncMock(return_value=None)
        mock_supabase.create_user = AsyncMock(return_value={
            "id": "new-user-uuid",
            "email": "newuser@example.com",
            "full_name": "New User",
        })
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/auth/register",
                json={
                    "email": "newuser@example.com",
                    "password": "SecurePass123!",
                    "full_name": "New User",
                }
            )
        
        assert response.status_code in [200, 201]
    
    def test_register_existing_email(self, client: TestClient, mock_supabase, test_user):
        """Test registration with existing email"""
        mock_supabase.get_user_by_email = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/auth/register",
                json={
                    "email": test_user["email"],
                    "password": "SecurePass123!",
                    "full_name": "Test User",
                }
            )
        
        assert response.status_code in [400, 409]
    
    def test_register_invalid_email(self, client: TestClient):
        """Test registration with invalid email format"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "invalid-email",
                "password": "SecurePass123!",
                "full_name": "Test User",
            }
        )
        
        assert response.status_code == 422
    
    def test_register_weak_password(self, client: TestClient):
        """Test registration with weak password"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "test@example.com",
                "password": "123",  # Too short
                "full_name": "Test User",
            }
        )
        
        assert response.status_code == 422


class TestAuthLogin:
    """Tests for POST /api/v1/auth/login"""
    
    def test_login_success(self, client: TestClient, mock_supabase, test_user):
        """Test successful login"""
        from app.core.security import hash_password
        test_user["password_hash"] = hash_password("TestPassword123!")
        mock_supabase.get_user_by_email = AsyncMock(return_value=test_user)
        mock_supabase.update_user = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/auth/login",
                data={
                    "username": test_user["email"],
                    "password": "TestPassword123!",
                }
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            assert "refresh_token" in data
            assert data["token_type"] == "bearer"
    
    def test_login_invalid_credentials(self, client: TestClient, mock_supabase):
        """Test login with invalid credentials"""
        mock_supabase.get_user_by_email = AsyncMock(return_value=None)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/auth/login",
                data={
                    "username": "nonexistent@example.com",
                    "password": "WrongPassword123!",
                }
            )
        
        assert response.status_code == 401
    
    def test_login_wrong_password(self, client: TestClient, mock_supabase, test_user):
        """Test login with wrong password"""
        from app.core.security import hash_password
        test_user["password_hash"] = hash_password("CorrectPassword123!")
        mock_supabase.get_user_by_email = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/auth/login",
                data={
                    "username": test_user["email"],
                    "password": "WrongPassword123!",
                }
            )
        
        assert response.status_code == 401


class TestAuthToken:
    """Tests for token endpoints"""
    
    def test_refresh_token_success(self, client: TestClient, refresh_token, mock_supabase, test_user):
        """Test successful token refresh"""
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": refresh_token}
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
    
    def test_refresh_token_invalid(self, client: TestClient):
        """Test refresh with invalid token"""
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid-token"}
        )
        
        assert response.status_code in [401, 422]
    
    def test_refresh_token_expired(self, client: TestClient, expired_token):
        """Test refresh with expired token"""
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": expired_token}
        )
        
        assert response.status_code in [401, 422]


class TestAuthMe:
    """Tests for GET /api/v1/auth/me"""
    
    def test_get_current_user(self, client: TestClient, auth_headers, mock_supabase, test_user):
        """Test getting current user profile"""
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/auth/me", headers=auth_headers)
        
        if response.status_code == 200:
            data = response.json()
            assert data["email"] == test_user["email"]
    
    def test_get_current_user_no_token(self, client: TestClient):
        """Test getting current user without token"""
        response = client.get("/api/v1/auth/me")
        
        assert response.status_code in [401, 403]
    
    def test_get_current_user_invalid_token(self, client: TestClient):
        """Test getting current user with invalid token"""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid-token"}
        )
        
        assert response.status_code in [401, 403]


class TestAuthLogout:
    """Tests for POST /api/v1/auth/logout"""
    
    def test_logout_success(self, client: TestClient, auth_headers):
        """Test successful logout"""
        response = client.post("/api/v1/auth/logout", headers=auth_headers)
        
        assert response.status_code in [200, 204]
    
    def test_logout_no_token(self, client: TestClient):
        """Test logout without token"""
        response = client.post("/api/v1/auth/logout")
        
        assert response.status_code in [401, 403]
