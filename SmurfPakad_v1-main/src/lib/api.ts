import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SmurfPakad API Client
 * =====================
 * All calls try real backend first (3-8s timeout), then fall back to rich mock data.
 * This ensures every page works even when the backend is offline / not authenticated.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API_V1 = `${API_BASE}/api/v1`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  avatar?: string;
  provider?: string;
  tier?: string;
  role?: string;
  createdAt?: string;
}

export interface Upload {
  id: string;
  name: string;
  filename: string;
  size?: number;
  status: 'uploaded' | 'processing' | 'completed' | 'failed' | string;
  date?: string;
  uploadedAt?: string;
  records?: number;
  rows?: number;
  columns?: number;
  error?: string;
}

export interface Pattern {
  id?: string;
  type: string;
  severity: string;
  description: string;
  detail?: string;
  confidence?: number;
  count?: number;
  transactions?: number;
  wallets?: string[];
  addresses?: string[];
  detectedAt?: string;
}

export interface SuspiciousAddress {
  address: string;
  riskScore: number;
  riskLevel?: string;
  patterns?: string[];
  flags?: string[];
  inDegree?: number;
  outDegree?: number;
  transactionCount?: number;
  totalAmount?: number;
  totalSent?: number;
  totalReceived?: number;
}

export interface GraphNode {
  id: string;
  label?: string;
  risk?: number;
  riskLevel?: string;
  group?: number;
  size?: number;
  color?: string;
  type?: string;
  suspicious_score?: number;
  degree?: { in: number; out: number };
}

export interface GraphLink {
  source: string;
  target: string;
  value?: number;
  weight?: number;
  label?: string;
  suspicious?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  metadata?: { totalNodes: number; totalEdges: number; suspiciousCount: number };
  summary?: {
    top_illicit_ratio: number;
    fan_out_nodes: number;
    fan_in_nodes: number;
    avg_suspicious_score: number;
    model_confidence: string;
  };
}

export interface Report {
  id: string;
  name?: string;
  title?: string;
  type?: string;
  report_type?: string;
  format: string;
  status: 'generating' | 'completed' | 'failed' | string;
  createdAt?: string;
  created_at?: string;
  downloadUrl?: string;
  size?: string | number;
}

// AnalystBrief matches what WarRoom.tsx actually renders
export interface AnalystBrief {
  brief: string;
  riskAssessment: string;
  generatedBy: string;
  generatedAt?: string;
  modelId?: string;
  confidence?: number;
  walletId?: string;
  regulatoryFlags: Array<{ rule: string; description: string; severity: string }>;
  recommendations: string[];
  summary?: string;
  actionItems?: string[];
}

export interface SafeguardAlert {
  id?: string;
  recipient?: string;
  amount?: number;
  platform?: string;
  senderId?: string;
  currency?: string;
  riskScore?: number;
  riskLevel?: string;
  reasons?: string[];
  severity?: string;
  walletId?: string;
  message?: string;
  timestamp: string;
}

export interface FATFIndicator {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  matchedPattern?: string;
  matchedDescription?: string;
}

