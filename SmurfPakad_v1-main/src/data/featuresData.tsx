import React from 'react';
import { Network, Shield, Brain, TrendingUp, AlertTriangle, Search, Zap, Crosshair, FileWarning, Eye } from 'lucide-react';

export const features = [
  {
    icon: <Network className="h-6 w-6" />,
    title: "Graph Neural Network",
    description: "Advanced GraphSAGE/GATv2 architecture detects complex smurfing topologies and layering patterns with 98.5% accuracy on the Elliptic dataset."
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: "SafeGuard Real-time Shield",
    description: "Chrome Extension intercepts UPI/wallet payments in real-time, scoring risk before money leaves your account — stopping fraud at the point of payment."
  },
  {
    icon: <Brain className="h-6 w-6" />,
    title: "IBM watsonx.ai Analysis",
    description: "Powered by IBM Granite models to generate analyst briefs, FATF red flag mapping, and regulatory advisories with enterprise-grade AI reasoning."
  },
  {
    icon: <Crosshair className="h-6 w-6" />,
    title: "War Room Investigation",
    description: "Deep-dive investigation workspace with interactive graph exploration, XAI feature importance, and one-click SAR report generation."
  },
  {
    icon: <Eye className="h-6 w-6" />,
    title: "Cross-Platform Silo Breaker",
    description: "Visualizes money flowing across Paytm, PhonePe, and GPay — exposing laundering chains invisible to single-platform monitoring."
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Live Threat Map",
    description: "Real-time animated threat visualization with WebSocket-powered alerts, geo-node tracking, and instant pattern classification."
  },
  {
    icon: <FileWarning className="h-6 w-6" />,
    title: "FATF-Compliant SAR Reports",
    description: "Generate regulatory-ready Suspicious Activity Reports with automated FATF Red Flag indicator mapping and branded PDF exports."
  },
  {
    icon: <Search className="h-6 w-6" />,
    title: "Explainable AI (XAI)",
    description: "Every risk score comes with feature importance breakdowns — see exactly why a wallet was flagged, not just that it was."
  },
  {
    icon: <TrendingUp className="h-6 w-6" />,
    title: "Pattern Detection Suite",
    description: "Detect Fan-Out/Fan-In, Gather-Scatter, Peeling Chains, threshold evasion, burst transactions, and cross-platform layering."
  },
];
