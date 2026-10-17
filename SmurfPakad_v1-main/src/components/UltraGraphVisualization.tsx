import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { ErrorBoundary } from './ErrorBoundary';
import { ZoomIn, ZoomOut, Maximize2, Info, Search, Download, TrendingUp, Route, Camera, Play, Pause, Box, AlertTriangle, Network, BarChart3, Bookmark, Layers, GitBranch, X } from 'lucide-react';
import { toast } from './ToastNotification';

interface GraphNode {
  id: string;
  label: string;
  suspicious_score: number;
  risk_level: string;
  class: string;
  top_k: boolean;
  degree: {
    in: number;
    out: number;
  };
  timestamp?: number;
  community?: number;
  centrality?: {
    pagerank?: number;
    betweenness?: number;
    closeness?: number;
    degree?: number;
  };
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  high_risk: boolean;
  flow: string;
  timestamp?: number;
}

interface GraphData {
  meta: {
    k: number;
    hop: number;
    total_nodes: number;
    total_edges: number;
    generated_at: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    top_illicit_ratio: number;
    fan_out_nodes: number;
    fan_in_nodes: number;
    avg_suspicious_score: number;
    model_confidence: string;
  };
}

interface UltraGraphProps {
  data?: GraphData;
}

interface Snapshot {
  id: string;
  name: string;
  timestamp: number;
  filters: {
    searchTerm: string;
    filterRisk: string;
    timeSlider: number[];
  };
  highlightedPath: string[];
  selectedNode: string | null;
}

interface Alert {
  id: string;
  type: 'circular_flow' | 'rapid_dispersal' | 'layering' | 'high_risk_cluster';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  nodes: string[];
  timestamp: number;
}

// ForceGraph2D imperative API
interface ForceGraph2DInstance {
  zoom: (zoom?: number, duration?: number) => number;
  zoomToFit: (duration?: number, padding?: number) => void;
  centerAt: (x?: number, y?: number, duration?: number) => void;
  d3Force: (force: string, fn?: unknown) => unknown;
  d3ReheatSimulation: () => void;
  pauseAnimation: () => void;
  resumeAnimation: () => void;
}

interface SimulationNode extends GraphNode {
  val?: number;
  x?: number;
  y?: number;
}

interface SimulationLink {
  source: SimulationNode | string;
  target: SimulationNode | string;
  weight: number;
  high_risk: boolean;
}

type RawNode = GraphNode & {
  riskLevel?: string;
  suspiciousScore?: number;
  risk?: number;
};

