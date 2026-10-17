"""
Settings Router
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.settings import (
    ProfileResponse,
    ProfileUpdateRequest,
    NotificationSettings,
    SecuritySettings,
    APIKeyResponse,
    APIKeyCreateRequest,
    APIKeyListResponse,
    APIKeyListItem,
    WebhookResponse,
    WebhookCreateRequest,
    WebhookListResponse
)
from app.schemas.common import MessageResponse
from app.core.database_service import database_service
from app.core.security import generate_api_key, hash_api_key
from app.dependencies import get_current_user

router = APIRouter(prefix="/settings", tags=["Settings"])


# ==================== Profile ====================

@router.get("/profile", response_model=ProfileResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get user profile"""
    user_id = current_user["sub"]
    user = await database_service.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    return ProfileResponse(
        id=user["id"],
        email=user["email"],
        name=user.get("name"),
        avatar=user.get("avatar"),
        createdAt=user["created_at"],
        lastLogin=user.get("last_login")
    )


@router.put("/profile", response_model=ProfileResponse)
async def update_profile(
    request: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update user profile"""
    user_id = current_user["sub"]
    
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.avatar is not None:
        update_data["avatar"] = request.avatar
    
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    
    user = await database_service.update_user(user_id, update_data)
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    return ProfileResponse(
        id=user["id"],
        email=user["email"],
        name=user.get("name"),
        avatar=user.get("avatar"),
        createdAt=user["created_at"],
        lastLogin=user.get("last_login")
    )


# ==================== Notifications ====================

@router.get("/notifications", response_model=NotificationSettings)
async def get_notification_settings(current_user: dict = Depends(get_current_user)):
    """Get notification settings"""
    user_id = current_user["sub"]
    user = await database_service.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    settings = user.get("notification_settings", {})
    
    return NotificationSettings(
        emailAlerts=settings.get("email_alerts", True),
        uploadComplete=settings.get("upload_complete", True),
        analysisComplete=settings.get("analysis_complete", True),
        suspiciousActivity=settings.get("suspicious_activity", True),
        weeklyDigest=settings.get("weekly_digest", False)
    )


@router.put("/notifications", response_model=NotificationSettings)
async def update_notification_settings(
    request: NotificationSettings,
    current_user: dict = Depends(get_current_user)
):
    """Update notification settings"""
    user_id = current_user["sub"]
    
    settings = {
        "email_alerts": request.emailAlerts,
        "upload_complete": request.uploadComplete,
        "analysis_complete": request.analysisComplete,
        "suspicious_activity": request.suspiciousActivity,
        "weekly_digest": request.weeklyDigest
    }
    
    await database_service.update_user(user_id, {"notification_settings": settings})
    return request


# ==================== Security ====================

@router.get("/security", response_model=SecuritySettings)
async def get_security_settings(current_user: dict = Depends(get_current_user)):
    """Get security settings"""
    user_id = current_user["sub"]
    user = await database_service.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    settings = user.get("security_settings", {})
    
    return SecuritySettings(
        twoFactorEnabled=settings.get("two_factor_enabled", False),
        sessionTimeout=settings.get("session_timeout", 60),
        ipWhitelist=settings.get("ip_whitelist", [])
    )


@router.put("/security", response_model=SecuritySettings)
async def update_security_settings(
    request: SecuritySettings,
    current_user: dict = Depends(get_current_user)
):
    """Update security settings"""
    user_id = current_user["sub"]
    
    settings = {
        "two_factor_enabled": request.twoFactorEnabled,
        "session_timeout": request.sessionTimeout,
        "ip_whitelist": request.ipWhitelist
    }
    
    await database_service.update_user(user_id, {"security_settings": settings})
    return request


# ==================== API Keys ====================

@router.get("/api-keys", response_model=APIKeyListResponse)
async def list_api_keys(current_user: dict = Depends(get_current_user)):
    """List API keys"""
    user_id = current_user["sub"]
    keys = await database_service.list_api_keys(user_id)
    
    return APIKeyListResponse(
        keys=[
            APIKeyListItem(
                id=k["id"],
                name=k["name"],
                prefix=k["prefix"],
                createdAt=k["created_at"],
                lastUsed=k.get("last_used"),
                expiresAt=k.get("expires_at")
            )
            for k in keys
        ]
    )


@router.post("/api-keys", response_model=APIKeyResponse)
async def create_api_key(
    request: APIKeyCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new API key"""
    user_id = current_user["sub"]
    
    full_key = generate_api_key()
    key_hash = hash_api_key(full_key)
    prefix = full_key[:8]
    
    key_data = await database_service.create_api_key(
        user_id=user_id,
        name=request.name,
        key_hash=key_hash,
        prefix=prefix,
        expires_at=request.expiresAt
    )
    
    if not key_data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create API key")
    
    return APIKeyResponse(
        id=key_data["id"],
        name=key_data["name"],
        key=full_key,
        prefix=prefix,
        createdAt=key_data["created_at"],
        expiresAt=key_data.get("expires_at")
    )


@router.delete("/api-keys/{key_id}", response_model=MessageResponse)
async def delete_api_key(
    key_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an API key"""
    user_id = current_user["sub"]
    await database_service.delete_api_key(key_id, user_id)
    return MessageResponse(message="API key deleted successfully")


# ==================== Webhooks ====================

@router.get("/webhooks", response_model=WebhookListResponse)
async def list_webhooks(current_user: dict = Depends(get_current_user)):
    """List webhooks"""
    user_id = current_user["sub"]
    webhooks = await database_service.list_webhooks(user_id)
    
    return WebhookListResponse(
        webhooks=[
            WebhookResponse(
                id=w["id"],
                name=w["name"],
                url=w["url"],
                events=w["events"],
                active=w["active"],
                createdAt=w["created_at"],
                lastTriggered=w.get("last_triggered")
            )
            for w in webhooks
        ]
    )


@router.post("/webhooks", response_model=WebhookResponse)
async def create_webhook(
    request: WebhookCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new webhook"""
    user_id = current_user["sub"]
    
    webhook = await database_service.create_webhook(
        user_id=user_id,
        name=request.name,
        url=str(request.url),
        events=request.events,
        secret=request.secret
    )
    
    if not webhook:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create webhook")
    
    return WebhookResponse(
        id=webhook["id"],
        name=webhook["name"],
        url=webhook["url"],
        events=webhook["events"],
        active=webhook["active"],
        createdAt=webhook["created_at"]
    )


@router.put("/webhooks/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: str,
    request: WebhookCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update a webhook"""
    user_id = current_user["sub"]
    
    webhook = await database_service.update_webhook(
        webhook_id=webhook_id,
        user_id=user_id,
        name=request.name,
        url=str(request.url),
        events=request.events,
        secret=request.secret
    )
    
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    
    return WebhookResponse(
        id=webhook["id"],
        name=webhook["name"],
        url=webhook["url"],
        events=webhook["events"],
        active=webhook["active"],
        createdAt=webhook["created_at"]
    )


@router.delete("/webhooks/{webhook_id}", response_model=MessageResponse)
async def delete_webhook(
    webhook_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a webhook"""
    user_id = current_user["sub"]
    await database_service.delete_webhook(webhook_id, user_id)
    return MessageResponse(message="Webhook deleted successfully")
