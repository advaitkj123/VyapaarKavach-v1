import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, Shield, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight, Cpu, Zap, FileWarning, Globe, Brain, ChevronLeft } from 'lucide-react';
import { agentApi } from '@/lib/api';
import { usePageEntrance } from '@/hooks/useGSAP';


interface InvestigationStep {
  tool: string;
  description: string;
  result: any;
  durationMs: number;
  timestamp: string;
}

interface InvestigationReport {
  investigationId: string;
  walletId: string;
  timestamp: string;
  status: string;
  totalDurationMs: number;
  stepsCompleted: number;
  steps: InvestigationStep[];
  summary: {
    riskScore: number;
    riskLevel: string;
    patternsFound: number;
    fatfFlagsTriggered: number;
    crossPlatformDetected: boolean;
    recommendedAction: string;
    poweredBy: string;
  };
  report: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  investigation?: InvestigationReport;
  isLoading?: boolean;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  'GNN Risk Scorer': <Brain className="w-4 h-4 text-purple-400" />,
  'Pattern Detector': <Zap className="w-4 h-4 text-yellow-400" />,
  'FATF Red Flag Mapper': <FileWarning className="w-4 h-4 text-red-400" />,
  'Transaction Context': <Cpu className="w-4 h-4 text-cyan-400" />,
  'Cross-Platform Scanner': <Globe className="w-4 h-4 text-green-400" />,
  'watsonx.ai Synthesis': <Bot className="w-4 h-4 text-blue-400" />,
};

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  FILE_SAR: { bg: 'bg-red-500/20 border-red-500/40', text: 'text-red-300', icon: <AlertTriangle className="w-5 h-5" /> },
  ESCALATE: { bg: 'bg-orange-500/20 border-orange-500/40', text: 'text-orange-300', icon: <AlertTriangle className="w-5 h-5" /> },
  MONITOR: { bg: 'bg-yellow-500/20 border-yellow-500/40', text: 'text-yellow-300', icon: <Shield className="w-5 h-5" /> },
  DISMISS: { bg: 'bg-green-500/20 border-green-500/40', text: 'text-green-300', icon: <CheckCircle2 className="w-5 h-5" /> },
};

