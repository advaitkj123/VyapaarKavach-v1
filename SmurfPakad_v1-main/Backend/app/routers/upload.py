"""
Upload Router
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from typing import Optional
from datetime import datetime

from app.schemas.upload import (
    UploadResponse,
    UploadDetail,
    UploadHistoryResponse,
    UploadListItem
)
from app.schemas.common import MessageResponse
from app.services.upload_service import upload_service
from app.dependencies import get_current_user

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("", response_model=UploadResponse)
@router.post("/", response_model=UploadResponse)
@router.post("/file", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a transaction file
    
    Accepts CSV, Excel (XLSX), or JSON files
    Maximum file size: 100MB
    """
    user_id = current_user["sub"]
    
    try:
        result = await upload_service.process_upload(
            file=file,
            user_id=user_id,
            description=description
        )
        return UploadResponse(**result)
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload processing failed: {str(e)}"
        )


@router.get("/history", response_model=UploadHistoryResponse)
async def get_upload_history(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    status: Optional[str] = Query(default=None, pattern="^(completed|processing|failed)$"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get upload history
    
    Returns paginated list of user's uploads
    """
    user_id = current_user["sub"]
    
    uploads, total = await upload_service.get_upload_history(
        user_id=user_id,
        page=page,
        limit=limit,
        status=status
    )
    
    return UploadHistoryResponse(
        uploads=[
            UploadListItem(
                id=u["id"],
                name=u.get("filename") or u.get("name") or "Unknown",
                date=u.get("uploaded_at") or u.get("uploadedAt") or u.get("created_at") or u.get("date") or datetime.utcnow(),
                status=u["status"],
                records=u.get("row_count", 0),
                size=u.get("size") or u.get("size_bytes") or u.get("file_size") or 0
            )
            for u in uploads
        ],
        pagination={
            "page": page,
            "limit": limit,
            "total": total or 0,
            "totalPages": ((total or 0) + limit - 1) // limit
        }
    )


@router.get("/{upload_id}", response_model=UploadDetail)
async def get_upload_detail(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get upload details
    
    Returns detailed information about a specific upload
    """
    user_id = current_user["sub"]
    
    upload = await upload_service.get_upload_detail(upload_id, user_id)
    
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found"
        )
    
    return UploadDetail(
        id=upload["id"],
        name=upload.get("filename", "Unknown"),
        uploadedAt=upload.get("uploaded_at", ""),
        status=upload["status"],
        records=upload.get("row_count", 0),
        size=upload.get("size", 0),
        fileType=upload.get("file_type", ""),
        processingTime=upload.get("processing_time"),
        description=upload.get("description")
    )


@router.get("/{upload_id}/status")
async def get_upload_status(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get upload processing status"""
    user_id = current_user["sub"]
    upload = await upload_service.get_upload_detail(upload_id, user_id)
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found"
        )
    return {"status": upload["status"], "uploadId": upload["id"]}


@router.delete("/{upload_id}", response_model=MessageResponse)
async def delete_upload(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete an upload
    
    Removes the upload and all associated data
    """
    user_id = current_user["sub"]
    
    raw_upload = await upload_service.get_raw_upload(upload_id)
    if not raw_upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found"
        )
    if raw_upload.get("user_id") and raw_upload.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this upload"
        )
    
    success = await upload_service.delete_upload(upload_id, user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found"
        )
    
    return MessageResponse(message="Upload deleted successfully")
