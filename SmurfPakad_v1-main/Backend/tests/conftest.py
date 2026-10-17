"""
Pytest configuration and fixtures for SMURF HUNTER tests
"""
import os
import sys
import pytest
from typing import Generator, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

from main import app
from app.config import settings
from app.core.security import create_access_token, create_refresh_token


# ==================== Test User Data ====================

TEST_USER = {
    "id": "test-user-uuid-1234",
    "email": "test@example.com",
    "full_name": "Test User",
    "password": "TestPassword123!",
    "provider": "email",
    "is_active": True,
    "role": "user",
    "created_at": datetime.utcnow().isoformat(),
}

TEST_USER_2 = {
    "id": "test-user-uuid-5678",
    "email": "test2@example.com",
    "full_name": "Test User 2",
    "password": "TestPassword456!",
    "provider": "email",
    "is_active": True,
    "role": "user",
    "created_at": datetime.utcnow().isoformat(),
}

TEST_ADMIN = {
    "id": "admin-user-uuid-9999",
    "email": "admin@example.com",
    "full_name": "Admin User",
    "password": "AdminPassword123!",
    "provider": "email",
    "is_active": True,
    "role": "admin",
    "created_at": datetime.utcnow().isoformat(),
}


# ==================== Fixtures ====================

@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Synchronous test client"""
    with TestClient(app) as c:
        yield c


@pytest.fixture
async def async_client() -> Generator[AsyncClient, None, None]:
    """Async test client for async endpoints"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_user() -> Dict[str, Any]:
    """Test user data"""
    return TEST_USER.copy()


@pytest.fixture
def test_admin() -> Dict[str, Any]:
    """Test admin data"""
    return TEST_ADMIN.copy()


@pytest.fixture
def auth_token(test_user: Dict[str, Any]) -> str:
    """Generate valid access token for test user"""
    token_data = {
        "sub": test_user["id"],
        "email": test_user["email"],
        "role": test_user["role"],
    }
    return create_access_token(token_data)


@pytest.fixture
def admin_token(test_admin: Dict[str, Any]) -> str:
    """Generate valid access token for admin user"""
    token_data = {
        "sub": test_admin["id"],
        "email": test_admin["email"],
        "role": test_admin["role"],
    }
    return create_access_token(token_data)


@pytest.fixture
def refresh_token(test_user: Dict[str, Any]) -> str:
    """Generate valid refresh token for test user"""
    token_data = {
        "sub": test_user["id"],
        "email": test_user["email"],
    }
    return create_refresh_token(token_data)


@pytest.fixture
def expired_token(test_user: Dict[str, Any]) -> str:
    """Generate expired access token"""
    token_data = {
        "sub": test_user["id"],
        "email": test_user["email"],
    }
    return create_access_token(token_data, expires_delta=timedelta(seconds=-1))


@pytest.fixture
def auth_headers(auth_token: str) -> Dict[str, str]:
    """Authorization headers with valid token"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def admin_headers(admin_token: str) -> Dict[str, str]:
    """Authorization headers with admin token"""
    return {"Authorization": f"Bearer {admin_token}"}


# ==================== Mock Fixtures ====================

@pytest.fixture
def mock_supabase():
    """Mock Supabase client"""
    with patch("app.core.supabase.supabase_client") as mock:
        mock.get_user_by_email = AsyncMock(return_value=None)
        mock.get_user_by_id = AsyncMock(return_value=TEST_USER)
        mock.create_user = AsyncMock(return_value=TEST_USER)
        mock.update_user = AsyncMock(return_value=TEST_USER)
        mock.delete_user = AsyncMock(return_value=True)
        
        mock.create_upload = AsyncMock(return_value={"id": "upload-uuid-1234"})
        mock.get_upload = AsyncMock(return_value={"id": "upload-uuid-1234", "status": "completed"})
        mock.get_uploads_by_user = AsyncMock(return_value=[])
        mock.update_upload = AsyncMock(return_value=True)
        mock.delete_upload = AsyncMock(return_value=True)
        
        mock.create_analysis = AsyncMock(return_value={"id": "analysis-uuid-1234"})
        mock.get_analysis = AsyncMock(return_value={"id": "analysis-uuid-1234", "status": "completed"})
        mock.update_analysis = AsyncMock(return_value=True)
        
        mock.get_dashboard_stats = AsyncMock(return_value={
            "total_uploads": 10,
            "total_transactions": 1000,
            "suspicious_count": 50,
            "analyses_count": 5,
        })
        
        yield mock


@pytest.fixture
def mock_ml_service():
    """Mock ML service"""
    with patch("app.services.ml_service.ml_service") as mock:
        mock.model_loaded = True
        mock.predict = MagicMock(return_value={
            "predictions": [0, 1, 0, 1],
            "probabilities": [0.1, 0.9, 0.2, 0.85],
        })
        mock.load_model = MagicMock(return_value=True)
        yield mock


@pytest.fixture
def sample_csv_content() -> bytes:
    """Sample CSV file content for upload tests"""
    return b"""txId,feature_1,feature_2,feature_3
1,0.5,0.3,0.8
2,0.1,0.9,0.2
3,0.7,0.4,0.6
4,0.2,0.8,0.3
"""


@pytest.fixture
def sample_upload_data() -> Dict[str, Any]:
    """Sample upload record"""
    return {
        "id": "upload-uuid-1234",
        "user_id": TEST_USER["id"],
        "filename": "test_transactions.csv",
        "file_path": "/uploads/test_transactions.csv",
        "file_size": 1024,
        "file_type": "csv",
        "status": "completed",
        "row_count": 100,
        "created_at": datetime.utcnow().isoformat(),
    }


@pytest.fixture
def sample_analysis_data() -> Dict[str, Any]:
    """Sample analysis record"""
    return {
        "id": "analysis-uuid-1234",
        "upload_id": "upload-uuid-1234",
        "status": "completed",
        "total_transactions": 100,
        "suspicious_count": 15,
        "overall_risk_score": 0.65,
        "risk_distribution": {
            "critical": 2,
            "high": 5,
            "medium": 8,
            "low": 85,
        },
        "patterns": [
            {"type": "structuring", "severity": "high", "count": 3},
        ],
        "created_at": datetime.utcnow().isoformat(),
    }


@pytest.fixture
def sample_report_data() -> Dict[str, Any]:
    """Sample report record"""
    return {
        "id": "report-uuid-1234",
        "user_id": TEST_USER["id"],
        "analysis_id": "analysis-uuid-1234",
        "title": "AML Analysis Report",
        "format": "pdf",
        "status": "completed",
        "file_url": "/reports/report-uuid-1234.pdf",
        "created_at": datetime.utcnow().isoformat(),
    }