function StepCard({ step, index }: { step: InvestigationStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[step.tool] || <Cpu className="w-4 h-4 text-gray-400" />;
  
  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-left"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold text-gray-300">{index + 1}</span>
        {icon}
        <span className="flex-1 text-sm text-gray-200">{step.tool}</span>
        <span className="text-xs text-gray-500 font-mono">{step.durationMs.toFixed(0)}ms</span>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
      </button>
      {expanded && (
        <div className="ml-12 mt-1 mb-2 px-3 py-2 bg-white/5 rounded-lg border border-white/5">
          <p className="text-xs text-gray-400 mb-2">{step.description}</p>
          <pre className="text-xs text-gray-300 overflow-auto max-h-40 font-mono">
            {JSON.stringify(step.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function InvestigationCard({ report }: { report: InvestigationReport }) {
  const [showSteps, setShowSteps] = useState(false);
  const actionStyle = ACTION_STYLES[report.summary.recommendedAction] || ACTION_STYLES.MONITOR;
  const riskColor = 
    report.summary.riskScore >= 0.7 ? 'text-red-400' :
    report.summary.riskScore >= 0.4 ? 'text-orange-400' :
    report.summary.riskScore >= 0.2 ? 'text-yellow-400' : 'text-green-400';
  const riskBg = 
    report.summary.riskScore >= 0.7 ? 'bg-red-500' :
    report.summary.riskScore >= 0.4 ? 'bg-orange-500' :
    report.summary.riskScore >= 0.2 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-200">{report.investigationId}</span>
        </div>
        <span className="text-xs text-gray-500 font-mono">{report.totalDurationMs.toFixed(0)}ms total</span>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-px bg-white/5">
        <div className="bg-[#0f1117] px-3 py-3 text-center">
          <p className={`text-2xl font-bold ${riskColor}`}>{(report.summary.riskScore * 100).toFixed(0)}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Risk Score</p>
        </div>
        <div className="bg-[#0f1117] px-3 py-3 text-center">
          <p className="text-2xl font-bold text-purple-400">{report.summary.patternsFound}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Patterns</p>
        </div>
        <div className="bg-[#0f1117] px-3 py-3 text-center">
          <p className="text-2xl font-bold text-red-400">{report.summary.fatfFlagsTriggered}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">FATF Flags</p>
        </div>
        <div className="bg-[#0f1117] px-3 py-3 text-center">
          <p className="text-2xl font-bold text-cyan-400">{report.stepsCompleted}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Steps Run</p>
        </div>
      </div>

      {/* Risk Bar */}
      <div className="px-4 py-2 bg-white/[0.02]">
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${riskBg}`}
            style={{ width: `${report.summary.riskScore * 100}%` }}
          />
        </div>
      </div>

      {/* Action Badge */}
      <div className="px-4 py-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${actionStyle.bg} ${actionStyle.text}`}>
          {actionStyle.icon}
          <span className="font-semibold text-sm">{report.summary.recommendedAction.replace('_', ' ')}</span>
          {report.summary.crossPlatformDetected && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">CROSS-PLATFORM</span>
          )}
        </div>
      </div>

      {/* Report Text */}
      <div className="px-4 pb-3">
        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-auto">
          {report.report}
        </pre>
      </div>

      {/* Steps Accordion */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setShowSteps(!showSteps)}
          className="w-full px-4 py-2 flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          {showSteps ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span>Agent Investigation Steps ({report.stepsCompleted})</span>
        </button>
        {showSteps && (
          <div className="px-2 pb-3 space-y-0.5">
            {report.steps.map((step, i) => (
              <StepCard key={i} step={step} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">Powered by {report.summary.poweredBy}</span>
        <span className="text-[10px] text-gray-600 font-mono">{new Date(report.timestamp).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      content: `**SmurfPakad AML Investigation Agent** ready.\n\nI orchestrate 6 specialized tools to investigate suspicious wallets:\n\n🧠 **GNN Risk Scorer** — GATv2 model scoring\n⚡ **Pattern Detector** — Structural pattern analysis\n🚩 **FATF Red Flag Mapper** — Regulatory compliance\n📊 **Transaction Context** — History & neighbors\n🌐 **Cross-Platform Scanner** — Multi-silo detection\n🔵 **watsonx.ai Synthesis** — IBM AI investigation report\n\nTry: *"Investigate mule_wallet_x@paytm"*`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    
    const loadingMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'agent',
      content: '🔍 Running investigation...',
      timestamp: new Date(),
      isLoading: true,
    };
    
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      // Determine if this is an investigation or chat
      const isInvestigation = /investigate|check|analyze|scan|score|0x|@/.test(text.toLowerCase());
      
      if (isInvestigation) {
        // Extract wallet ID
        const walletMatch = text.match(/(?:investigate|check|analyze|scan|score)\s+(.+)/i);
        const walletId = walletMatch?.[1]?.trim() || text;
        
        const report = await agentApi.investigate(walletId);
        
        setMessages(prev => prev.map(m =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: `Investigation complete for **${walletId}**.`,
                investigation: report,
                isLoading: false,
              }
            : m
        ));
      } else {
        const response = await agentApi.chat(text);
        setMessages(prev => prev.map(m =>
          m.id === loadingMsg.id
            ? { ...m, content: response.message, investigation: response.report, isLoading: false }
            : m
        ));
      }
    } catch (error) {
      console.error('Agent error:', error);
      // Ensure loading state is cleared on error
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: '⚠️ Agent error. Backend may be offline. Try again.', isLoading: false }
          : m
      ));
      setIsLoading(false);
  };

  const quickActions = [
    'Investigate mule_wallet_x@paytm',
    'Scan shell_company_7@phonepe',
    'Analyze 0x7f3a9b2c4d5e6f1a2b3c',
    'Check funnel_account_3@gpay',
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-b from-[#0a0b10] to-[#0f1117]">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                AML Investigation Agent
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  ONLINE
                </span>
              </h1>
              <p className="text-xs text-gray-500">Powered by IBM watsonx.ai Granite × SmurfHunter GATv2</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#054ADA]/10 border border-[#054ADA]/20">
            <span className="text-[#5B8DEF] font-bold text-xs">IBM</span>
            <span className="text-[#5B8DEF]/50 text-[10px]">watsonx.ai Agent</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-2' : ''}`}>
              {msg.role === 'agent' && (
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-gray-600">Agent</span>
                </div>
              )}
              <div className={`rounded-xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600/20 border border-blue-500/20 text-blue-100'
                  : 'bg-white/5 border border-white/5 text-gray-200'
              }`}>
                {msg.isLoading ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Running 6-tool investigation pipeline...</span>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
              </div>
              {msg.investigation && (
                <div className="mt-3">
                  <InvestigationCard report={msg.investigation} />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 2 && (
        <div className="flex-none px-6 pb-2">
          <p className="text-xs text-gray-600 mb-2">Quick investigations:</p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action}
                onClick={() => { setInput(action); inputRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-none px-6 py-4 border-t border-white/5">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Investigate a wallet address or ask an AML question..."
            disabled={isLoading}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
}
