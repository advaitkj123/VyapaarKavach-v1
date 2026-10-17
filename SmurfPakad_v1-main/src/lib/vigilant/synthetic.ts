/**
 * Synthetic LOB event windows for demos / controlled experiments.
 * Ground-truth labels are scenario labels — not verified market crimes.
 */
import type { BookSnapshot, MarketEvent } from './types';

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function rebuildPath(events: MarketEvent[], mid0 = 101.05): BookSnapshot[] {
  let bestBid = mid0 - 0.05;
  let bestAsk = mid0 + 0.05;
  let bidDepth = 1200;
  let askDepth = 1100;
  let lastMid = mid0;
  const snaps: BookSnapshot[] = [];

  const push = (t: number) => {
    const mid = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const obi = (bidDepth - askDepth) / (bidDepth + askDepth + 1e-6);
    const ret = Math.log(mid / lastMid);
    snaps.push({ t, mid, bestBid, bestAsk, spread, bidDepth, askDepth, obi, ret });
    lastMid = mid;
  };

  push(0);
  for (const e of events) {
    if (e.type === 'submit_bid') {
      bidDepth += e.qty;
      if (e.price >= bestBid) bestBid = e.price;
    } else if (e.type === 'submit_ask') {
      askDepth += e.qty;
      if (e.price <= bestAsk) bestAsk = e.price;
    } else if (e.type === 'cancel_bid') {
      bidDepth = Math.max(50, bidDepth - e.qty);
    } else if (e.type === 'cancel_ask') {
      askDepth = Math.max(50, askDepth - e.qty);
    } else if (e.type === 'exec_buy') {
      askDepth = Math.max(50, askDepth - e.qty);
      bestAsk += 0.02;
      bestBid += 0.01;
    } else if (e.type === 'exec_sell') {
      bidDepth = Math.max(50, bidDepth - e.qty);
      bestBid -= 0.02;
      bestAsk -= 0.01;
    }
    bestBid = clamp(bestBid, 50, 200);
    bestAsk = clamp(bestAsk, bestBid + 0.02, 210);
    push(e.t);
  }
  return snaps;
}

/** Window A — ordinary gradual demand */
export function generateNormalWindow(seed = 1): { events: MarketEvent[]; path: BookSnapshot[] } {
  const events: MarketEvent[] = [];
  let t = 0.02;
  for (let i = 0; i < 18; i++) {
    t += 0.04 + ((seed * (i + 3)) % 7) * 0.008;
    const buy = i % 3 !== 0;
    if (buy) {
      events.push({ t, type: 'submit_bid', side: 'bid', price: 101.0, qty: 80 + (i % 5) * 10 });
      if (i % 4 === 0) {
        t += 0.03;
        events.push({ t, type: 'exec_buy', side: 'ask', price: 101.1, qty: 40 });
      }
    } else {
      events.push({ t, type: 'submit_ask', side: 'ask', price: 101.1, qty: 70 + (i % 4) * 10 });
      if (i % 5 === 0) {
        t += 0.025;
        events.push({ t, type: 'cancel_ask', side: 'ask', price: 101.1, qty: 30 });
      }
    }
  }
  return { events, path: rebuildPath(events) };
}

/**
 * Window B — spoofing-like: large displayed depth → cancel burst → aggressive exec
 * Label = suspicious_pattern (screening), not confirmed manipulation.
 */
export function generateSpoofingLikeWindow(seed = 2): { events: MarketEvent[]; path: BookSnapshot[] } {
  const events: MarketEvent[] = [];
  let t = 0.01;

  // Layer spoof-like asks at multiple levels
  for (let i = 0; i < 6; i++) {
    t += 0.008;
    events.push({
      t,
      type: 'submit_ask',
      side: 'ask',
      price: 101.1 + i * 0.05,
      qty: 400 + i * 50 + seed,
    });
  }

  // Quick cancel of the spoof depth
  for (let i = 0; i < 6; i++) {
    t += 0.006;
    events.push({
      t,
      type: 'cancel_ask',
      side: 'ask',
      price: 101.1 + i * 0.05,
      qty: 380 + i * 40,
    });
  }

  // Aggressive buy executions into thinned book
  for (let i = 0; i < 5; i++) {
    t += 0.01;
    events.push({ t, type: 'exec_buy', side: 'ask', price: 101.15 + i * 0.02, qty: 120 });
  }

  // Mirror on bid side lightly
  t += 0.02;
  events.push({ t, type: 'submit_bid', side: 'bid', price: 101.0, qty: 50 });
  t += 0.015;
  events.push({ t, type: 'cancel_bid', side: 'bid', price: 101.0, qty: 40 });

  return { events, path: rebuildPath(events, 101.05) };
}

/** High-volatility but legitimate-style burst (stress false-alarm case) */
export function generateVolatilityShockWindow(seed = 3): { events: MarketEvent[]; path: BookSnapshot[] } {
  const events: MarketEvent[] = [];
  let t = 0.01;
  for (let i = 0; i < 24; i++) {
    t += 0.012 + (seed % 3) * 0.002;
    if (i % 2 === 0) {
      events.push({ t, type: 'exec_buy', side: 'ask', price: 101.1 + i * 0.01, qty: 90 });
      t += 0.008;
      events.push({ t, type: 'submit_ask', side: 'ask', price: 101.2 + i * 0.01, qty: 100 });
    } else {
      events.push({ t, type: 'exec_sell', side: 'bid', price: 100.95 - i * 0.005, qty: 85 });
      t += 0.008;
      events.push({ t, type: 'submit_bid', side: 'bid', price: 100.9, qty: 95 });
    }
  }
  return { events, path: rebuildPath(events) };
}
