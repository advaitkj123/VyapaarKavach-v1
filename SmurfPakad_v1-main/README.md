# SmurfPakad

Fraud detection of smurfing chaining patterns via Graph Neural Networks on Bitcoin datasets.

## Overview

SmurfPakad detects money laundering patterns (smurfing/structuring) in Bitcoin transactions using Graph Attention Networks v2 (GATv2). The project analyzes transaction graphs to identify chaining patterns characteristic of smurfing operations.

## Features

- **GATv2 Implementation**: Graph Attention Network v2 for transaction pattern classification
- **IBM Dataset**: Trained and evaluated on IBM's Bitcoin transaction dataset
- **FastAPI Benchmarks**: REST API for model inference with performance benchmarks
- **Web Interface**: Interactive website for visualization and detection

## Project Structure

```
SmurfPakad_v1/
├── data/                 # Bitcoin transaction datasets
├── models/               # GATv2 model implementations
├── api/                  # FastAPI service for inference
├── web/                  # Frontend website
├── notebooks/            # Training and evaluation notebooks
└── benchmarks/           # Performance benchmarking scripts
```

## Quick Start

### Installation

```bash
pip install -r requirements.txt
```

### Run API Server

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Run Website

```bash
cd web && npm install && npm run dev
```

## Model

- **Architecture**: GATv2 (Graph Attention Network v2)
- **Task**: Binary classification (smurfing vs legitimate)
- **Dataset**: IBM Bitcoin transaction dataset
- **Metrics**: AUC-ROC, Precision, Recall, F1-Score

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict` | POST | Detect smurfing patterns in transaction graph |
| `/health` | GET | Health check |
| `/metrics` | GET | Model performance metrics |

## Benchmarks

Run performance benchmarks:

```bash
python benchmarks/run_benchmarks.py
```

## License

MIT License