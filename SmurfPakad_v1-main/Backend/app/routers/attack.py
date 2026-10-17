"""
Attack Simulation Router - Endpoints for live smurfing attack demos
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from pydantic import BaseModel

from app.services.attack_simulator import attack_simulator, AttackPattern, EventType
from app.dependencies import get_current_user
from app.core.websocket import ws_manager

router = APIRouter(prefix="/attack", tags=["Attack Simulation"])


class StartAttackRequest(BaseModel):
    pattern: str = "smurfing"
    duration: int = 20


class AttackStatusResponse(BaseModel):
    running: bool
    pattern: str
    duration: int
    events_count: int
    wallets: dict


@router.post("/start")
async def start_attack(
    request: StartAttackRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Start a live smurfing attack simulation.
    
    Patterns:
    - smurfing: Classic fan-out to mules then collector (20s)
    - layering: 6-layer peel chain (20s) 
    - circular: 2-round circular flow across 4 nodes (20s)
    - fan_out: Just the fan-out phase (10s)
    
    Returns immediately and streams events via WebSocket.
    """
    user_id = current_user["sub"]
    
    # Validate pattern
    try:
        pattern = AttackPattern(request.pattern.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid pattern. Choose from: {[p.value for p in AttackPattern]}"
        )
    
    duration = max(5, min(request.duration, 60))  # Clamp 5-60 seconds
    
    # Run simulation in background
    import asyncio
    asyncio.create_task(_run_attack_background(pattern, duration, user_id))
    
    return {
        "status": "started",
        "pattern": pattern.value,
        "duration": duration,
        "message": "Attack simulation started. Events streaming via WebSocket."
    }


async def _run_attack_background(pattern: AttackPattern, duration: int, user_id: str):
    """Background task to run attack simulation"""
    try:
        async for event in attack_simulator.run_simulation(pattern, duration):
            # Events are automatically broadcast via WebSocket in simulator
            pass
        
        # Notify completion
        await ws_manager.broadcast_to_all({
            "type": "attack_complete",
            "pattern": pattern.value,
            "duration": duration,
            "user_id": user_id
        })
    except Exception as e:
        print(f"Attack simulation error: {e}")
        await ws_manager.broadcast_to_all({
            "type": "attack_error",
            "error": str(e),
            "pattern": pattern.value
        })


@router.post("/stop")
async def stop_attack(current_user: dict = Depends(get_current_user)):
    """Stop the running attack simulation"""
    attack_simulator.stop()
    return {"status": "stopped", "message": "Attack simulation stopped"}


@router.get("/status", response_model=AttackStatusResponse)
async def get_attack_status(current_user: dict = Depends(get_current_user)):
    """Get current attack simulation status"""
    return AttackStatusResponse(
        running=attack_simulator.running,
        pattern=attack_simulator.pattern.value,
        duration=int(attack_simulator.duration),
        events_count=len(attack_simulator.events),
        wallets=attack_simulator.get_wallet_state()
    )


@router.get("/wallets")
async def get_wallet_state(current_user: dict = Depends(get_current_user)):
    """Get current state of all wallets in the simulation"""
    return attack_simulator.get_wallet_state()


@router.get("/events")
async def get_events(
    limit: int = 50,
    event_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get recent attack events"""
    events = attack_simulator.events
    
    if event_type:
        try:
            et = EventType(event_type)
            events = [e for e in events if e.type == et]
        except ValueError:
            pass
    
    return {
        "events": [
            {
                "id": e.id,
                "timestamp": e.timestamp,
                "type": e.type.value,
                "from_wallet": e.from_wallet,
                "to_wallet": e.to_wallet,
                "amount": e.amount,
                "wallet_updates": e.wallet_updates,
                "pattern_info": e.pattern_info,
                "alert_info": e.alert_info
            }
            for e in events[-limit:]
        ],
        "total": len(events)
    }


@router.post("/demo/quick")
async def quick_demo(current_user: dict = Depends(get_current_user)):
    """Quick 10-second demo for judges"""
    user_id = current_user["sub"]
    
    import asyncio
    asyncio.create_task(_run_attack_background(AttackPattern.FAN_OUT, 10, user_id))
    
    return {
        "status": "started",
        "pattern": "fan_out",
        "duration": 10,
        "message": "Quick demo started. Watch the Live Threat Map!"
    }