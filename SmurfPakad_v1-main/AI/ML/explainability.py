# pyright: basic
# type: ignore
"""
Model Explainability for AML Detection
========================================
Provides interpretable explanations for WHY the model flagged a transaction.

Key Components:
  1. AttentionExplainer — Uses GATv2 attention weights to show which
     neighbor transactions influenced the prediction most.
  2. FeatureImportanceExplainer — Gradient-based feature attribution
     showing which input features drove the suspicion score.
  3. CounterfactualExplainer — "What would need to change for this
     TX to be considered safe?"
  4. NarrativeExplainer — Generates human-readable text explanations
     combining structural patterns + model signals.

Usage:
  from explainability import ExplainabilityEngine
  engine = ExplainabilityEngine(model, data, tx_ids)
  explanation = engine.explain_node(node_idx)
"""
import numpy as np
import torch
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple
from collections import defaultdict


# Feature names for the Elliptic dataset (grouped by category)
# Column 0 = timestep, columns 1-93 = local features, 94-165 = aggregate features
ELLIPTIC_FEATURE_GROUPS = {
    'timestep': [0],
    'local_features': list(range(1, 94)),
    'aggregate_neighbor_features': list(range(94, 166)),
}

# Feature names for custom wallet-based datasets
WALLET_FEATURE_NAMES = [
    'out_degree', 'in_degree', 'total_sent', 'total_received',
    'tx_count', 'avg_amount',
]

# Temporal feature names (from temporal_features.py)
TEMPORAL_FEATURE_NAMES = [
    'round_amount_ratio', 'threshold_proximity_ratio',
    'activity_span_hours', 'avg_time_between_txs', 'min_time_between_txs',
    'regularity_score', 'burst_score', 'hour_entropy',
    'net_flow', 'fan_out_ratio', 'fan_in_ratio',
    'std_sent', 'std_received',
]


