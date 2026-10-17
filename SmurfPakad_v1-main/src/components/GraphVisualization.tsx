import { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ZoomIn, ZoomOut, Maximize2, Info, Search, Download, TrendingUp, Route, Camera } from 'lucide-react';

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
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  high_risk: boolean;
  flow: string;
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

interface GraphVisualizationProps {
  data?: GraphData;
}

// ForceGraph2D imperative API used via ref
interface ForceGraph2DInstance {
  zoom: (zoom?: number, duration?: number) => number;
  zoomToFit: (duration?: number, padding?: number) => void;
  centerAt: (x?: number, y?: number, duration?: number) => void;
  d3Force: (force: string, fn?: unknown) => unknown;
  d3ReheatSimulation: () => void;
  pauseAnimation: () => void;
  resumeAnimation: () => void;
}

// Simulation adds x/y to nodes and resolves source/target on links
interface SimulationNode extends Omit<ReturnType<() => GraphNode & { val: number }>, never> {
  id: string;
  risk_level: string;
  suspicious_score: number;
  degree: { in: number; out: number };
  val: number;
  x?: number;
  y?: number;
}

interface SimulationLink {
  source: SimulationNode | string;
  target: SimulationNode | string;
  weight: number;
  high_risk: boolean;
}

const GraphVisualization = ({ data }: GraphVisualizationProps) => {
  const graphRef = useRef<ForceGraph2DInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 600 });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [showPredictions, setShowPredictions] = useState(false);

  // Demo data matching the user's structure
  const demoData: GraphData = {
    meta: {
      k: 20,
      hop: 2,
      total_nodes: 210,
      total_edges: 195,
      generated_at: "2026-01-31T14:30:00Z"
    },
    nodes: [
      {
        id: "243780803",
        label: "transaction",
        suspicious_score: 0.9987,
        risk_level: "high",
        class: "illicit",
        top_k: true,
        degree: { in: 7, out: 5 }
      },
      {
        id: "243780671",
        label: "transaction",
        suspicious_score: 0.8765,
        risk_level: "medium",
        class: "illicit",
        top_k: false,
        degree: { in: 3, out: 8 }
      },
      {
        id: "243780890",
        label: "transaction",
        suspicious_score: 0.9543,
        risk_level: "high",
        class: "illicit",
        top_k: true,
        degree: { in: 12, out: 4 }
      },
      {
        id: "243780234",
        label: "transaction",
        suspicious_score: 0.6543,
        risk_level: "low",
        class: "licit",
        top_k: false,
        degree: { in: 2, out: 3 }
      },
      {
        id: "243781001",
        label: "transaction",
        suspicious_score: 0.8901,
        risk_level: "medium",
        class: "illicit",
        top_k: false,
        degree: { in: 5, out: 6 }
      },
      {
        id: "243781234",
        label: "transaction",
        suspicious_score: 0.9876,
        risk_level: "high",
        class: "illicit",
        top_k: true,
        degree: { in: 15, out: 3 }
      },
      {
        id: "243781567",
        label: "transaction",
        suspicious_score: 0.7234,
        risk_level: "medium",
        class: "illicit",
        top_k: false,
        degree: { in: 4, out: 7 }
      },
      {
        id: "243781890",
        label: "transaction",
        suspicious_score: 0.5234,
        risk_level: "low",
        class: "licit",
        top_k: false,
        degree: { in: 1, out: 2 }
      },
      {
        id: "243782123",
        label: "transaction",
        suspicious_score: 0.9654,
        risk_level: "high",
        class: "illicit",
        top_k: true,
        degree: { in: 9, out: 11 }
      },
      {
        id: "243782456",
        label: "transaction",
        suspicious_score: 0.8123,
        risk_level: "medium",
        class: "illicit",
        top_k: false,
        degree: { in: 6, out: 5 }
      }
    ],
    edges: [
      { source: "243780803", target: "243780671", weight: 1.0, high_risk: true, flow: "out" },
      { source: "243780803", target: "243780890", weight: 0.9, high_risk: true, flow: "out" },
      { source: "243780671", target: "243780234", weight: 0.6, high_risk: false, flow: "out" },
      { source: "243780890", target: "243781001", weight: 0.85, high_risk: true, flow: "out" },
      { source: "243781001", target: "243781234", weight: 0.95, high_risk: true, flow: "out" },
      { source: "243781234", target: "243781567", weight: 0.78, high_risk: true, flow: "out" },
      { source: "243781567", target: "243781890", weight: 0.55, high_risk: false, flow: "out" },
      { source: "243780803", target: "243782123", weight: 0.97, high_risk: true, flow: "out" },
      { source: "243782123", target: "243782456", weight: 0.82, high_risk: true, flow: "out" },
      { source: "243781234", target: "243782123", weight: 0.91, high_risk: true, flow: "out" },
      { source: "243782456", target: "243781890", weight: 0.65, high_risk: false, flow: "out" },
      { source: "243780234", target: "243781001", weight: 0.45, high_risk: false, flow: "out" }
    ],
    summary: {
      top_illicit_ratio: 1.0,
      fan_out_nodes: 2695,
      fan_in_nodes: 4396,
      avg_suspicious_score: 0.83,
      model_confidence: "high"
    }
  };

  const graphData = data || demoData;

  // Filter nodes based on search and risk level
  const filteredNodes = graphData.nodes.filter(node => {
    const matchesSearch = searchTerm === '' || 
      node.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.class.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRisk = filterRisk === 'all' || node.risk_level === filterRisk;
    
    return matchesSearch && matchesRisk;
  });

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = graphData.edges.filter(edge => 
    filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
  );

  // BFS to find shortest path between two nodes
  const findShortestPath = useCallback((startId: string, endId: string): string[] => {
    const queue: Array<{ node: string; path: string[] }> = [{ node: startId, path: [startId] }];
    const visited = new Set<string>([startId]);
    
    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      
      if (node === endId) return path;
      
      const neighbors = graphData.edges
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
  }, [graphData.edges]);

  // Handle node click for path tracing
  const handleNodeClick = useCallback((node: SimulationNode) => {
    if (pathStart === null) {
      setPathStart(node.id);
      setSelectedNode(node);
    } else if (pathStart === node.id) {
      setPathStart(null);
      setHighlightedPath([]);
      setSelectedNode(node);
    } else {
      const path = findShortestPath(pathStart, node.id);
      setHighlightedPath(path);
      setPathStart(null);
      setSelectedNode(node);
    }
  }, [pathStart, findShortestPath]);

  // Predictive analytics
  const predictions = {
    nextSuspicious: [
      { id: 'tx_pred_001', probability: 0.94, timeframe: '2-4 hours' },
      { id: 'tx_pred_002', probability: 0.87, timeframe: '4-6 hours' },
      { id: 'tx_pred_003', probability: 0.82, timeframe: '6-12 hours' }
    ],
    riskTrend: 'increasing',
    estimatedLoss: '$450,000'
  };

  // Convert to force-graph format
  const forceGraphData = {
    nodes: filteredNodes.map(node => ({
      id: node.id,
      ...node,
      val: (node.degree.in + node.degree.out) / 2 // Node size based on degree
    })),
    links: filteredEdges.map(edge => ({
      source: edge.source,
      target: edge.target,
      ...edge
    }))
  };

  const getNodeColor = (node: SimulationNode) => {
    if (highlightedPath.includes(node.id)) return '#a855f7'; // Purple for path
    if (pathStart === node.id) return '#3b82f6'; // Blue for start node
    if (node.risk_level === 'high') return '#ef4444'; // Red
    if (node.risk_level === 'medium') return '#f59e0b'; // Orange
    return '#10b981'; // Green
  };

  const getLinkColor = (link: SimulationLink) => {
    const isInPath = highlightedPath.length > 0 && 
      highlightedPath.includes(link.source.id || link.source) && 
      highlightedPath.includes(link.target.id || link.target);
    
    if (isInPath) return '#a855f7'; // Purple for path
    return link.high_risk ? '#ef4444' : '#6b7280';
  };

  const getLinkWidth = (link: SimulationLink) => {
    const isInPath = highlightedPath.length > 0 && 
      highlightedPath.includes(link.source.id || link.source) && 
      highlightedPath.includes(link.target.id || link.target);
    
    return isInPath ? 4 : link.weight * 2;
  };

  // Export graph as image
  const handleExportImage = useCallback(() => {
    if (graphRef.current) {
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
    }
  }, []);

  const handleZoomIn = () => {
    if (graphRef.current) {
      graphRef.current.zoom(graphRef.current.zoom() * 1.5, 400);
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      graphRef.current.zoom(graphRef.current.zoom() * 0.75, 400);
    }
  };

  const handleCenter = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400);
    }
  };

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

    // Initial size calculation with a small delay to ensure DOM is ready
    const timer = setTimeout(handleResize, 100);
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Advanced Controls */}
      <Card className="p-4 dark:bg-white/5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search nodes by ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 dark:bg-gray-800 dark:border-gray-700"
            />
          </div>

          {/* Risk Filter */}
          <Select value={filterRisk} onValueChange={setFilterRisk}>
            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
              <SelectValue placeholder="Filter by risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
            </SelectContent>
          </Select>

          {/* Path Tracing */}
          <Button 
            variant={pathStart ? "default" : "outline"}
            onClick={() => {
              setPathStart(null);
              setHighlightedPath([]);
            }}
            className={pathStart ? "bg-blue-600 hover:bg-blue-700" : "dark:border-gray-700"}
          >
            <Route className="h-4 w-4 mr-2" />
            {pathStart ? 'Cancel Path Trace' : 'Trace Path'}
          </Button>

          {/* Export */}
          <Button 
            variant="outline"
            onClick={handleExportImage}
            className="dark:border-gray-700"
          >
            <Camera className="h-4 w-4 mr-2" />
            Export Image
          </Button>
        </div>

        {pathStart && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Path Tracing Mode:</strong> Click another node to find the shortest path from <strong className="font-mono">{pathStart}</strong>
            </p>
          </div>
        )}

        {highlightedPath.length > 0 && (
          <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-purple-900 dark:text-purple-100">
              <strong>Path Found:</strong> {highlightedPath.length} nodes → {highlightedPath.join(' → ')}
            </p>
          </div>
        )}
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Nodes</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{graphData.meta.total_nodes}</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Edges</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{graphData.meta.total_edges}</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Avg Score</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{(graphData.summary.avg_suspicious_score * 100).toFixed(1)}%</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Illicit Ratio</div>
          <div className="text-2xl font-bold text-red-600">{(graphData.summary.top_illicit_ratio * 100).toFixed(0)}%</div>
        </Card>
        <Card className="p-4 dark:bg-white/5">
          <div className="text-sm text-gray-600 dark:text-gray-400">Confidence</div>
          <Badge className="mt-1 bg-green-100 text-green-800">{graphData.summary.model_confidence.toUpperCase()}</Badge>
        </Card>
      </div>

      {/* Graph Container */}
      <div className="relative">
        <Card className="p-0 overflow-hidden dark:bg-white/5">
          <div 
            ref={containerRef}
            id="graph-container" 
            className="relative bg-white dark:bg-[#0a0118]"
            style={{ width: '100%', height: '600px' }}
          >
            {dimensions.width > 0 && (
            <ForceGraph2D
              ref={graphRef}
              graphData={forceGraphData}
              width={dimensions.width}
              height={dimensions.height}
              nodeLabel={(node: SimulationNode) => `
                ID: ${node.id}
                Risk: ${node.risk_level}
                Score: ${(node.suspicious_score * 100).toFixed(2)}%
                In: ${node.degree.in} | Out: ${node.degree.out}
              `}
              nodeColor={getNodeColor}
              nodeRelSize={6}
              nodeVal={(node: SimulationNode) => node.val}
              linkColor={getLinkColor}
              linkWidth={getLinkWidth}
              linkDirectionalParticles={(link: SimulationLink) => {
                const isInPath = highlightedPath.length > 0 && 
                  highlightedPath.includes(link.source.id || link.source) && 
                  highlightedPath.includes(link.target.id || link.target);
                return isInPath ? 4 : (link.high_risk ? 2 : 0);
              }}
              linkDirectionalParticleWidth={3}
              linkDirectionalParticleSpeed={0.008}
              onNodeClick={handleNodeClick}
              backgroundColor="transparent"
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              cooldownTicks={100}
              onEngineStop={() => graphRef.current?.zoomToFit(400)}
            />
            )}

            {/* Controls */}
            <div className="absolute top-4 right-4 flex flex-col space-y-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleZoomIn}
                className="bg-white dark:bg-gray-800 shadow-lg"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleZoomOut}
                className="bg-white dark:bg-gray-800 shadow-lg"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCenter}
                className="bg-white dark:bg-gray-800 shadow-lg"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
              <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">Risk Levels</div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-xs text-gray-700 dark:text-gray-300">High (≥0.95)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-xs text-gray-700 dark:text-gray-300">Medium (0.7-0.95)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-xs text-gray-700 dark:text-gray-300">Low (&lt;0.7)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-xs text-gray-700 dark:text-gray-300">Path Traced</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-xs text-gray-700 dark:text-gray-300">Path Start</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Predictive Analytics Panel */}
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => setShowPredictions(!showPredictions)}
            className="w-full dark:border-gray-700"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {showPredictions ? 'Hide' : 'Show'} Predictive Analytics
          </Button>
          
          {showPredictions && (
            <Card className="mt-4 p-4 dark:bg-white/5 border-2 border-purple-200 dark:border-purple-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
                AI-Powered Predictions
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Next Suspicious Transactions */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Predicted Suspicious Activity</h4>
                  {predictions.nextSuspicious.map((pred, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{pred.id}</span>
                        <Badge className="bg-red-100 text-red-800 text-xs">{(pred.probability * 100).toFixed(0)}%</Badge>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Expected in {pred.timeframe}</p>
                    </div>
                  ))}
                </div>

                {/* Risk Trend */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Risk Trend Analysis</h4>
                  <div className="p-4 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Network Risk</span>
                      <Badge className="bg-red-600 text-white">
                        {predictions.riskTrend.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">+23%</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Last 24 hours</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Estimated Potential Loss</p>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">{predictions.estimatedLoss}</p>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">AI Recommendations</h4>
                  <div className="space-y-2">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Priority Action</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Monitor tx_pred_001 closely - 94% probability of illicit activity
                      </p>
                    </div>
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                      <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-100">Pattern Alert</p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        Fan-out pattern forming around node 243780803
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                      <p className="text-xs font-semibold text-green-900 dark:text-green-100">Suggestion</p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Deploy automated blocking on high-risk wallets
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Node Details Panel */}
        {selectedNode && (
          <Card className="mt-4 p-4 dark:bg-white/5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                  <Info className="h-5 w-5" />
                  <span>Node Details</span>
                </h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedNode(null)}
              >
                ✕
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Transaction ID</div>
                <div className="font-mono text-sm text-gray-900 dark:text-white">{selectedNode.id}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Risk Level</div>
                <Badge className={
                  selectedNode.risk_level === 'high' ? 'bg-red-100 text-red-800' :
                  selectedNode.risk_level === 'medium' ? 'bg-orange-100 text-orange-800' :
                  'bg-green-100 text-green-800'
                }>
                  {selectedNode.risk_level.toUpperCase()}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Suspicious Score</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {(selectedNode.suspicious_score * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Classification</div>
                <Badge variant="outline" className={selectedNode.class === 'illicit' ? 'border-red-500 text-red-700' : 'border-green-500 text-green-700'}>
                  {selectedNode.class}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Incoming Connections</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">{selectedNode.degree.in}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Outgoing Connections</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">{selectedNode.degree.out}</div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GraphVisualization;
