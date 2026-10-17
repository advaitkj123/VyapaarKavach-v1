# SmurfPakad — Development Handoff Report

**Date:** 2026-10-17  
**Status:** Audit Safely Stopped (Transitioned to Incremental Feature Development)  
**Author:** Backend, ML & Security Audit Lead  

---

## A. Project Overview

### 1. Purpose
**SmurfPakad** is an Anti-Money Laundering (AML) transaction monitoring and graph intelligence platform. It specializes in detecting "smurfing" (structuring large illicit financial transactions into numerous smaller transactions below regulatory thresholds, fanning them out through mule wallets, and aggregating them into target destinations).

### 2. Architecture & Major Components
The system consists of three primary operational tiers:

```
┌────────────────────────────────────────────────────────┐
│             Frontend (React 18 + Vite + TS)            │
│  - Tailwind CSS + Lucide Icons + Recharts + Vis.js     │
│  - Real-time WebSocket subscriptions for streams       │
└───────────────────────────┬────────────────────────────┘
                            │ REST / WebSocket
┌───────────────────────────▼────────────────────────────┐
│              Backend (FastAPI + SQLAlchemy)            │
│  - SQLite storage (migrated from Supabase)             │
│  - JWT Bearer auth & Google OAuth callback             │
│  - Analysis, Uploads, Graph, Reports, Dashboard        │
│  - IBM watsonx.ai, Watson NLP, AML Agents              │
└───────────────────────────┬────────────────────────────┘
                            │ Node Features & Edge Index
┌───────────────────────────▼────────────────────────────┐
│          Graph ML Inference Pipeline (PyG / PyTorch)    │
│  - Architecture: BestModelTG / GATv2Conv               │
│  - Checkpoints: AI/All_models/best_model_tg.pt (43-dim)│
│  - Subgraph extraction & heuristic smurfing patterns   │
└────────────────────────────────────────────────────────┘
```

- **Backend:** FastAPI application running asynchronously under Uvicorn (`Backend/main.py`), utilizing SQLAlchemy with a local SQLite database (`smurfpakad.db`). Provides comprehensive endpoints for authentication, file upload processing, graph construction, ML inference orchestration, WebSocket broadcast, and report generation (PDF via ReportLab, Excel via openpyxl).
- **Frontend:** A modern single-page application built with React 18, Vite, TypeScript, and Tailwind CSS (`src/App.tsx`, `src/pages/`). Communicates with the FastAPI backend over HTTP (`/api/v1`) and WebSockets (`/api/v1/ws`).
- **Graph ML Pipeline:** Extracts transaction feature vectors (43 dimensions matching Elliptic/IBM Bitcoin datasets) and constructs adjacency matrices (`edge_index`). Employs Graph Neural Networks (GATv2 / GraphSAGE / BestModelTG) loaded dynamically via CPU fallback or CUDA when available. Performs probability calibration, threshold classification (licit vs. illicit), and topological pattern detection (fan-in, fan-out, scatter-gather, cycle, pass-through).

---

## B. Current Repository State

### 1. Directory Structure
```
SmurfPakad_v1-main/
├── AI/                          # Model checkpoints & training code
│   ├── All_models/
│   │   ├── best_model_tg.pt     # Verified 43-dim PyG model checkpoint
│   │   ├── best_model_pyg_gatv2.pt
│   │   └── best_baseline.pt
│   └── ML/
│       └── smurf_hunter_model.pt
├── Backend/                     # FastAPI application backend
│   ├── app/
│   │   ├── core/                # DB, security, websocket, config
│   │   ├── routers/             # API route handlers
│   │   ├── schemas/             # Pydantic schemas (V2)
│   │   └── services/            # ML, upload, graph, analysis, reports
│   ├── tests/                   # Pytest automated test suite
│   ├── main.py                  # Backend application entry point
│   ├── requirements.txt         # Python dependencies
│   └── pytest.ini               # Pytest configuration
├── src/                         # Modern React/Vite/TS frontend
├── Frontend/                    # Legacy/earlier frontend folder
├── package.json                 # Node dependencies for active frontend
├── vite.config.ts               # Vite bundler configuration
└── smurfpakad.db                # Local SQLite database
```

### 2. Actual Entry Points & Run Commands
- **Backend:**
  ```bash
  cd Backend
  py -3.11 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
  ```
  API Docs: `http://localhost:8000/docs`
- **Frontend:**
  ```bash
  npm run dev
  ```
  Frontend UI: `http://localhost:5173`

### 3. Git Status
- Active Git branch: `main`
- No destructive git operations were performed. All audit fixes remain staged/unstaged in the local working directory.

---

## C. Audit Progress (Handoff Baseline)

### 1. Scope Inspected
- App startup configuration, dependency requirements, and environment settings.
- Real model checkpoint loading (`best_model_tg.pt` vs `BestModelTG` architecture).
- Database layer (`database.py` and `database_service.py` SQLite migration).
- WebSocket connection lifecycle and streaming events.
- API route handlers: `/ml`, `/ws`, `/dashboard`, `/graph`, `/reports`, `/upload`, `/auth`, `/settings`, `/analysis`.

