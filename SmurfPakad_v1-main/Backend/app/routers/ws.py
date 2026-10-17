"""
WebSocket Router
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from typing import Optional
import json

from app.core.websocket import ws_manager
from app.core.security import decode_access_token
from app.core.database_service import database_service as supabase_client

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
@router.websocket("/api/v1/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None)
):
    """
    WebSocket connection for real-time updates
    
    Connect with token query parameter for authentication
    Receives updates for:
    - upload_progress: File upload progress
    - analysis_progress: ML analysis progress
    - analysis_complete: Analysis completion
    - report_ready: Report generation complete
    """
    user_id = None
    
    # Verify token if provided
    if token:
        try:
            payload = decode_access_token(token)
            user_id = payload.get("sub")
        except Exception:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # Accept connection
    await ws_manager.connect(websocket, user_id)
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                message_type = message.get("type")
                
                # Handle different message types
                if message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                
                elif message_type == "subscribe":
                    # Subscribe to specific upload or analysis updates
                    resource_id = message.get("resourceId")
                    if resource_id:
                        await ws_manager.subscribe(user_id, resource_id)
                        await websocket.send_json({
                            "type": "subscribed",
                            "resourceId": resource_id
                        })
                
                elif message_type == "unsubscribe":
                    resource_id = message.get("resourceId")
                    if resource_id:
                        await ws_manager.unsubscribe(user_id, resource_id)
                        await websocket.send_json({
                            "type": "unsubscribed",
                            "resourceId": resource_id
                        })
                
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {message_type}"
                    })
                    
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })
                
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
    except Exception as e:
        ws_manager.disconnect(websocket, user_id)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
