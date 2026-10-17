# SMURF HUNTER - Money Laundering Detection using Graph Neural Networks

## Overview

SMURF HUNTER is a Graph Neural Network (GNN) based tool designed to detect money laundering patterns in blockchain transaction graphs. It specifically targets "smurfing" or "layering" schemes where illicit funds are broken into small chunks, passed through multiple intermediate wallets, and reaggregated.

## Architecture

### Model: GraphSAGE (Graph Sample and Aggregate)

The model uses a 2-layer GraphSAGE architecture with mean aggregation:

```
Input Features (166 dims) → SAGEConv (64 hidden) → ReLU → Dropout → SAGEConv (2 classes) → Output
```

**Key Components:**
- **Layer 1**: SAGEConv with mean aggregator (165 → 64 dimensions)
- **Activation**: ReLU
- **Regularization**: Dropout (default: 0.3)
- **Layer 2**: SAGEConv with mean aggregator (64 → 2 dimensions)

### Why GraphSAGE?

1. **Inductive Learning**: Can generalize to unseen nodes
2. **Scalable**: Samples neighborhoods instead of using full graph
3. **Message Passing**: Captures local neighborhood structure (fan-in/fan-out patterns)
4. **Mean Aggregator**: Robust to noisy features

## Dataset: Elliptic Bitcoin AML

The Elliptic dataset contains Bitcoin transaction data:

| File | Description |
|------|-------------|
| `elliptic_txs_features.csv` | 203,769 transactions with 165 features each |
| `elliptic_txs_edgelist.csv` | 234,355 directed payment flow edges |
| `elliptic_txs_classes.csv` | Labels: illicit (4,545), licit (42,019), unknown (157,205) |

### Label Mapping
- Class `2` (illicit) → `1`
- Class `1` (licit) → `0`
- Class `unknown` → `-1` (ignored during training)

## Usage

### Training

```python
from AI.ML.models import train_model, save_model

# Train the model
model, data, tx_ids, history = train_model(
    epochs=100,
    hidden_dim=64,
    lr=0.01,
    dropout=0.3
)

# Save trained model
save_model(model, 'smurf_hunter_model.pt')
```

### Inference

```python
from AI.ML.models import load_model, get_suspicious_scores, load_elliptic_dataset, build_graph_data

# Load model
model = load_model('smurf_hunter_model.pt', in_channels=165, hidden_channels=64)

# Get suspicious scores
suspicious = get_suspicious_scores(model, data, tx_ids, device='cpu', top_k=100)
```

### Running Standalone

```bash
cd TristackOverflow
python -m AI.ML.models
```

## Output

### Training Metrics
- Training loss per epoch
- Validation accuracy per epoch
- Validation ROC-AUC per epoch

### Results
- **Test Accuracy**: Classification accuracy on held-out labeled nodes
- **Test ROC-AUC**: Area under ROC curve for binary classification
- **Top-K Suspicious**: Transactions ranked by illicit probability

## API Functions

| Function | Description |
|----------|-------------|
| `load_elliptic_dataset()` | Loads all three CSV files |
| `build_graph_data()` | Constructs PyTorch Geometric Data object |
| `create_masks()` | Creates train/val/test splits (70/15/15) |
| `train_model()` | Full training pipeline |
| `evaluate()` | Computes accuracy and ROC-AUC |
| `get_suspicious_scores()` | Returns suspicious transaction rankings |
| `save_model()` / `load_model()` | Model persistence |

## Hyperparameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `epochs` | 100 | Training iterations |
| `hidden_dim` | 64 | Hidden layer size |
| `lr` | 0.01 | Learning rate |
| `dropout` | 0.3 | Dropout rate |
| `train_ratio` | 0.7 | Training split |
| `val_ratio` | 0.15 | Validation split |

## Dependencies

```
torch>=2.0.0
torch-geometric>=2.4.0
torch-scatter
torch-sparse
numpy>=1.24.0
pandas>=2.0.0
scikit-learn>=1.3.0
```

## Project Structure

```
TristackOverflow/
├── AI/
│   └── ML/
│       ├── models.py          # GraphSAGE model and training pipeline
│       └── README.md          # This documentation
├── Backend/
│   ├── dataset/
│   │   ├── elliptic_txs_features.csv
│   │   ├── elliptic_txs_edgelist.csv
│   │   └── elliptic_txs_classes.csv
│   ├── main.py
│   └── requirements.txt
└── Frontend/
    └── ...
```

## Detection Approach

The model learns to identify suspicious patterns by:

1. **Feature Learning**: Encoding 165 transaction features into dense representations
2. **Neighborhood Aggregation**: Learning from transaction flow patterns
3. **Pattern Recognition**: Identifying fan-out/fan-in structures common in smurfing
4. **Probability Scoring**: Outputting illicit probability for each transaction

## Limitations

- Binary classification (illicit vs licit) - doesn't distinguish smurfing types
- Requires labeled training data
- May not generalize to different blockchain networks
- Static graph analysis (no temporal dynamics)

## Future Improvements

- Temporal GNN to capture time-ordered patterns
- Multi-class classification for different laundering schemes
- Attention mechanisms to highlight suspicious edges
- Subgraph detection for complete laundering circuits
