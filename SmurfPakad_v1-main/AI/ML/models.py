# pyright: basic
# type: ignore
"""
SMURF HUNTER v2 - Advanced AML Detection using Graph Neural Networks
=====================================================================
Detects money laundering patterns in blockchain transaction graphs.
Uses Elliptic Bitcoin Dataset for training.

Model Architectures:
  1. GraphSAGE (legacy) - 2-layer mean aggregator, backward compatible
  2. SmurfHunterGNN (new) - Multi-head GATv2 with BatchNorm, residual
     connections, and 3-layer depth for superior pattern detection.

Key Improvements over v1:
  - GATv2 attention heads → learn WHICH neighbor transactions matter
  - Deeper network (3 layers) with skip connections → prevents over-smoothing
  - BatchNorm → faster convergence, better generalization
  - Cosine annealing LR scheduler → smoother optimization landscape
  - Early stopping → prevents overfitting on imbalanced data
  - AUPRC, F1-minority, Recall@FPR metrics → proper AML evaluation
  - Confusion matrix + training curve visualization → presentation-ready
  - Attention weight export → model explainability for investigators
"""
import os
import json
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv, GATv2Conv
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    precision_recall_curve,
    average_precision_score,
    f1_score,
    confusion_matrix,
    roc_curve,
    roc_auc_score,
    classification_report,
)
from typing import Tuple, Dict, List, Optional
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import networkx as nx

DATASET_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'Backend', 'dataset')


# =============================================================================
# Model Architectures
# =============================================================================

class GraphSAGE(torch.nn.Module):
    """
    Legacy GraphSAGE model (backward compatible with v1 weights).
    Kept so existing smurf_hunter_model.pt can still be loaded.
    """
    def __init__(self, in_channels: int, hidden_channels: int = 64, out_channels: int = 2, dropout: float = 0.3):
        super().__init__()
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


