import type { BookSnapshot, ConventionalFeatures, MarketEvent } from './types';

export function computeConventionalFeatures(
  events: MarketEvent[],
  path: BookSnapshot[]
): ConventionalFeatures {
  const duration = Math.max(
    path[path.length - 1]?.t || events[events.length - 1]?.t || 1,
    1e-3
  );

  const cancels = events.filter((e) => e.type.startsWith('cancel')).length;
  const execs = events.filter((e) => e.type.startsWith('exec')).length;
  const submits = events.filter((e) => e.type.startsWith('submit')).length;

  const spreads = path.map((p) => p.spread);
  const obis = path.map((p) => p.obi);
  const depths = path.map((p) => p.bidDepth + p.askDepth);

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const std = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = avg(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };

  const netReturn = path.length
    ? path[path.length - 1].mid / path[0].mid - 1
    : 0;

  return {
    netReturn,
    avgSpread: avg(spreads),
    avgObi: avg(obis),
    cancelIntensity: cancels / duration,
    execIntensity: execs / duration,
    submitIntensity: submits / duration,
    cancelExecRatio: cancels / Math.max(execs, 1),
    depthVolatility: std(depths) / Math.max(avg(depths), 1),
  };
}

export function conventionalAnomalyScore(c: ConventionalFeatures): number {
  const cancelHeavy = Math.min(c.cancelExecRatio / 4, 1);
  const intensitySpike = Math.min((c.cancelIntensity + c.execIntensity) / 80, 1);
  const depthShock = Math.min(c.depthVolatility * 2, 1);
  const spreadWide = Math.min(Math.max(c.avgSpread - 0.05, 0) / 0.3, 1);
  return Math.max(
    0,
    Math.min(1, 0.35 * cancelHeavy + 0.3 * intensitySpike + 0.2 * depthShock + 0.15 * spreadWide)
  );
}