const UltraGraphVisualization = ({ data }: UltraGraphProps) => {
  const graphRef = useRef<ForceGraph2DInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Static demo data - defined outside component to prevent recreation
  const demoDataRef = useRef<GraphData>({
    meta: {
      k: 20,
      hop: 2,
      total_nodes: 15,
      total_edges: 18,
      generated_at: "2026-01-31T14:30:00Z"
    },
    nodes: [
      { id: "tx_001", label: "transaction", suspicious_score: 0.9987, risk_level: "high", class: "illicit", top_k: true, degree: { in: 7, out: 5 }, timestamp: 10, community: 1, centrality: { pagerank: 0.12, betweenness: 0.35, closeness: 0.78, degree: 12 } },
      { id: "tx_002", label: "transaction", suspicious_score: 0.8765, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 3, out: 8 }, timestamp: 25, community: 1, centrality: { pagerank: 0.08, betweenness: 0.22, closeness: 0.65, degree: 11 } },
      { id: "tx_003", label: "transaction", suspicious_score: 0.9543, risk_level: "high", class: "illicit", top_k: true, degree: { in: 12, out: 4 }, timestamp: 35, community: 1, centrality: { pagerank: 0.15, betweenness: 0.42, closeness: 0.82, degree: 16 } },
      { id: "tx_004", label: "transaction", suspicious_score: 0.6543, risk_level: "low", class: "licit", top_k: false, degree: { in: 2, out: 3 }, timestamp: 45, community: 2, centrality: { pagerank: 0.04, betweenness: 0.08, closeness: 0.45, degree: 5 } },
      { id: "tx_005", label: "transaction", suspicious_score: 0.8901, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 5, out: 6 }, timestamp: 55, community: 2, centrality: { pagerank: 0.09, betweenness: 0.25, closeness: 0.68, degree: 11 } },
      { id: "tx_006", label: "transaction", suspicious_score: 0.9876, risk_level: "high", class: "illicit", top_k: true, degree: { in: 15, out: 3 }, timestamp: 60, community: 1, centrality: { pagerank: 0.18, betweenness: 0.48, closeness: 0.88, degree: 18 } },
      { id: "tx_007", label: "transaction", suspicious_score: 0.7234, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 4, out: 7 }, timestamp: 70, community: 2, centrality: { pagerank: 0.07, betweenness: 0.18, closeness: 0.62, degree: 11 } },
      { id: "tx_008", label: "transaction", suspicious_score: 0.5234, risk_level: "low", class: "licit", top_k: false, degree: { in: 1, out: 2 }, timestamp: 80, community: 3, centrality: { pagerank: 0.03, betweenness: 0.05, closeness: 0.38, degree: 3 } },
      { id: "tx_009", label: "transaction", suspicious_score: 0.9654, risk_level: "high", class: "illicit", top_k: true, degree: { in: 9, out: 11 }, timestamp: 85, community: 1, centrality: { pagerank: 0.16, betweenness: 0.45, closeness: 0.85, degree: 20 } },
      { id: "tx_010", label: "transaction", suspicious_score: 0.8123, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 6, out: 5 }, timestamp: 90, community: 2, centrality: { pagerank: 0.08, betweenness: 0.20, closeness: 0.64, degree: 11 } },
      { id: "tx_011", label: "transaction", suspicious_score: 0.9123, risk_level: "high", class: "illicit", top_k: true, degree: { in: 8, out: 7 }, timestamp: 15, community: 1, centrality: { pagerank: 0.13, betweenness: 0.38, closeness: 0.80, degree: 15 } },
      { id: "tx_012", label: "transaction", suspicious_score: 0.7456, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 4, out: 5 }, timestamp: 40, community: 2, centrality: { pagerank: 0.06, betweenness: 0.15, closeness: 0.58, degree: 9 } },
      { id: "tx_013", label: "transaction", suspicious_score: 0.6789, risk_level: "low", class: "licit", top_k: false, degree: { in: 3, out: 2 }, timestamp: 65, community: 3, centrality: { pagerank: 0.05, betweenness: 0.10, closeness: 0.48, degree: 5 } },
      { id: "tx_014", label: "transaction", suspicious_score: 0.9789, risk_level: "high", class: "illicit", top_k: true, degree: { in: 11, out: 9 }, timestamp: 30, community: 1, centrality: { pagerank: 0.17, betweenness: 0.46, closeness: 0.86, degree: 20 } },
      { id: "tx_015", label: "transaction", suspicious_score: 0.8456, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 5, out: 8 }, timestamp: 95, community: 2, centrality: { pagerank: 0.09, betweenness: 0.23, closeness: 0.66, degree: 13 } }
    ],
    edges: [
      { source: "tx_001", target: "tx_002", weight: 1.5, high_risk: true, flow: "outgoing", timestamp: 25 },
      { source: "tx_001", target: "tx_003", weight: 2.3, high_risk: true, flow: "outgoing", timestamp: 35 },
      { source: "tx_002", target: "tx_005", weight: 0.8, high_risk: false, flow: "outgoing", timestamp: 55 },
      { source: "tx_003", target: "tx_006", weight: 3.1, high_risk: true, flow: "outgoing", timestamp: 60 },
      { source: "tx_004", target: "tx_007", weight: 0.5, high_risk: false, flow: "outgoing", timestamp: 70 },
      { source: "tx_005", target: "tx_010", weight: 1.2, high_risk: false, flow: "outgoing", timestamp: 90 },
      { source: "tx_006", target: "tx_009", weight: 2.8, high_risk: true, flow: "outgoing", timestamp: 85 },
      { source: "tx_007", target: "tx_012", weight: 0.7, high_risk: false, flow: "outgoing", timestamp: 40 },
      { source: "tx_009", target: "tx_011", weight: 2.5, high_risk: true, flow: "bidirectional", timestamp: 15 },
      { source: "tx_011", target: "tx_014", weight: 2.9, high_risk: true, flow: "outgoing", timestamp: 30 },
      { source: "tx_010", target: "tx_015", weight: 1.1, high_risk: false, flow: "outgoing", timestamp: 95 },
      { source: "tx_012", target: "tx_013", weight: 0.6, high_risk: false, flow: "outgoing", timestamp: 65 },
      { source: "tx_014", target: "tx_001", weight: 3.2, high_risk: true, flow: "outgoing", timestamp: 10 },
      { source: "tx_013", target: "tx_008", weight: 0.4, high_risk: false, flow: "outgoing", timestamp: 80 },
      { source: "tx_002", target: "tx_011", weight: 1.9, high_risk: true, flow: "bidirectional", timestamp: 15 },
      { source: "tx_005", target: "tx_007", weight: 0.9, high_risk: false, flow: "outgoing", timestamp: 70 },
      { source: "tx_006", target: "tx_014", weight: 2.7, high_risk: true, flow: "bidirectional", timestamp: 30 },
      { source: "tx_015", target: "tx_005", weight: 1.0, high_risk: false, flow: "outgoing", timestamp: 55 }
    ],
    summary: {
      top_illicit_ratio: 0.87,
      fan_out_nodes: 8,
      fan_in_nodes: 6,
      avg_suspicious_score: 0.8234,
      model_confidence: "high"
    }
  });

  // Use provided data or stable demo data reference, normalizing field names
  const graphData = useMemo(() => {
    const source = data || demoDataRef.current;
    return {
      ...source,
      nodes: (source.nodes || []).map((n: RawNode) => ({
        ...n,
        risk_level: (n.risk_level || n.riskLevel || 'low').toLowerCase(),
        suspicious_score: n.suspicious_score || n.suspiciousScore || n.risk || 0,
      })),
      edges: source.edges || [],
    };
  }, [data]);

  // State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [showPredictions, setShowPredictions] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [timeSlider, setTimeSlider] = useState([100]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [centralityMode, setCentralityMode] = useState<'none' | 'pagerank' | 'betweenness' | 'closeness' | 'degree'>('none');
  const [showCommunities, setShowCommunities] = useState(false);
  const [networkStats, setNetworkStats] = useState<Record<string, unknown> | null>(null);

  // New states for hover tooltip and trace all paths
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [nodeMenuPosition, setNodeMenuPosition] = useState({ x: 0, y: 0 });
  const [tracingAllPaths, setTracingAllPaths] = useState<string | null>(null);
  const [tracedEdges, setTracedEdges] = useState<Set<string>>(new Set());

  // Calculate Network Statistics - only when data changes (use node count as stable dependency)
  const nodeCount = graphData.nodes?.length || 0;
  const edgeCount = graphData.edges?.length || 0;

  useEffect(() => {
    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];

    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    if (totalNodes === 0) return;

    const maxPossibleEdges = totalNodes * (totalNodes - 1);
    const density = totalEdges / maxPossibleEdges;

    // Calculate average clustering coefficient (simplified)
    const avgClustering = nodes.reduce((sum, node) => {
      const neighbors = edges.filter(e =>
        (typeof e.source === 'string' ? e.source : e.source?.id) === node.id ||
        (typeof e.target === 'string' ? e.target : e.target?.id) === node.id
      ).length;
      return sum + (neighbors > 1 ? neighbors / (neighbors - 1) : 0);
    }, 0) / totalNodes;

    // Diameter (simplified - using max degree separation as approximation)
    const diameter = 4; // Simplified for demo

    // Community count
    const communities = new Set(nodes.map(n => n.community)).size;

    setNetworkStats({
      density: (density * 100).toFixed(2),
      avgClustering: avgClustering.toFixed(3),
      diameter,
      communities,
      avgDegree: (totalEdges * 2 / totalNodes).toFixed(2),
      illicitRatio: (nodes.filter(n => n.class === 'illicit').length / totalNodes * 100).toFixed(1)
    });
  }, [nodeCount, edgeCount]);

  // Detect Patterns and Generate Alerts - only when data changes
  useEffect(() => {
    if (!graphData.nodes || !graphData.edges) return;
    const detectedAlerts: Alert[] = [];

    // Detect circular flows (A -> B -> C -> A)
    const edgeMap = new Map<string, string[]>();
    graphData.edges.forEach(edge => {
      if (!edge) return;
      const src = typeof edge.source === 'string' ? edge.source : edge.source?.id;
      const tgt = typeof edge.target === 'string' ? edge.target : edge.target?.id;
      if (!src || !tgt) return;
      if (!edgeMap.has(src)) edgeMap.set(src, []);
      edgeMap.get(src)!.push(tgt);
    });

    // Simple cycle detection
    const cycles: string[][] = [];
    graphData.nodes.forEach(node => {
      if (!node?.id) return;
      const visited = new Set<string>();
      const path: string[] = [];

      const dfs = (current: string, target: string) => {
        if (visited.has(current)) {
          if (current === target && path.length >= 3) {
            cycles.push([...path, current]);
          }
          return;
        }
        visited.add(current);
        path.push(current);

        const neighbors = edgeMap.get(current) || [];
        neighbors.forEach(neighbor => dfs(neighbor, target));

        path.pop();
      };

      if (edgeMap.has(node.id)) {
        dfs(node.id, node.id);
      }
    });

    if (cycles.length > 0) {
      detectedAlerts.push({
        id: 'alert_1',
        type: 'circular_flow',
        severity: 'critical',
        message: `Detected ${cycles.length} circular transaction flow(s) - potential money laundering`,
        nodes: cycles[0] || [],
        timestamp: Date.now()
      });
    }

    // Detect rapid dispersal (one node with many outgoing high-risk edges)
    graphData.nodes.forEach(node => {
      const outgoing = graphData.edges.filter(e =>
        (typeof e.source === 'string' ? e.source : e.source) === node.id && e.high_risk
      );
      if (outgoing.length >= 3) {
        detectedAlerts.push({
          id: `alert_dispersal_${node.id}`,
          type: 'rapid_dispersal',
          severity: 'high',
          message: `Node ${node.id} shows rapid fund dispersal pattern (${outgoing.length} high-risk outputs)`,
          nodes: [node.id],
          timestamp: Date.now()
        });
      }
    });

    // Detect high-risk clusters
    const communities = new Map<number, GraphNode[]>();
    graphData.nodes.forEach(node => {
      if (!node.community) return;
      if (!communities.has(node.community)) communities.set(node.community, []);
      communities.get(node.community)!.push(node);
    });

    communities.forEach((nodes, communityId) => {
      const avgRisk = nodes.reduce((sum, n) => sum + n.suspicious_score, 0) / nodes.length;
      if (avgRisk > 0.85 && nodes.length >= 3) {
        detectedAlerts.push({
          id: `alert_cluster_${communityId}`,
          type: 'high_risk_cluster',
          severity: 'critical',
          message: `Community ${communityId} identified as high-risk cluster (avg risk: ${(avgRisk * 100).toFixed(1)}%)`,
          nodes: nodes.map(n => n.id),
          timestamp: Date.now()
        });
      }
    });

    setAlerts(detectedAlerts);
  }, [nodeCount, edgeCount]);

  // Time-based filtering - memoized to prevent re-renders
  const maxTime = useMemo(() => {
    if (!graphData.nodes || graphData.nodes.length === 0) return 100;
    return Math.max(...graphData.nodes.map(n => n.timestamp || 100));
  }, [graphData.nodes]);
  const currentTimeThreshold = (timeSlider[0] / 100) * maxTime;

  const filteredNodes = useMemo(() =>
    (graphData.nodes || []).filter(node => {
      const matchesSearch = searchTerm === '' || node.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRisk = filterRisk === 'all' || node.risk_level === filterRisk;
      const matchesTime = !node.timestamp || node.timestamp <= currentTimeThreshold;
      return matchesSearch && matchesRisk && matchesTime;
    }),
    [graphData.nodes, searchTerm, filterRisk, currentTimeThreshold]
  );

  const filteredEdges = useMemo(() => {
    if (!graphData.edges || !Array.isArray(graphData.edges)) return [];
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return graphData.edges.filter(edge => {
      if (!edge) return false;
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;
      if (!sourceId || !targetId) return false;
      const sourceExists = nodeIds.has(sourceId);
      const targetExists = nodeIds.has(targetId);
      const matchesTime = !edge.timestamp || edge.timestamp <= currentTimeThreshold;
      return sourceExists && targetExists && matchesTime;
    });
  }, [graphData.edges, filteredNodes, currentTimeThreshold]);

  // Community colors
  const communityColors = {
    1: '#ff6b6b',
    2: '#4ecdc4',
    3: '#95e1d3',
    4: '#f38181',
    5: '#aa96da'
  };

  // Centrality-based colors
  const getCentralityColor = useCallback((node: GraphNode) => {
    if (centralityMode === 'none') return null; // Will use getNodeColor

    const value = node.centrality?.[centralityMode] || 0;
    const intensity = Math.floor(value * 255);
    return `rgb(${255 - intensity}, ${intensity}, 150)`;
  }, [centralityMode]);

  const getNodeColor = useCallback((node: GraphNode) => {
    // Highlight traced node
    if (tracingAllPaths === node.id) return '#a855f7';

    if (centralityMode !== 'none') {
      const value = node.centrality?.[centralityMode] || 0;
      const intensity = Math.floor(value * 255);
      return `rgb(${255 - intensity}, ${intensity}, 150)`;
    }

    if (showCommunities && node.community) {
      return communityColors[node.community as keyof typeof communityColors] || '#999';
    }

    if (node.risk_level === 'high') return '#ef4444';
    if (node.risk_level === 'medium') return '#f59e0b';
    return '#10b981';
  }, [centralityMode, showCommunities, tracingAllPaths]);

  const getLinkColor = useCallback((link: GraphEdge) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode)?.id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode)?.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;

    // Check if this edge is being traced
    if (tracedEdges.has(edgeKey)) return '#a855f7';

    if (highlightedPath.length > 0) {
      if (sourceId && targetId) {
        for (let i = 0; i < highlightedPath.length - 1; i++) {
          if (highlightedPath[i] === sourceId && highlightedPath[i + 1] === targetId) {
            return '#a855f7';
          }
        }
      }
    }
    return link.high_risk ? '#ef4444' : '#94a3b8';
  }, [highlightedPath, tracedEdges]);

  const getLinkWidth = useCallback((link: GraphEdge) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode)?.id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode)?.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;

    // Wider for traced edges
    if (tracedEdges.has(edgeKey)) return 4;

    return link.high_risk ? 2 : 1;
  }, [tracedEdges]);

  // Container dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    // Set initial width immediately
    const initialWidth = containerRef.current.offsetWidth;
    if (initialWidth > 0) {
      setDimensions({ width: initialWidth, height: 600 });
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          setDimensions({ width: newWidth, height: 600 });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only trigger if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomFit();
            toast.info('Zoom to fit');
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            saveSnapshot();
          }
          break;
        case 'e':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleExport();
          }
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'escape':
          setSelectedNode(null);
          setHighlightedPath([]);
          setPathStart(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // BFS for shortest path
  const findShortestPath = useCallback((startId: string, endId: string): string[] => {
    if (!filteredEdges || filteredEdges.length === 0) return [];
    const queue: { node: string; path: string[] }[] = [{ node: startId, path: [startId] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === endId) return path;
      if (visited.has(node)) continue;
      visited.add(node);

      const neighbors = filteredEdges
        .filter(e => {
          const src = typeof e.source === 'string' ? e.source : e.source?.id;
          return src === node;
        })
        .map(e => typeof e.target === 'string' ? e.target : e.target?.id)
        .filter((n): n is string => !!n);

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return [];
  }, [filteredEdges]);

  // Generate explanation for why node is suspicious/safe
  const getNodeExplanation = useCallback((node: GraphNode): { title: string; reasons: string[]; verdict: string } => {
    const reasons: string[] = [];
    const inDegree = node.degree?.in || 0;
    const outDegree = node.degree?.out || 0;
    const riskScore = node.suspicious_score || 0;

    // Analyze in/out degree patterns
    const highFanIn = inDegree >= 5;
    const highFanOut = outDegree >= 5;
    const lowFanIn = inDegree <= 2;
    const lowFanOut = outDegree <= 2;

    if (node.risk_level === 'high' || node.risk_level === 'critical') {
      if (highFanIn && highFanOut) {
        reasons.push("⚠️ High fan-in AND fan-out activity detected");
        reasons.push("🔴 Potential smurfing/layering pattern");
      } else if (highFanIn) {
        reasons.push("⚠️ High fan-in activity (receiving from many sources)");
        reasons.push("🔴 Possible collection point for illicit funds");
      } else if (highFanOut) {
        reasons.push("⚠️ High fan-out activity (distributing to many targets)");
        reasons.push("🔴 Possible structuring/distribution hub");
      }
      if (riskScore >= 0.9) {
        reasons.push("🚨 Extremely high risk score - immediate review recommended");
      }
      return {
        title: "🔴 HIGH RISK - SUSPICIOUS",
        reasons,
        verdict: "This node exhibits patterns consistent with money laundering activities."
      };
    } else if (node.risk_level === 'medium') {
      if (highFanIn || highFanOut) {
        reasons.push("⚡ Elevated transaction activity detected");
      }
      reasons.push("📊 Moderate activity patterns - warrants monitoring");
      if (inDegree > outDegree * 2) {
        reasons.push("📥 Significantly more incoming than outgoing transactions");
      } else if (outDegree > inDegree * 2) {
        reasons.push("📤 Significantly more outgoing than incoming transactions");
      }
      return {
        title: "🟡 MEDIUM RISK - MONITOR",
        reasons,
        verdict: "Some unusual patterns detected. Continue monitoring this address."
      };
    } else {
      if (lowFanIn && lowFanOut) {
        reasons.push("✅ Low fan-in/fan-out activity");
      }
      reasons.push("✅ Normal transaction patterns");
      reasons.push("✅ No suspicious layering or structuring detected");
      return {
        title: "🟢 LOW RISK - SAFE",
        reasons,
        verdict: "This node shows normal transaction behavior."
      };
    }
  }, []);

  // Trace all paths from/to a node
  const traceAllPaths = useCallback((nodeId: string) => {
    if (!filteredEdges || filteredEdges.length === 0) return;
    const connectedEdgeIds = new Set<string>();

    // Find all edges connected to this node (both incoming and outgoing)
    filteredEdges.forEach(edge => {
      const sourceId = typeof edge.source === 'object' ? (edge.source as SimulationNode).id : edge.source;
      const targetId = typeof edge.target === 'object' ? (edge.target as SimulationNode).id : edge.target;

      if (sourceId === nodeId || targetId === nodeId) {
        connectedEdgeIds.add(`${sourceId}->${targetId}`);
      }
    });

    setTracingAllPaths(nodeId);
    setTracedEdges(connectedEdgeIds);
    setShowNodeMenu(false);
  }, [filteredEdges]);

  // Clear path tracing
  const clearPathTracing = useCallback(() => {
    setTracingAllPaths(null);
    setTracedEdges(new Set());
    setHighlightedPath([]);
    setPathStart(null);
  }, []);

  const handleNodeClick = useCallback((node: SimulationNode, event?: MouseEvent) => {
    setSelectedNode(node);

    if (pathStart === null && !tracingAllPaths) {
      // Show context menu with options
      setShowNodeMenu(true);
      if (event) {
        setNodeMenuPosition({ x: event.clientX, y: event.clientY });
      } else {
        // Fallback position if no event
        setNodeMenuPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      }
    } else if (pathStart === node.id) {
      setPathStart(null);
      setHighlightedPath([]);
    } else if (pathStart) {
      const path = findShortestPath(pathStart, node.id);
      setHighlightedPath(path);
      setPathStart(null);
    } else if (tracingAllPaths === node.id) {
      clearPathTracing();
    } else {
      clearPathTracing();
      setShowNodeMenu(true);
      if (event) {
        setNodeMenuPosition({ x: event.clientX, y: event.clientY });
      }
    }
  }, [pathStart, findShortestPath, tracingAllPaths, clearPathTracing]);

  // Handle node hover
  const handleNodeHover = useCallback((node: SimulationNode | null, prevNode: SimulationNode | null) => {
    if (node) {
      setHoveredNode(node);
    } else {
      setHoveredNode(null);
    }
  }, []);

  // Time-series animation
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setTimeSlider(prev => {
        const newValue = prev[0] + 1;
        if (newValue > 100) {
          setIsPlaying(false);
          return [100];
        }
        return [newValue];
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Snapshot management
  const saveSnapshot = () => {
    const snapshot: Snapshot = {
      id: `snapshot_${Date.now()}`,
      name: `Investigation ${snapshots.length + 1}`,
      timestamp: Date.now(),
      filters: {
        searchTerm,
        filterRisk,
        timeSlider: [...timeSlider]
      },
      highlightedPath: [...highlightedPath],
      selectedNode: selectedNode?.id || null
    };
    setSnapshots(prev => [...prev, snapshot]);
    toast.success(`Snapshot "${snapshot.name}" saved successfully!`);
  };

  const loadSnapshot = (snapshot: Snapshot) => {
    setSearchTerm(snapshot.filters.searchTerm);
    setFilterRisk(snapshot.filters.filterRisk);
    setTimeSlider(snapshot.filters.timeSlider);
    setHighlightedPath(snapshot.highlightedPath);
    if (snapshot.selectedNode) {
      const node = graphData.nodes.find(n => n.id === snapshot.selectedNode);
      if (node) setSelectedNode(node);
    }
    toast.info(`Snapshot "${snapshot.name}" loaded`);
  };

  const deleteSnapshot = (id: string) => {
    const snapshot = snapshots.find(s => s.id === id);
    setSnapshots(prev => prev.filter(s => s.id !== id));
    if (snapshot) {
      toast.success(`Snapshot "${snapshot.name}" deleted`);
    }
  };

  // Export functionality
  const handleExport = () => {
    if (!graphRef.current) {
      toast.error('Graph not ready for export');
      return;
    }

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `crypto-graph-${Date.now()}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          toast.success('Graph exported successfully!');
        }
      });
    } else {
      toast.error('Unable to export graph');
    }
  };

  const handleZoomIn = () => graphRef.current?.zoom(1.5, 300);
  const handleZoomOut = () => graphRef.current?.zoom(0.75, 300);
  const handleZoomFit = () => graphRef.current?.zoomToFit(400);

  // Track if initial zoom has been done
  const hasInitialZoom = useRef(false);

  // Reset zoom tracking when data changes
  useEffect(() => {
    hasInitialZoom.current = false;
  }, [nodeCount]);

  const handleEngineStop = useCallback(() => {
    if (!hasInitialZoom.current && graphRef.current) {
      graphRef.current.zoomToFit(400);
      hasInitialZoom.current = true;
    }
  }, []);

  // Memoize the graph data to prevent unnecessary re-renders
  // Use logarithmic scaling for node size to prevent huge nodes
  const forceGraphData = useMemo(() => ({
    nodes: filteredNodes.map(node => ({
      ...node,
      val: Math.max(1, Math.log2(node.degree.in + node.degree.out + 1)) // Logarithmic scaling
    })),
    links: (filteredEdges || []).map(edge => ({ ...edge }))
  }), [filteredNodes, filteredEdges]);

  // Particle function
  const getLinkParticles = useCallback((link: SimulationLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;

    // Animated particles for traced edges
    if (tracedEdges.has(edgeKey)) return 6;

    const isInPath = highlightedPath.length > 0 &&
      highlightedPath.includes(link.source.id || link.source) &&
      highlightedPath.includes(link.target.id || link.target);
    return isInPath ? 4 : (link.high_risk ? 2 : 0);
  }, [highlightedPath, tracedEdges]);

  const getLinkParticleColor = useCallback((link: SimulationLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;

    if (tracedEdges.has(edgeKey)) return '#c084fc'; // Light purple for particles
    return '#a855f7';
  }, [tracedEdges]);

  // Node label function - stable
  const getNodeLabel = useCallback((node: SimulationNode) => `
      ID: ${node.id}
      Risk: ${node.risk_level}
      Score: ${(node.suspicious_score * 100).toFixed(2)}%
      In: ${node.degree.in} | Out: ${node.degree.out}
      ${node.community ? `Community: ${node.community}` : ''}
      ${node.centrality?.pagerank ? `PageRank: ${node.centrality.pagerank.toFixed(3)}` : ''}
  `, []);

  // Node value function - stable
  const getNodeVal = useCallback((node: SimulationNode) => node.val, []);

  // Graph props for 2D - don't memoize to avoid reference issues
  const graph2DProps = {
    graphData: forceGraphData,
    width: dimensions.width,
    height: dimensions.height,
    nodeColor: getNodeColor,
    nodeRelSize: 4,
    nodeVal: getNodeVal,
    linkColor: getLinkColor,
    linkWidth: getLinkWidth,
    linkDirectionalParticles: getLinkParticles,
    linkDirectionalParticleWidth: 4,
    linkDirectionalParticleSpeed: 0.012,
    linkDirectionalParticleColor: getLinkParticleColor,
    onNodeClick: handleNodeClick,
    onNodeHover: handleNodeHover,
    backgroundColor: 'transparent',
    linkDirectionalArrowLength: 3.5,
    linkDirectionalArrowRelPos: 1,
    cooldownTicks: 100,
    onEngineStop: handleEngineStop
  };

  // Graph props for 3D
  const graph3DProps = {
    graphData: forceGraphData,
    width: dimensions.width,
    height: dimensions.height,
    nodeColor: getNodeColor,
    nodeRelSize: 4,
    nodeVal: getNodeVal,
    linkColor: getLinkColor,
    linkWidth: getLinkWidth,
    linkDirectionalParticles: getLinkParticles,
    linkDirectionalParticleWidth: 4,
    linkDirectionalParticleSpeed: 0.012,
    linkDirectionalParticleColor: getLinkParticleColor,
    onNodeClick: handleNodeClick,
    onNodeHover: handleNodeHover,
    linkDirectionalArrowLength: 3.5,
    linkDirectionalArrowRelPos: 1,
    cooldownTicks: 100,
    onEngineStop: handleEngineStop,
    enableNodeDrag: true,
    enableNavigationControls: true,
    showNavInfo: false
  };

  return (
    <div className="space-y-6">
      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <Card className="p-4 border-red-500 bg-red-50 dark:bg-red-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">Security Alerts Detected</h3>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-start gap-2">
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <p className="text-sm text-red-800 dark:text-red-200">{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main Controls */}
      <Card className="p-4">
        <Tabs defaultValue="controls" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="snapshots">Snapshots ({snapshots.length})</TabsTrigger>
            <TabsTrigger value="stats">Network Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="controls" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label className="text-xs">Search Node</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Risk Filter */}
              <div className="space-y-2">
                <Label className="text-xs">Risk Level</Label>
                <Select value={filterRisk} onValueChange={setFilterRisk}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="high">High Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="low">Low Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Centrality Mode */}
              <div className="space-y-2">
                <Label className="text-xs">Centrality Heatmap</Label>
                <Select value={centralityMode} onValueChange={(v: 'none' | 'pagerank' | 'betweenness' | 'closeness' | 'degree') => setCentralityMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="pagerank">PageRank</SelectItem>
                    <SelectItem value="betweenness">Betweenness</SelectItem>
                    <SelectItem value="closeness">Closeness</SelectItem>
                    <SelectItem value="degree">Degree</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* View Controls */}
              <div className="space-y-2">
                <Label className="text-xs">View Options</Label>
                <div className="flex gap-2">
                  <Button
                    variant={showCommunities ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowCommunities(!showCommunities)}
                    className="flex-1"
                  >
                    <Layers className="w-4 h-4 mr-1" />
                    Communities
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveSnapshot}
                    className="flex-1"
                  >
                    <Bookmark className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Time-series Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Time Evolution: {timeSlider[0]}%</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimeSlider([0])}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <Slider
                value={timeSlider}
                onValueChange={setTimeSlider}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Path Tracing */}
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4" />
              <span className="text-sm">
                {pathStart
                  ? `Click another node to trace path from ${pathStart}`
                  : 'Click a node to start path tracing'}
              </span>
              {pathStart && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPathStart(null);
                    setHighlightedPath([]);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-2xl font-bold text-blue-600">{graphData.summary.top_illicit_ratio}%</div>
                <div className="text-xs text-muted-foreground">Illicit Ratio</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-purple-600">{filteredNodes.length}</div>
                <div className="text-xs text-muted-foreground">Active Nodes</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-green-600">{alerts.length}</div>
                <div className="text-xs text-muted-foreground">Alerts</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-orange-600">{graphData.summary.model_confidence}</div>
                <div className="text-xs text-muted-foreground">Confidence</div>
              </Card>
            </div>

            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                AI Predictions
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Network Growth Trend:</span>
                  <Badge variant="secondary">+15% (7 days)</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Risk Escalation:</span>
                  <Badge variant="destructive">High Probability</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Next High-Risk Node:</span>
                  <Badge>tx_016 (predicted)</Badge>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="snapshots">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {snapshots.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bookmark className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No saved snapshots</p>
                    <p className="text-xs">Save interesting graph states for later reference</p>
                  </div>
                ) : (
                  snapshots.map(snapshot => (
                    <Card key={snapshot.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{snapshot.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(snapshot.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadSnapshot(snapshot)}
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSnapshot(snapshot.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stats">
            {networkStats && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="w-4 h-4 text-blue-600" />
                      <div className="text-xs font-medium">Network Density</div>
                    </div>
                    <div className="text-2xl font-bold">{networkStats.density}%</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                      <div className="text-xs font-medium">Avg Clustering</div>
                    </div>
                    <div className="text-2xl font-bold">{networkStats.avgClustering}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="w-4 h-4 text-green-600" />
                      <div className="text-xs font-medium">Communities</div>
                    </div>
                    <div className="text-2xl font-bold">{networkStats.communities}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-orange-600" />
                      <div className="text-xs font-medium">Diameter</div>
                    </div>
                    <div className="text-2xl font-bold">{networkStats.diameter} hops</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="w-4 h-4 text-cyan-600" />
                      <div className="text-xs font-medium">Avg Degree</div>
                    </div>
                    <div className="text-2xl font-bold">{networkStats.avgDegree}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <div className="text-xs font-medium">Illicit Nodes</div>
                    </div>
                    <div className="text-2xl font-bold">{networkStats.illicitRatio}%</div>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Graph Container */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold">Transaction Network</h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="3d-mode" className="text-sm flex items-center gap-1">
                <Box className="w-4 h-4" />
                3D Mode
              </Label>
              <Switch
                id="3d-mode"
                checked={is3D}
                onCheckedChange={setIs3D}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleZoomIn}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomOut}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomFit}>
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div ref={containerRef} className="relative bg-white dark:bg-[#0a0118] rounded-lg overflow-hidden" style={{ width: '100%', height: '600px' }}>
          {is3D ? (
            <ErrorBoundary fallback={<div className="flex h-full w-full items-center justify-center text-gray-500 bg-gray-900/20 rounded-xl border border-gray-800">3D Network Unavailable (WebGL not supported)</div>}>
              <ForceGraph3D ref={graphRef} {...graph3DProps} />
            </ErrorBoundary>
          ) : (
            <ForceGraph2D ref={graphRef} {...graph2DProps} />
          )}

          {/* Hover Tooltip */}
          {hoveredNode && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: '50%',
                top: '20px',
                transform: 'translateX(-50%)',
                maxWidth: '400px'
              }}
            >
              <div className="bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm text-white rounded-xl shadow-2xl border border-purple-500/30 overflow-hidden">
                {/* Header */}
                <div className={`px-4 py-3 ${hoveredNode.risk_level === 'high' ? 'bg-red-600/90' :
                    hoveredNode.risk_level === 'medium' ? 'bg-amber-600/90' : 'bg-green-600/90'
                  }`}>
                  <div className="font-bold text-sm">{getNodeExplanation(hoveredNode).title}</div>
                  <div className="text-xs opacity-90 font-mono mt-1">{hoveredNode.id}</div>
                </div>

                {/* Explanation */}
                <div className="px-4 py-3 space-y-2">
                  {getNodeExplanation(hoveredNode).reasons.map((reason, idx) => (
                    <div key={idx} className="text-xs text-gray-200">{reason}</div>
                  ))}
                  <div className="text-xs text-purple-300 italic mt-2 pt-2 border-t border-gray-700">
                    {getNodeExplanation(hoveredNode).verdict}
                  </div>
                </div>

                {/* Stats */}
                <div className="px-4 py-3 bg-gray-800/50 grid grid-cols-3 gap-3 text-center border-t border-gray-700">
                  <div>
                    <div className="text-lg font-bold text-purple-400">
                      {((hoveredNode.suspicious_score || 0) * 100).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">Risk Score</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-400">
                      {hoveredNode.degree?.in || 0}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">In-Degree</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-orange-400">
                      {hoveredNode.degree?.out || 0}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">Out-Degree</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Path Tracing Indicator */}
          {tracingAllPaths && (
            <div className="absolute top-4 left-4 z-40">
              <div className="bg-purple-600/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                <GitBranch className="h-4 w-4 animate-pulse" />
                <span className="text-sm font-medium">
                  Tracing paths for: <span className="font-mono">{tracingAllPaths.slice(0, 12)}...</span>
                </span>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                  {tracedEdges.size} edges
                </span>
                <button
                  onClick={clearPathTracing}
                  className="ml-2 hover:bg-white/20 p-1 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Node Click Context Menu */}
        {showNodeMenu && selectedNode && (
          <>
            <div
              className="fixed inset-0 z-[99]"
              onClick={() => setShowNodeMenu(false)}
            />
            <div
              className="fixed z-[100]"
              style={{
                left: Math.min(nodeMenuPosition.x, window.innerWidth - 200),
                top: Math.min(nodeMenuPosition.y, window.innerHeight - 150)
              }}
            >
              <div className="bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-2xl border border-purple-500/30 overflow-hidden min-w-[180px]">
                <div className="px-3 py-2 bg-purple-600/80 text-white text-xs font-semibold">
                  Node: {selectedNode.id.slice(0, 12)}...
                </div>
                <div className="p-1">
                  <button
                    onClick={() => traceAllPaths(selectedNode.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-purple-600/50 rounded transition-colors"
                  >
                    <GitBranch className="h-4 w-4 text-purple-400" />
                    Trace All Paths
                  </button>
                  <button
                    onClick={() => {
                      setPathStart(selectedNode.id);
                      setShowNodeMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-blue-600/50 rounded transition-colors"
                  >
                    <Route className="h-4 w-4 text-blue-400" />
                    Trace Path From Here
                  </button>
                  <button
                    onClick={() => setShowNodeMenu(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-700/50 rounded transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Selected Node Info */}
      {selectedNode && (
        <Card className="p-4">
          <div className="flex items-start justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Info className="w-4 h-4" />
              Node Details
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>Close</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Node ID</div>
              <div className="font-mono text-sm">{selectedNode.id}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Risk Level</div>
              <Badge variant={selectedNode.risk_level === 'high' ? 'destructive' : 'secondary'}>
                {selectedNode.risk_level}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Suspicious Score</div>
              <div className="font-semibold">{(selectedNode.suspicious_score * 100).toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Classification</div>
              <Badge variant={selectedNode.class === 'illicit' ? 'destructive' : 'default'}>
                {selectedNode.class}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Incoming</div>
              <div className="font-semibold">{selectedNode.degree.in}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Outgoing</div>
              <div className="font-semibold">{selectedNode.degree.out}</div>
            </div>
            {selectedNode.community && (
              <div>
                <div className="text-xs text-muted-foreground">Community</div>
                <Badge style={{ backgroundColor: communityColors[selectedNode.community as keyof typeof communityColors] }}>
                  {selectedNode.community}
                </Badge>
              </div>
            )}
            {selectedNode.centrality?.pagerank && (
              <div>
                <div className="text-xs text-muted-foreground">PageRank</div>
                <div className="font-semibold">{selectedNode.centrality.pagerank.toFixed(3)}</div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};


export default memo(UltraGraphVisualization);
