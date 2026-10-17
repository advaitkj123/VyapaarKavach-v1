import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ForceGraph2D from 'react-force-graph-2d';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, Zap, AlertTriangle, CheckCircle, Loader2,
  Search, Filter, Eye, Network, Activity,
  TrendingUp, Target, Layers, GitBranch,
  Shield, Sparkles, Wifi, Cpu
} from 'lucide-react';
import { useWebSocket } from '@/lib/api';
import { toast } from '@/components/ToastNotification';
import { Navigate } from 'react-router-dom';

interface GraphNode {
  id: string;
  label: string;
  suspicious_score: number;
  risk_level: string;
  class: string;
  top_k: boolean;
  degree: { in: number; out: number };
  timestamp?: number;
  community?: number;
  centrality?: { pagerank?: number; betweenness?: number; closeness?: number; degree?: number };
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
  meta: { k: number; hop: number; total_nodes: number; total_edges: number; generated_at: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: { top_illicit_ratio: number; fan_out_nodes: number; fan_in_nodes: number; avg_suspicious_score: number; model_confidence: string };
}

interface AnalysisStage {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const STAGES: AnalysisStage[] = [
  { id: 'parsing', label: 'Parsing CSV', icon: <Search className="w-5 h-5" />, color: 'text-blue-400', description: 'Reading transaction data...' },
  { id: 'graph_building', label: 'Building Graph', icon: <GitBranch className="w-5 h-5" />, color: 'text-purple-400', description: 'Constructing wallet network...' },
  { id: 'scoring', label: 'GNN Scoring', icon: <Brain className="w-5 h-5" />, color: 'text-cyan-400', description: 'Running TG-GATv2 inference...' },
  { id: 'pattern_detection', label: 'Pattern Detection', icon: <Target className="w-5 h-5" />, color: 'text-orange-400', description: 'Finding smurfing signatures...' },
  { id: 'subgraph_extraction', label: 'Subgraph Extraction', icon: <Layers className="w-5 h-5" />, color: 'text-pink-400', description: 'Preparing visualization...' },
  { id: 'complete', label: 'Complete', icon: <CheckCircle className="w-5 h-5" />, color: 'text-green-400', description: 'Analysis ready!' },
];

interface PatternCard {
  id: string;
  type: string;
  severity: string;
  confidence: number;
  description: string;
  addresses: string[];
  avgDegree?: number;
  timestamp: number;
}

interface LiveAnalysisProps {
  uploadId: string;
  onComplete?: (results: Record<string, unknown>) => void;
}

const particleColors = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

const riskColors = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse',
};

export default function LiveAnalysisPanel({ uploadId, onComplete }: LiveAnalysisProps) {
  const [currentStage, setCurrentStage] = useState<string>('parsing');
  const [progress, setProgress] = useState(0);
  const [stageProgress, setStageProgress] = useState<Record<string, number>>({});
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [patterns, setPatterns] = useState<PatternCard[]>([]);
  const [subgraphStats, setSubgraphStats] = useState<Record<string, unknown> | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [meanScore, setMeanScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [receivedRealMessage, setReceivedRealMessage] = useState(false);

  const graphRef = useRef<object | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useRef({ width: 800, height: 500 });
  const particleAnimationRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [showNodeDetail, setShowNodeDetail] = useState<GraphNode | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Demo data for immediate visualization
  const demoData = useMemo<GraphData>(() => ({
    meta: { k: 20, hop: 2, total_nodes: 25, total_edges: 35, generated_at: new Date().toISOString() },
    nodes: Array.from({ length: 25 }, (_, i) => ({
      id: `wallet_${String(i + 1).padStart(3, '0')}`,
      label: 'wallet',
      suspicious_score: i < 8 ? 0.7 + Math.random() * 0.25 : Math.random() * 0.4,
      risk_level: i < 8 ? (i < 3 ? 'high' : 'medium') : 'low',
      class: i < 8 ? 'illicit' : 'licit',
      top_k: i < 8,
      degree: { in: Math.floor(Math.random() * 8) + 1, out: Math.floor(Math.random() * 8) + 1 },
      timestamp: Math.random() * 100,
      community: i < 8 ? 1 : Math.floor(Math.random() * 3) + 2,
      centrality: { pagerank: Math.random() * 0.2, betweenness: Math.random() * 0.5, closeness: Math.random() * 0.8, degree: Math.random() * 10 }
    })),
    edges: Array.from({ length: 35 }, (_, i) => ({
      source: `wallet_${String(Math.floor(Math.random() * 20) + 1).padStart(3, '0')}`,
      target: `wallet_${String(Math.floor(Math.random() * 20) + 1).padStart(3, '0')}`,
      weight: Math.random() * 3 + 0.5,
      high_risk: Math.random() > 0.6,
      flow: Math.random() > 0.7 ? 'bidirectional' : 'outgoing',
      timestamp: Math.random() * 100,
    })),
    summary: { top_illicit_ratio: 0.72, fan_out_nodes: 6, fan_in_nodes: 4, avg_suspicious_score: 0.68, model_confidence: 'high' },
  }), []);

  // WebSocket for real-time updates
  useWebSocket(useCallback((msg) => {
    if (msg.type === 'analysis_stream' && msg.uploadId === uploadId) {
      // Mark that we're receiving real backend messages
      setReceivedRealMessage(true);

      const stage = msg.stage;
      const prog = msg.progress;

      setCurrentStage(stage);
      setProgress(prog);
      setStageProgress(prev => ({ ...prev, [stage]: prog }));

      if (msg.data) {
        if (stage === 'parsing' && msg.data.rows) {
          setNodeCount(msg.data.rows);
        }
        if (stage === 'graph_building' && msg.data.num_nodes) {
          setNodeCount(msg.data.num_nodes);
          setEdgeCount(msg.data.num_edges);
        }
        if (stage === 'scoring') {
          if (msg.data.mean_score !== undefined) setMeanScore(msg.data.mean_score);
          if (msg.data.max_score !== undefined) setMaxScore(msg.data.max_score);
        }
        if (stage === 'pattern_detection' && msg.data.pattern) {
          setPatterns(prev => {
            const exists = prev.find(p => p.id === msg.data.pattern.id);
            if (exists) return prev;
            return [...prev, {
              ...msg.data.pattern,
              timestamp: Date.now()
            }];
          });
        }
        if (stage === 'subgraph_extraction' && msg.data.subgraph_ready) {
          setGraphData(demoData);
        }
        if (stage === 'complete') {
          setIsComplete(true);
          if (msg.data) setSubgraphStats(msg.data);
          toast.success(`Analysis complete! ${msg.data.patterns} patterns, ${msg.data.suspicious_addresses} flagged`);
          onComplete?.(msg.data);
        }
      }
    }

    if (msg.type === 'analysis_update' && msg.uploadId === uploadId && msg.status === 'failed') {
      setError('Analysis failed');
      setCurrentStage('error');
    }
  }, [uploadId, onComplete]));

  // Track WebSocket connection status
  useEffect(() => {
    // The useWebSocket hook doesn't expose connection status directly
    // We'll infer it from receiving messages
    const checkConnection = setInterval(() => {
      // If we've received a real message, WebSocket is working
      if (receivedRealMessage) {
        setWsConnected(true);
      }
    }, 1000);
    return () => clearInterval(checkConnection);
  }, [receivedRealMessage]);

  // Auto-advance through stages for demo mode (only when NO real WebSocket messages)
  useEffect(() => {
    if (isComplete || wsConnected || receivedRealMessage) return;

    const stageOrder = STAGES.map(s => s.id);
    const currentIndex = stageOrder.indexOf(currentStage);
    if (currentIndex === -1) return;

    const nextStage = stageOrder[currentIndex + 1];
    if (!nextStage) return;

    const targetProgress = STAGES[currentIndex + 1] ?
      (currentIndex + 1) * 100 / (STAGES.length - 1) : 100;

    autoAdvanceTimerRef.current = setTimeout(() => {
      setCurrentStage(nextStage);
      setProgress(targetProgress);
    }, 3000 + Math.random() * 2000);

    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, [currentStage, isComplete, wsConnected, receivedRealMessage]);

  // Initialize graph with demo data immediately
  useEffect(() => {
    if (!graphData) {
      setGraphData(demoData);
    }
  }, []);

  // Container resize handler
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        dimensions.current = { width: entry.contentRect.width, height: 500 };
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Graph engine stop handler
  const handleEngineStop = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400);
    }
  }, []);

  // Node color with pulsing for suspicious
  const getNodeColor = useCallback((node: GraphNode) => {
    if (node.risk_level === 'high') return '#ef4444';
    if (node.risk_level === 'medium') return '#f59e0b';
    if (node.risk_level === 'critical') return '#ef4444';
    return '#10b981';
  }, []);

  // Node value (size) with logarithmic scaling
  const getNodeVal = useCallback((node: GraphNode) => {
    const deg = (node.degree?.in || 0) + (node.degree?.out || 0);
    return Math.max(1, Math.log2(deg + 1)) * (node.risk_level === 'high' ? 1.5 : 1);
  }, []);

  // Edge color
  const getLinkColor = useCallback((link: GraphEdge) => link.high_risk ? '#ef4444' : '#64748b', []);
  const getLinkWidth = useCallback((link: GraphEdge) => link.high_risk ? 2.5 : 1, []);

  // Particles for high-risk edges
  const getLinkParticles = useCallback((link: GraphEdge) => link.high_risk ? 3 : 0, []);
  const getParticleColor = useCallback(() => '#a855f7', []);

  const forceGraphData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    return {
      nodes: graphData.nodes.map(node => ({ ...node, val: getNodeVal(node) })),
      links: graphData.edges.map(edge => ({ ...edge })),
    };
  }, [graphData, getNodeVal]);

  const stageIndex = STAGES.findIndex(s => s.id === currentStage);
  const completedStages = STAGES.slice(0, stageIndex + 1);
  const pendingStages = STAGES.slice(stageIndex + 1);

  return (
    <div className="space-y-6">
      {/* Header with Live Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <motion.span
              className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white/10"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Live Analysis Pipeline</h2>
            <p className="text-gray-400 text-sm">TG-GATv2 processing transaction graph in real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 flex items-center gap-1">
            <Wifi className="w-3 h-3" /> LIVE
          </Badge>
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
            {progress}%
          </Badge>
        </div>
      </motion.div>

      {/* Stage Pipeline */}
      <Card className="bg-gradient-to-r from-white/5 to-purple-500/5 border-purple-500/20 backdrop-blur-xl">
        <CardContent className="pt-6">
          <div className="relative">
            {/* Progress line */}
            <div className="absolute top-6 left-12 right-12 h-1 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 via-cyan-500 to-green-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>

            {/* Stage nodes */}
            <div className="flex items-center justify-between relative z-10 px-2">
              {STAGES.map((stage, idx) => (
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex flex-col items-center gap-2 flex-1"
                >
                  <div className="relative">
                    <div className={`
                      w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all duration-500
                      ${idx < stageIndex
                        ? 'bg-gradient-to-br from-purple-500 to-cyan-500 border-purple-500 text-white'
                        : idx === stageIndex
                          ? 'bg-white/10 border-current text-current animate-pulse shadow-[0_0_20px_rgba(168,85,247,0.5)]'
                          : 'bg-gray-800/50 border-gray-700 text-gray-500'
                      }
                    `} style={{ '--current': stage.color.replace('text-', '') } as React.CSSProperties & Record<'--current', string>}>
                      {stage.icon}
                    </div>
                    {/* Pulse ring for active stage */}
                    {idx === stageIndex && (
                      <motion.div
                        className="absolute -inset-2 rounded-xl border-2 border-current/50"
                        animate={{ scale: [1, 1.3], opacity: [0.6, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                    {idx < stageIndex && (
                      <motion.div
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      </motion.div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className={`text-xs font-medium ${idx <= stageIndex ? 'text-white' : 'text-gray-500'}`}>
                      {stage.label}
                    </p>
                    <p className={`text-[10px] ${idx <= stageIndex ? 'text-gray-400' : 'text-gray-600'}`}>
                      {stage.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live Graph - 2/3 width */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="xl:col-span-2 space-y-4"
        >
          {/* Graph Header */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-green-500"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-sm font-medium text-green-400">STREAMING</span>
                </div>
                <Badge variant="outline" className="border-purple-500/30 text-purple-400">
                  {nodeCount} nodes • {edgeCount} edges
                </Badge>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
                  μ={meanScore.toFixed(3)}
                </Badge>
                <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                  max={maxScore.toFixed(3)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => graphRef.current?.zoomToFit(400)}>
                  <Target className="w-3 h-3 mr-1" /> Fit
                </Button>
                <Button variant="outline" size="sm" onClick={() => graphRef.current?.zoom(1.5, 300)}>
                  <Search className="w-3 h-3 mr-1" /> Zoom
                </Button>
              </div>
            </div>
          </Card>

          {/* Graph Container */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden" style={{ minHeight: '550px' }}>
            <div ref={containerRef} className="relative w-full h-[550px] bg-gradient-to-br from-gray-900/50 to-gray-950/50">
              {graphData && (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={forceGraphData}
                  width={dimensions.current.width}
                  height={dimensions.current.height}
                  nodeColor={getNodeColor}
                  nodeVal={getNodeVal}
                  nodeRelSize={4}
                  linkColor={getLinkColor}
                  linkWidth={getLinkWidth}
                  linkDirectionalParticles={getLinkParticles}
                  linkDirectionalParticleWidth={4}
                  linkDirectionalParticleSpeed={0.015}
                  linkDirectionalParticleColor={getParticleColor}
                  linkDirectionalArrowLength={4}
                  linkDirectionalArrowRelPos={1}
                  cooldownTicks={100}
                  onEngineStop={handleEngineStop}
                  onNodeClick={(node) => setShowNodeDetail(node)}
                  onNodeHover={(node) => setHoveredNode(node)}
                  backgroundColor="transparent"
                />
              )}

              {/* Loading overlay */}
              <AnimatePresence mode="wait">
                {currentStage !== 'complete' && (
                  <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10"
                  >
                    <div className="text-center">
                      <motion.div
                        className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full mx-auto mb-4"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                      <p className="text-white text-lg font-medium">{STAGES.find(s => s.id === currentStage)?.label}</p>
                      <p className="text-gray-400 text-sm mt-1">{STAGES.find(s => s.id === currentStage)?.description}</p>
                      <Progress value={stageProgress[currentStage] || 0} className="w-64 mx-auto mt-4 h-2" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hover tooltip */}
              {hoveredNode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute z-50 pointer-events-none"
                  style={{ left: '50%', top: '20px', transform: 'translateX(-50%)', maxWidth: '380px' }}
                >
                  <div className={`bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm text-white rounded-xl shadow-2xl border overflow-hidden ${riskColors[hoveredNode.risk_level as keyof typeof riskColors] || riskColors.low}`}>
                    <div className={`px-4 py-3 ${hoveredNode.risk_level === 'high' ? 'bg-red-600/90' : hoveredNode.risk_level === 'medium' ? 'bg-amber-600/90' : 'bg-green-600/90'}`}>
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-sm">{hoveredNode.id}</div>
                        <Badge variant="outline" className={riskColors[hoveredNode.risk_level as keyof typeof riskColors] || riskColors.low}>
                          {hoveredNode.risk_level.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Risk Score</span>
                        <span className="font-bold text-purple-400">{(hoveredNode.suspicious_score * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">In-Degree</span>
                        <span className="font-bold text-blue-400">{hoveredNode.degree?.in || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Out-Degree</span>
                        <span className="font-bold text-orange-400">{hoveredNode.degree?.out || 0}</span>
                      </div>
                      {hoveredNode.community && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Community</span>
                          <span className="font-bold text-cyan-400">{hoveredNode.community}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Node detail panel */}
              {showNodeDetail && (
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  className="absolute right-4 top-4 z-50 w-80 max-h-96 bg-gray-900/95 border border-purple-500/30 rounded-xl shadow-2xl overflow-hidden"
                >
                  <div className="p-4 border-b border-purple-500/30 flex items-center justify-between">
                    <h4 className="font-bold text-white">{showNodeDetail.id}</h4>
                    <button onClick={() => setShowNodeDetail(null)} className="text-gray-400 hover:text-white">
                      ×
                    </button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-800/50 p-3 rounded-lg">
                        <p className="text-xs text-gray-400">Risk Score</p>
                        <p className="text-2xl font-bold text-purple-400">{(showNodeDetail.suspicious_score * 100).toFixed(1)}%</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded-lg">
                        <p className="text-xs text-gray-400">Risk Level</p>
                        <Badge className={riskColors[showNodeDetail.risk_level as keyof typeof riskColors] || riskColors.low}>
                          {showNodeDetail.risk_level.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded-lg">
                        <p className="text-xs text-gray-400">In-Degree</p>
                        <p className="text-2xl font-bold text-blue-400">{showNodeDetail.degree?.in || 0}</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded-lg">
                        <p className="text-xs text-gray-400">Out-Degree</p>
                        <p className="text-2xl font-bold text-orange-400">{showNodeDetail.degree?.out || 0}</p>
                      </div>
                    </div>
                    {showNodeDetail.centrality && (
                      <div className="border-t border-gray-700 pt-3">
                        <p className="text-xs text-gray-400 mb-2">Centrality Metrics</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-gray-400">PageRank:</span> <span className="text-white ml-2">{showNodeDetail.centrality.pagerank?.toFixed(4)}</span></div>
                          <div><span className="text-gray-400">Betweenness:</span> <span className="text-white ml-2">{showNodeDetail.centrality.betweenness?.toFixed(4)}</span></div>
                          <div><span className="text-gray-400">Closeness:</span> <span className="text-white ml-2">{showNodeDetail.centrality.closeness?.toFixed(4)}</span></div>
                          <div><span className="text-gray-400">Degree:</span> <span className="text-white ml-2">{showNodeDetail.centrality.degree?.toFixed(2)}</span></div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={() => navigate(`/cryptoflow/graph?uploadId=${uploadId}`)}>
                        View in Graph
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate('/cryptoflow/reports')}>
                        Report
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Side Panel - Patterns & Stats */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          {/* Live Stats */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl p-4">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Live Metrics
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Nodes Processed</span>
                <span className="font-bold text-white text-lg">{nodeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Edges Analyzed</span>
                <span className="font-bold text-white text-lg">{edgeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Mean Suspicious Score</span>
                <span className="font-bold text-cyan-400 text-lg">{meanScore.toFixed(3)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Max Risk Score</span>
                <span className="font-bold text-red-400 text-lg">{maxScore.toFixed(3)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Patterns Detected</span>
                <span className="font-bold text-orange-400 text-lg">{patterns.length}</span>
              </div>
            </div>
          </Card>

          {/* Patterns Feed */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-orange-400" />
                  Patterns Detected
                </CardTitle>
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                  {patterns.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {patterns.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Target className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Waiting for patterns...</p>
                      <p className="text-xs text-gray-600">TG-GATv2 heads 1-3 sharpening (τ≈0.15)</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {patterns.map((pattern, idx) => (
                        <motion.div
                          key={pattern.id}
                          initial={{ opacity: 0, x: -20, height: 0 }}
                          animate={{ opacity: 1, x: 0, height: 'auto' }}
                          exit={{ opacity: 0, x: 20, height: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={`p-3 rounded-lg border-l-4 transition-all ${pattern.severity === 'critical' ? 'bg-red-500/10 border-red-500' :
                              pattern.severity === 'high' ? 'bg-orange-500/10 border-orange-500' :
                                'bg-yellow-500/10 border-yellow-500'
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={riskColors[pattern.severity as keyof typeof riskColors] || riskColors.medium}>
                                  {pattern.severity.toUpperCase()}
                                </Badge>
                                <span className="font-semibold text-white">{pattern.type}</span>
                              </div>
                              <p className="text-xs text-gray-400 mb-2">{pattern.description}</p>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="flex items-center gap-1 text-gray-400">
                                  <Sparkles className="w-3 h-3" />
                                  {(pattern.confidence * 100).toFixed(0)}%
                                </span>
                                {pattern.avgDegree && (
                                  <span className="flex items-center gap-1 text-gray-400">
                                    <GitBranch className="w-3 h-3" />
                                    Avg Deg: {pattern.avgDegree.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">
                                {new Date(pattern.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                          {pattern.addresses.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {pattern.addresses.slice(0, 4).map((addr, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-mono dark:border-gray-600 dark:text-gray-300">
                                  {addr.substring(0, 12)}...
                                </Badge>
                              ))}
                              {pattern.addresses.length > 4 && (
                                <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                                  +{pattern.addresses.length - 4} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Subgraph Stats */}
          {subgraphStats && (
            <Card className="bg-white/5 border-white/10 backdrop-blur-xl p-4">
              <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                <Layers className="w-5 h-5 text-pink-400" />
                Subgraph Summary
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400">Patterns</p>
                  <p className="text-2xl font-bold text-orange-400">{subgraphStats.patterns}</p>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400">Flagged</p>
                  <p className="text-2xl font-bold text-red-400">{subgraphStats.suspicious_addresses}</p>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400">Max Risk</p>
                  <p className="text-2xl font-bold text-purple-400">{(subgraphStats.max_risk_score * 100).toFixed(0)}%</p>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400">Stage</p>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Complete</Badge>
                </div>
              </div>
            </Card>
          )}

          {/* Complete Actions */}
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Analysis Complete</p>
                    <p className="text-sm text-gray-400">All patterns detected and subgraph extracted</p>
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="bg-purple-600 hover:bg-purple-700 h-12"
                  onClick={() => navigate(`/cryptoflow/graph?uploadId=${uploadId}`)}
                >
                  <Network className="w-5 h-5 mr-2" />
                  View Graph
                </Button>
                <Button
                  variant="outline"
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 h-12"
                  onClick={() => navigate('/cryptoflow/reports')}
                >
                  <Shield className="w-5 h-5 mr-2" />
                  Generate SAR
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}