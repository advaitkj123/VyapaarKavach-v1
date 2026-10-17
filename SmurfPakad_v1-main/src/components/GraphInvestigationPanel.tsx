/**
 * GraphInvestigationPanel — Hackathon demo surface
 * Click a wallet → Explain why flagged · Generate SAR · Live Safeguard · Cross-rail view
 */
import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Brain, FileText, Shield, Loader2, AlertTriangle, Zap,
  Network, CheckCircle2, Ban, ArrowRightLeft,
} from "lucide-react";
import { ibmAiApi, safeguardApi, type AnalystBrief } from "@/lib/api";
import { generateSARPdf } from "@/components/SARPdfGenerator";
import CrossPlatformGraph from "@/components/CrossPlatformGraph";
import { toast } from "@/components/ToastNotification";

export interface InvestigableNode {
  id: string;
  risk_level?: string;
  suspicious_score?: number;
  degree?: { in: number; out: number };
  class?: string;
  top_k?: boolean;
}

function detectPlatform(id: string): string {
  const s = id.toLowerCase();
  if (s.includes("paytm")) return "Paytm";
  if (s.includes("phonepe")) return "PhonePe";
  if (s.includes("gpay") || s.includes("google")) return "GPay";
  if (s.includes("bhim")) return "BHIM";
  if (s.includes("crypto") || s.includes("btc") || s.includes("eth") || s.startsWith("0x")) return "Crypto";
  if (s.includes("@")) return s.split("@")[1] || "UPI";
  return "Unknown rail";
}

function buildLocalExplanation(node: InvestigableNode) {
  const inDeg = node.degree?.in ?? 0;
  const outDeg = node.degree?.out ?? 0;
  const score = node.suspicious_score ?? 0;
  const reasons: string[] = [];
  const fatf: Array<{ rule: string; description: string; severity: string }> = [];

  if (outDeg >= 3) {
    reasons.push(`Fan-out structuring: sends to ${outDeg} destinations (classic smurfing scatter).`);
    fatf.push({ rule: "FATF TR-05", description: "Structuring / smurfing via multiple outbound hops", severity: "critical" });
  }
  if (inDeg >= 3) {
    reasons.push(`Fan-in collection: receives from ${inDeg} sources (aggregation hub).`);
    fatf.push({ rule: "FATF TR-08", description: "Layering / collection through intermediary wallets", severity: "high" });
  }
  if (inDeg >= 2 && outDeg >= 2) {
    reasons.push(`Mule signature: both fan-in (${inDeg}) and fan-out (${outDeg}) on the same wallet.`);
  }
  if (score >= 0.65) {
    reasons.push(`GATv2 + heuristic risk score ${(score * 100).toFixed(1)}% exceeds high-risk threshold.`);
  } else if (score >= 0.35) {
    reasons.push(`Elevated suspicion ${(score * 100).toFixed(1)}% — warrants enhanced monitoring.`);
  }
  if (node.top_k) {
    reasons.push("Selected as a top-K seed node in the suspicious subgraph extraction.");
  }
  if (reasons.length === 0) {
    reasons.push("No strong structural anomalies; activity appears within normal bounds.");
  }

  const platform = detectPlatform(node.id);
  if (platform !== "Unknown rail") {
    reasons.push(`Active on ${platform} rail — check for cross-platform hops in the chain.`);
  }

  return { reasons, fatf, platform, inDeg, outDeg, score };
}

interface Props {
  node: InvestigableNode | null;
  onClear?: () => void;
}

