"""
Graph Schemas
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    riskScore: float
    suspicious: bool
    metadata: Dict[str, Any] = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float
    transactionCount: int
    metadata: Dict[str, Any] = {}


class GraphMetadata(BaseModel):
    totalNodes: int
    totalEdges: int
    truncated: bool


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata: GraphMetadata


class CentralityMetrics(BaseModel):
    maxDegree: int
    maxBetweenness: float
    maxPageRank: float


class SuspiciousSubgraph(BaseModel):
    centerId: str
    nodeCount: int
    suspiciousCount: int
    riskLevel: str


class GraphStatisticsResponse(BaseModel):
    nodeCount: int
    edgeCount: int
    density: float
    averageDegree: float
    clusteringCoefficient: float
    connectedComponents: int
    largestComponentSize: int
    centralityMetrics: CentralityMetrics
    suspiciousSubgraphs: List[SuspiciousSubgraph]
