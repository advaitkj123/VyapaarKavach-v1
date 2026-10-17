"""
Graph Service - Transaction graph operations with ML integration
"""
from typing import Dict, List, Optional
from pathlib import Path
import numpy as np
import pandas as pd
import networkx as nx

from app.core.database_service import database_service
supabase_client = database_service
from app.services.ml_service import ml_service

from app.config import settings


class GraphService:
    """
    Service for graph operations including:
    - Building transaction graphs
    - Extracting suspicious subgraphs using ML
    - Network statistics
    """
    
    def _load_upload_file(self, upload_id: str) -> pd.DataFrame:
        """Load the uploaded file from disk"""
        upload_dir = Path(settings.UPLOAD_DIR)
        
        for ext in ['.csv', '.xlsx', '.xls', '.json']:
            file_path = upload_dir / f"{upload_id}{ext}"
            if file_path.exists():
                if ext == '.csv':
                    return pd.read_csv(file_path)
                elif ext in ['.xlsx', '.xls']:
                    return pd.read_excel(file_path)
                elif ext == '.json':
                    return pd.read_json(file_path)
        
        return pd.DataFrame()
    
    async def get_graph_data(
        self,
        upload_id: str,
        user_id: str,
        depth: int = 2,
        min_amount: Optional[float] = None
    ) -> Optional[Dict]:
        """
        Get transaction graph data for visualization
        """
        # Verify ownership
        upload = await database_service.get_upload_by_id(upload_id)
        if not upload or upload.get("user_id") != user_id:
            return None
        
        # Load transactions from file
        df = self._load_upload_file(upload_id)
        
        if df.empty:
            return {"nodes": [], "edges": []}
        
        transactions = df.to_dict('records')
        
        # Build a NetworkX DiGraph for proper degree computation
        G = nx.DiGraph()
        
        # First pass: Add all edges to the graph
        edge_list = []
        for tx in transactions:
            # Handle various column naming conventions (including Source_Wallet_ID/Dest_Wallet_ID)
            source = (tx.get("Source_Wallet_ID") or tx.get("source_wallet_id") or 
                      tx.get("from_address") or tx.get("source") or tx.get("txId1"))
            target = (tx.get("Dest_Wallet_ID") or tx.get("dest_wallet_id") or 
                      tx.get("to_address") or tx.get("target") or tx.get("txId2"))
            amount = tx.get("Amount") or tx.get("amount") or tx.get("value") or 0
            timestamp = tx.get("Timestamp") or tx.get("timestamp") or tx.get("created_at")
            
            if not source or not target:
                continue
            
            # Convert to string for consistent IDs
            source = str(source)
            target = str(target)
            
            # Add edge to NetworkX graph (wallet_id → wallet_id)
            G.add_edge(source, target)
            
            edge_list.append({
                "source": source,
                "target": target,
                "amount": float(amount) if amount else 0,
                "timestamp": timestamp,
                "suspicious": False,
                "transactionId": tx.get("id")
            })
        
        # Sanity check: ensure at least some nodes have non-zero degrees
        if G.number_of_nodes() > 0:
            assert any(G.in_degree(n) > 0 or G.out_degree(n) > 0 for n in G.nodes()), \
                "Graph error: all wallet degrees are zero"
        
        # Second pass: Build node objects with correct degrees computed AFTER all edges added
        nodes = {}
        for tx in transactions:
            source = (tx.get("Source_Wallet_ID") or tx.get("source_wallet_id") or 
                      tx.get("from_address") or tx.get("source") or tx.get("txId1"))
            target = (tx.get("Dest_Wallet_ID") or tx.get("dest_wallet_id") or 
                      tx.get("to_address") or tx.get("target") or tx.get("txId2"))
            amount = tx.get("Amount") or tx.get("amount") or tx.get("value") or 0
            
            if not source or not target:
                continue
            
            source = str(source)
            target = str(target)
            
            # Add/update source node with degrees from the graph
            if source not in nodes:
                in_deg = G.in_degree(source)
                out_deg = G.out_degree(source)
                # Compute heuristic-based risk score from structural patterns
                risk_score = self._compute_wallet_risk(in_deg, out_deg)
                risk_level = self._get_risk_level(risk_score)
                nodes[source] = {
                    "id": source,
                    "address": source,
                    "type": self._infer_node_type(source, transactions),
                    "riskLevel": risk_level,
                    "risk_level": risk_level,
                    "degree": {"in": in_deg, "out": out_deg},
                    "transactionCount": 0,
                    "totalAmount": 0,
                    "suspiciousScore": risk_score
                }
            nodes[source]["transactionCount"] += 1
            nodes[source]["totalAmount"] += float(amount) if amount else 0
            
            # Add/update target node with degrees from the graph
            if target not in nodes:
                in_deg = G.in_degree(target)
                out_deg = G.out_degree(target)
                # Compute heuristic-based risk score from structural patterns
                risk_score = self._compute_wallet_risk(in_deg, out_deg)
                risk_level = self._get_risk_level(risk_score)
                nodes[target] = {
                    "id": target,
                    "address": target,
                    "type": self._infer_node_type(target, transactions),
                    "riskLevel": risk_level,
                    "risk_level": risk_level,
                    "degree": {"in": in_deg, "out": out_deg},
                    "transactionCount": 0,
                    "totalAmount": 0,
                    "suspiciousScore": risk_score
                }
            nodes[target]["transactionCount"] += 1
            nodes[target]["totalAmount"] += float(amount) if amount else 0
        
        edges = edge_list
        
        result = {
            "nodes": list(nodes.values()),
            "edges": edges
        }
        
        # Cache the graph data
        await database_service.save_graph_data(
            upload_id,
            result["nodes"],
            result["edges"]
        )
        
        # Also save analysis results (aggregated from graph computation)
        nodes_list = list(nodes.values())
        suspicious_count = sum(1 for n in nodes_list if n.get("suspiciousScore", 0) >= 0.35)
        smurfing_patterns = sum(
            1 for n in nodes_list 
            if n.get("degree", {}).get("in", 0) >= 3 and n.get("degree", {}).get("out", 0) >= 3
        )
        max_risk = max((n.get("suspiciousScore", 0) for n in nodes_list), default=0.0)
        
        await database_service.save_analysis_results(
            upload_id=upload_id,
            suspicious_node_count=suspicious_count,
            smurfing_patterns_detected=smurfing_patterns,
            max_risk_score=max_risk
        )
        
        return self._format_graph_response(result, min_amount)
    
    async def get_suspicious_subgraph(
        self,
        upload_id: str,
        user_id: str,
        top_k: int = 20,
        hop: int = 2,
        min_score: float = 0.0
    ) -> Optional[Dict]:
        """
        Get suspicious subgraph using ML model
        
        This is the KEY visualization endpoint that:
        1. Loads transaction data from file
        2. Runs ML model to score all nodes
        3. Extracts top-K suspicious nodes with k-hop neighborhoods
        4. Returns subgraph optimized for visualization
        
        Args:
            upload_id: Upload identifier
            user_id: User identifier for access control
            top_k: Number of top suspicious nodes to include
            hop: Number of hops for neighborhood extraction
            min_score: Minimum suspicious score filter
        
        Returns:
            Subgraph with nodes, edges, and metadata
        """
        # Verify ownership
        upload = await database_service.get_upload_by_id(upload_id)
        if not upload or upload.get("user_id") != user_id:
            return None
        
        # Load transactions from file
        df = self._load_upload_file(upload_id)
        if df.empty:
            return {"nodes": [], "edges": [], "metadata": {"error": "No transactions found"}}
        
        # Prepare features and edge index
        features, tx_ids, edge_index = ml_service._prepare_graph_data(df, None)
        
        if features is None:
            return {"nodes": [], "edges": [], "metadata": {"error": "Could not extract features"}}
        
        # Extract suspicious subgraph using ML model
        subgraph = ml_service.get_suspicious_subgraph_from_upload(
            features=features,
            edge_index=edge_index,
            tx_ids=tx_ids,
            top_k=top_k,
            hop=hop,
            min_score=min_score
        )
        
        return subgraph
    
    def _format_graph_response(
        self,
        data: Dict,
        min_amount: Optional[float] = None
    ) -> Dict:
        """
        Format and filter graph response
        """
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])
        
        # Filter by minimum amount if specified
        if min_amount is not None:
            edges = [e for e in edges if e.get("amount", 0) >= min_amount]
            
            # Keep only nodes that have edges
            node_ids = set()
            for e in edges:
                node_ids.add(e["source"])
                node_ids.add(e["target"])
            
            nodes = [n for n in nodes if n["id"] in node_ids]
        
        return {"nodes": nodes, "edges": edges}
    
    def _infer_node_type(self, address: str, transactions: List) -> str:
        """
        Infer node type based on transaction patterns
        """
        # Simple heuristic - could be enhanced
        send_count = sum(
            1 for tx in transactions
            if (tx.get("Source_Wallet_ID") == address or tx.get("source_wallet_id") == address or
                tx.get("from_address") == address or tx.get("source") == address)
        )
        recv_count = sum(
            1 for tx in transactions
            if (tx.get("Dest_Wallet_ID") == address or tx.get("dest_wallet_id") == address or
                tx.get("to_address") == address or tx.get("target") == address)
        )
        
        if send_count > recv_count * 2:
            return "sender"
        elif recv_count > send_count * 2:
            return "receiver"
        elif send_count > 10 and recv_count > 10:
            return "exchange"
        
        return "unknown"
    
    def _compute_wallet_risk(self, in_deg: int, out_deg: int, ml_score: float = 0.0) -> float:
        """
        Compute heuristic-based risk score from structural graph patterns.
        
        Smurfing indicators:
        - High out-degree: splitting funds to multiple destinations (fan-out)
        - High in-degree: aggregating funds from multiple sources (fan-in)
        - Both high: classic mule/mixing pattern
        
        Returns a score between 0.0 and 1.0.
        """
        score = 0.0
        total_deg = in_deg + out_deg
        
        # Fan-out pattern (splitting/structuring)
        # Thresholds lowered for DIRECTED graphs (was >= 3, now >= 2)
        if out_deg >= 2:
            score += 0.25
        if out_deg >= 4:
            score += 0.15
        
        # Fan-in pattern (aggregating)
        if in_deg >= 2:
            score += 0.25
        if in_deg >= 4:
            score += 0.15
        
        # Both high - strong smurfing/mule signature
        if in_deg >= 2 and out_deg >= 2:
            score += 0.20
        
        # High activity bonus
        if total_deg >= 4:
            score += 0.10
        
        # ML signal (weak weight since model is undertrained on custom data)
        score += 0.10 * ml_score
        
        return min(score, 1.0)
    
    def _get_risk_level(self, score: float) -> str:
        """
        Convert numeric risk score to categorical risk level.
        
        Thresholds tuned for smurfing detection:
        - >= 0.65: high (red) - likely smurfing hub
        - >= 0.35: medium (yellow) - suspicious, needs review
        - < 0.35: low (green) - likely legitimate
        """
        if score >= 0.65:
            return "high"
        elif score >= 0.35:
            return "medium"
        return "low"
    
    async def get_network_statistics(
        self,
        upload_id: str,
        user_id: str
    ) -> Optional[Dict]:
        """
        Calculate network statistics for an upload
        """
        # Verify ownership
        upload = await database_service.get_upload_by_id(upload_id)
        if not upload or upload.get("user_id") != user_id:
            return None
        
        graph_data = await self.get_graph_data(upload_id, user_id)
        
        if not graph_data or not graph_data.get("edges"):
            return {
                "totalNodes": 0,
                "totalEdges": 0,
                "clusters": 0,
                "avgDegree": 0,
                "density": 0,
                "suspiciousClusters": []
            }
        
        # Build NetworkX graph
        G = nx.DiGraph()
        
        for node in graph_data["nodes"]:
            G.add_node(node["id"], **node)
        
        for edge in graph_data["edges"]:
            G.add_edge(edge["source"], edge["target"], **edge)
        
        # Calculate statistics
        total_nodes = G.number_of_nodes()
        total_edges = G.number_of_edges()
        
        # Connected components (treating as undirected)
        undirected = G.to_undirected()
        components = list(nx.connected_components(undirected))
        num_clusters = len(components)
        
        # Average degree
        avg_degree = sum(dict(G.degree()).values()) / total_nodes if total_nodes > 0 else 0
        
        # Density
        density = nx.density(G) if total_nodes > 1 else 0
        
        # Find suspicious clusters
        suspicious_clusters = []
        for i, component in enumerate(components):
            if len(component) < 3:
                continue
            
            # Calculate cluster risk
            cluster_scores = [
                G.nodes[n].get("suspiciousScore", 0)
                for n in component
                if "suspiciousScore" in G.nodes[n]
            ]
            
            if cluster_scores:
                avg_risk = np.mean(cluster_scores)
                if avg_risk > 0.3:  # Threshold for suspicious cluster
                    suspicious_clusters.append({
                        "id": f"cluster_{i}",
                        "size": len(component),
                        "riskScore": float(avg_risk),
                        "addresses": list(component)[:20]  # Limit addresses
                    })
        
        # Sort by risk
        suspicious_clusters.sort(key=lambda x: x["riskScore"], reverse=True)
        
        return {
            "totalNodes": total_nodes,
            "totalEdges": total_edges,
            "clusters": num_clusters,
            "avgDegree": round(avg_degree, 2),
            "density": round(density, 4),
            "suspiciousClusters": suspicious_clusters[:10]  # Top 10
        }


# Global service instance
graph_service = GraphService()
