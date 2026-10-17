import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSearchParams } from "react-router-dom";
import {
  Eye,
  Brain,
  FileWarning,
  Shield,
  AlertTriangle,
  Activity,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Crosshair,
  Network,
  BarChart3,
  BookOpen,
  Download,
  Sparkles,
} from "lucide-react";
import { ibmAiApi, type AnalystBrief } from "@/lib/api";
import { generateSARPdf } from "@/components/SARPdfGenerator";
import MoneyFlowSankey from "@/components/MoneyFlowSankey";

// ============================================================================
// Types
// ============================================================================

interface SelectedNode {
  id: string;
  riskScore: number;
  riskLevel: string;
  patterns: any[];
  featureImportance: any[];
  graphMetrics?: {
    in_degree: number;
    out_degree: number;
    total_connections: number;
  };
}

// ============================================================================
// XAI Feature Importance Bar
// ============================================================================
function FeatureBar({
  name,
  importance,
  value,
  maxImportance,
}: {
  name: string;
  importance: number;
  value: number;
  maxImportance: number;
}) {
  const pct = maxImportance > 0 ? (importance / maxImportance) * 100 : 0;
  const isHighImpact = pct > 60;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400 truncate max-w-[140px]" title={name}>
          {name}
        </span>
        <span
          className={`font-mono ${
            isHighImpact ? "text-red-400" : "text-gray-500"
          }`}
        >
          {(importance * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            isHighImpact
              ? "bg-gradient-to-r from-red-500 to-orange-500"
              : pct > 30
              ? "bg-gradient-to-r from-yellow-500 to-orange-500"
              : "bg-gradient-to-r from-blue-500 to-cyan-500"
          }`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Pattern Card
// ============================================================================
function PatternCard({ pattern }: { pattern: any }) {
  const severityColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  const typeIcons: Record<string, string> = {
    fan_out: "🔀",
    fan_in: "🔃",
    pass_through: "🔁",
    high_activity: "⚡",
  };

  return (
    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-lg">
          {typeIcons[pattern.type] || "🔍"}
        </span>
        <Badge
          variant="outline"
          className={`text-[10px] uppercase ${
            severityColors[pattern.severity] || severityColors.medium
          }`}
        >
          {pattern.severity}
        </Badge>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed">
        {pattern.description}
      </p>
      {pattern.detail && (
        <p className="text-xs text-gray-500 mt-1">{pattern.detail}</p>
      )}
    </div>
  );
}

// ============================================================================
// FATF Flag Component
// ============================================================================
interface FATFFlagData {
  rule?: string;
  description?: string;
  severity?: string;
}

function FATFFlag({ flag }: { flag: string | FATFFlagData }) {
  // Handle both plain strings and structured objects from IBM brief
  const isObject = typeof flag === "object" && flag !== null;
  const ruleLabel = isObject ? (flag as FATFFlagData).rule : null;
  const text = isObject
    ? `${(flag as FATFFlagData).rule}: ${(flag as FATFFlagData).description}`
    : (flag as string);
  const sev = isObject ? (flag as FATFFlagData).severity : null;

  const sevColors: Record<string, string> = {
    critical: "border-red-500/30 bg-red-500/5 text-red-300/80",
    high:     "border-orange-500/30 bg-orange-500/5 text-orange-300/80",
    medium:   "border-yellow-500/30 bg-yellow-500/5 text-yellow-300/80",
  };
  const cls = sevColors[sev || ""] || "border-orange-500/20 bg-orange-500/5 text-orange-300/80";

  return (
    <div className={`p-3 rounded-lg border ${cls}`}>
      <div className="flex items-start gap-2">
        <FileWarning className="h-4 w-4 mt-0.5 shrink-0 text-orange-400" />
        <div>
          {ruleLabel && (
            <span className="text-xs font-semibold text-orange-300 block mb-0.5">{ruleLabel}</span>
          )}
          <p className="text-xs leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mock Graph Visualization (Interactive node cluster)
// ============================================================================
function InvestigationGraph({
  onNodeSelect,
}: {
  onNodeSelect: (node: SelectedNode) => void;
}) {
  // Generate mock cluster for demo
  const [nodes] = useState(() => {
    const center = { id: "0xA1...mule", x: 400, y: 250, risk: 0.92 };
    const connected = [
      { id: "0xB2...src1", x: 200, y: 150, risk: 0.45 },
      { id: "0xC3...src2", x: 180, y: 350, risk: 0.38 },
      { id: "0xD4...src3", x: 280, y: 100, risk: 0.52 },
      { id: "0xE5...src4", x: 250, y: 400, risk: 0.41 },
      { id: "0xF6...dst1", x: 580, y: 130, risk: 0.67 },
      { id: "0xG7...dst2", x: 620, y: 300, risk: 0.73 },
      { id: "0xH8...dst3", x: 560, y: 420, risk: 0.58 },
      { id: "0xI9...agg", x: 700, y: 250, risk: 0.85 },
    ];
    return [center, ...connected];
  });

  const edges = [
    // Fan-in to mule
    { from: 1, to: 0 },
    { from: 2, to: 0 },
    { from: 3, to: 0 },
    { from: 4, to: 0 },
    // Fan-out from mule
    { from: 0, to: 5 },
    { from: 0, to: 6 },
    { from: 0, to: 7 },
    // Aggregation
    { from: 5, to: 8 },
    { from: 6, to: 8 },
    { from: 7, to: 8 },
  ];

  const [selectedIdx, setSelectedIdx] = useState<number | null>(0);

  const handleNodeClick = (idx: number) => {
    setSelectedIdx(idx);
    const n = nodes[idx];
    onNodeSelect({
      id: n.id,
      riskScore: n.risk,
      riskLevel: n.risk >= 0.7 ? "critical" : n.risk >= 0.5 ? "high" : n.risk >= 0.3 ? "medium" : "low",
      patterns: n.risk >= 0.7 
        ? [
            { type: "pass_through", severity: "critical", description: `Both receives (${3 + Math.floor(Math.random()*3)}) and sends (${2 + Math.floor(Math.random()*3)}) to multiple wallets (mule wallet pattern)`, detail: "Classic smurfing intermediary" },
            { type: "fan_out", severity: "high", description: `Sends to ${2 + Math.floor(Math.random()*4)} different recipients (structuring indicator)`, detail: "" },
          ]
        : n.risk >= 0.5
        ? [{ type: "fan_in", severity: "medium", description: `Receives from ${2 + Math.floor(Math.random()*3)} different sources`, detail: "Possible aggregation point" }]
        : [],
      featureImportance: [
        { feature_name: "out_degree", importance: 0.85 * n.risk, value: 3 + Math.floor(Math.random()*5) },
        { feature_name: "threshold_proximity_ratio", importance: 0.72 * n.risk, value: 0.95 },
        { feature_name: "burst_score", importance: 0.65 * n.risk, value: 0.78 },
        { feature_name: "fan_out_ratio", importance: 0.58 * n.risk, value: 0.82 },
        { feature_name: "total_sent", importance: 0.45 * n.risk, value: 495000 },
      ],
      graphMetrics: {
        in_degree: idx === 0 ? 4 : Math.floor(Math.random() * 3),
        out_degree: idx === 0 ? 3 : Math.floor(Math.random() * 4),
        total_connections: idx === 0 ? 7 : 1 + Math.floor(Math.random() * 4),
      },
    });
  };

  const getNodeColor = (risk: number) => {
    if (risk >= 0.7) return "#ef4444";
    if (risk >= 0.5) return "#f97316";
    if (risk >= 0.3) return "#eab308";
    return "#3b82f6";
  };

  return (
    <svg
      viewBox="0 0 800 500"
      className="w-full h-full"
      style={{ background: "transparent" }}
    >
      {/* Grid background */}
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="800" height="500" fill="url(#grid)" />

      {/* Edges */}
      {edges.map((edge, i) => {
        const from = nodes[edge.from];
        const to = nodes[edge.to];
        const isHighlighted =
          selectedIdx === edge.from || selectedIdx === edge.to;
        return (
          <g key={`edge-${i}`}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isHighlighted ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.08)"}
              strokeWidth={isHighlighted ? 2.5 : 1}
              strokeDasharray={isHighlighted ? "" : "4 4"}
            />
            {/* Arrow */}
            {isHighlighted && (
              <circle
                cx={(from.x + to.x) / 2 + (to.x - from.x) * 0.15}
                cy={(from.y + to.y) / 2 + (to.y - from.y) * 0.15}
                r={3}
                fill="rgba(168,85,247,0.8)"
              />
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const isSelected = selectedIdx === i;
        const color = getNodeColor(node.risk);
        const r = isSelected ? 20 : node.risk >= 0.7 ? 16 : 12;

        return (
          <g
            key={node.id}
            className="cursor-pointer"
            onClick={() => handleNodeClick(i)}
          >
            {/* Glow */}
            <circle
              cx={node.x}
              cy={node.y}
              r={r * 2.5}
              fill={color}
              opacity={isSelected ? 0.15 : 0.05}
            />
            {/* Pulse ring for selected */}
            {isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r={r + 8}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                opacity={0.4}
              >
                <animate
                  attributeName="r"
                  from={String(r + 4)}
                  to={String(r + 20)}
                  dur="1.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.5"
                  to="0"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {/* Core */}
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={color}
              opacity={0.85}
              stroke={isSelected ? "white" : "transparent"}
              strokeWidth={isSelected ? 2 : 0}
            />
            {/* Label */}
            <text
              x={node.x}
              y={node.y + r + 14}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255,255,255,0.5)"
              fontFamily="monospace"
            >
              {node.id}
            </text>
            {/* Risk badge */}
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize="9"
              fill="white"
              fontWeight="bold"
              fontFamily="monospace"
            >
              {(node.risk * 100).toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <text x="20" y="480" fontSize="9" fill="rgba(255,255,255,0.3)">
        Click a node to investigate • Edge thickness = attention weight
      </text>
    </svg>
  );
}

// ============================================================================
// Main War Room Page
// ============================================================================
export default function WarRoom() {
  const [searchParams] = useSearchParams();
  const urlWalletId   = searchParams.get("walletId");
  const urlRiskScore  = parseFloat(searchParams.get("riskScore") || "0.88");
  const urlPlatform   = searchParams.get("platform") || "unknown";
  const isFromAlert   = !!urlWalletId;

  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [analystBrief, setAnalystBrief] = useState<AnalystBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [sarGenerating, setSarGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"xai" | "fatf" | "brief" | "flow">("xai");
  const autoBriefFired = useRef(false);

  // Auto-select node — if coming from a Live Alert, use that wallet, else default demo node
  useEffect(() => {
    const platformPatterns: Record<string, { type: string; severity: string; description: string; detail: string }[]> = {
      paytm:   [{ type: 'structuring', severity: 'critical', description: 'Sub-threshold split transactions detected across Paytm UPI rail', detail: 'Amounts clustered ₹9,800–₹9,950 — just below ₹10K RBI reporting limit' }],
      phonepe: [{ type: 'fan_out',     severity: 'high',     description: 'Fan-out pattern: single source → multiple PhonePe recipients', detail: 'Recipients: 7 unique wallets within 4-minute window' }],
      gpay:    [{ type: 'pass_through',severity: 'high',     description: 'Pass-through mule: receives and immediately re-sends via GPay', detail: 'Average hold time < 90 seconds before forwarding' }],
      unknown: [{ type: 'high_activity',severity:'high',     description: 'Anomalous transaction velocity detected', detail: 'Burst score 3.2× above peer baseline' }],
    };

    const baseNode: SelectedNode = urlWalletId
      ? {
          id: urlWalletId,
          riskScore: isNaN(urlRiskScore) ? 0.88 : urlRiskScore,
          riskLevel: (isNaN(urlRiskScore) ? 0.88 : urlRiskScore) >= 0.75 ? 'critical' : 'high',
          patterns: [
            ...(platformPatterns[urlPlatform] || platformPatterns.unknown),
            { type: 'threshold_proximity', severity: 'high', description: 'Transaction amounts within 2% of ₹10K reporting threshold', detail: 'FATF TR-08 threshold evasion pattern' },
            { type: 'burst_score',         severity: 'high', description: 'High-velocity burst within 5-minute window', detail: 'Score: 0.87 — 95th percentile of flagged wallets' },
          ],
          featureImportance: [
            { feature_name: 'out_degree',            importance: 0.88, value: 5 },
            { feature_name: 'threshold_proximity',   importance: 0.79, value: 0.98 },
            { feature_name: 'burst_score',           importance: 0.71, value: 0.87 },
            { feature_name: 'fan_out_ratio',         importance: 0.62, value: 0.74 },
            { feature_name: 'total_volume_sent',     importance: 0.51, value: 487500 },
          ],
          graphMetrics: { in_degree: 3, out_degree: 5, total_connections: 8 },
        }
      : {
          id: "0xA1...mule",
          riskScore: 0.92,
          riskLevel: "critical",
          patterns: [
            { type: "pass_through",  severity: "critical", description: "Both receives (4) and sends (3) to multiple wallets (mule wallet pattern)", detail: "Classic smurfing intermediary — receives from multiple sources, redistributes to multiple destinations" },
            { type: "fan_out",       severity: "high",     description: "Sends to 3 different recipients (structuring indicator)",                   detail: "Recipients: 3 unique wallets" },
            { type: "high_activity", severity: "high",     description: "Very high transaction volume (7 total connections)",                       detail: "Unusually high activity compared to typical wallets" },
          ],
          featureImportance: [
            { feature_name: "out_degree",               importance: 0.85, value: 3 },
            { feature_name: "threshold_proximity_ratio", importance: 0.72, value: 0.95 },
            { feature_name: "burst_score",              importance: 0.65, value: 0.78 },
            { feature_name: "fan_out_ratio",            importance: 0.58, value: 0.82 },
            { feature_name: "total_sent",               importance: 0.45, value: 495000 },
          ],
          graphMetrics: { in_degree: 4, out_degree: 3, total_connections: 7 },
        };

    setSelectedNode(baseNode);
  }, [urlWalletId, urlRiskScore, urlPlatform]);

  // Auto-trigger IBM AI Brief when arriving from a live alert (runs once after node is set)
  useEffect(() => {
    if (isFromAlert && selectedNode && !autoBriefFired.current) {
      autoBriefFired.current = true;
      const timer = setTimeout(() => {
        setActiveTab("brief");
        // Kick off brief generation
        setBriefLoading(true);
        setAnalystBrief(null);
        ibmAiApi.generateBrief({
          walletId: selectedNode.id,
          riskScore: selectedNode.riskScore,
          riskLevel: selectedNode.riskLevel,
          patterns: selectedNode.patterns,
          featureImportance: selectedNode.featureImportance,
          graphMetrics: selectedNode.graphMetrics,
        }).then(brief => {
          setAnalystBrief(brief);
        }).catch(err => {
          console.error("Auto-brief failed:", err);
        }).finally(() => {
          setBriefLoading(false);
        });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isFromAlert, selectedNode]);

  // Generate IBM brief when node is selected
  const generateBrief = useCallback(async () => {
    if (!selectedNode) return;

    setBriefLoading(true);
    setAnalystBrief(null);

    try {
      const brief = await ibmAiApi.generateBrief({
        walletId: selectedNode.id,
        riskScore: selectedNode.riskScore,
        riskLevel: selectedNode.riskLevel,
        patterns: selectedNode.patterns,
        featureImportance: selectedNode.featureImportance,
        graphMetrics: selectedNode.graphMetrics,
      });
      setAnalystBrief(brief);
      setActiveTab("brief");
    } catch (err) {
      console.error("Failed to generate brief:", err);
    } finally {
      setBriefLoading(false);
    }
  }, [selectedNode]);

  // ── Generate & download SAR PDF (FEATURE-001) ────────────────────────────
  const handleGenerateSAR = useCallback(async () => {
    if (!selectedNode) return;
    setSarGenerating(true);
    try {
      await generateSARPdf({
        walletId: selectedNode.id,
        riskScore: selectedNode.riskScore,
        riskLevel: selectedNode.riskLevel,
        patterns: selectedNode.patterns,
        featureImportance: selectedNode.featureImportance,
        graphMetrics: selectedNode.graphMetrics,
        analystBrief: analystBrief?.brief || null,
        riskAssessment: analystBrief?.riskAssessment || null,
        regulatoryFlags: analystBrief?.regulatoryFlags || [],
        recommendations: analystBrief?.recommendations || [],
      });
    } catch (err) {
      console.error('SAR PDF generation failed:', err);
    } finally {
      setSarGenerating(false);
    }
  }, [selectedNode, analystBrief]);

  const maxImportance =
    selectedNode?.featureImportance?.[0]?.importance || 1;

  const riskColors: Record<string, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-blue-400",
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* FEATURE-006: Alert Origin Banner — shown when navigating from LiveThreatMap */}
        {isFromAlert && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 animate-pulse-once">
            {/* Step flow */}
            <div className="flex items-center gap-2 text-xs font-mono flex-1">
              <span className="px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-300 font-bold">① LIVE ALERT</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="px-2 py-1 rounded bg-orange-500/20 border border-orange-500/30 text-orange-300 font-bold">② INVESTIGATE</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="px-2 py-1 rounded bg-gray-500/10 border border-white/10 text-gray-400">③ Generate SAR</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Crosshair className="w-3.5 h-3.5 text-orange-400 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-xs text-orange-300">
                Wallet <span className="font-mono font-bold text-white">{urlWalletId?.slice(0, 18)}…</span>
                {" "}flagged via {urlPlatform.charAt(0).toUpperCase() + urlPlatform.slice(1)} · IBM AI Brief auto-loading…
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <Crosshair className="h-7 w-7 text-red-400" />
              War Room
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Deep-dive investigation workspace
            </p>
          </div>
          {selectedNode && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={generateBrief}
                disabled={briefLoading}
              >
                {briefLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                IBM AI Brief
              </Button>
              <Button
                variant="outline"
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                onClick={handleGenerateSAR}
                disabled={sarGenerating}
              >
                {sarGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {sarGenerating ? "Generating..." : "Generate SAR"}
              </Button>
            </div>
          )}
        </div>

        {/* Main Layout: Graph + Right Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: "520px" }}>
          {/* Left: Interactive Graph (60%) */}
          <Card className="lg:col-span-3 bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-purple-400" />
                Suspicious Cluster Graph
                {selectedNode && (
                  <Badge
                    variant="outline"
                    className={`ml-auto text-xs ${
                      selectedNode.riskLevel === "critical"
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : "bg-orange-500/20 text-orange-400 border-orange-500/30"
                    }`}
                  >
                    {selectedNode.id}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[480px] bg-gradient-to-br from-gray-900/30 to-gray-950/50">
                <InvestigationGraph onNodeSelect={setSelectedNode} />
              </div>
            </CardContent>
          </Card>

          {/* Right: XAI Panel (40%) */}
          <Card className="lg:col-span-2 bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden flex flex-col">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: "xai" as const, label: "XAI", icon: BarChart3 },
                  { key: "fatf" as const, label: "FATF", icon: FileWarning },
                  { key: "brief" as const, label: "AI Brief", icon: Brain },
                  { key: "flow" as const, label: "Money Flow", icon: Network },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeTab === tab.key
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    }`}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
              {!selectedNode ? (
                <div className="text-center py-12">
                  <Eye className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">
                    Select a node on the graph to investigate
                  </p>
                </div>
              ) : activeTab === "xai" ? (
                <div className="space-y-5">
                  {/* Risk Score Header */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div>
                      <p className="text-xs text-gray-500">Risk Score</p>
                      <p
                        className={`text-3xl font-bold ${
                          riskColors[selectedNode.riskLevel]
                        }`}
                      >
                        {(selectedNode.riskScore * 100).toFixed(0)}
                        <span className="text-sm font-normal text-gray-500">
                          /100
                        </span>
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`uppercase text-xs ${
                        selectedNode.riskLevel === "critical"
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : selectedNode.riskLevel === "high"
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                      }`}
                    >
                      {selectedNode.riskLevel}
                    </Badge>
                  </div>

                  {/* Graph Metrics */}
                  {selectedNode.graphMetrics && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "In-Degree", value: selectedNode.graphMetrics.in_degree, color: "text-cyan-400" },
                        { label: "Out-Degree", value: selectedNode.graphMetrics.out_degree, color: "text-purple-400" },
                        { label: "Total", value: selectedNode.graphMetrics.total_connections, color: "text-pink-400" },
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="text-center p-2 rounded-lg bg-white/5"
                        >
                          <p className={`text-lg font-bold ${m.color}`}>
                            {m.value}
                          </p>
                          <p className="text-[10px] text-gray-500">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Feature Importance */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Feature Importance
                    </h3>
                    <div className="space-y-3">
                      {selectedNode.featureImportance.map((feat) => (
                        <FeatureBar
                          key={feat.feature_name}
                          name={feat.feature_name}
                          importance={feat.importance}
                          value={feat.value}
                          maxImportance={maxImportance}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Patterns */}
                  {selectedNode.patterns.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Structural Patterns
                      </h3>
                      <div className="space-y-2">
                        {selectedNode.patterns.map((p, i) => (
                          <PatternCard key={i} pattern={p} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : activeTab === "fatf" ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileWarning className="h-4 w-4 text-orange-400" />
                      <span className="text-sm font-semibold text-orange-300">
                        FATF Red Flag Indicators
                      </span>
                    </div>
                    <p className="text-xs text-orange-300/60">
                      Financial Action Task Force regulatory compliance mapping
                    </p>
                  </div>

                  {selectedNode.riskScore >= 0.5 ? (
                    <div className="space-y-3">
                      <FATFFlag flag="FATF Indicator 3.1 — Structuring: Transactions are being split across multiple recipients to avoid reporting thresholds." />
                      <FATFFlag flag="FATF Indicator 5.1 — Use of Intermediaries: This wallet operates as a pass-through, consistent with layering through nominees." />
                      {selectedNode.riskScore >= 0.7 && (
                        <FATFFlag flag="FATF Indicator 4.2 — Layering: Funds pass through multiple intermediary accounts in quick succession." />
                      )}
                      <FATFFlag flag="FATF Indicator 3.3 — Threshold Evasion: Transaction amounts are clustered just below mandatory reporting limits." />

                      <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-300 font-semibold">
                          ⚠️ SAR Filing Recommended
                        </p>
                        <p className="text-xs text-red-300/60 mt-1">
                          Multiple critical FATF indicators detected. Suspicious
                          Activity Report should be filed within 24 hours.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Shield className="h-10 w-10 text-green-500/50 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">
                        No FATF Red Flag Indicators matched for this node.
                      </p>
                    </div>
                  )}
                </div>
              ) : activeTab === "brief" ? (
                <div className="space-y-4">
                  {briefLoading ? (
                    <div className="text-center py-12">
                      <Loader2 className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
                      <p className="text-gray-400 text-sm">
                        Generating analyst brief with IBM watsonx.ai...
                      </p>
                    </div>
                  ) : analystBrief ? (
                    <>
                      {/* Powered by badge */}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Brain className="h-4 w-4 text-blue-400" />
                        <span className="text-xs text-blue-300">
                          Generated by{" "}
                          <strong>{analystBrief.generatedBy}</strong>
                        </span>
                      </div>

                      {/* Summary */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Executive Summary
                        </h4>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {analystBrief.brief}
                        </p>
                      </div>

                      {/* Risk Assessment */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Risk Assessment
                        </h4>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {analystBrief.riskAssessment}
                        </p>
                      </div>

                      {/* Regulatory Flags */}
                      {(analystBrief.regulatoryFlags?.length ?? 0) > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-orange-400/70 uppercase tracking-wider mb-2">
                            Regulatory Flags
                          </h4>
                          <div className="space-y-2">
                            {analystBrief.regulatoryFlags.map((flag, i) => (
                              <FATFFlag key={i} flag={flag} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommendations */}
                      {(analystBrief.recommendations?.length ?? 0) > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-green-400/70 uppercase tracking-wider mb-2">
                            Recommendations
                          </h4>
                          <ul className="space-y-2">
                            {analystBrief.recommendations.map((rec, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-gray-400"
                              >
                                <ChevronRight className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <Brain className="h-10 w-10 text-blue-500/30 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium text-sm mb-2">
                        Click 'IBM AI Brief' above to generate a watsonx.ai analyst report for this wallet.
                      </p>
                      <p className="text-gray-500 text-xs mb-4">
                        The model will synthesize risk factors, structural patterns, and FATF typologies into an executive summary.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        onClick={generateBrief}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Brief
                      </Button>
                    </div>
                  )}
                </div>
              ) : activeTab === "flow" ? (
                <div className="h-full overflow-y-auto">
                  <MoneyFlowSankey />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* IBM Powered Footer */}
        <div className="flex items-center justify-center gap-3 py-2">
          <span className="text-xs text-gray-600">Powered by</span>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-blue-400 font-bold text-xs">IBM</span>
            <span className="text-blue-300/70 text-[10px]">watsonx.ai × Granite</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
