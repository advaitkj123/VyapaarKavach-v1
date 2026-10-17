"""
Settings Schemas
"""
from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from datetime import datetime


# ==================== Profile ====================

class ProfileResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    createdAt: datetime
    lastLogin: Optional[datetime] = None


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    avatar: Optional[str] = None
    email: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ==================== Notifications ====================

class NotificationSettings(BaseModel):
    emailAlerts: bool = True
    uploadComplete: bool = True
    analysisComplete: bool = True
    suspiciousActivity: bool = True
    weeklyDigest: bool = False


# ==================== Security ====================

class SecuritySettings(BaseModel):
    twoFactorEnabled: bool = False
    sessionTimeout: int = 60
    ipWhitelist: List[str] = []


# ==================== API Keys ====================

class APIKeyCreateRequest(BaseModel):
    name: str
    expiresAt: Optional[str] = None


class APIKeyResponse(BaseModel):
    id: str
    name: str
    key: str
    prefix: str
    createdAt: datetime
    expiresAt: Optional[datetime] = None


class APIKeyListItem(BaseModel):
    id: str
    name: str
    prefix: str
    createdAt: datetime
    lastUsed: Optional[datetime] = None
    expiresAt: Optional[datetime] = None


class APIKeyListResponse(BaseModel):
    keys: List[APIKeyListItem]


# ==================== Webhooks ====================

class WebhookCreateRequest(BaseModel):
    name: str
    url: HttpUrl
    events: List[str]
    secret: Optional[str] = None


class WebhookResponse(BaseModel):
    id: str
    name: str
    url: str
    events: List[str]
    active: bool
    createdAt: datetime
    lastTriggered: Optional[datetime] = None


class WebhookListResponse(BaseModel):
    webhooks: List[WebhookResponse]