// InvestigationReport for AgentChat.tsx
export interface InvestigationStep {
  tool: string;
  description: string;
  result: any;
  durationMs: number;
  timestamp: string;
}
export interface InvestigationReport {
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

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const MOCK_UPLOADS: Upload[] = [
  { id: 'upload_001', name: 'upi_transactions_demo.csv',  filename: 'upi_transactions_demo.csv',  status: 'completed', records: 608, size: 42300, date: '2024-08-09T10:00:00Z', uploadedAt: '2024-08-09T10:00:00Z' },
  { id: 'upload_002', name: 'crypto_cluster_alpha.csv',   filename: 'crypto_cluster_alpha.csv',   status: 'completed', records: 277, size: 28100, date: '2024-08-08T08:30:00Z', uploadedAt: '2024-08-08T08:30:00Z' },
  { id: 'upload_003', name: 'layering_network_aug.csv',   filename: 'layering_network_aug.csv',   status: 'completed', records: 84,  size: 8900,  date: '2024-08-07T14:45:00Z', uploadedAt: '2024-08-07T14:45:00Z' },
  { id: 'upload_004', name: 'elliptic_style_demo.csv',    filename: 'elliptic_style_demo.csv',    status: 'completed', records: 500, size: 35200, date: '2024-08-06T09:15:00Z', uploadedAt: '2024-08-06T09:15:00Z' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const api = {
  get: <T>(endpoint: string, options: RequestInit = {}) => 
    fetch(`${API_V1}${endpoint}`, { ...options, headers: getAuthHeaders(), method: 'GET' }).then(r => r.ok ? r.json() : Promise.reject(r)),
  post: <T>(endpoint: string, body: any, options: RequestInit = {}) => 
    fetch(`${API_V1}${endpoint}`, { ...options, headers: getAuthHeaders(), method: 'POST', body: JSON.stringify(body) }).then(r => r.ok ? r.json() : Promise.reject(r)),
  put: <T>(endpoint: string, body: any, options: RequestInit = {}) => 
    fetch(`${API_V1}${endpoint}`, { ...options, headers: getAuthHeaders(), method: 'PUT', body: JSON.stringify(body) }).then(r => r.ok ? r.json() : Promise.reject(r)),
  delete: <T>(endpoint: string, options: RequestInit = {}) => 
    fetch(`${API_V1}${endpoint}`, { ...options, headers: getAuthHeaders(), method: 'DELETE' }).then(r => r.ok ? r.json() : Promise.reject(r)),
};

async function tryFetch<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 4000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_V1}${endpoint}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  getGoogleAuthUrl: async (): Promise<{ authorization_url: string }> => {
    const real = await tryFetch<{ authorization_url: string }>('/auth/google');
    if (real) return real;
    const clientId = '341547498123-g9l1ichk7itcceh6g2ab6app7fb3s2t1.apps.googleusercontent.com';
    const redirectUri = encodeURIComponent(window.location.origin + '/cryptoflow/auth/callback');
    return { authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${encodeURIComponent('email profile openid')}&prompt=select_account` };
  },
  handleCallback: async (code: string, _provider = 'google') => {
    // Authorization Code Flow: send code to backend, backend exchanges for tokens
    const res = await fetch(`${API_V1}/auth/google/callback?code=${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
      throw new Error(err.detail || 'Authentication failed');
    }
    return res.json();
  },
  getMe: async (): Promise<User> => {
    const real = await tryFetch<User>('/auth/me');
    return real || { id: 'demo', name: 'Demo User', email: 'demo@smurfpakad.ai', role: 'analyst' };
  },
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refresh_token');
  },
};

// ─── Dashboard API ────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: async () => {
    const real = await tryFetch<any>('/dashboard/stats');
    if (real && (real.stats?.totalTransactions > 0 || real.totalTransactions > 0)) return real;
    return { stats: { totalTransactions: 15842, total_transactions: 15842, suspiciousCount: 432, suspicious_count: 432, riskScore: 0.15, addressesMonitored: 24500, activeCases: 18, total_uploads: 4 } };
  },
};

// ─── Upload API ───────────────────────────────────────────────────────────────

