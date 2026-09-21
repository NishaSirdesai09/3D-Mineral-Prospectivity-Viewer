import { classify, EXTENT, type Volume } from '../data/generate';
import { viridisCss } from '../data/colormap';
import { hoverStore, perfStore, useStore } from '../store';

const fmt = new Intl.NumberFormat('en-US');

export function Tooltip({ volume }: { volume: Volume }) {
  const h = useStore(hoverStore);
  if (!h) return null;
  const { nx, ny, nz } = volume;
  const cls = classify(h.p, h.c);
  const e0 = (h.i / nx) * EXTENT.x, n0 = (h.j / ny) * EXTENT.y;
  const d0 = (h.k / nz) * EXTENT.z, d1 = ((h.k + 1) / nz) * EXTENT.z;
  const flipX = h.x > window.innerWidth - 260;
  const flipY = h.y > window.innerHeight - 190;
  return (
    <div
      className="tooltip"
      role="status"
      style={{
        left: flipX ? undefined : h.x + 16,
        right: flipX ? window.innerWidth - h.x + 16 : undefined,
        top: flipY ? undefined : h.y + 16,
        bottom: flipY ? window.innerHeight - h.y + 16 : undefined,
      }}
    >
      <div className="tt-head">
        <span>
          Cell {h.i}, {h.j}, {h.k}
        </span>
        <span className="tt-dim">
          {Math.round(d0)}–{Math.round(d1)} m deep
        </span>
      </div>
      <Meter label="Probability" value={h.p} color={viridisCss(h.p)} />
      <Meter label="Confidence" value={h.c} color="#e6edf5" />
      <div className="tt-foot">
        <span className={`chip ${cls.tone}`}>{cls.label}</span>
        <span className="tt-dim">
          E {Math.round(e0)} · N {Math.round(n0)} m
        </span>
      </div>
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="meter">
      <span className="label">{label}</span>
      <span className="meter-bar">
        <span style={{ width: `${value * 100}%`, background: color }} />
      </span>
      <span className="value">{value.toFixed(2)}</span>
    </div>
  );
}

export function FpsMeter({ total }: { total: number }) {
  const p = useStore(perfStore);
  const tone = p.fps >= 50 ? 'go' : p.fps >= 30 ? 'warn' : 'bad';
  return (
    <div className="fps" aria-live="off">
      <div className="fps-main">
        <span className={`fps-dot ${tone}`} />
        <strong>{p.fps ? Math.round(p.fps) : '–'}</strong>
        <span className="tt-dim">fps</span>
        <span className="tt-dim fps-ms">{p.ms ? p.ms.toFixed(1) : '–'} ms</span>
      </div>
      <dl>
        <dt>cells</dt>
        <dd>{fmt.format(total)}</dd>
        <dt>drawn</dt>
        <dd>{fmt.format(p.drawn)}</dd>
        <dt>triangles</dt>
        <dd>{fmt.format(p.triangles)}</dd>
        <dt>draw calls</dt>
        <dd>{p.calls}</dd>
        <dt>sort</dt>
        <dd>{p.sortMs.toFixed(1)} ms</dd>
      </dl>
    </div>
  );
}
