import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Card, CardContent, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, Pause, Square, Zap, Shield, AlertTriangle, 
  Target, Network, Users, DollarSign, Clock, 
  RotateCcw, TrendingUp, Eye, Radio, 
  Activity, Skull, CheckCircle, X, 
  ChevronLeft, ChevronRight, Expand, Minimize
} from 'lucide-react';
import { useWebSocket, api } from '@/lib/api';
import { toast } from '@/components/ToastNotification';

type AttackPattern = 'smurfing' | 'fan_out' | 'layering' | 'circular';

interface WalletNode {
  id: string;
  address: string;
  label: string;
  type: 'source' | 'mule' | 'collector' | 'exchange' | 'intermediary' | 'circular' | 'external';
  risk: number;
  flagged: boolean;
  balance: number;
  color: string;
  x: number;
  y: number;
  pulse: number;
}

interface TransactionFlow {
  id: string;
  from: string;
  to: string;
  amount: number;
  progress: number; // 0-1
  active: boolean;
  highRisk: boolean;
}

interface AlertEvent {
  id: string;
  type: 'wallet_flagged' | 'pattern_detected' | 'alert_raised' | 'stage_complete';
  severity: 'info' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  walletId?: string;
}

const PATTERN_CONFIGS: Record<AttackPattern, { name: string; description: string; duration: number; icon: React.ReactNode }> = {
  smurfing: { 
    name: 'Smurfing Fan-Out', 
    description: 'Classic smurfing: Source → 5 Mules → Collector → Exchange',
    duration: 20,
    icon: <Users className="w-5 h-5" />
  },
  fan_out: { 
    name: 'Quick Fan-Out', 
    description: 'Fast demo: Source funds 5 mules in 10 seconds',
    duration: 10,
    icon: <Target className="w-5 h-5" />
  },
  layering: { 
    name: 'Peel Chain Layering', 
    description: '6-layer peel chain with 15% decay per hop',
    duration: 20,
    icon: <RotateCcw className="w-5 h-5" />
  },
  circular: { 
    name: 'Circular Flow', 
    description: '2-round circular flow across 4 nodes',
    duration: 20,
    icon: <Network className="w-5 h-5" />
  },
};

const WALLET_COLORS = {
  source: '#3b82f6',
  mule: '#f59e0b',
  collector: '#ef4444',
  exchange: '#8b5cf6',
  intermediary: '#ec4899',
  circular: '#06b6d4',
  external: '#64748b',
};

const SEVERITY_CONFIG = {
  info: { color: '#3b82f6', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: <Activity className="w-4 h-4" /> },
  medium: { color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <AlertTriangle className="w-4 h-4" /> },
  high: { color: '#ef4444', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: <Shield className="w-4 h-4" /> },
  critical: { color: '#ef4444', bg: 'bg-red-500/20', border: 'border-red-500/50 animate-pulse', icon: <Skull className="w-4 h-4" /> },
};

