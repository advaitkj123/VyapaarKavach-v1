from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    name: Optional[str] = None


class LoginRequest(BaseModel):
    code: Optional[str] = None
    provider: Optional[Literal["google", "github"]] = "google"
    username: Optional[str] = None
    password: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    avatar: Optional[str] = None
    createdAt: Optional[datetime] = None


class TokenResponse(BaseModel):
    token: Optional[str] = None
    access_token: Optional[str] = None
    refreshToken: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: Optional[UserResponse] = None


class LogoutResponse(BaseModel):
    message: str = "Logged out successfully"


class RefreshTokenRequest(BaseModel):
    refreshToken: Optional[str] = None
    refresh_token: Optional[str] = None
