"""
ML Service - Integration with Smurf Hunter Model v2

Provides:
1. GATv2 + GraphSAGE model loading and inference
2. Top-K suspicious node extraction
3. K-hop neighborhood subgraph extraction for visualization
4. Pattern detection (structuring, layering, smurfing)
5. Attention weight export for explainability
"""
import os
import sys
import json
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional, Set, Any
from pathlib import Path
from collections import deque

# ── Compatibility patch for torch/transformers version mismatch ──────────────
# transformers >=4.41 calls _register_pytree_node(serialized_type_name=...)
# but some PyTorch builds don't have that kwarg. We wrap it to swallow extras.
try:
    import torch.utils._pytree as _tp
    if hasattr(_tp, "_register_pytree_node"):
        _orig = _tp._register_pytree_node
        def _patched_register(*args, **kwargs):
            # Drop kwargs not accepted by original
            import inspect
            sig = inspect.signature(_orig)
            valid = {k: v for k, v in kwargs.items() if k in sig.parameters}
            return _orig(*args, **valid)
        _tp._register_pytree_node = _patched_register
        _tp.register_pytree_node = _patched_register
except Exception:
    pass
# ─────────────────────────────────────────────────────────────────────────────

import torch
import torch.nn as nn
import torch.nn.functional as F



# Add AI/ML to path for model import
ML_PATH = Path(__file__).parent.parent.parent.parent / "AI" / "ML"
sys.path.insert(0, str(ML_PATH))

from app.config import settings

# Import GNN components
try:
    from torch_geometric.nn import SAGEConv, GATv2Conv
    TORCH_GEOMETRIC_AVAILABLE = True
except ImportError:
    TORCH_GEOMETRIC_AVAILABLE = False
    print("Warning: torch_geometric not available")


