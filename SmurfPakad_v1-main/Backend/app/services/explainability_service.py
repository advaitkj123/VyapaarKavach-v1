"""
Explainability Service - Model explanation generation
Provides API-facing explainability for the Smurf Hunter model.
"""
import sys
import torch
import numpy as np
from typing import Dict, List, Optional
from pathlib import Path

# Add AI/ML to path
ML_PATH = Path(__file__).parent.parent.parent.parent / "AI" / "ML"
sys.path.insert(0, str(ML_PATH))


class ExplainabilityService:
    """
    Service for generating model explanations.
    Wraps the AI/ML explainability engine for backend use.
    """
    
    def __init__(self):
        self._engine = None
    
    async def explain_node(
        self,
        model: torch.nn.Module,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        node_idx: int,
        device: torch.device = None,
    ) -> Optional[Dict]:
        """
        Generate explanation for a single node.
        
        Args:
            model: Loaded GNN model
            features: Node feature matrix
            edge_index: Edge index (2 x E)
            tx_ids: Transaction/wallet IDs
            node_idx: Index of node to explain
            device: Computation device
            
        Returns:
            Explanation dict or None
        """
        try:
            from explainability import ExplainabilityEngine
            
            x = torch.tensor(features, dtype=torch.float)
            ei = torch.tensor(edge_index, dtype=torch.long)
            
            engine = ExplainabilityEngine(model, x, ei, tx_ids, device)
            explanation = engine.explain_node(node_idx)
            
            return explanation
        except Exception as e:
            print(f"Explainability error: {e}")
            return None
    
    async def explain_wallet(
        self,
        model: torch.nn.Module,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        wallet_id: str,
        device: torch.device = None,
    ) -> Optional[Dict]:
        """
        Generate explanation for a specific wallet/transaction by ID.
        """
        try:
            # Find index
            str_ids = [str(tid) for tid in tx_ids]
            if str(wallet_id) not in str_ids:
                return None
            
            node_idx = str_ids.index(str(wallet_id))
            return await self.explain_node(model, features, edge_index, tx_ids, node_idx, device)
        except Exception as e:
            print(f"Explainability error for wallet {wallet_id}: {e}")
            return None
    
    async def explain_top_suspicious(
        self,
        model: torch.nn.Module,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        scores: np.ndarray,
        top_k: int = 10,
        device: torch.device = None,
    ) -> List[Dict]:
        """
        Generate explanations for the top-K most suspicious nodes.
        """
        try:
            from explainability import ExplainabilityEngine
            
            x = torch.tensor(features, dtype=torch.float)
            ei = torch.tensor(edge_index, dtype=torch.long)
            
            engine = ExplainabilityEngine(model, x, ei, tx_ids, device)
            
            top_indices = np.argsort(scores)[::-1][:top_k]
            explanations = []
            
            for idx in top_indices:
                try:
                    exp = engine.explain_node(int(idx), top_k_features=5)
                    explanations.append(exp)
                except Exception as e:
                    print(f"Warning: Could not explain node {idx}: {e}")
            
            return explanations
        except Exception as e:
            print(f"Batch explainability error: {e}")
            return []
    
    def format_for_api(self, explanation: Dict) -> Dict:
        """
        Format explanation for API response.
        Strips internal fields and formats for frontend consumption.
        """
        if not explanation:
            return {}
        
        return {
            'nodeId': explanation.get('node_id', ''),
            'riskScore': explanation.get('risk_score', 0),
            'predictedLabel': explanation.get('predicted_label', 'unknown'),
            'confidence': explanation.get('confidence', 0),
            'narrative': explanation.get('narrative', ''),
            'structuralPatterns': explanation.get('structural_patterns', []),
            'featureImportance': [
                {
                    'featureName': f['feature_name'],
                    'importance': f['importance'],
                    'value': f['value'],
                }
                for f in explanation.get('feature_importance', [])
            ],
            'attentionExplanation': {
                'numIncoming': explanation.get('attention_explanation', {}).get('num_incoming', 0),
                'numOutgoing': explanation.get('attention_explanation', {}).get('num_outgoing', 0),
                'topAttendedNeighbors': [
                    {
                        'neighborId': n['neighbor_id'],
                        'attentionWeight': n['attention_weight'],
                        'direction': n['direction'],
                    }
                    for n in explanation.get('attention_explanation', {}).get('top_attended_neighbors', [])
                ],
            } if 'attention_explanation' in explanation else None,
            'counterfactualHints': explanation.get('counterfactual_hints', []),
        }


# Global service instance
explainability_service = ExplainabilityService()
