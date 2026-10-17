import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, TrendingUp, Users, Loader2, ShieldAlert, Crosshair, ChevronRight, Brain, Lock, Scale, Zap, Target, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import ThreeBackground from "@/components/ThreeBackground";
import CrossPlatformGraph from "@/components/CrossPlatformGraph";
import FloatingRiskOrbs3D from "@/components/FloatingRiskOrbs3D";
import LiveAlertBanner from "@/components/LiveAlertBanner";
import { dashboardApi, uploadApi, analysisApi, type Upload } from "@/lib/api";
import { usePageEntrance, useStaggerCards, useCountUp } from "@/hooks/useGSAP";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SmurfingAttackDemo from "@/components/SmurfingAttackDemo";

interface DashboardStats {
  totalTransactions: number;
  suspiciousPatterns: number;
  riskScore: number;
  addressesMonitored: number;
}

export default function Dashboard() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentUploads, setRecentUploads] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attackDemoOpen, setAttackDemoOpen] = useState(false);
  const [orbsData, setOrbsData] = useState<any[]>([]);

  usePageEntrance(".dashboard-content");
  useStaggerCards(".stats-grid");

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch dashboard stats, recent uploads, and suspicious addresses in parallel
        const [statsResponse, uploadsResponse, addressesResponse] = await Promise.all([
          dashboardApi.getStats().catch(() => null),
          uploadApi.getHistory(1, 5).catch(() => ({ uploads: [], pagination: {} })),
          analysisApi.getSuspiciousAddresses().catch(() => ({ addresses: [] })),
        ]);

        if (statsResponse) {
          // Handle nested response from backend (stats.totalTransactions vs total_transactions)
          const statsData = (statsResponse as any).stats || statsResponse;
          setStats({
            totalTransactions: statsData.totalTransactions || statsData.total_transactions || 15842,
            suspiciousPatterns: statsData.suspiciousCount || statsData.suspicious_count || 432,
            riskScore: Math.round((1 - (statsData.riskScore || 0.15)) * 100), // Convert risk to improvement %
            addressesMonitored: statsData.addressesMonitored || statsData.activeCases || statsData.total_uploads || 24500,
          });
        } else {
          // Backend offline - show demo data
          setStats({
            totalTransactions: 15842,
            suspiciousPatterns: 432,
            riskScore: 97,
            addressesMonitored: 1247,
          });
        }

        setRecentUploads(uploadsResponse.uploads || []);

        // Map suspicious addresses to 3D Orbs
        if (addressesResponse && addressesResponse.addresses) {
          const topAddresses = addressesResponse.addresses.slice(0, 5);
          const mappedOrbs = topAddresses.map((addr: any, idx: number) => {
            const positions = [
              [-2.5, 0, 0],
              [0, 0.5, 0],
              [2.5, 0, 0],
              [-1.2, -1.5, 1],
              [1.2, -1.5, 1]
            ];
            const risk = addr.riskScore || 0;
            return {
              position: positions[idx % positions.length],
              riskScore: risk,
              label: addr.address.substring(0, 16),
              color: risk > 0.8 ? "#ef4444" : risk > 0.5 ? "#f97316" : "#eab308"
            };
          });
          if (mappedOrbs.length > 0) {
            setOrbsData(mappedOrbs);
          }
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError('Failed to load dashboard data');
        // Fallback demo data
        setStats({
          totalTransactions: 15842,
          suspiciousPatterns: 432,
          riskScore: 97,
          addressesMonitored: 1247,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Format number with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  // Map upload status to risk level (placeholder logic)
  const getRiskLevel = (upload: Upload): string => {
    if (upload.status === 'completed') return 'Medium';
    if (upload.status === 'failed') return 'High';
    return 'Low';
  };

  const statsDisplay = [
    {
      title: "Total Transactions Analyzed",
      value: stats ? formatNumber(stats.totalTransactions) : "—",
      change: "+12.5%",
      icon: Activity,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Suspicious Patterns Detected",
      value: stats ? formatNumber(stats.suspiciousPatterns) : "—",
      change: "+4.2%",
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
    {
      title: "Risk Score Improvement",
      value: stats ? `${stats.riskScore}%` : "—",
      change: "+8.1%",
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Addresses Monitored",
      value: stats ? formatNumber(stats.addressesMonitored) : "—",
      change: "+18.3%",
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  return (
    <DashboardLayout>
      <ThreeBackground variant="cubes" />
      <div className="space-y-8 dashboard-content">
        {/* Live WebSocket Alert Banner */}
        <LiveAlertBanner />

        {/* Welcome + 3D Risk Visualization */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-center">
          <div className="rounded-xl p-6 border bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 dark:from-crypto-purple/20 dark:to-pink-600/20 dark:border-crypto-purple/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-semibold uppercase tracking-widest">LIVE MONITORING</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AML Intelligence Hub</h2>
            <p className="mt-2 text-gray-700 dark:text-gray-300">Real-time cross-platform laundering detection across Paytm, PhonePe, and GPay networks.</p>
            <div className="mt-4 flex gap-3">
              <Link to="/cryptoflow/agent">
                <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                  <Brain className="h-4 w-4 mr-2" /> AI Agent
                </Button>
              </Link>
              <Link to="/cryptoflow/federated">
                <Button size="sm" variant="outline" className="border-purple-500/40 text-purple-400">
                  <Lock className="h-4 w-4 mr-2" /> Federated
                </Button>
              </Link>
              <Link to="/cryptoflow/governance">
                <Button size="sm" variant="outline" className="border-green-500/40 text-green-400">
                  <Scale className="h-4 w-4 mr-2" /> Governance
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-white/10">
            <div className="absolute top-3 left-4 z-10 text-xs text-white/60 font-semibold uppercase tracking-widest">3D Risk Network</div>
            <FloatingRiskOrbs3D height="300px" orbs={orbsData.length > 0 ? orbsData : undefined} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
          {statsDisplay.map((stat) => (
            <Card key={stat.title} className="backdrop-blur-sm hover:shadow-xl transition-all duration-300 bg-white border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:border-crypto-purple/20 dark:hover:bg-white/10 dark:hover:shadow-crypto-purple/20">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor} bg-opacity-20`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stat.value}
                </div>
                <p className="text-xs text-green-400 mt-1">
                  {stat.change} from last month
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Live Threat CTA + War Room */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/cryptoflow/threats">
            <Card className="bg-gradient-to-br from-red-500/10 to-red-900/20 border-red-500/20 backdrop-blur-xl hover:border-red-500/40 transition-all duration-300 cursor-pointer group h-full">
              <CardContent className="pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-red-500/20">
                    <ShieldAlert className="h-7 w-7 text-red-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">Live Threat Map</p>
                    <p className="text-sm text-gray-400">Real-time SafeGuard intercepts & anomaly feed</p>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6 text-gray-600 group-hover:text-red-400 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/cryptoflow/warroom">
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-900/20 border-purple-500/20 backdrop-blur-xl hover:border-purple-500/40 transition-all duration-300 cursor-pointer group h-full">
              <CardContent className="pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/20">
                    <Crosshair className="h-7 w-7 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">War Room</p>
                    <p className="text-sm text-gray-400">Investigation workspace with IBM AI briefs</p>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6 text-gray-600 group-hover:text-purple-400 transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Cross-Platform Silo Visualization */}
        <CrossPlatformGraph />

        {/* Recent uploads */}
        <Card className="backdrop-blur-sm bg-white border-gray-200 dark:bg-white/5 dark:border-crypto-purple/20">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Recent Uploads</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Your latest transaction data submissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-crypto-purple" />
              </div>
            ) : recentUploads.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No uploads yet. Start by uploading your first transaction data.
              </div>
            ) : (
              <div className="space-y-4">
                {recentUploads.map((upload) => (
                  <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg transition-colors border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-crypto-purple/20 dark:bg-white/5 dark:hover:bg-white/10">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{upload.name || upload.filename}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(upload.date || upload.uploadedAt || '').toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        upload.status === 'completed' 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : upload.status === 'processing'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : upload.status === 'failed'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {upload.status.charAt(0).toUpperCase() + upload.status.slice(1)}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        getRiskLevel(upload) === 'High' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : getRiskLevel(upload) === 'Medium'
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {getRiskLevel(upload)} Risk
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/cryptoflow/upload">
              <Button className="w-full mt-4 bg-gradient-to-r from-crypto-purple to-pink-600 hover:from-crypto-dark-purple hover:to-pink-700 text-white shadow-lg shadow-crypto-purple/50">
                Upload New Data
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="backdrop-blur-sm hover:shadow-xl transition-all duration-300 cursor-pointer bg-white border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:border-crypto-purple/20 dark:hover:bg-white/10 dark:hover:shadow-crypto-purple/20">
            <Link to="/cryptoflow/analysis">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">View Analysis</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  See detailed pattern detection results
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
          <Card className="backdrop-blur-sm hover:shadow-xl transition-all duration-300 cursor-pointer bg-white border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:border-crypto-purple/20 dark:hover:bg-white/10 dark:hover:shadow-crypto-purple/20">
            <Link to="/cryptoflow/graph">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Transaction Graph</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  Visualize blockchain network connections
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
          <Card className="backdrop-blur-sm hover:shadow-xl transition-all duration-300 cursor-pointer bg-white border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:border-crypto-purple/20 dark:hover:bg-white/10 dark:hover:shadow-crypto-purple/20">
            <Link to="/cryptoflow/reports">
              <CardHeader>
                <CardTitle className="text-lg text-white">Generate Report</CardTitle>
                <CardDescription className="text-gray-400">Create compliance reports for export</CardDescription>
              </CardHeader>
            </Link>
          </Card>
          <Card className="backdrop-blur-sm hover:shadow-xl transition-all duration-300 cursor-pointer bg-gradient-to-br from-purple-600/20 to-cyan-600/20 border-purple-500/30 hover:border-purple-500/50 dark:bg-purple-600/10 dark:hover:bg-purple-600/20">
            <Dialog open={attackDemoOpen} onOpenChange={setAttackDemoOpen}>
              <DialogTrigger asChild>
                <Button className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white shadow-lg shadow-purple-500/50 flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5" />
                  <span>Simulate Attack</span>
                  <Target className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
                <SmurfingAttackDemo />
              </DialogContent>
            </Dialog>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
