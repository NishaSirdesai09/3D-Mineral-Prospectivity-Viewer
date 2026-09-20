/**
 * Viridis, as a degree-6 polynomial fit (Matt Zucker's approximation). The same
 * coefficients drive the GLSL shader and the 2D legend/histogram, so every
 * swatch in the UI matches the voxels exactly.
 */
const C = [
  [0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
  [0.1050930431085774, 1.404613529898575, 1.384590162594685],
  [-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
  [-4.634230498983486, -5.799100973351585, -19.33244095627987],
  [6.228269936347081, 14.17993336680509, 56.69055260068105],
  [4.776384997670288, -13.74514537774601, -65.35303263337234],
  [-5.435455855934631, 4.645852612178535, 26.3124352495832],
];

export function viridis(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let v = C[6][ch];
    for (let i = 5; i >= 0; i--) v = C[i][ch] + t * v;
    out[ch] = Math.min(1, Math.max(0, v));
  }
  return out;
}

export function viridisCss(t: number, alpha = 1): string {
  const [r, g, b] = viridis(t);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

const v3 = (c: number[]) => `vec3(${c.map((x) => x.toFixed(10)).join(', ')})`;

export const VIRIDIS_GLSL = /* glsl */ `
vec3 viridis(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = ${v3(C[0])};
  const vec3 c1 = ${v3(C[1])};
  const vec3 c2 = ${v3(C[2])};
  const vec3 c3 = ${v3(C[3])};
  const vec3 c4 = ${v3(C[4])};
  const vec3 c5 = ${v3(C[5])};
  const vec3 c6 = ${v3(C[6])};
  return clamp(c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6))))), 0.0, 1.0);
}
`;
