import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { 
  Grid3X3, 
  RefreshCw, 
  Loader2, 
  TrendingUp, 
  AlertTriangle,
  Activity,
  Clock,
  Zap,
  Info
} from "lucide-react";
import { analysisApi, uploadApi, graphApi } from "@/lib/api";
import { toast } from "@/components/ToastNotification";

interface HeatmapCell {
  x: number;
  y: number;
  value: number;
  label?: string;
  metadata?: any;
}

interface PatternData {
  type: string;
  count: number;
  avgConfidence: number;
  severity: string;
}

export default function Heatmap() {
  const [isLoading, setIsLoading] = useState(false);
  const [uploads, setUploads] = useState<any[]>([]);
  const [selectedUploadId, setSelectedUploadId] = useState<string>("");
  const [patterns, setPatterns] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("risk");
  const [colorIntensity, setColorIntensity] = useState([70]);

  // Fetch uploads on mount
  useEffect(() => {
    const fetchUploads = async () => {
      try {
        const response = await uploadApi.getHistory(1, 50, 'completed');
        setUploads(response.uploads || []);
        if (response.uploads?.length > 0) {
          setSelectedUploadId(response.uploads[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch uploads:', err);
      }
    };
    fetchUploads();
  }, []);

  // Fetch data when upload changes
  useEffect(() => {
    if (selectedUploadId) {
      fetchAnalysisData();
    }
  }, [selectedUploadId]);

  const fetchAnalysisData = async () => {
    if (!selectedUploadId) return;
    
    setIsLoading(true);
    try {
      const [patternsRes, addressesRes, graphRes] = await Promise.all([
        analysisApi.getPatterns(selectedUploadId).catch(() => []),
        analysisApi.getSuspiciousAddresses(selectedUploadId).catch(() => ({ addresses: [] })),
        graphApi.getSuspiciousSubgraph(selectedUploadId, 50, 2).catch(() => null)
      ]);
      
      setPatterns(patternsRes || []);
      setAddresses(addressesRes.addresses || []);
      setGraphData(graphRes);
      toast.success("Analysis data loaded successfully");
    } catch (err) {
      console.error('Failed to fetch analysis:', err);
      toast.error("Failed to load analysis data");
    } finally {
      setIsLoading(false);
    }
  };

  // Generate risk distribution heatmap data (10x10 grid)
  const riskHeatmapData = useMemo(() => {
    if (!graphData?.nodes?.length) return [];
    
    const nodes = graphData.nodes;
    const gridSize = 10;
    const cells: HeatmapCell[] = [];
    
    // Create buckets for in-degree (y) vs out-degree (x)
    const maxIn = Math.max(...nodes.map((n: any) => n.degree?.in || 0), 1);
    const maxOut = Math.max(...nodes.map((n: any) => n.degree?.out || 0), 1);
    
    // Initialize grid
    const grid: number[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
    const counts: number[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
    
    // Populate grid with average risk scores
    nodes.forEach((node: any) => {
      const inDeg = node.degree?.in || 0;
      const outDeg = node.degree?.out || 0;
      const risk = node.suspicious_score || 0;
      
      const x = Math.min(Math.floor((outDeg / maxOut) * (gridSize - 1)), gridSize - 1);
      const y = Math.min(Math.floor((inDeg / maxIn) * (gridSize - 1)), gridSize - 1);
      
      grid[y][x] += risk;
      counts[y][x] += 1;
    });
    
    // Calculate averages and create cell data
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const avg = counts[y][x] > 0 ? grid[y][x] / counts[y][x] : 0;
        cells.push({
          x,
          y,
          value: avg,
          label: `In: ${Math.round((y / gridSize) * maxIn)}-${Math.round(((y + 1) / gridSize) * maxIn)}, Out: ${Math.round((x / gridSize) * maxOut)}-${Math.round(((x + 1) / gridSize) * maxOut)}`,
          metadata: { count: counts[y][x] }
        });
      }
    }
    
    return cells;
  }, [graphData]);

  // Generate pattern type heatmap
  const patternHeatmapData = useMemo(() => {
    const patternTypes = ['Structuring', 'Layering', 'Smurfing', 'Chain/Intermediary'];
    const severities = ['critical', 'high', 'medium', 'low'];
    const cells: HeatmapCell[] = [];
    
    patternTypes.forEach((type, y) => {
      severities.forEach((severity, x) => {
        const matchingPatterns = patterns.filter(
          (p: any) => p.type === type && p.severity === severity
        );
        const count = matchingPatterns.length;
        const avgConf = count > 0 
          ? matchingPatterns.reduce((sum: number, p: any) => sum + (p.confidence || 0), 0) / count 
          : 0;
        
        cells.push({
          x,
          y,
          value: count > 0 ? avgConf : 0,
          label: `${type} - ${severity}`,
          metadata: { count, avgConfidence: avgConf }
        });
      });
    });
    
    return cells;
  }, [patterns]);

  // Generate time-based activity heatmap (hours x days simulation)
  const activityHeatmapData = useMemo(() => {
    if (!addresses.length) return [];
    
    const hours = 24;
    const days = 7;
    const cells: HeatmapCell[] = [];
    
    // Simulate time distribution based on address data
    const hourlyActivity = Array(hours).fill(0).map(() => Array(days).fill(0));
    
    addresses.forEach((addr: any, idx: number) => {
      // Distribute based on transaction count
      const txCount = addr.transactionCount || 1;
      const hour = idx % hours;
      const day = Math.floor(idx / hours) % days;
      hourlyActivity[hour][day] += txCount * (addr.suspiciousScore || 0.5);
    });
    
    const maxVal = Math.max(...hourlyActivity.flat(), 1);
    
    for (let h = 0; h < hours; h++) {
      for (let d = 0; d < days; d++) {
        cells.push({
          x: d,
          y: h,
          value: hourlyActivity[h][d] / maxVal,
          label: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]} ${h}:00`,
          metadata: { rawValue: hourlyActivity[h][d] }
        });
      }
    }
    
    return cells;
  }, [addresses]);

  // Color interpolation for heatmap
  const getHeatmapColor = (value: number, intensity: number = 70) => {
    const adjustedValue = Math.pow(value, 1 / (intensity / 50));
    
    // Standardized thresholds matching Graph component (UltraGraphVisualization)
    // Graph thresholds: >= 0.8 = Critical/High (red), >= 0.5 = High/Medium (orange), < 0.5 = Low (green)
    if (adjustedValue >= 0.8) {
      return `rgba(239, 68, 68, ${0.4 + adjustedValue * 0.6})`; // Red #ef4444
    } else if (adjustedValue >= 0.5) {
      return `rgba(245, 158, 11, ${0.4 + adjustedValue * 0.6})`; // Amber/Orange #f59e0b
    } else if (adjustedValue > 0) {
      return `rgba(16, 185, 129, ${0.3 + adjustedValue * 0.6})`; // Green #10b981
    }
    return 'rgba(100, 116, 139, 0.1)'; // Gray for empty
  };

  // Summary statistics
  const stats = useMemo(() => {
    const highRisk = addresses.filter((a: any) => a.suspiciousScore >= 0.65).length;
    const mediumRisk = addresses.filter((a: any) => a.suspiciousScore >= 0.35 && a.suspiciousScore < 0.65).length;
    const criticalPatterns = patterns.filter((p: any) => p.severity === 'critical').length;
    const totalNodes = graphData?.nodes?.length || 0;
    
    return { highRisk, mediumRisk, criticalPatterns, totalNodes };
  }, [addresses, patterns, graphData]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const severityLabels = ['Critical', 'High', 'Medium', 'Low'];
  const patternLabels = ['Structuring', 'Layering', 'Smurfing', 'Chain'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Grid3X3 className="h-8 w-8 text-crypto-purple" />
              Heatmap Visualization
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Interactive risk analysis heatmaps for pattern detection
            </p>
          </div>
          <Button
            onClick={fetchAnalysisData}
            disabled={isLoading || !selectedUploadId}
            className="bg-crypto-purple hover:bg-crypto-dark-purple"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh Data
          </Button>
        </div>

        {/* Controls */}
        <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Select Dataset
                </label>
                <Select value={selectedUploadId} onValueChange={setSelectedUploadId}>
                  <SelectTrigger className="dark:bg-white/10 dark:border-crypto-purple/30">
                    <SelectValue placeholder="Choose an upload..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uploads.map((upload) => (
                      <SelectItem key={upload.id} value={upload.id}>
                        {upload.filename} - {new Date(upload.created_at).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Color Intensity: {colorIntensity[0]}%
                </label>
                <Slider
                  value={colorIntensity}
                  onValueChange={setColorIntensity}
                  min={20}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">High Risk</p>
                  <p className="text-2xl font-bold text-red-500">{stats.highRisk}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Medium Risk</p>
                  <p className="text-2xl font-bold text-amber-500">{stats.mediumRisk}</p>
                </div>
                <Activity className="h-8 w-8 text-amber-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Critical Patterns</p>
                  <p className="text-2xl font-bold text-purple-500">{stats.criticalPatterns}</p>
                </div>
                <Zap className="h-8 w-8 text-purple-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Nodes</p>
                  <p className="text-2xl font-bold text-crypto-purple">{stats.totalNodes}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-crypto-purple/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Heatmap Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="risk" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Risk Distribution
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Pattern Matrix
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Activity Timeline
            </TabsTrigger>
          </TabsList>

          {/* Risk Distribution Heatmap */}
          <TabsContent value="risk">
            <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  In-Degree vs Out-Degree Risk Heatmap
                </CardTitle>
                <CardDescription>
                  Visualizes average risk scores based on transaction flow patterns. 
                  High in-degree (receiving) + high out-degree (sending) indicates potential smurfing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin text-crypto-purple" />
                  </div>
                ) : riskHeatmapData.length > 0 ? (
                  <div className="relative">
                    {/* Y-axis label */}
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 -rotate-90 text-sm font-medium text-gray-600 dark:text-gray-400">
                      In-Degree (Receiving) →
                    </div>
                    
                    {/* Heatmap Grid */}
                    <div className="ml-8">
                      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(10, minmax(0, 1fr))` }}>
                        {riskHeatmapData.map((cell, idx) => (
                          <div
                            key={idx}
                            className="aspect-square rounded-md transition-all duration-200 hover:scale-110 hover:z-10 cursor-pointer relative group"
                            style={{ backgroundColor: getHeatmapColor(cell.value, colorIntensity[0]) }}
                            title={`${cell.label}\nRisk: ${(cell.value * 100).toFixed(1)}%\nNodes: ${cell.metadata?.count || 0}`}
                          >
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-lg">
                              <div className="font-semibold">{cell.label}</div>
                              <div>Risk: {(cell.value * 100).toFixed(1)}%</div>
                              <div>Nodes: {cell.metadata?.count || 0}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* X-axis label */}
                      <div className="text-center mt-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Out-Degree (Sending) →
                      </div>
                    </div>
                    
                    {/* Legend */}
                    <div className="flex items-center justify-center gap-6 mt-6">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.5)' }} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Low Risk</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(234, 179, 8, 0.6)' }} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Medium</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.8)' }} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">High</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.9)' }} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Critical</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] text-gray-500 dark:text-gray-400">
                    <Info className="h-12 w-12 mb-4 opacity-50" />
                    <p>No data available. Select an upload to view the heatmap.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pattern Matrix Heatmap */}
          <TabsContent value="patterns">
            <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Grid3X3 className="h-5 w-5 text-purple-500" />
                  Pattern Type vs Severity Matrix
                </CardTitle>
                <CardDescription>
                  Shows the distribution of detected AML patterns by type and severity level.
                  Brighter cells indicate higher average confidence scores.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin text-crypto-purple" />
                  </div>
                ) : (
                  <div className="relative overflow-x-auto">
                    {/* Header row */}
                    <div className="grid grid-cols-5 gap-2 mb-2">
                      <div className="h-10" /> {/* Empty corner */}
                      {severityLabels.map((label) => (
                        <div key={label} className="h-10 flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-300">
                          <Badge variant={label === 'Critical' ? 'destructive' : label === 'High' ? 'default' : 'secondary'}>
                            {label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    
                    {/* Data rows */}
                    {patternLabels.map((pattern, y) => (
                      <div key={pattern} className="grid grid-cols-5 gap-2 mb-2">
                        <div className="h-16 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 pr-2">
                          {pattern}
                        </div>
                        {severityLabels.map((_, x) => {
                          const cell = patternHeatmapData.find(c => c.x === x && c.y === y);
                          return (
                            <div
                              key={x}
                              className="h-16 rounded-lg transition-all duration-200 hover:scale-105 cursor-pointer flex flex-col items-center justify-center relative group"
                              style={{ backgroundColor: getHeatmapColor(cell?.value || 0, colorIntensity[0]) }}
                            >
                              <span className="text-lg font-bold text-gray-900 dark:text-white">
                                {cell?.metadata?.count || 0}
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {cell?.value ? `${(cell.value * 100).toFixed(0)}%` : '-'}
                              </span>
                              
                              {/* Tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-lg">
                                <div className="font-semibold">{cell?.label}</div>
                                <div>Count: {cell?.metadata?.count || 0}</div>
                                <div>Avg Confidence: {((cell?.metadata?.avgConfidence || 0) * 100).toFixed(1)}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Timeline Heatmap */}
          <TabsContent value="activity">
            <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Suspicious Activity Timeline
                </CardTitle>
                <CardDescription>
                  Simulated hourly activity distribution across the week based on flagged addresses.
                  Higher intensity indicates more suspicious transaction volume.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[500px]">
                    <Loader2 className="h-8 w-8 animate-spin text-crypto-purple" />
                  </div>
                ) : activityHeatmapData.length > 0 ? (
                  <div className="relative overflow-x-auto">
                    {/* Day headers */}
                    <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
                      <div className="h-8" /> {/* Empty corner */}
                      {dayLabels.map((day) => (
                        <div key={day} className="h-8 flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-300">
                          {day}
                        </div>
                      ))}
                    </div>
                    
                    {/* Hour rows */}
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div key={hour} className="grid gap-1 mb-1" style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
                        <div className="h-5 flex items-center text-xs text-gray-500 dark:text-gray-400 pr-2">
                          {hour.toString().padStart(2, '0')}:00
                        </div>
                        {dayLabels.map((_, day) => {
                          const cell = activityHeatmapData.find(c => c.x === day && c.y === hour);
                          return (
                            <div
                              key={day}
                              className="h-5 rounded transition-all duration-200 hover:scale-110 cursor-pointer relative group"
                              style={{ backgroundColor: getHeatmapColor(cell?.value || 0, colorIntensity[0]) }}
                            >
                              {/* Tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-lg">
                                <div className="font-semibold">{cell?.label}</div>
                                <div>Activity: {((cell?.value || 0) * 100).toFixed(1)}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    
                    {/* Legend */}
                    <div className="flex items-center justify-center gap-6 mt-6">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Low Activity</span>
                      <div className="flex gap-1">
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map((val) => (
                          <div
                            key={val}
                            className="w-6 h-4 rounded"
                            style={{ backgroundColor: getHeatmapColor(val, colorIntensity[0]) }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">High Activity</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[500px] text-gray-500 dark:text-gray-400">
                    <Info className="h-12 w-12 mb-4 opacity-50" />
                    <p>No data available. Select an upload to view activity patterns.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="bg-gradient-to-r from-crypto-purple/10 to-purple-500/10 dark:from-crypto-purple/20 dark:to-purple-500/20 border-crypto-purple/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Info className="h-6 w-6 text-crypto-purple mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Understanding the Heatmaps</h3>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Risk Distribution:</strong> Shows how risk scores correlate with in/out transaction degrees. Smurfing typically appears in high in-degree + high out-degree cells.</li>
                  <li>• <strong>Pattern Matrix:</strong> Displays detected AML patterns by type and severity. Numbers show pattern counts, percentages show average confidence.</li>
                  <li>• <strong>Activity Timeline:</strong> Visualizes when suspicious activity occurs, helping identify unusual timing patterns.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
