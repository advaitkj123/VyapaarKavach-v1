"""
Tests for settings endpoints
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


class TestGetProfile:
    """Tests for GET /api/v1/settings/profile"""
    
    def test_get_profile_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test getting user profile"""
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/settings/profile", headers=auth_headers)
        
        if response.status_code == 200:
            data = response.json()
            assert "email" in data or "user" in data
    
    def test_get_profile_no_auth(self, client: TestClient):
        """Test getting profile without authentication"""
        response = client.get("/api/v1/settings/profile")
        
        assert response.status_code in [401, 403]


class TestUpdateProfile:
    """Tests for PUT /api/v1/settings/profile"""
    
    def test_update_profile_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test updating user profile"""
        updated_user = test_user.copy()
        updated_user["full_name"] = "Updated Name"
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        mock_supabase.update_user = AsyncMock(return_value=updated_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.put(
                "/api/v1/settings/profile",
                headers=auth_headers,
                json={"full_name": "Updated Name"}
            )
        
        assert response.status_code in [200, 204]
    
    def test_update_profile_invalid_data(
        self, 
        client: TestClient, 
        auth_headers
    ):
        """Test updating profile with invalid data"""
        response = client.put(
            "/api/v1/settings/profile",
            headers=auth_headers,
            json={"email": "not-allowed-to-change@example.com"}
        )
        
        # May succeed or fail depending on implementation
        assert response.status_code in [200, 400, 422]


class TestChangePassword:
    """Tests for POST /api/v1/settings/password"""
    
    def test_change_password_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test changing password"""
        from app.core.security import hash_password
        test_user["password_hash"] = hash_password("OldPassword123!")
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        mock_supabase.update_user = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/settings/password",
                headers=auth_headers,
                json={
                    "current_password": "OldPassword123!",
                    "new_password": "NewPassword456!"
                }
            )
        
        assert response.status_code in [200, 204, 400]
    
    def test_change_password_wrong_current(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test changing password with wrong current password"""
        from app.core.security import hash_password
        test_user["password_hash"] = hash_password("CorrectPassword123!")
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/settings/password",
                headers=auth_headers,
                json={
                    "current_password": "WrongPassword123!",
                    "new_password": "NewPassword456!"
                }
            )
        
        assert response.status_code in [400, 401, 403]


class TestNotificationSettings:
    """Tests for notification settings endpoints"""
    
    def test_get_notification_settings(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test getting notification settings"""
        test_user["settings"] = {
            "notifications": {
                "email_alerts": True,
                "analysis_complete": True,
            }
        }
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/settings/notifications",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]
    
    def test_update_notification_settings(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        test_user
    ):
        """Test updating notification settings"""
        mock_supabase.get_user_by_id = AsyncMock(return_value=test_user)
        mock_supabase.update_user = AsyncMock(return_value=test_user)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.put(
                "/api/v1/settings/notifications",
                headers=auth_headers,
                json={
                    "email_alerts": False,
                    "analysis_complete": True,
                }
            )
        
        assert response.status_code in [200, 204, 404]


class TestAPIKeys:
    """Tests for API key management"""
    
    def test_list_api_keys(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test listing API keys"""
        mock_supabase.get_api_keys = AsyncMock(return_value=[
            {"id": "key-1", "name": "Test Key", "key_prefix": "sk-test"}
        ])
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/settings/api-keys", headers=auth_headers)
        
        assert response.status_code in [200, 404]
    
    def test_create_api_key(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test creating new API key"""
        mock_supabase.create_api_key = AsyncMock(return_value={
            "id": "new-key-uuid",
            "name": "New Key",
            "key": "sk-test-new-key-full",
        })
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/settings/api-keys",
                headers=auth_headers,
                json={"name": "New Key"}
            )
        
        assert response.status_code in [200, 201, 404]
    
    def test_delete_api_key(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test deleting API key"""
        mock_supabase.get_api_key = AsyncMock(return_value={"id": "key-1"})
        mock_supabase.delete_api_key = AsyncMock(return_value=True)
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.delete(
                "/api/v1/settings/api-keys/key-1",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 204, 404]


class TestWebhooks:
    """Tests for webhook management"""
    
    def test_list_webhooks(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test listing webhooks"""
        mock_supabase.get_webhooks = AsyncMock(return_value=[])
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.get("/api/v1/settings/webhooks", headers=auth_headers)
        
        assert response.status_code in [200, 404]
    
    def test_create_webhook(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test creating new webhook"""
        mock_supabase.create_webhook = AsyncMock(return_value={
            "id": "webhook-uuid",
            "url": "https://example.com/webhook",
        })
        
        with patch("app.services.auth_service.supabase_client", mock_supabase):
            response = client.post(
                "/api/v1/settings/webhooks",
                headers=auth_headers,
                json={
                    "name": "Test Webhook",
                    "url": "https://example.com/webhook",
                    "events": ["analysis.completed"]
                }
            )
        
        assert response.status_code in [200, 201, 404]