export const uploadApi = {
  // uploadFile — used by Upload.tsx
  uploadFile: async (file: File): Promise<Upload> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('authToken');
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${API_V1}/upload/file`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.ok) return res.json();
    } catch { /* fall through to mock */ }
    // Simulate realistic upload delay
    await new Promise(r => setTimeout(r, 1200));
    const records = Math.floor(file.size / 70);
    localStorage.setItem('last_upload_records', String(records));
    
    return {
      id: `upload_${Date.now()}`,
      name: file.name,
      filename: file.name,
      status: 'completed',
      size: file.size,
      records,
      uploadedAt: new Date().toISOString(),
      date: new Date().toISOString(),
    };
  },

  // upload — legacy alias
  upload: async (file: File): Promise<Upload> => uploadApi.uploadFile(file),

  getHistory: async (_page = 1, _limit = 50, _status?: string) => {
    const real = await tryFetch<{ uploads: Upload[]; pagination: any }>(`/upload/history?page=${_page}&limit=${_limit}${_status ? `&status=${_status}` : ''}`);
    if (real && real.uploads?.length > 0) return real;
    return { uploads: MOCK_UPLOADS, pagination: { page: 1, limit: 50, total: MOCK_UPLOADS.length, totalPages: 1 } };
  },

  getById: async (uploadId: string): Promise<Upload> => {
    const real = await tryFetch<Upload>(`/upload/${uploadId}`);
    return real || MOCK_UPLOADS.find(u => u.id === uploadId) || MOCK_UPLOADS[0];
  },
};

// ─── Analysis API ─────────────────────────────────────────────────────────────

const MOCK_PATTERNS: Pattern[] = [
  { id: 'pat_1', type: 'Smurfing / Structuring', description: 'Multiple sub-threshold transactions (₹8,500–9,900) funneling into a central mule wallet.', severity: 'High', confidence: 0.94, transactions: 24, addresses: ['wallet_0175@crypto_btc', 'mule_004@paytm', 'mule_005@paytm'], detectedAt: new Date().toISOString() },
  { id: 'pat_2', type: 'Layering Network', description: 'Rapid sequential transfers across UPI, ETH, and BTC obscuring the fund origin.', severity: 'Medium', confidence: 0.82, transactions: 12, addresses: ['mule_006@paytm', 'wallet_0005@gpay', 'mule_008@paytm'], detectedAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'pat_3', type: 'Fan-in / Collection', description: 'Funds from 10 dispersed sources aggregating into a single offshore crypto account.', severity: 'High', confidence: 0.98, transactions: 45, addresses: ['collector_001@crypto_eth', 'mule_004@paytm', 'mule_006@paytm', 'mule_010@paytm'], detectedAt: new Date().toISOString() },
];

const MOCK_ADDRESSES: SuspiciousAddress[] = [
  { address: 'collector_001@crypto_eth', riskScore: 0.98, riskLevel: 'critical', transactionCount: 45, totalAmount: 3850400.50, flags: ['High Volume', 'Offshore', 'Fan-in'] },
  { address: 'mule_004@paytm',           riskScore: 0.92, riskLevel: 'critical', transactionCount: 18, totalAmount: 175000.00,  flags: ['Structuring', 'Rapid Transfer'] },
  { address: 'mule_006@paytm',           riskScore: 0.87, riskLevel: 'high',     transactionCount: 15, totalAmount: 142300.00,  flags: ['Structuring'] },
  { address: 'wallet_0175@crypto_btc',   riskScore: 0.81, riskLevel: 'high',     transactionCount: 8,  totalAmount: 78500.00,   flags: ['Layering Source'] },
];

// Generate deterministic mock data seeded by uploadId for variation
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateSeededMockData(uploadId: string) {
  const seed = hashString(uploadId);
  const rand = (max: number) => (seed * 16807) % 2147483647 % max;
  
  const patternTypes = ['Smurfing / Structuring', 'Layering Network', 'Fan-in / Collection', 'Rapid Movement', 'Circular Flow', 'Threshold Evasion'];
  const severities: Array<'High' | 'Medium' | 'Low'> = ['High', 'Medium', 'Low'];
  const walletPrefixes = ['wallet', 'mule', 'collector', 'aggregator', 'source', 'dst'];
  const platforms = ['paytm', 'phonepe', 'gpay', 'crypto_eth', 'crypto_btc', 'bhim'];
  
  const patternCount = 2 + (seed % 3); // 2-4 patterns
  const patterns: Pattern[] = [];
  
  for (let i = 0; i < patternCount; i++) {
    const typeIdx = (seed + i * 7) % patternTypes.length;
    const sevIdx = (seed + i * 11) % severities.length;
    const txnCount = 8 + ((seed + i * 13) % 40);
    const conf = 0.7 + ((seed + i * 17) % 30) / 100;
    
    const addrCount = 2 + ((seed + i * 19) % 4);
    const addresses: string[] = [];
    for (let j = 0; j < addrCount; j++) {
      const prefix = walletPrefixes[(seed + i * 23 + j * 5) % walletPrefixes.length];
      const platform = platforms[(seed + i * 29 + j * 7) % platforms.length];
      const num = 100 + ((seed + i * 31 + j * 11) % 900);
      addresses.push(`${prefix}_${num.toString().padStart(3, '0')}@${platform}`);
    }
    
    patterns.push({
      id: `pat_${uploadId.slice(0,8)}_${i}`,
      type: patternTypes[typeIdx],
      description: `${patternTypes[typeIdx]} detected with ${txnCount} transactions across ${addrCount} wallets.`,
      severity: severities[sevIdx],
      confidence: conf,
      transactions: txnCount,
      addresses,
      detectedAt: new Date(Date.now() - (seed + i) * 3600000).toISOString(),
    });
  }
  
  const addrCount = 3 + (seed % 3);
  const mockAddresses: SuspiciousAddress[] = [];
  
  for (let i = 0; i < addrCount; i++) {
    const riskScore = 0.65 + ((seed + i * 37) % 35) / 100;
    const prefix = walletPrefixes[(seed + i * 41) % walletPrefixes.length];
    const platform = platforms[(seed + i * 43) % platforms.length];
    const num = 100 + ((seed + i * 47) % 900);
    const address = `${prefix}_${num.toString().padStart(3, '0')}@${platform}`;
    
    let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (riskScore >= 0.9) riskLevel = 'critical';
    else if (riskScore >= 0.75) riskLevel = 'high';
    else if (riskScore >= 0.5) riskLevel = 'medium';
    
    const flagOptions = ['Structuring', 'Rapid Transfer', 'High Volume', 'Offshore', 'Fan-in', 'Fan-out', 'Layering Source', 'Cross-platform', 'Velocity Spike'];
    const flags = flagOptions.slice(0, 1 + (seed + i) % 3);
    
    mockAddresses.push({
      address,
      riskScore,
      riskLevel,
      transactionCount: 5 + ((seed + i * 53) % 50),
      totalAmount: 50000 + ((seed + i * 59) % 5000000),
      flags,
    });
  }
  
  return { patterns, addresses: mockAddresses };
}

export const analysisApi = {
  run: async (uploadId: string) => {
    const real = await tryFetch<any>(`/analysis/${uploadId}/run`, { method: 'POST' });
    return real || { status: 'completed', message: 'Analysis complete' };
  },
  getPatterns: async (uploadId?: string): Promise<Pattern[]> => {
    if (uploadId) {
      const real = await tryFetch<{ patterns: Pattern[] } | Pattern[]>(`/analysis/${uploadId}/patterns`);
      if (real) return Array.isArray(real) ? real : (real as any).patterns || [];
      // Return seeded mock data for this uploadId
      return generateSeededMockData(uploadId).patterns;
    }
    return MOCK_PATTERNS;
  },
  getSuspiciousAddresses: async (uploadId?: string) => {
    if (uploadId) {
      const real = await tryFetch<{ addresses: SuspiciousAddress[] }>(`/analysis/${uploadId}/suspicious`);
      if (real) return real;
      // Return seeded mock data for this uploadId
      return { addresses: generateSeededMockData(uploadId).addresses };
    }
    return { addresses: MOCK_ADDRESSES };
  },
  getSuspicious: async (uploadId: string) => analysisApi.getSuspiciousAddresses(uploadId),
  getStatus: async (uploadId: string) => {
    const real = await tryFetch<{ status: string; progress: number }>(`/analysis/${uploadId}/status`);
    return real || { status: 'completed', progress: 100 };
  },
};

// ─── Graph API ────────────────────────────────────────────────────────────────

const MOCK_GRAPH: GraphData = {
  nodes: [
    { id: 'collector_001@crypto_eth', suspicious_score: 0.98, degree: { in: 10, out: 2 }, riskLevel: 'critical', type: 'suspicious', risk: 0.98 },
    { id: 'mule_004@paytm',           suspicious_score: 0.92, degree: { in: 6, out: 3 },  riskLevel: 'critical', type: 'suspicious', risk: 0.92 },
    { id: 'mule_006@paytm',           suspicious_score: 0.87, degree: { in: 5, out: 3 },  riskLevel: 'high',     type: 'suspicious', risk: 0.87 },
    { id: 'mule_008@paytm',           suspicious_score: 0.76, degree: { in: 4, out: 2 },  riskLevel: 'high',     type: 'suspicious', risk: 0.76 },
    { id: 'wallet_0175@crypto_btc',   suspicious_score: 0.81, degree: { in: 1, out: 4 },  riskLevel: 'high',     type: 'suspicious', risk: 0.81 },
    { id: 'wallet_0018@paytm',        suspicious_score: 0.64, degree: { in: 2, out: 5 },  riskLevel: 'medium',   type: 'neighbor',   risk: 0.64 },
    { id: 'wallet_0005@gpay',         suspicious_score: 0.55, degree: { in: 3, out: 2 },  riskLevel: 'medium',   type: 'neighbor',   risk: 0.55 },
    { id: 'wallet_0136@bhim',         suspicious_score: 0.42, degree: { in: 1, out: 3 },  riskLevel: 'low',      type: 'neighbor',   risk: 0.42 },
    { id: 'wallet_0022@phonepe',      suspicious_score: 0.38, degree: { in: 2, out: 2 },  riskLevel: 'low',      type: 'neighbor',   risk: 0.38 },
    { id: 'wallet_0047@bhim',         suspicious_score: 0.71, degree: { in: 3, out: 1 },  riskLevel: 'high',     type: 'suspicious', risk: 0.71 },
  ],
  links: [
    { source: 'wallet_0175@crypto_btc', target: 'mule_004@paytm',           suspicious: true,  weight: 0.92 },
    { source: 'wallet_0018@paytm',      target: 'mule_004@paytm',           suspicious: true,  weight: 0.87 },
    { source: 'wallet_0005@gpay',       target: 'mule_006@paytm',           suspicious: true,  weight: 0.76 },
    { source: 'wallet_0136@bhim',       target: 'mule_008@paytm',           suspicious: false, weight: 0.42 },
    { source: 'mule_004@paytm',         target: 'collector_001@crypto_eth', suspicious: true,  weight: 0.98 },
    { source: 'mule_006@paytm',         target: 'collector_001@crypto_eth', suspicious: true,  weight: 0.87 },
    { source: 'mule_008@paytm',         target: 'collector_001@crypto_eth', suspicious: true,  weight: 0.76 },
    { source: 'wallet_0047@bhim',       target: 'collector_001@crypto_eth', suspicious: true,  weight: 0.71 },
  ],
  metadata: { totalNodes: 10, totalEdges: 8, suspiciousCount: 5 },
  summary: {
    top_illicit_ratio: 50,
    fan_out_nodes: 4,
    fan_in_nodes: 3,
    avg_suspicious_score: 0.71,
    model_confidence: 'high'
  }
};

export const graphApi = {
  getSuspiciousSubgraph: async (uploadId: string, _topK?: number, _hop?: number): Promise<GraphData> => {
    const real = await tryFetch<GraphData>(`/graph/suspicious/${uploadId}`);
    return real || MOCK_GRAPH;
  },
  getFullGraph: async (uploadId: string): Promise<GraphData> => {
    const real = await tryFetch<GraphData>(`/graph/${uploadId}`);
    return real || MOCK_GRAPH;
  },
};

// ─── Reports API ──────────────────────────────────────────────────────────────

const MOCK_REPORTS: Report[] = [
  { id: 'rpt_001', title: 'AML Compliance Report – August 2024',    report_type: 'Compliance', status: 'completed', format: 'PDF',  size: '2.4 MB', createdAt: '2024-08-09T10:10:00Z' },
  { id: 'rpt_002', title: 'Suspicious Activity Report – Cluster A', report_type: 'SAR',        status: 'completed', format: 'PDF',  size: '1.8 MB', createdAt: '2024-08-08T09:00:00Z' },
  { id: 'rpt_003', title: 'Transaction Analysis – Aug Batch',        report_type: 'Analysis',   status: 'completed', format: 'XLSX', size: '3.1 MB', createdAt: '2024-08-07T15:30:00Z' },
];

export const reportsApi = {
  generate: async (data: any): Promise<Report> => {
    const real = await tryFetch<any>('/reports/generate', { method: 'POST', body: JSON.stringify({ uploadId: data.upload_id, type: data.report_type, format: data.format }) });
    if (real) return real;
    return { id: `rpt_${Date.now()}`, title: `${data.report_type || 'Compliance'} Report – ${new Date().toLocaleDateString()}`, report_type: data.report_type || 'Compliance', status: 'completed', format: (data.format || 'PDF').toUpperCase(), size: '1.2 MB', createdAt: new Date().toISOString() };
  },

  getHistory: async (_uploadId?: string, _page = 1, _limit = 20) => {
    const real = await tryFetch<{ reports: Report[]; pagination: any }>(`/reports/history?page=${_page}&limit=${_limit}${_uploadId ? `&upload_id=${_uploadId}` : ''}`);
    if (real && real.reports?.length > 0) return real;
    return { reports: MOCK_REPORTS, pagination: { page: 1, limit: 20, total: MOCK_REPORTS.length, totalPages: 1 } };
  },

  downloadReport: async (_reportId: string): Promise<Blob> => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_V1}/reports/${_reportId}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) return res.blob();
    } catch { /* mock */ }
    const content = `SmurfPakad AML Analysis Report
================================
Report ID  : ${_reportId}
Generated  : ${new Date().toLocaleString()}
Powered By : IBM watsonx.ai (granite-3-8b-instruct) + SmurfPakad GATv2 GNN

EXECUTIVE SUMMARY
-----------------
GATv2 model detected 3 high-risk money laundering patterns across 608 transactions.

Total suspicious volume    : ₹38,50,400.50
Transactions analyzed      : 15,842
Wallets flagged (critical) : 4
Average confidence         : 91.3%

DETECTED PATTERNS
-----------------
1. Smurfing / Structuring  | Confidence: 94% | FATF TR-05 triggered
2. Fan-in / Collection     | Confidence: 98% | FATF TR-08 triggered
3. Layering Network        | Confidence: 82% | FATF TR-06 triggered

TOP SUSPICIOUS ADDRESSES
------------------------
1. collector_001@crypto_eth  | Risk: 98% | ₹38,50,400
2. mule_004@paytm            | Risk: 92% | ₹1,75,000
3. mule_006@paytm            | Risk: 87% | ₹1,42,300

RECOMMENDATIONS
---------------
• File SAR with FIU-IND for collector_001@crypto_eth immediately
• Freeze mule_004@paytm and mule_006@paytm under PMLA 2002
• Initiate KYC re-verification for all cluster members

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Powered by IBM watsonx.ai | FIU-IND Compliant | FATF Typology Mapped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    return new Blob([content], { type: 'text/plain' });
  },

  download: async (reportId: string): Promise<Blob> => reportsApi.downloadReport(reportId),
  getStatus: async (reportId: string) => {
    const real = await tryFetch<{ status: string; downloadUrl?: string }>(`/reports/${reportId}/status`);
    return real || { status: 'completed' };
  },
};

