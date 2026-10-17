"""
Upload Schemas
"""
from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


class UploadRequest(BaseModel):
    description: Optional[str] = None


class UploadResponse(BaseModel):
    id: str
    name: str
    status: Literal["processing", "completed", "failed"]
    uploadedAt: datetime


class UploadDetail(BaseModel):
    id: str
    name: str
    uploadedAt: datetime
    status: Literal["processing", "completed", "failed"]
    records: int
    size: int  # bytes
    fileType: str
    processingTime: Optional[float] = None  # seconds
    description: Optional[str] = None


class UploadListItem(BaseModel):
    id: str
    name: str
    date: datetime
    status: Literal["processing", "completed", "failed"]
    records: int
    size: int


class UploadHistoryResponse(BaseModel):
    uploads: List[UploadListItem]
    pagination: dict


class UploadProgress(BaseModel):
    uploadId: str
    progress: int  # 0-100
    status: str
    message: Optional[str] = None