class ExplainabilityEngine:
    """
    Generates explanations for GNN model predictions.

    Supports both GATv2 (attention-based) and GraphSAGE (gradient-based)
    model architectures.
    """

    def __init__(
        self,
        model: torch.nn.Module,
        data_x: torch.Tensor,
        edge_index: torch.Tensor,
        tx_ids: List,
        device: torch.device = None,
    ):
        self.model = model
        self.data_x = data_x
        self.edge_index = edge_index
        self.tx_ids = tx_ids
        self.device = device or torch.device('cpu')
        self._has_attention = hasattr(model, 'get_attention_weights')

    def explain_node(self, node_idx: int, top_k_features: int = 10) -> Dict:
        """
        Generate a complete explanation for a single node/transaction.

        Returns:
            Dict with:
              - risk_score: float
              - predicted_label: str
              - attention_explanation: Dict (if GATv2)
              - feature_importance: List of (feature_name, importance, value)
              - structural_patterns: List of detected patterns
              - narrative: str (human-readable explanation)
              - counterfactual_hints: List of suggestions
        """
        explanation = {}

        # Run model prediction
        self.model.eval()
        x = self.data_x.to(self.device)
        ei = self.edge_index.to(self.device)

        with torch.no_grad():
            out = self.model(x, ei)
            out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
            probs = F.softmax(out, dim=1)
            probs = torch.clamp(probs, 1e-6, 1 - 1e-6)

        risk_score = float(probs[node_idx, 1].cpu())
        pred_label = 'illicit' if out[node_idx].argmax().item() == 1 else 'licit'

        explanation['node_id'] = str(self.tx_ids[node_idx]) if node_idx < len(self.tx_ids) else str(node_idx)
        explanation['risk_score'] = risk_score
        explanation['predicted_label'] = pred_label
        explanation['confidence'] = float(max(risk_score, 1 - risk_score))

        # 1. Attention-based explanation (GATv2 only)
        if self._has_attention:
            explanation['attention_explanation'] = self._explain_attention(node_idx)

        # 2. Feature importance via gradient attribution
        explanation['feature_importance'] = self._compute_feature_importance(node_idx, top_k_features)

        # 3. Structural patterns
        explanation['structural_patterns'] = self._detect_structural_patterns(node_idx)

        # 4. Generate narrative
        explanation['narrative'] = self._generate_narrative(explanation)

        # 5. Counterfactual hints
        explanation['counterfactual_hints'] = self._generate_counterfactuals(node_idx, explanation)

        return explanation

    def explain_batch(self, node_indices: List[int], top_k_features: int = 5) -> List[Dict]:
        """Explain multiple nodes at once."""
        return [self.explain_node(idx, top_k_features) for idx in node_indices]

    # =========================================================================
    # Attention Explanation
    # =========================================================================

    def _explain_attention(self, node_idx: int) -> Dict:
        """
        Extract attention weights for a specific node from GATv2.
        Shows which neighbor nodes the model paid most attention to.
        """
        # Run forward pass to populate attention weights
        self.model.eval()
        x = self.data_x.to(self.device)
        ei = self.edge_index.to(self.device)

        with torch.no_grad():
            _ = self.model(x, ei)

        attn_weights = self.model.get_attention_weights()

        # Find edges involving this node (as target, since attention
        # is applied to incoming messages)
        edge_index_np = self.edge_index.cpu().numpy()

        # Edges where node_idx is the TARGET (incoming messages)
        incoming_mask = edge_index_np[1] == node_idx
        incoming_sources = edge_index_np[0][incoming_mask]

        # Edges where node_idx is the SOURCE (outgoing)
        outgoing_mask = edge_index_np[0] == node_idx
        outgoing_targets = edge_index_np[1][outgoing_mask]

        neighbor_attention = []

        if attn_weights and attn_weights[0] is not None:
            # Use last layer attention for final-decision explanation
            last_attn = attn_weights[-1].cpu().numpy()

            # Get attention weights for incoming edges
            incoming_indices = np.where(incoming_mask)[0]
            for i, src in zip(incoming_indices, incoming_sources):
                if i < len(last_attn):
                    # Average over attention heads
                    avg_attn = float(np.mean(last_attn[i]))
                    src_id = str(self.tx_ids[src]) if src < len(self.tx_ids) else str(src)
                    neighbor_attention.append({
                        'neighbor_id': src_id,
                        'neighbor_idx': int(src),
                        'attention_weight': avg_attn,
                        'direction': 'incoming',
                    })

        # Sort by attention weight (most important first)
        neighbor_attention.sort(key=lambda x: x['attention_weight'], reverse=True)

        return {
            'num_incoming': len(incoming_sources),
            'num_outgoing': len(outgoing_targets),
            'top_attended_neighbors': neighbor_attention[:10],
            'has_attention_data': len(neighbor_attention) > 0,
        }

    # =========================================================================
    # Feature Importance (Gradient-based)
    # =========================================================================

    def _compute_feature_importance(self, node_idx: int, top_k: int = 10) -> List[Dict]:
        """
        Compute feature importance using input gradient attribution.
        Shows which input features most influenced the prediction.
        """
        self.model.eval()
        x = self.data_x.clone().detach().to(self.device).requires_grad_(True)
        ei = self.edge_index.to(self.device)

        try:
            out = self.model(x, ei)
            # Get illicit class score for the target node
            target_score = out[node_idx, 1]
            target_score.backward()

            if x.grad is not None:
                # Gradient × Input = attribution
                gradients = x.grad[node_idx].cpu().numpy()
                features = self.data_x[node_idx].cpu().numpy()
                attributions = np.abs(gradients * features)
            else:
                return []
        except Exception:
            return []

        # Get top-K features by attribution
        num_features = len(attributions)
        top_indices = np.argsort(attributions)[::-1][:top_k]

        feature_importance = []
        for idx in top_indices:
            feat_name = self._get_feature_name(int(idx), num_features)
            feature_importance.append({
                'feature_index': int(idx),
                'feature_name': feat_name,
                'importance': float(attributions[idx]),
                'value': float(features[idx]),
                'gradient': float(gradients[idx]),
            })

        return feature_importance

    def _get_feature_name(self, idx: int, total_features: int) -> str:
        """Map feature index to human-readable name."""
        # Wallet-based features (first 6)
        if total_features <= 20 and idx < len(WALLET_FEATURE_NAMES):
            return WALLET_FEATURE_NAMES[idx]

        # Temporal features (after wallet features)
        if total_features <= 20 and idx - len(WALLET_FEATURE_NAMES) < len(TEMPORAL_FEATURE_NAMES):
            tidx = idx - len(WALLET_FEATURE_NAMES)
            if 0 <= tidx < len(TEMPORAL_FEATURE_NAMES):
                return TEMPORAL_FEATURE_NAMES[tidx]

        # Elliptic dataset
        if idx == 0:
            return 'timestep'
        elif idx <= 93:
            return f'local_feature_{idx}'
        elif idx <= 165:
            return f'aggregate_neighbor_feature_{idx - 93}'
        else:
            return f'feature_{idx}'

    # =========================================================================
    # Structural Pattern Detection
    # =========================================================================

    def _detect_structural_patterns(self, node_idx: int) -> List[Dict]:
        """Detect structural graph patterns around this node."""
        patterns = []
        edge_index_np = self.edge_index.cpu().numpy()

        # Compute degrees
        in_degree = int((edge_index_np[1] == node_idx).sum())
        out_degree = int((edge_index_np[0] == node_idx).sum())

        # Fan-out detection
        if out_degree >= 3:
            targets = edge_index_np[1][edge_index_np[0] == node_idx]
            patterns.append({
                'type': 'fan_out',
                'severity': 'high' if out_degree >= 5 else 'medium',
                'description': f'Sends to {out_degree} different recipients (structuring indicator)',
                'detail': f'Recipients: {len(set(targets))} unique wallets',
            })

        # Fan-in detection
        if in_degree >= 3:
            sources = edge_index_np[0][edge_index_np[1] == node_idx]
            patterns.append({
                'type': 'fan_in',
                'severity': 'high' if in_degree >= 5 else 'medium',
                'description': f'Receives from {in_degree} different sources (aggregation point)',
                'detail': f'Sources: {len(set(sources))} unique wallets',
            })

        # Pass-through / mule detection
        if in_degree >= 2 and out_degree >= 2:
            patterns.append({
                'type': 'pass_through',
                'severity': 'critical',
                'description': f'Both receives ({in_degree}) and sends ({out_degree}) to multiple wallets (mule wallet pattern)',
                'detail': 'Classic smurfing intermediary — receives from multiple sources, redistributes to multiple destinations',
            })

        # Isolated high-risk (high degree + high score)
        if in_degree + out_degree >= 6:
            patterns.append({
                'type': 'high_activity',
                'severity': 'high',
                'description': f'Very high transaction volume ({in_degree + out_degree} total connections)',
                'detail': 'Unusually high activity compared to typical wallets',
            })

        return patterns

    # =========================================================================
    # Narrative Generation
    # =========================================================================

    def _generate_narrative(self, explanation: Dict) -> str:
        """
        Generate a human-readable narrative explanation.
        This is what investigators see — must be clear and actionable.
        """
        node_id = explanation['node_id']
        risk = explanation['risk_score']
        label = explanation['predicted_label']
        confidence = explanation['confidence']

        parts = []

        # Opening
        if risk >= 0.7:
            parts.append(f"🔴 HIGH RISK: Wallet {node_id[:12]}... is flagged as {label} "
                         f"with {confidence * 100:.0f}% confidence (risk score: {risk:.2f}).")
        elif risk >= 0.4:
            parts.append(f"⚠️ SUSPICIOUS: Wallet {node_id[:12]}... shows suspicious patterns "
                         f"(risk score: {risk:.2f}, confidence: {confidence * 100:.0f}%).")
        else:
            parts.append(f"✅ LOW RISK: Wallet {node_id[:12]}... appears legitimate "
                         f"(risk score: {risk:.2f}).")

        # Structural patterns
        patterns = explanation.get('structural_patterns', [])
        if patterns:
            parts.append("\nDetected patterns:")
            for p in patterns:
                icon = '🔴' if p['severity'] == 'critical' else '⚠️' if p['severity'] == 'high' else 'ℹ️'
                parts.append(f"  {icon} {p['description']}")

        # Top features
        features = explanation.get('feature_importance', [])
        if features:
            parts.append("\nTop contributing factors:")
            for f in features[:5]:
                direction = "↑ increases" if f['gradient'] > 0 else "↓ decreases"
                parts.append(f"  • {f['feature_name']}: value={f['value']:.3f} "
                             f"({direction} suspicion)")

        # Attention info
        attn = explanation.get('attention_explanation', {})
        if attn.get('has_attention_data'):
            top_neighbors = attn.get('top_attended_neighbors', [])[:3]
            if top_neighbors:
                parts.append("\nMost influential connections:")
                for n in top_neighbors:
                    parts.append(f"  • {n['direction'].title()} from {n['neighbor_id'][:12]}... "
                                 f"(attention: {n['attention_weight']:.3f})")

        return "\n".join(parts)

    # =========================================================================
    # Counterfactual Explanations
    # =========================================================================

    def _generate_counterfactuals(self, node_idx: int, explanation: Dict) -> List[str]:
        """
        Generate counterfactual hints: what would need to change
        for this transaction to be considered safe?
        """
        hints = []
        patterns = explanation.get('structural_patterns', [])

        for p in patterns:
            if p['type'] == 'fan_out':
                hints.append("Reduce the number of distinct recipients — "
                             "legitimate wallets typically send to fewer destinations.")
            elif p['type'] == 'fan_in':
                hints.append("The number of distinct funding sources is high — "
                             "legitimate accounts typically receive from fewer senders.")
            elif p['type'] == 'pass_through':
                hints.append("This wallet acts as an intermediary (receives and redistributes). "
                             "This pattern is characteristic of money mule accounts.")

        features = explanation.get('feature_importance', [])
        for f in features[:3]:
            if 'threshold' in f['feature_name'].lower() and f['value'] > 0.5:
                hints.append("Transaction amounts are clustered near regulatory reporting "
                             "thresholds, suggesting possible structuring to evade CTR filing.")
            elif 'regularity' in f['feature_name'].lower() and f['value'] > 0.5:
                hints.append("Transactions occur at suspiciously regular intervals, "
                             "suggesting automated/bot-driven activity.")
            elif 'burst' in f['feature_name'].lower() and f['value'] > 0.5:
                hints.append("Multiple transactions in a short time window indicate "
                             "rapid-fire structuring behavior.")

        if not hints:
            if explanation['risk_score'] >= 0.5:
                hints.append("The overall pattern of connections and transaction features "
                             "matches known money laundering typologies.")
            else:
                hints.append("No specific high-risk indicators detected.")

        return hints


