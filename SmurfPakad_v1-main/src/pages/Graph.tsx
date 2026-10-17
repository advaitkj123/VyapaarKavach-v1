import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Network, Upload as UploadIcon, RefreshCw, Loader2, AlertTriangle, Download, Boxes } from "lucide-react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import UltraGraphVisualization from "@/components/UltraGraphVisualization";
import NetworkGraph3D from "@/components/NetworkGraph3D";
import { graphApi, uploadApi, type GraphData } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "@/components/ToastNotification";
import { usePageEntrance } from "@/hooks/useGSAP";


interface UploadItem {
  id: string;
  name?: string;
  filename?: string;
  date?: string;
  uploadedAt?: string;
}

// Transform backend graph data to match UltraGraphVisualization expected format
function transformGraphData(backendData: GraphData): GraphData {
  if (!backendData) return backendData;
  
  return {
    ...backendData,
    nodes: (backendData.nodes || []).map((node, index) => ({
      ...node,
      // Add label for display (use id as label if not present)
      label: node.id || `node_${index}`,
      // Add class based on predictedLabel or risk_level
      class: node.predictedLabel === 'illicit' ? 'illicit' : 
             node.risk_level === 'high' || node.riskLevel === 'high' ? 'illicit' : 
             node.risk_level === 'medium' || node.riskLevel === 'medium' ? 'illicit' : 'licit',
      // Mark seed nodes as top_k
      top_k: node.isSeedNode === true,
      // Ensure risk_level is lowercase
      risk_level: (node.risk_level || node.riskLevel || 'low').toLowerCase(),
      // Ensure suspicious_score is set
      suspicious_score: node.suspicious_score || node.suspiciousScore || node.mlScore || 0,
      // Add community (default to 1 if not present)
      community: node.community ?? 1,
      // Add placeholder centrality for visualization
      centrality: node.centrality ?? {
        pagerank: 0.01,
        betweenness: 0.01,
        closeness: 0.5,
        degree: (node.degree?.in || 0) + (node.degree?.out || 0)
      },
      // Add timestamp if not present
      timestamp: node.timestamp ?? Date.now() - Math.random() * 10000000000,
    })),
    edges: (backendData.edges || []).map(edge => ({
      ...edge,
      // Ensure weight is set
      weight: edge.weight ?? 1,
      // Ensure high_risk is set
      high_risk: edge.high_risk ?? (edge.suspicious === true),
      // Add flow direction
      flow: edge.flow ?? 'outgoing',
      timestamp: edge.timestamp ?? Date.now(),
    })),
    // Ensure summary exists
    summary: backendData.summary ?? {
      top_illicit_ratio: 0,
      fan_out_nodes: 0,
      fan_in_nodes: 0,
      avg_suspicious_score: 0,
      model_confidence: 'low'
    }
  };
}

export default function Graph() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uploadIdParam = searchParams.get('uploadId');
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
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
      setUseDemo(false);
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
      
      // Validate basic structure
      if (!jsonData.nodes || !jsonData.edges) {
        throw new Error('Invalid graph data format');
      }
      
      setGraphData(jsonData);
      setUseDemo(false);
      toast.success(`Successfully loaded ${jsonData.nodes.length} nodes and ${jsonData.edges.length} edges`);
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
                <UltraGraphVisualization data={graphData || undefined} />
              </ErrorBoundary>
            </div>
            <div id="view-3d" style={{ display: 'none' }} className="rounded-xl overflow-hidden border border-white/10">
              <NetworkGraph3D height="520px" />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

