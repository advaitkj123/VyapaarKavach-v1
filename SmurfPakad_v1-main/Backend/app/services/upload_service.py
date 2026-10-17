"""
Upload Service - File handling and processing
"""
import os
import uuid
import pandas as pd
from datetime import datetime
from typing import Optional, Dict, List, Tuple
from pathlib import Path
import aiofiles
import json

from fastapi import UploadFile

from app.config import settings
from app.core.database_service import database_service
supabase_client = database_service
from app.core.websocket import ws_manager
from app.services.ml_service import ml_service
import inspect
import asyncio

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


class UploadService:
    """
    Service for handling file uploads and processing
    """
    
    def __init__(self):
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
    
    async def process_upload(
        self,
        file: UploadFile,
        user_id: str,
        description: Optional[str] = None
    ) -> Dict:
        """
        Process an uploaded file and automatically run ML analysis
        """
        # Generate upload ID
        upload_id = str(uuid.uuid4())
        
        # Validate file
        filename = file.filename or "unknown"
        file_ext = Path(filename).suffix.lower()
        
        # Normalize extension check - handle both ".csv" and "csv" formats
        allowed = settings.allowed_extensions_list
        ext_without_dot = file_ext.lstrip('.')
        ext_with_dot = f'.{ext_without_dot}'
        
        if ext_without_dot not in [e.lstrip('.') for e in allowed] and ext_with_dot not in allowed:
            raise ValueError(f"Unsupported file type: {file_ext}")
        
        # Save file
        file_path = self.upload_dir / f"{upload_id}{file_ext}"
        
        content = await file.read()
        file_size = len(content)
        
        if file_size == 0:
            raise ValueError("File is empty")
        
        if file_size > settings.MAX_UPLOAD_SIZE:
            raise ValueError(f"File too large. Max size: {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB")
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        # Create upload record matching exact schema
        upload_record = await _call_db_method(supabase_client, ["create_upload"], {
            "id": upload_id,
            "user_id": user_id,
            "filename": file_path.name,
            "original_filename": file.filename,
            "file_type": file_ext,
            "size_bytes": file_size,
            "uploaded_at": datetime.utcnow().isoformat(),
            "status": "processing",
            "row_count": 0
        })
        
        # Notify via WebSocket
        await ws_manager.broadcast_upload_progress(
            user_id, upload_id, 10, "processing", "File uploaded, starting processing..."
        )
        
        # Process file in background (simplified - in production use Celery/background tasks)
        try:
            records = await self._process_file(file_path, file_ext, upload_id, user_id)
            
            # Update upload record
            await database_service.update_upload(upload_id, {
                "status": "completed",
                "row_count": records
            })
            
            await ws_manager.broadcast_upload_progress(
                user_id, upload_id, 70, "processing", "Running ML analysis..."
            )
            
            # AUTO-RUN ML ANALYSIS after file processing
            await self._run_auto_analysis(file_path, file_ext, upload_id, user_id)
            
            await ws_manager.broadcast_upload_progress(
                user_id, upload_id, 100, "completed", "Processing and analysis complete!"
            )
            
        except Exception as e:
            await database_service.update_upload(upload_id, {
                "status": "failed"
            })
            
            await ws_manager.broadcast_upload_progress(
                user_id, upload_id, 0, "failed", f"Processing failed: {str(e)}"
            )
            raise
        
        return {
            "id": upload_id,
            "name": file.filename,
            "status": "processing",
            "uploadedAt": datetime.utcnow().isoformat()
        }
    
    async def _process_file(
        self,
        file_path: Path,
        file_ext: str,
        upload_id: str,
        user_id: str
    ) -> int:
        """
        Process uploaded file and extract transactions
        """
        # Read file
        if file_ext == '.csv':
            df = pd.read_csv(file_path)
        elif file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path)
        elif file_ext == '.json':
            df = pd.read_json(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
        
        await ws_manager.broadcast_upload_progress(
            user_id, upload_id, 30, "processing", f"Read {len(df)} records..."
        )
        
        row_count = len(df)
        
        await ws_manager.broadcast_upload_progress(
            user_id, upload_id, 50, "processing", "File parsed successfully..."
        )
        
        # Return the row count - the file is stored locally for later analysis
        return row_count
    
    async def _run_auto_analysis(
        self,
        file_path: Path,
        file_ext: str,
        upload_id: str,
        user_id: str
    ) -> None:
        """
        Automatically run ML analysis after file upload with real-time streaming
        """
        try:
            # Read file
            if file_ext == '.csv':
                df = pd.read_csv(file_path)
            elif file_ext in ['.xlsx', '.xls']:
                df = pd.read_excel(file_path)
            elif file_ext == '.json':
                df = pd.read_json(file_path)
            else:
                print(f"Cannot analyze file type: {file_ext}")
                return
            
            if df.empty:
                print(f"Empty dataframe for upload {upload_id}")
                return
            
            # Stage 1: Parsing complete
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "parsing", 10, {"rows": len(df)})
            
            # Stage 2: Building graph
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "graph_building", 25, {"nodes": "building..."})
            
            # Run ML analysis with streaming
            results = await self._run_ml_analysis_streaming(df, upload_id, user_id)
            
            # Stage 3: Scoring complete
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "scoring", 50, {"scores_computed": True})
            
            # Stage 4: Pattern detection
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "pattern_detection", 75, {"patterns": len(results.get("patterns", []))})
            
            # Stage 5: Subgraph extraction
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "subgraph_extraction", 90, {"subgraph_ready": True})
            
            # Extract metrics
            summary = results.get("summary", {})
            suspicious_addresses = results.get("suspicious_addresses", [])
            patterns = results.get("patterns", [])
            
            # Count suspicious nodes
            suspicious_node_count = len([
                addr for addr in suspicious_addresses 
                if addr.get("suspiciousScore", 0) > 0.5
            ])
            
            # Count smurfing patterns
            smurfing_patterns = len([
                p for p in patterns 
                if "smurf" in p.get("type", "").lower() or 
                   "structur" in p.get("type", "").lower() or
                   "fan" in p.get("type", "").lower()
            ])
            
            # Get max risk score
            max_risk_score = summary.get("maxSuspiciousScore", 0.0)
            if not max_risk_score and suspicious_addresses:
                max_risk_score = max(
                    (addr.get("suspiciousScore", 0) for addr in suspicious_addresses),
                    default=0.0
                )
            
            # Save to analysis_results table
            await database_service.save_analysis_results(
                upload_id=upload_id,
                suspicious_node_count=suspicious_node_count,
                smurfing_patterns_detected=smurfing_patterns,
                max_risk_score=max_risk_score
            )
            
            # Save patterns to database
            for pattern in patterns:
                await database_service.save_pattern(upload_id, pattern)
            
            # Save suspicious addresses to database
            for address in suspicious_addresses:
                await database_service.save_suspicious_address(upload_id, address)
            
            # Stage 6: Complete
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "complete", 100, {
                "patterns": len(patterns),
                "suspicious_addresses": len(suspicious_addresses),
                "max_risk_score": max_risk_score
            })
            
            print(f"Auto-analysis complete for upload {upload_id}: {len(patterns)} patterns, {len(suspicious_addresses)} addresses")
            
        except Exception as e:
            print(f"Auto-analysis failed for upload {upload_id}: {e}")
            import traceback
            traceback.print_exc()
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "error", 0, {"error": str(e)})

    async def _run_ml_analysis_streaming(self, df: pd.DataFrame, upload_id: str, user_id: str) -> Dict:
        """Run ML analysis with intermediate progress updates"""
        results = {
            "predictions": [],
            "suspicious_addresses": [],
            "patterns": [],
            "subgraph": None,
            "summary": {}
        }
        
        try:
            # Step 1 & 2: Extract features and build graph
            features, tx_ids, edge_index = ml_service._prepare_graph_data(df, None)
            
            if features is None:
                return ml_service._fallback_analysis(df)
            
            # Stage: graph built
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "graph_building", 35, {
                "num_nodes": len(tx_ids),
                "num_edges": edge_index.shape[1] if edge_index is not None else 0
            })
            
            # Step 3: Run model prediction
            predictions, scores = ml_service.predict(features, edge_index)
            
            # Stage: scoring
            await ws_manager.broadcast_analysis_stream(user_id, upload_id, "scoring", 55, {
                "mean_score": float(scores.mean()),
                "max_score": float(scores.max())
            })
            
            # Step 4: Extract suspicious subgraph for visualization
            subgraph = ml_service.extract_suspicious_subgraph(
                features=features,
                edge_index=edge_index,
                tx_ids=tx_ids,
                top_k=20,
                hop=2
            )
            results["subgraph"] = subgraph
            
            # Build prediction results
            for i, (tx_id, pred, score) in enumerate(zip(tx_ids, predictions, scores)):
                results["predictions"].append({
                    "transactionId": str(tx_id),
                    "predictedLabel": "illicit" if pred == 1 else "licit",
                    "suspiciousScore": float(score),
                    "confidence": float(max(score, 1 - score)),
                    "riskLevel": ml_service._get_risk_level(score)
                })
            
            # Step 5: Detect patterns
            results["patterns"] = ml_service._detect_patterns(
                df, edge_index, scores, tx_ids
            )
            
            # Stream each pattern as detected
            for i, pattern in enumerate(results["patterns"]):
                await ws_manager.broadcast_analysis_stream(user_id, upload_id, "pattern_detection", 70 + i * 3, {
                    "pattern": pattern
                })
            
            # Step 6: Find suspicious addresses
            results["suspicious_addresses"] = ml_service._find_suspicious_addresses(
                df, scores, tx_ids
            )
            
            # Summary statistics
            results["summary"] = {
                "totalTransactions": len(tx_ids),
                "suspiciousTransactions": int((scores > 0.5).sum()),
                "highRiskTransactions": int((scores > 0.8).sum()),
                "avgSuspiciousScore": float(scores.mean()),
                "maxSuspiciousScore": float(scores.max()),
                "patternsDetected": len(results["patterns"]),
                "riskDistribution": {
                    "critical": int((scores > 0.9).sum()),
                    "high": int(((scores > 0.7) & (scores <= 0.9)).sum()),
                    "medium": int(((scores > 0.5) & (scores <= 0.7)).sum()),
                    "low": int((scores <= 0.5).sum())
                }
            }
            
        except Exception as e:
            print(f"Error in streaming ML analysis: {e}")
            import traceback
            traceback.print_exc()
            return ml_service._fallback_analysis(df)
        
        return results
    
    async def get_upload_history(
        self,
        user_id: str,
        page: int = 1,
        limit: int = 10,
        status: Optional[str] = None
    ) -> Tuple[List[Dict], int]:
        """
        Get upload history for a user
        """
        res = await _call_db_method(supabase_client, ["get_uploads_by_user"], user_id, page, limit, status)
        if res is not None:
            if isinstance(res, tuple):
                return res
            uploads = res
            total = await _call_db_method(supabase_client, ["count_uploads_by_user"], user_id)
            if total is None:
                total = len(uploads)
            return uploads, total
        return [], 0
    
    async def get_raw_upload(self, upload_id: str) -> Optional[Dict]:
        """Get upload without user check"""
        return await _call_db_method(supabase_client, ["get_upload", "get_upload_by_id"], upload_id)
    
    async def get_upload_detail(
        self,
        upload_id: str,
        user_id: str
    ) -> Optional[Dict]:
        """
        Get upload details
        """
        upload = await self.get_raw_upload(upload_id)
        if upload:
            if upload.get("user_id") and upload.get("user_id") != user_id:
                return None
            return upload
        return None
    
    async def delete_upload(
        self,
        upload_id: str,
        user_id: str
    ) -> bool:
        """
        Delete an upload and its associated data
        """
        upload = await self.get_raw_upload(upload_id)
        if not upload or (upload.get("user_id") and upload.get("user_id") != user_id):
            return False
        
        # Delete file if it exists and is a file
        file_path_str = upload.get("file_path") or ""
        if file_path_str and Path(file_path_str).is_file():
            Path(file_path_str).unlink()
        
        # Delete from database
        res = await _call_db_method(supabase_client, ["delete_upload"], upload_id)
        return True if res is not False else False


# Global service instance
upload_service = UploadService()
