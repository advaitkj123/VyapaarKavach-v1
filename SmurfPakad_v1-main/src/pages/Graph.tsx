import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Network, Upload as UploadIcon, RefreshCw, Loader2, AlertTriangle, Download, Boxes, ShieldAlert, Sparkles } from "lucide-react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import UltraGraphVisualization from "@/components/UltraGraphVisualization";
import NetworkGraph3D from "@/components/NetworkGraph3D";
import GraphInvestigationPanel, { type InvestigableNode } from "@/components/GraphInvestigationPanel";
import { graphApi, uploadApi, type GraphData } from "@/lib/api";
import { enrichGraphRisk, type SmurfPattern } from "@/lib/graphRisk";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "@/components/ToastNotification";
import { Badge } from "@/components/ui/badge";


interface UploadItem {
  id: string;
  name?: string;
  filename?: string;
  date?: string;
  uploadedAt?: string;
}

// Transform backend graph data to match UltraGraphVisualization expected format
function transformGraphData(backendData: GraphData): any {
  if (!backendData) return backendData;

  const enriched = enrichGraphRisk(backendData);
  const nodeCount = enriched.nodes.length;

  const nodes = enriched.nodes.map((node: any, index: number) => {
    const inDeg = node.degree?.in ?? 0;
    const outDeg = node.degree?.out ?? 0;
    const score = node.suspicious_score ?? 0;
    const risk = String(node.risk_level || node.riskLevel || 'low').toLowerCase();
    const timestamp =
      typeof node.timestamp === 'number' && node.timestamp <= 1000
        ? node.timestamp
        : Math.min(100, Math.round((index / Math.max(1, nodeCount - 1)) * 100));

    return {
      ...node,
      id: String(node.id ?? `node_${index}`),
      label: node.label || node.id || `node_${index}`,
      class: score >= 0.35 || risk === 'high' || risk === 'critical' || risk === 'medium' ? 'illicit' : 'licit',
      top_k: node.top_k === true || score >= 0.65,
      risk_level: risk === 'critical' ? 'high' : risk,
      suspicious_score: score,
      community: node.community ?? (score >= 0.65 ? 1 : score >= 0.35 ? 2 : 3),
      degree: { in: inDeg, out: outDeg },
      centrality: node.centrality ?? {
        pagerank: Math.max(0.01, score * 0.2),
        betweenness: Math.max(0.01, (inDeg + outDeg) / 20),
        closeness: 0.5,
        degree: inDeg + outDeg,
      },
      timestamp,
    };
  });

  const nodeIds = new Set(nodes.map((n: any) => n.id));
  const edges = enriched.edges
    .map((edge: any, index: number) => ({
      ...edge,
      source: String(edge.source),
      target: String(edge.target),
      weight: edge.weight ?? 1,
      high_risk: edge.high_risk === true,
      flow: edge.flow ?? 'outgoing',
      timestamp:
        typeof edge.timestamp === 'number' && edge.timestamp <= 1000
          ? edge.timestamp
          : Math.min(100, Math.round(((index + 1) / Math.max(1, enriched.edges.length)) * 100)),
    }))
    .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const highCount = nodes.filter((n: any) => n.suspicious_score >= 0.65).length;
  const avg =
    nodes.reduce((s: number, n: any) => s + (n.suspicious_score || 0), 0) / Math.max(1, nodes.length);

  return {
    ...backendData,
    nodes,
    edges,
    links: edges,
    patterns: enriched.patterns,
    meta: {
      k: 20,
      hop: 2,
      total_nodes: nodes.length,
      total_edges: edges.length,
      generated_at: new Date().toISOString(),
    },
    summary: {
      ...(backendData.summary || {}),
      top_illicit_ratio: Math.round((highCount / Math.max(1, nodes.length)) * 100),
      fan_out_nodes: nodes.filter((n: any) => n.degree.out >= 3).length,
      fan_in_nodes: nodes.filter((n: any) => n.degree.in >= 3).length,
      avg_suspicious_score: Math.round(avg * 100) / 100,
      model_confidence: avg > 0.6 ? 'high' : avg > 0.35 ? 'medium' : 'low',
    },
  };
}

