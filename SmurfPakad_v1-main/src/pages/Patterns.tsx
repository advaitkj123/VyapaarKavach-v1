import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, ArrowRightLeft, GitMerge, Repeat, TrendingDown, AlertTriangle } from "lucide-react";

const patterns = [
  {
    id: 1,
    name: "Fan-Out Pattern",
    icon: GitBranch,
    description: "Large sum split into many small transactions across multiple wallets",
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    borderColor: "border-red-200 dark:border-red-800",
    riskLevel: "Critical",
    example: "1 wallet → 50+ wallets (each receiving small amounts)",
    indicators: [
      "Single source wallet with multiple outgoing transactions",
      "Similar transaction amounts",
      "Short time window (minutes to hours)",
      "Previously inactive wallets as recipients"
    ],
    detection: "Graph centrality analysis + out-degree distribution",
    svg: (
      <svg viewBox="0 0 200 120" className="w-full h-32">
        <circle cx="30" cy="60" r="15" fill="#ef4444" />
        <text x="30" y="65" textAnchor="middle" fill="white" fontSize="10">Source</text>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1="45" y1="60" x2="150" y2={20 + i * 20} stroke="#94a3b8" strokeWidth="2" />
            <circle cx="160" cy={20 + i * 20} r="10" fill="#64748b" />
          </g>
        ))}
      </svg>
    )
  },
  {
    id: 2,
    name: "Fan-In Pattern",
    icon: GitMerge,
    description: "Multiple wallets consolidate funds into a single destination",
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    borderColor: "border-orange-200 dark:border-orange-800",
    riskLevel: "High",
    example: "50+ wallets → 1 wallet (aggregating funds)",
    indicators: [
      "Multiple source wallets",
      "Single destination wallet",
      "Coordinated timing",
      "Similar transaction amounts from each source"
    ],
    detection: "In-degree analysis + temporal clustering",
    svg: (
      <svg viewBox="0 0 200 120" className="w-full h-32">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <circle cx="40" cy={20 + i * 20} r="10" fill="#64748b" />
            <line x1="50" y1={20 + i * 20} x2="155" y2="60" stroke="#94a3b8" strokeWidth="2" />
          </g>
        ))}
        <circle cx="170" cy="60" r="15" fill="#f97316" />
        <text x="170" y="65" textAnchor="middle" fill="white" fontSize="10">Dest</text>
      </svg>
    )
  },
  {
    id: 3,
    name: "Cyclic Pattern",
    icon: Repeat,
    description: "Funds move in a circular path through multiple wallets",
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-800",
    riskLevel: "High",
    example: "A → B → C → D → E → F → A",
    indicators: [
      "Circular transaction path",
      "Returns to original wallet",
      "Multiple intermediate hops",
      "Gradual amount changes (to hide trail)"
    ],
    detection: "Cycle detection algorithms + path analysis",
    svg: (
      <svg viewBox="0 0 200 120" className="w-full h-32">
        {['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) => {
          const angle = (i * 60 - 90) * Math.PI / 180;
          const x = 100 + 60 * Math.cos(angle);
          const y = 60 + 40 * Math.sin(angle);
          const nextAngle = ((i + 1) * 60 - 90) * Math.PI / 180;
          const nextX = 100 + 60 * Math.cos(nextAngle);
          const nextY = 60 + 40 * Math.sin(nextAngle);
          return (
            <g key={i}>
              <line x1={x} y1={y} x2={nextX} y2={nextY} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" />
              <circle cx={x} cy={y} r="12" fill="#a855f7" />
              <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize="10">{label}</text>
            </g>
          );
        })}
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>
      </svg>
    )
  },
  {
    id: 4,
    name: "Gather-Scatter Pattern",
    icon: ArrowRightLeft,
    description: "Many → Few → Many (funds collected then redistributed)",
    color: "text-yellow-500",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    riskLevel: "Medium",
    example: "Many wallets → 2-3 hubs → Many new wallets",
    indicators: [
      "Fan-in followed by fan-out",
      "Hub wallets in the middle",
      "Different source and destination sets",
      "Timing correlation"
    ],
    detection: "Subgraph pattern matching + temporal analysis",
    svg: (
      <svg viewBox="0 0 200 120" className="w-full h-32">
        {[0, 1, 2].map((i) => (
          <g key={`left-${i}`}>
            <circle cx="20" cy={30 + i * 20} r="8" fill="#64748b" />
            <line x1="28" y1={30 + i * 20} x2="85" y2="60" stroke="#94a3b8" strokeWidth="1.5" />
          </g>
        ))}
        <circle cx="100" cy="60" r="12" fill="#eab308" />
        {[0, 1, 2].map((i) => (
          <g key={`right-${i}`}>
            <line x1="112" y1="60" x2="172" y2={30 + i * 20} stroke="#94a3b8" strokeWidth="1.5" />
            <circle cx="180" cy={30 + i * 20} r="8" fill="#64748b" />
          </g>
        ))}
      </svg>
    )
  },
  {
    id: 5,
    name: "Peeling Chain",
    icon: TrendingDown,
    description: "Sequential transactions with decreasing amounts (obfuscation technique)",
    color: "text-pink-500",
    bgColor: "bg-pink-50 dark:bg-pink-900/20",
    borderColor: "border-pink-200 dark:border-pink-800",
    riskLevel: "Critical",
    example: "100 → 95 → 90 → 85 → 80 (gradually 'peeling off' amounts)",
    indicators: [
      "Linear transaction chain",
      "Decreasing amounts at each hop",
      "Time delays between hops",
      "Gas fees deducted at each step",
      "Eventually reaches 'clean' destination"
    ],
    detection: "Sequential pattern analysis + amount decay detection",
    svg: (
      <svg viewBox="0 0 200 120" className="w-full h-32">
        {[100, 85, 70, 55, 40].map((amount, i) => {
          const x = 20 + i * 40;
          const radius = 8 + amount / 20;
          return (
            <g key={i}>
              <circle cx={x} cy="60" r={radius} fill="#ec4899" opacity={1 - i * 0.15} />
              <text x={x} y="95" textAnchor="middle" fontSize="10" fill="#64748b">{amount}</text>
              {i < 4 && (
                <line x1={x + radius} y1="60" x2={20 + (i + 1) * 40 - (8 + (amount - 15) / 20)} y2="60" 
                      stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrow)" />
              )}
            </g>
          );
        })}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>
      </svg>
    )
  },
  {
    id: 6,
    name: "Layering Pattern",
    icon: AlertTriangle,
    description: "Complex multi-hop transactions to obscure origin",
    color: "text-indigo-500",
    bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
    borderColor: "border-indigo-200 dark:border-indigo-800",
    riskLevel: "High",
    example: "Multiple hops through various intermediaries",
    indicators: [
      "High number of hops (5+)",
      "Mix of different wallet types",
      "Cross-exchange transfers",
      "Varying amounts",
      "Time gaps between transactions"
    ],
    detection: "Path length analysis + graph complexity metrics",
    svg: (
      <svg viewBox="0 0 200 120" className="w-full h-32">
        <circle cx="20" cy="60" r="12" fill="#6366f1" />
        <line x1="32" y1="60" x2="60" y2="30" stroke="#94a3b8" strokeWidth="2" />
        <circle cx="70" cy="30" r="10" fill="#64748b" />
        <line x1="80" y1="30" x2="110" y2="60" stroke="#94a3b8" strokeWidth="2" />
        <circle cx="120" cy="60" r="10" fill="#64748b" />
        <line x1="130" y1="60" x2="160" y2="90" stroke="#94a3b8" strokeWidth="2" />
        <circle cx="170" cy="90" r="10" fill="#64748b" />
        <line x1="32" y1="60" x2="60" y2="90" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,3" />
        <circle cx="70" cy="90" r="8" fill="#94a3b8" opacity="0.5" />
        <line x1="78" y1="90" x2="162" y2="90" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,3" />
      </svg>
    )
  }
];

