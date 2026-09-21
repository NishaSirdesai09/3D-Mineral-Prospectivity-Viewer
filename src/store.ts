import { useSyncExternalStore } from 'react';

/**
 * Tiny observable store for high-frequency UI state (hover, perf). Keeping
 * this out of React state means pointer moves never re-render the scene graph.
 */
export interface Store<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (l: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface Hover { i: number; j: number; k: number; p: number; c: number; x: number; y: number }
export const hoverStore = createStore<Hover | null>(null);

export interface Perf { fps: number; ms: number; calls: number; triangles: number; drawn: number; sortMs: number }
export const perfStore = createStore<Perf>({ fps: 0, ms: 0, calls: 0, triangles: 0, drawn: 0, sortMs: 0 });

/** Written by the voxel field when a sort result lands; read by the perf probe. */
export const drawStats = { drawn: 0, sortMs: 0 };
