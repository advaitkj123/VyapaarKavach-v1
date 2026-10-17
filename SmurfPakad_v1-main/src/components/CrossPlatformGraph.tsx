/**
 * Cross-Platform Silo Visualization
 * ===================================
 * Visualizes money flowing across multiple payment platforms
 * (Paytm → PhonePe → GPay) to demonstrate how traditional
 * rule-based systems miss cross-silo laundering patterns.
 * 
 * This is the "innovation story" for hackathon judges:
 * "Banks see one silo. SmurfPakad sees the whole picture."
 */
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Zap } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface PlatformNode {
  id: string;
  platform: "paytm" | "phonepe" | "gpay";
  label: string;
  x: number;
  y: number;
  risk: number;
}

interface PlatformEdge {
  from: number;
  to: number;
  amount: number;
  isCrossPlatform: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const PLATFORM_COLORS = {
  paytm: { bg: "#002970", border: "#0044b3", text: "#4da6ff", glow: "rgba(0,68,179,0.3)" },
  phonepe: { bg: "#3d0066", border: "#6600aa", text: "#cc66ff", glow: "rgba(102,0,170,0.3)" },
  gpay: { bg: "#004d1a", border: "#008030", text: "#66ff99", glow: "rgba(0,128,48,0.3)" },
};

const PLATFORM_LABELS = {
  paytm: "Paytm",
  phonepe: "PhonePe",
  gpay: "Google Pay",
};

// ============================================================================
// Demo data: A smurfing attack across three platforms
// ============================================================================

const DEMO_NODES: PlatformNode[] = [
  // Paytm cluster (source)
  { id: "PTM-001", platform: "paytm", label: "Sender A", x: 100, y: 120, risk: 0.35 },
  { id: "PTM-002", platform: "paytm", label: "Sender B", x: 80, y: 220, risk: 0.28 },
  { id: "PTM-003", platform: "paytm", label: "Sender C", x: 120, y: 320, risk: 0.42 },
  { id: "PTM-HUB", platform: "paytm", label: "Mule Hub 1", x: 250, y: 220, risk: 0.88 },
  
  // PhonePe cluster (intermediary)
  { id: "PPE-001", platform: "phonepe", label: "Transit 1", x: 420, y: 140, risk: 0.72 },
  { id: "PPE-002", platform: "phonepe", label: "Transit 2", x: 440, y: 260, risk: 0.68 },
  { id: "PPE-003", platform: "phonepe", label: "Transit 3", x: 410, y: 360, risk: 0.65 },
  
  // GPay cluster (destination)
  { id: "GPY-001", platform: "gpay", label: "Collector 1", x: 600, y: 180, risk: 0.78 },
  { id: "GPY-002", platform: "gpay", label: "Collector 2", x: 620, y: 300, risk: 0.82 },
  { id: "GPY-HUB", platform: "gpay", label: "Final Sink", x: 740, y: 240, risk: 0.95 },
];

const DEMO_EDGES: PlatformEdge[] = [
  // Within Paytm (these are visible to Paytm)
  { from: 0, to: 3, amount: 99000, isCrossPlatform: false },
  { from: 1, to: 3, amount: 98500, isCrossPlatform: false },
  { from: 2, to: 3, amount: 99900, isCrossPlatform: false },
  
  // Paytm → PhonePe (INVISIBLE to single-platform monitors!)
  { from: 3, to: 4, amount: 97000, isCrossPlatform: true },
  { from: 3, to: 5, amount: 95000, isCrossPlatform: true },
  { from: 3, to: 6, amount: 99500, isCrossPlatform: true },
  
  // PhonePe → GPay (INVISIBLE to single-platform monitors!)
  { from: 4, to: 7, amount: 96000, isCrossPlatform: true },
  { from: 5, to: 8, amount: 94000, isCrossPlatform: true },
  { from: 6, to: 8, amount: 98000, isCrossPlatform: true },
  
  // Within GPay (these are visible to GPay)
  { from: 7, to: 9, amount: 95500, isCrossPlatform: false },
  { from: 8, to: 9, amount: 192000, isCrossPlatform: false },
];

// ============================================================================
// Main Component
// ============================================================================

export default function CrossPlatformGraph() {
  const [showCrossLinks, setShowCrossLinks] = useState(true);
  const [highlightedPlatform, setHighlightedPlatform] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState(0);

  // Animate cross-platform edges flowing
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimPhase((p) => (p + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const getNodeColor = (node: PlatformNode, dimmed: boolean) => {
    const colors = PLATFORM_COLORS[node.platform];
    if (dimmed) return "rgba(255,255,255,0.1)";
    if (node.risk >= 0.8) return "#ef4444";
    if (node.risk >= 0.6) return "#f97316";
    return colors.text;
  };

  const isNodeDimmed = (node: PlatformNode) => {
    return highlightedPlatform !== null && node.platform !== highlightedPlatform;
  };

  return (
    <Card className="bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-yellow-400" />
              Cross-Platform Silo Analysis
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Traditional systems see individual silos. SmurfPakad connects them all.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCrossLinks(!showCrossLinks)}
            className={`text-xs ${
              showCrossLinks
                ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                : "border-red-500/30 text-red-400 bg-red-500/10"
            }`}
          >
            {showCrossLinks ? (
              <>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                SmurfPakad View
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                Traditional View
              </>
            )}
          </Button>
        </div>

        {/* Platform legend / filter */}
        <div className="flex items-center gap-2 mt-3">
          {(["paytm", "phonepe", "gpay"] as const).map((p) => (
            <button
              key={p}
              onClick={() =>
                setHighlightedPlatform(highlightedPlatform === p ? null : p)
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                highlightedPlatform === p
                  ? `bg-opacity-30 border-opacity-60`
                  : highlightedPlatform
                  ? "opacity-40 border-white/5"
                  : "border-white/10"
              }`}
              style={{
                backgroundColor:
                  highlightedPlatform === p || !highlightedPlatform
                    ? PLATFORM_COLORS[p].glow
                    : "transparent",
                borderColor:
                  highlightedPlatform === p
                    ? PLATFORM_COLORS[p].border
                    : undefined,
                color: PLATFORM_COLORS[p].text,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: PLATFORM_COLORS[p].text }}
              />
              {PLATFORM_LABELS[p]}
            </button>
          ))}
          {highlightedPlatform && (
            <button
              onClick={() => setHighlightedPlatform(null)}
              className="text-[10px] text-gray-500 hover:text-gray-300 ml-1"
            >
              (clear)
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative h-[440px] bg-gradient-to-br from-gray-900/30 to-gray-950/60">
          <svg viewBox="0 0 850 460" className="w-full h-full">
            {/* Platform background zones */}
            {[
              { platform: "paytm" as const, x: 30, label: "Paytm Silo" },
              { platform: "phonepe" as const, x: 340, label: "PhonePe Silo" },
              { platform: "gpay" as const, x: 550, label: "GPay Silo" },
            ].map((zone) => {
              const colors = PLATFORM_COLORS[zone.platform];
              const dimmed =
                highlightedPlatform !== null &&
                highlightedPlatform !== zone.platform;
              return (
                <g key={zone.platform}>
                  <rect
                    x={zone.x}
                    y={60}
                    width={zone.platform === "gpay" ? 260 : 260}
                    height={350}
                    rx={16}
                    fill={dimmed ? "rgba(255,255,255,0.02)" : colors.glow}
                    stroke={dimmed ? "rgba(255,255,255,0.03)" : colors.border}
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    opacity={dimmed ? 0.3 : 0.4}
                  />
                  <text
                    x={zone.x + (zone.platform === "gpay" ? 130 : 130)}
                    y={52}
                    textAnchor="middle"
                    fontSize="11"
                    fill={dimmed ? "rgba(255,255,255,0.1)" : colors.text}
                    fontWeight="600"
                    opacity={dimmed ? 0.3 : 0.7}
                  >
                    {zone.label}
                  </text>
                  {!showCrossLinks && !dimmed && (
                    <text
                      x={zone.x + 130}
                      y={430}
                      textAnchor="middle"
                      fontSize="9"
                      fill="rgba(239,68,68,0.6)"
                    >
                      ⚠ Only sees internal transactions
                    </text>
                  )}
                </g>
              );
            })}

            {/* Edges */}
            {DEMO_EDGES.map((edge, i) => {
              const from = DEMO_NODES[edge.from];
              const to = DEMO_NODES[edge.to];
              const isCross = edge.isCrossPlatform;
              const isHidden = isCross && !showCrossLinks;
              const isDimmed =
                highlightedPlatform !== null &&
                from.platform !== highlightedPlatform &&
                to.platform !== highlightedPlatform;

              if (isHidden) return null;

              // Animated dash offset for cross-platform edges
              const dashOffset = isCross ? -animPhase * 2 : 0;

              return (
                <g key={`edge-${i}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={
                      isDimmed
                        ? "rgba(255,255,255,0.03)"
                        : isCross
                        ? "rgba(239,68,68,0.5)"
                        : "rgba(255,255,255,0.12)"
                    }
                    strokeWidth={isCross ? 2.5 : 1.5}
                    strokeDasharray={isCross ? "8 4" : ""}
                    strokeDashoffset={dashOffset}
                  />
                  {/* Amount label on cross-platform edges */}
                  {isCross && !isDimmed && (
                    <text
                      x={(from.x + to.x) / 2}
                      y={(from.y + to.y) / 2 - 8}
                      textAnchor="middle"
                      fontSize="8"
                      fill="rgba(239,68,68,0.7)"
                      fontFamily="monospace"
                    >
                      ₹{(edge.amount / 1000).toFixed(0)}K
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {DEMO_NODES.map((node, i) => {
              const dimmed = isNodeDimmed(node);
              const color = getNodeColor(node, dimmed);
              const r = node.risk >= 0.8 ? 14 : node.risk >= 0.6 ? 12 : 10;

              return (
                <g key={node.id}>
                  {/* Glow */}
                  {!dimmed && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r * 2.5}
                      fill={color}
                      opacity={0.08}
                    />
                  )}
                  {/* Core */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={color}
                    opacity={dimmed ? 0.15 : 0.85}
                  />
                  {/* Risk score */}
                  {!dimmed && (
                    <text
                      x={node.x}
                      y={node.y + 3.5}
                      textAnchor="middle"
                      fontSize="8"
                      fill="white"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {(node.risk * 100).toFixed(0)}
                    </text>
                  )}
                  {/* Label */}
                  <text
                    x={node.x}
                    y={node.y + r + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill={dimmed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}

            {/* "Invisible to traditional" annotation */}
            {!showCrossLinks && (
              <g>
                <rect
                  x={270}
                  y={190}
                  width={210}
                  height={60}
                  rx={8}
                  fill="rgba(239,68,68,0.1)"
                  stroke="rgba(239,68,68,0.3)"
                  strokeWidth={1}
                />
                <text
                  x={375}
                  y={215}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#ef4444"
                  fontWeight="bold"
                >
                  🚫 BLIND SPOT
                </text>
                <text
                  x={375}
                  y={235}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(239,68,68,0.7)"
                >
                  Cross-platform links invisible
                </text>
              </g>
            )}
          </svg>

          {/* Bottom insight */}
          <div
            className={`absolute bottom-3 left-3 right-3 p-3 rounded-lg backdrop-blur-md border transition-all duration-500 ${
              showCrossLinks
                ? "bg-purple-500/10 border-purple-500/20"
                : "bg-red-500/10 border-red-500/20"
            }`}
          >
            {showCrossLinks ? (
              <p className="text-xs text-purple-300">
                <strong className="text-purple-200">SmurfPakad's Graph View:</strong>{" "}
                Cross-platform edges (red dashed lines) reveal the complete laundering chain.
                ₹{(DEMO_EDGES.filter((e) => e.isCrossPlatform).reduce((s, e) => s + e.amount, 0) / 100000).toFixed(1)} Lakh
                moved across platform boundaries undetected by traditional systems.
              </p>
            ) : (
              <p className="text-xs text-red-300">
                <strong className="text-red-200">Traditional Silo View:</strong>{" "}
                Each platform only sees its internal transactions. The cross-platform
                smurfing chain is completely invisible — no single provider has the full picture.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
