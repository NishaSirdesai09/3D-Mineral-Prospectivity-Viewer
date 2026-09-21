/// <reference lib="webworker" />
/**
 * Off-main-thread visibility + depth sort.
 *
 * Each request filters the volume by threshold and clip box, then orders the
 * surviving cells back-to-front from the camera with a 16-bit counting sort
 * (O(n), ~10 ms for a million cells). The result is the instance order for one
 * draw call, so alpha blending composites correctly without per-frame work on
 * the main thread.
 */
import type { InitMsg, SortMsg, SortResult } from './sortTypes';

let nx = 0, ny = 0, cell = 1;
let origin: [number, number, number] = [0, 0, 0];
let prob = new Float32Array(0);
let cand = new Uint32Array(0);
let dist = new Float32Array(0);
let keys = new Uint16Array(0);
const BUCKETS = 65536;
const offsets = new Uint32Array(BUCKETS);

self.onmessage = (e: MessageEvent<InitMsg | SortMsg>) => {
  const m = e.data;
  if (m.type === 'init') {
    ({ nx, ny, cell, origin, prob } = m);
    const n = nx * ny * m.nz;
    cand = new Uint32Array(n);
    dist = new Float32Array(n);
    keys = new Uint16Array(n);
    return;
  }

  const t0 = performance.now();
  const [cx, cy, cz] = m.cam;
  const [i0, i1, j0, j1, k0, k1] = m.clip;
  const thr = m.threshold;
  let count = 0, dmin = Infinity, dmax = 0;

  for (let k = k0; k < k1; k++) {
    const ddy = origin[1] - (k + 0.5) * cell - cy;
    const dy2 = ddy * ddy;
    for (let j = j0; j < j1; j++) {
      const ddz = origin[2] - (j + 0.5) * cell - cz;
      const dyz = dy2 + ddz * ddz;
      const base = nx * (j + ny * k);
      for (let i = i0; i < i1; i++) {
        const idx = base + i;
        if (prob[idx] < thr) continue;
        const ddx = origin[0] + (i + 0.5) * cell - cx;
        const d = Math.sqrt(ddx * ddx + dyz);
        cand[count] = idx;
        dist[count] = d;
        count++;
        if (d < dmin) dmin = d;
        if (d > dmax) dmax = d;
      }
    }
  }

  // Counting sort, farthest first (key 0 = farthest).
  offsets.fill(0);
  const scale = dmax > dmin ? (BUCKETS - 1) / (dmax - dmin) : 0;
  for (let c = 0; c < count; c++) {
    const key = ((dmax - dist[c]) * scale) | 0;
    keys[c] = key;
    offsets[key]++;
  }
  let run = 0;
  for (let b = 0; b < BUCKETS; b++) {
    const v = offsets[b];
    offsets[b] = run;
    run += v;
  }
  const order = new Float32Array(count);
  for (let c = 0; c < count; c++) order[offsets[keys[c]]++] = cand[c];

  const result: SortResult = { id: m.id, order, count, ms: performance.now() - t0 };
  (self as unknown as Worker).postMessage(result, [order.buffer]);
};
