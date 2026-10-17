"""
Common schemas used across the application
"""
from pydantic import BaseModel
from typing import Optional, Generic, TypeVar, List
from datetime import datetime

T = TypeVar('T')


class PaginationParams(BaseModel):
    page: int = 1
    limit: int = 10


class PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    pagination: PaginationMeta


class MessageResponse(BaseModel):
    message: str


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[dict] = None
    requestId: Optional[str] = None


class TimestampMixin(BaseModel):
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
