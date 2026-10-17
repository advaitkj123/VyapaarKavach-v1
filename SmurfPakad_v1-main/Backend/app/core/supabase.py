"""
Supabase client configuration and utilities
"""
from typing import Optional, Any, Dict, List, Tuple
from functools import lru_cache

try:
    from supabase import create_client  # type: ignore
except ImportError:
    create_client = None

from app.config import settings


@lru_cache()
def get_supabase_client() -> Any:
    """Get a cached Supabase client instance"""
    if create_client is None or not getattr(settings, 'SUPABASE_URL', None):
        return None
    try:
        return create_client(settings.SUPABASE_URL, settings.supabase_key)
    except Exception:
        return None


@lru_cache()
def get_supabase_admin_client() -> Any:
    """Get a cached Supabase admin client (with service key)"""
    if create_client is None or not getattr(settings, 'SUPABASE_URL', None):
        return None
    try:
        service_key = getattr(settings, 'SUPABASE_SERVICE_KEY', None) or settings.supabase_key
        return create_client(settings.SUPABASE_URL, service_key)
    except Exception:
        return None


class SupabaseService:
    """Service class for Supabase operations"""
    
    def __init__(self) -> None:
        self.client = get_supabase_client()
        self.admin_client = get_supabase_admin_client()
    
    # ==================== User Operations ====================
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            response = self.client.table("users").select("*").eq("id", user_id).execute()
            return response.data[0] if response.data and len(response.data) > 0 else None
        except Exception as e:
            print(f"Error getting user by id: {e}")
            return None
    
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        try:
            response = self.client.table("users").select("*").eq("email", email).execute()
            return response.data[0] if response.data and len(response.data) > 0 else None
        except Exception as e:
            print(f"Error getting user by email: {e}")
            return None
    
    async def create_user(self, user_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            response = self.client.table("users").insert(user_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error creating user: {e}")
            return None
    
    async def update_user(self, user_id: str, user_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            response = self.client.table("users").update(user_data).eq("id", user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error updating user: {e}")
            return None
    
    # ==================== Upload Operations ====================
    
    async def create_upload(self, upload_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = self.client.table("uploads").insert(upload_data).execute()
        return response.data[0] if response.data else None
    
    async def get_upload_by_id(self, upload_id: str) -> Optional[Dict[str, Any]]:
        response = self.client.table("uploads").select("*").eq("id", upload_id).single().execute()
        return response.data if response.data else None
    
    async def get_uploads_by_user(
        self, 
        user_id: str, 
        page: int = 1, 
        limit: int = 10,
        status: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        try:
            query = self.client.table("uploads").select("*", count="exact").eq("user_id", user_id)
            if status:
                query = query.eq("status", status)
            query = query.order("uploaded_at", desc=True)
            query = query.range((page - 1) * limit, page * limit - 1)
            response = query.execute()
            return response.data or [], response.count or 0
        except Exception as e:
            print(f"Error fetching uploads: {e}")
            return [], 0
    
    async def update_upload(self, upload_id: str, upload_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = self.client.table("uploads").update(upload_data).eq("id", upload_id).execute()
        return response.data[0] if response.data else None
    
    async def delete_upload(self, upload_id: str) -> bool:
        self.client.table("uploads").delete().eq("id", upload_id).execute()
        return True
    
    # ==================== Analysis Operations ====================
    
    async def create_analysis(self, analysis_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = self.client.table("analyses").insert(analysis_data).execute()
        return response.data[0] if response.data else None
    
    async def get_analysis_by_upload(self, upload_id: str) -> Optional[Dict[str, Any]]:
        response = self.client.table("analyses").select("*").eq("upload_id", upload_id).single().execute()
        return response.data if response.data else None
    
    async def update_analysis(self, analysis_id: str, analysis_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = self.client.table("analyses").update(analysis_data).eq("id", analysis_id).execute()
        return response.data[0] if response.data else None
    
    # ==================== Pattern Operations ====================
    
    async def create_patterns(self, patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        try:
            response = self.client.table("patterns").insert(patterns).execute()
            return response.data or []
        except Exception as e:
            print(f"Error creating patterns: {e}")
            return []
    
    async def save_pattern(self, upload_id: str, pattern: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Save a single pattern to the database"""
        try:
            pattern_data = {
                "upload_id": upload_id,
                "type": pattern.get("type"),
                "severity": pattern.get("severity"),
                "confidence": pattern.get("confidence", 0),
                "transactions": pattern.get("transactions", 0),
                "description": pattern.get("description", ""),
                "addresses": pattern.get("addresses", [])
            }
            response = self.client.table("patterns").insert(pattern_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving pattern: {e}")
            return None
    
    async def get_patterns_by_upload(self, upload_id: str) -> List[Dict[str, Any]]:
        try:
            response = self.client.table("patterns").select("*").eq("upload_id", upload_id).execute()
            return response.data or []
        except Exception as e:
            print(f"Error fetching patterns: {e}")
            return []
    
    async def get_patterns_by_filters(
        self,
        upload_id: Optional[str] = None,
        pattern_type: Optional[str] = None,
        severity: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        try:
            query = self.client.table("patterns").select("*")
            if upload_id:
                query = query.eq("upload_id", upload_id)
            if pattern_type:
                query = query.eq("type", pattern_type)
            if severity:
                query = query.eq("severity", severity)
            response = query.execute()
            return response.data or []
        except Exception as e:
            print(f"Error fetching patterns by filters: {e}")
            return []
    
    # ==================== Suspicious Address Operations ====================
    
    async def create_suspicious_addresses(self, addresses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        try:
            response = self.client.table("suspicious_addresses").insert(addresses).execute()
            return response.data or []
        except Exception as e:
            print(f"Error creating suspicious addresses: {e}")
            return []
    
    async def save_suspicious_address(self, upload_id: str, address: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Save a single suspicious address to the database"""
        try:
            address_data = {
                "upload_id": upload_id,
                "address": address.get("address"),
                "risk_level": address.get("riskLevel"),
                "suspicious_score": address.get("suspiciousScore", 0),
                "transaction_count": address.get("transactionCount", 0),
                "total_amount": address.get("avgScore", 0)  # Using avgScore as proxy
            }
            response = self.client.table("suspicious_addresses").upsert(
                address_data, 
                on_conflict="upload_id,address"
            ).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving suspicious address: {e}")
            return None
    
    async def get_suspicious_addresses(
        self,
        upload_id: Optional[str] = None,
        upload_ids: Optional[List[str]] = None,
        risk_level: Optional[str] = None,
        page: int = 1,
        limit: int = 10
    ) -> Tuple[List[Dict[str, Any]], int]:
        try:
            query = self.client.table("suspicious_addresses").select("*", count="exact")
            if upload_id:
                query = query.eq("upload_id", upload_id)
            elif upload_ids:
                query = query.in_("upload_id", upload_ids)
            if risk_level:
                query = query.eq("risk_level", risk_level)
            query = query.order("suspicious_score", desc=True)
            query = query.range((page - 1) * limit, page * limit - 1)
            response = query.execute()
            return response.data or [], response.count or 0
        except Exception as e:
            print(f"Error fetching suspicious addresses: {e}")
            return [], 0
    
    # ==================== Report Operations ====================
    
    async def create_report(self, report_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = self.client.table("reports").insert(report_data).execute()
        return response.data[0] if response.data else None
    
    async def get_report_by_id(self, report_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        query = self.client.table("reports").select("*").eq("id", report_id)
        if user_id:
            query = query.eq("user_id", user_id)
        response = query.single().execute()
        return response.data if response.data else None
    
    async def get_reports_by_user(
        self,
        user_id: str,
        upload_id: Optional[str] = None,
        page: int = 1,
        limit: int = 10
    ) -> Tuple[List[Dict[str, Any]], int]:
        query = self.client.table("reports").select("*", count="exact").eq("user_id", user_id)
        if upload_id:
            query = query.eq("upload_id", upload_id)
        query = query.order("created_at", desc=True)
        query = query.range((page - 1) * limit, page * limit - 1)
        response = query.execute()
        return response.data or [], response.count or 0
    
    async def update_report(self, report_id: str, report_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = self.client.table("reports").update(report_data).eq("id", report_id).execute()
        return response.data[0] if response.data else None
    
    async def delete_report(self, report_id: str, user_id: str) -> bool:
        self.client.table("reports").delete().eq("id", report_id).eq("user_id", user_id).execute()
        return True
    
    # ==================== API Key Operations ====================
    
    async def create_api_key(
        self,
        user_id: str,
        name: str,
        key_hash: str,
        prefix: str,
        expires_at: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        key_data = {
            "user_id": user_id,
            "name": name,
            "key_hash": key_hash,
            "prefix": prefix,
            "expires_at": expires_at
        }
        response = self.client.table("api_keys").insert(key_data).execute()
        return response.data[0] if response.data else None
    
    async def list_api_keys(self, user_id: str) -> List[Dict[str, Any]]:
        response = self.client.table("api_keys").select("*").eq("user_id", user_id).execute()
        return response.data or []
    
    async def delete_api_key(self, key_id: str, user_id: str) -> bool:
        self.client.table("api_keys").delete().eq("id", key_id).eq("user_id", user_id).execute()
        return True
    
    # ==================== Webhook Operations ====================
    
    async def create_webhook(
        self,
        user_id: str,
        name: str,
        url: str,
        events: List[str],
        secret: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        webhook_data = {
            "user_id": user_id,
            "name": name,
            "url": url,
            "events": events,
            "secret": secret,
            "active": True
        }
        response = self.client.table("webhooks").insert(webhook_data).execute()
        return response.data[0] if response.data else None
    
    async def list_webhooks(self, user_id: str) -> List[Dict[str, Any]]:
        response = self.client.table("webhooks").select("*").eq("user_id", user_id).execute()
        return response.data or []
    
    async def update_webhook(
        self,
        webhook_id: str,
        user_id: str,
        name: str,
        url: str,
        events: List[str],
        secret: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        webhook_data = {"name": name, "url": url, "events": events}
        if secret:
            webhook_data["secret"] = secret
        response = self.client.table("webhooks").update(webhook_data).eq("id", webhook_id).eq("user_id", user_id).execute()
        return response.data[0] if response.data else None
    
    async def delete_webhook(self, webhook_id: str, user_id: str) -> bool:
        self.client.table("webhooks").delete().eq("id", webhook_id).eq("user_id", user_id).execute()
        return True
    
    # ==================== Transaction Operations ====================
    
    async def create_transactions(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        response = self.client.table("transactions").insert(transactions).execute()
        return response.data or []
    
    async def get_transactions_by_upload(self, upload_id: str) -> List[Dict[str, Any]]:
        response = self.client.table("transactions").select("*").eq("upload_id", upload_id).execute()
        return response.data or []
    
    # ==================== Graph Snapshots Operations ====================
    
    async def save_graph_data(
        self,
        upload_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """Save graph data to graph_snapshots table as JSON"""
        try:
            import json
            graph_json = json.dumps({"nodes": nodes, "edges": edges})
            data = {"upload_id": upload_id, "graph_json": graph_json}
            response = self.client.table("graph_snapshots").upsert(data, on_conflict="upload_id").execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving graph snapshot: {e}")
            return None
    
    async def get_graph_data(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Get graph data from graph_snapshots table"""
        try:
            import json
            response = self.client.table("graph_snapshots").select("*").eq("upload_id", upload_id).single().execute()
            if response.data and response.data.get("graph_json"):
                graph = json.loads(response.data["graph_json"])
                return graph
            return None
        except Exception as e:
            print(f"Error fetching graph snapshot: {e}")
            return None
    
    # ==================== Analysis Results Operations ====================
    
    async def save_analysis_results(
        self,
        upload_id: str,
        suspicious_node_count: int,
        smurfing_patterns_detected: int,
        max_risk_score: float
    ) -> Optional[Dict[str, Any]]:
        """Save or update analysis results for an upload - matches analysis_results table schema"""
        try:
            analysis_data = {
                "upload_id": upload_id,
                "suspicious_node_count": suspicious_node_count,
                "smurfing_patterns_detected": smurfing_patterns_detected,
                "max_risk_score": max_risk_score
            }
            # Upsert to allow re-running analysis
            response = self.client.table("analysis_results").upsert(
                analysis_data,
                on_conflict="upload_id"
            ).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving analysis results: {e}")
            return None
    
    async def get_analysis_results(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Get analysis results for a specific upload"""
        try:
            response = self.client.table("analysis_results").select("*").eq("upload_id", upload_id).single().execute()
            return response.data if response.data else None
        except Exception:
            return None
    
    async def get_all_analysis_results_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all analysis results for uploads owned by a user"""
        try:
            # First get all upload IDs for this user
            uploads_resp = self.client.table("uploads").select("id").eq("user_id", user_id).execute()
            upload_ids = [u["id"] for u in (uploads_resp.data or [])]
            
            if not upload_ids:
                return []
            
            # Then get analysis results for those uploads
            response = self.client.table("analysis_results").select("*").in_("upload_id", upload_ids).execute()
            return response.data or []
        except Exception as e:
            print(f"Error getting analysis results: {e}")
            return []
    
    # ==================== Dashboard Statistics ====================
    
    async def get_dashboard_stats(self, user_id: str) -> Dict[str, Any]:
        """Get aggregated dashboard stats from uploads and analysis_results"""
        # Get user's uploads
        uploads_resp = self.client.table("uploads").select("id, row_count", count="exact").eq("user_id", user_id).execute()
        total_uploads = uploads_resp.count or 0
        uploads = uploads_resp.data or []
        
        # Sum total transactions from uploads
        total_transactions = sum(u.get("row_count", 0) for u in uploads)
        
        # Get upload IDs
        upload_ids = [u["id"] for u in uploads]
        
        # Aggregate from analysis_results table
        suspicious_count = 0
        patterns_count = 0
        max_risk = 0.0
        addresses_monitored = 0
        
        if upload_ids:
            try:
                analysis_resp = self.client.table("analysis_results").select("*").in_("upload_id", upload_ids).execute()
                for result in (analysis_resp.data or []):
                    suspicious_count += result.get("suspicious_node_count", 0)
                    patterns_count += result.get("smurfing_patterns_detected", 0)
                    max_risk = max(max_risk, result.get("max_risk_score", 0.0))
                addresses_monitored = len(analysis_resp.data or [])
            except Exception as e:
                print(f"Error fetching analysis_results: {e}")
        
        recent_resp = self.client.table("uploads").select("*").eq("user_id", user_id).order("uploaded_at", desc=True).limit(5).execute()
        recent_uploads = recent_resp.data or []
        
        return {
            "total_uploads": total_uploads,
            "total_transactions": total_transactions,
            "suspicious_count": suspicious_count,
            "patterns_count": patterns_count,
            "max_risk_score": max_risk,
            "addresses_monitored": addresses_monitored,
            "recent_uploads": recent_uploads
        }


# Global singleton instance
supabase_service = SupabaseService()
supabase_client = supabase_service