class SmurfHunterGNN(torch.nn.Module):
    """
    Advanced GNN for AML detection using multi-head GATv2 attention.

    Architecture:
      Input (166 features)
        → GATv2 Layer 1 (multi-head attention, 4 heads × 32 = 128 dims)
        → BatchNorm + ELU + Dropout
        → GATv2 Layer 2 (4 heads × 32 = 128 dims) + Residual Skip
        → BatchNorm + ELU + Dropout
        → GATv2 Layer 3 (1 head → 64 dims, for final aggregation)
        → BatchNorm + ELU
        → MLP Head (64 → 32 → 2)

    Why GATv2 over GraphSAGE:
      - Attention learns WHICH neighbor transactions are important
      - Multi-head attention captures diverse relationship patterns
      - Attention weights are exportable for explainability
      - GATv2 (Brody et al. 2022) fixes expressivity issues in GATv1

    Why Residual Connections:
      - Prevents over-smoothing in 3+ layer GNNs
      - Preserves node identity through message passing
      - Enables training deeper networks without degradation
    """
    def __init__(
        self,
        in_channels: int,
        hidden_channels: int = 128,
        out_channels: int = 2,
        heads: int = 4,
        num_layers: int = 3,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.num_layers = num_layers
        self.dropout = dropout

        # Store attention weights for explainability
        self._attention_weights: List[Optional[torch.Tensor]] = [None] * num_layers

        # Per-head dimension (total hidden = heads * head_dim)
        head_dim = hidden_channels // heads

        # Input projection to align dimensions for residual connections
        self.input_proj = nn.Linear(in_channels, heads * head_dim)

        # GATv2 convolution layers
        self.convs = nn.ModuleList()
        self.norms = nn.ModuleList()

        # Layer 1: in_channels → heads * head_dim
        self.convs.append(GATv2Conv(
            in_channels, head_dim, heads=heads,
            dropout=dropout, add_self_loops=True, concat=True
        ))
        self.norms.append(nn.BatchNorm1d(heads * head_dim))

        # Intermediate layers: heads*head_dim → heads*head_dim (with residual)
        for _ in range(1, num_layers - 1):
            self.convs.append(GATv2Conv(
                heads * head_dim, head_dim, heads=heads,
                dropout=dropout, add_self_loops=True, concat=True
            ))
            self.norms.append(nn.BatchNorm1d(heads * head_dim))

        # Final GATv2 layer: heads*head_dim → hidden_channels (single head)
        final_out = hidden_channels // 2  # Compress before MLP
        self.convs.append(GATv2Conv(
            heads * head_dim, final_out, heads=1,
            dropout=dropout, add_self_loops=True, concat=False
        ))
        self.norms.append(nn.BatchNorm1d(final_out))

        # MLP classification head
        self.mlp = nn.Sequential(
            nn.Linear(final_out, final_out // 2),
            nn.ELU(),
            nn.Dropout(dropout),
            nn.Linear(final_out // 2, out_channels),
        )

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        # Input projection for residual path
        residual = self.input_proj(x)

        for i, (conv, norm) in enumerate(zip(self.convs, self.norms)):
            # GATv2 forward with attention weight capture
            x_out, attn_w = conv(
                x if i == 0 else h,
                edge_index,
                return_attention_weights=True,
            )
            # attn_w is (edge_index, attention_coefficients) tuple
            self._attention_weights[i] = attn_w[1].detach() if attn_w is not None else None

            h = norm(x_out)
            h = F.elu(h)
            h = F.dropout(h, p=self.dropout, training=self.training)

            # Residual connection for intermediate layers (same dimensionality)
            if 0 < i < self.num_layers - 1:
                h = h + residual
            elif i == 0:
                residual = h  # Update residual to match projected dimension

        # MLP classification head
        out = self.mlp(h)
        return out

    def get_embeddings(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        """Get intermediate node embeddings (before MLP head) for visualization."""
        residual = self.input_proj(x)

        for i, (conv, norm) in enumerate(zip(self.convs, self.norms)):
            x_out = conv(x if i == 0 else h, edge_index)
            h = norm(x_out)
            h = F.elu(h)

            if 0 < i < self.num_layers - 1:
                h = h + residual
            elif i == 0:
                residual = h

        return h  # Return pre-MLP embeddings

    def get_attention_weights(self) -> List[Optional[torch.Tensor]]:
        """
        Return attention weights from the last forward pass.
        Useful for model explainability — shows which edges the model
        focused on when making predictions.
        """
        return self._attention_weights


# =============================================================================
# Dataset Loading & Graph Construction
# =============================================================================

def load_elliptic_dataset(dataset_path: str = DATASET_PATH) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    features_df = pd.read_csv(
        os.path.join(dataset_path, 'elliptic_txs_features.csv'),
        header=None
    )

    edges_df = pd.read_csv(
        os.path.join(dataset_path, 'elliptic_txs_edgelist.csv')
    )

    classes_df = pd.read_csv(
        os.path.join(dataset_path, 'elliptic_txs_classes.csv')
    )

    return features_df, edges_df, classes_df


def build_graph_data(
    features_df: pd.DataFrame,
    edges_df: pd.DataFrame,
    classes_df: pd.DataFrame,
    clip_value: float = 5.0
) -> Tuple[Data, Dict[int, int], List[int]]:

    tx_ids = features_df.iloc[:, 0].values
    tx_id_to_idx = {tx_id: idx for idx, tx_id in enumerate(tx_ids)}

    # Column 1 of Elliptic is the timestep (1-49), columns 2-166 are features.
    # We use ALL columns 1-166 as input features (the timestep is useful context).
    node_features = features_df.iloc[:, 1:].values.astype(np.float32)
    node_features = np.clip(node_features, -clip_value, clip_value)
    x = torch.tensor(node_features, dtype=torch.float)

    valid_edges = edges_df[
        edges_df['txId1'].isin(tx_id_to_idx) &
        edges_df['txId2'].isin(tx_id_to_idx)
    ]

    source_nodes = valid_edges['txId1'].map(tx_id_to_idx).values
    target_nodes = valid_edges['txId2'].map(tx_id_to_idx).values
    edge_index = torch.tensor(np.array([source_nodes, target_nodes]), dtype=torch.long)

    y = torch.full((len(tx_ids),), -1, dtype=torch.long)

    for _, row in classes_df.iterrows():
        tx_id = row['txId']
        label = row['class']

        if tx_id in tx_id_to_idx:
            idx = tx_id_to_idx[tx_id]
            if label == '1' or label == 1:
                y[idx] = 1  # illicit
            elif label == '2' or label == 2:
                y[idx] = 0  # licit

    data = Data(x=x, edge_index=edge_index, y=y)

    return data, tx_id_to_idx, tx_ids.tolist()


def create_masks(
    data: Data,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    seed: int = 42
) -> Data:

    labeled_mask = data.y >= 0
    labeled_indices = torch.where(labeled_mask)[0].numpy()
    labels = data.y[labeled_mask].numpy()

    train_idx, temp_idx, train_labels, temp_labels = train_test_split(
        labeled_indices, labels,
        train_size=train_ratio,
        stratify=labels,
        random_state=seed
    )

    val_size = val_ratio / (1 - train_ratio)
    val_idx, test_idx = train_test_split(
        temp_idx,
        train_size=val_size,
        stratify=temp_labels,
        random_state=seed
    )

    num_nodes = data.x.size(0)

    train_mask = torch.zeros(num_nodes, dtype=torch.bool)
    val_mask = torch.zeros(num_nodes, dtype=torch.bool)
    test_mask = torch.zeros(num_nodes, dtype=torch.bool)

    train_mask[train_idx] = True
    val_mask[val_idx] = True
    test_mask[test_idx] = True

    data.train_mask = train_mask
    data.val_mask = val_mask
    data.test_mask = test_mask

    return data


# =============================================================================
# Training Utilities
# =============================================================================

def compute_class_weights(data: Data) -> torch.Tensor:
    labeled_mask = data.y >= 0
    labels = data.y[labeled_mask]

    num_licit = (labels == 0).sum().item()
    num_illicit = (labels == 1).sum().item()
    total = num_licit + num_illicit

    weight_licit = total / (2.0 * num_licit) if num_licit > 0 else 1.0
    weight_illicit = total / (2.0 * num_illicit) if num_illicit > 0 else 1.0

    return torch.tensor([weight_licit, weight_illicit], dtype=torch.float)


def train_epoch(
    model: nn.Module,
    data: Data,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    class_weights: Optional[torch.Tensor] = None
) -> float:

    model.train()
    optimizer.zero_grad()

    out = model(data.x.to(device), data.edge_index.to(device))

    # Logit clamping for numerical stability
    out = torch.clamp(out, min=-10.0, max=10.0)

    train_mask = data.train_mask.to(device)
    y_train = data.y.to(device)[train_mask]
    out_train = out[train_mask]

    if class_weights is not None:
        class_weights = class_weights.to(device)
        loss = F.cross_entropy(out_train, y_train, weight=class_weights)
    else:
        loss = F.cross_entropy(out_train, y_train)

    # NaN loss guard: stop training if loss is NaN
    if torch.isnan(loss):
        raise ValueError("NaN loss detected — training stopped to prevent model corruption")

    loss.backward()

    # Gradient clipping for numerical stability
    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

    optimizer.step()

    return loss.item()


# =============================================================================
# Evaluation Metrics (Enhanced for AML)
# =============================================================================

@torch.no_grad()
def evaluate(
    model: nn.Module,
    data: Data,
    mask: torch.Tensor,
    device: torch.device
) -> Tuple[float, float]:

    model.eval()

    out = model(data.x.to(device), data.edge_index.to(device))
    # Numerical stability fix: sanitize logits before softmax
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    pred = out.argmax(dim=1)
    probs = F.softmax(out, dim=1)[:, 1]
    # Probability safety: clamp to safe range
    probs = torch.clamp(probs, 1e-6, 1 - 1e-6)

    mask = mask.to(device)
    y_true = data.y.to(device)[mask]
    y_pred = pred[mask]
    y_probs = probs[mask]

    correct = (y_pred == y_true).sum().item()
    total = mask.sum().item()
    accuracy = correct / total if total > 0 else 0

    sorted_indices = torch.argsort(y_probs, descending=True)
    top_k = min(100, len(sorted_indices))
    top_k_labels = y_true[sorted_indices[:top_k]]
    precision_at_k = (top_k_labels == 1).sum().item() / top_k if top_k > 0 else 0

    return accuracy, precision_at_k


@torch.no_grad()
def evaluate_full_metrics(
    model: nn.Module,
    data: Data,
    mask: torch.Tensor,
    device: torch.device,
) -> Dict:
    """
    Comprehensive AML evaluation metrics including:
    - Accuracy, Precision, Recall, F1 (overall + per-class)
    - AUPRC (Average Precision) — critical for imbalanced AML data
    - ROC-AUC
    - Recall@FPR=1% — "catch rate at low false alarm rate"
    - Precision@K for various K values
    - Confusion matrix
    """
    model.eval()

    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    probs = F.softmax(out, dim=1)[:, 1]
    probs = torch.clamp(probs, 1e-6, 1 - 1e-6)
    preds = out.argmax(dim=1)

    mask = mask.to(device)
    y_true = data.y.to(device)[mask].cpu().numpy()
    y_pred = preds[mask].cpu().numpy()
    y_probs = probs[mask].cpu().numpy()

    # Basic metrics
    accuracy = (y_pred == y_true).mean()

    # Per-class F1
    f1_illicit = f1_score(y_true, y_pred, pos_label=1, zero_division=0)
    f1_licit = f1_score(y_true, y_pred, pos_label=0, zero_division=0)
    f1_macro = f1_score(y_true, y_pred, average='macro', zero_division=0)

    # AUPRC (Average Precision) — THE key metric for imbalanced AML
    auprc = average_precision_score(y_true, y_probs)

    # ROC-AUC
    roc_auc = roc_auc_score(y_true, y_probs)

    # Recall@FPR=1% — how many illicit TXs caught at 1% false positive rate
    fpr, tpr, thresholds = roc_curve(y_true, y_probs)
    recall_at_1pct_fpr = 0.0
    for f, t in zip(fpr, tpr):
        if f <= 0.01:
            recall_at_1pct_fpr = t
        else:
            break

    # Precision@K
    sorted_indices = np.argsort(y_probs)[::-1]
    precision_at_k = {}
    for k in [20, 50, 100, 200]:
        top_k = min(k, len(sorted_indices))
        top_k_labels = y_true[sorted_indices[:top_k]]
        precision_at_k[k] = (top_k_labels == 1).sum() / top_k if top_k > 0 else 0

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred)

    # Full classification report
    report = classification_report(y_true, y_pred, target_names=['Licit', 'Illicit'], output_dict=True)

    return {
        'accuracy': float(accuracy),
        'f1_illicit': float(f1_illicit),
        'f1_licit': float(f1_licit),
        'f1_macro': float(f1_macro),
        'auprc': float(auprc),
        'roc_auc': float(roc_auc),
        'recall_at_1pct_fpr': float(recall_at_1pct_fpr),
        'precision_at_k': {k: float(v) for k, v in precision_at_k.items()},
        'confusion_matrix': cm.tolist(),
        'classification_report': report,
        'y_true': y_true,
        'y_probs': y_probs,
        'y_pred': y_pred,
    }


@torch.no_grad()
def compute_precision_at_k(
    model: nn.Module,
    data: Data,
    mask: torch.Tensor,
    device: torch.device,
    k_values: List[int] = [20, 50, 100]
) -> Dict[int, float]:

    model.eval()

    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    probs = F.softmax(out, dim=1)[:, 1]
    probs = torch.clamp(probs, 1e-6, 1 - 1e-6)

    mask = mask.to(device)
    y_true = data.y.to(device)[mask]
    y_probs = probs[mask]

    sorted_indices = torch.argsort(y_probs, descending=True)

    precision_at_k = {}
    for k in k_values:
        top_k = min(k, len(sorted_indices))
        top_k_labels = y_true[sorted_indices[:top_k]]
        precision_at_k[k] = (top_k_labels == 1).sum().item() / top_k if top_k > 0 else 0

    return precision_at_k


@torch.no_grad()
def get_suspicious_scores(
    model: nn.Module,
    data: Data,
    tx_ids: List[int],
    device: torch.device,
    top_k: int = 20
) -> pd.DataFrame:

    model.eval()

    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    probs = F.softmax(out, dim=1)[:, 1]
    probs = torch.clamp(probs, 1e-6, 1 - 1e-6).cpu().numpy()

    results = pd.DataFrame({
        'txId': tx_ids,
        'suspicious_score': probs,
        'label': data.y.numpy()
    })

    results['label_str'] = results['label'].map({0: 'licit', 1: 'illicit', -1: 'unknown'})
    # Reporting fix: exclude unknown labels (-1) from Top-K display
    results_known = results[results['label'] != -1]
    results_known = results_known.sort_values('suspicious_score', ascending=False)

    return results_known.head(top_k)


@torch.no_grad()
def get_all_suspicious_scores(
    model: nn.Module,
    data: Data,
    device: torch.device
) -> np.ndarray:
    """Get suspicious scores for ALL nodes in the graph."""
    model.eval()
    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    probs = F.softmax(out, dim=1)[:, 1]
    probs = torch.clamp(probs, 1e-6, 1 - 1e-6).cpu().numpy()
    return probs


# =============================================================================
# Pattern Detection
# =============================================================================

def detect_fan_patterns(
    data: Data,
    tx_id_to_idx: Dict[int, int],
    min_fan_out: int = 3,
    min_fan_in: int = 3
) -> Tuple[List[int], List[int]]:

    idx_to_tx_id = {idx: tx_id for tx_id, idx in tx_id_to_idx.items()}

    edge_index = data.edge_index.numpy()

    out_degree = {}
    in_degree = {}

    for src, dst in zip(edge_index[0], edge_index[1]):
        out_degree[src] = out_degree.get(src, 0) + 1
        in_degree[dst] = in_degree.get(dst, 0) + 1

    fan_out_nodes = [idx_to_tx_id[idx] for idx, deg in out_degree.items() if deg >= min_fan_out and idx in idx_to_tx_id]
    fan_in_nodes = [idx_to_tx_id[idx] for idx, deg in in_degree.items() if deg >= min_fan_in and idx in idx_to_tx_id]

    return fan_out_nodes, fan_in_nodes


# =============================================================================
# Visualization
# =============================================================================

def visualize_laundering_subgraph(
    data: Data,
    tx_ids: List[int],
    suspicious_scores: np.ndarray,
    tx_id_to_idx: Dict[int, int],
    output_path: Optional[str] = None,
    top_k: int = 20,
    hop: int = 2,
    suspicious_threshold: float = 0.7
) -> nx.DiGraph:
    """
    Extract and visualize suspicious laundering subgraphs for interpretability.
    """
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), 'laundering_graph.png')

    idx_to_tx_id = {idx: tx_id for tx_id, idx in tx_id_to_idx.items()}

    top_k_indices = np.argsort(suspicious_scores)[-top_k:][::-1]
    top_k_scores = suspicious_scores[top_k_indices]

    print(f"Top {top_k} suspicious nodes selected (scores: {top_k_scores.min():.4f} - {top_k_scores.max():.4f})")

    edge_index = data.edge_index.numpy()
    full_graph = nx.DiGraph()
    full_graph.add_edges_from(zip(edge_index[0], edge_index[1]))

    subgraph_nodes = set()
    for node_idx in top_k_indices:
        if node_idx in full_graph:
            ego_nodes = {node_idx}
            frontier = {node_idx}

            for _ in range(hop):
                new_frontier = set()
                for n in frontier:
                    if n in full_graph:
                        new_frontier.update(full_graph.successors(n))
                        new_frontier.update(full_graph.predecessors(n))
                new_frontier -= ego_nodes
                ego_nodes.update(new_frontier)
                frontier = new_frontier

            subgraph_nodes.update(ego_nodes)

    subgraph_edges = [
        (src, dst) for src, dst in zip(edge_index[0], edge_index[1])
        if src in subgraph_nodes and dst in subgraph_nodes
    ]

    G = nx.DiGraph()
    G.add_edges_from(subgraph_edges)

    isolated = list(nx.isolates(G))
    G.remove_nodes_from(isolated)

    if G.number_of_nodes() == 0:
        print("Warning: Subgraph is empty after removing isolated nodes")
        return G

    print(f"Subgraph extracted: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    node_colors = []
    node_sizes = []
    node_borders = []
    node_border_widths = []

    top_k_set = set(top_k_indices)
    score_min = suspicious_scores[list(G.nodes())].min()
    score_max = suspicious_scores[list(G.nodes())].max()

    for node in G.nodes():
        label = data.y[node].item()
        if label == 1:
            node_colors.append('#ff4444')
        elif label == 0:
            node_colors.append('#44cc44')
        else:
            node_colors.append('#888888')

        score = suspicious_scores[node]
        if score_max > score_min:
            normalized_score = (score - score_min) / (score_max - score_min)
        else:
            normalized_score = 0.5
        node_sizes.append(100 + 400 * normalized_score)

        if node in top_k_set:
            node_borders.append('#000000')
            node_border_widths.append(2.5)
        else:
            node_borders.append('#444444')
            node_border_widths.append(0.5)

    edge_widths = []
    edge_colors = []

    for src, dst in G.edges():
        src_score = suspicious_scores[src]
        dst_score = suspicious_scores[dst]

        if src_score > suspicious_threshold and dst_score > suspicious_threshold:
            edge_widths.append(2.0)
            edge_colors.append('#ff6666')
        elif src_score > suspicious_threshold or dst_score > suspicious_threshold:
            edge_widths.append(1.2)
            edge_colors.append('#999999')
        else:
            edge_widths.append(0.5)
            edge_colors.append('#cccccc')

    plt.figure(figsize=(18, 14))
    pos = nx.spring_layout(G, k=1.5, iterations=100, seed=42)

    nx.draw_networkx_edges(
        G, pos,
        edge_color=edge_colors,
        width=edge_widths,
        arrows=True,
        arrowsize=12,
        arrowstyle='-|>',
        connectionstyle='arc3,rad=0.1',
        alpha=0.6,
        min_source_margin=10,
        min_target_margin=10
    )

    nx.draw_networkx_nodes(
        G, pos,
        node_color=node_colors,
        node_size=node_sizes,
        edgecolors=node_borders,
        linewidths=node_border_widths,
        alpha=0.85
    )

    labels = {}
    for node in top_k_indices:
        if node in G.nodes():
            tx_id = idx_to_tx_id.get(node, node)
            score = suspicious_scores[node]
            labels[node] = f"{str(tx_id)[:6]}\n{score:.2f}"

    nx.draw_networkx_labels(G, pos, labels=labels, font_size=7, font_color='black', font_weight='bold')

    legend_elements = [
        plt.scatter([], [], c='#ff4444', s=150, edgecolors='black', linewidths=2, label='Illicit (known)'),
        plt.scatter([], [], c='#44cc44', s=150, edgecolors='black', linewidths=2, label='Licit (known)'),
        plt.scatter([], [], c='#888888', s=150, edgecolors='black', linewidths=2, label='Unknown'),
        plt.scatter([], [], c='white', s=80, edgecolors='black', linewidths=2.5, label='Top-K Suspicious (border)'),
        Line2D([0], [0], color='#ff6666', linewidth=2.5, label='High-risk edge'),
        Line2D([0], [0], color='#cccccc', linewidth=1, label='Normal edge'),
    ]

    size_legend = [
        plt.scatter([], [], c='gray', s=100, alpha=0.5, label='Low score'),
        plt.scatter([], [], c='gray', s=300, alpha=0.5, label='Medium score'),
        plt.scatter([], [], c='gray', s=500, alpha=0.5, label='High score'),
    ]

    legend1 = plt.legend(handles=legend_elements, loc='upper left', title='Node & Edge Types', fontsize=9, title_fontsize=10)
    plt.gca().add_artist(legend1)
    plt.legend(handles=size_legend, loc='lower left', title='Suspicious Score (size)', fontsize=9, title_fontsize=10)

    plt.title(
        f'Detected Laundering Subgraph (Top {top_k} Suspicious Transactions)\n'
        f'{G.number_of_nodes()} nodes, {G.number_of_edges()} edges | {hop}-hop ego networks',
        fontsize=14, fontweight='bold'
    )

    plt.axis('off')
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()

    print(f"\nVisualization saved to: {output_path}")

    illicit_in_subgraph = sum(1 for n in G.nodes() if data.y[n].item() == 1)
    licit_in_subgraph = sum(1 for n in G.nodes() if data.y[n].item() == 0)
    unknown_in_subgraph = sum(1 for n in G.nodes() if data.y[n].item() == -1)

    print(f"\nSubgraph composition:")
    print(f"  Illicit nodes: {illicit_in_subgraph} ({illicit_in_subgraph/G.number_of_nodes()*100:.1f}%)")
    print(f"  Licit nodes: {licit_in_subgraph} ({licit_in_subgraph/G.number_of_nodes()*100:.1f}%)")
    print(f"  Unknown nodes: {unknown_in_subgraph} ({unknown_in_subgraph/G.number_of_nodes()*100:.1f}%)")

    return G


def visualize_training_curves(metrics_history: Dict, output_path: Optional[str] = None):
    """
    Generate presentation-quality training curves with loss, accuracy,
    and precision@K subplots.
    """
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), 'training_curves.png')

    fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    epochs = range(1, len(metrics_history['train_loss']) + 1)

    # Loss curve
    axes[0].plot(epochs, metrics_history['train_loss'], color='#e74c3c', linewidth=2)
    axes[0].set_title('Training Loss', fontsize=14, fontweight='bold')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Cross-Entropy Loss')
    axes[0].grid(True, alpha=0.3)

    # Accuracy curve
    axes[1].plot(epochs, metrics_history['val_acc'], color='#3498db', linewidth=2)
    axes[1].set_title('Validation Accuracy', fontsize=14, fontweight='bold')
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('Accuracy')
    axes[1].set_ylim([0.8, 1.0])
    axes[1].grid(True, alpha=0.3)

    # Precision@K curve
    axes[2].plot(epochs, metrics_history['val_prec_at_k'], color='#2ecc71', linewidth=2)
    axes[2].set_title('Validation Precision@100', fontsize=14, fontweight='bold')
    axes[2].set_xlabel('Epoch')
    axes[2].set_ylabel('P@100')
    axes[2].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()
    print(f"Training curves saved to: {output_path}")


