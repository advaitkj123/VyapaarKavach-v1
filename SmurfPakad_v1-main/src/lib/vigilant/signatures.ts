/**
 * Truncated path signatures (degree 1–2) for market-state trajectories.
 * Pure TypeScript — no native iisignature dependency required for the prototype.
 */
import type { BookSnapshot, SignatureFeatures } from './types';

const DIMS = ['ret', 'obi', 'spread', 'bidDepth', 'askDepth'] as const;

function toPath(snapshots: BookSnapshot[]): number[][] {
  if (!snapshots.length) return [];
  const t0 = snapshots[0].t;
  const t1 = snapshots[snapshots.length - 1].t || 1;
  const dt = Math.max(t1 - t0, 1e-6);

  // Scale depths for numerical stability; append time coordinate implicitly via ret/spread
  const maxDepth = Math.max(...snapshots.map((s) => Math.max(s.bidDepth, s.askDepth, 1)));

  return snapshots.map((s) => [
    s.ret,
    s.obi,
    s.spread,
    s.bidDepth / maxDepth,
    s.askDepth / maxDepth,
  ]);
}

/**
 * Degree-1: net increments. Degree-2: discrete iterated integrals Σ X^i_{k-1} ΔX^j_k
 * plus Lévy-area proxy between dims 0 and 1 (ret × OBI).
 */
export function computePathSignatures(snapshots: BookSnapshot[], degree = 2): SignatureFeatures {
  const path = toPath(snapshots);
  const d = DIMS.length;
  const level1 = new Array(d).fill(0);
  const level2 = new Array(d * d).fill(0);

  if (path.length < 2) {
    return { degree, level1, level2, levyAreaXY: 0, dims: [...DIMS] };
  }

  const start = path[0];
  const end = path[path.length - 1];
  for (let i = 0; i < d; i++) level1[i] = end[i] - start[i];

  if (degree >= 2) {
    for (let k = 1; k < path.length; k++) {
      const prev = path[k - 1];
      const cur = path[k];
      for (let j = 0; j < d; j++) {
        const dXj = cur[j] - prev[j];
        for (let i = 0; i < d; i++) {
          // Use increment from start for iterated integral approximation
          const Xi = prev[i] - start[i];
          level2[i * d + j] += Xi * dXj;
        }
      }
    }
  }

  // Lévy area between ret (0) and obi (1)
  const intXdY = level2[0 * d + 1];
  const intYdX = level2[1 * d + 0];
  const levyAreaXY = 0.5 * (intXdY - intYdX);

  return { degree, level1, level2, levyAreaXY, dims: [...DIMS] };
}

/** Compact anomaly score from signature structure (not a calibrated probability). */
export function signatureAnomalyScore(sig: SignatureFeatures): number {
  const l1Energy = Math.sqrt(sig.level1.reduce((s, v) => s + v * v, 0));
  const l2Energy = Math.sqrt(sig.level2.reduce((s, v) => s + v * v, 0));
  const levy = Math.abs(sig.levyAreaXY);
  // Emphasize path shape (L2 + Lévy) over net displacement alone
  const raw = 0.25 * Math.min(l1Energy, 2) + 0.45 * Math.min(l2Energy, 3) + 0.3 * Math.min(levy * 4, 2);
  return Math.max(0, Math.min(1, raw / 2.2));
}
