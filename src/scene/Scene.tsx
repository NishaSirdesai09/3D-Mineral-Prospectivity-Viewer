import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Volume } from '../data/generate';
import { toCellClip, WORLD, type Settings } from '../data/settings';
import { drawStats, hoverStore, perfStore } from '../store';
import { pickVoxel } from './picking';
import { VoxelField } from './VoxelField';
import { AxisLabels, BlockOutline, DrillHoles, HoverBox, SliceBox } from './Overlays';

export type ViewName = 'iso' | 'top' | 'south' | 'east';
export interface ViewRequest { name: ViewName; nonce: number }

const VIEWS: Record<ViewName, [number, number, number]> = {
  iso: [44, 30, 50],
  top: [0, 78, 0.01],
  south: [0, 2, 72],
  east: [72, 2, 0],
};
const TARGET = new THREE.Vector3(0, -1, 0);

interface Props {
  volume: Volume;
  settings: Settings;
  view: ViewRequest;
}

export function Scene({ volume, settings, view }: Props) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: VIEWS.iso, fov: 38, near: 0.5, far: 600 }}
      onCreated={(state) => {
        state.gl.setClearColor('#0a0f15');
        // Dev-only handle for benchmarking from the console.
        if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state;
      }}
    >
      <OrbitControls makeDefault enableDamping dampingFactor={0.09} target={TARGET} minDistance={14} maxDistance={260} />
      <CameraRig view={view} />
      <VoxelField volume={volume} settings={settings} />
      <BlockOutline />
      <SliceBox volume={volume} settings={settings} />
      <HoverBox volume={volume} scale={settings.voxelScale} />
      {settings.showDrillHoles && <DrillHoles volume={volume} />}
      <AxisLabels />
      <Grid
        position={[0, -WORLD.y / 2 - 0.02, 0]}
        args={[200, 200]}
        cellSize={2.5}
        cellThickness={0.6}
        cellColor="#16202b"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#1f2c3a"
        fadeDistance={130}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Picker volume={volume} settings={settings} />
      <PerfProbe />
    </Canvas>
  );
}

/** Animates the camera to a preset view; orbit stays free afterwards. */
function CameraRig({ view }: { view: ViewRequest }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; t: number } | null>(null);

  const size = useThree((s) => s.size);
  // Pull back on portrait screens so the whole block fits horizontally.
  const fit = Math.max(1, 1.35 / (size.width / size.height));
  const viewPos = (name: ViewName) => new THREE.Vector3(...VIEWS[name]).sub(TARGET).multiplyScalar(fit).add(TARGET);

  useEffect(() => {
    if (fit > 1) camera.position.copy(viewPos('iso'));
    // Initial framing only; later resizes keep whatever view the user has.
  }, []);

  useEffect(() => {
    if (view.nonce === 0 || !controls) return;
    anim.current = { from: camera.position.clone(), to: viewPos(view.name), fromT: controls.target.clone(), t: 0 };
  }, [view, camera, controls]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.7);
    const e = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.from, a.to, e);
    controls.target.lerpVectors(a.fromT, TARGET, e);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/** Hover picking on pointer move, coalesced to one pick per animation frame. */
function Picker({ volume, settings }: { volume: Volume; settings: Settings }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const filter = useRef({ clip: toCellClip(settings.clip, volume), threshold: settings.threshold });
  filter.current = { clip: toCellClip(settings.clip, volume), threshold: settings.threshold };

  useEffect(() => hoverStore.set(null), [volume, settings.threshold, settings.clip]);

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let raf = 0;
    let last: PointerEvent | null = null;
    let down: { x: number; y: number } | null = null;

    const pick = () => {
      raf = 0;
      if (!last) return;
      const r = el.getBoundingClientRect();
      ndc.set(((last.clientX - r.left) / r.width) * 2 - 1, -((last.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const f = filter.current;
      const hit = pickVoxel(raycaster.ray, volume, f.clip, f.threshold);
      hoverStore.set(hit ? { i: hit.i, j: hit.j, k: hit.k, p: volume.prob[hit.index], c: volume.conf[hit.index], x: last.clientX, y: last.clientY } : null);
    };
    const schedule = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(pick);
    };
    const onMove = (e: PointerEvent) => {
      if (down) return; // no tooltip while orbiting
      schedule(e);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      hoverStore.set(null);
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = null;
      schedule(e); // also makes tap-to-inspect work on touch
    };
    const onLeave = () => {
      last = null;
      hoverStore.set(null);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, camera, volume]);
  return null;
}

/** Samples frame rate and renderer stats twice a second. */
function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    if (a.time < 0.5) return;
    perfStore.set({
      fps: a.frames / a.time,
      ms: (a.time / a.frames) * 1000,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      drawn: drawStats.drawn,
      sortMs: drawStats.sortMs,
    });
    a.frames = 0;
    a.time = 0;
  });
  return null;
}