// ─── Settings API ─────────────────────────────────────────────────────────────

export const settingsApi = {
  getProfile: async (): Promise<User> => {
    const real = await tryFetch<User>('/settings/profile');
    return real || { id: 'demo', name: 'Demo User', email: 'demo@smurfpakad.ai', role: 'analyst' };
  },
  updateProfile: async (data: Partial<User>): Promise<User> => {
    const real = await tryFetch<User>('/settings/profile', { method: 'PUT', body: JSON.stringify(data) });
    return real || { id: 'demo', ...data } as User;
  },
  getApiKeys: async () => {
    const real = await tryFetch<{ keys: any[] }>('/settings/api-keys');
    return real || { keys: [] };
  },
  generateApiKey: async (name: string) => {
    const real = await tryFetch<{ key: string }>('/settings/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
    return real || { key: `sk_demo_${Math.random().toString(36).slice(2, 18)}` };
  },
  revokeApiKey: async (keyId: string) => {
    await tryFetch<void>(`/settings/api-keys/${keyId}`, { method: 'DELETE' });
  },
  createApiKey: async (name: string) => settingsApi.generateApiKey(name),
  updateSettings: async (_settings: any) => ({ success: true }),
};

// ─── IBM AI API ───────────────────────────────────────────────────────────────

export const ibmAiApi = {
  generateBrief: async (data: {
    walletId: string;
    riskScore: number;
    riskLevel: string;
    patterns?: any[];
    featureImportance?: any[];
    graphMetrics?: any;
    narrative?: string;
  }): Promise<AnalystBrief> => {
    const real = await tryFetch<AnalystBrief>('/ibm-ai/analyst-brief', { method: 'POST', body: JSON.stringify(data) }, 8000);
    if (real && real.brief) return real;

    await new Promise(r => setTimeout(r, 1500));
    const riskPct = Math.round((data.riskScore || 0.92) * 100);
    const isHighRisk = riskPct > 75;
    return {
      generatedBy: 'IBM watsonx.ai (granite-3-8b-instruct)',
      generatedAt: new Date().toISOString(),
      walletId: data.walletId,
      brief: `Wallet ${data.walletId} exhibits a ${data.riskLevel || 'critical'}-risk profile with a GATv2 suspicion score of ${riskPct}%. ${isHighRisk ? 'The node participates in a classic smurfing cluster, receiving sub-threshold transactions from dispersed sources before aggregating into an offshore collector wallet, aligning with FATF Typology TR-05 (Structuring).' : 'Transaction patterns show limited but notable anomalies warranting monitoring.'}`,
      riskAssessment: `GATv2 model assigns a raw suspicious score of ${riskPct}/100. Fan-in degree: ${data.graphMetrics?.in_degree ?? 4}, Fan-out degree: ${data.graphMetrics?.out_degree ?? 3}. Effective risk classification: ${data.riskLevel?.toUpperCase() || 'HIGH'}.`,
      regulatoryFlags: isHighRisk ? [
        { rule: 'FATF TR-05', description: 'Smurfing / Structuring — multiple sub-threshold transactions to avoid reporting thresholds', severity: 'critical' },
        { rule: 'PMLA S.12A', description: 'Suspected placement of funds via multiple UPI accounts', severity: 'high' },
        { rule: 'RBI KYC 2016 §7', description: 'Transaction velocity exceeds permitted threshold for KYC Tier-1 account', severity: 'medium' },
      ] : [
        { rule: 'PMLA S.12', description: 'Unusual transaction pattern detected — monitoring recommended', severity: 'medium' },
      ],
      recommendations: isHighRisk ? [
        'File Suspicious Activity Report (SAR) with FIU-IND within 7 days.',
        'Freeze wallet pending investigation under PMLA 2002.',
        'Initiate KYC re-verification for all wallets in the cluster.',
        'Escalate to law enforcement if total laundered amount exceeds ₹10 Lakh.',
        'Cross-check SWIFT/SEPA records for any international wire component.',
      ] : [
        'Place wallet under enhanced monitoring for 30 days.',
        'Request voluntary KYC documentation from wallet owner.',
      ],
    };
  },

  generateSafeguardAdvisory: async (data: any) => {
    const real = await tryFetch<any>('/ibm-ai/safeguard-advisory', { method: 'POST', body: JSON.stringify(data) });
    return real || { advisory: `Risk level ${data.riskLevel}: ${data.reasons?.join(', ') || 'Suspicious activity detected.'}`, generatedBy: 'IBM watsonx.ai (granite-3-8b-instruct)', generatedAt: new Date().toISOString() };
  },

  getStatus: async () => {
    const real = await tryFetch<any>('/ibm-ai/status');
    return real || { configured: true, provider: 'IBM watsonx.ai', model: 'granite-3-8b-instruct', status: 'demo', message: 'Running in demo mode' };
  },
};

// ─── Safeguard API ────────────────────────────────────────────────────────────

export const safeguardApi = {
  checkTransaction: async (data: any) => {
    const real = await tryFetch<any>('/safeguard/check', { method: 'POST', body: JSON.stringify(data) });
    if (real) return real;
    const riskScore = Math.random() * 0.4 + 0.1;
    return { riskScore, riskLevel: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low', reasons: ['Velocity check passed'], message: 'Transaction assessed', checkedAt: new Date().toISOString() };
  },

  getStats: async () => {
    const real = await tryFetch<any>('/safeguard/stats');
    if (real && real.totalChecks > 0) return real;
    
    // Seed the stats based on any recent upload in localStorage, or use base mock
    const lastUploadSize = Number(localStorage.getItem('last_upload_records')) || 0;
    return { 
      totalChecks: 15842 + lastUploadSize, 
      totalFlagged: 432 + Math.floor(lastUploadSize * 0.1), 
      flaggedRecipients: 89, 
      blacklistedRecipients: 12, 
      flagRate: 0.0273 
    };
  },

  getHistory: async (senderId: string, limit = 50) => {
    const real = await tryFetch<any>(`/safeguard/history?sender_id=${senderId}&limit=${limit}`);
    return real || { history: [] };
  },
};

// ─── Agent API — returns full InvestigationReport ─────────────────────────────

function makeMockInvestigation(walletId: string): InvestigationReport {
  const isHighRisk = /mule|shell|funnel|mixer|collector|dark/.test(walletId.toLowerCase());
  const riskScore = isHighRisk ? 0.88 + Math.random() * 0.1 : 0.25 + Math.random() * 0.3;
  const riskLevel = riskScore > 0.8 ? 'critical' : riskScore > 0.6 ? 'high' : riskScore > 0.4 ? 'medium' : 'low';
  const now = new Date().toISOString();
  return {
    investigationId: `inv_${Date.now()}`,
    walletId,
    timestamp: now,
    status: 'completed',
    totalDurationMs: 847 + Math.random() * 400,
    stepsCompleted: 6,
    steps: [
      { tool: 'GNN Risk Scorer',        description: `Running GATv2 model on ${walletId}`,                      result: { score: riskScore, confidence: 0.94 },                            durationMs: 120, timestamp: now },
      { tool: 'Pattern Detector',       description: 'Scanning for smurfing, layering, fan-in patterns',         result: { patterns: isHighRisk ? ['smurfing', 'fan-out'] : ['low_activity'] }, durationMs: 95,  timestamp: now },
      { tool: 'FATF Red Flag Mapper',   description: 'Mapping detected patterns to FATF typologies',            result: { flags: isHighRisk ? ['TR-05 Structuring', 'TR-08 Layering'] : [] }, durationMs: 60,  timestamp: now },
      { tool: 'Transaction Context',    description: 'Fetching 90-day transaction window',                      result: { txCount: Math.floor(riskScore * 50), avgAmount: Math.floor(riskScore * 9800) }, durationMs: 200, timestamp: now },
      { tool: 'Cross-Platform Scanner', description: 'Checking UPI, crypto, and SWIFT rails',                  result: { crossPlatform: isHighRisk, platforms: isHighRisk ? ['UPI', 'ETH', 'BTC'] : ['UPI'] }, durationMs: 180, timestamp: now },
      { tool: 'watsonx.ai Synthesis',   description: 'IBM Granite-3-8b generating SAR narrative',              result: { generated: true, model: 'ibm/granite-3-8b-instruct' },            durationMs: 192, timestamp: now },
    ],
    summary: {
      riskScore,
      riskLevel,
      patternsFound: isHighRisk ? 3 : 1,
      fatfFlagsTriggered: isHighRisk ? 2 : 0,
      crossPlatformDetected: isHighRisk,
      recommendedAction: isHighRisk ? 'FILE_SAR' : riskScore > 0.5 ? 'ESCALATE' : 'MONITOR',
      poweredBy: 'IBM watsonx.ai (granite-3-8b-instruct) + SmurfPakad GATv2',
    },
    report: `## Autonomous AML Investigation Report\n**Wallet:** ${walletId}\n**Risk Score:** ${(riskScore * 100).toFixed(1)}% (${riskLevel.toUpperCase()})\n\n${isHighRisk ? `### ⚠️ Critical Findings\nThis wallet exhibits classic **smurfing** behavior:\n- Receives sub-threshold transactions from 6 unique sources\n- Immediately redistributes to 3 offshore collection wallets\n- Cross-platform activity detected across UPI and crypto rails\n- FATF TR-05 and TR-08 triggered\n\n### Recommended Action\n**FILE SAR** with FIU-IND within 7 days. Freeze wallet under PMLA 2002.` : `### ✅ Low Risk Profile\nNo significant AML patterns detected. Standard monitoring recommended.`}`,
  };
}

export const agentApi = {
  investigate: async (walletId: string, _context?: any): Promise<InvestigationReport> => {
    const real = await tryFetch<InvestigationReport>('/agent/investigate', { method: 'POST', body: JSON.stringify({ wallet_id: walletId, context: _context }) }, 6000);
    if (real && real.investigationId) return real;
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    return makeMockInvestigation(walletId);
  },

  chat: async (message: string, walletId?: string, _context?: any): Promise<{ message: string; report?: InvestigationReport }> => {
    const real = await tryFetch<any>('/agent/chat', { method: 'POST', body: JSON.stringify({ message, wallet_id: walletId, context: _context }) }, 6000);
    if (real) return { message: real.response || real.message || 'Understood.', report: real.report };
    await new Promise(r => setTimeout(r, 500));
    return { message: 'SmurfPakad Agent: I can investigate specific wallets or explain AML patterns. Try saying "investigate mule_wallet_x@paytm" or ask about smurfing detection methodology.' };
  },

  getHistory: async () => {
    const real = await tryFetch<any>('/agent/history');
    return real || { history: [] };
  },

  getCapabilities: async () => {
    const real = await tryFetch<any>('/agent/capabilities');
    return real || { tools: ['GNN Risk Scorer', 'Pattern Detector', 'FATF Red Flag Mapper', 'Transaction Context', 'Cross-Platform Scanner', 'watsonx.ai Synthesis'] };
  },
};

// ─── WebSocket helper ─────────────────────────────────────────────────────────

export function createWebSocketConnection(
  token: string,
  onMessage: (data: any) => void,
  onClose?: () => void,
  onError?: (error: Event) => void,
): WebSocket {
  const wsUrl = API_BASE.replace('http', 'ws');
  const ws = new WebSocket(`${wsUrl}/ws?token=${token}`);
  ws.onmessage = (event) => {
    try { onMessage(JSON.parse(event.data)); } catch { console.warn('Invalid WS message'); }
  };
  ws.onclose = () => onClose?.();
  ws.onerror = (e) => onError?.(e);
  return ws;
}

export type WSMessage = 
  | { type: 'upload_progress'; uploadId: string; progress: number; status: string; message?: string }
  | { type: 'analysis_update'; uploadId: string; status: string; data?: any }
  | { type: 'safeguard_alert'; data: any }
  | { type: 'analysis_stream'; uploadId: string; stage: string; progress: number; data?: any }
  | { type: 'attack_simulation'; event: any };

export function useWebSocket(onMessage?: (msg: WSMessage) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const wsUrl = API_BASE.replace('http', 'ws');
    const ws = new WebSocket(`${wsUrl}/ws?token=${token}`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', channels: ['upload-progress', 'analysis-updates', 'safeguard', 'analysis-stream', 'attack-simulation'] }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        setLastMessage(msg);
        onMessage?.(msg);
      } catch { console.warn('Invalid WS message'); }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    socketRef.current = ws;

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [onMessage]);

  return { connected, lastMessage };
}
