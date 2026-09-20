/**
 * Synthetic prospectivity model.
 *
 * The block is 1000 m (east) × 1000 m (north) × 500 m (depth). Probability
 * comes from a toy mineral-system model: a dipping fault acts as the fluid
 * pathway, a favourable host layer acts as the trap, and ore shoots form where
 * they meet. One "blind" target sits away from the fault and from any drilling.
 *
 * Confidence comes from data density: high along drill holes, decaying with
 * distance from them, plus weak surface-geophysics coverage that fades with
 * depth. That gives the viewer the interesting case the real product has to
 * handle: high-probability cells you should not trust yet.
 */

export const EXTENT = { x: 1000, y: 1000, z: 500 } as const; // metres

export type Vec3 = [number, number, number];

export interface DrillHole {
  id: string;
  /** Collar and toe in metres: [east, north, depth]. */
  start: Vec3;
  end: Vec3;
}

export interface Volume {
  nx: number; // east cells
  ny: number; // north cells
  nz: number; // depth cells
  seed: number;
  /** Index = i + nx * (j + ny * k), k = 0 at surface. */
  prob: Float32Array;
  conf: Float32Array;
  holes: DrillHole[];
  histogram: Uint32Array;
  stats: { drillReady: number; speculative: number; total: number };
  generationMs: number;
}

export const HIST_BINS = 40;

/** Thresholds used for the two summary counts and the tooltip label. */
export const CLASS = { prospective: 0.7, confident: 0.6, uncertain: 0.35 } as const;

export function classify(p: number, c: number): { label: string; tone: 'go' | 'warn' | 'muted' } {
  if (p >= CLASS.prospective && c >= CLASS.confident) return { label: 'Drill-ready target', tone: 'go' };
  if (p >= CLASS.prospective && c < CLASS.uncertain) return { label: 'Speculative: needs data', tone: 'warn' };
  if (p >= CLASS.prospective) return { label: 'Prospective', tone: 'go' };
  if (p < 0.3 && c >= CLASS.confident) return { label: 'Confidently barren', tone: 'muted' };
  return { label: 'Background', tone: 'muted' };
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash-based value noise with fBm; deterministic per seed, no allocations. */
function makeFbm(seed: number) {
  const s = Math.imul(seed, 1442695041);
  const hash = (x: number, y: number, z: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ s;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const x00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u);
    const x10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u);
    const x01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u);
    const x11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  };
  return (x: number, y: number, z: number, octaves = 3) => {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * freq, y * freq, z * freq + o * 17.31);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };
}

interface Shoot { x: number; y: number; z: number; ra: number; rc: number; rz: number; amp: number; rotate: boolean }