export default function Graph() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uploadIdParam = searchParams.get('uploadId');
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [patterns, setPatterns] = useState<SmurfPattern[]>([]);
  const [investigatedNode, setInvestigatedNode] = useState<InvestigableNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(true); // Default to demo mode
  
  // Graph parameters
  const [selectedUploadId, setSelectedUploadId] = useState<string>(uploadIdParam || '');
  const [topK, setTopK] = useState(20);
  const [hop, setHop] = useState(2);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  
  // Track if we've fetched uploads already
  const hasFetchedUploads = useRef(false);

  const riskBreakdown = useMemo(() => {
    const nodes = graphData?.nodes || [];
    let high = 0, medium = 0, low = 0;
    for (const n of nodes as any[]) {
      const s = n.suspicious_score ?? n.risk ?? 0;
      if (s >= 0.65) high++;
      else if (s >= 0.35) medium++;
      else low++;
    }
    return { high, medium, low, total: nodes.length, edges: (graphData?.edges || graphData?.links || []).length };
  }, [graphData]);

  // Fetch available uploads on mount (only once)
  useEffect(() => {
    if (hasFetchedUploads.current) return;
    hasFetchedUploads.current = true;
    
    const fetchUploads = async () => {
      try {
        const response = await uploadApi.getHistory(1, 50, 'completed');
        setUploads(response.uploads || []);
        
        // Auto-select first upload if one is specified in URL
        if (uploadIdParam && response.uploads?.some((u: UploadItem) => u.id === uploadIdParam)) {
          setSelectedUploadId(uploadIdParam);
        }
      } catch (err) {
        console.error('Failed to fetch uploads:', err);
        // Stay in demo mode
      }
    };
    fetchUploads();
  }, [uploadIdParam]);

  const fetchGraphData = useCallback(async () => {
    if (!selectedUploadId) {
      setError('Please select an upload first');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const data = await graphApi.getSuspiciousSubgraph(selectedUploadId, topK, hop);
      // Transform backend data to match visualization component expectations
      const transformedData = transformGraphData(data);
      setGraphData(transformedData);
      setPatterns(transformedData.patterns || []);
      setUseDemo(false);
      toast.success(
        `Analyzed ${transformedData.nodes.length} wallets · ${transformedData.edges.length} edges · ${(transformedData.patterns || []).length} smurf patterns`
      );
    } catch (err: unknown) {
      console.error('Failed to fetch graph:', err);
      setError((err as Error).message || 'Failed to load graph data');
      // Keep existing data or demo mode
    } finally {
      setIsLoading(false);
    }
  }, [selectedUploadId, topK, hop]);

  // Auto-fetch graph data when uploadId is in URL
  const hasAutoFetched = useRef(false);
  useEffect(() => {
    if (uploadIdParam && selectedUploadId === uploadIdParam && !hasAutoFetched.current) {
      hasAutoFetched.current = true;
      fetchGraphData();
    }
  }, [uploadIdParam, selectedUploadId, fetchGraphData]);

  // Handle local file upload (fallback)
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      // Validate basic structure (accept edges or links)
      if (!jsonData.nodes || (!jsonData.edges && !jsonData.links)) {
        throw new Error('Invalid graph data format');
      }

      const transformed = transformGraphData(jsonData);
      setGraphData(transformed);
      setPatterns(transformed.patterns || []);
      setUseDemo(false);
      toast.success(`Successfully loaded ${transformed.nodes.length} nodes and ${transformed.edges.length} edges`);
    } catch (error) {
      console.error('Error parsing file:', error);
      setError('Invalid JSON file. Please upload a valid graph data file.');
      toast.error('Invalid JSON file. Please upload valid graph data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Transaction Graph</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Interactive network visualization of suspicious transactions</p>
          </div>
          <div className="flex space-x-2">
            <label htmlFor="file-upload">
              <Button 
                variant="outline"
                className="cursor-pointer dark:border-gray-600 dark:text-gray-300"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={isLoading}
              >
                <UploadIcon className="h-4 w-4 mr-2" />
                Upload JSON
              </Button>
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            {graphData && !useDemo && (
              <Button 
                variant="outline"
                onClick={() => {
                  setGraphData(null);
                  setPatterns([]);
                  setInvestigatedNode(null);
                  setUseDemo(true);
                }}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset to Demo
              </Button>
            )}
          </div>
        </div>

        {/* Data Source Controls */}
        <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                  Select Upload
                </label>
                <Select value={selectedUploadId} onValueChange={setSelectedUploadId}>
                  <SelectTrigger className="dark:border-gray-600 dark:bg-gray-800">
                    <SelectValue placeholder="Select an upload..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uploads.map((upload) => (
                      <SelectItem key={upload.id} value={upload.id}>
                        {upload.name || upload.filename} - {new Date(upload.date || upload.uploadedAt || '').toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-[120px]">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                  Top K Nodes
                </label>
                <Select value={topK.toString()} onValueChange={(v) => setTopK(parseInt(v))}>
                  <SelectTrigger className="dark:border-gray-600 dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-[120px]">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                  Hop Distance
                </label>
                <Select value={hop.toString()} onValueChange={(v) => setHop(parseInt(v))}>
                  <SelectTrigger className="dark:border-gray-600 dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hop</SelectItem>
                    <SelectItem value="2">2 hops</SelectItem>
                    <SelectItem value="3">3 hops</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                className="bg-crypto-purple hover:bg-crypto-dark-purple"
                onClick={fetchGraphData}
                disabled={isLoading || !selectedUploadId}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Load Graph
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-red-800 dark:text-red-200">{error}</p>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                    Showing demo data instead.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card className="dark:bg-white/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-crypto-purple" />
                <span className="ml-3 text-gray-600 dark:text-gray-400">Loading graph data...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Demo Mode Info */}
        {useDemo && !isLoading && (
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <Network className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">Demo Mode Active</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    {uploads.length === 0 
                      ? "No uploads found. Upload transaction data first to see real analysis results."
                      : "Select an upload above to load real analysis data, or view the demo visualization below."
                    }
                  </p>
                  {uploads.length === 0 && (
                    <Button 
                      className="mt-3 bg-crypto-purple hover:bg-crypto-dark-purple"
                      onClick={() => navigate('/cryptoflow/upload')}
                    >
                      Upload Data
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Risk legend + Smurf Chain Hunter (hackathon demo panel) */}
        {!isLoading && graphData && !useDemo && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="dark:bg-white/5 dark:border-crypto-purple/20 md:col-span-1">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <Sparkles className="h-4 w-4 text-crypto-purple" />
                  Risk breakdown
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/40">
                    High {riskBreakdown.high}
                  </Badge>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">
                    Medium {riskBreakdown.medium}
                  </Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                    Low {riskBreakdown.low}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {riskBreakdown.total} wallets · {riskBreakdown.edges} edges · scored with GATv2 + fan-in/fan-out heuristics
                </p>
                <div className="flex items-center gap-3 text-xs pt-1">
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> High ≥65%</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Med ≥35%</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low</span>
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-white/5 dark:border-crypto-purple/20 md:col-span-2">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                    <ShieldAlert className="h-4 w-4 text-red-400" />
                    Smurf Chain Hunter
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {patterns.length} patterns
                  </Badge>
                </div>
                {patterns.length === 0 ? (
                  <p className="text-sm text-gray-500">No strong smurfing signatures in this subgraph. Try raising Top K or Hop.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 max-h-40 overflow-y-auto">
                    {patterns.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          const node = (graphData?.nodes || []).find((n: any) => String(n.id) === p.walletId) as any;
                          setInvestigatedNode({
                            id: p.walletId,
                            risk_level: node?.risk_level || (p.score >= 0.65 ? 'high' : 'medium'),
                            suspicious_score: node?.suspicious_score ?? p.score,
                            degree: node?.degree,
                            class: 'illicit',
                            top_k: true,
                          });
                          document.getElementById('investigation-panel')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-left hover:border-crypto-purple/50 transition-colors w-full"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-white truncate">{p.walletId}</span>
                          <Badge className="bg-red-500/15 text-red-300 shrink-0">{Math.round(p.score * 100)}%</Badge>
                        </div>
                        <div className="text-crypto-purple mt-0.5">{p.fatf} · {p.type.replace('_', ' ')}</div>
                        <div className="text-gray-400 mt-0.5">{p.detail}</div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Interactive Graph Visualization — 2D / 3D Toggle */}
        {!isLoading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                id="toggle-2d"
                onClick={() => {
                  document.getElementById('view-2d')!.style.display = 'block';
                  document.getElementById('view-3d')!.style.display = 'none';
                  document.getElementById('toggle-2d')!.className = 'px-3 py-1.5 text-xs rounded-lg bg-crypto-purple text-white font-semibold';
                  document.getElementById('toggle-3d')!.className = 'px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-400 border border-white/10';
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-crypto-purple text-white font-semibold"
              >
                <Network className="h-3 w-3 inline mr-1" /> 2D Force Graph
              </button>
              <button
                id="toggle-3d"
                onClick={() => {
                  document.getElementById('view-2d')!.style.display = 'none';
                  document.getElementById('view-3d')!.style.display = 'block';
                  document.getElementById('toggle-3d')!.className = 'px-3 py-1.5 text-xs rounded-lg bg-crypto-purple text-white font-semibold';
                  document.getElementById('toggle-2d')!.className = 'px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-400 border border-white/10';
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-400 border border-white/10"
              >
                <Boxes className="h-3 w-3 inline mr-1" /> 3D Network
              </button>
            </div>
            <div id="view-2d">
              <ErrorBoundary>
                <UltraGraphVisualization
                  data={graphData || undefined}
                  onNodeSelect={(n) => {
                    if (!n) {
                      setInvestigatedNode(null);
                      return;
                    }
                    setInvestigatedNode({
                      id: n.id,
                      risk_level: n.risk_level,
                      suspicious_score: n.suspicious_score,
                      degree: n.degree,
                      class: n.class,
                      top_k: n.top_k,
                    });
                    // Smooth scroll to investigation panel
                    requestAnimationFrame(() => {
                      document.getElementById('investigation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                />
              </ErrorBoundary>
            </div>
            <div id="view-3d" style={{ display: 'none' }} className="rounded-xl overflow-hidden border border-white/10">
              <NetworkGraph3D
                height="520px"
                nodes={
                  graphData?.nodes?.length
                    ? graphData.nodes.map((n: any, i: number) => ({
                        id: String(n.id),
                        position: [
                          Math.cos((i / Math.max(1, graphData.nodes.length)) * Math.PI * 2) * (2 + (n.suspicious_score || 0) * 2),
                          Math.sin(i * 1.7) * 1.5,
                          Math.sin((i / Math.max(1, graphData.nodes.length)) * Math.PI * 2) * (2 + (n.suspicious_score || 0) * 2),
                        ] as [number, number, number],
                        riskScore: n.suspicious_score || n.risk || 0,
                        platform: (String(n.id).includes('phonepe')
                          ? 'phonepe'
                          : String(n.id).includes('gpay')
                            ? 'gpay'
                            : String(n.id).includes('paytm')
                              ? 'paytm'
                              : 'bank') as 'paytm' | 'phonepe' | 'gpay' | 'bank',
                      }))
                    : undefined
                }
                edges={
                  graphData?.nodes?.length
                    ? (graphData.edges || graphData.links || []).map((e: any) => ({
                        from: String(e.source?.id ?? e.source ?? e.from),
                        to: String(e.target?.id ?? e.target ?? e.to),
                        amount: e.weight ?? e.amount ?? 1,
                      }))
                    : undefined
                }
              />
            </div>

            {/* Click-node investigation: Explain · SAR · Safeguard · Cross-platform */}
            <div id="investigation-panel">
              <ErrorBoundary>
                <GraphInvestigationPanel
                  node={investigatedNode}
                  onClear={() => setInvestigatedNode(null)}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

