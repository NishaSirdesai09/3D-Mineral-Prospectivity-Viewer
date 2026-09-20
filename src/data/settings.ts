import type { Volume } from './generate';

export type Range = [number, number];

export interface Settings {
  /** Hide cells with probability below this. */
  threshold: number;
  /** Clip box as fractions of each axis: east (i), north (j), depth (k). */
  clip: { x: Range; y: Range; z: Range };
  /** Map confidence to opacity (and saturation). Off = everything opaque. */
  useConfidence: boolean;
  /** Opacity of a zero-confidence cell. */
  minOpacity: number;
  /** Curve applied to confidence before it becomes opacity. */
  gamma: number;
  /** Voxel edge length as a fraction of the cell. */
  voxelScale: number;
  showDrillHoles: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  threshold: 0.45,
  clip: { x: [0, 1], y: [0, 1], z: [0, 1] },
  useConfidence: true,
  minOpacity: 0.06,
  gamma: 1.4,
  voxelScale: 0.86,
  showDrillHoles: true,
};

/** [i0, i1, j0, j1, k0, k1], half-open in cell units. */
export type CellClip = [number, number, number, number, number, number];

export function toCellClip(clip: Settings['clip'], v: Pick<Volume, 'nx' | 'ny' | 'nz'>): CellClip {
  const ax = (r: Range, n: number): [number, number] => {
    const a = Math.min(n - 1, Math.round(r[0] * n));
    const b = Math.min(n, Math.max(a + 1, Math.round(r[1] * n)));
    return [a, b];
  };
  return [...ax(clip.x, v.nx), ...ax(clip.y, v.ny), ...ax(clip.z, v.nz)] as CellClip;
}

/**
 * World-space layout: the block is always 40 × 20 × 40 units, centred on the
 * origin, whatever the resolution. East = +x, up = +y, north = -z, which keeps
 * the map frame right-handed (a plan view is not mirrored).
 */
export const WORLD = { x: 40, y: 20, z: 40 } as const;

export function gridFrame(v: Pick<Volume, 'nx'>) {
  const cell = WORLD.x / v.nx;
  // Grid (i, j, k) -> world (x, y, z) = origin + (i, -k, -j) * cell
  return { cell, origin: [-WORLD.x / 2, WORLD.y / 2, WORLD.z / 2] as [number, number, number] };
}

/** Metres (east, north, depth) -> world units. */
export function metresToWorld([e, n, d]: [number, number, number]): [number, number, number] {
  return [-WORLD.x / 2 + (e / 1000) * WORLD.x, WORLD.y / 2 - (d / 500) * WORLD.y, WORLD.z / 2 - (n / 1000) * WORLD.z];
}

export const RESOLUTIONS = [
  { nx: 40, label: '40 × 40 × 20', note: '32k cells' },
  { nx: 80, label: '80 × 80 × 40', note: '256k cells' },
  { nx: 128, label: '128 × 128 × 64', note: '1.05M cells' },
] as const;