### 2. Test Commands Executed
All tests were executed on the Python 3.11 runtime (`py -3.11`):
```bash
py -3.11 -m pytest tests/test_ml_service.py -v     # 9 passed (100%)
py -3.11 -m pytest tests/test_websocket.py -v      # 13 passed (100%)
py -3.11 -m pytest tests/test_dashboard.py -v      # 6 passed (100%)
py -3.11 -m pytest tests/test_graph.py -v          # 7 passed (100%)
py -3.11 -m pytest tests/test_reports.py -v        # 12 passed (100%)
py -3.11 -m pytest tests/test_upload.py -v         # 14 passed (100%)
```
**Total Verified Tests Passing:** **61 tests passed across 6 test suites**.

### 3. Application Startup Verification
- Backend imports and lifespan startup verified successfully.
- Model weight loader successfully initialized `BestModelTG` on CPU with checkpoint `AI/All_models/best_model_tg.pt`.

### 4. Defect Fixes Applied So Far
1. **ML Service (`Backend/app/services/ml_service.py`):**
   - Added `MLService = SmurfHunterService` compatibility alias.
   - Implemented `predict_batch`, `get_risk_level`, `validate_features`, `clean_features`.
   - Fixed typing imports (`Any`) and model loading key compatibility with PyG 2.8.
2. **Supabase Compatibility (`Backend/app/core/supabase.py` & `Backend/app/core/__init__.py`):**
   - Safe-guarded `create_client` import when Supabase package is absent.
   - Aliased `supabase_client = database_service` to allow unit test mocks to patch cleanly while using SQLite in live execution.
3. **WebSockets (`Backend/app/core/websocket.py` & `Backend/app/routers/ws.py`):**
   - Exported `manager = ws_manager`.
   - Registered `/api/v1/ws` alongside `/ws` for frontend reverse-proxy consistency.
4. **Dashboard & Analytics (`Backend/app/routers/dashboard.py` & `Backend/app/services/analysis_service.py`):**
   - Added `/recent`, `/overview`, and `/risk-trend` routes.
   - Connected stats aggregations to SQLite `analysis_results` records.
5. **Graph Subgraph & Clustering (`Backend/app/routers/graph.py` & `Backend/app/services/graph_service.py`):**
   - Implemented subpaths `/{upload_id}/stats`, `/{upload_id}/subgraph`, `/{upload_id}/clusters`.
6. **Reports Generation & Download (`Backend/app/routers/reports.py` & `Backend/app/services/report_service.py`):**
   - Supported `upload_id` / `analysis_id` in `ReportGenerateRequest`.
   - Added `/{report_id}/download` path alias and safe `Path.is_file()` checks to avoid directory-reading `PermissionError` on Windows.
7. **Upload Pipeline (`Backend/app/routers/upload.py` & `Backend/app/services/upload_service.py`):**
   - Added root `POST /` and `POST /upload` aliases for file upload.
   - Added `GET /{upload_id}/status` endpoint.
   - Added zero-byte file rejection and 403 Forbidden checks on cross-user deletion.
8. **Auth Schema & Database (`Backend/app/core/database.py`, `database_service.py`, `app/schemas/auth.py`, `app/services/auth_service.py`, `app/routers/auth.py`):**
   - Added `password_hash`, `role`, and `settings` columns to `User` SQLite model.
   - Added `POST /api/v1/auth/register`, `POST /api/v1/auth/refresh`, and dual form/JSON login handler.

### 5. Processes Stopped
- The ongoing test execution on `tests/test_auth.py` was safely canceled upon receiving the stop directive.
- All background task subagents and timers have been terminated.

---

## D. Known Issues & Unverified Modules

1. **`tests/test_auth.py` & `tests/test_settings.py`:**
   - Registration, refresh, and login handlers are written and staged, but require running their targeted test suite individually to verify complete passing status.
2. **`tests/test_analysis.py`:**
   - Needs check for `POST /start` and subpath aliases (`/status`, `/transactions`, `/patterns`).
3. **`Backend/app/routers/attack.py`:**
   - Exists in `app/routers/attack.py` but is not yet mounted in `Backend/main.py`.
4. **Frontend Production Build:**
   - Active frontend is in the root directory (`package.json`, `src/`). Needs `npm run build` validation when frontend changes occur.
5. **IBM watsonx.ai & Watson NLP Services:**
   - Configured with graceful mock/fallback responses when external cloud credentials (`WATSONX_API_KEY`) are not provided in `.env`.

---

## E. Incremental Development Protocol

For all subsequent tasks, strictly follow this lightweight workflow:

1. **Scope:** Clarify the specific feature, route, or defect to address.
2. **Inspect:** Read only the relevant files and tests.
3. **Minimal Change:** Make the smallest focused code edit that achieves the goal without broad refactoring.
4. **Focused Verification:** Run ONLY the targeted test file (e.g., `py -3.11 -m pytest tests/test_auth.py -v`).
5. **Fix & Confirm:** Resolve any immediate failure and rerun the targeted test.
6. **Handoff:** Report the specific files modified, exact commands run, test counts, and current state. Do not execute the entire test suite unless requested at a release milestone.