export default function Patterns() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Money Laundering Patterns</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Common Smurfing and layering techniques detected by our GNN model
          </p>
        </div>

        {/* Pattern Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {patterns.map((pattern) => (
            <Card 
              key={pattern.id} 
              className={`${pattern.bgColor} ${pattern.borderColor} border-2 hover:shadow-xl transition-all duration-300`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-3 rounded-lg ${pattern.bgColor}`}>
                      <pattern.icon className={`h-6 w-6 ${pattern.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-gray-900 dark:text-white">
                        {pattern.name}
                      </CardTitle>
                      <Badge 
                        className={`mt-1 ${
                          pattern.riskLevel === 'Critical' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' 
                            : pattern.riskLevel === 'High'
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200'
                        }`}
                      >
                        {pattern.riskLevel} Risk
                      </Badge>
                    </div>
                  </div>
                </div>
                <CardDescription className="mt-3 text-gray-700 dark:text-gray-300">
                  {pattern.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Visual Pattern */}
                <div className="bg-white dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  {pattern.svg}
                </div>

                {/* Example */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Example:
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-800/50 p-2 rounded border border-gray-200 dark:border-gray-700">
                    {pattern.example}
                  </p>
                </div>

                {/* Detection Method */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Detection Method:
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800/50 p-2 rounded border border-gray-200 dark:border-gray-700">
                    {pattern.detection}
                  </p>
                </div>

                {/* Indicators */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Key Indicators:
                  </h4>
                  <ul className="space-y-1">
                    {pattern.indicators.map((indicator, idx) => (
                      <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start space-x-2">
                        <span className={`${pattern.color} mt-1`}>•</span>
                        <span>{indicator}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Technical Overview */}
        <Card className="bg-gradient-to-br from-crypto-purple/10 to-pink-600/10 dark:from-crypto-purple/20 dark:to-pink-600/20 border-crypto-purple/30">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">How Our GNN Detects These Patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1. Graph Construction</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Build transaction graph from blockchain data with wallets as nodes and transactions as edges
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">2. Feature Extraction</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Extract node features (centrality, degree) and edge features (amount, timing)
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">3. GNN Classification</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Apply Graph Neural Network to classify patterns and compute suspicion scores
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
