export interface InitMsg {
  type: 'init';
  nx: number;
  ny: number;
  nz: number;
  prob: Float32Array;
  cell: number;
  origin: [number, number, number];
}

export interface SortMsg {
  type: 'sort';
  id: number;
  cam: [number, number, number];
  threshold: number;
  clip: [number, number, number, number, number, number];
}

export interface SortResult {
  id: number;
  /** Cell indices, back-to-front. Float32 so it binds directly as an instanced attribute. */
  order: Float32Array;
  count: number;
  ms: number;
}
