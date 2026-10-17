import React, { useState, useEffect } from 'react';
import { FileText, Clock, AlertTriangle, CheckCircle2, Shield, Download, ChevronRight, Scale } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface PendingSAR {
  id: string;
  walletId: string;
  riskScore: number;
  riskLevel: string;
  patternsFound: string[];
  fatfFlags: number;
  createdAt: string;
  deadline: string;
  status: 'PENDING' | 'FILED' | 'OVERDUE';
}

// Demo data — in production, this comes from the backend
const DEMO_SARS: PendingSAR[] = [
  { id: 'SAR-2026-0041', walletId: 'mule_net_7@paytm', riskScore: 0.94, riskLevel: 'CRITICAL', patternsFound: ['SMURFING', 'FAN_OUT'], fatfFlags: 3, createdAt: '2026-08-06T10:30:00Z', deadline: '2026-08-13T10:30:00Z', status: 'PENDING' },
  { id: 'SAR-2026-0040', walletId: 'shell_acct_3@ybl', riskScore: 0.87, riskLevel: 'HIGH', patternsFound: ['LAYERING', 'CROSS_PLATFORM'], fatfFlags: 2, createdAt: '2026-08-05T14:20:00Z', deadline: '2026-08-12T14:20:00Z', status: 'PENDING' },
  { id: 'SAR-2026-0039', walletId: 'nominee_x@okaxis', riskScore: 0.78, riskLevel: 'HIGH', patternsFound: ['STRUCTURING'], fatfFlags: 2, createdAt: '2026-08-03T09:15:00Z', deadline: '2026-08-10T09:15:00Z', status: 'OVERDUE' },
  { id: 'SAR-2026-0038', walletId: 'burst_sender@paytm', riskScore: 0.71, riskLevel: 'HIGH', patternsFound: ['BURST', 'THRESHOLD_EVASION'], fatfFlags: 1, createdAt: '2026-08-01T16:45:00Z', deadline: '2026-08-08T16:45:00Z', status: 'FILED' },
  { id: 'SAR-2026-0037', walletId: 'dormant_wake@ybl', riskScore: 0.65, riskLevel: 'MEDIUM', patternsFound: ['DORMANCY'], fatfFlags: 1, createdAt: '2026-07-29T11:00:00Z', deadline: '2026-08-05T11:00:00Z', status: 'FILED' },
];

const JURISDICTIONS = [
  { name: 'India (RBI)', riskScore: 72, sarsThisMonth: 14, status: 'ELEVATED' },
  { name: 'United States (FinCEN)', riskScore: 45, sarsThisMonth: 3, status: 'NORMAL' },
  { name: 'European Union', riskScore: 38, sarsThisMonth: 2, status: 'NORMAL' },
  { name: 'Singapore (MAS)', riskScore: 52, sarsThisMonth: 5, status: 'MODERATE' },
  { name: 'UAE (CBUAE)', riskScore: 68, sarsThisMonth: 9, status: 'ELEVATED' },
];

export default function ComplianceDashboard() {
  const [sars] = useState<PendingSAR[]>(DEMO_SARS);
  const [auditData, setAuditData] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/governance/audit`).then(r => r.ok ? r.json() : null).then(setAuditData).catch(() => {});
  }, []);

  const pending = sars.filter(s => s.status === 'PENDING').length;
  const overdue = sars.filter(s => s.status === 'OVERDUE').length;
  const filed = sars.filter(s => s.status === 'FILED').length;

  const statusColor: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    FILED: 'bg-green-500/20 text-green-300 border-green-500/30',
    OVERDUE: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  const riskBadge: Record<string, string> = {
    NORMAL: 'bg-green-500/20 text-green-300',
    MODERATE: 'bg-yellow-500/20 text-yellow-300',
    ELEVATED: 'bg-red-500/20 text-red-300',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0b10] to-[#0f1117] text-white p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Scale className="w-7 h-7 text-orange-400" />
          Compliance Officer Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">SAR tracking, FATF jurisdiction risk, regulatory deadlines & audit trail</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-500">Pending SARs</p>
          <p className="text-3xl font-bold text-yellow-300">{pending}</p>
          <p className="text-xs text-yellow-400/60 mt-1">Require filing</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-500">Overdue SARs</p>
          <p className="text-3xl font-bold text-red-300">{overdue}</p>
          <p className="text-xs text-red-400/60 mt-1">Past deadline</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-500">Filed This Month</p>
          <p className="text-3xl font-bold text-green-300">{filed}</p>
          <p className="text-xs text-green-400/60 mt-1">Submitted to FIU</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-500">Compliance Status</p>
          <p className="text-xl font-bold text-blue-300 mt-1">{overdue > 0 ? '⚠️ AT RISK' : '✅ COMPLIANT'}</p>
          <p className="text-xs text-blue-400/60 mt-1">{auditData?.complianceStatus || 'Active monitoring'}</p>
        </div>
      </div>

      {/* SAR Queue */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-400" />
            Suspicious Activity Reports Queue
          </h2>
          <span className="text-xs text-gray-500">{sars.length} total</span>
        </div>
        <div className="divide-y divide-white/5">
          {sars.map((sar) => {
            const daysLeft = Math.ceil((new Date(sar.deadline).getTime() - Date.now()) / 86400000);
            return (
              <div key={sar.id} className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex-shrink-0">
                  {sar.status === 'OVERDUE' ? <AlertTriangle className="w-5 h-5 text-red-400" /> :
                   sar.status === 'FILED' ? <CheckCircle2 className="w-5 h-5 text-green-400" /> :
                   <Clock className="w-5 h-5 text-yellow-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{sar.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColor[sar.status]}`}>{sar.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{sar.walletId} · {sar.patternsFound.join(', ')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${sar.riskScore >= 0.8 ? 'text-red-400' : sar.riskScore >= 0.6 ? 'text-orange-400' : 'text-yellow-400'}`}>
                    {(sar.riskScore * 100).toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-gray-600">
                    {sar.status === 'FILED' ? 'Submitted' : daysLeft > 0 ? `${daysLeft}d left` : `${Math.abs(daysLeft)}d overdue`}
                  </p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{sar.fatfFlags} FATF</span>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Jurisdiction Risk */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          FATF Jurisdiction Risk Scores
        </h2>
        <div className="space-y-3">
          {JURISDICTIONS.map((j) => (
            <div key={j.name} className="flex items-center gap-4">
              <span className="text-xs text-gray-400 w-40">{j.name}</span>
              <div className="flex-1">
                <div className="w-full h-3 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      j.riskScore >= 60 ? 'bg-gradient-to-r from-orange-500 to-red-500' :
                      j.riskScore >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                      'bg-gradient-to-r from-green-500 to-emerald-400'
                    }`}
                    style={{ width: `${j.riskScore}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-300 w-8 text-right font-mono">{j.riskScore}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${riskBadge[j.status]}`}>{j.status}</span>
              <span className="text-xs text-gray-600 w-16 text-right">{j.sarsThisMonth} SARs</span>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Trail */}
      {auditData && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Audit Trail</h2>
          <div className="space-y-2">
            {auditData.auditTrail?.map((event: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-200">{event.event}</p>
                  <p className="text-xs text-gray-500">{event.approvedBy} · {new Date(event.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {auditData.certifications?.map((cert: string, i: number) => (
              <span key={i} className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">{cert}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
