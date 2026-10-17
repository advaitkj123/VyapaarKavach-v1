/** VIGILANT — market-event threat screening types */

export type EventType =
  | 'submit_bid'
  | 'submit_ask'
  | 'cancel_bid'
  | 'cancel_ask'
  | 'exec_buy'
  | 'exec_sell';

export interface MarketEvent {
  t: number; // seconds from window start
  type: EventType;
  side: 'bid' | 'ask';
  price: number;
  qty: number;
}

export interface BookSnapshot {
  t: number;
  mid: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  bidDepth: number;
  askDepth: number;
  obi: number;
  ret: number;
}

export interface ConventionalFeatures {
  netReturn: number;
  avgSpread: number;
  avgObi: number;
  cancelIntensity: number;
  execIntensity: number;
  submitIntensity: number;
  cancelExecRatio: number;
  depthVolatility: number;
}

export interface SignatureFeatures {
  degree: number;
  level1: number[];
  level2: number[];
  levyAreaXY: number;
  dims: string[];
}

export interface HawkesFeatures {
  baseline: Record<string, number>;
  intensities: Record<string, number>;
  excitationMatrix: number[][];
  eventTypes: string[];
  spectralRadiusApprox: number;
  burstiness: number;
}

export interface FusionResult {
  score: number;
  scoreType: 'illustrative_uncalibrated_score';
  label: 'normal' | 'review' | 'alert';
  conventionalScore: number;
  signatureScore: number;
  hawkesScore: number;
  triggeredFeatures: string[];
  evidence: string[];
  limitations: string[];
}

export interface VigilantWindowAnalysis {
  scenarioId: string;
  scenarioName: string;
  description: string;
  groundTruth: 'normal' | 'suspicious_pattern';
  instrument: string;
  windowStart: string;
  windowEnd: string;
  events: MarketEvent[];
  path: BookSnapshot[];
  conventional: ConventionalFeatures;
  signature: SignatureFeatures;
  hawkes: HawkesFeatures;
  fusion: FusionResult;
}
