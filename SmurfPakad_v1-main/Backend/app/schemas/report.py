"""
Report Schemas
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Literal
from datetime import datetime


class ReportGenerateRequest(BaseModel):
    uploadId: Optional[str] = None
    upload_id: Optional[str] = None
    analysis_id: Optional[str] = None
    title: Optional[str] = "AML Analysis Report"
    type: Optional[str] = "compliance"
    format: Optional[str] = "pdf"
    includeGraph: bool = True
    includePatterns: bool = True
    includeAddresses: bool = True

    @property
    def target_upload_id(self) -> str:
        return self.uploadId or self.upload_id or self.analysis_id or ""



class ReportResponse(BaseModel):
    id: str
    uploadId: str
    type: str
    status: str
    createdAt: datetime
    fileSize: Optional[int] = None
    downloadUrl: Optional[str] = None


class ReportListItem(BaseModel):
    id: str
    name: str
    uploadId: str
    type: str
    format: str
    status: str
    createdAt: datetime
    fileSize: Optional[int] = None


class ReportListResponse(BaseModel):
    reports: List[ReportListItem]
    pagination: Dict[str, int]
