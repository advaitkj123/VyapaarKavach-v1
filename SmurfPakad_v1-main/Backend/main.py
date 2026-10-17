"""
SMURF HUNTER Backend - FastAPI Application
Anti-Money Laundering Detection System
"""
# ── PyTorch/Transformers compatibility patch ──────────────────────────────────
# transformers >=4.41 calls _register_pytree_node(serialized_type_name=...)
# but some PyTorch builds don't support that kwarg. Wrap it to swallow extras.
try:
    import torch.utils._pytree as _tp
    if hasattr(_tp, "_register_pytree_node"):
        _orig_rp = _tp._register_pytree_node
        def _patched_register(*args, **kwargs):
            import inspect
            sig = inspect.signature(_orig_rp)
            valid = {k: v for k, v in kwargs.items() if k in sig.parameters}
            return _orig_rp(*args, **valid)
        _tp._register_pytree_node = _patched_register
        _tp.register_pytree_node = _patched_register
except Exception:
    pass
# ─────────────────────────────────────────────────────────────────────────────


import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.config import settings
from app.routers import (
    auth_router,
    dashboard_router,
    upload_router,
    analysis_router,
    graph_router,
    reports_router,
    settings_router,
    ws_router,
    safeguard_router,
    ibm_ai_router,
    agent_router,
    governance_router,
    federated_router,
    watson_nlp_router,
)
from app.services.ml_service import ml_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager
    Handles startup and shutdown events
    """
    # Startup
    logger.info("Starting SMURF HUNTER Backend...")
    
    # Load ML model
    try:
        ml_service.load_model()
        logger.info("ML model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load ML model: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down SMURF HUNTER Backend...")
    from app.services.ibm_watsonx_service import ibm_watsonx_service
    await ibm_watsonx_service.close()


# Create FastAPI application
app = FastAPI(
    title="SMURF HUNTER API",
    description="Anti-Money Laundering Detection System using Graph Neural Networks",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Exception Handlers ====================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": "Validation Error",
            "details": errors
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "Internal Server Error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred"
        }
    )


# Health check endpoint
@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "SMURF HUNTER API",
        "version": "1.0.0"
    }


# API v1 prefix
API_V1_PREFIX = "/api/v1"

# Authentication
app.include_router(auth_router, prefix=API_V1_PREFIX)

# Dashboard
app.include_router(dashboard_router, prefix=API_V1_PREFIX)

# Upload
app.include_router(upload_router, prefix=API_V1_PREFIX)

# Analysis
app.include_router(analysis_router, prefix=API_V1_PREFIX)

# Graph
app.include_router(graph_router, prefix=API_V1_PREFIX)

# Reports
app.include_router(reports_router, prefix=API_V1_PREFIX)

# Settings
app.include_router(settings_router, prefix=API_V1_PREFIX)

# WebSocket (no prefix)
app.include_router(ws_router)

# Safeguard (Chrome Extension payment security)
app.include_router(safeguard_router, prefix=API_V1_PREFIX)

# IBM AI (watsonx.ai powered analyst briefs)
app.include_router(ibm_ai_router, prefix=API_V1_PREFIX)

# AML Agent (autonomous investigation agent powered by watsonx.ai)
app.include_router(agent_router, prefix=API_V1_PREFIX)

# AI Governance (bias detection, fairness, drift — watsonx.governance)
app.include_router(governance_router, prefix=API_V1_PREFIX)

# Federated Learning (cross-bank privacy-preserving training)
app.include_router(federated_router, prefix=API_V1_PREFIX)

# IBM Watson NLP (transaction narration analysis)
app.include_router(watson_nlp_router, prefix=API_V1_PREFIX)


# ==================== Health Check ====================

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "smurf-hunter-api",
        "version": "1.0.0"
    }


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to SMURF HUNTER API",
        "docs": "/docs",
        "health": "/health"
    }


# ==================== Run Application ====================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
