# pyright: basic
# type: ignore
"""
Ensemble Model for AML Detection
==================================
Combines GNN graph-based predictions with XGBoost tabular predictions
via a meta-learner (stacking) for more robust fraud detection.

Architecture:
  ┌─────────────────┐      ┌─────────────────┐
  │ GATv2 / GraphSAGE│      │ XGBoost         │
  │ (graph features) │      │ (tabular feats) │
  └────────┬────────┘      └────────┬────────┘
           │ score_gnn               │ score_xgb
           └────────────┬───────────┘
                        ▼
              ┌─────────────────┐
              │ Meta-Learner    │
              │ (LightGBM/LR)  │
              └────────┬────────┘
                       │
                       ▼
                 Final Score

Why Ensemble:
  - GNN captures graph topology (who transacts with whom)
  - XGBoost captures tabular patterns (amount, velocity, temporal)
  - Meta-learner learns optimal weighting based on data
  - More robust than any single model
  - Reduces false positives while maintaining high recall
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    roc_auc_score,
    classification_report,
)
import json
import os
import pickle

# Optional: try to import XGBoost
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    print("XGBoost not installed. Install with: pip install xgboost")

# Optional: try to import LightGBM for meta-learner
try:
    import lightgbm as lgb
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False


class TabularAMLClassifier:
    """
    XGBoost-based classifier that operates on tabular transaction features.
    Does NOT use graph structure — purely feature-based.
    
    This is the "second opinion" model that complements the GNN.
    
    Features used:
      - Amount statistics (mean, std, max, min)
      - Temporal features (velocity, regularity, burst)
      - Degree features (in/out degree)
      - CTR threshold proximity
      - Round amount ratio
    """
    
    def __init__(self, n_estimators: int = 300, max_depth: int = 6, learning_rate: float = 0.05):
        self.params = {
            'n_estimators': n_estimators,
            'max_depth': max_depth,
            'learning_rate': learning_rate,
        }
        self.model = None
        self.feature_names = None
        self.is_fitted = False
    
    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None,
    ) -> Dict:
        """
        Train XGBoost on tabular features.
        
        Args:
            X_train: Training features (N x D)
            y_train: Training labels (N,) — 0=licit, 1=illicit
            X_val: Optional validation features
            y_val: Optional validation labels
            feature_names: Optional feature name list
            
        Returns:
            Training metrics dict
        """
        if not XGBOOST_AVAILABLE:
            raise ImportError("XGBoost required. Install: pip install xgboost")
        
        self.feature_names = feature_names or [f'f{i}' for i in range(X_train.shape[1])]
        
        # Handle class imbalance
        n_licit = (y_train == 0).sum()
        n_illicit = (y_train == 1).sum()
        scale_pos_weight = n_licit / max(n_illicit, 1)
        
        self.model = xgb.XGBClassifier(
            n_estimators=self.params['n_estimators'],
            max_depth=self.params['max_depth'],
            learning_rate=self.params['learning_rate'],
            scale_pos_weight=scale_pos_weight,
            use_label_encoder=False,
            eval_metric='aucpr',
            random_state=42,
            n_jobs=-1,
        )
        
        eval_set = [(X_train, y_train)]
        if X_val is not None and y_val is not None:
            eval_set.append((X_val, y_val))
        
        self.model.fit(
            X_train, y_train,
            eval_set=eval_set,
            verbose=False,
        )
        
        self.is_fitted = True
        
        # Compute training metrics
        train_probs = self.model.predict_proba(X_train)[:, 1]
        train_preds = self.model.predict(X_train)
        
        metrics = {
            'train_auprc': float(average_precision_score(y_train, train_probs)),
            'train_f1_illicit': float(f1_score(y_train, train_preds, pos_label=1, zero_division=0)),
            'train_roc_auc': float(roc_auc_score(y_train, train_probs)),
        }
        
        if X_val is not None and y_val is not None:
            val_probs = self.model.predict_proba(X_val)[:, 1]
            val_preds = self.model.predict(X_val)
            metrics['val_auprc'] = float(average_precision_score(y_val, val_probs))
            metrics['val_f1_illicit'] = float(f1_score(y_val, val_preds, pos_label=1, zero_division=0))
            metrics['val_roc_auc'] = float(roc_auc_score(y_val, val_probs))
        
        print(f"XGBoost trained: AUPRC={metrics.get('val_auprc', metrics['train_auprc']):.4f}")
        
        return metrics
    
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Predict illicit probability for each sample."""
        if not self.is_fitted:
            raise RuntimeError("Model not fitted. Call fit() first.")
        return self.model.predict_proba(X)[:, 1]
    
    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance from XGBoost."""
        if not self.is_fitted:
            return {}
        
        importance = self.model.feature_importances_
        return {name: float(imp) for name, imp in zip(self.feature_names, importance)}
    
    def save(self, path: str):
        """Save XGBoost model."""
        if self.model is not None:
            self.model.save_model(path)
            # Save feature names
            meta_path = path.replace('.json', '_meta.json').replace('.xgb', '_meta.json')
            if not meta_path.endswith('_meta.json'):
                meta_path = path + '_meta.json'
            with open(meta_path, 'w') as f:
                json.dump({'feature_names': self.feature_names}, f)
            print(f"✅ XGBoost model saved to {path}")
    
    def load(self, path: str):
        """Load XGBoost model."""
        if not XGBOOST_AVAILABLE:
            raise ImportError("XGBoost required")
        self.model = xgb.XGBClassifier()
        self.model.load_model(path)
        self.is_fitted = True
        
        meta_path = path.replace('.json', '_meta.json').replace('.xgb', '_meta.json')
        if not meta_path.endswith('_meta.json'):
            meta_path = path + '_meta.json'
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as f:
                meta = json.load(f)
            self.feature_names = meta.get('feature_names')
        print(f"✅ XGBoost model loaded from {path}")


class EnsembleAMLDetector:
    """
    Ensemble AML detector that combines GNN + XGBoost via stacking.
    
    Training flow:
      1. Train GNN (GATv2/GraphSAGE) on graph data
      2. Train XGBoost on tabular features
      3. Get predictions from both on validation set
      4. Train meta-learner on stacked predictions
    
    Inference flow:
      1. Get GNN score for each node
      2. Get XGBoost score for each node
      3. Stack scores and run through meta-learner
      4. Output final score
    """
    
    def __init__(self):
        self.tabular_model = TabularAMLClassifier()
        self.meta_learner = None
        self.is_fitted = False
        self._gnn_weight = 0.6  # Default weighting if meta-learner not trained
        self._xgb_weight = 0.4
    
    def fit_tabular(
        self,
        features: np.ndarray,
        labels: np.ndarray,
        train_mask: np.ndarray,
        val_mask: np.ndarray,
        feature_names: Optional[List[str]] = None,
    ) -> Dict:
        """
        Train the XGBoost tabular model.
        
        Args:
            features: Full feature matrix (N x D)
            labels: Full label array (N,) — 0/1/-1
            train_mask: Boolean mask for training nodes
            val_mask: Boolean mask for validation nodes
            feature_names: Optional feature names
        
        Returns:
            Training metrics
        """
        # Filter to labeled data only
        train_filter = train_mask & (labels >= 0)
        val_filter = val_mask & (labels >= 0)
        
        X_train = features[train_filter]
        y_train = labels[train_filter]
        X_val = features[val_filter]
        y_val = labels[val_filter]
        
        return self.tabular_model.fit(X_train, y_train, X_val, y_val, feature_names)
    
    def fit_meta_learner(
        self,
        gnn_scores: np.ndarray,
        xgb_scores: np.ndarray,
        labels: np.ndarray,
        mask: np.ndarray,
    ) -> Dict:
        """
        Train the meta-learner on stacked predictions from GNN + XGBoost.
        
        Args:
            gnn_scores: GNN illicit probabilities (N,)
            xgb_scores: XGBoost illicit probabilities (N,)
            labels: True labels (N,) — 0/1/-1
            mask: Boolean mask for training data
            
        Returns:
            Meta-learner metrics
        """
        # Filter to labeled data
        valid = mask & (labels >= 0)
        
        # Stack predictions as features for meta-learner
        X_meta = np.column_stack([
            gnn_scores[valid],
            xgb_scores[valid],
            gnn_scores[valid] * xgb_scores[valid],  # Interaction
            np.abs(gnn_scores[valid] - xgb_scores[valid]),  # Disagreement
        ])
        y_meta = labels[valid]
        
        # Use Logistic Regression as meta-learner (simple + interpretable)
        self.meta_learner = LogisticRegression(
            C=1.0,
            class_weight='balanced',
            random_state=42,
            max_iter=1000,
        )
        self.meta_learner.fit(X_meta, y_meta)
        self.is_fitted = True
        
        # Compute metrics
        meta_probs = self.meta_learner.predict_proba(X_meta)[:, 1]
        meta_preds = self.meta_learner.predict(X_meta)
        
        # Extract learned weights
        if hasattr(self.meta_learner, 'coef_'):
            weights = self.meta_learner.coef_[0]
            self._gnn_weight = float(np.abs(weights[0]))
            self._xgb_weight = float(np.abs(weights[1]))
            total = self._gnn_weight + self._xgb_weight
            if total > 0:
                self._gnn_weight /= total
                self._xgb_weight /= total
        
        metrics = {
            'meta_auprc': float(average_precision_score(y_meta, meta_probs)),
            'meta_f1_illicit': float(f1_score(y_meta, meta_preds, pos_label=1, zero_division=0)),
            'meta_roc_auc': float(roc_auc_score(y_meta, meta_probs)),
            'gnn_weight': self._gnn_weight,
            'xgb_weight': self._xgb_weight,
        }
        
        print(f"Meta-learner trained: AUPRC={metrics['meta_auprc']:.4f}")
        print(f"  Learned weights — GNN: {self._gnn_weight:.2f}, XGBoost: {self._xgb_weight:.2f}")
        
        return metrics
    
    def predict_ensemble(
        self,
        gnn_scores: np.ndarray,
        features: np.ndarray,
    ) -> np.ndarray:
        """
        Get ensemble prediction combining GNN + XGBoost.
        
        Args:
            gnn_scores: GNN illicit probabilities (N,)
            features: Tabular features for XGBoost (N x D)
            
        Returns:
            Final ensemble scores (N,)
        """
        # Get XGBoost scores
        if self.tabular_model.is_fitted:
            xgb_scores = self.tabular_model.predict_proba(features)
        else:
            # Fallback: use GNN only
            return gnn_scores
        
        # Use meta-learner if available
        if self.is_fitted and self.meta_learner is not None:
            X_meta = np.column_stack([
                gnn_scores,
                xgb_scores,
                gnn_scores * xgb_scores,
                np.abs(gnn_scores - xgb_scores),
            ])
            final_scores = self.meta_learner.predict_proba(X_meta)[:, 1]
        else:
            # Simple weighted average
            final_scores = self._gnn_weight * gnn_scores + self._xgb_weight * xgb_scores
        
        return np.clip(final_scores, 0, 1)
    
    def save(self, output_dir: str):
        """Save all ensemble components."""
        os.makedirs(output_dir, exist_ok=True)
        
        # Save XGBoost
        if self.tabular_model.is_fitted:
            self.tabular_model.save(os.path.join(output_dir, 'xgboost_model.json'))
        
        # Save meta-learner
        if self.meta_learner is not None:
            with open(os.path.join(output_dir, 'meta_learner.pkl'), 'wb') as f:
                pickle.dump(self.meta_learner, f)
        
        # Save config
        config = {
            'gnn_weight': self._gnn_weight,
            'xgb_weight': self._xgb_weight,
            'is_fitted': self.is_fitted,
        }
        with open(os.path.join(output_dir, 'ensemble_config.json'), 'w') as f:
            json.dump(config, f, indent=2)
        
        print(f"✅ Ensemble saved to {output_dir}")
    
    def load(self, output_dir: str):
        """Load all ensemble components."""
        xgb_path = os.path.join(output_dir, 'xgboost_model.json')
        if os.path.exists(xgb_path):
            self.tabular_model.load(xgb_path)
        
        meta_path = os.path.join(output_dir, 'meta_learner.pkl')
        if os.path.exists(meta_path):
            with open(meta_path, 'rb') as f:
                self.meta_learner = pickle.load(f)
            self.is_fitted = True
        
        config_path = os.path.join(output_dir, 'ensemble_config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            self._gnn_weight = config.get('gnn_weight', 0.6)
            self._xgb_weight = config.get('xgb_weight', 0.4)
            self.is_fitted = config.get('is_fitted', False)
        
        print(f"✅ Ensemble loaded from {output_dir}")


def extract_tabular_features(
    node_features: np.ndarray,
    edge_index: np.ndarray,
    labels: np.ndarray,
) -> Tuple[np.ndarray, List[str]]:
    """
    Extract tabular features from graph data for XGBoost.
    Combines node features with computed graph structural features.
    
    Args:
        node_features: Node feature matrix (N x D)
        edge_index: Edge index (2 x E)
        labels: Node labels (N,)
        
    Returns:
        (features, feature_names) tuple
    """
    N = node_features.shape[0]
    
    # Start with original node features
    features = node_features.copy()
    feature_names = [f'node_feat_{i}' for i in range(node_features.shape[1])]
    
    # Add graph structural features
    in_degree = np.zeros(N, dtype=np.float32)
    out_degree = np.zeros(N, dtype=np.float32)
    
    for src, dst in zip(edge_index[0], edge_index[1]):
        if src < N:
            out_degree[src] += 1
        if dst < N:
            in_degree[dst] += 1
    
    total_degree = in_degree + out_degree
    degree_ratio = np.divide(out_degree, np.maximum(in_degree, 1))
    
    # Neighbor average features (1-hop)
    neighbor_mean = np.zeros_like(node_features)
    neighbor_count = np.zeros(N, dtype=np.float32)
    
    for src, dst in zip(edge_index[0], edge_index[1]):
        if dst < N and src < N:
            neighbor_mean[dst] += node_features[src]
            neighbor_count[dst] += 1
    
    for i in range(N):
        if neighbor_count[i] > 0:
            neighbor_mean[i] /= neighbor_count[i]
    
    # Difference from neighbor average (anomaly signal)
    neighbor_diff = np.abs(node_features - neighbor_mean)
    neighbor_diff_norm = np.linalg.norm(neighbor_diff, axis=1, keepdims=True)
    
    # Stack all features
    structural_features = np.column_stack([
        in_degree,
        out_degree,
        total_degree,
        degree_ratio,
        neighbor_diff_norm,
    ])
    
    structural_names = [
        'graph_in_degree', 'graph_out_degree', 'graph_total_degree',
        'graph_degree_ratio', 'graph_neighbor_anomaly',
    ]
    
    features = np.hstack([features, structural_features])
    feature_names.extend(structural_names)
    
    # Handle NaN/Inf
    features = np.nan_to_num(features, nan=0.0, posinf=5.0, neginf=-5.0)
    
    return features, feature_names
