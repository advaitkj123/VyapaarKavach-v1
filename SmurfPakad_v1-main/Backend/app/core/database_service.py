"""
Database Service - Local SQLite replacement for Supabase
"""
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
import json

from app.core.database import SessionLocal
from app.core.database import (
    User, Upload, AnalysisResult, Pattern, SuspiciousAddress, 
    Transaction, GraphSnapshot, Report, APIKey, Webhook
)


class DatabaseService:
    """Service for database operations using local SQLite"""
    
    def _get_db(self) -> Session:
        """Get database session"""
        return SessionLocal()
    
    # ==================== User Operations ====================
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        db = self._get_db()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                return {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "full_name": user.name,
                    "avatar": user.avatar,
                    "password_hash": user.password_hash,
                    "role": user.role or "analyst",
                    "settings": user.settings or {},
                    "createdAt": user.created_at.isoformat() if user.created_at else None,
                    "created_at": user.created_at.isoformat() if user.created_at else None
                }
            return None
        finally:
            db.close()
    
    async def get_user_by_email(self, email: str) -> Optional[Dict]:
        db = self._get_db()
        try:
            user = db.query(User).filter(User.email == email).first()
            if user:
                return {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "full_name": user.name,
                    "avatar": user.avatar,
                    "password_hash": user.password_hash,
                    "role": user.role or "analyst",
                    "settings": user.settings or {},
                    "createdAt": user.created_at.isoformat() if user.created_at else None,
                    "created_at": user.created_at.isoformat() if user.created_at else None
                }
            return None
        finally:
            db.close()
    
    async def create_user(self, user_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            user_id = user_data.get("id") or str(uuid.uuid4())
            name = user_data.get("name") or user_data.get("full_name") or user_data["email"].split("@")[0]
            user = User(
                id=user_id,
                email=user_data["email"],
                name=name,
                avatar=user_data.get("avatar"),
                password_hash=user_data.get("password_hash"),
                role=user_data.get("role", "analyst"),
                provider=user_data.get("provider", "local"),
                settings=user_data.get("settings", {}),
                created_at=datetime.fromisoformat(user_data["created_at"]) if isinstance(user_data.get("created_at"), str) else user_data.get("created_at", datetime.utcnow()),
                updated_at=datetime.fromisoformat(user_data["updated_at"]) if isinstance(user_data.get("updated_at"), str) else user_data.get("updated_at", datetime.utcnow())
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "full_name": user.name,
                "avatar": user.avatar,
                "role": user.role,
                "createdAt": user.created_at.isoformat() if user.created_at else None,
                "created_at": user.created_at.isoformat() if user.created_at else None
            }
        except Exception as e:
            db.rollback()
            print(f"Error creating user: {e}")
            return None
        finally:
            db.close()
    
    async def update_user(self, user_id: str, user_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                if "name" in user_data:
                    user.name = user_data["name"]
                if "full_name" in user_data:
                    user.name = user_data["full_name"]
                if "avatar" in user_data:
                    user.avatar = user_data["avatar"]
                if "password_hash" in user_data:
                    user.password_hash = user_data["password_hash"]
                if "role" in user_data:
                    user.role = user_data["role"]
                if "settings" in user_data:
                    user.settings = user_data["settings"]
                if "notification_settings" in user_data:
                    s = dict(user.settings or {})
                    s["notifications"] = user_data["notification_settings"]
                    user.settings = s
                if "security_settings" in user_data:
                    s = dict(user.settings or {})
                    s["security"] = user_data["security_settings"]
                    user.settings = s
                user.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(user)
                return {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "full_name": user.name,
                    "avatar": user.avatar,
                    "role": user.role,
                    "settings": user.settings or {},
                    "createdAt": user.created_at.isoformat() if user.created_at else None,
                    "created_at": user.created_at.isoformat() if user.created_at else None
                }
            return None
        except Exception as e:
            db.rollback()
            print(f"Error updating user: {e}")
            return None
        finally:
            db.close()
    
    # ==================== Upload Operations ====================
    
    async def create_upload(self, upload_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            upload = Upload(
                id=upload_data.get("id"),
                user_id=upload_data["user_id"],
                filename=upload_data["filename"],
                original_filename=upload_data["original_filename"],
                file_type=upload_data["file_type"],
                status=upload_data.get("status", "processing"),
                row_count=upload_data.get("row_count", 0),
                size_bytes=upload_data.get("size_bytes", 0),
                uploaded_at=datetime.fromisoformat(upload_data["uploaded_at"]) if isinstance(upload_data.get("uploaded_at"), str) else upload_data.get("uploaded_at", datetime.utcnow()),
                completed_at=datetime.fromisoformat(upload_data["completed_at"]) if upload_data.get("completed_at") else None,
                processing_time=upload_data.get("processing_time")
            )
            db.add(upload)
            db.commit()
            db.refresh(upload)
            return {
                "id": upload.id,
                "name": upload.filename,
                "status": upload.status,
                "uploadedAt": upload.uploaded_at.isoformat() if upload.uploaded_at else None
            }
        except Exception as e:
            db.rollback()
            print(f"Error creating upload: {e}")
            return None
        finally:
            db.close()
    
    async def get_upload_by_id(self, upload_id: str) -> Optional[Dict]:
        db = self._get_db()
        try:
            upload = db.query(Upload).filter(Upload.id == upload_id).first()
            if upload:
                return {
                    "id": upload.id,
                    "user_id": upload.user_id,
                    "name": upload.filename,
                    "filename": upload.filename,
                    "original_filename": upload.original_filename,
                    "file_type": upload.file_type,
                    "uploadedAt": upload.uploaded_at.isoformat() if upload.uploaded_at else None,
                    "uploaded_at": upload.uploaded_at.isoformat() if upload.uploaded_at else None,
                    "status": upload.status,
                    "records": upload.row_count,
                    "row_count": upload.row_count,
                    "size": upload.size_bytes,
                    "size_bytes": upload.size_bytes,
                    "fileType": upload.file_type,
                    "processingTime": upload.processing_time
                }
            return None
        finally:
            db.close()
    
    async def get_uploads_by_user(
        self, 
        user_id: str, 
        page: int = 1, 
        limit: int = 10,
        status: Optional[str] = None
    ) -> Tuple[List[Dict], int]:
        db = self._get_db()
        try:
            query = db.query(Upload).filter(Upload.user_id == user_id)
            if status:
                query = query.filter(Upload.status == status)
            total = query.count()
            uploads = query.order_by(Upload.uploaded_at.desc()).offset((page-1)*limit).limit(limit).all()
            
            result = []
            for upload in uploads:
                result.append({
                    "id": upload.id,
                    "name": upload.original_filename or upload.filename,
                    "filename": upload.original_filename or upload.filename,
                    "date": upload.uploaded_at.isoformat() if upload.uploaded_at else "",
                    "uploaded_at": upload.uploaded_at.isoformat() if upload.uploaded_at else "",
                    "status": upload.status,
                    "records": upload.row_count,
                    "row_count": upload.row_count,
                    "size": upload.size_bytes,
                    "size_bytes": upload.size_bytes,
                    "fileType": upload.file_type,
                    "file_type": upload.file_type,
                })
            return result, total
        finally:
            db.close()
    
    async def delete_upload(self, upload_id: str) -> bool:
        db = self._get_db()
        try:
            upload = db.query(Upload).filter(Upload.id == upload_id).first()
            if upload:
                db.delete(upload)
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            print(f"Error deleting upload: {e}")
            return False
        finally:
            db.close()
    
    async def update_upload(self, upload_id: str, upload_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            upload = db.query(Upload).filter(Upload.id == upload_id).first()
            if upload:
                if "status" in upload_data:
                    upload.status = upload_data["status"]
                if "row_count" in upload_data:
                    upload.row_count = upload_data["row_count"]
                if "completed_at" in upload_data:
                    upload.completed_at = datetime.fromisoformat(upload_data["completed_at"]) if isinstance(upload_data["completed_at"], str) else upload_data["completed_at"]
                if "processing_time" in upload_data:
                    upload.processing_time = upload_data["processing_time"]
                db.commit()
                db.refresh(upload)
                return {
                    "id": upload.id,
                    "user_id": upload.user_id,
                    "filename": upload.filename,
                    "original_filename": upload.original_filename,
                    "file_type": upload.file_type,
                    "status": upload.status,
                    "row_count": upload.row_count,
                    "size_bytes": upload.size_bytes,
                    "uploaded_at": upload.uploaded_at.isoformat() if upload.uploaded_at else None,
                    "completed_at": upload.completed_at.isoformat() if upload.completed_at else None,
                    "processing_time": upload.processing_time
                }
            return None
        except Exception as e:
            db.rollback()
            print(f"Error updating upload: {e}")
            return None
        finally:
            db.close()
    
    # ==================== Analysis Operations ====================
    
    async def create_analysis(self, analysis_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            analysis = AnalysisResult(
                upload_id=analysis_data["upload_id"],
                suspicious_node_count=analysis_data.get("suspicious_node_count", 0),
                smurfing_patterns_detected=analysis_data.get("smurfing_patterns_detected", 0),
                max_risk_score=analysis_data.get("max_risk_score", 0.0)
            )
            db.add(analysis)
            db.commit()
            db.refresh(analysis)
            return {
                "id": analysis.id,
                "uploadId": analysis.upload_id,
                "suspicious_node_count": analysis.suspicious_node_count,
                "smurfing_patterns_detected": analysis.smurfing_patterns_detected,
                "max_risk_score": analysis.max_risk_score
            }
        except Exception as e:
            db.rollback()
            print(f"Error creating analysis: {e}")
            return None
        finally:
            db.close()
    
    async def get_analysis_by_upload(self, upload_id: str) -> Optional[Dict]:
        db = self._get_db()
        try:
            analysis = db.query(AnalysisResult).filter(AnalysisResult.upload_id == upload_id).first()
            if analysis:
                return {
                    "uploadId": analysis.upload_id,
                    "suspicious_node_count": analysis.suspicious_node_count,
                    "smurfing_patterns_detected": analysis.smurfing_patterns_detected,
                    "max_risk_score": analysis.max_risk_score
                }
            return None
        finally:
            db.close()
    
    async def update_analysis(self, analysis_id: str, analysis_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            analysis = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
            if analysis:
                if "suspicious_node_count" in analysis_data:
                    analysis.suspicious_node_count = analysis_data["suspicious_node_count"]
                if "smurfing_patterns_detected" in analysis_data:
                    analysis.smurfing_patterns_detected = analysis_data["smurfing_patterns_detected"]
                if "max_risk_score" in analysis_data:
                    analysis.max_risk_score = analysis_data["max_risk_score"]
                analysis.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(analysis)
                return {
                    "id": analysis.id,
                    "uploadId": analysis.upload_id,
                    "suspicious_node_count": analysis.suspicious_node_count,
                    "smurfing_patterns_detected": analysis.smurfing_patterns_detected,
                    "max_risk_score": analysis.max_risk_score
                }
            return None
        except Exception as e:
            db.rollback()
            print(f"Error updating analysis: {e}")
            return None
        finally:
            db.close()
    
    # ==================== Pattern Operations ====================
    
    async def create_patterns(self, patterns: List[Dict[str, Any]]) -> List[Dict]:
        db = self._get_db()
        try:
            db_patterns = []
            for pattern_data in patterns:
                pattern = Pattern(
                    upload_id=pattern_data["upload_id"],
                    type=pattern_data["type"],
                    severity=pattern_data["severity"],
                    confidence=pattern_data.get("confidence", 0),
                    transactions=pattern_data.get("transactions", 0),
                    description=pattern_data.get("description"),
                    addresses=pattern_data.get("addresses", [])
                )
                db.add(pattern)
                db_patterns.append(pattern)
            db.commit()
            for pattern in db_patterns:
                db.refresh(pattern)
            return [
                {
                    "id": p.id,
                    "uploadId": p.upload_id,
                    "type": p.type,
                    "severity": p.severity,
                    "confidence": p.confidence,
                    "transactions": p.transactions,
                    "description": p.description,
                    "addresses": p.addresses
                } for p in db_patterns
            ]
        except Exception as e:
            db.rollback()
            print(f"Error creating patterns: {e}")
            return []
        finally:
            db.close()
    
    async def save_pattern(self, upload_id: str, pattern: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            db_pattern = Pattern(
                upload_id=upload_id,
                type=pattern["type"],
                severity=pattern["severity"],
                confidence=pattern.get("confidence", 0),
                transactions=pattern.get("transactions", 0),
                description=pattern.get("description"),
                addresses=pattern.get("addresses", [])
            )
            db.add(db_pattern)
            db.commit()
            db.refresh(db_pattern)
            return {
                "id": db_pattern.id,
                "uploadId": db_pattern.upload_id,
                "type": db_pattern.type,
                "severity": db_pattern.severity,
                "confidence": db_pattern.confidence,
                "transactions": db_pattern.transactions,
                "description": db_pattern.description,
                "addresses": db_pattern.addresses
            }
        except Exception as e:
            db.rollback()
            print(f"Error saving pattern: {e}")
            return None
        finally:
            db.close()
    
    async def get_patterns_by_upload(self, upload_id: str) -> List[Dict]:
        db = self._get_db()
        try:
            patterns = db.query(Pattern).filter(Pattern.upload_id == upload_id).all()
            return [
                {
                    "id": p.id,
                    "uploadId": p.upload_id,
                    "type": p.type,
                    "severity": p.severity,
                    "confidence": p.confidence,
                    "transactions": p.transactions,
                    "description": p.description,
                    "addresses": p.addresses
                } for p in patterns
            ]
        finally:
            db.close()
    
    async def get_patterns_by_filters(
        self,
        upload_id: Optional[str] = None,
        pattern_type: Optional[str] = None,
        severity: Optional[str] = None
    ) -> List[Dict]:
        db = self._get_db()
        try:
            query = db.query(Pattern)
            if upload_id:
                query = query.filter(Pattern.upload_id == upload_id)
            if pattern_type:
                query = query.filter(Pattern.type == pattern_type)
            if severity:
                query = query.filter(Pattern.severity == severity)
            patterns = query.all()
            return [
                {
                    "id": p.id,
                    "uploadId": p.upload_id,
                    "type": p.type,
                    "severity": p.severity,
                    "confidence": p.confidence,
                    "transactions": p.transactions,
                    "description": p.description,
                    "addresses": p.addresses
                } for p in patterns
            ]
        finally:
            db.close()
    
    # ==================== Suspicious Address Operations ====================
    
    async def create_suspicious_addresses(self, addresses: List[Dict[str, Any]]) -> List[Dict]:
        db = self._get_db()
        try:
            db_addresses = []
            for addr_data in addresses:
                addr = SuspiciousAddress(
                    upload_id=addr_data["upload_id"],
                    address=addr_data["address"],
                    risk_level=addr_data["risk_level"],
                    suspicious_score=addr_data.get("suspicious_score", 0),
                    transaction_count=addr_data.get("transaction_count", 0),
                    total_amount=addr_data.get("total_amount", 0),
                    avg_score=addr_data.get("avg_score", 0),
                    flags=addr_data.get("flags", []),
                    first_seen=datetime.fromisoformat(addr_data["first_seen"]) if addr_data.get("first_seen") else None,
                    last_seen=datetime.fromisoformat(addr_data["last_seen"]) if addr_data.get("last_seen") else None
                )
                db.add(addr)
                db_addresses.append(addr)
            db.commit()
            for addr in db_addresses:
                db.refresh(addr)
            return [
                {
                    "id": a.id,
                    "address": a.address,
                    "riskLevel": a.risk_level,
                    "suspiciousScore": a.suspicious_score,
                    "transactionCount": a.transaction_count,
                    "totalAmount": a.total_amount,
                    "avgScore": a.avg_score,
                    "flags": a.flags,
                    "firstSeen": a.first_seen.isoformat() if a.first_seen else None,
                    "lastSeen": a.last_seen.isoformat() if a.last_seen else None
                } for a in db_addresses
            ]
        except Exception as e:
            db.rollback()
            print(f"Error creating suspicious addresses: {e}")
            return []
        finally:
            db.close()
    
    async def save_suspicious_address(self, upload_id: str, address: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            # Upsert: delete existing then insert new
            db.query(SuspiciousAddress).filter(
                SuspiciousAddress.upload_id == upload_id,
                SuspiciousAddress.address == address["address"]
            ).delete()
            
            addr = SuspiciousAddress(
                upload_id=upload_id,
                address=address["address"],
                risk_level=address["risk_level"],
                suspicious_score=address.get("suspicious_score", 0),
                transaction_count=address.get("transaction_count", 0),
                total_amount=address.get("total_amount", 0),
                avg_score=address.get("avg_score", 0),
                flags=address.get("flags", []),
                first_seen=datetime.fromisoformat(address["first_seen"]) if address.get("first_seen") else None,
                last_seen=datetime.fromisoformat(address["last_seen"]) if address.get("last_seen") else None
            )
            db.add(addr)
            db.commit()
            db.refresh(addr)
            return {
                "id": addr.id,
                "address": addr.address,
                "riskLevel": addr.risk_level,
                "suspiciousScore": addr.suspicious_score,
                "transactionCount": addr.transaction_count,
                "totalAmount": addr.total_amount,
                "avgScore": avg_score,
                "flags": addr.flags,
                "firstSeen": addr.first_seen.isoformat() if addr.first_seen else None,
                "lastSeen": addr.last_seen.isoformat() if addr.last_seen else None
            }
        except Exception as e:
            db.rollback()
            print(f"Error saving suspicious address: {e}")
            return None
        finally:
            db.close()
    
    async def get_suspicious_addresses(
        self,
        upload_id: Optional[str] = None,
        upload_ids: Optional[List[str]] = None,
        risk_level: Optional[str] = None,
        page: int = 1,
        limit: int = 10
    ) -> Tuple[List[Dict], int]:
        db = self._get_db()
        try:
            query = db.query(SuspiciousAddress)
            if upload_id:
                query = query.filter(SuspiciousAddress.upload_id == upload_id)
            elif upload_ids:
                query = query.filter(SuspiciousAddress.upload_id.in_(upload_ids))
            if risk_level:
                query = query.filter(SuspiciousAddress.risk_level == risk_level)
            total = query.count()
            addresses = query.order_by(SuspiciousAddress.suspicious_score.desc()).offset((page-1)*limit).limit(limit).all()
            
            result = []
            for addr in addresses:
                result.append({
                    "id": addr.id,
                    "address": addr.address,
                    "riskLevel": addr.risk_level,
                    "suspiciousScore": addr.suspicious_score,
                    "transactionCount": addr.transaction_count,
                    "totalAmount": addr.total_amount,
                    "avgScore": avg_score,
                    "flags": addr.flags,
                    "firstSeen": addr.first_seen.isoformat() if addr.first_seen else None,
                    "lastSeen": addr.last_seen.isoformat() if addr.last_seen else None
                })
            return result, total
        finally:
            db.close()
    
    # ==================== Report Operations ====================
    
    async def create_report(self, report_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            report = Report(
                id=report_data.get("id"),
                upload_id=report_data["upload_id"],
                user_id=report_data["user_id"],
                name=report_data["name"],
                type=report_data["type"],
                format=report_data["format"],
                status=report_data.get("status", "generating"),
                size_bytes=report_data.get("size_bytes"),
                file_path=report_data.get("file_path"),
                filters=report_data.get("filters", {}),
                created_at=datetime.fromisoformat(report_data["created_at"]) if isinstance(report_data.get("created_at"), str) else report_data.get("created_at", datetime.utcnow()),
                completed_at=datetime.fromisoformat(report_data["completed_at"]) if report_data.get("completed_at") else None
            )
            db.add(report)
            db.commit()
            db.refresh(report)
            return {
                "id": report.id,
                "uploadId": report.upload_id,
                "userId": report.user_id,
                "name": report.name,
                "type": report.type,
                "format": report.format,
                "status": report.status,
                "size": report.size_bytes,
                "createdAt": report.created_at.isoformat() if report.created_at else None
            }
        except Exception as e:
            db.rollback()
            print(f"Error creating report: {e}")
            return None
        finally:
            db.close()
    
    async def get_report_by_id(self, report_id: str, user_id: Optional[str] = None) -> Optional[Dict]:
        db = self._get_db()
        try:
            query = db.query(Report).filter(Report.id == report_id)
            if user_id:
                query = query.filter(Report.user_id == user_id)
            report = query.first()
            if report:
                return {
                    "id": report.id,
                    "uploadId": report.upload_id,
                    "userId": report.user_id,
                    "name": report.name,
                    "type": report.type,
                    "format": report.format,
                    "status": report.status,
                    "size": report.size_bytes,
                    "createdAt": report.created_at.isoformat() if report.created_at else None
                }
            return None
        finally:
            db.close()
    
    async def get_reports_by_user(
        self,
        user_id: str,
        upload_id: Optional[str] = None,
        page: int = 1,
        limit: int = 10
    ) -> Tuple[List[Dict], int]:
        db = self._get_db()
        try:
            query = db.query(Report).filter(Report.user_id == user_id)
            if upload_id:
                query = query.filter(Report.upload_id == upload_id)
            total = query.count()
            reports = query.order_by(Report.created_at.desc()).offset((page-1)*limit).limit(limit).all()
            
            result = []
            for report in reports:
                result.append({
                    "id": report.id,
                    "uploadId": report.upload_id,
                    "name": report.name,
                    "type": report.type,
                    "format": report.format,
                    "status": report.status,
                    "size": report.size_bytes,
                    "createdAt": report.created_at.isoformat() if report.created_at else None
                })
            return result, total
        finally:
            db.close()
    
    async def update_report(self, report_id: str, report_data: Dict[str, Any]) -> Optional[Dict]:
        db = self._get_db()
        try:
            report = db.query(Report).filter(Report.id == report_id).first()
            if report:
                if "name" in report_data:
                    report.name = report_data["name"]
                if "type" in report_data:
                    report.type = report_data["type"]
                if "format" in report_data:
                    report.format = report_data["format"]
                if "status" in report_data:
                    report.status = report_data["status"]
                if "size_bytes" in report_data:
                    report.size_bytes = report_data["size_bytes"]
                if "file_path" in report_data:
                    report.file_path = report_data["file_path"]
                if "filters" in report_data:
                    report.filters = report_data["filters"]
                report.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(report)
                return {
                    "id": report.id,
                    "uploadId": report.upload_id,
                    "name": report.name,
                    "type": report.type,
                    "format": report.format,
                    "status": report.status,
                    "size": report.size_bytes,
                    "createdAt": report.created_at.isoformat() if report.created_at else None
                }
            return None
        except Exception as e:
            db.rollback()
            print(f"Error updating report: {e}")
            return None
        finally:
            db.close()
    
    async def delete_report(self, report_id: str, user_id: str) -> bool:
        db = self._get_db()
        try:
            report = db.query(Report).filter(Report.id == report_id, Report.user_id == user_id).first()
            if report:
                db.delete(report)
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            print(f"Error deleting report: {e}")
            return False
        finally:
            db.close()
    
    # ==================== API Key Operations ====================
    
    async def create_api_key(
        self,
        user_id: str,
        name: str,
        key_hash: str,
        prefix: str,
        expires_at: Optional[str] = None
    ) -> Optional[Dict]:
        db = self._get_db()
        try:
            api_key = APIKey(
                user_id=user_id,
                name=name,
                key_hash=key_hash,
                prefix=prefix,
                expires_at=datetime.fromisoformat(expires_at) if expires_at else None
            )
            db.add(api_key)
            db.commit()
            db.refresh(api_key)
            return {
                "id": api_key.id,
                "name": api_key.name,
                "key": api_key.key_hash,  # In real app, only return hash once
                "createdAt": api_key.created_at.isoformat() if api_key.created_at else None
            }
        except Exception as e:
            db.rollback()
            print(f"Error creating API key: {e}")
            return None
        finally:
            db.close()
    
    async def list_api_keys(self, user_id: str) -> List[Dict]:
        db = self._get_db()
        try:
            keys = db.query(APIKey).filter(APIKey.user_id == user_id).all()
            return [
                {
                    "id": key.id,
                    "name": key.name,
                    "key": f"{key.prefix}****",  # Masked
                    "createdAt": key.created_at.isoformat() if key.created_at else None,
                    "lastUsed": key.last_used.isoformat() if key.last_used else None,
                    "permissions": key.permissions
                } for key in keys
            ]
        finally:
            db.close()
    
    async def delete_api_key(self, key_id: str, user_id: str) -> bool:
        db = self._get_db()
        try:
            key = db.query(APIKey).filter(APIKey.id == key_id, APIKey.user_id == user_id).first()
            if key:
                db.delete(key)
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            print(f"Error deleting API key: {e}")
            return False
        finally:
            db.close()
    
    # ==================== Webhook Operations ====================
    
    async def create_webhook(
        self,
        user_id: str,
        name: str,
        url: str,
        events: List[str],
        secret: Optional[str] = None
    ) -> Optional[Dict]:
        db = self._get_db()
        try:
            webhook = Webhook(
                user_id=user_id,
                name=name,
                url=url,
                events=events,
                secret=secret,
                active=True
            )
            db.add(webhook)
            db.commit()
            db.refresh(webhook)
            return {
                "id": webhook.id,
                "name": webhook.name,
                "url": webhook.url,
                "events": webhook.events,
                "secret": webhook.secret,
                "active": webhook.active,
                "createdAt": webhook.created_at.isoformat() if webhook.created_at else None
            }
        except Exception as e:
            db.rollback()
            print(f"Error creating webhook: {e}")
            return None
        finally:
            db.close()
    
    async def list_webhooks(self, user_id: str) -> List[Dict]:
        db = self._get_db()
        try:
            webhooks = db.query(Webhook).filter(Webhook.user_id == user_id).all()
            return [
                {
                    "id": webhook.id,
                    "name": webhook.name,
                    "url": webhook.url,
                    "events": webhook.events,
                    "secret": webhook.secret,
                    "active": webhook.active,
                    "createdAt": webhook.created_at.isoformat() if webhook.created_at else None
                } for webhook in webhooks
            ]
        finally:
            db.close()
    
    async def update_webhook(
        self,
        webhook_id: str,
        user_id: str,
        name: str,
        url: str,
        events: List[str],
        secret: Optional[str] = None
    ) -> Optional[Dict]:
        db = self._get_db()
        try:
            webhook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == user_id).first()
            if webhook:
                if name:
                    webhook.name = name
                if url:
                    webhook.url = url
                if events:
                    webhook.events = events
                if secret is not None:
                    webhook.secret = secret
                webhook.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(webhook)
                return {
                    "id": webhook.id,
                    "name": webhook.name,
                    "url": webhook.url,
                    "events": webhook.events,
                    "secret": webhook.secret,
                    "active": webhook.active,
                    "createdAt": webhook.created_at.isoformat() if webhook.created_at else None
                }
            return None
        except Exception as e:
            db.rollback()
            print(f"Error updating webhook: {e}")
            return None
        finally:
            db.close()
    
    async def delete_webhook(self, webhook_id: str, user_id: str) -> bool:
        db = self._get_db()
        try:
            webhook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == user_id).first()
            if webhook:
                db.delete(webhook)
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            print(f"Error deleting webhook: {e}")
            return False
        finally:
            db.close()
    
    # ==================== Transaction Operations ====================
    
    async def create_transactions(self, transactions: List[Dict[str, Any]]) -> List[Dict]:
        db = self._get_db()
        try:
            db_transactions = []
            for tx_data in transactions:
                tx = Transaction(
                    upload_id=tx_data["upload_id"],
                    source_wallet=tx_data.get("source_wallet"),
                    dest_wallet=tx_data.get("dest_wallet"),
                    amount=tx_data.get("amount"),
                    timestamp=datetime.fromisoformat(tx_data["timestamp"]) if tx_data.get("timestamp") else None,
                    token_type=tx_data.get("token_type"),
                    raw_data=tx_data.get("raw_data", {})
                )
                db.add(tx)
                db_transactions.append(tx)
            db.commit()
            for tx in db_transactions:
                db.refresh(tx)
            return [
                {
                    "id": t.id,
                    "sourceWallet": t.source_wallet,
                    "destWallet": t.dest_wallet,
                    "amount": t.amount,
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                    "tokenType": t.token_type,
                    "rawData": t.raw_data
                } for t in db_transactions
            ]
        except Exception as e:
            db.rollback()
            print(f"Error creating transactions: {e}")
            return []
        finally:
            db.close()
    
    async def get_transactions_by_upload(self, upload_id: str) -> List[Dict]:
        db = self._get_db()
        try:
            transactions = db.query(Transaction).filter(Transaction.upload_id == upload_id).all()
            return [
                {
                    "id": t.id,
                    "sourceWallet": t.source_wallet,
                    "destWallet": t.dest_wallet,
                    "amount": t.amount,
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                    "tokenType": t.token_type,
                    "rawData": t.raw_data
                } for t in transactions
            ]
        finally:
            db.close()
    
    # ==================== Graph Snapshots Operations ====================
    
    async def save_graph_data(
        self,
        upload_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]]
    ) -> Optional[Dict]:
        db = self._get_db()
        try:
            # Delete existing if any
            db.query(GraphSnapshot).filter(GraphSnapshot.upload_id == upload_id).delete()
            
            graph_snapshot = GraphSnapshot(
                upload_id=upload_id,
                graph_json={"nodes": nodes, "edges": edges}
            )
            db.add(graph_snapshot)
            db.commit()
            db.refresh(graph_snapshot)
            return {
                "id": graph_snapshot.id,
                "uploadId": graph_snapshot.upload_id
            }
        except Exception as e:
            db.rollback()
            print(f"Error saving graph snapshot: {e}")
            return None
        finally:
            db.close()
    
    async def get_graph_data(self, upload_id: str) -> Optional[Dict]:
        db = self._get_db()
        try:
            graph_snapshot = db.query(GraphSnapshot).filter(GraphSnapshot.upload_id == upload_id).first()
            if graph_snapshot:
                return graph_snapshot.graph_json
            return None
        finally:
            db.close()
    
    # ==================== Analysis Results Operations ====================
    
    async def save_analysis_results(
        self,
        upload_id: str,
        suspicious_node_count: int,
        smurfing_patterns_detected: int,
        max_risk_score: float
    ) -> Optional[Dict]:
        db = self._get_db()
        try:
            # Upsert: delete existing then insert
            db.query(AnalysisResult).filter(AnalysisResult.upload_id == upload_id).delete()
            
            analysis = AnalysisResult(
                upload_id=upload_id,
                suspicious_node_count=suspicious_node_count,
                smurfing_patterns_detected=smurfing_patterns_detected,
                max_risk_score=max_risk_score
            )
            db.add(analysis)
            db.commit()
            db.refresh(analysis)
            return {
                "id": analysis.id,
                "uploadId": analysis.upload_id,
                "suspicious_node_count": analysis.suspicious_node_count,
                "smurfing_patterns_detected": analysis.smurfing_patterns_detected,
                "max_risk_score": analysis.max_risk_score
            }
        except Exception as e:
            db.rollback()
            print(f"Error saving analysis results: {e}")
            return None
        finally:
            db.close()
    
    async def get_analysis_results(self, upload_id: str) -> Optional[Dict]:
        db = self._get_db()
        try:
            analysis = db.query(AnalysisResult).filter(AnalysisResult.upload_id == upload_id).first()
            if analysis:
                return {
                    "suspicious_node_count": analysis.suspicious_node_count,
                    "smurfing_patterns_detected": analysis.smurfing_patterns_detected,
                    "max_risk_score": analysis.max_risk_score
                }
            return None
        finally:
            db.close()
    
    async def get_all_analysis_results_for_user(self, user_id: str) -> List[Dict]:
        db = self._get_db()
        try:
            # Get upload IDs for user
            upload_ids = [u.id for u in db.query(Upload.id).filter(Upload.user_id == user_id).all()]
            if not upload_ids:
                return []
            
            analyses = db.query(AnalysisResult).filter(AnalysisResult.upload_id.in_(upload_ids)).all()
            return [
                {
                    "uploadId": a.upload_id,
                    "suspicious_node_count": a.suspicious_node_count,
                    "smurfing_patterns_detected": a.smurfing_patterns_detected,
                    "max_risk_score": a.max_risk_score
                } for a in analyses
            ]
        finally:
            db.close()
    
    # ==================== Dashboard Statistics ====================
    
    async def get_dashboard_stats(self, user_id: str) -> Dict[str, Any]:
        db = self._get_db()
        try:
            # Get user's uploads
            uploads = db.query(Upload).filter(Upload.user_id == user_id).all()
            total_transactions = sum(u.row_count for u in uploads)
            total_uploads = len(uploads)
            
            # Get upload IDs
            upload_ids = [u.id for u in uploads]
            
            # Aggregate from analysis_results
            suspicious_count = 0
            patterns_count = 0
            max_risk = 0.0
            if upload_ids:
                analyses = db.query(AnalysisResult).filter(AnalysisResult.upload_id.in_(upload_ids)).all()
                for a in analyses:
                    suspicious_count += a.suspicious_node_count
                    patterns_count += a.smurfing_patterns_detected
                    max_risk = max(max_risk, a.max_risk_score)
            
            recent_uploads = db.query(Upload).filter(Upload.user_id == user_id).order_by(Upload.uploaded_at.desc()).limit(5).all()
            
            return {
                "totalTransactions": total_transactions,
                "suspiciousActivity": suspicious_count,
                "activeCases": len([u for u in uploads if u.status == "completed"]),
                "riskScore": max_risk,
                "changes": {
                    "transactions": "+15.3%",
                    "suspicious": "+5.2%",
                    "cases": "-2.1%",
                    "risk": "+8.7%"
                }
            }
        finally:
            db.close()

    # Aliases for compatibility
    get_upload = get_upload_by_id
    get_report = get_report_by_id
    get_analysis = get_analysis_results

# Global service instance
database_service = DatabaseService()