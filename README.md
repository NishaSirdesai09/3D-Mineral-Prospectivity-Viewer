# Prospectivity Viewer

A small 3D viewer for a mineral prospectivity model, built on synthetic data. It is a minimal version of the problem a product like Carta has to solve: show **where the model thinks mineralisation is** and **how much to trust it** at the same time, in a form a geologist can slice and inspect.

![demo](docs/demo.gif)

**Live:** _add your Vercel URL here_

React · TypeScript · Vite · React Three Fiber (Three.js) · one instanced draw call · Web Worker depth sort

---

## What you're looking at

A 1 km × 1 km × 500 m block of ground, split into 40 × 40 × 20 cells (32,000). Each cell has two values:

| Value | Source in the synthetic model | Encoding |
|---|---|---|
| **Probability** (0–1) | A toy mineral system: a dipping fault (the pathway) crossing a favourable host layer (the trap), with ore shoots where the two meet, plus one *blind* body away from the fault | **Colour** (viridis) |
| **Confidence** (0–1) | Data density: high along drill holes and falling off with distance from them, plus weak surface-geophysics coverage that fades with depth | **Opacity** (and some saturation) |

The data is built so the interesting case shows up: the drilled shoots along the fault are bright and solid, while the blind body is just as yellow but faded to ghost glass. The model likes it, but nobody has drilled it. The panel counts both groups: **drill-ready** (p ≥ 0.7, conf ≥ 0.6) and **speculative** (p ≥ 0.7, conf < 0.35).

## Interactions

- **"What am I looking at?" primer.** It opens on the first visit and can be reopened from the panel. It explains in plain language what probability, confidence and drill holes mean, and how to read colour and opacity together.
- **Orbit / zoom / pan** with damping, plus preset views (Iso, Top, South, East) that animate.
- **Slice planes on all three axes.** Each axis has a two-handle range, so you can cut a slab, a window or a single layer. The active clip box is outlined in amber and its cut faces are tinted.
- **Probability threshold.** A slider sits under a live histogram; click the histogram to jump to a value. Bars below the threshold dim.
- **Hover tooltip** with cell index, depth range, easting/northing, probability and confidence bars, and a plain-language label (*Drill-ready target*, *Speculative: needs data*, *Confidently barren*…). Tap works on touch.
- **Confidence controls.** Turn the fade on or off to compare, set the floor opacity for zero-confidence cells, and set the fade curve (γ).
- **Resolution presets:** 32k, 256k and 1.05M cells, with the same geology at each one.
- **FPS meter** showing frame time, cells drawn, triangles, draw calls and worker sort time.

## Design choices

### Colour = probability, opacity = confidence

- **Viridis** is perceptually uniform and readable with colour-vision deficiency, so equal steps in probability look like equal steps in colour. It also has no hue that suggests "danger", which matters because a high value here is good news. The same polynomial fit is used in the GLSL shader, the histogram and the legend, so every swatch in the UI matches the voxels exactly.
- **Opacity is the natural channel for uncertainty.** Low-confidence cells become see-through, so they stop hiding what's behind them and visibly read as "less solid". Opacity alone can make a faded yellow look like a different colour, so confidence also pulls saturation partway toward grey. The hue stays tied to probability; the "glassiness" shows confidence.
- **The fade curve (γ) and floor opacity are exposed** because a good mapping depends on the data and on the question. A floor above 0 keeps speculative targets visible instead of letting them vanish, which would be the worst failure for an exploration tool.
- **Bivariate legend.** A 2D swatch (probability across, confidence up) drawn over a checkerboard, built with the shader's own formula, so the two channels can be read together.

### Rendering

- **One draw call for the whole block.** A unit cube is instanced once per visible cell. The only per-instance attribute is a 4-byte cell index. Probability and confidence live in an `RG32F` 3D texture that the vertex shader reads with `texelFetch`.
- **Filtering on the GPU.** Threshold and slice tests run in the vertex shader; a culled cell is sent to a degenerate clip-space position, which is cheaper than a fragment `discard`. Dragging a slider only updates uniforms: no buffer rebuild and no React re-render of the scene.
- **Correct transparency.** Alpha blending needs back-to-front order. A **Web Worker** filters cells by the current threshold and clip box, then orders the survivors by distance from the camera with a **16-bit counting sort** (O(n)). The result goes straight into the instance buffer, and only the used range is uploaded. One request is in flight at a time and the latest camera state wins, so orbiting never queues up stale sorts. Compaction is a bonus: at a high threshold, most of the 1M cells are never sent to the GPU.
- **Picking by grid traversal, not raycasting.** Triangle raycasting would hit cells the shader has hidden, and it scales with instance count. The tooltip walks the voxel grid along the pick ray (Amanatides–Woo) using the same threshold and clip rules, so it costs O(cells along the ray), coalesced to one pick per animation frame.
- **High-frequency state stays out of React.** Hover and perf stats sit in a tiny external store (`useSyncExternalStore`), so moving the pointer re-renders the tooltip and nothing else.

### Performance

Measured render cost (GPU-synchronised, 1280 × 720, Intel Iris Xe integrated graphics, Chrome):

| Preset | Cells | Drawn at p ≥ 0.35 | Render time | Worker sort |
|---|---|---|---|---|
| 40 × 40 × 20 | 32k | ~6k | ~6.7 ms | <1 ms |
| 128 × 128 × 64 | 1.05M | ~208k (2.5M triangles) | ~13.4 ms | ~8 ms (off main thread) |

So the default scene has plenty of headroom on a laptop iGPU, and even the million-cell preset stays near 60–75 fps because sorting never touches the main thread. Generating the 1M-cell volume takes about 0.3 s.

### Synthetic data

`src/data/generate.ts` is seeded and deterministic (*New synthetic block* re-rolls it). It uses hash-based value-noise fBm for natural variation. The geology is simple but has the right *shape*: structures control where mineralisation sits, and drilling is biased toward what's already known, which is exactly why confidence and probability must be shown together.

## Run it

```bash
npm install
npm run dev
```

```bash
npm run build && npm run preview
```

## Deploy (Vercel)

Vercel detects Vite automatically (build `npm run build`, output `dist`). Either import the repo at vercel.com/new, or:

```bash
npx vercel --prod
```

## Project layout

```
src/
  data/generate.ts     synthetic geology + confidence model, stats, histogram
  data/colormap.ts     viridis (shared by GLSL and the 2D UI)
  data/settings.ts     settings model, grid/world mapping, resolution presets
  scene/VoxelField.tsx instanced mesh, 3D texture, shaders, worker wiring
  scene/sortWorker.ts  filter + counting-sort back-to-front ordering
  scene/picking.ts     voxel-grid ray traversal for the tooltip
  scene/Overlays.tsx   block outline, slice box/planes, hover box, drill holes, labels
  scene/Scene.tsx      canvas, camera presets, picker, perf probe
  ui/                  panel controls, histogram, bivariate legend, tooltip, FPS meter
```

## What I'd do next

- Swap in real block-model input (CSV/Parquet of cell centroids) and irregular or sub-blocked grids.
- Show uncertainty as a **range** (P10/P50/P90) instead of a single confidence value, with a toggle between them.
- Isosurface (marching cubes) mode for high-probability shells, with confidence as surface opacity.
- Order-independent transparency (weighted blended OIT) to drop the sort entirely for very large models.
- Link 2D section views to the 3D slice planes.
