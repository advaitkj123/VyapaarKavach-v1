import React, { useState, useEffect } from 'react';
import { Play, Loader2, Lock, Server, Database, ArrowRight, CheckCircle2, Shield, Zap, ChevronLeft, TrendingDown, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import FederatedGlobe3D from '@/components/FederatedGlobe3D';
import { usePageEntrance } from '@/hooks/useGSAP';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface RoundData {
  round: number;
  globalMetrics: { accuracy: number; f1Score: number; averageLoss: number };
  clients: { client: string; accuracy: number; f1: number; finalLoss: number; transactions: number }[];
}

interface SimResult {
  simulationId: string;
  config: { numRounds: number; numClients: number; algorithm: string };
  rounds: RoundData[];
  finalMetrics: { accuracy: number; f1Score: number; averageLoss: number };
  improvement: { accuracyGain: number; convergenceRound: number };
  federatedVsIsolated: {
    federated: { accuracy: number; f1Score: number };
    isolated: { averageAccuracy: number; averageF1: number; perClient: { client: string; accuracy: number; f1: number }[] };
    improvement: { accuracyGain: number; f1Gain: number };
    verdict: string;
  };
  privacySummary: { rawDataShared: boolean; totalDataPoints: number; dataPointsExposed: number; privacyTechnique: string; complianceNote: string };
}

const BANKS = [
  { name: 'Paytm (Bank A)', color: '#2196F3', txns: '5,000', fraud: '2.2%' },
  { name: 'PhonePe (Bank B)', color: '#7C3AED', txns: '3,500', fraud: '3.1%' },
  { name: 'GPay (Bank C)', color: '#10B981', txns: '2,800', fraud: '1.8%' },
];

// Differential Privacy parameters
const DP_EPSILON = 1.0;
const DP_DELTA = 1e-5;
const DP_MECHANISM = 'Gaussian';
const DP_SENSITIVITY = 0.01;

// Mock convergence data for pre-simulation display
const MOCK_CONVERGENCE = Array.from({ length: 10 }, (_, i) => ({
  round: i + 1,
  'Paytm (A)': parseFloat((0.85 - (0.85 - 0.32) * Math.exp(-i * 0.45) + (Math.random() - 0.5) * 0.03).toFixed(3)),
  'PhonePe (B)': parseFloat((0.92 - (0.92 - 0.38) * Math.exp(-i * 0.38) + (Math.random() - 0.5) * 0.04).toFixed(3)),
  'GPay (C)': parseFloat((0.78 - (0.78 - 0.29) * Math.exp(-i * 0.52) + (Math.random() - 0.5) * 0.025).toFixed(3)),
  global: parseFloat((0.88 - (0.88 - 0.31) * Math.exp(-i * 0.43) + (Math.random() - 0.5) * 0.02).toFixed(3)),
}));

const ACCURACY_MOCK = Array.from({ length: 10 }, (_, i) => ({
  round: i + 1,
  'Paytm (A)': parseFloat((0.65 + (0.93 - 0.65) * (1 - Math.exp(-i * 0.38)) + (Math.random() - 0.5) * 0.02).toFixed(3)),
  'PhonePe (B)': parseFloat((0.60 + (0.91 - 0.60) * (1 - Math.exp(-i * 0.32)) + (Math.random() - 0.5) * 0.025).toFixed(3)),
  'GPay (C)': parseFloat((0.68 + (0.95 - 0.68) * (1 - Math.exp(-i * 0.44)) + (Math.random() - 0.5) * 0.018).toFixed(3)),
  global: parseFloat((0.63 + (0.93 - 0.63) * (1 - Math.exp(-i * 0.40)) + (Math.random() - 0.5) * 0.015).toFixed(3)),
}));

const CHART_COLORS = { 'Paytm (A)': '#2196F3', 'PhonePe (B)': '#7C3AED', 'GPay (C)': '#10B981', global: '#f59e0b' };

export default function FederatedDemo() {
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeRound, setActiveRound] = useState(0);

  usePageEntrance(".federated-content");

  const runSimulation = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/v1/federated/simulate?num_rounds=10`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setActiveRound(data.rounds.length - 1);
      }
    } catch { /* offline fallback handled by UI */ }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0b10] to-[#0f1117] text-white p-6 space-y-6 federated-content">
      {/* Header + 3D Globe */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-center">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white transition-colors">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <Server className="w-7 h-7 text-purple-400" />
                Federated Learning Demo
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Privacy-preserving cross-bank AML training — each bank keeps its data, only gradients are shared
              </p>
            </div>
            <button
              onClick={runSimulation}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-sm font-medium shadow-lg shadow-purple-600/20 transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {loading ? 'Training...' : 'Run Simulation'}
            </button>
          </div>
          {/* Privacy badges */}
          <div className="flex flex-wrap gap-2">
            {['FedAvg Algorithm', '(ε=1.0, δ=1e-5)-DP', 'GDPR Article 5(1)(c)', 'Zero Data Exposure'].map(badge => (
              <span key={badge} className="px-3 py-1 text-xs rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300">{badge}</span>
            ))}
          </div>
        </div>
        <div className="relative rounded-xl overflow-hidden border border-purple-500/20">
          <div className="absolute top-3 left-4 z-10 text-xs text-purple-300 font-semibold uppercase tracking-widest">
            {loading ? '🔄 Training in progress...' : '3D Federation Model'}
          </div>
          <FederatedGlobe3D height="280px" isTraining={loading} />
        </div>
      </div>

      {/* The Story Card */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-2">🔒 Why Federated Learning?</h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          <strong className="text-purple-300">The Problem:</strong> Banks can't share customer data due to privacy regulations (GDPR, PCI-DSS). 
          But smurfing happens <em>across</em> banks — money enters Paytm, moves through PhonePe, exits via GPay. 
          No single bank can see the full picture.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mt-2">
          <strong className="text-blue-300">Our Solution:</strong> Each bank trains the GNN model on its local data. 
          Only model <em>gradients</em> (not raw data) are shared with a federated server via <strong>FedAvg</strong>. 
          The combined model catches cross-bank patterns that no single institution could detect alone.
        </p>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-5">Architecture</h2>
        <div className="flex flex-col md:flex-row items-center gap-4 justify-center">
          {/* Banks */}
          {BANKS.map((bank, i) => (
            <React.Fragment key={bank.name}>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10 min-w-[140px]" style={{ borderColor: `${bank.color}33` }}>
                <Database className="w-6 h-6" style={{ color: bank.color }} />
                <span className="text-xs font-medium text-gray-200">{bank.name}</span>
                <span className="text-[10px] text-gray-500">{bank.txns} txns · {bank.fraud} fraud</span>
                <div className="flex items-center gap-1 mt-1">
                  <Lock className="w-3 h-3 text-green-400" />
                  <span className="text-[9px] text-green-400">Data stays local</span>
                </div>
              </div>
              {i < BANKS.length - 1 && <ArrowRight className="w-4 h-4 text-gray-600 hidden md:block rotate-0" />}
            </React.Fragment>
          ))}
          
          {/* Arrow down to server */}
          <div className="hidden md:flex flex-col items-center mx-2">
            <div className="w-px h-8 bg-gradient-to-b from-purple-500 to-blue-500" />
            <span className="text-[9px] text-gray-500 my-1">Gradients only</span>
            <div className="w-px h-8 bg-gradient-to-b from-blue-500 to-cyan-500" />
          </div>

          {/* Server */}
          <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 min-w-[160px]">
            <Server className="w-6 h-6 text-purple-400" />
            <span className="text-xs font-medium text-purple-300">Federated Server</span>
            <span className="text-[10px] text-gray-500">FedAvg Aggregation</span>
            <span className="text-[9px] text-green-400">Zero raw data access</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Federated vs Isolated Comparison */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Federated vs Isolated Training
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Federated */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-medium text-green-300">Federated (SmurfPakad)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-3xl font-bold text-white">{(result.federatedVsIsolated.federated.accuracy * 100).toFixed(1)}%</p>
                    <p className="text-xs text-gray-500">Accuracy</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white">{(result.federatedVsIsolated.federated.f1Score * 100).toFixed(1)}%</p>
                    <p className="text-xs text-gray-500">F1 Score</p>
                  </div>
                </div>
              </div>
              {/* Isolated */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-5 h-5 text-red-400" />
                  <span className="text-sm font-medium text-red-300">Isolated (Traditional)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-3xl font-bold text-white">{(result.federatedVsIsolated.isolated.averageAccuracy * 100).toFixed(1)}%</p>
                    <p className="text-xs text-gray-500">Accuracy</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white">{(result.federatedVsIsolated.isolated.averageF1 * 100).toFixed(1)}%</p>
                    <p className="text-xs text-gray-500">F1 Score</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 px-4 py-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <p className="text-sm text-purple-200">
                📈 <strong>+{(result.federatedVsIsolated.improvement.accuracyGain * 100).toFixed(1)}% accuracy gain</strong> from federated learning. 
                Converged in round {result.improvement.convergenceRound}.
              </p>
              <p className="text-xs text-gray-400 mt-1">{result.federatedVsIsolated.verdict}</p>
            </div>
          </div>

          {/* Training Rounds Chart — enhanced with Recharts line chart */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-purple-400" />
                FL Convergence — Loss per Round per Bank
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">Click bar to inspect round</span>
              </div>
            </div>

            {/* Recharts Line Chart for Loss */}
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.rounds.map((r, i) => ({
                  round: r.round,
                  'Paytm (A)': r.clients[0]?.finalLoss ?? 0,
                  'PhonePe (B)': r.clients[1]?.finalLoss ?? 0,
                  'GPay (C)': r.clients[2]?.finalLoss ?? 0,
                  global: r.globalMetrics.averageLoss,
                }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="round" tick={{ fill: '#6b7280', fontSize: 10 }} label={{ value: 'Round', position: 'insideBottom', fill: '#6b7280', fontSize: 10, offset: -2 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} label={{ value: 'Loss', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(15,10,28,0.95)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#a78bfa' }}
                    itemStyle={{ color: '#d1d5db' }}
                    formatter={(val: any) => [typeof val === 'number' ? val.toFixed(3) : val, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
                  {Object.entries(CHART_COLORS).map(([key, color]) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={key === 'global' ? 2.5 : 1.5}
                      dot={false} strokeDasharray={key === 'global' ? '5 3' : undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Accuracy convergence */}
            <div className="mt-4">
              <h3 className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-green-400" /> Accuracy per Round
              </h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.rounds.map(r => ({
                    round: r.round,
                    'Paytm (A)': r.clients[0]?.accuracy ?? 0,
                    'PhonePe (B)': r.clients[1]?.accuracy ?? 0,
                    'GPay (C)': r.clients[2]?.accuracy ?? 0,
                    global: r.globalMetrics.accuracy,
                  }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="round" tick={{ fill: '#6b7280', fontSize: 9 }} />
                    <YAxis domain={[0.5, 1]} tickFormatter={(v) => `${(v*100).toFixed(0)}%`} tick={{ fill: '#6b7280', fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,10,28,0.95)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, fontSize: 11 }}
                      formatter={(val: any) => [`${(Number(val) * 100).toFixed(1)}%`, '']}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
                    {Object.entries(CHART_COLORS).map(([key, color]) => (
                      <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={key === 'global' ? 2.5 : 1.5}
                        dot={false} strokeDasharray={key === 'global' ? '5 3' : undefined} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Round navigator */}
            <div className="flex items-center gap-1 mt-3 flex-wrap">
              <span className="text-[10px] text-gray-600 mr-1">Jump to round:</span>
              {result.rounds.map((_, i) => (
                <button key={i} onClick={() => setActiveRound(i)}
                  className={`w-7 h-7 rounded text-[10px] font-mono transition-all ${
                    i === activeRound ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10'
                  }`}>{i + 1}</button>
              ))}
            </div>
          </div>

          {/* Per-Client Details for Active Round */}
          {result.rounds[activeRound] && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">
                Round {result.rounds[activeRound].round} — Per-Client Metrics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.rounds[activeRound].clients.map((client, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-4 border border-white/5">
                    <p className="text-sm font-medium text-gray-200 mb-2" style={{ color: BANKS[i]?.color }}>{client.client}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-white">{(client.accuracy * 100).toFixed(1)}%</p>
                        <p className="text-[10px] text-gray-500">Accuracy</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{(client.f1 * 100).toFixed(1)}%</p>
                        <p className="text-[10px] text-gray-500">F1</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{client.finalLoss.toFixed(3)}</p>
                        <p className="text-[10px] text-gray-500">Loss</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Summary */}
          <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-green-300 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Privacy Guarantee
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold text-white">{result.privacySummary.totalDataPoints.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total Data Points</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{result.privacySummary.dataPointsExposed}</p>
                <p className="text-xs text-gray-500">Data Points Exposed</p>
              </div>
              <div>
                <p className="text-sm font-medium text-white mt-1">{result.privacySummary.privacyTechnique}</p>
              </div>
              <div>
                <p className="text-sm text-green-300 mt-1">{result.privacySummary.complianceNote}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Differential Privacy Budget Display — FEATURE-004 */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-indigo-300">Differential Privacy Budget</h2>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">Active</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Privacy Budget (ε)', value: `ε = ${DP_EPSILON}`, sub: 'Lower ε = stronger privacy', color: 'text-indigo-300', bg: 'bg-indigo-500/10 border-indigo-500/20' },
            { label: 'Failure Prob. (δ)', value: `δ = 10⁻⁵`, sub: 'Max privacy breach prob.', color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'DP Mechanism', value: DP_MECHANISM, sub: 'Noise injection method', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
            { label: 'Sensitivity (Δf)', value: `Δf = ${DP_SENSITIVITY}`, sub: 'Max gradient influence', color: 'text-pink-300', bg: 'bg-pink-500/10 border-pink-500/20' },
          ].map(item => (
            <div key={item.label} className={`p-3 rounded-lg border ${item.bg}`}>
              <p className="text-[10px] text-gray-500 mb-1">{item.label}</p>
              <p className={`text-lg font-bold font-mono ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-gray-400 leading-relaxed">
            <strong className="text-white">Gaussian Mechanism:</strong> Noise σ = {(DP_SENSITIVITY * Math.sqrt(2 * Math.log(1.25 / DP_DELTA)) / DP_EPSILON).toFixed(4)} is added to each gradient update.
            This guarantees <strong className="text-indigo-300">(ε={DP_EPSILON}, δ=10⁻⁵)-differential privacy</strong> — no individual transaction can be inferred from the shared model weights.
            Compliant with <strong className="text-green-400">GDPR Art. 5(1)(c)</strong>, <strong className="text-blue-400">RBI Data Localisation</strong>, and <strong className="text-purple-400">DPDP Act 2023</strong>.
          </p>
        </div>
      </div>

      {/* Always-visible convergence preview (no simulation needed) */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-orange-400" />
            Expected Convergence Preview
          </h2>
          <span className="text-[10px] text-gray-600 italic">Simulated — run simulation for real data</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CONVERGENCE} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="round" tick={{ fill: '#6b7280', fontSize: 10 }} label={{ value: 'FL Round', position: 'insideBottom', fill: '#6b7280', fontSize: 10, offset: -2 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} label={{ value: 'Loss', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'rgba(15,10,28,0.95)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, fontSize: 11 }}
                formatter={(val: any) => [typeof val === 'number' ? val.toFixed(3) : val, '']} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
              <ReferenceLine y={0.35} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 2" label={{ value: 'Target', fill: '#ef4444', fontSize: 9 }} />
              {Object.entries(CHART_COLORS).map(([key, color]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={key === 'global' ? 2.5 : 1.5}
                  dot={false} strokeDasharray={key === 'global' ? '5 3' : undefined} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-gray-600 mt-2 text-center">
          Global model (dashed gold) converges faster than any individual bank — this is the power of federated learning.
        </p>
      </div>

      {/* Call to action if no result yet */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Server className="w-16 h-16 text-purple-500/30 mb-4" />
          <p className="text-gray-500 mb-2">Click <strong className="text-purple-400">"Run Simulation"</strong> to train across 3 banks</p>
          <p className="text-xs text-gray-600">Simulates 10 rounds of FedAvg with Paytm, PhonePe, and GPay data partitions</p>
        </div>
      )}
    </div>
  );
}
