import type { Ray } from 'three';
import type { Volume } from '../data/generate';
import type { CellClip } from '../data/settings';
import { gridFrame } from '../data/settings';

export interface PickHit { i: number; j: number; k: number; index: number }

/**
 * Voxel picking by grid traversal (Amanatides & Woo) instead of mesh
 * raycasting. Hidden cells are culled in the vertex shader, so a triangle
 * raycast would still hit them; walking the grid applies the same threshold
 * and clip rules and costs O(cells along the ray), not O(instances).
 */
export function pickVoxel(ray: Ray, v: Volume, clip: CellClip, threshold: number): PickHit | null {
  const { cell, origin } = gridFrame(v);
  // World -> continuous grid coords (gi, gj, gk), where world = origin + (gi, -gk, -gj) * cell.
  const o = [(ray.origin.x - origin[0]) / cell, -(ray.origin.z - origin[2]) / cell, -(ray.origin.y - origin[1]) / cell];
  const d = [ray.direction.x, -ray.direction.z, -ray.direction.y];
  const lo = [clip[0], clip[2], clip[4]];
  const hi = [clip[1], clip[3], clip[5]];
  const tiny = 1e-12;

  // Slab test against the clip box.
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < tiny) {
      if (o[a] < lo[a] || o[a] > hi[a]) return null;
      continue;
    }
    let t1 = (lo[a] - o[a]) / d[a];
    let t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  const p = [0, 1, 2].map((a) => o[a] + d[a] * (tmin + 1e-6));
  const c = [0, 1, 2].map((a) => Math.min(hi[a] - 1, Math.max(lo[a], Math.floor(p[a]))));
  const step = d.map((x) => (x > 0 ? 1 : -1));
  const tDelta = d.map((x) => (Math.abs(x) < tiny ? Infinity : Math.abs(1 / x)));
  const tNext = [0, 1, 2].map((a) => {
    if (Math.abs(d[a]) < tiny) return Infinity;
    const boundary = d[a] > 0 ? c[a] + 1 : c[a];
    return tmin + (boundary - p[a]) / d[a];
  });

  const { nx, ny } = v;
  for (let guard = 0; guard < 4096; guard++) {
    if (c[0] < lo[0] || c[0] >= hi[0] || c[1] < lo[1] || c[1] >= hi[1] || c[2] < lo[2] || c[2] >= hi[2]) return null;
    const index = c[0] + nx * (c[1] + ny * c[2]);
    if (v.prob[index] >= threshold) return { i: c[0], j: c[1], k: c[2], index };
    const a = tNext[0] < tNext[1] ? (tNext[0] < tNext[2] ? 0 : 2) : tNext[1] < tNext[2] ? 1 : 2;
    c[a] += step[a];
    tNext[a] += tDelta[a];
  }
  return null;
}
