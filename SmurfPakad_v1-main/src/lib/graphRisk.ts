/**
 * Client-side graph risk enrichment.
 * Ensures nodes get real fan-in / fan-out scores even when the ML model
 * returns near-uniform probabilities (common with padded custom CSVs).
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskEdge {
  source: string;
  target: string;
  weight?: number;
  suspicious?: boolean;
  high_risk?: boolean;
  [key: string]: unknown;
}

export interface RiskNode {
  id: string;
  degree?: { in: number; out: number };
  suspicious_score?: number;
  suspiciousScore?: number;
  risk?: number;
  mlScore?: number;
  risk_level?: string;
  riskLevel?: string;
  [key: string]: unknown;
}

export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 0.9) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

/** Structural smurfing score from directed degrees + optional ML signal. */
export function computeWalletRisk(inDeg: number, outDeg: number, mlScore = 0): number {
  let risk = 0;
  const total = inDeg + outDeg;

  if (outDeg >= 2) risk += 0.25;
  if (outDeg >= 4) risk += 0.15;
  if (inDeg >= 2) risk += 0.25;
  if (inDeg >= 4) risk += 0.15;
  if (inDeg >= 2 && outDeg >= 2) risk += 0.2;
  if (total >= 4) risk += 0.1;
  if (mlScore > 0) risk += 0.15 * Math.min(1, mlScore);

  return Math.min(1, risk);
}

/** Color for ForceGraph / legend — driven by score, not just a string label. */
export function riskColor(scoreOrLevel: number | string): string {
  if (typeof scoreOrLevel === 'string') {
    const level = scoreOrLevel.toLowerCase();
    if (level === 'critical' || level === 'high') return '#ef4444';
    if (level === 'medium') return '#f59e0b';
    return '#10b981';
  }
  if (scoreOrLevel >= 0.65) return '#ef4444';
  if (scoreOrLevel >= 0.35) return '#f59e0b';
  return '#10b981';
}

export interface SmurfPattern {
  id: string;
  type: 'fan_in' | 'fan_out' | 'smurf_mule' | 'collector';
  fatf: string;
  walletId: string;
  score: number;
  detail: string;
}

/** Detect demo-ready smurfing patterns from an enriched graph. */
export function detectSmurfPatterns(nodes: RiskNode[]): SmurfPattern[] {
  const patterns: SmurfPattern[] = [];

  for (const n of nodes) {
    const inDeg = n.degree?.in ?? 0;
    const outDeg = n.degree?.out ?? 0;
    const score = n.suspicious_score ?? n.suspiciousScore ?? 0;
    const id = String(n.id);

    if (inDeg >= 3 && outDeg <= 2 && score >= 0.35) {
      patterns.push({
        id: `collector-${id}`,
        type: 'collector',
        fatf: 'FATF TR-08',
        walletId: id,
        score,
        detail: `Collection hub: ${inDeg} inbound → few outflows (fan-in)`,
      });
    }
    if (outDeg >= 3 && inDeg <= 2 && score >= 0.35) {
      patterns.push({
        id: `fanout-${id}`,
        type: 'fan_out',
        fatf: 'FATF TR-05',
        walletId: id,
        score,
        detail: `Structuring: splits to ${outDeg} destinations (fan-out)`,
      });
    }
    if (inDeg >= 2 && outDeg >= 2 && score >= 0.5) {
      patterns.push({
        id: `mule-${id}`,
        type: 'smurf_mule',
        fatf: 'FATF TR-05/08',
        walletId: id,
        score,
        detail: `Mule signature: fan-in (${inDeg}) + fan-out (${outDeg})`,
      });
    }
  }

  return patterns.sort((a, b) => b.score - a.score).slice(0, 8);
}

/**
 * Recompute degrees from edges, amplify risk with structural heuristics,
 * and mark high-risk edges so the viz is never "all green / no lines".
 */
export function enrichGraphRisk<T extends { nodes?: RiskNode[]; edges?: RiskEdge[]; links?: RiskEdge[] }>(
  data: T
): T & { nodes: RiskNode[]; edges: RiskEdge[]; patterns: SmurfPattern[] } {
  const rawEdges = (data.edges?.length ? data.edges : data.links) || [];
  const edges: RiskEdge[] = rawEdges
    .map((e) => ({
      ...e,
      source: String((e as any).source?.id ?? e.source ?? (e as any).from ?? ''),
      target: String((e as any).target?.id ?? e.target ?? (e as any).to ?? ''),
    }))
    .filter((e) => e.source && e.target);

  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  for (const e of edges) {
    outCount.set(e.source, (outCount.get(e.source) || 0) + 1);
    inCount.set(e.target, (inCount.get(e.target) || 0) + 1);
  }

  const nodes: RiskNode[] = (data.nodes || []).map((n, index) => {
    const id = String(n.id ?? `node_${index}`);
    const edgeIn = inCount.get(id) || 0;
    const edgeOut = outCount.get(id) || 0;
    // Prefer edge-derived degrees when backend degrees are missing/zero
    const apiIn = n.degree?.in ?? 0;
    const apiOut = n.degree?.out ?? 0;
    const inDeg = Math.max(apiIn, edgeIn);
    const outDeg = Math.max(apiOut, edgeOut);

    const ml =
      Number(n.suspicious_score ?? n.suspiciousScore ?? n.mlScore ?? n.risk ?? 0) || 0;
    // Normalize accidental percent scores (e.g. 87 → 0.87)
    const mlNorm = ml > 1 ? ml / 100 : ml;

    const structural = computeWalletRisk(inDeg, outDeg, mlNorm);
    // Never let a flat ML prior hide clear structural risk
    let score = Math.max(mlNorm, structural);
    // Seed / top-K suspicious nodes from the model must stay visually hot
    const isSeed = n.top_k === true || (n as any).isSeedNode === true || (n as any).type === 'suspicious';
    if (isSeed) score = Math.max(score, 0.72);
    // Rank boost: denser wallets are more interesting in AML demos
    if (inDeg + outDeg >= 3) score = Math.max(score, 0.4);

    const level = scoreToRiskLevel(score);

    return {
      ...n,
      id,
      degree: { in: inDeg, out: outDeg },
      suspicious_score: score,
      suspiciousScore: score,
      risk: score,
      risk_level: level === 'critical' ? 'high' : level,
      riskLevel: level,
      class: score >= 0.35 ? 'illicit' : 'licit',
      top_k: isSeed || score >= 0.65,
    };
  });

  const nodeRisk = new Map(nodes.map((n) => [n.id, n.suspicious_score || 0]));

  const enrichedEdges = edges.map((e) => {
    const srcScore = nodeRisk.get(e.source) || 0;
    const tgtScore = nodeRisk.get(e.target) || 0;
    const high = e.high_risk === true || e.suspicious === true || srcScore >= 0.5 || tgtScore >= 0.5;
    return {
      ...e,
      weight: e.weight ?? Math.max(srcScore, tgtScore, 0.3),
      suspicious: high,
      high_risk: high,
    };
  });

  const patterns = detectSmurfPatterns(nodes);

  return {
    ...data,
    nodes,
    edges: enrichedEdges,
    patterns,
  };
}
