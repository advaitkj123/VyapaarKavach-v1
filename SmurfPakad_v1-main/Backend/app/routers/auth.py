from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import RedirectResponse

from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    RefreshTokenRequest,
    LogoutResponse,
    UserResponse
)
from app.services.auth_service import auth_service
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    """Register a new user with email and password"""
    try:
        user = await auth_service.register(
            email=request.email,
            password=request.password,
            full_name=request.full_name or request.name
        )
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/refresh")
async def refresh_token(request: RefreshTokenRequest):
    """Refresh access token"""
    tok = request.refresh_token or request.refreshToken
    if not tok:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing refresh token"
        )
    try:
        result = await auth_service.refresh_token(tok)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )


@router.post("/login", response_model=TokenResponse)
async def login(request: Request):
    """
    Login endpoint supporting:
    - OAuth JSON: {"code": "...", "provider": "google"}
    - Password JSON: {"username": "...", "password": "..."}
    - Form data: username=...&password=...
    """
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON")
        if body.get("code"):
            try:
                result = await auth_service.oauth_login(
                    code=body["code"],
                    provider=body.get("provider", "google")
                )
                return result
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authentication failed")
        username = body.get("username") or body.get("email")
        password = body.get("password")
    else:
        form = await request.form()
        username = form.get("username") or form.get("email")
        password = form.get("password")
    
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    try:
        result = await auth_service.login_with_password(username=username, password=password)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@router.get("/google")
async def google_oauth_redirect():
    """
    Redirect to Google OAuth authorization URL
    """
    client_id = settings.GOOGLE_CLIENT_ID
    # Redirect URI MUST match exactly what's registered in Google Cloud Console
    # This should be the FRONTEND callback URL where Google sends the code
    redirect_uri = f"{settings.FRONTEND_URL}/cryptoflow/auth/callback"
    
    if not client_id or client_id == "your-google-client-id":
        # Return a mock URL for development
        return {
            "authorization_url": f"{settings.FRONTEND_URL}/cryptoflow/auth/callback?code=mock_auth_code"
        }
    
    authorization_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    
    return {"authorization_url": authorization_url}


@router.get("/google/callback")
async def google_oauth_callback(code: str):
    """
    Handle Google OAuth callback - exchanges code for tokens
    
    Frontend calls this after receiving the code from Google
    """
    try:
        result = await auth_service.oauth_login(
            code=code,
            provider="google"
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )




@router.post("/logout", response_model=LogoutResponse)
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Logout endpoint
    
    Invalidate the current user's session
    """
    await auth_service.logout(current_user["sub"])
    return LogoutResponse()


@router.options("/logout")
async def logout_options():
    """
    Handle CORS preflight for logout
    """
    return Response(status_code=200)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get current user information (alias for /user)
    """
    user = await auth_service.get_current_user(current_user["sub"])
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        avatar=user.get("avatar"),
        createdAt=user.get("created_at")
    )


@router.get("/user", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """
    Get current user information
    """
    user = await auth_service.get_current_user(current_user["sub"])
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        avatar=user.get("avatar"),
        createdAt=user.get("created_at")
    )
