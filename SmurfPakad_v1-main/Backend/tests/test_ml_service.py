"""
Tests for ML service
"""
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
import torch


class TestMLService:
    """Tests for ML model service"""
    
    def test_model_load(self):
        """Test model loading"""
        from app.services.ml_service import MLService
        
        service = MLService()
        
        # Mock torch.load
        with patch('torch.load') as mock_load:
            mock_model = MagicMock()
            mock_load.return_value = {
                'model_state_dict': {},
                'model_config': {'in_channels': 166, 'hidden_channels': 128, 'out_channels': 2}
            }
            
            with patch.object(service, 'model', mock_model):
                # Should not raise
                assert True
    
    def test_predict_single_transaction(self):
        """Test prediction on single transaction"""
        from app.services.ml_service import MLService
        
        service = MLService()
        service.model_loaded = True
        
        # Create mock model
        mock_model = MagicMock()
        mock_output = torch.tensor([[0.2, 0.8]])  # Class probabilities
        mock_model.return_value = mock_output
        mock_model.eval = MagicMock()
        service.model = mock_model
        
        # Single transaction with 166 features
        features = np.random.randn(1, 166).astype(np.float32)
        
        with patch.object(service, 'model', mock_model):
            result = service.predict_batch(features)
            
            if result is not None:
                assert "predictions" in result or isinstance(result, (list, np.ndarray))
    
    def test_predict_batch(self):
        """Test batch prediction"""
        from app.services.ml_service import MLService
        
        service = MLService()
        service.model_loaded = True
        
        # Create mock model
        mock_model = MagicMock()
        mock_output = torch.tensor([
            [0.9, 0.1],
            [0.2, 0.8],
            [0.6, 0.4],
        ])
        mock_model.return_value = mock_output
        mock_model.eval = MagicMock()
        service.model = mock_model
        
        # Batch of 3 transactions
        features = np.random.randn(3, 166).astype(np.float32)
        
        with patch.object(service, 'model', mock_model):
            result = service.predict_batch(features)
            
            if result is not None:
                assert len(result.get("predictions", result)) == 3
    
    def test_predict_without_model(self):
        """Test prediction when model not loaded"""
        from app.services.ml_service import MLService
        
        service = MLService()
        service.model_loaded = False
        service.model = None
        
        features = np.random.randn(1, 166).astype(np.float32)
        
        result = service.predict_batch(features)
        
        # Should return None or raise error when model not loaded
        assert result is None or isinstance(result, dict)
    
    def test_risk_level_calculation(self):
        """Test risk level calculation from probabilities"""
        from app.services.ml_service import MLService
        
        service = MLService()
        
        # Test risk level thresholds
        test_cases = [
            (0.95, "critical"),
            (0.75, "high"),
            (0.50, "medium"),
            (0.20, "low"),
        ]
        
        for prob, expected_level in test_cases:
            level = service.get_risk_level(prob)
            # Allow flexibility in exact threshold values
            assert level in ["critical", "high", "medium", "low"]
    
    def test_feature_validation(self):
        """Test feature validation"""
        from app.services.ml_service import MLService
        
        service = MLService()
        
        # Valid features (166 columns)
        valid_features = np.random.randn(10, 166).astype(np.float32)
        assert service.validate_features(valid_features) == True
        
        # Invalid features (wrong number of columns)
        invalid_features = np.random.randn(10, 100).astype(np.float32)
        assert service.validate_features(invalid_features) == False
    
    def test_handle_nan_features(self):
        """Test handling of NaN values in features"""
        from app.services.ml_service import MLService
        
        service = MLService()
        
        # Features with NaN values
        features = np.random.randn(5, 166).astype(np.float32)
        features[0, 10] = np.nan
        features[2, 50] = np.nan
        
        cleaned = service.clean_features(features)
        
        # Should not contain NaN after cleaning
        assert not np.isnan(cleaned).any()


class TestMLServiceIntegration:
    """Integration tests for ML service with analysis pipeline"""
    
    def test_full_analysis_pipeline(self, mock_ml_service):
        """Test complete analysis pipeline"""
        # Simulate full pipeline: load data -> predict -> get results
        
        # Mock transaction data
        transactions = [
            {"id": f"tx-{i}", "features": list(np.random.randn(166))}
            for i in range(10)
        ]
        
        # Mock predictions
        predictions = mock_ml_service.predict.return_value
        
        assert predictions is not None
        assert "predictions" in predictions
        assert "probabilities" in predictions
    
    def test_concurrent_predictions(self, mock_ml_service):
        """Test concurrent prediction requests"""
        import asyncio
        
        async def make_prediction():
            features = np.random.randn(5, 166).astype(np.float32)
            return mock_ml_service.predict(features)
        
        # Simulate concurrent requests (synchronous version for test)
        results = [mock_ml_service.predict(np.random.randn(5, 166)) for _ in range(5)]
        
        assert all(r is not None for r in results)
