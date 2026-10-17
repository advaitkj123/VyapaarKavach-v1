"""
Application Configuration
Loads environment variables and provides configuration settings
"""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "SmurfPakad API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS - use str, split in app. Set as: CORS_ORIGINS=http://localhost:8000,https://smurfpakad.com
    CORS_ORIGINS: str = "http://localhost:8000,http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:8080,http://127.0.0.1:5173,http://127.0.0.1:8080"
    
    # Frontend URL for OAuth redirects
    FRONTEND_URL: str = "http://localhost:5173"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
    
    # JWT
    JWT_SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database (SQLite local)
    DATABASE_URL: str = "sqlite:///./smurfpakad.db"
    
    # OAuth (Google only)
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    
    # OAuth Redirect URL - MUST match exactly what's registered in Google Cloud Console
    OAUTH_REDIRECT_URL: str = "http://localhost:8000/api/v1/auth/google/callback"
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100MB
    ALLOWED_EXTENSIONS: str = ".csv,.xlsx,.xls,.json"
    
    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",") if ext.strip()]
    
    # ML Model - points to best_model_tg.pt in AI/All_models/
    MODEL_PATH: str = "../AI/All_models/best_model_tg.pt"
    MODEL_DIR: str = "../AI/All_models"
    
    # IBM watsonx.ai
    IBM_WATSONX_API_KEY: Optional[str] = None
    IBM_WATSONX_PROJECT_ID: Optional[str] = None
    IBM_WATSONX_URL: str = "https://us-south.ml.cloud.ibm.com"
    IBM_WATSONX_MODEL_ID: str = "ibm/granite-3-8b-instruct"
    
    # Redis (for caching and rate limiting)
    REDIS_URL: Optional[str] = None  # Set to redis://localhost:6379 if using Redis
    
    # Rate Limiting
    RATE_LIMIT_AUTH: int = 10  # per minute
    RATE_LIMIT_UPLOAD: int = 20  # per hour
    RATE_LIMIT_ANALYSIS: int = 100  # per minute
    RATE_LIMIT_REPORT: int = 10  # per hour
    RATE_LIMIT_DEFAULT: int = 1000  # per hour
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60
    
    # Extra fields from .env (compatibility)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    OAUTH_REDIRECT_URL: str = "http://localhost:8000/auth/callback"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
