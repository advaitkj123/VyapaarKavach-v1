"""
Security utilities - JWT handling, password hashing, etc.
"""
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import jwt  # type: ignore
from passlib.context import CryptContext  # type: ignore

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return encoded_jwt


def create_refresh_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT refresh token
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
        )
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return encoded_jwt


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify and decode a JWT token
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# Alias for backward compatibility
def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and verify an access token (alias for verify_token)
    """
    return verify_token(token)


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash
    """
    return pwd_context.verify(plain_password, hashed_password)


def generate_api_key() -> str:
    """
    Generate a secure API key
    """
    return f"sk-{secrets.token_urlsafe(32)}"


def mask_api_key(key: str) -> str:
    """
    Mask an API key for display
    """
    if len(key) <= 8:
        return "****"
    return f"{key[:3]}****{key[-4:]}"


def hash_api_key(key: str) -> str:
    """
    Hash an API key for storage
    """
    return hashlib.sha256(key.encode()).hexdigest()


def generate_webhook_secret() -> str:
    """
    Generate a webhook signing secret
    """
    return secrets.token_hex(32)


def sign_webhook_payload(payload: str, secret: str) -> str:
    """
    Sign a webhook payload with HMAC-SHA256
    """
    import hmac
    signature = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"sha256={signature}"
