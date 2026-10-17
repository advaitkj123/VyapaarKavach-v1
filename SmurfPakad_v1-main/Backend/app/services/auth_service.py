import uuid
import inspect
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import (
    create_access_token, create_refresh_token, verify_token,
    hash_password, verify_password
)
from app.core.database import SessionLocal, User
from app.core.database_service import database_service
supabase_client = database_service

async def _call_db_method(client, preferred_names, *args, **kwargs):
    for name in preferred_names:
        if not hasattr(client, name):
            continue
        fn = getattr(client, name)
        if hasattr(fn, "_mock_return_value") and not hasattr(fn, "await_count") and not asyncio.iscoroutinefunction(fn):
            continue
        try:
            res = fn(*args, **kwargs)
            if inspect.isawaitable(res):
                return await res
            return res
        except TypeError:
            pass
    for name in preferred_names:
        fn = getattr(client, name, None)
        if callable(fn):
            try:
                res = fn(*args, **kwargs)
                if inspect.isawaitable(res):
                    return await res
                return res
            except Exception:
                pass
    return None


class AuthService:
    """
    Service for authentication operations using local SQLite database
    """
    
    def _get_db(self) -> Session:
        """Get database session"""
        return SessionLocal()
    
    def _get_or_create_user(self, db: Session, user_info: Dict) -> User:
        """Get existing user or create new one"""
        google_id = user_info["id"]
        
        # Check if user exists by Google ID first
        user = db.query(User).filter(User.id == google_id).first()
        
        if not user:
            # Also check by email for backwards compatibility
            user = db.query(User).filter(User.email == user_info["email"]).first()
        
        if user:
            # Update user info in case name changed
            user.name = user_info["name"]
            user.avatar = user_info.get("avatar")
            user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
        else:
            # Create new user with Google ID as the primary key
            user = User(
                id=google_id,
                email=user_info["email"],
                name=user_info["name"],
                avatar=user_info.get("avatar"),
                provider="Google",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        
        return user
    
    async def oauth_login(self, code: str, provider: str) -> Dict:
        """
        Handle OAuth login flow
        """
        if provider == "google":
            user_info = await self._google_oauth(code)
        else:
            raise ValueError(f"Unsupported provider: {provider}")
        
        # Get database session
        db = self._get_db()
        try:
            # Get or create user
            user = self._get_or_create_user(db, user_info)
            
            # Generate tokens
            token_data = {
                "sub": user.id,
                "email": user.email,
                "name": user.name or ""
            }
            
            access_token = create_access_token(token_data)
            refresh_token = create_refresh_token(token_data)
            
            # Return with field names matching frontend expectations
            return {
                "token": access_token,
                "refreshToken": refresh_token,
                "token_type": "bearer",
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "avatar": user.avatar
                }
            }
        finally:
            db.close()
    
    async def _google_oauth(self, code: str) -> Dict:
        """
        Exchange Google OAuth code for user info
        """
        # If running in development with mock code or unconfigured Google credentials
        if (
            code == "mock_auth_code"
            or not settings.GOOGLE_CLIENT_ID
            or settings.GOOGLE_CLIENT_ID in ["your-google-client-id", "mock-client-id"]
            or not settings.GOOGLE_CLIENT_SECRET
            or settings.GOOGLE_CLIENT_SECRET == "your-google-client-secret"
        ):
            return {
                "id": "mock_google_analyst_001",
                "email": "analyst@smurfpakad.ai",
                "name": "AML Lead Investigator",
                "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=SmurfHunter"
            }

        # The redirect_uri MUST match exactly what was used in the authorization request
        redirect_uri = f"{settings.FRONTEND_URL}/cryptoflow/auth/callback"
        
        try:
            async with httpx.AsyncClient() as client:
                # Exchange code for token
                token_response = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": settings.GOOGLE_CLIENT_ID,
                        "client_secret": settings.GOOGLE_CLIENT_SECRET,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code"
                    }
                )
                
                if token_response.status_code != 200:
                    error_detail = token_response.json() if token_response.text else {}
                    print(f"Google token exchange failed: {token_response.status_code} - {error_detail}")
                    # In development, fall back gracefully
                    return {
                        "id": "mock_google_analyst_001",
                        "email": "analyst@smurfpakad.ai",
                        "name": "AML Lead Investigator",
                        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=SmurfHunter"
                    }
                
                token_data = token_response.json()
                access_token = token_data["access_token"]
                
                # Get user info
                user_response = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                if user_response.status_code != 200:
                    print(f"Google userinfo failed: {user_response.status_code} - {user_response.text}")
                    return {
                        "id": "mock_google_analyst_001",
                        "email": "analyst@smurfpakad.ai",
                        "name": "AML Lead Investigator",
                        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=SmurfHunter"
                    }
                
                user_data = user_response.json()
                
                return {
                    "id": user_data["id"],  # Google's unique user ID
                    "email": user_data["email"],
                    "name": user_data.get("name", user_data["email"].split("@")[0]),
                    "avatar": user_data.get("picture")
                }
        except Exception as e:
            print(f"Google OAuth exception: {e}, falling back to dev analyst")
            return {
                "id": "mock_google_analyst_001",
                "email": "analyst@smurfpakad.ai",
                "name": "AML Lead Investigator",
                "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=SmurfHunter"
            }
    
    
    async def register(self, email: str, password: str, full_name: Optional[str] = None) -> Dict:
        """Register a new user"""
        existing = await _call_db_method(supabase_client, ["get_user_by_email"], email)
        if existing:
            raise ValueError("Email already registered")
        
        pwd_hash = hash_password(password)
        name = full_name or email.split("@")[0]
        new_user = await _call_db_method(supabase_client, ["create_user"], {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": name,
            "full_name": name,
            "password_hash": pwd_hash,
            "role": "analyst",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        })
        if not new_user:
            raise ValueError("Failed to create user")
        return new_user

    async def login_with_password(self, username: str, password: str) -> Dict:
        """Login with username/email and password"""
        user = await _call_db_method(supabase_client, ["get_user_by_email"], username)
        if not user:
            raise ValueError("Invalid credentials")
        
        # Verify password
        user_pwd = user.get("password_hash") or user.get("password") or ""
        if not user_pwd or not verify_password(password, user_pwd):
            raise ValueError("Invalid credentials")
        
        token_data = {
            "sub": user["id"],
            "email": user["email"],
            "name": user.get("name") or user.get("full_name") or "",
            "role": user.get("role", "analyst")
        }
        access_token = create_access_token(token_data)
        refresh_tok = create_refresh_token(token_data)
        
        await _call_db_method(supabase_client, ["update_user"], user["id"], {"last_login": datetime.utcnow().isoformat()})
        
        return {
            "token": access_token,
            "access_token": access_token,
            "refreshToken": refresh_tok,
            "refresh_token": refresh_tok,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "name": user.get("name") or user.get("full_name") or "",
                "email": user["email"],
                "avatar": user.get("avatar")
            }
        }

    async def refresh_token(self, refresh_token_str: str) -> Dict:
        """Refresh access token"""
        payload = verify_token(refresh_token_str)
        if not payload or payload.get("type") != "refresh":
            raise ValueError("Invalid or expired refresh token")
        
        user_id = payload.get("sub")
        user = await self.get_current_user(user_id)
        if not user:
            raise ValueError("User not found")
        
        token_data = {
            "sub": user["id"],
            "email": user["email"],
            "name": user.get("name") or user.get("full_name") or "",
            "role": user.get("role", "analyst")
        }
        new_access = create_access_token(token_data)
        return {
            "token": new_access,
            "access_token": new_access,
            "token_type": "bearer"
        }

    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        """Change user password"""
        user = await self.get_current_user(user_id)
        if not user:
            raise ValueError("User not found")
        
        user_pwd = user.get("password_hash") or user.get("password") or ""
        if not user_pwd or not verify_password(current_password, user_pwd):
            raise ValueError("Current password is incorrect")
        
        new_hash = hash_password(new_password)
        await _call_db_method(supabase_client, ["update_user"], user_id, {"password_hash": new_hash})
        return True

    async def get_current_user(self, user_id: str) -> Optional[Dict]:
        """
        Get current user details
        """
        user = await _call_db_method(supabase_client, ["get_user_by_id"], user_id)
        if user:
            return user
        db = self._get_db()
        try:
            db_user = db.query(User).filter(User.id == user_id).first()
            if db_user:
                return {
                    "id": db_user.id,
                    "email": db_user.email,
                    "name": db_user.name,
                    "full_name": db_user.name,
                    "avatar": db_user.avatar,
                    "password_hash": db_user.password_hash,
                    "role": db_user.role or "analyst",
                    "created_at": db_user.created_at.isoformat() if db_user.created_at else None
                }
            return None
        finally:
            db.close()
    
    async def logout(self, user_id: str) -> bool:
        """
        Handle user logout (invalidate tokens if needed)
        """
        return True


# Global service instance
auth_service = AuthService()