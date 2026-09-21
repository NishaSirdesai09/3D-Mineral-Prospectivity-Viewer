import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Volume } from '../data/generate';
import { gridFrame, metresToWorld, toCellClip, WORLD, type Settings } from '../data/settings';
import { hoverStore, useStore } from '../store';

const unitEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

/** World-space AABB of a cell range. */
function cellBox(v: Volume, i0: number, i1: number, j0: number, j1: number, k0: number, k1: number) {
  const { cell, origin } = gridFrame(v);
  const min = new THREE.Vector3(origin[0] + i0 * cell, origin[1] - k1 * cell, origin[2] - j1 * cell);
  const max = new THREE.Vector3(origin[0] + i1 * cell, origin[1] - k0 * cell, origin[2] - j0 * cell);
  return { min, max, center: min.clone().add(max).multiplyScalar(0.5), size: max.clone().sub(min) };
}

export function BlockOutline() {
  return (
    <lineSegments geometry={unitEdges} scale={[WORLD.x, WORLD.y, WORLD.z]}>
      <lineBasicMaterial color="#3b4859" transparent opacity={0.9} />
    </lineSegments>
  );
}

/** Clip box edges plus a faint fill on every face that has been pulled in. */
export function SliceBox({ volume, settings }: { volume: Volume; settings: Settings }) {
  const clip = toCellClip(settings.clip, volume);
  const { nx, ny, nz } = volume;
  const box = cellBox(volume, ...clip);
  const full = clip[0] === 0 && clip[1] === nx && clip[2] === 0 && clip[3] === ny && clip[4] === 0 && clip[5] === nz;

  const planes = (() => {
    const out: { key: string; pos: [number, number, number]; rot: [number, number, number]; size: [number, number] }[] = [];
    const { min, max, center: c, size: s } = box;
    if (clip[0] > 0) out.push({ key: 'w', pos: [min.x, c.y, c.z], rot: [0, Math.PI / 2, 0], size: [s.z, s.y] });
    if (clip[1] < nx) out.push({ key: 'e', pos: [max.x, c.y, c.z], rot: [0, Math.PI / 2, 0], size: [s.z, s.y] });
    if (clip[2] > 0) out.push({ key: 's', pos: [c.x, c.y, max.z], rot: [0, 0, 0], size: [s.x, s.y] });
    if (clip[3] < ny) out.push({ key: 'n', pos: [c.x, c.y, min.z], rot: [0, 0, 0], size: [s.x, s.y] });
    if (clip[4] > 0) out.push({ key: 't', pos: [c.x, max.y, c.z], rot: [-Math.PI / 2, 0, 0], size: [s.x, s.z] });
    if (clip[5] < nz) out.push({ key: 'b', pos: [c.x, min.y, c.z], rot: [-Math.PI / 2, 0, 0], size: [s.x, s.z] });
    return out;
  })();

  if (full) return null;
  return (
    <group>
      <lineSegments geometry={unitEdges} position={box.center} scale={box.size.toArray()} renderOrder={3}>
        <lineBasicMaterial color="#f2b84b" transparent opacity={0.95} depthTest={false} />
      </lineSegments>
      {planes.map((p) => (
        <mesh key={p.key} position={p.pos} rotation={p.rot} renderOrder={1}>
          <planeGeometry args={p.size} />
          <meshBasicMaterial color="#f2b84b" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function HoverBox({ volume, scale }: { volume: Volume; scale: number }) {
  const h = useStore(hoverStore);
  if (!h) return null;
  const b = cellBox(volume, h.i, h.i + 1, h.j, h.j + 1, h.k, h.k + 1);
  return (
    <lineSegments geometry={unitEdges} position={b.center} scale={b.size.multiplyScalar(Math.max(scale, 0.9) + 0.06).toArray()} renderOrder={4}>
      <lineBasicMaterial color="#ffffff" depthTest={false} transparent />
    </lineSegments>
  );
}

export function DrillHoles({ volume }: { volume: Volume }) {
  const holes = useMemo(
    () =>
      volume.holes.map((h) => {
        const a = new THREE.Vector3(...metresToWorld(h.start));
        const b = new THREE.Vector3(...metresToWorld(h.end));
        const dir = b.clone().sub(a);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        return { id: h.id, a, mid: a.clone().lerp(b, 0.5), len, quat };
      }),
    [volume],
  );
  return (
    <group>
      {holes.map((h) => (
        <group key={h.id}>
          <mesh position={h.mid} quaternion={h.quat}>
            <cylinderGeometry args={[0.09, 0.09, h.len, 6, 1]} />
            <meshBasicMaterial color="#d9e1ea" />
          </mesh>
          <mesh position={[h.a.x, h.a.y + 0.05, h.a.z]}>
            <cylinderGeometry args={[0.32, 0.32, 0.1, 16]} />
            <meshBasicMaterial color="#d9e1ea" />
          </mesh>
          <Html position={[h.a.x, h.a.y + 0.9, h.a.z]} center zIndexRange={[5, 0]} className="hole-label">
            {h.id}
          </Html>
        </group>
      ))}
    </group>
  );
}

/** Minimal orientation cues: north arrow and depth ticks on one corner. */
export function AxisLabels() {
  const x1 = WORLD.x / 2, z0 = WORLD.z / 2, top = WORLD.y / 2;
  const ticks = [0, 250, 500];
  return (
    <group>
      <Html position={[0, top, -WORLD.z / 2 - 2.2]} center className="axis-label north" zIndexRange={[4, 0]}>
        ▲ N
      </Html>
      <Html position={[WORLD.x / 2 + 2.6, top, 0]} center className="axis-label" zIndexRange={[4, 0]}>
        E
      </Html>
      {ticks.map((d) => (
        <Html key={d} position={[x1 + 0.5, top - (d / 500) * WORLD.y, z0 + 0.5]} className="axis-label tick" zIndexRange={[4, 0]}>
          {d} m
        </Html>
      ))}
      <Html position={[0, top, z0 + 1.8]} center className="axis-label tick" zIndexRange={[4, 0]}>
        1 km
      </Html>
    </group>
  );
}
