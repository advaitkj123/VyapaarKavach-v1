"""
Federated Learning Router — Cross-Bank AML Training API
=========================================================
Provides endpoints for the federated learning simulation.

Note: federated_learning.py uses only numpy (no torch), so it
imports cleanly regardless of PyTorch environment issues.
"""
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException

# Add AI/ML to path for the federated_learning module (numpy only, no torch)
ML_PATH = Path(__file__).parent.parent.parent.parent / "AI" / "ML"
sys.path.insert(0, str(ML_PATH))

try:
    from federated_learning import federated_trainer
    _fl_available = True
except Exception as e:
    _fl_available = False
    _fl_error = str(e)


router = APIRouter(prefix="/federated", tags=["Federated Learning"])


@router.post("/simulate")
async def simulate_federated_training(num_rounds: int = 10):
    """
    Run a full federated learning simulation.

    Simulates 3 banks (Paytm, PhonePe, GPay) training locally
    and sharing only gradients via FedAvg.

    Compares federated vs isolated training accuracy.
    """
    if not _fl_available:
        raise HTTPException(status_code=503, detail=f"Federated module unavailable: {_fl_error}")
    try:
        result = federated_trainer.simulate_full_training(num_rounds=min(num_rounds, 20))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_federated_status():
    """Get current federated training status and history."""
    if not _fl_available:
        return {
            "status": "unavailable",
            "error": _fl_error,
            "clientsRegistered": 0,
            "roundsCompleted": 0,
        }
    return {
        "status": "ready",
        "clientsRegistered": len(federated_trainer.clients),
        "roundsCompleted": len(federated_trainer.round_history),
        "clients": [
            {"name": c.name, "transactions": c.num_transactions, "fraudRate": c.fraud_rate}
            for c in federated_trainer.clients
        ],
        "latestRound": federated_trainer.round_history[-1] if federated_trainer.round_history else None,
    }
