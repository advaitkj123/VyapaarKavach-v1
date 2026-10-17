# pyright: basic
# type: ignore
"""
SMURF HUNTER v2 — Google Colab Training Script
===============================================
Run this in Google Colab with GPU enabled (Runtime > Change runtime type > T4 GPU)

Steps:
1. Upload the Elliptic dataset files to /content/
2. Run all cells
3. Model + metadata + visualizations are auto-saved and downloaded

Dataset files required in /content/:
  - elliptic_txs_features.csv
  - elliptic_txs_edgelist.csv
  - elliptic_txs_classes.csv

Download from: https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
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

# Google Colab dataset path
DATASET_PATH = '/content'

# Output directory for saved models & visualizations
OUTPUT_DIR = '/content/smurf_hunter_output'
os.makedirs(OUTPUT_DIR, exist_ok=True)


# =============================================================================
# Model Architectures
# =============================================================================

class GraphSAGE(torch.nn.Module):
    """Legacy GraphSAGE model (backward compatible with v1 weights)."""
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
                y[idx] = 1
            elif label == '2' or label == 2:
                y[idx] = 0

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


def train_epoch(model, data, optimizer, device, class_weights=None):
    model.train()
    optimizer.zero_grad()

    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.clamp(out, min=-10.0, max=10.0)

    train_mask = data.train_mask.to(device)
    y_train = data.y.to(device)[train_mask]
    out_train = out[train_mask]

    if class_weights is not None:
        class_weights = class_weights.to(device)
        loss = F.cross_entropy(out_train, y_train, weight=class_weights)
    else:
        loss = F.cross_entropy(out_train, y_train)

    if torch.isnan(loss):
        raise ValueError("NaN loss detected — training stopped")

    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
    optimizer.step()

    return loss.item()


@torch.no_grad()
def evaluate(model, data, mask, device):
    model.eval()
    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    pred = out.argmax(dim=1)
    probs = F.softmax(out, dim=1)[:, 1]
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
def evaluate_full_metrics(model, data, mask, device):
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

    accuracy = (y_pred == y_true).mean()
    f1_illicit = f1_score(y_true, y_pred, pos_label=1, zero_division=0)
    f1_licit = f1_score(y_true, y_pred, pos_label=0, zero_division=0)
    f1_macro = f1_score(y_true, y_pred, average='macro', zero_division=0)
    auprc = average_precision_score(y_true, y_probs)
    roc_auc = roc_auc_score(y_true, y_probs)

    fpr, tpr, _ = roc_curve(y_true, y_probs)
    recall_at_1pct_fpr = 0.0
    for f, t in zip(fpr, tpr):
        if f <= 0.01:
            recall_at_1pct_fpr = t
        else:
            break

    sorted_indices = np.argsort(y_probs)[::-1]
    precision_at_k = {}
    for k in [20, 50, 100, 200]:
        top_k = min(k, len(sorted_indices))
        top_k_labels = y_true[sorted_indices[:top_k]]
        precision_at_k[k] = (top_k_labels == 1).sum() / top_k if top_k > 0 else 0

    cm = confusion_matrix(y_true, y_pred)
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
def get_suspicious_scores(model, data, tx_ids, device, top_k=20):
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
    results_known = results[results['label'] != -1]
    results_known = results_known.sort_values('suspicious_score', ascending=False)
    return results_known.head(top_k)


@torch.no_grad()
def get_all_suspicious_scores(model, data, device):
    model.eval()
    out = model(data.x.to(device), data.edge_index.to(device))
    out = torch.nan_to_num(out, nan=0.0, posinf=10.0, neginf=-10.0)
    probs = F.softmax(out, dim=1)[:, 1]
    probs = torch.clamp(probs, 1e-6, 1 - 1e-6).cpu().numpy()
    return probs


# =============================================================================
# Pattern Detection
# =============================================================================

def detect_fan_patterns(data, tx_id_to_idx, min_fan_out=3, min_fan_in=3):
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

def visualize_laundering_subgraph(data, tx_ids, suspicious_scores, tx_id_to_idx,
                                  output_path=None, top_k=20, hop=2, suspicious_threshold=0.7):
    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, 'laundering_graph.png')

    idx_to_tx_id = {idx: tx_id for tx_id, idx in tx_id_to_idx.items()}
    top_k_indices = np.argsort(suspicious_scores)[-top_k:][::-1]
    top_k_scores = suspicious_scores[top_k_indices]

    print(f"Top {top_k} suspicious nodes (scores: {top_k_scores.min():.4f} - {top_k_scores.max():.4f})")

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

    subgraph_edges = [(s, d) for s, d in zip(edge_index[0], edge_index[1])
                      if s in subgraph_nodes and d in subgraph_nodes]

    G = nx.DiGraph()
    G.add_edges_from(subgraph_edges)
    G.remove_nodes_from(list(nx.isolates(G)))

    if G.number_of_nodes() == 0:
        print("Warning: Subgraph is empty")
        return G

    print(f"Subgraph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    node_colors, node_sizes, node_borders, node_border_widths = [], [], [], []
    top_k_set = set(top_k_indices)
    score_min = suspicious_scores[list(G.nodes())].min()
    score_max = suspicious_scores[list(G.nodes())].max()

    for node in G.nodes():
        label = data.y[node].item()
        node_colors.append('#ff4444' if label == 1 else '#44cc44' if label == 0 else '#888888')
        score = suspicious_scores[node]
        normalized = (score - score_min) / (score_max - score_min) if score_max > score_min else 0.5
        node_sizes.append(100 + 400 * normalized)
        if node in top_k_set:
            node_borders.append('#000000')
            node_border_widths.append(2.5)
        else:
            node_borders.append('#444444')
            node_border_widths.append(0.5)

    edge_widths, edge_colors = [], []
    for src, dst in G.edges():
        ss, ds = suspicious_scores[src], suspicious_scores[dst]
        if ss > suspicious_threshold and ds > suspicious_threshold:
            edge_widths.append(2.0); edge_colors.append('#ff6666')
        elif ss > suspicious_threshold or ds > suspicious_threshold:
            edge_widths.append(1.2); edge_colors.append('#999999')
        else:
            edge_widths.append(0.5); edge_colors.append('#cccccc')

    plt.figure(figsize=(18, 14))
    pos = nx.spring_layout(G, k=1.5, iterations=100, seed=42)
    nx.draw_networkx_edges(G, pos, edge_color=edge_colors, width=edge_widths,
                           arrows=True, arrowsize=12, arrowstyle='-|>',
                           connectionstyle='arc3,rad=0.1', alpha=0.6,
                           min_source_margin=10, min_target_margin=10)
    nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=node_sizes,
                           edgecolors=node_borders, linewidths=node_border_widths, alpha=0.85)

    labels = {}
    for node in top_k_indices:
        if node in G.nodes():
            labels[node] = f"{str(idx_to_tx_id.get(node, node))[:6]}\n{suspicious_scores[node]:.2f}"
    nx.draw_networkx_labels(G, pos, labels=labels, font_size=7, font_color='black', font_weight='bold')

    legend = [
        plt.scatter([], [], c='#ff4444', s=150, edgecolors='black', linewidths=2, label='Illicit (known)'),
        plt.scatter([], [], c='#44cc44', s=150, edgecolors='black', linewidths=2, label='Licit (known)'),
        plt.scatter([], [], c='#888888', s=150, edgecolors='black', linewidths=2, label='Unknown'),
        Line2D([0], [0], color='#ff6666', linewidth=2.5, label='High-risk edge'),
        Line2D([0], [0], color='#cccccc', linewidth=1, label='Normal edge'),
    ]
    plt.legend(handles=legend, loc='upper left', title='Node & Edge Types', fontsize=9, title_fontsize=10)
    plt.title(f'Laundering Subgraph (Top {top_k} Suspicious)\n{G.number_of_nodes()} nodes, {G.number_of_edges()} edges',
              fontsize=14, fontweight='bold')
    plt.axis('off')
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()
    print(f"Saved to: {output_path}")
    return G


def visualize_training_curves(metrics_history, output_path=None):
    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, 'training_curves.png')

    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    epochs = range(1, len(metrics_history['train_loss']) + 1)

    axes[0].plot(epochs, metrics_history['train_loss'], color='#e74c3c', linewidth=2)
    axes[0].set_title('Training Loss', fontsize=14, fontweight='bold')
    axes[0].set_xlabel('Epoch'); axes[0].set_ylabel('Loss'); axes[0].grid(True, alpha=0.3)

    axes[1].plot(epochs, metrics_history['val_acc'], color='#3498db', linewidth=2)
    axes[1].set_title('Validation Accuracy', fontsize=14, fontweight='bold')
    axes[1].set_xlabel('Epoch'); axes[1].set_ylabel('Accuracy'); axes[1].grid(True, alpha=0.3)

    axes[2].plot(epochs, metrics_history['val_prec_at_k'], color='#2ecc71', linewidth=2)
    axes[2].set_title('Validation P@100', fontsize=14, fontweight='bold')
    axes[2].set_xlabel('Epoch'); axes[2].set_ylabel('P@100'); axes[2].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()


def visualize_confusion_matrix(cm, output_path=None):
    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, 'confusion_matrix.png')

    cm_arr = np.array(cm)
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(cm_arr, cmap='Blues', interpolation='nearest')
    plt.colorbar(im, ax=ax)

    for i in range(2):
        for j in range(2):
            color = 'white' if cm_arr[i, j] > cm_arr.max() / 2 else 'black'
            ax.text(j, i, f'{cm_arr[i, j]:,}', ha='center', va='center',
                    fontsize=16, fontweight='bold', color=color)

    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_xticklabels(['Licit', 'Illicit'], fontsize=12)
    ax.set_yticklabels(['Licit', 'Illicit'], fontsize=12)
    ax.set_xlabel('Predicted', fontsize=14, fontweight='bold')
    ax.set_ylabel('True', fontsize=14, fontweight='bold')
    ax.set_title('Confusion Matrix — Smurf Hunter v2', fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()


def visualize_precision_recall_curve(y_true, y_probs, output_path=None):
    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, 'precision_recall_curve.png')

    precision, recall, _ = precision_recall_curve(y_true, y_probs)
    auprc = average_precision_score(y_true, y_probs)

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(recall, precision, color='#e74c3c', linewidth=2, label=f'AUPRC = {auprc:.4f}')
    ax.fill_between(recall, precision, alpha=0.1, color='#e74c3c')
    ax.axhline(y=y_true.mean(), color='gray', linestyle='--', label=f'Baseline ({y_true.mean():.4f})')
    ax.set_xlabel('Recall'); ax.set_ylabel('Precision')
    ax.set_title('Precision-Recall Curve', fontsize=14, fontweight='bold')
    ax.legend(fontsize=11); ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()


def visualize_roc_curve(y_true, y_probs, output_path=None):
    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, 'roc_curve.png')

    fpr, tpr, _ = roc_curve(y_true, y_probs)
    auc = roc_auc_score(y_true, y_probs)

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(fpr, tpr, color='#3498db', linewidth=2, label=f'AUC = {auc:.4f}')
    ax.fill_between(fpr, tpr, alpha=0.1, color='#3498db')
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.5)
    ax.set_xlabel('FPR'); ax.set_ylabel('TPR')
    ax.set_title('ROC Curve', fontsize=14, fontweight='bold')
    ax.legend(fontsize=11); ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.show()


# =============================================================================
# Model Save / Load
# =============================================================================

def save_model(model, path, metadata=None):
    torch.save(model.state_dict(), path)
    print(f"✅ Model saved to {path}")

    if metadata:
        meta_path = path.replace('.pt', '_metadata.json')
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
        print(f"✅ Metadata saved to {meta_path}")


def load_model(path, in_channels=166, hidden_channels=128, model_type='gatv2', heads=4, num_layers=3):
    meta_path = path.replace('.pt', '_metadata.json')
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        model_type = meta.get('model_type', model_type)
        hidden_channels = meta.get('hidden_dim', hidden_channels)
        heads = meta.get('heads', heads)
        num_layers = meta.get('num_layers', num_layers)
        in_channels = meta.get('in_channels', in_channels)

    if model_type == 'gatv2':
        model = SmurfHunterGNN(in_channels=in_channels, hidden_channels=hidden_channels,
                               out_channels=2, heads=heads, num_layers=num_layers)
    else:
        model = GraphSAGE(in_channels=in_channels, hidden_channels=hidden_channels)

    model.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
    model.eval()
    return model


# =============================================================================
# MAIN TRAINING PIPELINE
# =============================================================================

def train_model(
    epochs=200, hidden_dim=128, heads=4, num_layers=3,
    lr=0.005, dropout=0.3, clip_value=5.0, patience=30,
    model_type='gatv2', device=None
):
    if device is None:
        torch_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    else:
        torch_device = torch.device(device)

    print(f"{'='*60}")
    print(f"SMURF HUNTER v2 — Training on {torch_device}")
    print(f"{'='*60}")
    print(f"Model: {model_type.upper()} | Hidden: {hidden_dim} | Heads: {heads} | Layers: {num_layers}")

    features_df, edges_df, classes_df = load_elliptic_dataset()
    data, tx_id_to_idx, tx_ids = build_graph_data(features_df, edges_df, classes_df, clip_value=clip_value)

    print(f"Nodes: {data.x.size(0):,} | Edges: {data.edge_index.size(1):,} | Features: {data.x.size(1)}")
    print(f"Illicit: {(data.y == 1).sum().item():,} | Licit: {(data.y == 0).sum().item():,} | Unknown: {(data.y == -1).sum().item():,}")

    data = create_masks(data)
    in_channels = data.x.size(1)

    if model_type == 'gatv2':
        model = SmurfHunterGNN(in_channels, hidden_dim, 2, heads, num_layers, dropout).to(torch_device)
    else:
        model = GraphSAGE(in_channels, hidden_dim, 2, dropout).to(torch_device)

    num_params = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {num_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=5e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=lr * 0.01)
    class_weights = compute_class_weights(data)
    print(f"Class weights — Licit: {class_weights[0]:.4f}, Illicit: {class_weights[1]:.4f}")

    best_val_prec = 0
    best_model_state = None
    epochs_without_improvement = 0
    metrics_history = {'train_loss': [], 'val_acc': [], 'val_prec_at_k': [], 'lr': []}

    print(f"\nTraining (max {epochs} epochs, patience {patience})...")
    print("-" * 70)

    try:
        for epoch in range(1, epochs + 1):
            loss = train_epoch(model, data, optimizer, torch_device, class_weights)
            val_acc, val_prec = evaluate(model, data, data.val_mask, torch_device)
            current_lr = optimizer.param_groups[0]['lr']

            metrics_history['train_loss'].append(loss)
            metrics_history['val_acc'].append(val_acc)
            metrics_history['val_prec_at_k'].append(val_prec)
            metrics_history['lr'].append(current_lr)

            if val_prec > best_val_prec:
                best_val_prec = val_prec
                best_model_state = {k: v.clone() for k, v in model.state_dict().items()}
                epochs_without_improvement = 0
            else:
                epochs_without_improvement += 1

            scheduler.step()

            if epoch % 10 == 0 or epoch == 1:
                print(f"Epoch {epoch:03d} | Loss: {loss:.4f} | Acc: {val_acc:.4f} | P@100: {val_prec:.4f} | LR: {current_lr:.6f}")

            if epochs_without_improvement >= patience:
                print(f"\n⚡ Early stopping at epoch {epoch}")
                break

    except ValueError as e:
        print(f"\n{e}")
        if best_model_state is not None:
            model.load_state_dict(best_model_state)

    if best_model_state is not None:
        model.load_state_dict(best_model_state)

    # Full test evaluation
    full_metrics = evaluate_full_metrics(model, data, data.test_mask, torch_device)

    print(f"\n{'='*60}")
    print("TEST RESULTS — SMURF HUNTER v2")
    print(f"{'='*60}")
    print(f"Accuracy:           {full_metrics['accuracy']:.4f}")
    print(f"F1 (Illicit):       {full_metrics['f1_illicit']:.4f}")
    print(f"F1 (Macro):         {full_metrics['f1_macro']:.4f}")
    print(f"AUPRC:              {full_metrics['auprc']:.4f}")
    print(f"ROC-AUC:            {full_metrics['roc_auc']:.4f}")
    print(f"Recall@FPR=1%:      {full_metrics['recall_at_1pct_fpr']:.4f}")

    print(f"\nPrecision@K:")
    for k, prec in full_metrics['precision_at_k'].items():
        print(f"  P@{k}: {prec:.4f} ({prec*100:.1f}%)")

    cm = full_metrics['confusion_matrix']
    print(f"\nConfusion Matrix:")
    print(f"  {'':>12} Pred Licit  Pred Illicit")
    print(f"  True Licit  {cm[0][0]:>10,}  {cm[0][1]:>12,}")
    print(f"  True Illicit{cm[1][0]:>10,}  {cm[1][1]:>12,}")

    # Top suspicious
    top_suspicious = get_suspicious_scores(model, data, tx_ids, torch_device, top_k=20)
    illicit_in_top20 = (top_suspicious['label'] == 1).sum()
    print(f"\n✅ Illicit in Top-20: {illicit_in_top20}/20 = {illicit_in_top20/20*100:.1f}%")

    # Fan patterns
    tx_id_to_idx_map = {tx_id: idx for idx, tx_id in enumerate(tx_ids)}
    fan_out, fan_in = detect_fan_patterns(data, tx_id_to_idx_map, min_fan_out=5, min_fan_in=5)
    print(f"Fan-out (≥5): {len(fan_out)} | Fan-in (≥5): {len(fan_in)}")

    # Generate all visualizations
    print(f"\nGenerating visualizations...")
    visualize_training_curves(metrics_history)
    visualize_confusion_matrix(cm)
    visualize_precision_recall_curve(full_metrics['y_true'], full_metrics['y_probs'])
    visualize_roc_curve(full_metrics['y_true'], full_metrics['y_probs'])

    suspicious_scores = get_all_suspicious_scores(model, data, torch_device)
    visualize_laundering_subgraph(data, tx_ids, suspicious_scores, tx_id_to_idx_map)

    metrics_history['test_metrics'] = {k: v for k, v in full_metrics.items()
                                        if k not in ('y_true', 'y_probs', 'y_pred')}

    return model, data, tx_ids, metrics_history


# =============================================================================
# RUN TRAINING & AUTO-SAVE
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

    # ===== AUTO-SAVE ALL OUTPUTS =====

    # 1. Save primary model (v2)
    v2_path = os.path.join(OUTPUT_DIR, 'smurf_hunter_model_v2.pt')
    save_model(model, v2_path, metadata={
        'model_type': 'gatv2',
        'hidden_dim': 128,
        'heads': 4,
        'num_layers': 3,
        'in_channels': data.x.size(1),
        'dropout': 0.3,
        'test_metrics': history.get('test_metrics', {}),
    })

    # 2. Save backward-compatible copy
    compat_path = os.path.join(OUTPUT_DIR, 'smurf_hunter_model.pt')
    save_model(model, compat_path, metadata={
        'model_type': 'gatv2',
        'hidden_dim': 128,
        'heads': 4,
        'num_layers': 3,
        'in_channels': data.x.size(1),
        'dropout': 0.3,
    })

    # 3. Save training history as JSON
    history_path = os.path.join(OUTPUT_DIR, 'training_history.json')
    serializable_history = {k: v for k, v in history.items() if isinstance(v, (list, dict))}
    with open(history_path, 'w') as f:
        json.dump(serializable_history, f, indent=2, default=str)
    print(f"✅ Training history saved to {history_path}")

    print(f"\n{'='*60}")
    print(f"🎉 ALL OUTPUTS SAVED TO: {OUTPUT_DIR}")
    print(f"{'='*60}")
    print(f"Files:")
    for f in os.listdir(OUTPUT_DIR):
        fpath = os.path.join(OUTPUT_DIR, f)
        size = os.path.getsize(fpath) / 1024
        print(f"  📄 {f} ({size:.1f} KB)")

    # 4. Try to auto-download in Colab
    try:
        from google.colab import files
        print(f"\n📥 Downloading model files...")
        files.download(v2_path)
        files.download(v2_path.replace('.pt', '_metadata.json'))
        files.download(compat_path)
        files.download(compat_path.replace('.pt', '_metadata.json'))
        files.download(history_path)
        print("✅ Download triggered! Check your browser downloads.")
    except ImportError:
        print("\nNot running in Colab — files saved locally.")
    except Exception as e:
        print(f"\nAuto-download failed: {e}")
        print(f"Manually download from: {OUTPUT_DIR}")
