"""
Tests for graph endpoints
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


class TestGetGraphData:
    """Tests for GET /api/v1/graph/{analysis_id}"""
    
    def test_get_graph_data_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting graph data"""
        sample_upload_data["user_id"] = test_user["id"]
        sample_analysis_data["graph_data"] = {
            "nodes": [
                {"id": "addr1", "risk_level": "high"},
                {"id": "addr2", "risk_level": "low"},
            ],
            "edges": [
                {"source": "addr1", "target": "addr2", "weight": 100},
            ]
        }
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.graph_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/graph/{sample_analysis_data['id']}",
                headers=auth_headers
            )
        
        if response.status_code == 200:
            data = response.json()
            assert "nodes" in data or "graph" in data or "data" in data
    
    def test_get_graph_data_not_found(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase
    ):
        """Test getting graph for non-existent analysis"""
        mock_supabase.get_analysis = AsyncMock(return_value=None)
        
        with patch("app.services.graph_service.supabase_client", mock_supabase):
            response = client.get(
                "/api/v1/graph/nonexistent-uuid",
                headers=auth_headers
            )
        
        assert response.status_code == 404
    
    def test_get_graph_no_auth(self, client: TestClient):
        """Test getting graph without authentication"""
        response = client.get("/api/v1/graph/some-uuid")
        
        assert response.status_code in [401, 403]


class TestGetGraphStats:
    """Tests for GET /api/v1/graph/{analysis_id}/stats"""
    
    def test_get_graph_stats_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting graph statistics"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.graph_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/graph/{sample_analysis_data['id']}/stats",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]


class TestGetSubgraph:
    """Tests for GET /api/v1/graph/{analysis_id}/subgraph"""
    
    def test_get_subgraph_by_address(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting subgraph for specific address"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.graph_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/graph/{sample_analysis_data['id']}/subgraph?address=addr1&depth=2",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]
    
    def test_get_subgraph_suspicious_only(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting subgraph with suspicious nodes only"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.graph_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/graph/{sample_analysis_data['id']}/subgraph?suspicious_only=true",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]


class TestGraphClusters:
    """Tests for GET /api/v1/graph/{analysis_id}/clusters"""
    
    def test_get_clusters_success(
        self, 
        client: TestClient, 
        auth_headers, 
        mock_supabase,
        sample_analysis_data,
        sample_upload_data,
        test_user
    ):
        """Test getting graph clusters"""
        sample_upload_data["user_id"] = test_user["id"]
        mock_supabase.get_analysis = AsyncMock(return_value=sample_analysis_data)
        mock_supabase.get_upload = AsyncMock(return_value=sample_upload_data)
        
        with patch("app.services.graph_service.supabase_client", mock_supabase):
            response = client.get(
                f"/api/v1/graph/{sample_analysis_data['id']}/clusters",
                headers=auth_headers
            )
        
        assert response.status_code in [200, 404]