class GraphSAGEModel(torch.nn.Module):
    """
    Legacy GraphSAGE model (backward compatible with v1 weights).
    Input: 166 features | Hidden: 64 | Output: 2 classes
    """
    def __init__(self, in_channels: int = 166, hidden_channels: int = 64, out_channels: int = 2, dropout: float = 0.3):
        super().__init__()
        if TORCH_GEOMETRIC_AVAILABLE:
            self.conv1 = SAGEConv(in_channels, hidden_channels, aggr='mean')
            self.conv2 = SAGEConv(hidden_channels, out_channels, aggr='mean')
        self.dropout = dropout

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = self.conv2(x, edge_index)
        return x

    def get_embeddings(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        return x


class SmurfHunterGNNModel(torch.nn.Module):
    """
    Advanced GATv2 model matching the architecture in AI/ML/models.py (v2).
    Multi-head attention with BatchNorm, residual connections, and MLP head.
    """
    def __init__(
        self,
        in_channels: int = 166,
        hidden_channels: int = 128,
        out_channels: int = 2,
        heads: int = 4,
        num_layers: int = 3,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.num_layers = num_layers
        self.dropout = dropout
        self._attention_weights: List[Optional[torch.Tensor]] = [None] * num_layers

        head_dim = hidden_channels // heads
        self.input_proj = nn.Linear(in_channels, heads * head_dim)

        self.convs = nn.ModuleList()
        self.norms = nn.ModuleList()

        # Layer 1
        self.convs.append(GATv2Conv(
            in_channels, head_dim, heads=heads,
            dropout=dropout, add_self_loops=True, concat=True
        ))
        self.norms.append(nn.BatchNorm1d(heads * head_dim))

        # Intermediate layers
        for _ in range(1, num_layers - 1):
            self.convs.append(GATv2Conv(
                heads * head_dim, head_dim, heads=heads,
                dropout=dropout, add_self_loops=True, concat=True
            ))
            self.norms.append(nn.BatchNorm1d(heads * head_dim))

        # Final layer
        final_out = hidden_channels // 2
        self.convs.append(GATv2Conv(
            heads * head_dim, final_out, heads=1,
            dropout=dropout, add_self_loops=True, concat=False
        ))
        self.norms.append(nn.BatchNorm1d(final_out))

        # MLP head
        self.mlp = nn.Sequential(
            nn.Linear(final_out, final_out // 2),
            nn.ELU(),
            nn.Dropout(dropout),
            nn.Linear(final_out // 2, out_channels),
        )

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        residual = self.input_proj(x)
        for i, (conv, norm) in enumerate(zip(self.convs, self.norms)):
            x_out, attn_w = conv(
                x if i == 0 else h,
                edge_index,
                return_attention_weights=True,
            )
            self._attention_weights[i] = attn_w[1].detach() if attn_w is not None else None
            h = norm(x_out)
            h = F.elu(h)
            h = F.dropout(h, p=self.dropout, training=self.training)
            if 0 < i < self.num_layers - 1:
                h = h + residual
            elif i == 0:
                residual = h
        out = self.mlp(h)
        return out

    def get_embeddings(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        residual = self.input_proj(x)
        for i, (conv, norm) in enumerate(zip(self.convs, self.norms)):
            x_out = conv(x if i == 0 else h, edge_index)
            h = norm(x_out)
            h = F.elu(h)
            if 0 < i < self.num_layers - 1:
                h = h + residual
            elif i == 0:
                residual = h
        return h

    def get_attention_weights(self) -> List[Optional[torch.Tensor]]:
        """Return attention weights from last forward pass for explainability."""
        return self._attention_weights


class BestModelTG(torch.nn.Module):
    """
    Architecture matching best_model_tg.pt (trained on 43-feature Elliptic subset).
    Keys: conv1/conv2/conv3 (GATv2Conv), bn1/bn2/bn3 (BatchNorm1d), classifier (Linear)
    Shape confirmed: lin_l=[64,43], heads=4, head_dim=16, hidden=64, classifier=[2,128]
    """
    def __init__(self, in_channels: int = 43, hidden_channels: int = 64,
                 out_channels: int = 2, heads: int = 4, dropout: float = 0.3):
        super().__init__()
        self.dropout = dropout
        head_dim = hidden_channels // heads  # 16

        # conv1: in_channels → heads * head_dim = 64
        self.conv1 = GATv2Conv(in_channels, head_dim, heads=heads,
                               dropout=dropout, add_self_loops=True, concat=True)
        self.bn1 = nn.BatchNorm1d(hidden_channels)

        # conv2: 64 → 64
        self.conv2 = GATv2Conv(hidden_channels, head_dim, heads=heads,
                               dropout=dropout, add_self_loops=True, concat=True)
        self.bn2 = nn.BatchNorm1d(hidden_channels)

        # conv3: 64 → 64
        self.conv3 = GATv2Conv(hidden_channels, head_dim, heads=heads,
                               dropout=dropout, add_self_loops=True, concat=True)
        self.bn3 = nn.BatchNorm1d(hidden_channels)

        # Classifier: 128 → 2 (cat of conv2 + conv3 outputs)
        self.classifier = nn.Linear(hidden_channels * 2, out_channels)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        h1 = F.elu(self.bn1(self.conv1(x, edge_index)))
        h1 = F.dropout(h1, p=self.dropout, training=self.training)
        h2 = F.elu(self.bn2(self.conv2(h1, edge_index)))
        h2 = F.dropout(h2, p=self.dropout, training=self.training)
        h3 = F.elu(self.bn3(self.conv3(h2, edge_index)))
        out = self.classifier(torch.cat([h2, h3], dim=-1))
        return out

    def get_embeddings(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        h1 = F.elu(self.bn1(self.conv1(x, edge_index)))
        h2 = F.elu(self.bn2(self.conv2(h1, edge_index)))
        return h2


class SmurfHunterService:
    """
    Service for running the Smurf Hunter ML model for AML detection
    
    Key Features:
    - Load trained GraphSAGE model from smurf_hunter_model.pt
    - Run inference on transaction graphs
    - Extract top-K suspicious nodes with k-hop neighborhoods
    - Detect money laundering patterns (structuring, layering, smurfing)
    """
    
    def __init__(self):
        self.model = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_loaded = False
        # Will be updated when model is loaded based on actual architecture
        self.expected_features = 43  # best_model_tg.pt uses 43 features
    
    def load_model(self, model_path: Optional[str] = None):
        """
        Load the trained model (auto-detects GATv2 or legacy GraphSAGE).
        Checks for _metadata.json alongside the .pt file for architecture info.
        """
        if self.model_loaded:
            return True
        
        if not TORCH_GEOMETRIC_AVAILABLE:
            print("Error: torch_geometric required for model")
            return False
        
        try:
            if model_path is None:
                # Resolve project root (4 levels up from this file: services/app/Backend/project)
                project_root = Path(__file__).parent.parent.parent.parent
                models_dir = project_root / "AI" / "All_models"
                
                # Priority: best_model_tg.pt → best_model_pyg_gatv2.pt → best_baseline.pt
                candidates = [
                    models_dir / "best_model_tg.pt",
                    models_dir / "best_model_pyg_gatv2.pt",
                    models_dir / "best_baseline.pt",
                    # Legacy fallback path
                    Path(__file__).parent.parent.parent.parent / "AI" / "ML" / "smurf_hunter_model_v2.pt",
                    Path(__file__).parent.parent.parent.parent / "AI" / "ML" / "smurf_hunter_model.pt",
                ]
                model_path = None
                for c in candidates:
                    if c.exists():
                        model_path = str(c)
                        print(f"Found model at: {model_path}")
                        break
            
            if not model_path or not os.path.exists(model_path):
                print(f"Warning: No model file found. Searched AI/All_models/ and AI/ML/")
                return False
            
            # Try to load metadata for architecture auto-detection
            meta_path = model_path.replace('.pt', '_metadata.json')
            model_type = 'graphsage'  # default to legacy
            hidden_channels = 64
            heads = 4
            num_layers = 3
            in_channels = self.expected_features
            
            if os.path.exists(meta_path):
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
                model_type = meta.get('model_type', 'graphsage')
                hidden_channels = meta.get('hidden_dim', 64)
                heads = meta.get('heads', 4)
                num_layers = meta.get('num_layers', 3)
                in_channels = meta.get('in_channels', self.expected_features)
                print(f"Loaded model metadata: type={model_type}, hidden={hidden_channels}")
            
            # Load state dict first to auto-detect architecture from weight shapes
            state_dict = torch.load(model_path, map_location=self.device, weights_only=True)
            
            # Auto-detect BestModelTG: has flat conv1/conv2/conv3 + classifier keys
            has_flat_convs = 'conv1.lin_l.weight' in state_dict and 'classifier.weight' in state_dict
            has_convs_list = any(k.startswith('convs.') for k in state_dict.keys())
            
            if has_flat_convs and not has_convs_list:
                # BestModelTG architecture (best_model_tg.pt, best_model_pyg_gatv2.pt)
                # Auto-detect in_channels from weight shape
                in_channels = state_dict['conv1.lin_l.weight'].shape[1]
                hidden_channels = state_dict['conv1.lin_l.weight'].shape[0]
                heads = state_dict['conv1.att'].shape[1]
                self.expected_features = in_channels
                self.model = BestModelTG(
                    in_channels=in_channels,
                    hidden_channels=hidden_channels,
                    out_channels=2,
                    heads=heads,
                    dropout=0.3,
                )
                self._model_type = 'best_model_tg'
                print(f"Using BestModelTG architecture: in={in_channels}, hidden={hidden_channels}, heads={heads}")
            elif model_type == 'gatv2' or has_convs_list:
                self.model = SmurfHunterGNNModel(
                    in_channels=in_channels,
                    hidden_channels=hidden_channels,
                    out_channels=2,
                    heads=heads,
                    num_layers=num_layers,
                    dropout=0.3,
                )
                self.expected_features = in_channels
                self._model_type = 'gatv2'
                print(f"Using SmurfHunterGNN (GATv2) architecture")
            else:
                self.model = GraphSAGEModel(
                    in_channels=in_channels,
                    hidden_channels=hidden_channels,
                    out_channels=2,
                    dropout=0.3,
                )
                self._model_type = 'graphsage'
                print(f"Using legacy GraphSAGE architecture")
            
            # Load trained weights (strict=False handles custom GATv2 with temperature param)
            missing, unexpected = self.model.load_state_dict(state_dict, strict=False)
            if missing:
                print(f"Missing keys (will use defaults): {missing}")
            if unexpected:
                print(f"Ignoring extra keys from custom trainer: {unexpected}")
            self.model.to(self.device)
            self.model.eval()
            self.model_loaded = True
            
            print(f"[OK] Smurf Hunter model loaded successfully on {self.device}")
            return True
            
        except Exception as e:
            print(f"Error loading model: {e}")
            import traceback
            traceback.print_exc()
            self.model_loaded = False
            return False
    
    @torch.no_grad()
    def predict(
        self,
        features: np.ndarray,
        edge_index: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Run prediction on transaction graph
        
        Args:
            features: Node feature matrix (N x D) where D should be 165
            edge_index: Edge index array (2 x E)
        
        Returns:
            predictions: Predicted labels (0=licit, 1=illicit)
            suspicious_scores: Probability of being illicit [0.0, 1.0]
        """
        if not self.model_loaded:
            if not self.load_model():
                raise RuntimeError("Model not loaded")
        
        # Validate and prepare features
        features = self._prepare_features_for_model(features)
        
        # Prepare tensors
        x = torch.tensor(features, dtype=torch.float).to(self.device)
        edge_idx = torch.tensor(edge_index, dtype=torch.long).to(self.device)
        
        # Run inference
        out = self.model(x, edge_idx)
        
        # Numerical stability
        out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
        out = torch.clamp(out, min=-10.0, max=10.0)
        
        # Get predictions and probabilities
        probs = torch.softmax(out, dim=1)
        probs = torch.clamp(probs, 1e-6, 1 - 1e-6)
        
        predictions = out.argmax(dim=1).cpu().numpy()
        suspicious_scores = probs[:, 1].cpu().numpy()  # Probability of illicit (class 1)
        
        return predictions, suspicious_scores
    
    def _prepare_features_for_model(self, features: np.ndarray) -> np.ndarray:
        """
        Prepare features to match model's expected input (165 features)
        Handles padding/truncation and normalization
        """
        # Pad or truncate to expected feature count
        if features.shape[1] < self.expected_features:
            padding = np.zeros((features.shape[0], self.expected_features - features.shape[1]))
            features = np.hstack([features, padding])
        elif features.shape[1] > self.expected_features:
            features = features[:, :self.expected_features]
        
        # Clip extreme values for stability
        features = np.clip(features, -5.0, 5.0)
        
        return features.astype(np.float32)

    def predict_batch(self, features: np.ndarray, edge_index: Optional[np.ndarray] = None) -> Optional[Dict[str, Any]]:
        """Run batch prediction on node features"""
        if not self.model_loaded or self.model is None:
            return None
        features = self._prepare_features_for_model(features)
        x = torch.tensor(features, dtype=torch.float).to(self.device)
        if edge_index is None:
            edge_index = np.zeros((2, 0), dtype=np.int64)
        edge_idx = torch.tensor(edge_index, dtype=torch.long).to(self.device)
        try:
            out = self.model(x, edge_idx)
        except TypeError:
            out = self.model(x)
        out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
        out = torch.clamp(out, min=-10.0, max=10.0)
        probs = torch.softmax(out, dim=1)
        preds = out.argmax(dim=1).cpu().numpy()
        scores = probs[:, 1].cpu().numpy() if probs.shape[1] > 1 else probs[:, 0].cpu().numpy()
        return {
            "predictions": preds.tolist(),
            "probabilities": scores.tolist(),
        }

    def get_risk_level(self, score: float) -> str:
        """Calculate categorical risk level from score"""
        if score >= 0.90:
            return "critical"
        elif score >= 0.70:
            return "high"
        elif score >= 0.40:
            return "medium"
        else:
            return "low"

    def validate_features(self, features: np.ndarray) -> bool:
        """Validate feature matrix dimensions"""
        if not isinstance(features, np.ndarray) or features.ndim != 2:
            return False
        return features.shape[1] in [166, 165, 43, self.expected_features]

    def clean_features(self, features: np.ndarray) -> np.ndarray:
        """Replace NaN and infinite values in feature matrix"""
        return np.nan_to_num(features, nan=0.0, posinf=1.0, neginf=-1.0)
    
    def extract_suspicious_subgraph(
        self,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        top_k: int = 20,
        hop: int = 2
    ) -> Dict:
        """
        Extract subgraph centered on top-K suspicious nodes with k-hop neighborhoods
        
        This is the KEY function for visualization:
        1. Run model to get suspicious scores for ALL nodes
        2. Sort nodes by suspicious score (descending)
        3. Select top-K most suspicious nodes
        4. For each selected node, extract k-hop neighbors (BFS)
        5. Return subgraph containing these nodes and their edges
        
        Args:
            features: Node feature matrix (N x D)
            edge_index: Edge index array (2 x E)
            tx_ids: List of transaction IDs mapping to node indices
            top_k: Number of top suspicious nodes to include
            hop: Number of hops for neighborhood extraction
        
        Returns:
            Dict with nodes, edges, and metadata for visualization
        """
        # Run model prediction to get suspicious scores
        predictions, suspicious_scores = self.predict(features, edge_index)
        
        num_nodes = len(tx_ids)
        
        # Build adjacency list for efficient neighbor lookup
        adj_list = self._build_adjacency_list(edge_index, num_nodes)
        
        # Sort nodes by suspicious score (highest first)
        sorted_indices = np.argsort(suspicious_scores)[::-1]
        
        # Select top-K suspicious nodes
        top_k_indices = sorted_indices[:min(top_k, num_nodes)].tolist()
        
        # Extract k-hop neighborhoods using BFS
        subgraph_nodes = set()
        for seed_idx in top_k_indices:
            neighbors = self._bfs_k_hop_neighbors(seed_idx, adj_list, hop)
            subgraph_nodes.update(neighbors)
        
        # Convert to sorted list for consistent ordering
        subgraph_nodes = sorted(subgraph_nodes)
        node_set = set(subgraph_nodes)
        
        # Build a DiGraph to compute proper in/out degrees for the subgraph
        # IMPORTANT: Only use DIRECTED edges (first half of edge_index if bidirectional)
        import networkx as nx
        G = nx.DiGraph()
        
        # Determine how many edges are directed (vs bidirectional duplicates)
        num_directed = getattr(self, '_last_directed_edge_count', edge_index.shape[1] // 2)
        if num_directed == 0:
            num_directed = edge_index.shape[1]  # Fallback: use all edges
        
        # Add only DIRECTED edges within the subgraph (skip reverse edges)
        for i in range(min(num_directed, edge_index.shape[1])):
            src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
            if src in node_set and tgt in node_set:
                src_id = str(tx_ids[src]) if src < len(tx_ids) else str(src)
                tgt_id = str(tx_ids[tgt]) if tgt < len(tx_ids) else str(tgt)
                G.add_edge(src_id, tgt_id)
        
        # Sanity check: ensure at least some nodes have non-zero degrees
        if G.number_of_nodes() > 0:
            assert any(G.in_degree(n) > 0 or G.out_degree(n) > 0 for n in G.nodes()), \
                "Graph error: all wallet degrees are zero"
        
        # Build node data for visualization with degrees
        nodes = []
        for idx in subgraph_nodes:
            is_seed = idx in top_k_indices
            ml_score = float(suspicious_scores[idx]) if idx < len(suspicious_scores) else 0.0
            node_id = str(tx_ids[idx]) if idx < len(tx_ids) else str(idx)
            
            # Get degrees from the graph
            in_deg = G.in_degree(node_id) if node_id in G else 0
            out_deg = G.out_degree(node_id) if node_id in G else 0
            
            # Compute heuristic-amplified risk score using degrees + ML
            risk_score = self._compute_wallet_risk(in_deg, out_deg, ml_score)
            risk = self._get_risk_level(risk_score)
            
            nodes.append({
                "id": node_id,
                "index": idx,
                "suspiciousScore": risk_score,  # Use heuristic-amplified score
                "mlScore": ml_score,  # Preserve raw ML score for debugging
                "predictedLabel": "illicit" if (idx < len(predictions) and predictions[idx] == 1) else "licit",
                "riskLevel": risk,
                "risk_level": risk,  # Frontend uses snake_case
                "degree": {"in": in_deg, "out": out_deg},  # Frontend expects nested object
                "isSeedNode": is_seed,
                "type": "suspicious" if is_seed else "neighbor"
            })
        
        # Extract DIRECTED edges within the subgraph (skip reverse edges)
        edges = []
        for i in range(min(num_directed, edge_index.shape[1])):
            src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
            if src in node_set and tgt in node_set:
                src_score = float(suspicious_scores[src])
                tgt_score = float(suspicious_scores[tgt])
                edges.append({
                    "source": str(tx_ids[src]),
                    "target": str(tx_ids[tgt]),
                    "suspicious": src_score > 0.5 or tgt_score > 0.5,
                    "weight": max(src_score, tgt_score)
                })
        
        # Calculate subgraph metadata
        subgraph_scores = suspicious_scores[subgraph_nodes]
        
        return {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "totalNodes": len(nodes),
                "totalEdges": len(edges),
                "seedNodes": len(top_k_indices),
                "hopDistance": hop,
                "avgSuspiciousScore": float(np.mean(subgraph_scores)),
                "maxSuspiciousScore": float(np.max(subgraph_scores)),
                "highRiskCount": int((subgraph_scores > 0.8).sum()),
                "mediumRiskCount": int(((subgraph_scores > 0.5) & (subgraph_scores <= 0.8)).sum()),
                "lowRiskCount": int((subgraph_scores <= 0.5).sum())
            }
        }
    
    def _build_adjacency_list(self, edge_index: np.ndarray, num_nodes: int) -> Dict[int, Set[int]]:
        """Build adjacency list from edge index for efficient neighbor lookup"""
        adj_list = {i: set() for i in range(num_nodes)}
        
        for i in range(edge_index.shape[1]):
            src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
            adj_list[src].add(tgt)
            adj_list[tgt].add(src)  # Treat as undirected for neighborhood extraction
        
        return adj_list
    
    def _bfs_k_hop_neighbors(self, seed: int, adj_list: Dict[int, Set[int]], k: int) -> Set[int]:
        """
        BFS to find all nodes within k hops of seed node
        """
        visited = {seed}
        queue = deque([(seed, 0)])
        
        while queue:
            node, depth = queue.popleft()
            
            if depth < k:
                for neighbor in adj_list.get(node, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, depth + 1))
        
        return visited
    
    def _get_risk_level(self, score: float) -> str:
        """
        Convert suspicious score to risk level.
        
        IMPORTANT: These thresholds are calibrated for heuristic-amplified scores,
        not raw ML probabilities. The compute_wallet_risk() function produces
        scores that jump based on structural anomalies (fan-in/fan-out).
        
        Thresholds:
        - >= 0.65: HIGH (red) - Strong smurfing indicators
        - >= 0.35: MEDIUM (yellow) - Suspicious patterns
        - < 0.35: LOW (green) - Normal activity
        """
        if score >= 0.65:
            return "high"
        elif score >= 0.35:
            return "medium"
        else:
            return "low"
    
    def _compute_wallet_risk(self, in_deg: int, out_deg: int, ml_score: float = 0.0) -> float:
        """
        Compute wallet risk score using heuristic rules + optional ML signal.
        
        WHY HEURISTIC ESCALATION IS REQUIRED:
        - Smurfing detection relies on STRUCTURAL patterns (fan-in/fan-out)
        - ML models trained on limited features produce compressed outputs (~0.5)
        - Smooth normalization causes ALL nodes to appear low-risk
        - Rule-based scoring creates clear separation for visualization
        
        WHY SMOOTH NORMALIZATION FAILS FOR SMURFING:
        - Smurfing = fan-out (scatter) followed by fan-in (gather)
        - This creates nodes with BOTH high in-degree AND high out-degree
        - Normalizing by max_degree compresses the signal
        - We need JUMPS in score, not gradual increases
        
        WHY ML IS A SUPPORTING SIGNAL, NOT PRIMARY:
        - Our ML model expects 166 features but we provide ~6 from custom CSVs
        - Padded features produce near-uniform softmax outputs
        - ML is useful for Elliptic-style datasets with proper features
        - For hackathon demo, structural heuristics are more reliable
        
        Args:
            in_deg: Number of incoming edges (fan-in)
            out_deg: Number of outgoing edges (fan-out)
            ml_score: Raw ML suspicious probability [0, 1]
        
        Returns:
            Risk score [0, 1] with heuristic amplification
        """
        risk = 0.0
        
        # Total activity (used as a proxy for overall transaction volume)
        total_deg = in_deg + out_deg
        
        # === Fan-out detection (scatter pattern) ===
        # Wallets sending to many destinations = potential structuring
        # Thresholds lowered for DIRECTED graphs (was >= 3, now >= 2)
        if out_deg >= 2:
            risk += 0.25
        if out_deg >= 4:
            risk += 0.15  # Additional boost for high fan-out
        
        # === Fan-in detection (gather pattern) ===
        # Wallets receiving from many sources = potential collection point
        if in_deg >= 2:
            risk += 0.25
        if in_deg >= 4:
            risk += 0.15  # Additional boost for high fan-in
        
        # === Smurfing signature: BOTH fan-in AND fan-out ===
        # This is the classic mule wallet pattern
        if in_deg >= 2 and out_deg >= 2:
            risk += 0.20
        
        # === High activity bonus ===
        # Nodes with lots of total connections are more suspicious
        if total_deg >= 4:
            risk += 0.10
        
        # === ML signal as weak supporting evidence ===
        # Weight is low because features are often padded/incomplete
        if ml_score is not None and ml_score > 0:
            risk += 0.10 * ml_score
        
        return min(risk, 1.0)
    
    def analyze_transactions(
        self,
        transactions_df: pd.DataFrame,
        edges_df: Optional[pd.DataFrame] = None
    ) -> Dict:
        """
        Analyze uploaded transactions for money laundering patterns
        
        Full ML Pipeline:
        1. Extract features from transaction data
        2. Build graph structure (edge index)
        3. Run GraphSAGE model for predictions
        4. Extract suspicious subgraph for visualization
        5. Detect money laundering patterns
        6. Identify suspicious addresses
        
        Args:
            transactions_df: DataFrame with transaction data
            edges_df: Optional DataFrame with edge connections
        
        Returns:
            Analysis results including suspicious scores, patterns, and subgraph
        """
        results = {
            "predictions": [],
            "suspicious_addresses": [],
            "patterns": [],
            "subgraph": None,
            "summary": {}
        }
        
        try:
            # Step 1 & 2: Extract features and build graph
            features, tx_ids, edge_index = self._prepare_graph_data(
                transactions_df, edges_df
            )
            
            if features is None:
                return self._fallback_analysis(transactions_df)
            
            # Step 3: Run model prediction
            predictions, scores = self.predict(features, edge_index)
            
            # Step 4: Extract suspicious subgraph for visualization
            subgraph = self.extract_suspicious_subgraph(
                features=features,
                edge_index=edge_index,
                tx_ids=tx_ids,
                top_k=20,
                hop=2
            )
            results["subgraph"] = subgraph
            
            # Build prediction results
            for i, (tx_id, pred, score) in enumerate(zip(tx_ids, predictions, scores)):
                results["predictions"].append({
                    "transactionId": str(tx_id),
                    "predictedLabel": "illicit" if pred == 1 else "licit",
                    "suspiciousScore": float(score),
                    "confidence": float(max(score, 1 - score)),
                    "riskLevel": self._get_risk_level(score)
                })
            
            # Step 5: Detect patterns
            results["patterns"] = self._detect_patterns(
                transactions_df, edge_index, scores, tx_ids
            )
            
            # Step 6: Find suspicious addresses
            results["suspicious_addresses"] = self._find_suspicious_addresses(
                transactions_df, scores, tx_ids
            )
            
            # Summary statistics
            results["summary"] = {
                "totalTransactions": len(tx_ids),
                "suspiciousTransactions": int((scores > 0.5).sum()),
                "highRiskTransactions": int((scores > 0.8).sum()),
                "avgSuspiciousScore": float(scores.mean()),
                "maxSuspiciousScore": float(scores.max()),
                "patternsDetected": len(results["patterns"]),
                "riskDistribution": {
                    "critical": int((scores > 0.9).sum()),
                    "high": int(((scores > 0.7) & (scores <= 0.9)).sum()),
                    "medium": int(((scores > 0.5) & (scores <= 0.7)).sum()),
                    "low": int((scores <= 0.5).sum())
                }
            }
            
        except Exception as e:
            print(f"Error in analyze_transactions: {e}")
            import traceback
            traceback.print_exc()
            return self._fallback_analysis(transactions_df)
        
        return results
    
    def _prepare_graph_data(
        self,
        transactions_df: pd.DataFrame,
        edges_df: Optional[pd.DataFrame]
    ) -> Tuple[Optional[np.ndarray], List, np.ndarray]:
        """
        Prepare graph data (features and edge_index) from transaction data
        
        Handles both:
        - Elliptic-style data (features as columns 1-165, nodes are transactions)
        - Custom transaction data with Source_Wallet_ID/Dest_Wallet_ID (nodes are wallets)
        """
        # Detect if this is a wallet-based dataset
        source_col = None
        target_col = None
        for src_name in ['Source_Wallet_ID', 'source_wallet_id']:
            if src_name in transactions_df.columns:
                source_col = src_name
                break
        for tgt_name in ['Dest_Wallet_ID', 'dest_wallet_id']:
            if tgt_name in transactions_df.columns:
                target_col = tgt_name
                break
        
        if source_col and target_col:
            # Wallet-based graph: nodes are wallets, edges are transactions
            return self._prepare_wallet_graph(transactions_df, source_col, target_col)
        
        # Transaction-based graph (Elliptic-style): nodes are transactions
        # Get transaction IDs
        if 'txId' in transactions_df.columns:
            tx_ids = transactions_df['txId'].values.tolist()
        elif 'transaction_id' in transactions_df.columns:
            tx_ids = transactions_df['transaction_id'].values.tolist()
        elif 'id' in transactions_df.columns:
            tx_ids = transactions_df['id'].values.tolist()
        else:
            tx_ids = list(range(len(transactions_df)))
        
        # Check if this looks like Elliptic dataset format
        # (columns 0: txId, columns 1-165: features)
        numeric_cols = transactions_df.select_dtypes(include=[np.number]).columns.tolist()
        
        # Remove ID columns from features
        feature_cols = [c for c in numeric_cols if c not in ['txId', 'transaction_id', 'id']]
        
        if len(feature_cols) == 0:
            return None, tx_ids, np.array([[0, 0]])
        
        # Extract features
        features = transactions_df[feature_cols].values.astype(np.float32)
        
        # Handle NaN values
        features = np.nan_to_num(features, nan=0.0)
        
        # Build edge index
        edge_index = self._build_edge_index(tx_ids, transactions_df, edges_df)
        
        return features, tx_ids, edge_index
    
    def _prepare_wallet_graph(
        self,
        transactions_df: pd.DataFrame,
        source_col: str,
        target_col: str
    ) -> Tuple[Optional[np.ndarray], List, np.ndarray]:
        """
        Build a wallet-based graph where nodes are wallets and edges are transactions.
        Aggregates transaction features per wallet.
        """
        # Collect all unique wallet IDs
        all_wallets = set(transactions_df[source_col].dropna().astype(str).unique())
        all_wallets.update(transactions_df[target_col].dropna().astype(str).unique())
        wallet_ids = sorted(all_wallets)
        wallet_to_idx = {wallet: idx for idx, wallet in enumerate(wallet_ids)}
        
        num_wallets = len(wallet_ids)
        
        # Build edges from transactions
        sources = []
        targets = []
        for _, row in transactions_df.iterrows():
            src = str(row[source_col]) if pd.notna(row[source_col]) else None
            tgt = str(row[target_col]) if pd.notna(row[target_col]) else None
            
            if src and tgt and src in wallet_to_idx and tgt in wallet_to_idx:
                sources.append(wallet_to_idx[src])
                targets.append(wallet_to_idx[tgt])
        
        # Store the number of DIRECTED edges (before adding reverse)
        num_directed_edges = len(sources)
        
        # Add reverse edges for GNN message passing (undirected for model)
        sources_undirected = sources + targets
        targets_undirected = targets + sources
        
        edge_index = np.array([sources_undirected, targets_undirected], dtype=np.int64)
        
        # Store directed edge count as metadata for visualization
        # This will be used to extract only forward edges when building DiGraph
        self._last_directed_edge_count = num_directed_edges
        
        # Build wallet features by aggregating transaction data
        # Features: [out_degree, in_degree, total_sent, total_received, avg_amount, tx_count]
        amount_col = None
        for col in ['Amount', 'amount', 'value', 'Value']:
            if col in transactions_df.columns:
                amount_col = col
                break
        
        features = np.zeros((num_wallets, self.expected_features), dtype=np.float32)
        
        for _, row in transactions_df.iterrows():
            src = str(row[source_col]) if pd.notna(row[source_col]) else None
            tgt = str(row[target_col]) if pd.notna(row[target_col]) else None
            amt = float(row[amount_col]) if amount_col and pd.notna(row.get(amount_col)) else 1.0
            
            if src and src in wallet_to_idx:
                idx = wallet_to_idx[src]
                features[idx, 0] += 1  # out_degree
                features[idx, 2] += amt  # total_sent
                features[idx, 4] += 1  # tx_count
            
            if tgt and tgt in wallet_to_idx:
                idx = wallet_to_idx[tgt]
                features[idx, 1] += 1  # in_degree
                features[idx, 3] += amt  # total_received
                features[idx, 4] += 1  # tx_count
        
        # Compute derived features
        for i in range(num_wallets):
            tx_count = features[i, 4]
            if tx_count > 0:
                features[i, 5] = (features[i, 2] + features[i, 3]) / tx_count  # avg_amount
        
        # Normalize basic features
        for col in range(6):
            col_max = features[:, col].max()
            if col_max > 0:
                features[:, col] = features[:, col] / col_max
        
        # Enrich with temporal features if timestamps available
        try:
            from temporal_features import enrich_wallet_graph_features
            time_col = None
            for col in ['Timestamp', 'timestamp', 'created_at', 'date', 'time', 'block_timestamp']:
                if col in transactions_df.columns:
                    time_col = col
                    break
            
            if time_col and amount_col:
                features = enrich_wallet_graph_features(
                    transactions_df=transactions_df,
                    existing_features=features,
                    wallet_ids=wallet_ids,
                    source_col=source_col,
                    target_col=target_col,
                    amount_col=amount_col,
                    time_col=time_col,
                )
                print(f"Enriched wallet features with temporal data: {features.shape[1]} features")
        except Exception as e:
            print(f"Temporal feature enrichment skipped: {e}")
        
        return features, wallet_ids, edge_index
    
    def _build_edge_index(
        self,
        tx_ids: List,
        transactions_df: pd.DataFrame,
        edges_df: Optional[pd.DataFrame]
    ) -> np.ndarray:
        """Build edge index from edge data or transaction pairs (for Elliptic-style data)"""
        tx_id_to_idx = {tx_id: idx for idx, tx_id in enumerate(tx_ids)}
        
        sources = []
        targets = []
        
        # Try to use provided edges DataFrame (e.g., Elliptic edgelist)
        if edges_df is not None and len(edges_df) > 0:
            source_col = 'txId1' if 'txId1' in edges_df.columns else 'source'
            target_col = 'txId2' if 'txId2' in edges_df.columns else 'target'
            
            for _, row in edges_df.iterrows():
                src = row.get(source_col)
                tgt = row.get(target_col)
                
                if src in tx_id_to_idx and tgt in tx_id_to_idx:
                    sources.append(tx_id_to_idx[src])
                    targets.append(tx_id_to_idx[tgt])
        
        # Try from_address/to_address columns (connects transactions by shared addresses)
        elif 'from_address' in transactions_df.columns and 'to_address' in transactions_df.columns:
            address_to_txs = {}
            for idx, row in transactions_df.iterrows():
                from_addr = row.get('from_address')
                to_addr = row.get('to_address')
                
                if from_addr:
                    if from_addr not in address_to_txs:
                        address_to_txs[from_addr] = []
                    address_to_txs[from_addr].append(idx)
                
                if to_addr:
                    if to_addr not in address_to_txs:
                        address_to_txs[to_addr] = []
                    address_to_txs[to_addr].append(idx)
            
            # Connect transactions sharing addresses
            for addr, txs in address_to_txs.items():
                for i in range(len(txs)):
                    for j in range(i + 1, len(txs)):
                        if txs[i] in tx_id_to_idx and txs[j] in tx_id_to_idx:
                            sources.append(tx_id_to_idx[txs[i]])
                            targets.append(tx_id_to_idx[txs[j]])
        
        # If no edges found, create self-loops (required for GNN)
        if not sources:
            sources = list(range(len(tx_ids)))
            targets = list(range(len(tx_ids)))
        
        return np.array([sources, targets], dtype=np.int64)
    
    def _find_suspicious_addresses(
        self,
        df: pd.DataFrame,
        scores: np.ndarray,
        tx_ids: List
    ) -> List[Dict]:
        """
        Identify suspicious addresses from predictions
        Groups transactions by address and aggregates risk scores
        """
        suspicious = []
        
        # Get address column
        addr_col = None
        for col in ['address', 'wallet', 'from_address', 'to_address']:
            if col in df.columns:
                addr_col = col
                break
        
        if addr_col is None:
            # If no address column, use transaction IDs as addresses
            # Use LOWER threshold since ML scores are often around 0.45-0.5
            for i, (tx_id, score) in enumerate(zip(tx_ids, scores)):
                # Flag any transaction with score > 0.3 OR in top 20% of scores
                threshold = max(0.3, np.percentile(scores, 80) if len(scores) > 0 else 0.3)
                if score >= threshold:
                    suspicious.append({
                        'address': str(tx_id),
                        'riskLevel': self._get_risk_level(score),
                        'suspiciousScore': float(score),
                        'transactionCount': 1,
                        'avgScore': float(score)
                    })
            return sorted(suspicious, key=lambda x: x['suspiciousScore'], reverse=True)[:100]
        
        # Group by address and aggregate
        df_temp = df.copy()
        df_temp['suspicious_score'] = scores[:len(df_temp)]
        
        address_stats = df_temp.groupby(addr_col).agg({
            'suspicious_score': ['mean', 'max', 'count']
        }).reset_index()
        
        address_stats.columns = ['address', 'avg_score', 'max_score', 'tx_count']
        
        # Filter suspicious addresses using LOWER threshold
        # Also flag addresses with high transaction counts (potential structuring)
        # Handle NaN values safely
        valid_scores = address_stats['max_score'].dropna()
        threshold = 0.3
        if len(valid_scores) > 0:
            q80 = valid_scores.quantile(0.8)
            if not np.isnan(q80):
                threshold = max(0.3, q80)
        
        for _, row in address_stats.iterrows():
            max_score = row['max_score']
            avg_score = row['avg_score']
            tx_count = row['tx_count']
            
            # Handle NaN scores - default to 0.5 if NaN (uncertain)
            if pd.isna(max_score) or np.isnan(max_score):
                max_score = 0.5
            if pd.isna(avg_score) or np.isnan(avg_score):
                avg_score = max_score
            
            is_suspicious = (
                max_score >= threshold or  # Score-based
                tx_count >= 3  # Activity-based (potential structuring)
            )
            if is_suspicious:
                # Boost score based on transaction count (structural indicator)
                activity_boost = min(0.2, tx_count * 0.05) if tx_count >= 3 else 0
                adjusted_score = min(1.0, max_score + activity_boost)
                # Final NaN check
                if np.isnan(adjusted_score):
                    adjusted_score = 0.5
                suspicious.append({
                    'address': str(row['address']),
                    'riskLevel': self._get_risk_level(adjusted_score),
                    'suspiciousScore': float(adjusted_score),
                    'transactionCount': int(tx_count),
                    'avgScore': float(avg_score)
                })
        
        # Sort by score and return top 100
        suspicious.sort(key=lambda x: x['suspiciousScore'], reverse=True)
        return suspicious[:100]
    
    def _detect_patterns(
        self,
        df: pd.DataFrame,
        edge_index: np.ndarray,
        scores: np.ndarray,
        tx_ids: List
    ) -> List[Dict]:
        """
        Detect money laundering patterns:
        - Structuring (Smurfing): Breaking large amounts into small transactions
        - Layering: Complex chains of transactions to obscure origin
        - Fan-out: Single source to multiple destinations
        - Fan-in: Multiple sources to single destination
        """
        patterns = []
        
        # Calculate degree statistics from edge index
        if edge_index.shape[1] > 1:
            out_degree = {}
            in_degree = {}
            
            for i in range(edge_index.shape[1]):
                src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
                out_degree[src] = out_degree.get(src, 0) + 1
                in_degree[tgt] = in_degree.get(tgt, 0) + 1
            
            # Compute heuristic-enhanced scores for each node
            enhanced_scores = np.array([
                self._compute_wallet_risk(
                    in_degree.get(idx, 0),
                    out_degree.get(idx, 0),
                    scores[idx] if idx < len(scores) else 0.0
                )
                for idx in range(len(scores))
            ])
            
            # Pattern 1: Fan-out (potential structuring/smurfing)
            # High out-degree nodes - use LOWER threshold (>= 3) and NO score filter
            # The degree itself IS the evidence
            fan_out_nodes = [
                idx for idx, deg in out_degree.items() 
                if deg >= 3 and idx < len(scores)
            ]
            
            if fan_out_nodes:
                avg_confidence = np.mean([enhanced_scores[n] for n in fan_out_nodes])
                avg_degree = float(np.mean([out_degree[n] for n in fan_out_nodes]))
                patterns.append({
                    'id': f'pattern_structuring_{len(patterns)+1}',
                    'type': 'Structuring',
                    'severity': 'critical' if len(fan_out_nodes) > 10 or avg_degree >= 5 else 'high',
                    'confidence': float(max(avg_confidence, 0.6)),  # 0-1 scale, frontend converts to %
                    'transactions': len(fan_out_nodes),
                    'description': f'Detected {len(fan_out_nodes)} addresses splitting transactions (structuring pattern)',
                    'addresses': [str(tx_ids[n]) for n in fan_out_nodes[:20]],
                    'avgDegree': avg_degree
                })
            
            # Pattern 2: Fan-in (potential layering)
            # High in-degree nodes - use LOWER threshold
            fan_in_nodes = [
                idx for idx, deg in in_degree.items()
                if deg >= 3 and idx < len(scores)
            ]
            
            if fan_in_nodes:
                avg_confidence = np.mean([enhanced_scores[n] for n in fan_in_nodes])
                avg_degree = float(np.mean([in_degree[n] for n in fan_in_nodes]))
                patterns.append({
                    'id': f'pattern_layering_{len(patterns)+1}',
                    'type': 'Layering',
                    'severity': 'critical' if len(fan_in_nodes) > 10 or avg_degree >= 5 else 'high',
                    'confidence': float(max(avg_confidence, 0.6)),  # 0-1 scale, frontend converts to %
                    'transactions': len(fan_in_nodes),
                    'description': f'Detected {len(fan_in_nodes)} addresses aggregating transactions (layering pattern)',
                    'addresses': [str(tx_ids[n]) for n in fan_in_nodes[:20]],
                    'avgDegree': avg_degree
                })
            
            # Pattern 3: Chain patterns (intermediaries)
            # Nodes with similar in and out degree (pass-through nodes) - NO score filter
            chain_nodes = [
                idx for idx in range(len(scores))
                if idx in out_degree and idx in in_degree
                and abs(out_degree[idx] - in_degree[idx]) <= 1
                and out_degree[idx] >= 2
            ]
            
            if chain_nodes:
                avg_confidence = np.mean([enhanced_scores[n] for n in chain_nodes])
                patterns.append({
                    'id': f'pattern_chain_{len(patterns)+1}',
                    'type': 'Chain/Intermediary',
                    'severity': 'high' if len(chain_nodes) > 5 else 'medium',
                    'confidence': float(max(avg_confidence, 0.55)),  # 0-1 scale, frontend converts to %
                    'transactions': len(chain_nodes),
                    'description': f'Detected {len(chain_nodes)} potential intermediary nodes in transaction chains',
                    'addresses': [str(tx_ids[n]) for n in chain_nodes[:20]]
                })
        
        # Pattern 4: Smurfing (use heuristic-enhanced scores)
        # Smurfing = nodes with BOTH fan-in AND fan-out (mule wallets)
        if edge_index.shape[1] > 1:
            smurfing_nodes = [
                idx for idx in range(len(scores))
                if idx in out_degree and idx in in_degree
                and out_degree.get(idx, 0) >= 2 and in_degree.get(idx, 0) >= 2
            ]
            if smurfing_nodes:
                avg_confidence = np.mean([enhanced_scores[n] for n in smurfing_nodes])
                patterns.append({
                    'id': f'pattern_smurfing_{len(patterns)+1}',
                    'type': 'Smurfing',
                    'severity': 'critical',
                    'confidence': float(max(avg_confidence, 0.7)),  # 0-1 scale, frontend converts to %
                    'transactions': len(smurfing_nodes),
                    'description': f'{len(smurfing_nodes)} wallets flagged as potential smurf mules (both receiving and sending multiple transactions)',
                    'addresses': [str(tx_ids[i]) for i in smurfing_nodes[:20]]
                })
        
        return patterns
    
    def _fallback_analysis(self, df: pd.DataFrame) -> Dict:
        """
        Fallback analysis when model cannot be used
        Returns basic statistics without ML predictions
        """
        return {
            "predictions": [],
            "suspicious_addresses": [],
            "patterns": [],
            "subgraph": {"nodes": [], "edges": [], "metadata": {}},
            "summary": {
                "totalTransactions": len(df),
                "suspiciousTransactions": 0,
                "highRiskTransactions": 0,
                "avgSuspiciousScore": 0.0,
                "maxSuspiciousScore": 0.0,
                "patternsDetected": 0,
                "note": "ML model not available - basic analysis only",
                "riskDistribution": {
                    "critical": 0,
                    "high": 0,
                    "medium": 0,
                    "low": len(df)
                }
            }
        }
    
    def get_suspicious_subgraph_from_upload(
        self,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        top_k: int = 20,
        hop: int = 2,
        min_score: float = 0.5
    ) -> Dict:
        """
        Public method to extract suspicious subgraph with additional filtering
        
        Args:
            features: Node feature matrix
            edge_index: Edge connections
            tx_ids: Transaction IDs
            top_k: Number of top suspicious nodes
            hop: Neighborhood hop distance
            min_score: Minimum suspicious score threshold
        
        Returns:
            Subgraph data for visualization
        """
        subgraph = self.extract_suspicious_subgraph(
            features, edge_index, tx_ids, top_k, hop
        )
        
        # Filter nodes by minimum score if specified
        if min_score > 0:
            filtered_nodes = [
                n for n in subgraph['nodes'] 
                if n['suspiciousScore'] >= min_score or n['isSeedNode']
            ]
            node_ids = {n['id'] for n in filtered_nodes}
            filtered_edges = [
                e for e in subgraph['edges']
                if e['source'] in node_ids and e['target'] in node_ids
            ]
            
            subgraph['nodes'] = filtered_nodes
            subgraph['edges'] = filtered_edges
            subgraph['metadata']['filteredByScore'] = min_score
        
        return subgraph

    def explain_node(
        self,
        features: np.ndarray,
        edge_index: np.ndarray,
        tx_ids: List,
        node_idx: int,
    ) -> Optional[Dict]:
        """
        Generate an explanation for why a specific node was flagged.
        Uses the GATv2 attention weights and gradient attribution.
        
        Returns:
            Explanation dict with narrative, feature importance,
            structural patterns, and counterfactual hints.
        """
        if not self.model_loaded:
            return None
        
        try:
            from explainability import ExplainabilityEngine
            
            x = torch.tensor(features, dtype=torch.float)
            ei = torch.tensor(edge_index, dtype=torch.long)
            
            engine = ExplainabilityEngine(
                self.model, x, ei, tx_ids, self.device
            )
            return engine.explain_node(node_idx)
        except Exception as e:
            print(f"Explainability error: {e}")
            return None


# Global service instance and aliases
ml_service = SmurfHunterService()
MLService = SmurfHunterService

