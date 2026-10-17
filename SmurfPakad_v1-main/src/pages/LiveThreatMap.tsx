import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  ShieldAlert,
  Activity,
  Zap,
  Globe,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Radio,
  TrendingUp,
  Eye,
  Target,
  Play,
  Zap as ZapIcon,
} from "lucide-react";
import { safeguardApi, type SafeguardAlert } from "@/lib/api";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import SmurfingAttackDemo from "@/components/SmurfingAttackDemo";

// ============================================================================
// Animated Counter Component
// ============================================================================
function AnimatedCounter({ value, prefix = "", suffix = "", duration = 1200 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const end = value;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        ref.current = end;
      }
    }

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

// ============================================================================
// Pulse Dot (Live indicator)
// ============================================================================
function PulseDot({ color = "green" }: { color?: string }) {
  const colorMap: Record<string, string> = {
    green: "bg-green-500",
    red: "bg-red-500",
    yellow: "bg-yellow-500",
    blue: "bg-blue-500",
  };
  return (
    <span className="relative flex h-3 w-3">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colorMap[color] || colorMap.green} opacity-75`}
      />
      <span
        className={`relative inline-flex rounded-full h-3 w-3 ${colorMap[color] || colorMap.green}`}
      />
    </span>
  );
}

// ============================================================================
// Alert Feed Item
// ============================================================================
function AlertItem({ alert, index }: { alert: SafeguardAlert; index: number }) {
  const navigate = useNavigate();
  const riskColors: Record<string, string> = {
    critical: "border-red-500/50 bg-red-500/10",
    high: "border-orange-500/50 bg-orange-500/10",
    medium: "border-yellow-500/50 bg-yellow-500/10",
    low: "border-blue-500/50 bg-blue-500/10",
  };

  const riskBadgeColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  const platformIcons: Record<string, string> = {
    paytm: "💙",
    phonepe: "💜",
    gpay: "💚",
    unknown: "💳",
  };

  const timeDiff = () => {
    const diff = Date.now() - new Date(alert.timestamp).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <div
      className={`border rounded-lg p-4 transition-all duration-500 ${
        riskColors[alert.riskLevel] || riskColors.low
      }`}
      style={{
        animation: `slideInRight 0.4s ease-out ${index * 0.1}s both`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">
              {platformIcons[alert.platform] || platformIcons.unknown}
            </span>
            <span className="font-semibold text-white truncate text-sm">
              {(alert.recipient || alert.walletId || "Unknown").length > 24
                ? (alert.recipient || alert.walletId || "Unknown").slice(0, 24) + "..."
                : (alert.recipient || alert.walletId || "Unknown")}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="font-mono font-bold text-white">
              ₹{(alert.amount || 0).toLocaleString()}
            </span>
            <span className="capitalize">{alert.platform || 'unknown'}</span>
            <span>{timeDiff()}</span>
          </div>
          {alert.reasons && alert.reasons.length > 0 && (
            <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">
              {alert.reasons[0]}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className={`text-xs uppercase tracking-wider ${
              riskBadgeColors[alert.riskLevel] || riskBadgeColors.low
            }`}
          >
            {alert.riskLevel}
          </Badge>
          <span className="text-xs font-mono text-gray-500 mb-1">
            {(alert.riskScore * 100).toFixed(0)}%
          </span>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 px-2 font-semibold"
            onClick={() => navigate(
              `/cryptoflow/warroom?walletId=${encodeURIComponent(alert.recipient || '')}&riskScore=${alert.riskScore.toFixed(2)}&platform=${encodeURIComponent(alert.platform || 'unknown')}`
            )}
          >
            🔍 Investigate
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Threat Map Visualization (Canvas-based animated nodes)
// ============================================================================
function ThreatMapCanvas({ alerts }: { alerts: SafeguardAlert[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<
    { x: number; y: number; r: number; risk: number; pulse: number; speed: number; color: string }[]
  >([]);

  // Generate nodes from alerts
  useEffect(() => {
    const existing = nodesRef.current;
    const newNodes = alerts.slice(existing.length).map(() => ({
      x: 80 + Math.random() * (window.innerWidth * 0.4 - 160),
      y: 60 + Math.random() * 340,
      r: 4 + Math.random() * 8,
      risk: Math.random(),
      pulse: 0,
      speed: 0.3 + Math.random() * 0.7,
      color: "",
    }));
    newNodes.forEach((n) => {
      n.risk = alerts[existing.length + newNodes.indexOf(n)]?.riskScore || Math.random();
      n.pulse = 1.0; // Start with full pulse for new nodes
      if (n.risk >= 0.7) n.color = "rgba(239, 68, 68, ";
      else if (n.risk >= 0.5) n.color = "rgba(249, 115, 22, ";
      else if (n.risk >= 0.3) n.color = "rgba(234, 179, 8, ";
      else n.color = "rgba(59, 130, 246, ";
    });
    nodesRef.current = [...existing, ...newNodes];
  }, [alerts.length]);

  // Seed some ambient nodes on mount
  useEffect(() => {
    const seed: typeof nodesRef.current = [];
    for (let i = 0; i < 20; i++) {
      const risk = Math.random();
      let color = "rgba(59, 130, 246, ";
      if (risk > 0.7) color = "rgba(239, 68, 68, ";
      else if (risk > 0.5) color = "rgba(249, 115, 22, ";
      else if (risk > 0.3) color = "rgba(234, 179, 8, ";
      seed.push({
        x: 40 + Math.random() * 600,
        y: 30 + Math.random() * 380,
        r: 2 + Math.random() * 5,
        risk,
        pulse: 0,
        speed: 0.15 + Math.random() * 0.4,
        color,
      });
    }
    nodesRef.current = seed;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!ctx || !canvas) return;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Draw connections between nearby nodes
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const opacity = (1 - dist / 120) * 0.15;
            ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw and animate nodes
      for (const node of nodes) {
        // Subtle float animation
        node.y += Math.sin(Date.now() * 0.001 * node.speed) * 0.15;
        node.x += Math.cos(Date.now() * 0.0007 * node.speed) * 0.1;

        // Pulse decay
        if (node.pulse > 0) {
          node.pulse -= 0.005;
          // Draw pulse ring
          const pulseR = node.r + (1 - node.pulse) * 30;
          ctx.strokeStyle = `${node.color}${node.pulse * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Glow
        const glow = ctx.createRadialGradient(
          node.x, node.y, 0,
          node.x, node.y, node.r * 3
        );
        glow.addColorStop(0, `${node.color}0.3)`);
        glow.addColorStop(1, `${node.color}0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = `${node.color}0.9)`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    // Resize handler
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
    />
  );
}

// ============================================================================
// Main Page Component
// ============================================================================
export default function LiveThreatMap() {
  const [alerts, setAlerts] = useState<SafeguardAlert[]>([]);
  const [stats, setStats] = useState({
    totalChecks: 0,
    totalFlagged: 0,
    flaggedRecipients: 0,
    flagRate: 0,
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [attackDemoOpen, setAttackDemoOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  // Fetch initial stats
  useEffect(() => {
    const safeSetStats = (data: any) => {
      setStats({
        totalChecks:       Number(data?.totalChecks       ?? 0) || 0,
        totalFlagged:      Number(data?.totalFlagged      ?? 0) || 0,
        flaggedRecipients: Number(data?.flaggedRecipients ?? 0) || 0,
        flagRate:          Number(data?.flagRate          ?? 0) || 0,
      });
    };
    safeguardApi.getStats().then(safeSetStats).catch(console.error);
    const interval = setInterval(() => {
      safeguardApi.getStats().then(safeSetStats).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket / demo live alerts
  useEffect(() => {
    const token = localStorage.getItem("auth_token");

    if (token) {
      // ── Real WebSocket path ──────────────────────────────────────────────
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const wsUrl = apiBase.replace("http", "ws");
      const ws = new WebSocket(`${wsUrl}/ws?token=${token}`);

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: "subscribe", resourceId: "safeguard" }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "safeguard_alert" && msg.data) {
            setAlerts((prev) => [msg.data, ...prev].slice(0, 50));
            safeguardApi.getStats().then((d) => setStats({
              totalChecks:       Number(d?.totalChecks       ?? 0) || 0,
              totalFlagged:      Number(d?.totalFlagged      ?? 0) || 0,
              flaggedRecipients: Number(d?.flaggedRecipients ?? 0) || 0,
              flagRate:          Number(d?.flagRate          ?? 0) || 0,
            })).catch(() => {});
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => {
        setWsConnected(false);
        // Fallback to demo mode if connection fails
        startDemoMode();
      };
      wsRef.current = ws;
      return () => { ws.close(); };
    }

    // ── Demo mode — simulate live alerts without backend auth ────────────
    const startDemoMode = () => {
      setWsConnected(true); // show LIVE in demo

      const MOCK_ALERTS: SafeguardAlert[] = [
        { id: "a1",  severity: "critical", riskLevel: "critical", walletId: "mule_004@paytm",           message: "Critical: Smurfing cluster detected — ₹9,800 x14 to collector_001",    timestamp: new Date().toISOString() },
        { id: "a2",  severity: "high",     riskLevel: "high",     walletId: "wallet_0175@crypto_btc",    message: "High: Rapid fan-out to 4 wallets within 90 seconds",                   timestamp: new Date(Date.now()-20000).toISOString() },
        { id: "a3",  severity: "high",     riskLevel: "high",     walletId: "mule_006@paytm",            message: "High: Cross-platform transfer UPI→ETH detected (layering indicator)",  timestamp: new Date(Date.now()-55000).toISOString() },
        { id: "a4",  severity: "medium",   riskLevel: "medium",   walletId: "wallet_0005@gpay",          message: "Medium: Transaction velocity spike — 18 txns in 5 minutes",            timestamp: new Date(Date.now()-120000).toISOString() },
        { id: "a5",  severity: "critical", riskLevel: "critical", walletId: "collector_001@crypto_eth",  message: "Critical: Fan-in aggregation — 10 wallets → ₹38.5L collected",         timestamp: new Date(Date.now()-180000).toISOString() },
        { id: "a6",  severity: "medium",   riskLevel: "medium",   walletId: "shell_co_3@upi_biz",        message: "Medium: Shell company structuring 8x₹9,500 over 2 hours",              timestamp: new Date(Date.now()-300000).toISOString() },
        { id: "a7",  severity: "high",     riskLevel: "high",     walletId: "mule_008@paytm",            message: "High: FATF TR-05 triggered — threshold proximity ratio 0.96",          timestamp: new Date(Date.now()-400000).toISOString() },
      ];

      // Show existing alerts immediately
      setAlerts(MOCK_ALERTS);

      // Inject new random alert every 8s
      let alertIdx = 0;
      const LIVE_ALERT_POOL: SafeguardAlert[] = [
        { id: "l1", severity: "critical", riskLevel: "critical", walletId: "dark_wallet@crypto_btc",  message: "🔴 LIVE: New critical wallet flagged — GNN score 96%",                timestamp: "" },
        { id: "l2", severity: "high",     riskLevel: "high",     walletId: "rapid_mule_9@phonepe",    message: "🟠 LIVE: Rapid transfer pattern — 5 hops in 3 minutes",               timestamp: "" },
        { id: "l3", severity: "medium",   riskLevel: "medium",   walletId: "structured_x@gpay",       message: "🟡 LIVE: Structuring alert — 6 sub-threshold payments detected",       timestamp: "" },
        { id: "l4", severity: "critical", riskLevel: "critical", walletId: "mixer_exit_7@crypto_eth", message: "🔴 LIVE: Crypto mixer exit detected — cross-chain bridge activity",    timestamp: "" },
      ];

      const liveInterval = setInterval(() => {
        const base = LIVE_ALERT_POOL[alertIdx % LIVE_ALERT_POOL.length];
        const newAlert: SafeguardAlert = { ...base, id: `live_${Date.now()}`, timestamp: new Date().toISOString() };
        setAlerts(prev => [newAlert, ...prev].slice(0, 50));
        setStats(prev => ({
          ...prev,
          totalChecks:  prev.totalChecks + Math.floor(Math.random() * 4 + 1),
          totalFlagged: prev.totalFlagged + (base.severity === "critical" ? 1 : 0),
          flaggedRecipients: prev.flaggedRecipients + (base.severity !== "medium" ? 1 : 0),
          flagRate: parseFloat(((prev.totalFlagged + 1) / (prev.totalChecks + 5) * 100).toFixed(2)),
        }));
        alertIdx++;
      }, 8000);

      return () => { clearInterval(liveInterval); };
    };

    if (!localStorage.getItem("auth_token")) {
      return startDemoMode();
    }
  }, []);

  const criticalCount = alerts.filter(
    (a) => a.riskLevel === "critical" || a.riskLevel === "high"
  ).length;

  return (
    <DashboardLayout>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white transition-colors">
                <ChevronLeft className="w-8 h-8" />
              </button>
              <Globe className="h-8 w-8 text-purple-400" />
              Live Threat Map
            </h1>
            <p className="text-gray-400 mt-1">
              Real-time monitoring of SmurfPakad SafeGuard intercepts
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={attackDemoOpen} onOpenChange={setAttackDemoOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex items-center gap-2"
                >
                  <ZapIcon className="w-4 h-4" />
                  Simulate Attack
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
                <SmurfingAttackDemo />
              </DialogContent>
            </Dialog>
            <Link to="/cryptoflow/warroom">
              <Button
                variant="outline"
                className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              >
                <Eye className="h-4 w-4 mr-2" />
                Open War Room
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-900/20 border-purple-500/20 backdrop-blur-xl">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-300/70 uppercase tracking-wider">
                    Total Checks
                  </p>
                  <p className="text-3xl font-bold text-white mt-1">
                    <AnimatedCounter value={stats.totalChecks} />
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <Shield className="h-6 w-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/10 to-red-900/20 border-red-500/20 backdrop-blur-xl">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-red-300/70 uppercase tracking-wider">
                    Threats Flagged
                  </p>
                  <p className="text-3xl font-bold text-white mt-1">
                    <AnimatedCounter value={stats.totalFlagged} />
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <ShieldAlert className="h-6 w-6 text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-900/20 border-orange-500/20 backdrop-blur-xl">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-orange-300/70 uppercase tracking-wider">
                    Flagged Recipients
                  </p>
                  <p className="text-3xl font-bold text-white mt-1">
                    <AnimatedCounter value={stats.flaggedRecipients} />
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-orange-500/20">
                  <AlertTriangle className="h-6 w-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-900/20 border-cyan-500/20 backdrop-blur-xl">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-cyan-300/70 uppercase tracking-wider">
                    Flag Rate
                  </p>
                  <p className="text-3xl font-bold text-white mt-1">
                    <AnimatedCounter
                      value={Math.round(stats.flagRate * 100)}
                      suffix="%"
                    />
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-500/20">
                  <TrendingUp className="h-6 w-6 text-cyan-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content: Map + Alert Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Threat Map Canvas */}
          <Card className="lg:col-span-3 bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Radio className="h-5 w-5 text-purple-400" />
                  Network Activity
                </CardTitle>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Critical
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    High
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    Medium
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Low
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative h-[420px] bg-gradient-to-br from-gray-900/50 to-gray-950/50">
                <ThreatMapCanvas alerts={alerts} />
                {/* Overlay stats */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/5">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  <span className="text-xs text-gray-300">
                    <strong className="text-white">{alerts.length}</strong> live
                    intercepts
                  </span>
                  {criticalCount > 0 && (
                    <>
                      <span className="text-gray-600">|</span>
                      <span className="text-xs text-red-400">
                        <strong>{criticalCount}</strong> critical
                      </span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alert Feed */}
          <Card className="lg:col-span-2 bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-red-400" />
                  Live Alert Feed
                </CardTitle>
                {alerts.length > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse"
                  >
                    {alerts.length} new
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                {alerts.length === 0 ? (
                  <div className="text-center py-16">
                    <Shield className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">
                      No alerts yet. Waiting for SafeGuard intercepts...
                    </p>
                    <p className="text-gray-600 text-xs mt-1">
                      Run the demo script to simulate a smurfing attack
                    </p>
                  </div>
                ) : (
                  alerts.map((alert, i) => (
                    <AlertItem key={`${alert.timestamp}-${i}`} alert={alert} index={i} />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom: Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/cryptoflow/warroom">
            <Card className="bg-white/5 border-white/10 hover:border-purple-500/30 hover:bg-white/10 transition-all duration-300 cursor-pointer group">
              <CardContent className="pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Eye className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">War Room</p>
                    <p className="text-xs text-gray-500">
                      Deep-dive investigation
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-purple-400 transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/cryptoflow/graph">
            <Card className="bg-white/5 border-white/10 hover:border-cyan-500/30 hover:bg-white/10 transition-all duration-300 cursor-pointer group">
              <CardContent className="pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <Globe className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      Transaction Graph
                    </p>
                    <p className="text-xs text-gray-500">
                      Network visualization
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/cryptoflow/reports">
            <Card className="bg-white/5 border-white/10 hover:border-orange-500/30 hover:bg-white/10 transition-all duration-300 cursor-pointer group">
              <CardContent className="pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Generate SAR</p>
                    <p className="text-xs text-gray-500">
                      Compliance reporting
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-orange-400 transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* IBM Powered Badge */}
        <div className="flex items-center justify-center gap-3 py-4">
          <span className="text-xs text-gray-600">Powered by</span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-blue-400 font-bold text-sm">IBM</span>
            <span className="text-blue-300/70 text-xs">watsonx.ai</span>
          </div>
          <span className="text-gray-700">×</span>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <span className="text-purple-400 font-bold text-sm">SmurfPakad</span>
            <span className="text-purple-300/70 text-xs">GNN</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
