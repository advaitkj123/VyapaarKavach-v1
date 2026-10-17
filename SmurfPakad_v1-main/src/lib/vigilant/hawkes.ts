/**
 * Lightweight Hawkes-style features for order-flow events.
 * Fits a simple exponential excitation summary — not a full MLE Hawkes fit.
 * Suitable for demos and feature ablation; production would use a dedicated library.
 */
import type { EventType, HawkesFeatures, MarketEvent } from './types';

const EVENT_TYPES: EventType[] = [
  'submit_bid',
  'submit_ask',
  'cancel_bid',
  'cancel_ask',
  'exec_buy',
  'exec_sell',
];

function typeIndex(t: EventType): number {
  return EVENT_TYPES.indexOf(t);
}

/**
 * Estimate α/β style excitation by counting near-future events within τ after each event.
 * B_kj ≈ (count of k after j within τ) / count(j), clipped.
 */
export function computeHawkesFeatures(events: MarketEvent[], tau = 0.05): HawkesFeatures {
  const K = EVENT_TYPES.length;
  const counts = new Array(K).fill(0);
  const excitation = Array.from({ length: K }, () => new Array(K).fill(0));

  const sorted = [...events].sort((a, b) => a.t - b.t);
  const duration = Math.max(sorted[sorted.length - 1]?.t || 1, 1e-3);

  for (const e of sorted) {
    const j = typeIndex(e.type);
    if (j < 0) continue;
    counts[j]++;
  }

  for (let i = 0; i < sorted.length; i++) {
    const j = typeIndex(sorted[i].type);
    if (j < 0) continue;
    for (let n = i + 1; n < sorted.length; n++) {
      const dt = sorted[n].t - sorted[i].t;
      if (dt > tau) break;
      const k = typeIndex(sorted[n].type);
      if (k < 0) continue;
      // Exponential weight
      excitation[k][j] += Math.exp(-dt / (tau * 0.5));
    }
  }

  const B = excitation.map((row, k) =>
    row.map((v, j) => (counts[j] > 0 ? v / counts[j] : 0))
  );

  const baseline: Record<string, number> = {};
  const intensities: Record<string, number> = {};
  EVENT_TYPES.forEach((name, i) => {
    baseline[name] = counts[i] / duration;
    // Intensity ≈ baseline + sum of excitation into this type
    const excited = B[i].reduce((s, v) => s + v, 0);
    intensities[name] = baseline[name] * (1 + excited);
  });

  // Spectral radius approx via power iteration on B
  let v = new Array(K).fill(1 / K);
  for (let it = 0; it < 20; it++) {
    const nv = new Array(K).fill(0);
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < K; j++) nv[k] += B[k][j] * v[j];
    }
    const norm = Math.sqrt(nv.reduce((s, x) => s + x * x, 0)) || 1;
    v = nv.map((x) => x / norm);
  }
  let spectral = 0;
  for (let k = 0; k < K; k++) {
    let nv = 0;
    for (let j = 0; j < K; j++) nv += B[k][j] * v[j];
    spectral += v[k] * nv;
  }

  // Burstiness: variance of inter-arrival / mean^2
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].t - sorted[i - 1].t);
  const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1;
  const varGap = gaps.length
    ? gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / gaps.length
    : 0;
  const burstiness = meanGap > 0 ? Math.min(3, varGap / (meanGap * meanGap)) : 0;

  return {
    baseline,
    intensities,
    excitationMatrix: B,
    eventTypes: [...EVENT_TYPES],
    spectralRadiusApprox: Math.max(0, spectral),
    burstiness,
  };
}

export function hawkesAnomalyScore(h: HawkesFeatures): number {
  const cancel =
    (h.intensities.cancel_bid || 0) + (h.intensities.cancel_ask || 0);
  const exec =
    (h.intensities.exec_buy || 0) + (h.intensities.exec_sell || 0);
  const submit =
    (h.intensities.submit_bid || 0) + (h.intensities.submit_ask || 0);

  const cancelDominance = cancel / (submit + cancel + 1e-6);
  const cancelThenExec =
    (h.excitationMatrix[4]?.[2] || 0) + // exec_buy ← cancel_bid
    (h.excitationMatrix[5]?.[3] || 0); // exec_sell ← cancel_ask

  const raw =
    0.3 * Math.min(h.burstiness / 2, 1) +
    0.25 * Math.min(h.spectralRadiusApprox, 1.5) / 1.5 +
    0.25 * cancelDominance +
    0.2 * Math.min(cancelThenExec, 2) / 2;

  // Slightly down-weight if very little activity
  const activity = cancel + exec + submit;
  if (activity < 5) return raw * 0.4;
  return Math.max(0, Math.min(1, raw));
}