export function generateVolume(nx: number, seed: number): Volume {
  const t0 = performance.now();
  const ny = nx;
  const nz = nx / 2;
  const n = nx * ny * nz;
  const rng = mulberry32(seed);
  const fbm = makeFbm(seed);
  const rand = (a: number, b: number) => a + (b - a) * rng();
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

  // Fault: strike angle theta, passes through (xc, yc) at surface, dips so its
  // trace shifts `dipShift` metres horizontally per metre of depth.
  const theta = rand(0.15, 0.85) * Math.PI;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const xc = rand(380, 560), yc = rand(380, 620);
  const dipShift = 0.55;
  const layerMid = rand(260, 320);

  const faultPoint = (along: number, z: number): [number, number] => [
    clamp(xc + along * -sinT + z * dipShift * cosT, 90, 910),
    clamp(yc + along * cosT + z * dipShift * sinT, 90, 910),
  ];

  const shoots: Shoot[] = [];
  for (let s = 0; s < 3; s++) {
    const along = (s - 1) * rand(220, 280) + rand(-40, 40);
    const z = clamp(layerMid + rand(-60, 60), 120, 430);
    const [x, y] = faultPoint(along, z);
    shoots.push({ x, y, z, ra: rand(90, 140), rc: rand(40, 60), rz: rand(70, 110), amp: rand(0.9, 1.1), rotate: true });
  }

  // Blind target: far from the fault trace, so nothing has drilled it.
  let blind: Shoot = { x: 800, y: 200, z: 340, ra: 90, rc: 90, rz: 80, amp: 1, rotate: false };
  for (let tries = 0; tries < 200; tries++) {
    const x = rand(150, 850), y = rand(150, 850), z = rand(280, 400);
    const h = (x - xc) * cosT + (y - yc) * sinT - z * dipShift;
    if (Math.abs(h) > 280) {
      blind = { x, y, z, ra: rand(80, 100), rc: rand(70, 90), rz: rand(60, 80), amp: 1.05, rotate: false };
      break;
    }
  }
  const allShoots = [...shoots, blind];

  // Drill holes: most chase the known shoots (exploration bias), a few are
  // scattered reconnaissance holes. None get near the blind target.
  const holes: DrillHole[] = [];
  const awayFromBlind = (x: number, y: number) => Math.hypot(x - blind.x, y - blind.y) > 300;
  let hid = 1;
  for (let h = 0; h < 9; h++) {
    const t = shoots[h % 3];
    const dip = rand(55, 85) * (Math.PI / 180);
    const az = rand(0, Math.PI * 2);
    const targetZ = t.z + rand(-40, 40);
    const offset = targetZ / Math.tan(dip);
    const cx = clamp(t.x - offset * Math.cos(az) + rand(-70, 70), 20, 980);
    const cy = clamp(t.y - offset * Math.sin(az) + rand(-70, 70), 20, 980);
    if (!awayFromBlind(cx, cy)) continue;
    const len = (targetZ + rand(60, 160)) / Math.sin(dip);
    holes.push(makeHole(`DH-${String(hid++).padStart(2, '0')}`, cx, cy, az, dip, len));
  }
  for (let h = 0, guard = 0; h < 5 && guard < 200; guard++) {
    const cx = rand(60, 940), cy = rand(60, 940);
    if (!awayFromBlind(cx, cy)) continue;
    holes.push(makeHole(`RC-${String(hid++).padStart(2, '0')}`, cx, cy, rand(0, Math.PI * 2), rand(70, 90) * (Math.PI / 180), rand(160, 380)));
    h++;
  }

  const prob = new Float32Array(n);
  const conf = new Float32Array(n);
  const dx = EXTENT.x / nx, dy = EXTENT.y / ny, dz = EXTENT.z / nz;
  const sigma2 = 2 * 75 * 75;
  const segs = holes.map((h) => {
    const [ax, ay, az] = h.start;
    const bx = h.end[0] - ax, by = h.end[1] - ay, bz = h.end[2] - az;
    return { ax, ay, az, bx, by, bz, len2: bx * bx + by * by + bz * bz };
  });

  // Host-layer undulation is a per-column surface; compute it once per (i, j).
  const layerCentre = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * dx, y = (j + 0.5) * dy;
      layerCentre[i + nx * j] = layerMid + 140 * (fbm(x / 320, y / 320, 91.7, 2) - 0.5) + 0.06 * (x - 500);
    }
  }

  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * dz;
    const surfaceConf = 0.06 + 0.26 * Math.exp(-z / 200);
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * dy;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        const idx = i + nx * (j + ny * k);
        const nse = fbm(x / 170, y / 170, z / 130);

        const h = (x - xc) * cosT + (y - yc) * sinT - z * dipShift + (nse - 0.5) * 160;
        const fault = Math.exp(-(h * h) / (55 * 55));
        const lz = (z - layerCentre[i + nx * j]) / 70;
        const layer = Math.exp(-lz * lz);

        let shoot = 0;
        for (let s = 0; s < allShoots.length; s++) {
          const sh = allShoots[s];
          const ex = x - sh.x, ey = y - sh.y, ez = z - sh.z;
          const a = sh.rotate ? ex * -sinT + ey * cosT : ex;
          const c = sh.rotate ? ex * cosT + ey * sinT : ey;
          const q = (a * a) / (sh.ra * sh.ra) + (c * c) / (sh.rc * sh.rc) + (ez * ez) / (sh.rz * sh.rz);
          const v = sh.amp * Math.exp(-q);
          if (v > shoot) shoot = v;
        }

        const score = 0.6 * fault * layer + 0.18 * fault + 0.85 * shoot + 0.25 * layer + 0.7 * (nse - 0.5);
        prob[idx] = 1 / (1 + Math.exp(-(score - 0.3) * 6.5));

        // Distance to the nearest drill-hole segment.
        let best = Infinity;
        for (let s = 0; s < segs.length; s++) {
          const g = segs[s];
          const px = x - g.ax, py = y - g.ay, pz = z - g.az;
          let t = (px * g.bx + py * g.by + pz * g.bz) / g.len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = px - t * g.bx, qy = py - t * g.by, qz = pz - t * g.bz;
          const d2 = qx * qx + qy * qy + qz * qz;
          if (d2 < best) best = d2;
        }
        const drill = 0.93 * Math.exp(-best / sigma2);
        const c = 1 - (1 - surfaceConf) * (1 - drill) + (nse - 0.5) * 0.12;
        conf[idx] = c < 0.02 ? 0.02 : c > 1 ? 1 : c;
      }
    }
  }

  const histogram = new Uint32Array(HIST_BINS);
  let drillReady = 0, speculative = 0;
  for (let i = 0; i < n; i++) {
    const p = prob[i], c = conf[i];
    histogram[Math.min(HIST_BINS - 1, Math.floor(p * HIST_BINS))]++;
    if (p >= CLASS.prospective) {
      if (c >= CLASS.confident) drillReady++;
      else if (c < CLASS.uncertain) speculative++;
    }
  }

  return {
    nx, ny, nz, seed, prob, conf, holes, histogram,
    stats: { drillReady, speculative, total: n },
    generationMs: performance.now() - t0,
  };
}

function makeHole(id: string, x: number, y: number, az: number, dip: number, len: number): DrillHole {
  const ex = x + len * Math.cos(dip) * Math.cos(az);
  const ey = y + len * Math.cos(dip) * Math.sin(az);
  const ez = Math.min(EXTENT.z, len * Math.sin(dip));
  return { id, start: [x, y, 0], end: [Math.min(1000, Math.max(0, ex)), Math.min(1000, Math.max(0, ey)), ez] };
}