def visualize_confusion_matrix(cm: List[List[int]], output_path: Optional[str] = None):
    """Generate a clean confusion matrix heatmap for presentations."""
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), 'confusion_matrix.png')

    cm_arr = np.array(cm)
    fig, ax = plt.subplots(figsize=(8, 6))

    im = ax.imshow(cm_arr, cmap='Blues', interpolation='nearest')
    plt.colorbar(im, ax=ax)

    labels = ['Licit', 'Illicit']
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(labels, fontsize=12)
    ax.set_yticklabels(labels, fontsize=12)

    # Annotate cells
    for i in range(2):
        for j in range(2):
            color = 'white' if cm_arr[i, j] > cm_arr.max() / 2 else 'black'
            ax.text(j, i, f'{cm_arr[i, j]:,}',
                    ha='center', va='center', fontsize=16, fontweight='bold', color=color)

    ax.set_xlabel('Predicted Label', fontsize=14, fontweight='bold')
    ax.set_ylabel('True Label', fontsize=14, fontweight='bold')
    ax.set_title('Confusion Matrix — Smurf Hunter v2', fontsize=14, fontweight='bold')

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()
    print(f"Confusion matrix saved to: {output_path}")


def visualize_precision_recall_curve(y_true: np.ndarray, y_probs: np.ndarray, output_path: Optional[str] = None):
    """Generate Precision-Recall curve (critical for imbalanced AML data)."""
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), 'precision_recall_curve.png')

    precision, recall, _ = precision_recall_curve(y_true, y_probs)
    auprc = average_precision_score(y_true, y_probs)

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(recall, precision, color='#e74c3c', linewidth=2, label=f'Smurf Hunter v2 (AUPRC = {auprc:.4f})')
    ax.fill_between(recall, precision, alpha=0.1, color='#e74c3c')

    # Baseline (random classifier)
    baseline = y_true.mean()
    ax.axhline(y=baseline, color='gray', linestyle='--', label=f'Random baseline ({baseline:.4f})')

    ax.set_xlabel('Recall (True Positive Rate)', fontsize=12)
    ax.set_ylabel('Precision', fontsize=12)
    ax.set_title('Precision-Recall Curve — AML Detection', fontsize=14, fontweight='bold')
    ax.legend(loc='upper right', fontsize=11)
    ax.grid(True, alpha=0.3)
    ax.set_xlim([0, 1])
    ax.set_ylim([0, 1.05])

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()
    print(f"Precision-Recall curve saved to: {output_path}")


