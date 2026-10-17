/**
 * Cross-Platform Money Flow Visualization
 * Shows how funds move across platforms: Paytm → PhonePe → GPay → BTC Wallet
 * Feature-002: Sankey/Flow Diagram for IBM Hackathon
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, AlertTriangle, Zap } from "lucide-react";

interface FlowNode {
  id: string;
  label: string;
  platform: string;
  type: "source" | "intermediate" | "destination" | "crypto";
  amount: number;
  currency: string;
  risk: number;
  txCount: number;
  color: string;
  icon: string;
}

interface FlowEdge {
  from: string;
  to: string;
  amount: number;
  currency: string;
  txCount: number;
  timeGap: string;
  suspicious: boolean;
}

const FLOW_SCENARIOS = [
  {
    name: "Smurfing Chain",
    description: "Classic UPI-to-Crypto layering",
    nodes: [
      { id: "paytm_a", label: "Paytm A", platform: "Paytm UPI", type: "source" as const, amount: 89500, currency: "INR", risk: 0.35, txCount: 12, color: "#3b82f6", icon: "💙" },
      { id: "paytm_b", label: "Paytm B", platform: "Paytm UPI", type: "source" as const, amount: 94200, currency: "INR", risk: 0.41, txCount: 9, color: "#60a5fa", icon: "💙" },
      { id: "paytm_c", label: "Paytm C", platform: "Paytm UPI", type: "source" as const, amount: 76800, currency: "INR", risk: 0.38, txCount: 7, color: "#93c5fd", icon: "💙" },
      { id: "phonepe_b", label: "PhonePe B", platform: "PhonePe", type: "intermediate" as const, amount: 258700, currency: "INR", risk: 0.72, txCount: 28, color: "#a855f7", icon: "💜" },
      { id: "gpay_c", label: "GPay C", platform: "Google Pay", type: "intermediate" as const, amount: 247300, currency: "INR", risk: 0.68, txCount: 22, color: "#22c55e", icon: "💚" },
      { id: "btc_d", label: "BTC Wallet D", platform: "Bitcoin", type: "crypto" as const, amount: 3.42, currency: "BTC", risk: 0.91, txCount: 6, color: "#f97316", icon: "🔶" },
    ],
    edges: [
      { from: "paytm_a", to: "phonepe_b", amount: 89500, currency: "INR", txCount: 12, timeGap: "< 2min", suspicious: false },
      { from: "paytm_b", to: "phonepe_b", amount: 94200, currency: "INR", txCount: 9, timeGap: "< 5min", suspicious: false },
      { from: "paytm_c", to: "phonepe_b", amount: 76800, currency: "INR", txCount: 7, timeGap: "< 3min", suspicious: false },
      { from: "phonepe_b", to: "gpay_c", amount: 247300, currency: "INR", txCount: 22, timeGap: "8min", suspicious: true },
      { from: "gpay_c", to: "btc_d", amount: 3.42, currency: "BTC", txCount: 6, timeGap: "14min", suspicious: true },
    ],
  },
  {
    name: "Fan-Out Pattern",
    description: "Single aggregator → multiple destinations",
    nodes: [
      { id: "mule_w", label: "Mule Wallet", platform: "Multi-UPI", type: "source" as const, amount: 495000, currency: "INR", risk: 0.93, txCount: 34, color: "#ef4444", icon: "⚠️" },
      { id: "gpay_x", label: "GPay X", platform: "Google Pay", type: "intermediate" as const, amount: 162000, currency: "INR", risk: 0.61, txCount: 11, color: "#22c55e", icon: "💚" },
      { id: "phonepe_y", label: "PhonePe Y", platform: "PhonePe", type: "intermediate" as const, amount: 178000, currency: "INR", risk: 0.58, txCount: 13, color: "#a855f7", icon: "💜" },
      { id: "paytm_z", label: "Paytm Z", platform: "Paytm", type: "intermediate" as const, amount: 155000, currency: "INR", risk: 0.55, txCount: 10, color: "#3b82f6", icon: "💙" },
      { id: "btc_1", label: "BTC 0x4a…", platform: "Bitcoin", type: "crypto" as const, amount: 1.98, currency: "BTC", risk: 0.88, txCount: 4, color: "#f97316", icon: "🔶" },
      { id: "btc_2", label: "BTC 0x7f…", platform: "Bitcoin", type: "crypto" as const, amount: 2.14, currency: "BTC", risk: 0.85, txCount: 3, color: "#fb923c", icon: "🔶" },
    ],
    edges: [
      { from: "mule_w", to: "gpay_x", amount: 162000, currency: "INR", txCount: 11, timeGap: "< 1min", suspicious: true },
      { from: "mule_w", to: "phonepe_y", amount: 178000, currency: "INR", txCount: 13, timeGap: "< 1min", suspicious: true },
      { from: "mule_w", to: "paytm_z", amount: 155000, currency: "INR", txCount: 10, timeGap: "< 1min", suspicious: true },
      { from: "gpay_x", to: "btc_1", amount: 1.98, currency: "BTC", txCount: 4, timeGap: "23min", suspicious: true },
      { from: "phonepe_y", to: "btc_2", amount: 2.14, currency: "BTC", txCount: 3, timeGap: "31min", suspicious: true },
    ],
  },
];

function formatAmount(amount: number, currency: string): string {
  if (currency === "BTC") return `₿${amount.toFixed(3)}`;
  if (currency === "INR") {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${amount}`;
}

function RiskBadge({ risk }: { risk: number }) {
  const pct = Math.round(risk * 100);
  const color = risk >= 0.7 ? "bg-red-500/20 text-red-400 border-red-500/30"
    : risk >= 0.5 ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${color}`}>
      {pct}%
    </Badge>
  );
}

// SVG-based flow diagram (no extra deps, pure SVG)
function FlowDiagram({ nodes, edges }: { nodes: FlowNode[]; edges: FlowEdge[] }) {
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Layout: group nodes by type into columns
  const columns: Record<string, FlowNode[]> = {
    col0: nodes.filter((n) => n.type === "source"),
    col1: nodes.filter((n) => n.type === "intermediate"),
    col2: nodes.filter((n) => n.type === "crypto" || n.type === "destination"),
  };

  const COL_X = [80, 310, 560];
  const SVG_H = Math.max(320, Math.max(...Object.values(columns).map((c) => c.length)) * 100 + 60);

  // Assign positions
  const nodePos: Record<string, { x: number; y: number }> = {};
  Object.entries(columns).forEach(([col, colNodes], ci) => {
    const spacing = SVG_H / (colNodes.length + 1);
    colNodes.forEach((node, ni) => {
      nodePos[node.id] = { x: COL_X[ci], y: spacing * (ni + 1) };
    });
  });

  const maxFlow = Math.max(...edges.map((e) => (e.currency === "BTC" ? e.amount * 100000 : e.amount)));

  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 660 ${SVG_H}`}
        className="w-full"
        style={{ minHeight: 280, background: "transparent" }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(139,92,246,0.7)" />
          </marker>
          <marker id="arrowhead-red" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(239,68,68,0.9)" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.4)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0.6)" />
          </linearGradient>
          <linearGradient id="edgeGradSafe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.3)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0.4)" />
          </linearGradient>
        </defs>

        {/* Column labels */}
        {["Sources", "Intermediaries", "Destinations"].map((label, ci) => (
          <text key={ci} x={COL_X[ci]} y={16} textAnchor="middle" fontSize="9" fill="rgba(156,163,175,0.6)" fontFamily="monospace">
            {label}
          </text>
        ))}

        {/* Edges */}
        {edges.map((edge, ei) => {
          const from = nodePos[edge.from];
          const to = nodePos[edge.to];
          if (!from || !to) return null;

          const thickness = Math.max(2, Math.min(12, ((edge.currency === "BTC" ? edge.amount * 100000 : edge.amount) / maxFlow) * 12));
          const mx = (from.x + to.x) / 2;
          const path = `M ${from.x + 30} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x - 30} ${to.y}`;
          const isHov = hoveredEdge === ei;

          return (
            <g key={ei} onMouseEnter={() => setHoveredEdge(ei)} onMouseLeave={() => setHoveredEdge(null)} style={{ cursor: "pointer" }}>
              {/* Glow behind */}
              {isHov && (
                <path d={path} fill="none" stroke={edge.suspicious ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.2)"}
                  strokeWidth={thickness + 8} strokeLinecap="round" />
              )}
              <path
                d={path}
                fill="none"
                stroke={edge.suspicious ? "url(#edgeGrad)" : "url(#edgeGradSafe)"}
                strokeWidth={isHov ? thickness + 2 : thickness}
                strokeLinecap="round"
                markerEnd={edge.suspicious ? "url(#arrowhead-red)" : "url(#arrowhead)"}
                style={{ transition: "stroke-width 0.2s" }}
              />

              {/* Flow label */}
              <text
                x={mx}
                y={(from.y + to.y) / 2 - 6}
                textAnchor="middle"
                fontSize="8"
                fill={edge.suspicious ? "rgba(249,115,22,0.9)" : "rgba(139,92,246,0.8)"}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {formatAmount(edge.amount, edge.currency)}
              </text>
              {isHov && (
                <text x={mx} y={(from.y + to.y) / 2 + 6} textAnchor="middle" fontSize="7" fill="rgba(156,163,175,0.7)" fontFamily="monospace">
                  {edge.txCount} txns · {edge.timeGap}
                </text>
              )}
              {edge.suspicious && (
                <circle cx={mx} cy={(from.y + to.y) / 2 - 16} r={5} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.6)" strokeWidth={1} />
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePos[node.id];
          if (!pos) return null;
          const isHov = hoveredNode === node.id;
          const nodeColor = node.color;
          const riskPct = Math.round(node.risk * 100);

          return (
            <g key={node.id} onMouseEnter={() => setHoveredNode(node.id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
              {/* Glow */}
              {node.risk >= 0.7 && (
                <rect x={pos.x - 34} y={pos.y - 22} width={68} height={44} rx={8} fill={nodeColor} opacity={0.08} filter="url(#glow)" />
              )}
              {/* Card bg */}
              <rect
                x={pos.x - 32} y={pos.y - 20} width={64} height={40} rx={8}
                fill={isHov ? "rgba(30,35,60,0.95)" : "rgba(20,25,50,0.9)"}
                stroke={nodeColor}
                strokeWidth={isHov ? 1.5 : 0.8}
                style={{ transition: "all 0.2s" }}
              />
              {/* Risk indicator stripe */}
              <rect x={pos.x - 32} y={pos.y - 20} width={4} height={40} rx={2}
                fill={node.risk >= 0.7 ? "#ef4444" : node.risk >= 0.5 ? "#f97316" : "#eab308"} />

              {/* Icon + label */}
              <text x={pos.x - 16} y={pos.y - 6} fontSize="12" textAnchor="middle">{node.icon}</text>
              <text x={pos.x + 6} y={pos.y - 7} fontSize="7.5" fontWeight="bold" fill="white" fontFamily="sans-serif">{node.label}</text>
              <text x={pos.x + 6} y={pos.y + 1} fontSize="6.5" fill="rgba(156,163,175,0.7)" fontFamily="monospace">{node.platform}</text>
              <text x={pos.x + 6} y={pos.y + 9} fontSize="7" fontWeight="bold" fill={nodeColor} fontFamily="monospace">
                {formatAmount(node.amount, node.currency)}
              </text>

              {/* Risk badge */}
              <rect x={pos.x + 14} y={pos.y + 12} width={18} height={9} rx={3}
                fill={node.risk >= 0.7 ? "rgba(239,68,68,0.2)" : node.risk >= 0.5 ? "rgba(249,115,22,0.2)" : "rgba(234,179,8,0.2)"} />
              <text x={pos.x + 23} y={pos.y + 19} fontSize="6" textAnchor="middle"
                fill={node.risk >= 0.7 ? "#f87171" : node.risk >= 0.5 ? "#fb923c" : "#fbbf24"} fontFamily="monospace">
                {riskPct}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function MoneyFlowSankey() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = FLOW_SCENARIOS[scenarioIdx];

  const totalFlow = scenario.edges.reduce((acc, e) => {
    if (e.currency === "INR") return acc + e.amount;
    return acc;
  }, 0);
  const suspiciousEdges = scenario.edges.filter((e) => e.suspicious).length;
  const maxRisk = Math.max(...scenario.nodes.map((n) => n.risk));

  return (
    <Card className="bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              Cross-Platform Money Flow
              <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20 ml-1">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                LIVE TRACE
              </Badge>
            </CardTitle>
            <p className="text-gray-400 text-xs mt-0.5">
              Tracking funds across UPI networks → crypto infrastructure
            </p>
          </div>

          {/* Scenario switcher */}
          <div className="flex gap-1.5">
            {FLOW_SCENARIOS.map((s, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => setScenarioIdx(i)}
                className={`text-xs px-2.5 py-1 h-auto ${
                  i === scenarioIdx
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                    : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: "Total Flow", value: `₹${(totalFlow / 100000).toFixed(1)}L`, color: "text-cyan-400" },
            { label: "Platforms", value: `${new Set(scenario.nodes.map((n) => n.platform)).size}`, color: "text-purple-400" },
            { label: "Suspicious Edges", value: `${suspiciousEdges}/${scenario.edges.length}`, color: "text-red-400" },
            { label: "Peak Risk", value: `${Math.round(maxRisk * 100)}%`, color: "text-orange-400" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-2 rounded-lg bg-white/5">
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Scenario description */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/20 mt-2">
          <Zap className="h-3.5 w-3.5 text-orange-400 shrink-0" />
          <p className="text-xs text-orange-300/80">
            <strong className="text-orange-400">{scenario.name}:</strong> {scenario.description} — funds traced through {scenario.nodes.length} wallets across {new Set(scenario.nodes.map((n) => n.platform)).size} platforms
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Legend */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="text-[10px] text-gray-500">Legend:</span>
          {[
            { label: "Safe flow", color: "bg-purple-500/50" },
            { label: "Suspicious flow", color: "bg-gradient-to-r from-purple-500/50 to-red-500/50" },
            { label: "High risk node", color: "bg-red-500/60" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-6 h-1.5 rounded-full ${item.color}`} />
              <span className="text-[10px] text-gray-400">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/60 flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-red-500" />
            </div>
            <span className="text-[10px] text-gray-400">Suspicious indicator</span>
          </div>
        </div>

        <FlowDiagram nodes={scenario.nodes} edges={scenario.edges} />

        {/* Node detail table */}
        <div className="mt-4 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Wallet Details</p>
          {scenario.nodes.map((node) => (
            <div key={node.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <span className="text-sm">{node.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-white font-medium">{node.label}</span>
                <span className="text-[10px] text-gray-500 ml-1.5">{node.platform}</span>
              </div>
              <span className="text-xs font-mono text-gray-300">{formatAmount(node.amount, node.currency)}</span>
              <span className="text-[10px] text-gray-500">{node.txCount} txns</span>
              <RiskBadge risk={node.risk} />
            </div>
          ))}
        </div>

        {/* Edge detail table */}
        <div className="mt-4 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Transaction Flows
          </p>
          {scenario.edges.map((edge, i) => {
            const fromNode = scenario.nodes.find((n) => n.id === edge.from);
            const toNode = scenario.nodes.find((n) => n.id === edge.to);
            return (
              <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${edge.suspicious ? "bg-red-500/5 border border-red-500/10" : "hover:bg-white/3"}`}>
                <span className="text-[10px] text-gray-300 font-medium min-w-0 flex-1 truncate">
                  {fromNode?.label} <ArrowRight className="inline h-2.5 w-2.5 text-gray-500" /> {toNode?.label}
                </span>
                <span className="text-xs font-mono text-purple-300">{formatAmount(edge.amount, edge.currency)}</span>
                <span className="text-[10px] text-gray-500">{edge.txCount} txns</span>
                <span className="text-[10px] text-gray-600">{edge.timeGap}</span>
                {edge.suspicious && (
                  <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20 px-1">⚠ Sus</Badge>
                )}
              </div>
            );
          })}
        </div>

        {/* IBM attribution */}
        <div className="mt-4 flex items-center gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
          <span className="text-blue-400 font-bold text-xs">IBM</span>
          <span className="text-[10px] text-blue-300/60">watsonx.ai cross-platform flow analysis — pattern matches FATF TR-05 Structuring typology</span>
        </div>
      </CardContent>
    </Card>
  );
}
