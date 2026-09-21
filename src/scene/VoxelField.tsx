import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Volume } from '../data/generate';
import { VIRIDIS_GLSL } from '../data/colormap';
import { gridFrame, toCellClip, type Settings } from '../data/settings';
import { drawStats } from '../store';
import type { InitMsg, SortMsg, SortResult } from './sortTypes';

/*
 * One draw call for the whole block.
 *
 * Geometry: a unit cube, instanced. The only per-instance attribute is the
 * cell index (4 bytes). Probability and confidence live in an RG32F 3D
 * texture the vertex shader reads with texelFetch, so threshold and slice
 * changes are pure uniform updates: no buffer re-upload, no React re-render.
 */

const vertexShader = /* glsl */ `
uniform highp sampler3D uData;
uniform vec3 uDims;
uniform vec3 uOrigin;
uniform float uCell;
uniform float uScale;
uniform float uThreshold;
uniform vec3 uClipMin;
uniform vec3 uClipMax;

in float aIndex;

out vec2 vPC;
out float vShade;

void main() {
  float plane = uDims.x * uDims.y;
  float k = floor((aIndex + 0.5) / plane);
  float rem = aIndex - k * plane;
  float j = floor((rem + 0.5) / uDims.x);
  float i = rem - j * uDims.x;
  vec3 cellIdx = vec3(i, j, k);

  vec2 pc = texelFetch(uData, ivec3(cellIdx + 0.5), 0).rg;

  // Cull in the vertex stage: a degenerate clip-space position costs nothing
  // downstream, unlike a fragment discard.
  if (pc.x < uThreshold || any(lessThan(cellIdx, uClipMin)) || any(greaterThanEqual(cellIdx, uClipMax))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vPC = pc;
  vec3 center = uOrigin + vec3(i + 0.5, -(k + 0.5), -(j + 0.5)) * uCell;
  vec3 world = center + position * (uCell * uScale);

  // Fixed key light plus a little sky: faces read as form from any angle.
  vec3 L = normalize(vec3(0.45, 0.85, 0.3));
  vShade = 0.6 + 0.34 * max(dot(normal, L), 0.0) + 0.08 * normal.y;

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(world, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uUseConf;
uniform float uMinAlpha;
uniform float uGamma;

in vec2 vPC;
in float vShade;
out vec4 fragColor;

${VIRIDIS_GLSL}

void main() {
  float p = vPC.x;
  float c = vPC.y;
  vec3 col = viridis(p);
  float a = 1.0;
  if (uUseConf > 0.5) {
    // Confidence drives opacity and, more gently, saturation, so uncertain
    // cells fade toward grey glass instead of reading as a different colour.
    float w = pow(c, uGamma);
    a = mix(uMinAlpha, 1.0, w);
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, mix(0.4, 1.0, w));
  }
  fragColor = vec4(col * vShade, a);
}
`;

interface Props {
  volume: Volume;
  settings: Settings;
}

type Dispatcher = { addEventListener(t: string, h: () => void): void; removeEventListener(t: string, h: () => void): void };

export function VoxelField({ volume, settings }: Props) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Dispatcher | null;
  const { nx, ny, nz } = volume;
  const n = nx * ny * nz;

  const { geometry, order } = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(box.getIndex());
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('normal', box.getAttribute('normal'));
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aIndex', attr);
    g.instanceCount = 0; // nothing drawn until the first sorted order arrives
    return { geometry: g, order: attr };
  }, [n]);

  const texture = useMemo(() => {
    const data = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      data[2 * i] = volume.prob[i];
      data[2 * i + 1] = volume.conf[i];
    }
    const t = new THREE.Data3DTexture(data, nx, ny, nz);
    t.format = THREE.RGFormat;
    t.type = THREE.FloatType;
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  }, [volume, n, nx, ny, nz]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          uData: { value: null },
          uDims: { value: new THREE.Vector3() },
          uOrigin: { value: new THREE.Vector3() },
          uCell: { value: 1 },
          uScale: { value: 0.86 },
          uThreshold: { value: 0 },
          uClipMin: { value: new THREE.Vector3() },
          uClipMax: { value: new THREE.Vector3() },
          uUseConf: { value: 1 },
          uMinAlpha: { value: 0.06 },
          uGamma: { value: 1.4 },
        },
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => material.dispose(), [material]);

  const clip = useMemo(() => toCellClip(settings.clip, volume), [settings.clip, volume]);

  // Uniforms: cheap, applied immediately while the worker catches up.
  useEffect(() => {
    const u = material.uniforms;
    const { cell, origin } = gridFrame(volume);
    u.uData.value = texture;
    u.uDims.value.set(nx, ny, nz);
    u.uOrigin.value.set(...origin);
    u.uCell.value = cell;
  }, [material, texture, volume, nx, ny, nz]);

  useEffect(() => {
    const u = material.uniforms;
    u.uThreshold.value = settings.threshold;
    u.uClipMin.value.set(clip[0], clip[2], clip[4]);
    u.uClipMax.value.set(clip[1], clip[3], clip[5]);
    u.uUseConf.value = settings.useConfidence ? 1 : 0;
    u.uMinAlpha.value = settings.minOpacity;
    u.uGamma.value = settings.gamma;
    u.uScale.value = settings.voxelScale;
  }, [material, clip, settings.threshold, settings.useConfidence, settings.minOpacity, settings.gamma, settings.voxelScale]);

  // Sorting worker: at most one request in flight; the latest camera/filter
  // state wins, so a slow sort never queues up stale work.
  const filterRef = useRef({ threshold: settings.threshold, clip });
  filterRef.current = { threshold: settings.threshold, clip };
  const requestSort = useRef<() => void>(() => {});

  useEffect(() => {
    const worker = new Worker(new URL('./sortWorker.ts', import.meta.url), { type: 'module' });
    const { cell, origin } = gridFrame(volume);
    const init: InitMsg = { type: 'init', nx, ny, nz, prob: volume.prob, cell, origin };
    worker.postMessage(init);

    let busy = false;
    let dirty = false;
    let id = 0;
    const send = () => {
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      dirty = false;
      const f = filterRef.current;
      const msg: SortMsg = { type: 'sort', id: ++id, cam: camera.position.toArray() as [number, number, number], threshold: f.threshold, clip: f.clip };
      worker.postMessage(msg);
    };
    worker.onmessage = (e: MessageEvent<SortResult>) => {
      busy = false;
      const { order: sorted, count, ms } = e.data;
      (order.array as Float32Array).set(sorted);
      order.clearUpdateRanges();
      order.addUpdateRange(0, count);
      order.needsUpdate = true;
      geometry.instanceCount = count;
      drawStats.drawn = count;
      drawStats.sortMs = ms;
      if (dirty) send();
    };
    requestSort.current = send;
    send();
    return () => {
      requestSort.current = () => {};
      worker.terminate();
    };
  }, [volume, geometry, order, camera, nx, ny, nz]);

  useEffect(() => requestSort.current(), [settings.threshold, clip]);

  useEffect(() => {
    if (!controls) return;
    const onChange = () => requestSort.current();
    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener('change', onChange);
  }, [controls]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