def visualize_roc_curve(y_true: np.ndarray, y_probs: np.ndarray, output_path: Optional[str] = None):
    """Generate ROC curve."""
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), 'roc_curve.png')

    fpr, tpr, _ = roc_curve(y_true, y_probs)
    auc = roc_auc_score(y_true, y_probs)

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(fpr, tpr, color='#3498db', linewidth=2, label=f'Smurf Hunter v2 (AUC = {auc:.4f})')
    ax.fill_between(fpr, tpr, alpha=0.1, color='#3498db')
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.5, label='Random baseline')

    ax.set_xlabel('False Positive Rate', fontsize=12)
    ax.set_ylabel('True Positive Rate (Recall)', fontsize=12)
    ax.set_title('ROC Curve — AML Detection', fontsize=14, fontweight='bold')
    ax.legend(loc='lower right', fontsize=11)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()
    print(f"ROC curve saved to: {output_path}")


# =============================================================================
# Training Pipeline
# =============================================================================

def train_model(
    epochs: int = 200,
    hidden_dim: int = 128,
    heads: int = 4,
    num_layers: int = 3,
    lr: float = 0.005,
    dropout: float = 0.3,
    clip_value: float = 5.0,
    patience: int = 30,
    model_type: str = 'gatv2',
    device: Optional[str] = None
) -> Tuple[nn.Module, Data, List[int], Dict]:
    """
    Train the Smurf Hunter GNN model.

    Args:
        epochs: Maximum training epochs (early stopping may end sooner)
        hidden_dim: Hidden layer dimension (128 for GATv2, 64 for GraphSAGE)
        heads: Number of attention heads (GATv2 only)
        num_layers: Number of GNN layers (GATv2 only)
        lr: Initial learning rate
        dropout: Dropout probability
        clip_value: Feature clipping range [-clip, clip]
        patience: Early stopping patience (epochs without improvement)
        model_type: 'gatv2' for SmurfHunterGNN or 'graphsage' for legacy model
        device: 'cuda' or 'cpu' (auto-detected if None)

    Returns:
        (model, data, tx_ids, metrics_history)
    """
    if device is None:
        torch_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    else:
        torch_device = torch.device(device)

    print(f"{'='*60}")
    print(f"SMURF HUNTER v2 — Training Pipeline")
    print(f"{'='*60}")
    print(f"Model: {model_type.upper()}")
    print(f"Device: {torch_device}")
    print(f"Epochs: {epochs} (early stopping patience: {patience})")
    print(f"Hidden: {hidden_dim}, Heads: {heads}, Layers: {num_layers}")
    print(f"LR: {lr}, Dropout: {dropout}")
    print()

    print("Loading dataset...")
    features_df, edges_df, classes_df = load_elliptic_dataset()

    print("Building graph...")
    data, tx_id_to_idx, tx_ids = build_graph_data(features_df, edges_df, classes_df, clip_value=clip_value)

    print(f"Graph stats:")
    print(f"  Nodes: {data.x.size(0):,}")
    print(f"  Edges: {data.edge_index.size(1):,}")
    print(f"  Features: {data.x.size(1)}")
    print(f"  Labeled nodes: {(data.y >= 0).sum().item():,}")
    print(f"  Illicit: {(data.y == 1).sum().item():,}")
    print(f"  Licit: {(data.y == 0).sum().item():,}")
    print(f"  Unknown: {(data.y == -1).sum().item():,}")

    print("\nCreating train/val/test splits...")
    data = create_masks(data)

    # Label distribution logging for diagnostics
    train_labels = data.y[data.train_mask]
    val_labels = data.y[data.val_mask]
    test_labels = data.y[data.test_mask]
    print(f"Train: {(train_labels == 0).sum().item()} licit, {(train_labels == 1).sum().item()} illicit")
    print(f"Val:   {(val_labels == 0).sum().item()} licit, {(val_labels == 1).sum().item()} illicit")
    print(f"Test:  {(test_labels == 0).sum().item()} licit, {(test_labels == 1).sum().item()} illicit")

    in_channels = data.x.size(1)

    # Create model based on type
    if model_type == 'gatv2':
        model = SmurfHunterGNN(
            in_channels=in_channels,
            hidden_channels=hidden_dim,
            out_channels=2,
            heads=heads,
            num_layers=num_layers,
            dropout=dropout,
        ).to(torch_device)
    else:
        model = GraphSAGE(
            in_channels=in_channels,
            hidden_channels=hidden_dim,
            out_channels=2,
            dropout=dropout,
        ).to(torch_device)

    # Count parameters
    num_params = sum(p.numel() for p in model.parameters())
    print(f"\nModel parameters: {num_params:,}")

    # Optimizer with weight decay (L2 regularization)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=5e-4)

    # Cosine annealing LR scheduler for smoother optimization
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=lr * 0.01)

    class_weights = compute_class_weights(data)
    print(f"Class weights — Licit: {class_weights[0]:.4f}, Illicit: {class_weights[1]:.4f}")

    print(f"\nTraining for up to {epochs} epochs (early stopping patience: {patience})...")
    print("-" * 70)

    best_val_f1 = 0
    best_val_prec = 0
    best_model_state = None
    epochs_without_improvement = 0
    metrics_history = {'train_loss': [], 'val_acc': [], 'val_prec_at_k': [], 'lr': []}

    try:
        for epoch in range(1, epochs + 1):
            loss = train_epoch(model, data, optimizer, torch_device, class_weights)
            val_acc, val_prec = evaluate(model, data, data.val_mask, torch_device)

            current_lr = optimizer.param_groups[0]['lr']
            metrics_history['train_loss'].append(loss)
            metrics_history['val_acc'].append(val_acc)
            metrics_history['val_prec_at_k'].append(val_prec)
            metrics_history['lr'].append(current_lr)

            # Track best model by P@100 (primary AML metric)
            if val_prec > best_val_prec:
                best_val_prec = val_prec
                best_model_state = {k: v.clone() for k, v in model.state_dict().items()}
                epochs_without_improvement = 0
            else:
                epochs_without_improvement += 1

            # Step the scheduler
            scheduler.step()

            if epoch % 10 == 0 or epoch == 1:
                print(f"Epoch {epoch:03d} | Loss: {loss:.4f} | Val Acc: {val_acc:.4f} | "
                      f"Val P@100: {val_prec:.4f} | LR: {current_lr:.6f}")

            # Early stopping
            if epochs_without_improvement >= patience:
                print(f"\n⚡ Early stopping at epoch {epoch} (no improvement for {patience} epochs)")
                break

    except ValueError as e:
        # Catch NaN-related exceptions from train_epoch
        print(f"\n{e}")
        if best_model_state is not None:
            print("Restoring best model state before NaN occurred.")
            model.load_state_dict(best_model_state)

    if best_model_state is not None:
        model.load_state_dict(best_model_state)

    print("-" * 70)

    # =========================================================================
    # Comprehensive Test Evaluation
    # =========================================================================
    test_labels = data.y[data.test_mask]
    num_test_illicit = (test_labels == 1).sum().item()
    num_test_licit = (test_labels == 0).sum().item()

    print(f"\n{'='*60}")
    print("TEST RESULTS REPORT — SMURF HUNTER v2")
    print(f"{'='*60}")
    print(f"Model: {model_type.upper()}")
    print(f"Best epoch (by P@100): trained for {len(metrics_history['train_loss'])} epochs")

    # Full evaluation
    full_metrics = evaluate_full_metrics(model, data, data.test_mask, torch_device)

    print(f"\n📊 Core Metrics:")
    print(f"  Accuracy:           {full_metrics['accuracy']:.4f} ({full_metrics['accuracy']*100:.1f}%)")
    print(f"  F1 (Illicit class): {full_metrics['f1_illicit']:.4f}")
    print(f"  F1 (Licit class):   {full_metrics['f1_licit']:.4f}")
    print(f"  F1 (Macro):         {full_metrics['f1_macro']:.4f}")
    print(f"\n📊 AML-Specific Metrics:")
    print(f"  AUPRC:              {full_metrics['auprc']:.4f}")
    print(f"  ROC-AUC:            {full_metrics['roc_auc']:.4f}")
    print(f"  Recall@FPR=1%:      {full_metrics['recall_at_1pct_fpr']:.4f} ({full_metrics['recall_at_1pct_fpr']*100:.1f}%)")

    print(f"\n📊 Precision@K:")
    for k, prec in full_metrics['precision_at_k'].items():
        print(f"  P@{k}: {prec:.4f} ({prec*100:.1f}%)")

    print(f"\n📊 Confusion Matrix:")
    cm = full_metrics['confusion_matrix']
    print(f"  {'':>12} Pred Licit  Pred Illicit")
    print(f"  True Licit  {cm[0][0]:>10,}  {cm[0][1]:>12,}")
    print(f"  True Illicit{cm[1][0]:>10,}  {cm[1][1]:>12,}")

    print(f"\n📊 Classification Report:")
    report = full_metrics['classification_report']
    for cls_name in ['Licit', 'Illicit']:
        r = report[cls_name]
        print(f"  {cls_name:>10}: Precision={r['precision']:.4f}  Recall={r['recall']:.4f}  F1={r['f1-score']:.4f}  Support={int(r['support'])}")

    # Top suspicious transactions
    print(f"\n📊 Top 20 Most Suspicious Transactions:")
    print("-" * 60)
    top_suspicious = get_suspicious_scores(model, data, tx_ids, torch_device, top_k=20)
    print(top_suspicious.to_string(index=False))

    illicit_in_top20 = (top_suspicious['label'] == 1).sum()
    print(f"\n✅ Illicit in Top-20: {illicit_in_top20}/20 = {illicit_in_top20/20*100:.1f}%")

    # Fan pattern detection
    print(f"\nDetecting fan-out/fan-in patterns...")
    tx_id_to_idx_map = {tx_id: idx for idx, tx_id in enumerate(tx_ids)}
    fan_out, fan_in = detect_fan_patterns(data, tx_id_to_idx_map, min_fan_out=5, min_fan_in=5)
    print(f"  Fan-out nodes (out-degree >= 5): {len(fan_out)}")
    print(f"  Fan-in nodes (in-degree >= 5): {len(fan_in)}")

    # =========================================================================
    # Generate Visualizations
    # =========================================================================
    output_dir = os.path.dirname(__file__)

    print(f"\nGenerating visualizations...")

    # Training curves
    visualize_training_curves(metrics_history, os.path.join(output_dir, 'training_curves.png'))

    # Confusion matrix
    visualize_confusion_matrix(cm, os.path.join(output_dir, 'confusion_matrix.png'))

    # Precision-Recall curve
    visualize_precision_recall_curve(
        full_metrics['y_true'], full_metrics['y_probs'],
        os.path.join(output_dir, 'precision_recall_curve.png')
    )

    # ROC curve
    visualize_roc_curve(
        full_metrics['y_true'], full_metrics['y_probs'],
        os.path.join(output_dir, 'roc_curve.png')
    )

    # Laundering subgraph
    print(f"\nVisualizing laundering subgraph...")
    suspicious_scores = get_all_suspicious_scores(model, data, torch_device)
    G = visualize_laundering_subgraph(
        data=data,
        tx_ids=tx_ids,
        suspicious_scores=suspicious_scores,
        tx_id_to_idx=tx_id_to_idx_map,
        top_k=20,
        hop=2,
        suspicious_threshold=0.7
    )

    # Store full metrics in history for saving
    metrics_history['test_metrics'] = {k: v for k, v in full_metrics.items()
                                        if k not in ('y_true', 'y_probs', 'y_pred')}

    return model, data, tx_ids, metrics_history