export default function SmurfingAttackDemo() {
  const [selectedPattern, setSelectedPattern] = useState<AttackPattern>('smurfing');
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [wallets, setWallets] = useState<Record<string, WalletNode>>({});
  const [flows, setFlows] = useState<TransactionFlow[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [stage, setStage] = useState<string>('idle');
  const [stats, setStats] = useState({
    totalAmount: 0,
    walletsFlagged: 0,
    transactionsCount: 0,
    patternsDetected: 0,
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const duration = PATTERN_CONFIGS[selectedPattern].duration;
  
  // WebSocket for real-time events
  useWebSocket(useCallback((msg) => {
    if (msg.type === 'attack_simulation') {
      const event = msg.event;
      
      // Update wallet states
      if (event.wallet_updates && Object.keys(event.wallet_updates).length > 0) {
        setWallets(prev => {
          const next = { ...prev };
          Object.entries(event.wallet_updates).forEach(([key, update]) => {
            if (next[key]) {
              next[key] = { ...next[key], ...update };
            }
          });
          return next;
        });
      }
      
      // Handle transaction flows
      if (event.from_wallet && event.to_wallet && event.amount > 0) {
        const flowId = `${event.from_wallet}->${event.to_wallet}-${Date.now()}`;
        setFlows(prev => [...prev, {
          id: flowId,
          from: event.from_wallet,
          to: event.to_wallet,
          amount: event.amount,
          progress: 0,
          active: true,
          highRisk: event.type === 'tx_sent' && (event.wallet_updates?.[event.to_wallet]?.risk || 0) > 0.5
        }]);
      }
      
      // Handle alerts
      if (event.type === 'wallet_flagged' || event.type === 'pattern_detected' || event.type === 'alert_raised') {
        const alert: AlertEvent = {
          id: event.id || `alert-${Date.now()}`,
          type: event.type,
          severity: event.alert_info?.severity || 'high',
          title: event.alert_info?.title || event.pattern_info?.type || 'Event',
          message: event.alert_info?.description || event.pattern_info?.description || 'Transaction processed',
          timestamp: Date.now(),
          walletId: event.from_wallet || event.to_wallet
        };
        setAlerts(prev => [alert, ...prev].slice(0, 20));
        
        if (event.type === 'wallet_flagged') {
          setStats(s => ({ ...s, walletsFlagged: s.walletsFlagged + 1 }));
        }
        if (event.type === 'pattern_detected') {
          setStats(s => ({ ...s, patternsDetected: s.patternsDetected + 1 }));
        }
      }
      
      if (event.type === 'stage_complete') {
        setStage(event.pattern_info?.stage || 'processing');
      }
      
      if (event.type === 'tx_sent') {
        setStats(s => ({ ...s, transactionsCount: s.transactionsCount + 1, totalAmount: s.totalAmount + event.amount }));
      }
    }
    
    if (msg.type === 'attack_complete') {
      setRunning(false);
      setPaused(false);
      setProgress(100);
      setStage('complete');
      toast.success('Attack simulation complete!');
    }
    
    if (msg.type === 'attack_error') {
      setRunning(false);
      setPaused(false);
      toast.error(`Simulation error: ${msg.error}`);
    }
  }, []));

  // Initialize wallets for selected pattern
  useEffect(() => {
    initializeWallets();
  }, [selectedPattern]);

  // Animation loop for transaction flows
  useEffect(() => {
    if (!running || paused) return;
    
    const animate = () => {
      setFlows(prev => {
        const updated = prev.map(flow => {
          if (!flow.active) return flow;
          const newProgress = Math.min(flow.progress + 0.02, 1);
          if (newProgress >= 1) {
            return { ...flow, active: false, progress: 1 };
          }
          return { ...flow, progress: newProgress };
        });
        return updated.filter(f => f.progress < 1 || f.active);
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [running, paused]);

  // Progress timer
  useEffect(() => {
    if (!running || paused) return;
    
    const timer = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 0.1;
        if (next >= duration) {
          setRunning(false);
          setProgress(100);
          return duration;
        }
        setProgress((next / duration) * 100);
        return next;
      });
    }, 100);
    
    return () => clearInterval(timer);
  }, [running, paused, duration]);

  const initializeWallets = useCallback(() => {
    const config = PATTERN_CONFIGS[selectedPattern];
    const newWallets: Record<string, WalletNode> = {};
    
    if (selectedPattern === 'smurfing' || selectedPattern === 'fan_out') {
      // Source
      newWallets.source = {
        id: 'source',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fEb1',
        label: 'Source Wallet',
        type: 'source',
        risk: 0,
        flagged: false,
        balance: 0,
        color: WALLET_COLORS.source,
        x: 100, y: 300,
        pulse: 0
      };
      
      // Mules
      for (let i = 0; i < 5; i++) {
        newWallets[`mule_${i+1}`] = {
          id: `mule_${i+1}`,
          address: `0x${i+1}a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d`,
          label: `Mule Wallet ${i+1}`,
          type: 'mule',
          risk: 0,
          flagged: false,
          balance: 0,
          color: WALLET_COLORS.mule,
          x: 400, y: 100 + i * 100,
          pulse: 0
        };
      }
      
      // Collector
      newWallets.collector = {
        id: 'collector',
        address: '0x9f8e7d6c5b4a39281706fedcba9876543210fedc',
        label: 'Collector Wallet',
        type: 'collector',
        risk: 0,
        flagged: false,
        balance: 0,
        color: WALLET_COLORS.collector,
        x: 700, y: 300,
        pulse: 0
      };
      
      // Exchange
      newWallets.exchange = {
        id: 'exchange',
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        label: 'Exchange Deposit',
        type: 'exchange',
        risk: 0,
        flagged: false,
        balance: 0,
        color: WALLET_COLORS.exchange,
        x: 900, y: 300,
        pulse: 0
      };
    } else if (selectedPattern === 'layering') {
      newWallets.source = {
        id: 'source',
        address: '0x1111111111111111111111111111111111111111',
        label: 'Source',
        type: 'source',
        risk: 0, flagged: false, balance: 0,
        color: WALLET_COLORS.source, x: 100, y: 300, pulse: 0
      };
      
      for (let i = 0; i < 6; i++) {
        newWallets[`layer_${i+1}`] = {
          id: `layer_${i+1}`,
          address: `0x${i+2}${'0'.repeat(39)}${i+2}`,
          label: `Layer ${i+1}`,
          type: 'intermediary',
          risk: 0, flagged: false, balance: 0,
          color: WALLET_COLORS.intermediary,
          x: 200 + i * 130, y: 300,
          pulse: 0
        };
      }
      
      newWallets.collector = {
        id: 'collector',
        address: '0x9999999999999999999999999999999999999999',
        label: 'Final Collector',
        type: 'collector',
        risk: 0, flagged: false, balance: 0,
        color: WALLET_COLORS.collector, x: 1000, y: 300, pulse: 0
      };
    } else if (selectedPattern === 'circular') {
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2) - Math.PI / 2;
        const radius = 200;
        newWallets[`node_${i+1}`] = {
          id: `node_${i+1}`,
          address: `0x${i+1}${'a'.repeat(39)}`,
          label: `Node ${i+1}`,
          type: 'circular',
          risk: 0, flagged: false, balance: 0,
          color: WALLET_COLORS.circular,
          x: 500 + radius * Math.cos(angle),
          y: 300 + radius * Math.sin(angle),
          pulse: 0
        };
      }
    }
    
    setWallets(newWallets);
    setFlows([]);
    setAlerts([]);
    setStats({ totalAmount: 0, walletsFlagged: 0, transactionsCount: 0, patternsDetected: 0 });
    setStage('idle');
    setProgress(0);
    setCurrentTime(0);
  }, [selectedPattern]);

  const startAttack = async () => {
    if (running) return;
    
    initializeWallets();
    setRunning(true);
    setPaused(false);
    startTimeRef.current = Date.now();
    
    try {
      await api.post('/api/v1/attack/start', {
        pattern: selectedPattern,
        duration: PATTERN_CONFIGS[selectedPattern].duration
      });
      toast.success(`${PATTERN_CONFIGS[selectedPattern].name} started!`);
    } catch (e) {
      console.error('Failed to start attack:', e);
      toast.error('Failed to start simulation');
      setRunning(false);
    }
  };

  const pauseAttack = () => {
    setPaused(!paused);
    if (paused) {
      pausedTimeRef.current = Date.now();
    }
  };

  const stopAttack = async () => {
    setRunning(false);
    setPaused(false);
    cancelAnimationFrame(animationRef.current);
    
    try {
      await api.post('/api/v1/attack/stop');
      toast.info('Simulation stopped');
    } catch (e) {
      console.error('Failed to stop attack:', e);
    }
  };

  const resetAttack = () => {
    setRunning(false);
    setPaused(false);
    cancelAnimationFrame(animationRef.current);
    initializeWallets();
  };

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx!.clearRect(0, 0, rect.width, rect.height);
      
      // Draw flows
      flows.forEach(flow => {
        if (!flow.active && flow.progress < 1) return;
        
        const fromWallet = wallets[flow.from];
        const toWallet = wallets[flow.to];
        if (!fromWallet || !toWallet) return;
        
        const startX = fromWallet.x;
        const startY = fromWallet.y;
        const endX = toWallet.x;
        const endY = toWallet.y;
        
        const currentX = startX + (endX - startX) * flow.progress;
        const currentY = startY + (endY - startY) * flow.progress;
        
        // Flow line
        ctx!.beginPath();
        ctx!.moveTo(startX, startY);
        ctx!.lineTo(currentX, currentY);
        ctx!.strokeStyle = flow.highRisk ? '#ef4444' : '#64748b';
        ctx!.lineWidth = flow.highRisk ? 3 : 2;
        ctx!.setLineDash(flow.highRisk ? [] : [5, 5]);
        ctx!.stroke();
        ctx!.setLineDash([]);
        
        // Moving particle
        if (flow.active) {
          ctx!.beginPath();
          ctx!.arc(currentX, currentY, 6, 0, Math.PI * 2);
          ctx!.fillStyle = flow.highRisk ? '#ef4444' : '#fbbf24';
          ctx!.shadowColor = flow.highRisk ? '#ef4444' : '#fbbf24';
          ctx!.shadowBlur = 15;
          ctx!.fill();
          ctx!.shadowBlur = 0;
        }
      });
      
      // Draw wallets
      Object.values(wallets).forEach(wallet => {
        const pulseSize = 20 + Math.sin(Date.now() * 0.005 + wallet.x) * 3;
        const isFlagged = wallet.flagged;
        const isHighRisk = wallet.risk > 0.7;
        
        // Outer glow for flagged/high-risk
        if (isFlagged || isHighRisk) {
          const gradient = ctx!.createRadialGradient(
            wallet.x, wallet.y, 0,
            wallet.x, wallet.y, pulseSize * 2
          );
          gradient.addColorStop(0, `${wallet.color}40`);
          gradient.addColorStop(1, `${wallet.color}00`);
          ctx!.beginPath();
          ctx!.arc(wallet.x, wallet.y, pulseSize * 2, 0, Math.PI * 2);
          ctx!.fillStyle = gradient;
          ctx!.fill();
        }
        
        // Pulse ring for active wallets
        if (wallet.risk > 0 && wallet.risk < 1) {
          ctx!.beginPath();
          ctx!.arc(wallet.x, wallet.y, pulseSize + 5, 0, Math.PI * 2);
          ctx!.strokeStyle = `${wallet.color}60`;
          ctx!.lineWidth = 2;
          ctx!.stroke();
        }
        
        // Wallet circle
        ctx!.beginPath();
        ctx!.arc(wallet.x, wallet.y, pulseSize, 0, Math.PI * 2);
        ctx!.fillStyle = wallet.color;
        ctx!.fill();
        
        // Border for flagged
        if (isFlagged) {
          ctx!.beginPath();
          ctx!.arc(wallet.x, wallet.y, pulseSize, 0, Math.PI * 2);
          ctx!.strokeStyle = '#fff';
          ctx!.lineWidth = 3;
          ctx!.stroke();
        }
        
        // Label
        ctx!.fillStyle = '#fff';
        ctx!.font = 'bold 11px Inter, sans-serif';
        ctx!.textAlign = 'center';
        ctx!.fillText(wallet.label, wallet.x, wallet.y - pulseSize - 8);
        
        // Risk indicator
        if (wallet.risk > 0) {
          ctx!.fillStyle = isFlagged ? '#fff' : wallet.color;
          ctx!.font = '10px Inter, sans-serif';
          ctx!.fillText(`${(wallet.risk * 100).toFixed(0)}%`, wallet.x, wallet.y + pulseSize + 16);
        }
        
        // Balance
        if (wallet.balance > 0) {
          ctx!.fillStyle = '#94a3b8';
          ctx!.font = '9px Inter, sans-serif';
          ctx!.fillText(`₹${(wallet.balance/100000).toFixed(1)}L`, wallet.x, wallet.y + pulseSize + 28);
        }
        
        // Flag icon
        if (isFlagged) {
          ctx!.fillStyle = '#ef4444';
          ctx!.font = '14px Inter, sans-serif';
          ctx!.fillText('🚩', wallet.x + pulseSize + 5, wallet.y - 5);
        }
      });
      
      // Current time indicator
      ctx!.fillStyle = '#fff';
      ctx!.font = '14px Inter, sans-serif';
      ctx!.textAlign = 'left';
      ctx!.fillText(`${currentTime.toFixed(1)}s / ${duration}s`, 20, 30);
      
      animationRef.current = requestAnimationFrame(render);
    };
    
    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [wallets, flows, currentTime, duration]);

  const config = PATTERN_CONFIGS[selectedPattern];
  const severityConfig = running ? (progress > 80 ? SEVERITY_CONFIG.critical : progress > 50 ? SEVERITY_CONFIG.high : progress > 20 ? SEVERITY_CONFIG.medium : SEVERITY_CONFIG.info) : SEVERITY_CONFIG.info;

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6 p-4 bg-gradient-to-r from-purple-600/10 to-cyan-600/10 border border-purple-500/20 rounded-xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${severityConfig.bg} ${severityConfig.border}`}>
              {config.icon}
            </div>
            {running && (
              <motion.span 
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white/10"
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} 
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{config.name}</h2>
            <p className="text-gray-400 text-sm">{config.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge className={`${severityConfig.bg} ${severityConfig.border} text-${severityConfig.color.replace('#', '')} flex items-center gap-1`}>
            {severityConfig.icon}
            <span className="text-xs font-medium">
              {running ? (paused ? 'PAUSED' : 'LIVE') : 'READY'}
            </span>
          </Badge>
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
            {currentTime.toFixed(1)}s / {duration}s
          </Badge>
        </div>
      </motion.div>

      {/* Pattern Selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(Object.keys(PATTERN_CONFIGS) as AttackPattern[]).map(pattern => (
          <motion.button
            key={pattern}
            initial={{ scale: 0.9 }}
            animate={{ scale: selectedPattern === pattern ? 1 : 0.95 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => !running && setSelectedPattern(pattern)}
            disabled={running}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              selectedPattern === pattern
                ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white shadow-lg shadow-purple-500/25'
                : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:border-purple-500/30'
            } ${running ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {PATTERN_CONFIGS[pattern].icon}
            <span>{PATTERN_CONFIGS[pattern].name}</span>
            <span className="text-xs opacity-70">{PATTERN_CONFIGS[pattern].duration}s</span>
          </motion.button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 relative bg-gradient-to-br from-gray-900/50 to-gray-950/50 rounded-2xl border border-white/10 overflow-hidden"
          style={{ minWidth: 0 }}
        >
          <canvas 
            ref={canvasRef} 
            className="w-full h-full" 
            style={{ width: '100%', height: '100%' }}
          />
          
          {/* Stage Indicator */}
          <AnimatePresence mode="wait">
            {stage && stage !== 'idle' && stage !== 'complete' && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-10"
              >
                <div className="bg-black/80 backdrop-blur-sm px-6 py-3 rounded-full border border-purple-500/30 flex items-center gap-3">
                  <Radio className="w-5 h-5 text-purple-400" />
                  <span className="text-white font-medium">{stage.replace('_', ' ').toUpperCase()}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
            <motion.div 
              className="h-full bg-gradient-to-r from-purple-500 via-cyan-500 to-green-500 rounded-t"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          
          {/* Controls Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-3 z-10">
            {!running ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startAttack}
                className="mx-auto flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 text-white rounded-xl font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl"
              >
                <Play className="w-5 h-5" />
                <span>Start {config.name}</span>
                <span className="text-xs opacity-80">{config.duration}s</span>
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={pauseAttack}
                  className="flex-1 max-w-xs flex items-center justify-center gap-2 px-4 py-3 bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-xl font-medium hover:bg-amber-600/30"
                >
                  {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span>{paused ? 'Resume' : 'Pause'}</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopAttack}
                  className="flex-1 max-w-xs flex items-center justify-center gap-2 px-4 py-3 bg-red-600/20 border border-red-500/30 text-red-400 rounded-xl font-medium hover:bg-red-600/30"
                >
                  <Square className="w-5 h-5" />
                  <span>Stop</span>
                </motion.button>
              </>
            )}
          </div>
        </motion.div>

        {/* Side Panel */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }} 
          animate={{ opacity: 1, x: 0 }}
          className="w-80 flex flex-col gap-4 overflow-hidden"
        >
          {/* Live Stats */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Live Metrics
              </h3>
              <Badge className={`bg-${running ? 'green' : 'gray'}-500/20 text-${running ? 'green' : 'gray'}-400 border-${running ? 'green' : 'gray'}-500/30`}>
                {running ? (paused ? 'PAUSED' : 'STREAMING') : 'IDLE'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/50 p-3 rounded-xl">
                <p className="text-xs text-gray-400">Total Volume</p>
                <p className="text-2xl font-bold text-yellow-400">₹{(stats.totalAmount/100000).toFixed(1)}L</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-xl">
                <p className="text-xs text-gray-400">Tx Count</p>
                <p className="text-2xl font-bold text-cyan-400">{stats.transactionsCount}</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-xl">
                <p className="text-xs text-gray-400">Flagged</p>
                <p className="text-2xl font-bold text-red-400">{stats.walletsFlagged}</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-xl">
                <p className="text-xs text-gray-400">Patterns</p>
                <p className="text-2xl font-bold text-orange-400">{stats.patternsDetected}</p>
              </div>
            </div>
          </Card>

          {/* Wallet Network */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Network className="w-5 h-5 text-purple-400" />
                  Wallet Network
                </CardTitle>
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                  {Object.keys(wallets).length} nodes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-2">
                  {Object.entries(wallets).map(([key, wallet]) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-xl flex items-center gap-3 transition-all ${
                        wallet.flagged ? 'bg-red-500/10 border border-red-500/30 animate-pulse' :
                        wallet.risk > 0.5 ? 'bg-orange-500/10 border border-orange-500/30' :
                        wallet.risk > 0 ? 'bg-blue-500/10 border border-blue-500/20' :
                        'bg-gray-800/50 border border-gray-700'
                      }`}
                    >
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <div className={`w-full h-full rounded-full flex items-center justify-center ${wallet.flagged ? 'ring-2 ring-red-500' : ''}`} style={{ backgroundColor: wallet.color }}>
                          {wallet.type === 'source' && <DollarSign className="w-5 h-5 text-white" />}
                          {wallet.type === 'mule' && <Users className="w-5 h-5 text-white" />}
                          {wallet.type === 'collector' && <Target className="w-5 h-5 text-white" />}
                          {wallet.type === 'exchange' && <Shield className="w-5 h-5 text-white" />}
                          {wallet.type === 'intermediary' && <RotateCcw className="w-5 h-5 text-white" />}
                          {wallet.type === 'circular' && <Network className="w-5 h-5 text-white" />}
                        </div>
                        {wallet.flagged && (
                          <motion.span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                            🚩
                          </motion.span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{wallet.label}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{wallet.address.slice(0, 16)}...</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">Risk:</span>
                          <motion.div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full rounded-full" 
                              style={{ backgroundColor: wallet.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${wallet.risk * 100}%` }}
                              transition={{ duration: 0.5, delay: 0.2 }}
                            />
                          </motion.div>
                          <span className="text-xs font-bold" style={{ color: wallet.color }}>{(wallet.risk * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {wallet.balance > 0 && (
                          <p className="text-sm font-bold text-yellow-400">₹{(wallet.balance/100000).toFixed(1)}L</p>
                        )}
                        {wallet.flagged && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 mt-1">
                            <Skull className="w-3 h-3 mr-1" />
                            FLAGGED
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Alert Feed */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl flex-shrink-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Alert Feed
                </CardTitle>
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  {alerts.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-48">
                <div className="p-2 space-y-2">
                  {alerts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Radio className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Waiting for alerts...</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {alerts.slice(0, 10).map((alert, idx) => (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -50 }}
                          className={`p-3 rounded-xl flex items-start gap-3 ${SEVERITY_CONFIG[alert.severity].bg} ${SEVERITY_CONFIG[alert.severity].border}`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {SEVERITY_CONFIG[alert.severity].icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-white">{alert.title}</span>
                              <Badge variant="outline" className={`text-xs ${SEVERITY_CONFIG[alert.severity].border}`}>
                                {alert.severity.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-300">{alert.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(alert.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}