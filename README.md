# 🛡️ VyapaarKavach (व्यापार कवच) / SmurfPakad

> **Next-Generation Anti-Money Laundering (AML) & Transaction Fraud Graph Intelligence Platform**  
> Powered by **Temperature-Gated Graph Attention Networks (`TG-GATv2`)**, **Hawkes Point Process Fusion**, and **Autonomous IBM watsonx.ai Investigation Agents**.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org/)
[![PyTorch Geometric](https://img.shields.io/badge/PyG-GATv2-3C2179?style=for-the-badge)](https://pyg.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![IBM watsonx](https://img.shields.io/badge/IBM-watsonx.ai-054ADA?style=for-the-badge&logo=ibm&logoColor=white)](https://www.ibm.com/watsonx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

---

## 📌 Problem Statement

Financial criminals exploit modern digital rails (crypto blockchains like Bitcoin as well as real-time fiat systems like UPI, Paytm, PhonePe, and Google Pay) to evade regulatory reporting limits. They deploy **"Smurfing" (Structuring)**:

1. **Structuring:** Slicing large illicit sums into hundreds of tiny transactions just below reporting thresholds (e.g., ₹50,000 / $10,000).
2. **Layering:** Fanning them out across complex, multi-hop chains of mule accounts and shell merchants.
3. **Integration:** Aggregating them back into central exit hubs or cash-out points.

### Why Traditional Systems Fail:
- **Rule-based filters fail:** Individual transactions appear small and benign; threshold alerts are never triggered.
- **Tabular ML models fail:** Isolated tabular features miss multi-hop network topologies and cyclic flows.
- **Standard Graph Attention Networks (GAT) dilute signals:** In transaction graphs with low average degree (~2.5), standard softmax attention disperses weight equally across noisy clean neighbors, diluting the fraud signature down to ~33% and causing missed smurf rings.

---

## 💡 The Solution: VyapaarKavach / SmurfPakad

**VyapaarKavach** solves this crisis with a multi-layered graph intelligence and autonomous AI stack:

### 1. 🧠 Temperature-Gated GATv2 (`TG-GATv2`)
* Introduces a learnable temperature parameter per attention head $\tau_h$:
  $$\alpha_{ij} = \text{softmax}\left(\frac{e_{ij}}{\tau_h}\right)$$
* When $\tau_h < 1$, attention concentrates sharply on critical illicit edges instead of diluting across benign neighbors.
* **Beats published academic baselines on the IBM Elliptic2 dataset (121,810 subgraphs)**:
  * **Test F1:** `0.5640` (vs paper baseline `0.5558`)
  * **PR-AUC:** `0.6042` (vs paper baseline `0.5906`)
  * **Recall Improvement:** **+6.2%** in catching real-world laundering rings.

### 2. ⚡ Vigilant Multi-Modal Temporal Fusion Engine
* Combines **Hawkes Self-Exciting Point Processes** (capturing transaction bursts and excitation intensity), topological graph heuristics, and transaction velocity signatures.
* Multi-modal fusion with dynamic calibration for low-latency, real-time risk scoring.

### 3. 🌐 2D/3D Interactive Graph Visualizer & Smurf Chain Hunter
* Full-screen interactive force-directed graph exploration in 2D (`Canvas`) and 3D (`Three.js / WebGL`).
* Live topological pattern classifier matching **FATF (Financial Action Task Force)** typologies:
  * **Fan-In / Collector Hub (FATF TR-08)**
  * **Fan-Out / Structuring (FATF TR-05)**
  * **Smurf Mule Ring (FATF TR-05/08)**
  * **Cycle / Pass-Through Layering**

### 4. 🛡️ SafeGuard Real-Time Payment Shield
* Point-of-payment protection for UPI and digital banking rails.
* Browser extension integration and high-speed API (`/api/v1/safeguard/check`) that evaluates recipient risk scores before funds leave the sender's account.

### 5. 🤖 Autonomous AML Investigation Agent (IBM watsonx.ai)
* An AI investigator powered by IBM watsonx.ai Granite LLMs.
* In-depth case file analysis, timeline reconstruction, and automated one-click generation of **Suspicious Activity Reports (SAR)** formatted for regulatory bodies (**FIU-IND** in India, **FinCEN** in the US).

### 6. ⚖️ AI Governance & Federated Learning
* **watsonx.governance:** Tracks model bias, fairness metrics, and data drift to protect honest merchants from false-positive lockouts.
* **Privacy-Preserving Federated Learning:** Facilitates cross-bank collaborative model training without exposing private customer banking data.

---

## 🏗️ Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 18 + Vite + TS)                   │
│  - Tailwind CSS + Lucide Icons + Recharts + Three.js + ForceGraph      │
│  - 2D / 3D Graph Visualizer with Smurf Chain Hunter                    │
│  - Vigilant Hawkes Process Monitor, War Room, & Compliance Portal      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / WebSocket (/api/v1)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    BACKEND (FastAPI + SQLAlchemy)                      │
│  - SQLite Engine (smurfpakad.db) & Async Uvicorn Worker                │
│  - JWT Bearer Authentication & OAuth                                   │
│  - Analysis, Uploads, Graph Extraction, Reports & Dashboard            │
│  - SafeGuard Payment Check API (/api/v1/safeguard)                     │
│  - IBM watsonx.ai Granite Agent & Watson NLP Service                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Node Vectors (43-dim) & Adjacency
┌───────────────────────────────────▼────────────────────────────────────┐
│                 GRAPH ML PIPELINE (PyTorch Geometric)                  │
│  - Checkpoint: AI/All_models/best_model_tg.pt                          │
│  - Architecture: TG-GATv2 (3 layers, 4 heads, learnable temperature)   │
│  - Topological Heuristics + Degree Dynamics (In/Out Velocity)          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python**: Version `3.10` or `3.11`
- **Node.js**: Version `18.x` or higher
- **npm**: Version `9.x` or higher
- **Git**

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/advaitkj123/VyapaarKavach-v1.git
cd VyapaarKavach-v1
```

---

### Step 2: Set Up and Start the Backend
Navigate to the backend directory:
```bash
cd SmurfPakad_v1-main/Backend
```

Create a virtual environment (optional but recommended):
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

Install backend dependencies:
```bash
pip install -r requirements.txt
```

Set up environment variables:
```bash
# Copy template
cp .env.example .env
```
*(The defaults are pre-configured for local SQLite operation out of the box).*

Start the FastAPI backend:
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verify backend health:
- **API Health**: `http://localhost:8000/health`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

### Step 3: Set Up and Start the Frontend
In a new terminal window, navigate to the frontend directory:
```bash
cd VyapaarKavach-v1/SmurfPakad_v1-main
```

Install frontend dependencies:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```

Open your browser and navigate to:
👉 **`http://localhost:5173/cryptoflow/`**

---

## 🧭 Application Modules & Routes

| Route | Description |
|---|---|
| `/cryptoflow/` | Landing page with platform overview & live demo |
| `/cryptoflow/dashboard` | Main operational dashboard with risk metrics and alert streams |
| `/cryptoflow/graph` | Interactive 2D/3D Graph Visualization & Smurf Chain Hunter |
| `/cryptoflow/vigilant` | Vigilant Hawkes Point Process & Multi-Modal Fraud Engine |
| `/cryptoflow/threats` | Real-time global threat map with WebSocket streaming alerts |
| `/cryptoflow/warroom` | High-stakes incident response & node containment room |
| `/cryptoflow/agent` | Autonomous watsonx.ai AML Investigation Agent Chat |
| `/cryptoflow/upload` | Transaction CSV / Excel batch upload & graph builder |
| `/cryptoflow/analysis` | Deep-dive statistical analysis and node distribution |
| `/cryptoflow/compliance` | Regulatory Compliance & automated SAR generation |
| `/cryptoflow/governance` | Model Fairness, Bias detection, and drift tracking |
| `/cryptoflow/docs` | Technical documentation and research benchmarks |

---

## 📡 API Reference Overview

The FastAPI backend exposes comprehensive REST and WebSocket endpoints:

### Core Endpoints
- `GET /health`: Service health check and version metadata.
- `GET /docs`: Auto-generated OpenAPI Swagger interface.

### Analysis & Graph
- `POST /api/v1/upload/file`: Upload transaction files (CSV/JSON/XLSX).
- `GET /api/v1/analysis/{upload_id}`: Run full GNN inference on uploaded graph.
- `GET /api/v1/graph/{upload_id}`: Retrieve node, edge, and subgraph metadata.
- `GET /api/v1/graph/{upload_id}/neighbors/{node_id}`: Ego-network extraction.

### Real-Time Payment Safeguard
- `POST /api/v1/safeguard/check`: Check risk score for recipient UPI / wallet before payment execution.
- `POST /api/v1/safeguard/report`: Report a fraudulent wallet or payment failure.

### AI Investigation & Governance
- `POST /api/v1/agent/investigate`: Trigger autonomous watsonx.ai case investigation.
- `GET /api/v1/governance/metrics`: Fetch model fairness, bias parity, and drift scores.
- `POST /api/v1/reports/generate`: Generate formal SAR PDF / Excel compliance report.

---

## 📊 Benchmark Results (Elliptic2 Dataset)

Evaluation on the **121,810 subgraphs** of the IBM Elliptic2 dataset:

| Model Architecture | Test F1 Score | PR-AUC | Test Recall | Parameters Added |
|---|---|---|---|---|
| Standard GATv2 Baseline (Paper) | 0.5558 | 0.5906 | 0.4614 | 0 |
| **TG-GATv2 (Ours - VyapaarKavach)** | **0.5640** | **0.6042** | **0.5232** | **+12 params** |
| *Relative Improvement* | *+1.5%* | *+2.3%* | **+6.2%** | *Negligible overhead* |

---

## 📁 Repository Structure

```text
VyapaarKavach-v1/
├── README.md                            # Main project documentation (this file)
└── SmurfPakad_v1-main/
    ├── AI/                              # Trained model checkpoints & training scripts
    │   └── All_models/best_model_tg.pt  # Verified 43-dim TG-GATv2 weights
    ├── Backend/                         # FastAPI application
    │   ├── app/
    │   │   ├── core/                    # Security, database, websocket manager
    │   │   ├── routers/                 # Modular API endpoints
    │   │   ├── schemas/                 # Pydantic data schemas
    │   │   └── services/                # ML inference, upload, agent, governance
    │   ├── main.py                      # Backend entry point
    │   └── requirements.txt             # Python dependencies
    ├── src/                             # React + TypeScript frontend
    │   ├── components/                  # 2D/3D Graph viz, Navbar, Layouts
    │   ├── contexts/                    # Theme & auth state contexts
    │   ├── lib/
    │   │   ├── vigilant/                # Hawkes process & multi-modal fusion
    │   │   ├── api.ts                   # Backend API client
    │   │   └── graphRisk.ts             # Client-side graph risk enrichment
    │   ├── pages/                       # Application views & dashboards
    │   └── App.tsx                      # Root route configuration
    ├── package.json                     # Frontend dependencies
    └── vite.config.ts                   # Vite configuration
```

---

## 🛡️ License

This project is licensed under the **MIT License** — see the [LICENSE](SmurfPakad_v1-main/LICENSE) file for details.