export default function GraphInvestigationPanel({ node, onClear }: Props) {
  const [brief, setBrief] = useState<AnalystBrief | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [sarLoading, setSarLoading] = useState(false);
  const [safeguardLoading, setSafeguardLoading] = useState(false);
  const [safeguardResult, setSafeguardResult] = useState<{
    riskScore: number;
    riskLevel: string;
    reasons?: string[];
    message?: string;
    blocked?: boolean;
  } | null>(null);
  const [sgAmount, setSgAmount] = useState("98500");
  const [sgRecipient, setSgRecipient] = useState("collector_offshore@crypto_eth");
  const [showCrossPlatform, setShowCrossPlatform] = useState(false);

  const local = useMemo(() => (node ? buildLocalExplanation(node) : null), [node]);

  const runExplain = useCallback(async () => {
    if (!node || !local) return;
    setExplaining(true);
    setBrief(null);
    try {
      const result = await ibmAiApi.generateBrief({
        walletId: node.id,
        riskScore: local.score,
        riskLevel: node.risk_level || (local.score >= 0.65 ? "high" : local.score >= 0.35 ? "medium" : "low"),
        patterns: local.reasons.map((r, i) => ({
          type: i === 0 ? "smurfing" : "structural",
          severity: local.score >= 0.65 ? "critical" : "medium",
          description: r,
        })),
        graphMetrics: { in_degree: local.inDeg, out_degree: local.outDeg, total_connections: local.inDeg + local.outDeg },
        narrative: local.reasons.join(" "),
      });
      setBrief(result);
      toast.success("Explainability brief ready (watsonx.ai)");
    } catch (e) {
      toast.error("Failed to generate explanation");
      console.error(e);
    } finally {
      setExplaining(false);
    }
  }, [node, local]);

  const runSAR = useCallback(async () => {
    if (!node || !local) return;
    setSarLoading(true);
    try {
      let activeBrief = brief;
      if (!activeBrief) {
        activeBrief = await ibmAiApi.generateBrief({
          walletId: node.id,
          riskScore: local.score,
          riskLevel: node.risk_level || "high",
          patterns: local.reasons.map((r) => ({ type: "smurfing", severity: "high", description: r })),
          graphMetrics: { in_degree: local.inDeg, out_degree: local.outDeg, total_connections: local.inDeg + local.outDeg },
        });
        setBrief(activeBrief);
      }
      await generateSARPdf({
        walletId: node.id,
        riskScore: local.score,
        riskLevel: node.risk_level || (activeBrief.riskAssessment?.includes("HIGH") ? "high" : "medium"),
        patterns: local.reasons.map((r) => ({
          type: "Smurfing / Structural",
          severity: local.score >= 0.65 ? "critical" : "medium",
          description: r,
        })),
        featureImportance: [
          { feature_name: "in_degree", importance: Math.min(1, local.inDeg / 10), value: local.inDeg },
          { feature_name: "out_degree", importance: Math.min(1, local.outDeg / 10), value: local.outDeg },
          { feature_name: "gnn_score", importance: local.score, value: local.score },
        ],
        graphMetrics: { in_degree: local.inDeg, out_degree: local.outDeg, total_connections: local.inDeg + local.outDeg },
        analystBrief: activeBrief.brief,
        riskAssessment: activeBrief.riskAssessment,
        regulatoryFlags: activeBrief.regulatoryFlags || local.fatf,
        recommendations: activeBrief.recommendations,
      });
      toast.success("FIU-IND SAR PDF downloaded");
    } catch (e) {
      toast.error("SAR generation failed");
      console.error(e);
    } finally {
      setSarLoading(false);
    }
  }, [node, local, brief]);

  const runSafeguard = useCallback(async () => {
    if (!node) return;
    setSafeguardLoading(true);
    setSafeguardResult(null);
    try {
      const amount = Number(sgAmount) || 0;
      const result = await safeguardApi.checkTransaction({
        senderId: node.id,
        recipient: sgRecipient,
        amount,
        platform: detectPlatform(node.id).toLowerCase(),
        currency: "INR",
      });

      // Demo enrichment: structuring-sized amounts from high-risk wallets → block
      const nodeScore = node.suspicious_score ?? 0;
      let riskScore = result.riskScore ?? 0.2;
      let riskLevel = result.riskLevel || "low";
      const reasons: string[] = [...(result.reasons || [])];

      if (amount > 0 && amount < 100000 && nodeScore >= 0.5) {
        riskScore = Math.max(riskScore, 0.88);
        riskLevel = "critical";
        reasons.push("Sub-threshold amount from high-risk wallet (structuring pattern)");
        reasons.push(`Sender risk ${(nodeScore * 100).toFixed(0)}% · GATv2 flagged`);
      }
      if (detectPlatform(sgRecipient) !== detectPlatform(node.id) && detectPlatform(sgRecipient) !== "Unknown rail") {
        riskScore = Math.max(riskScore, 0.75);
        if (riskLevel === "low" || riskLevel === "medium") riskLevel = "high";
        reasons.push(`Cross-platform hop: ${detectPlatform(node.id)} → ${detectPlatform(sgRecipient)}`);
      }

      const blocked = riskScore >= 0.7 || riskLevel === "critical" || riskLevel === "high";
      setSafeguardResult({
        riskScore,
        riskLevel,
        reasons: reasons.length ? reasons : ["Transaction within policy limits"],
        message: blocked
          ? "BLOCKED — would not settle. Escalate to AML desk."
          : result.message || "Allowed with monitoring",
        blocked,
      });
      toast[blocked ? "error" : "success"](
        blocked ? "Safeguard BLOCKED transaction" : "Safeguard cleared transaction"
      );
    } catch (e) {
      toast.error("Safeguard check failed");
      console.error(e);
    } finally {
      setSafeguardLoading(false);
    }
  }, [node, sgAmount, sgRecipient]);

  if (!node) {
    return (
      <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
        <CardContent className="pt-6 text-sm text-gray-500 dark:text-gray-400">
          Click any wallet node on the graph to open Explain · SAR · Live Safeguard.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="dark:bg-white/5 dark:border-crypto-purple/20 border-crypto-purple/30">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-crypto-purple" />
                Investigate wallet
              </CardTitle>
              <p className="font-mono text-xs text-gray-400 mt-1 break-all">{node.id}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={
                (node.suspicious_score || 0) >= 0.65
                  ? "bg-red-500/20 text-red-300"
                  : (node.suspicious_score || 0) >= 0.35
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
              }>
                {((node.suspicious_score || 0) * 100).toFixed(0)}% · {node.risk_level || "low"}
              </Badge>
              {onClear && (
                <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Local structural why */}
          {local && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Why flagged (structural + GATv2)
              </div>
              <ul className="space-y-1.5 text-xs text-gray-300">
                {local.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-crypto-purple shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[10px]">{local.platform}</Badge>
                <Badge variant="outline" className="text-[10px]">in {local.inDeg}</Badge>
                <Badge variant="outline" className="text-[10px]">out {local.outDeg}</Badge>
                {local.fatf.map((f) => (
                  <Badge key={f.rule} className="bg-red-500/15 text-red-300 text-[10px]">{f.rule}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Action row */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-crypto-purple hover:bg-crypto-dark-purple"
              onClick={runExplain}
              disabled={explaining}
            >
              {explaining ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1.5" />}
              watsonx Explain
            </Button>
            <Button size="sm" variant="outline" onClick={runSAR} disabled={sarLoading}>
              {sarLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
              Generate SAR PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCrossPlatform((v) => !v)}
            >
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
              {showCrossPlatform ? "Hide" : "Show"} Cross-Platform
            </Button>
          </div>

          {/* watsonx brief */}
          {brief && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2 text-xs">
              <div className="font-semibold text-indigo-300 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                {brief.generatedBy || "IBM watsonx.ai"}
              </div>
              <p className="text-gray-300 leading-relaxed">{brief.brief}</p>
              {brief.riskAssessment && (
                <p className="text-gray-400"><span className="text-white font-medium">Risk: </span>{brief.riskAssessment}</p>
              )}
              {brief.recommendations?.length ? (
                <div>
                  <div className="text-white font-medium mb-1">Recommendations</div>
                  <ul className="space-y-1 text-gray-400">
                    {brief.recommendations.slice(0, 4).map((r, i) => (
                      <li key={i}>→ {r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {/* Live Safeguard */}
          <div className="rounded-lg border border-white/10 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-emerald-400" />
              Live Safeguard — block before settle
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">Amount (₹)</Label>
                <Input
                  value={sgAmount}
                  onChange={(e) => setSgAmount(e.target.value)}
                  className="h-8 text-sm dark:bg-gray-900"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Recipient</Label>
                <Input
                  value={sgRecipient}
                  onChange={(e) => setSgRecipient(e.target.value)}
                  className="h-8 text-sm dark:bg-gray-900"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={runSafeguard}
              disabled={safeguardLoading}
            >
              {safeguardLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}
              Check &amp; Block Simulation
            </Button>
            {safeguardResult && (
              <div className={`rounded-md p-3 text-xs space-y-1.5 ${
                safeguardResult.blocked
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-emerald-500/10 border border-emerald-500/30"
              }`}>
                <div className="flex items-center gap-2 font-semibold">
                  {safeguardResult.blocked
                    ? <Ban className="h-4 w-4 text-red-400" />
                    : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  <span className={safeguardResult.blocked ? "text-red-300" : "text-emerald-300"}>
                    {safeguardResult.message}
                  </span>
                </div>
                <div className="text-gray-300">
                  Score {(safeguardResult.riskScore * 100).toFixed(0)}% · {safeguardResult.riskLevel}
                </div>
                <ul className="text-gray-400 space-y-0.5">
                  {(safeguardResult.reasons || []).map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showCrossPlatform && (
        <Card className="dark:bg-white/5 dark:border-crypto-purple/20 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4 text-crypto-purple" />
              Cross-platform laundering chain
            </CardTitle>
            <p className="text-xs text-gray-400">
              Banks see one silo. SmurfPakad stitches Paytm → PhonePe → GPay → crypto.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <CrossPlatformGraph />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