class ExplainabilityService:
    """
    Service wrapper for generating explanations from the backend.
    Used by the analysis router to provide explanations via API.
    """

    def __init__(self):
        self._engine: Optional[ExplainabilityEngine] = None

    def create_engine(
        self,
        model: torch.nn.Module,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        device: torch.device = None,
    ) -> ExplainabilityEngine:
        """Create an explainability engine from model + data."""
        x = torch.tensor(features, dtype=torch.float)
        ei = torch.tensor(edge_index, dtype=torch.long)
        self._engine = ExplainabilityEngine(model, x, ei, tx_ids, device)
        return self._engine

    def explain_wallet(
        self,
        model: torch.nn.Module,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        wallet_id: str,
        device: torch.device = None,
    ) -> Optional[Dict]:
        """
        Generate explanation for a specific wallet/transaction.
        Returns None if wallet not found.
        """
        # Find node index for this wallet
        try:
            node_idx = [str(tid) for tid in tx_ids].index(str(wallet_id))
        except ValueError:
            return None

        engine = self.create_engine(model, features, edge_index, tx_ids, device)
        return engine.explain_node(node_idx)

    def explain_top_suspicious(
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
        engine = self.create_engine(model, features, edge_index, tx_ids, device)

        # Get top-K indices by suspicion score
        top_indices = np.argsort(scores)[::-1][:top_k]

        explanations = []
        for idx in top_indices:
            try:
                exp = engine.explain_node(int(idx), top_k_features=5)
                explanations.append(exp)
            except Exception as e:
                print(f"Warning: Could not explain node {idx}: {e}")

        return explanations


# Global service instance
explainability_service = ExplainabilityService()