# =============================================================================
# Model Saving & Loading
# =============================================================================

def save_model(model: nn.Module, path: str, metadata: Optional[Dict] = None):
    """
    Save model with metadata (architecture type, metrics, config).
    Creates both the .pt weights file and a .json metadata file.
    """
    torch.save(model.state_dict(), path)
    print(f"✅ Model weights saved to {path}")

    # Save metadata alongside the model
    if metadata:
        meta_path = path.replace('.pt', '_metadata.json')
        # Filter out non-serializable items
        serializable = {}
        for k, v in metadata.items():
            if isinstance(v, (str, int, float, bool, list, dict)):
                serializable[k] = v
            elif isinstance(v, np.floating):
                serializable[k] = float(v)
            elif isinstance(v, np.integer):
                serializable[k] = int(v)

        with open(meta_path, 'w') as f:
            json.dump(serializable, f, indent=2, default=str)
        print(f"✅ Model metadata saved to {meta_path}")


def load_model(
    path: str,
    in_channels: int = 166,
    hidden_channels: int = 128,
    model_type: str = 'gatv2',
    heads: int = 4,
    num_layers: int = 3,
) -> nn.Module:
    """
    Load a saved model. Supports both legacy GraphSAGE and new GATv2.

    Will auto-detect model type from metadata file if available.
    """
    # Try to load metadata for auto-detection
    meta_path = path.replace('.pt', '_metadata.json')
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        model_type = meta.get('model_type', model_type)
        hidden_channels = meta.get('hidden_dim', hidden_channels)
        heads = meta.get('heads', heads)
        num_layers = meta.get('num_layers', num_layers)
        in_channels = meta.get('in_channels', in_channels)
        print(f"Loaded metadata: model_type={model_type}, hidden={hidden_channels}, heads={heads}, layers={num_layers}")

    if model_type == 'gatv2':
        model = SmurfHunterGNN(
            in_channels=in_channels,
            hidden_channels=hidden_channels,
            out_channels=2,
            heads=heads,
            num_layers=num_layers,
        )
    else:
        model = GraphSAGE(
            in_channels=in_channels,
            hidden_channels=hidden_channels,
        )

    model.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
    model.eval()
    print(f"✅ Loaded {model_type.upper()} model from {path}")
    return model


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    # Train the upgraded GATv2 model
    model, data, tx_ids, history = train_model(
        epochs=200,
        hidden_dim=128,
        heads=4,
        num_layers=3,
        lr=0.005,
        dropout=0.3,
        clip_value=5.0,
        patience=30,
        model_type='gatv2',
    )

    # Save model with full metadata
    model_path = os.path.join(os.path.dirname(__file__), 'smurf_hunter_model_v2.pt')
    save_model(model, model_path, metadata={
        'model_type': 'gatv2',
        'hidden_dim': 128,
        'heads': 4,
        'num_layers': 3,
        'in_channels': data.x.size(1),
        'dropout': 0.3,
        'test_metrics': history.get('test_metrics', {}),
    })

    # Also save a copy as the standard model name for backward compat
    compat_path = os.path.join(os.path.dirname(__file__), 'smurf_hunter_model.pt')
    save_model(model, compat_path, metadata={
        'model_type': 'gatv2',
        'hidden_dim': 128,
        'heads': 4,
        'num_layers': 3,
        'in_channels': data.x.size(1),
        'dropout': 0.3,
    })

    print(f"\n{'='*60}")
    print("🎉 Training complete! Models saved.")
    print(f"{'='*60}")
