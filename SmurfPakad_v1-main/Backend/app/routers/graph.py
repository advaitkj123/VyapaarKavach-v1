"""
Graph Router - Transaction graph endpoints with ML-powered suspicious subgraph extraction
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from app.schemas.graph import (
    GraphResponse,
    GraphNode,
    GraphEdge,
    GraphMetadata,
    GraphStatisticsResponse,
    CentralityMetrics,
    SuspiciousSubgraph
)
from app.services.graph_service import graph_service
from app.dependencies import get_current_user

router = APIRouter(prefix="/graph", tags=["Graph"])


@router.get("/{upload_id}/stats")
async def get_graph_stats_alias(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get graph statistics alias"""
    user_id = current_user["sub"]
    stats = await graph_service.get_network_statistics(upload_id, user_id)
    if not stats:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Statistics not available")
    return stats


@router.get("/{upload_id}/subgraph")
async def get_subgraph_alias(
    upload_id: str,
    address: Optional[str] = Query(default=None),
    depth: int = Query(default=2),
    suspicious_only: bool = Query(default=False),
    current_user: dict = Depends(get_current_user)
):
    """Get subgraph by address or suspicious filter"""
    user_id = current_user["sub"]
    subgraph = await graph_service.get_suspicious_subgraph(upload_id, user_id)
    if not subgraph:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subgraph not found")
    return subgraph


@router.get("/{upload_id}/clusters")
async def get_clusters_alias(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get clusters in the transaction graph"""
    user_id = current_user["sub"]
    stats = await graph_service.get_network_statistics(upload_id, user_id)
    if not stats:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clusters not found")
    return stats.get("suspiciousClusters", [])


@router.get("/{upload_id}", response_model=GraphResponse)
async def get_graph_data(

    upload_id: str,
    depth: int = Query(default=2, ge=1, le=5),
    min_amount: Optional[float] = Query(default=None),
    current_user: dict = Depends(get_current_user)
):
    """Get graph data for visualization"""
    user_id = current_user["sub"]
    
    graph_data = await graph_service.get_graph_data(
        upload_id=upload_id,
        user_id=user_id,
        depth=depth,
        min_amount=min_amount
    )
    
    if not graph_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Graph data not found"
        )
    
    nodes = [
        GraphNode(
            id=n["id"],
            label=n.get("address", n["id"])[:8],
            type=n.get("type", "unknown"),
            riskScore=n.get("suspiciousScore", 0.0),
            suspicious=n.get("suspiciousScore", 0) > 0.5,
            metadata={"transactionCount": n.get("transactionCount", 0), "totalAmount": n.get("totalAmount", 0)}
        )
        for n in graph_data.get("nodes", [])
    ]
    
    edges = [
        GraphEdge(
            source=e["source"],
            target=e["target"],
            weight=e.get("amount", 1.0),
            transactionCount=1,
            metadata={"suspicious": e.get("suspicious", False)}
        )
        for e in graph_data.get("edges", [])
    ]
    
    return GraphResponse(
        nodes=nodes,
        edges=edges,
        metadata=GraphMetadata(
            totalNodes=len(nodes),
            totalEdges=len(edges),
            truncated=False
        )
    )


@router.get("/suspicious/{upload_id}")
async def get_suspicious_subgraph(
    upload_id: str,
    top_k: int = Query(default=20, ge=1, le=100, description="Number of top suspicious nodes"),
    hop: int = Query(default=2, ge=1, le=4, description="K-hop neighborhood distance"),
    min_score: float = Query(default=0.0, ge=0.0, le=1.0, description="Minimum suspicious score filter"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get suspicious subgraph using ML model
    
    This endpoint:
    1. Runs the GraphSAGE model on all transactions
    2. Sorts nodes by suspicious score (highest first)
    3. Selects top-K most suspicious nodes
    4. Extracts k-hop neighborhoods around each seed node
    5. Returns the subgraph for visualization
    
    Parameters:
    - **top_k**: Number of most suspicious nodes to include (default: 20)
    - **hop**: Number of hops for neighborhood extraction (default: 2)
    - **min_score**: Filter nodes below this suspicious score (default: 0.0)
    
    Returns:
    - **nodes**: List of nodes with id, suspiciousScore, riskLevel, isSeedNode
    - **edges**: List of edges connecting nodes in the subgraph
    - **metadata**: Statistics about the subgraph
    - **summary**: Summary statistics for the frontend
    """
    user_id = current_user["sub"]
    
    subgraph = await graph_service.get_suspicious_subgraph(
        upload_id=upload_id,
        user_id=user_id,
        top_k=top_k,
        hop=hop,
        min_score=min_score
    )
    
    if not subgraph:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not generate suspicious subgraph"
        )
    
    # Add summary field for frontend compatibility
    nodes = subgraph.get("nodes", [])
    metadata = subgraph.get("metadata", {})
    
    # Calculate summary statistics
    total_nodes = len(nodes)
    if total_nodes > 0:
        suspicious_scores = [n.get("suspiciousScore", 0) for n in nodes]
        high_risk = sum(1 for s in suspicious_scores if s > 0.8)
        medium_risk = sum(1 for s in suspicious_scores if 0.5 < s <= 0.8)
        low_risk = sum(1 for s in suspicious_scores if s <= 0.5)
        
        # Fan-out nodes: high out-degree
        fan_out = sum(1 for n in nodes if n.get("degree", {}).get("out", 0) >= 3)
        # Fan-in nodes: high in-degree
        fan_in = sum(1 for n in nodes if n.get("degree", {}).get("in", 0) >= 3)
        
        top_illicit_ratio = (high_risk / total_nodes) * 100 if total_nodes > 0 else 0
        avg_score = sum(suspicious_scores) / len(suspicious_scores) if suspicious_scores else 0
        
        if avg_score > 0.7:
            model_confidence = "high"
        elif avg_score > 0.4:
            model_confidence = "medium"
        else:
            model_confidence = "low"
    else:
        top_illicit_ratio = 0
        fan_out = 0
        fan_in = 0
        avg_score = 0
        model_confidence = "low"
    
    subgraph["summary"] = {
        "top_illicit_ratio": round(top_illicit_ratio, 1),
        "fan_out_nodes": fan_out,
        "fan_in_nodes": fan_in,
        "avg_suspicious_score": round(avg_score, 2),
        "model_confidence": model_confidence
    }
    
    return subgraph


@router.get("/statistics/{upload_id}", response_model=GraphStatisticsResponse)
async def get_graph_statistics(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get graph statistics"""
    user_id = current_user["sub"]
    
    stats = await graph_service.get_network_statistics(upload_id, user_id)
    
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Statistics not available"
        )
    
    return GraphStatisticsResponse(
        nodeCount=stats.get("totalNodes", 0),
        edgeCount=stats.get("totalEdges", 0),
        density=stats.get("density", 0.0),
        averageDegree=stats.get("avgDegree", 0.0),
        clusteringCoefficient=0.0,
        connectedComponents=stats.get("clusters", 0),
        largestComponentSize=0,
        centralityMetrics=CentralityMetrics(
            maxDegree=0,
            maxBetweenness=0.0,
            maxPageRank=0.0
        ),
        suspiciousSubgraphs=[
            SuspiciousSubgraph(
                centerId=s["id"],
                nodeCount=s["size"],
                suspiciousCount=s["size"],
                riskLevel="high" if s["riskScore"] > 0.7 else "medium"
            )
            for s in stats.get("suspiciousClusters", [])
        ]
    )
