"""
API Routers
"""
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.upload import router as upload_router
from app.routers.analysis import router as analysis_router
from app.routers.graph import router as graph_router
from app.routers.reports import router as reports_router
from app.routers.settings import router as settings_router
from app.routers.ws import router as ws_router
from app.routers.safeguard import router as safeguard_router
from app.routers.ibm_ai import router as ibm_ai_router
from app.routers.agent import router as agent_router
from app.routers.governance import router as governance_router
from app.routers.federated import router as federated_router
from app.routers.watson_nlp import router as watson_nlp_router
from app.routers.attack import router as attack_router

__all__ = [
    "auth_router",
    "dashboard_router",
    "upload_router",
    "analysis_router",
    "graph_router",
    "reports_router",
    "settings_router",
    "ws_router",
    "safeguard_router",
    "ibm_ai_router",
    "agent_router",
    "governance_router",
    "federated_router",
    "watson_nlp_router",
    "attack_router",
]