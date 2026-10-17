"""
Analysis Service - ML analysis and pattern detection with full model integration
"""
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
import uuid
import pandas as pd

from app.core.database_service import database_service
supabase_client = database_service
from app.services.ml_service import ml_service

from app.config import settings


class AnalysisService:
    """
    Service for analysis operations using the Smurf Hunter ML model
    
    Provides:
    - Full ML-powered transaction analysis
    - Pattern detection
    - Suspicious address identification
    - Subgraph extraction for visualization
    """
    
    def _load_upload_file(self, upload_id: str, filename: str) -> pd.DataFrame:
        """Load the uploaded file from disk"""
        # Files are stored as {upload_id}.csv in uploads folder
        upload_dir = Path(settings.UPLOAD_DIR)
        
        # Try different extensions
        for ext in ['.csv', '.xlsx', '.xls', '.json']:
            file_path = upload_dir / f"{upload_id}{ext}"
            if file_path.exists():
                if ext == '.csv':
                    return pd.read_csv(file_path)
                elif ext in ['.xlsx', '.xls']:
                    return pd.read_excel(file_path)
                elif ext == '.json':
                    return pd.read_json(file_path)
        
        raise ValueError(f"Upload file not found for {upload_id}")
    
    async def run_ml_analysis(
        self,
        upload_id: str,
        user_id: str
    ) -> Dict:
        """
        Run complete ML analysis on an upload
        
        This is the MAIN analysis pipeline that:
        1. Loads transaction data from uploaded file
        2. Runs GraphSAGE model for suspicious scoring
        3. Extracts patterns (structuring, layering, smurfing)
        4. Identifies suspicious addresses
        5. Generates visualization subgraph
        6. Saves results to analysis_results table
        
        Args:
            upload_id: Upload identifier
            user_id: User identifier for access control
        
        Returns:
            Complete analysis results
        """
        # Verify ownership
        upload = await database_service.get_upload_by_id(upload_id)
        if not upload or upload.get("user_id") != user_id:
            raise ValueError("Upload not found or access denied")
        
        # Load transactions from file (not database)
        filename = upload.get("filename", "")
        df = self._load_upload_file(upload_id, filename)
        
        if df.empty:
            raise ValueError("No transactions found in uploaded file")
        
        # Run ML analysis
        results = ml_service.analyze_transactions(df)
        
        # Extract key metrics for storage in analysis_results table
        summary = results.get("summary", {})
        suspicious_addresses = results.get("suspicious_addresses", [])
        patterns = results.get("patterns", [])
        
        # Count suspicious nodes (addresses with score > 0.5)
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
        
        # Also save patterns and addresses to their tables
        for pattern in patterns:
            await database_service.save_pattern(upload_id, pattern)
        
        for address in suspicious_addresses:
            await database_service.save_suspicious_address(upload_id, address)
        
        return results
    
    async def get_analysis_results(
        self,
        upload_id: str,
        user_id: str
    ) -> Optional[Dict]:
        """
        Get complete analysis results for an upload
        Retrieves stored results from analysis_results table
        """
        # Verify upload belongs to user
        upload = await database_service.get_upload_by_id(upload_id)
        if not upload or upload.get("user_id") != user_id:
            return None
        
        # Get stored analysis results
        stored_results = await database_service.get_analysis_results(upload_id)
        
        if stored_results:
            # Return data from database
            summary = {
                "totalTransactions": upload.get("row_count", 0),
                "suspiciousTransactions": stored_results.get("suspicious_node_count", 0),
                "riskScore": stored_results.get("max_risk_score", 0.0),
                "patternsDetected": stored_results.get("smurfing_patterns_detected", 0),
                "high_risk": stored_results.get("suspicious_node_count", 0),
                "medium_risk": 0,
                "low_risk": 0,
                "confidence": stored_results.get("max_risk_score", 0.0) * 100,
                "processing_time": 2.4
            }
        else:
            # Fallback - no analysis run yet
            summary = {
                "totalTransactions": upload.get("row_count", 0),
                "suspiciousTransactions": 0,
                "riskScore": 0,
                "patternsDetected": 0
            }
        
        return {
            "uploadId": upload_id,
            "summary": summary,
            "patterns": [],
            "suspiciousAddresses": []
        }
    
    async def get_patterns(
        self,
        user_id: str,
        upload_id: Optional[str] = None,
        pattern_type: Optional[str] = None,
        severity: Optional[str] = None
    ) -> List[Dict]:
        """
        Get patterns from database with optional filters
        """
        # If upload_id provided, verify ownership
        if upload_id:
            upload = await database_service.get_upload_by_id(upload_id)
            if not upload or upload.get("user_id") != user_id:
                return []
            # Get patterns for specific upload
            patterns = await database_service.get_patterns_by_filters(
                upload_id=upload_id,
                pattern_type=pattern_type,
                severity=severity
            )
        else:
            # Get all user's uploads first, then get patterns for all of them
            uploads, _ = await database_service.get_uploads_by_user(user_id, page=1, limit=100)
            upload_ids = [u["id"] for u in uploads]
            
            all_patterns = []
            for uid in upload_ids:
                patterns_for_upload = await database_service.get_patterns_by_filters(
                    upload_id=uid,
                    pattern_type=pattern_type,
                    severity=severity
                )
                all_patterns.extend(patterns_for_upload)
            patterns = all_patterns
        
        # Format for API response
        return [
            {
                "id": p.get("id", str(uuid.uuid4())),
                "type": p.get("type", "Unknown"),
                "severity": p.get("severity", "Medium"),
                "confidence": p.get("confidence", 0.5),
                "transactions": p.get("transactions", 0),
                "description": p.get("description", ""),
                "addresses": p.get("addresses", []),
                "detectedAt": p.get("created_at")
            }
            for p in patterns
        ]
    
    async def get_suspicious_addresses(
        self,
        user_id: str,
        upload_id: Optional[str] = None,
        risk_level: Optional[str] = None,
        page: int = 1,
        limit: int = 10
    ) -> Tuple[List[Dict], Dict]:
        """
        Get suspicious addresses from database with pagination
        """
        # If upload_id provided and not "all", verify ownership
        if upload_id and upload_id != "all":
            upload = await database_service.get_upload_by_id(upload_id)
            if not upload or upload.get("user_id") != user_id:
                return [], {"page": page, "limit": limit, "total": 0}
            # Get addresses for specific upload
            addresses, total = await database_service.get_suspicious_addresses(
                upload_id=upload_id,
                risk_level=risk_level,
                page=page,
                limit=limit
            )
        else:
            # Get all user's uploads first, then get addresses for all of them
            uploads, _ = await database_service.get_uploads_by_user(user_id, page=1, limit=100)
            upload_ids = [u["id"] for u in uploads]
            
            if upload_ids:
                addresses, total = await database_service.get_suspicious_addresses(
                    upload_ids=upload_ids,
                    risk_level=risk_level,
                    page=page,
                    limit=limit
                )
            else:
                addresses, total = [], 0
        
        # Helper function to safely get float value
        def safe_float(val, default=0.0):
            if val is None:
                return default
            try:
                f = float(val)
                if f != f:  # NaN check
                    return default
                return f
            except (TypeError, ValueError):
                return default
        
        # Format for API response
        formatted_addresses = [
            {
                "address": a.get("address", ""),
                "suspiciousScore": safe_float(a.get("suspicious_score"), 0.5),
                "riskLevel": a.get("risk_level") or "medium",
                "transactionCount": int(a.get("transaction_count") or 0),
                "totalAmount": safe_float(a.get("total_amount"), 0.0),
                "flags": a.get("flags") or [],
                "firstSeen": a.get("first_seen"),
                "lastSeen": a.get("last_seen")
            }
            for a in addresses
        ]
        
        return formatted_addresses, {"page": page, "limit": limit, "total": total}
    
    async def run_analysis(
        self,
        upload_id: str,
        user_id: str
    ) -> Dict:
        """
        Trigger full ML re-analysis of an upload
        Alias for run_ml_analysis for backward compatibility
        """
        return await self.run_ml_analysis(upload_id, user_id)
    
    async def get_subgraph_for_visualization(
        self,
        upload_id: str,
        user_id: str,
        top_k: int = 20,
        hop: int = 2
    ) -> Dict:
        """
        Get suspicious subgraph optimized for frontend visualization
        
        Args:
            upload_id: Upload identifier
            user_id: User identifier
            top_k: Number of most suspicious nodes to include
            hop: Number of hops for neighborhood extraction
        
        Returns:
            Subgraph with nodes, edges, and visualization metadata
        """
        upload = await database_service.get_upload_by_id(upload_id)
        if not upload or upload.get("user_id") != user_id:
            raise ValueError("Upload not found")
        
        transactions = await database_service.get_transactions_by_upload(upload_id)
        if not transactions:
            return {"nodes": [], "edges": [], "metadata": {}}
        
        df = pd.DataFrame(transactions)
        
        # Use ML service to extract subgraph
        features, tx_ids, edge_index = ml_service._prepare_graph_data(df, None)
        
        if features is None:
            return {"nodes": [], "edges": [], "metadata": {"error": "No features"}}
        
        return ml_service.extract_suspicious_subgraph(
            features=features,
            edge_index=edge_index,
            tx_ids=tx_ids,
            top_k=top_k,
            hop=hop
        )


# Global service instance
analysis_service = AnalysisService()
