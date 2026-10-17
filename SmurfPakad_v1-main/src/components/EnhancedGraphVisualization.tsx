import { useState, useEffect, useRef, useCallback } from 'react';
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
import { ZoomIn, ZoomOut, Maximize2, Info, Search, Download, TrendingUp, Route, Camera, Play, Pause, Box, GitBranch, X } from 'lucide-react';

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

interface EnhancedGraphProps {
  data?: GraphData;
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

const EnhancedGraphVisualization = ({ data }: EnhancedGraphProps) => {
  const graphRef = useRef<ForceGraph2DInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 600 });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [showPredictions, setShowPredictions] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [timeSlider, setTimeSlider] = useState([100]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [tracingAllPaths, setTracingAllPaths] = useState<string | null>(null);
  const [tracedEdges, setTracedEdges] = useState<Set<string>>(new Set());
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [nodeMenuPosition, setNodeMenuPosition] = useState({ x: 0, y: 0 });

  // Generate timestamps for demo data
  const demoData: GraphData = {
    meta: {
      k: 20,
      hop: 2,
      total_nodes: 15,
      total_edges: 18,
      generated_at: "2026-01-31T14:30:00Z"
    },
    nodes: [
      { id: "tx_001", label: "transaction", suspicious_score: 0.9987, risk_level: "high", class: "illicit", top_k: true, degree: { in: 7, out: 5 }, timestamp: 10 },
      { id: "tx_002", label: "transaction", suspicious_score: 0.8765, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 3, out: 8 }, timestamp: 25 },
      { id: "tx_003", label: "transaction", suspicious_score: 0.9543, risk_level: "high", class: "illicit", top_k: true, degree: { in: 12, out: 4 }, timestamp: 35 },
      { id: "tx_004", label: "transaction", suspicious_score: 0.6543, risk_level: "low", class: "licit", top_k: false, degree: { in: 2, out: 3 }, timestamp: 45 },
      { id: "tx_005", label: "transaction", suspicious_score: 0.8901, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 5, out: 6 }, timestamp: 55 },
      { id: "tx_006", label: "transaction", suspicious_score: 0.9876, risk_level: "high", class: "illicit", top_k: true, degree: { in: 15, out: 3 }, timestamp: 60 },
      { id: "tx_007", label: "transaction", suspicious_score: 0.7234, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 4, out: 7 }, timestamp: 70 },
      { id: "tx_008", label: "transaction", suspicious_score: 0.5234, risk_level: "low", class: "licit", top_k: false, degree: { in: 1, out: 2 }, timestamp: 80 },
      { id: "tx_009", label: "transaction", suspicious_score: 0.9654, risk_level: "high", class: "illicit", top_k: true, degree: { in: 9, out: 11 }, timestamp: 85 },
      { id: "tx_010", label: "transaction", suspicious_score: 0.8123, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 6, out: 5 }, timestamp: 90 },
      { id: "tx_011", label: "transaction", suspicious_score: 0.9123, risk_level: "high", class: "illicit", top_k: true, degree: { in: 8, out: 7 }, timestamp: 15 },
      { id: "tx_012", label: "transaction", suspicious_score: 0.7456, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 4, out: 5 }, timestamp: 40 },
      { id: "tx_013", label: "transaction", suspicious_score: 0.6789, risk_level: "low", class: "licit", top_k: false, degree: { in: 3, out: 2 }, timestamp: 65 },
      { id: "tx_014", label: "transaction", suspicious_score: 0.9789, risk_level: "high", class: "illicit", top_k: true, degree: { in: 11, out: 9 }, timestamp: 30 },
      { id: "tx_015", label: "transaction", suspicious_score: 0.8456, risk_level: "medium", class: "illicit", top_k: false, degree: { in: 5, out: 8 }, timestamp: 95 }
    ],
    edges: [
      { source: "tx_001", target: "tx_002", weight: 1.0, high_risk: true, flow: "out", timestamp: 25 },
      { source: "tx_001", target: "tx_003", weight: 0.9, high_risk: true, flow: "out", timestamp: 35 },
      { source: "tx_002", target: "tx_004", weight: 0.6, high_risk: false, flow: "out", timestamp: 45 },
      { source: "tx_003", target: "tx_005", weight: 0.85, high_risk: true, flow: "out", timestamp: 55 },
      { source: "tx_005", target: "tx_006", weight: 0.95, high_risk: true, flow: "out", timestamp: 60 },
      { source: "tx_006", target: "tx_007", weight: 0.78, high_risk: true, flow: "out", timestamp: 70 },
      { source: "tx_007", target: "tx_008", weight: 0.55, high_risk: false, flow: "out", timestamp: 80 },
      { source: "tx_001", target: "tx_009", weight: 0.97, high_risk: true, flow: "out", timestamp: 85 },
      { source: "tx_009", target: "tx_010", weight: 0.82, high_risk: true, flow: "out", timestamp: 90 },
      { source: "tx_006", target: "tx_009", weight: 0.91, high_risk: true, flow: "out", timestamp: 85 },
      { source: "tx_010", target: "tx_008", weight: 0.65, high_risk: false, flow: "out", timestamp: 90 },
      { source: "tx_004", target: "tx_005", weight: 0.45, high_risk: false, flow: "out", timestamp: 55 },
      { source: "tx_011", target: "tx_001", weight: 0.92, high_risk: true, flow: "out", timestamp: 15 },
      { source: "tx_011", target: "tx_012", weight: 0.75, high_risk: true, flow: "out", timestamp: 40 },
      { source: "tx_012", target: "tx_013", weight: 0.68, high_risk: false, flow: "out", timestamp: 65 },
      { source: "tx_014", target: "tx_011", weight: 0.98, high_risk: true, flow: "out", timestamp: 30 },
      { source: "tx_014", target: "tx_015", weight: 0.86, high_risk: true, flow: "out", timestamp: 95 },
      { source: "tx_015", target: "tx_010", weight: 0.79, high_risk: true, flow: "out", timestamp: 95 }
    ],
    summary: {
      top_illicit_ratio: 1.0,
      fan_out_nodes: 8,
      fan_in_nodes: 10,
      avg_suspicious_score: 0.83,
      model_confidence: "high"
    }
  };

  const graphData = data || demoData;

  // Time-series filtering
  const timeFilteredData = {
    nodes: graphData.nodes.filter(node => (node.timestamp || 0) <= timeSlider[0]),
    edges: graphData.edges.filter(edge => (edge.timestamp || 0) <= timeSlider[0])
  };

  // Apply search and risk filters
  const filteredNodes = timeFilteredData.nodes.filter(node => {
    const matchesSearch = searchTerm === '' || 
      node.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.class.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRisk = filterRisk === 'all' || node.risk_level === filterRisk;
    
    return matchesSearch && matchesRisk;
  });

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = timeFilteredData.edges.filter(edge => 
    filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
  );

  // BFS shortest path
  const findShortestPath = useCallback((startId: string, endId: string): string[] => {
    const queue: Array<{ node: string; path: string[] }> = [{ node: startId, path: [startId] }];
    const visited = new Set<string>([startId]);
    
    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (node === endId) return path;
      
      const neighbors = filteredEdges
        .filter(e => e.source === node)
        .map(e => e.target);
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
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
    
    if (node.risk_level === 'high' || riskScore >= 0.65) {
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
    } else if (node.risk_level === 'medium' || riskScore >= 0.35) {
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

  // Handle node click
  const handleNodeClick = useCallback((node: SimulationNode, event?: MouseEvent) => {
    if (pathStart === null && !tracingAllPaths) {
      // Show context menu with options
      setSelectedNode(node);
      setShowNodeMenu(true);
      if (event) {
        setNodeMenuPosition({ x: event.clientX, y: event.clientY });
      }
    } else if (pathStart === node.id) {
      setPathStart(null);
      setHighlightedPath([]);
      setSelectedNode(node);
    } else if (pathStart) {
      const path = findShortestPath(pathStart, node.id);
      setHighlightedPath(path);
      setPathStart(null);
      setSelectedNode(node);
    } else if (tracingAllPaths === node.id) {
      clearPathTracing();
      setSelectedNode(node);
    } else {
      clearPathTracing();
      setSelectedNode(node);
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

  // Convert to force-graph format
  const forceGraphData = {
    nodes: filteredNodes.map(node => ({
      id: node.id,
      ...node,
      val: (node.degree.in + node.degree.out) / 2
    })),
    links: filteredEdges.map(edge => ({
      source: edge.source,
      target: edge.target,
      ...edge
    }))
  };

  const getNodeColor = (node: SimulationNode) => {
    if (tracingAllPaths === node.id) return '#a855f7'; // Purple for traced node
    if (highlightedPath.includes(node.id)) return '#a855f7';
    if (pathStart === node.id) return '#3b82f6';
    if (node.risk_level === 'high') return '#ef4444';
    if (node.risk_level === 'medium') return '#f59e0b';
    return '#10b981';
  };

  const getLinkColor = (link: SimulationLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;
    
    // Check if this edge is being traced
    if (tracedEdges.has(edgeKey)) return '#a855f7';
    
    const isInPath = highlightedPath.length > 0 && 
      highlightedPath.includes(link.source.id || link.source) && 
      highlightedPath.includes(link.target.id || link.target);
    
    if (isInPath) return '#a855f7';
    return link.high_risk ? '#ef4444' : '#6b7280';
  };

  const getLinkWidth = (link: SimulationLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;
    
    // Wider for traced edges
    if (tracedEdges.has(edgeKey)) return 4;
    
    const isInPath = highlightedPath.length > 0 && 
      highlightedPath.includes(link.source.id || link.source) && 
      highlightedPath.includes(link.target.id || link.target);
    
    return isInPath ? 4 : link.weight * 2;
  };

  // Check if edge should have animated particles
  const getLinkParticles = (link: SimulationLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;
    
    // Animated particles for traced edges
    if (tracedEdges.has(edgeKey)) return 6;
    
    const isInPath = highlightedPath.length > 0 && 
      highlightedPath.includes(link.source.id || link.source) && 
      highlightedPath.includes(link.target.id || link.target);
    return isInPath ? 4 : (link.high_risk ? 2 : 0);
  };

  const getLinkParticleColor = (link: SimulationLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${sourceId}->${targetId}`;
    
    if (tracedEdges.has(edgeKey)) return '#c084fc'; // Light purple for particles
    return '#a855f7';
  };

  // Time-series playback
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && timeSlider[0] < 100) {
      interval = setInterval(() => {
        setTimeSlider(prev => [Math.min(prev[0] + 2, 100)]);
      }, 200);
    } else if (timeSlider[0] >= 100) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, timeSlider]);

  // Export as image
  const handleExportImage = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `transaction-graph-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  }, []);

  // Handle dimensions
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 800,
          height: 600
        });
      }
    };

    const timer = setTimeout(handleResize, 100);
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Common graph props
  const graph2DProps = {
    ref: graphRef,
    graphData: forceGraphData,
    width: dimensions.width,
    height: dimensions.height,
    nodeColor: getNodeColor,
    nodeRelSize: 6,
    nodeVal: (node: SimulationNode) => node.val,
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
    onEngineStop: () => graphRef.current?.zoomToFit(400)
  };

  const graph3DProps = {
    ref: graphRef,
    graphData: forceGraphData,
    width: dimensions.width,
    height: dimensions.height,
    nodeColor: getNodeColor,
    nodeRelSize: 6,
    nodeVal: (node: SimulationNode) => node.val,
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
    enableNodeDrag: true,
    enableNavigationControls: true,
    showNavInfo: false
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4 dark:bg-white/5">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search nodes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant={pathStart ? "default" : "outline"}
              onClick={() => {
                setPathStart(null);
                setHighlightedPath([]);
              }}
              className={pathStart ? "bg-blue-600" : ""}
            >
              <Route className="h-4 w-4 mr-2" />
              {pathStart ? 'Cancel' : 'Trace Path'}
            </Button>

            {(tracingAllPaths || highlightedPath.length > 0) && (
              <Button 
                variant="outline"
                onClick={clearPathTracing}
                className="bg-purple-600 text-white hover:bg-purple-700"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Paths
              </Button>
            )}

            <Button variant="outline" onClick={handleExportImage}>
              <Camera className="h-4 w-4 mr-2" />
              Export
            </Button>

            <div className="flex items-center space-x-2">
              <Switch
                id="3d-mode"
                checked={is3D}
                onCheckedChange={setIs3D}
              />
              <Label htmlFor="3d-mode" className="flex items-center cursor-pointer">
                <Box className="h-4 w-4 mr-1" />
                3D
              </Label>
            </div>
          </div>

          {/* Time-series slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Time Evolution</Label>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTimeSlider([0])}
                >
                  Reset
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {timeSlider[0]}% Complete
                </span>
              </div>
            </div>
            <Slider
              value={timeSlider}
              onValueChange={setTimeSlider}
              max={100}
              step={1}
              disabled={isPlaying}
            />
          </div>
        </div>
      </Card>

      {/* Graph Container */}
      <Card className="p-0 overflow-hidden dark:bg-white/5">
        <div 
          ref={containerRef}
          className="relative bg-white dark:bg-[#0a0118]"
          style={{ width: '100%', height: '600px' }}
        >
          {dimensions.width > 0 && (
            is3D ? (
              <ForceGraph3D {...graph3DProps} />
            ) : (
              <ForceGraph2D {...graph2DProps} />
            )
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
                <div className={`px-4 py-3 ${
                  hoveredNode.risk_level === 'high' ? 'bg-red-600/90' :
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
          
          {/* Node Click Context Menu */}
          {showNodeMenu && selectedNode && (
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
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Click outside to close menu */}
      {showNodeMenu && (
        <div 
          className="fixed inset-0 z-[99]" 
          onClick={() => setShowNodeMenu(false)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Active Nodes</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{filteredNodes.length}</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Active Edges</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{filteredEdges.length}</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">High Risk</div>
          <div className="text-2xl font-bold text-red-600">{filteredNodes.filter(n => n.risk_level === 'high').length}</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Detection Rate</div>
          <div className="text-2xl font-bold text-green-600">98.5%</div>
        </Card>
      </div>
    </div>
  );
};

export default EnhancedGraphVisualization;
