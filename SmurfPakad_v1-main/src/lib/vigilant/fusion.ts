import { computeConventionalFeatures, conventionalAnomalyScore } from './conventional';
import { computeHawkesFeatures, hawkesAnomalyScore } from './hawkes';
import { computePathSignatures, signatureAnomalyScore } from './signatures';
import {
  generateNormalWindow,
  generateSpoofingLikeWindow,
  generateVolatilityShockWindow,
} from './synthetic';
import type { FusionResult, VigilantWindowAnalysis } from './types';

function fuse(
  cScore: number,
  sScore: number,
  hScore: number,
  conventional: ReturnType<typeof computeConventionalFeatures>,
  sig: ReturnType<typeof computePathSignatures>,
  hawkes: ReturnType<typeof computeHawkesFeatures>
): FusionResult {
  // Weighted fusion — conventional kept so ablations remain meaningful
  const score = Math.max(
    0,
    Math.min(1, 0.25 * cScore + 0.4 * sScore + 0.35 * hScore)
  );

  const triggered: string[] = [];
  const evidence: string[] = [];

  if (cScore >= 0.45) {
    triggered.push('cancellation_intensity');
    evidence.push(
      `Cancel/exec ratio ${conventional.cancelExecRatio.toFixed(2)} with cancel intensity ${conventional.cancelIntensity.toFixed(1)}/s`
    );
  }
  if (sScore >= 0.4) {
    triggered.push('signature_deviation');
    evidence.push(
      `Degree-2 path energy elevated; Lévy area (ret×OBI) = ${sig.levyAreaXY.toFixed(4)}`
    );
  }
  if (hScore >= 0.4) {
    triggered.push('hawkes_excitation');
    evidence.push(
      `Event burstiness ${hawkes.burstiness.toFixed(2)}; spectral radius ≈ ${hawkes.spectralRadiusApprox.toFixed(3)}`
    );
  }
  if (conventional.depthVolatility > 0.35) {
    triggered.push('liquidity_shock');
    evidence.push(`Displayed depth volatility ${(conventional.depthVolatility * 100).toFixed(0)}%`);
  }

  if (!evidence.length) {
    evidence.push('Feature profile within reference envelope for this instrument/session type');
  }

  const label = score >= 0.62 ? 'alert' : score >= 0.4 ? 'review' : 'normal';

  return {
    score,
    scoreType: 'illustrative_uncalibrated_score',
    label,
    conventionalScore: cScore,
    signatureScore: sScore,
    hawkesScore: hScore,
    triggeredFeatures: triggered,
    evidence,
    limitations: [
      'Score is illustrative and uncalibrated — not a probability of financial crime.',
      'Pattern match ≠ trader intent; escalate only under organisational review policy.',
      'Synthetic demo windows are labelled scenarios, not verified exchange cases.',
    ],
  };
}

function analyseWindow(
  scenarioId: string,
  scenarioName: string,
  description: string,
  groundTruth: 'normal' | 'suspicious_pattern',
  events: ReturnType<typeof generateNormalWindow>['events'],
  path: ReturnType<typeof generateNormalWindow>['path'],
  windowStart: string,
  windowEnd: string
): VigilantWindowAnalysis {
  const conventional = computeConventionalFeatures(events, path);
  const signature = computePathSignatures(path, 2);
  const hawkes = computeHawkesFeatures(events, 0.05);
  const fusion = fuse(
    conventionalAnomalyScore(conventional),
    signatureAnomalyScore(signature),
    hawkesAnomalyScore(hawkes),
    conventional,
    signature,
    hawkes
  );

  return {
    scenarioId,
    scenarioName,
    description,
    groundTruth,
    instrument: 'DEMO-01',
    windowStart,
    windowEnd,
    events,
    path,
    conventional,
    signature,
    hawkes,
    fusion,
  };
}

export function runVigilantDemoScenarios(): VigilantWindowAnalysis[] {
  const a = generateNormalWindow(1);
  const b = generateSpoofingLikeWindow(2);
  const c = generateVolatilityShockWindow(3);

  return [
    analyseWindow(
      'W-NORMAL',
      'Ordinary demand',
      'Gradual submissions and executions with stable liquidity evolution.',
      'normal',
      a.events,
      a.path,
      '10:14:00.000',
      '10:14:01.200'
    ),
    analyseWindow(
      'W-SPOOF-LIKE',
      'Spoofing-like sequence',
      'Large displayed depth appears, cancels rapidly, then aggressive executions into a thinned book.',
      'suspicious_pattern',
      b.events,
      b.path,
      '10:14:02.000',
      '10:14:02.180'
    ),
    analyseWindow(
      'W-VOL-SHOCK',
      'Volatility shock (stress)',
      'Dense executions during a liquidity shock — unusual but not labelled as spoofing-like.',
      'normal',
      c.events,
      c.path,
      '10:15:00.000',
      '10:15:00.400'
    ),
  ];
}

/** Ablation-style scores for the pitch slide / Scene 5 */
export function ablationSummary(analyses: VigilantWindowAnalysis[]) {
  const suspicious = analyses.find((a) => a.groundTruth === 'suspicious_pattern');
  const normal = analyses.find((a) => a.scenarioId === 'W-NORMAL');
  if (!suspicious || !normal) return null;

  return {
    models: [
      { name: 'A · Conventional only', normal: normal.fusion.conventionalScore, alert: suspicious.fusion.conventionalScore },
      { name: 'B · Signatures only', normal: normal.fusion.signatureScore, alert: suspicious.fusion.signatureScore },
      { name: 'C · Hawkes only', normal: normal.fusion.hawkesScore, alert: suspicious.fusion.hawkesScore },
      { name: 'F · Fusion (C+S+H)', normal: normal.fusion.score, alert: suspicious.fusion.score },
    ],
    claim:
      'At matched comparison, fusion should separate the spoofing-like window from ordinary activity more clearly than conventional features alone. Validate on chronological holdouts before production claims.',
  };
}
