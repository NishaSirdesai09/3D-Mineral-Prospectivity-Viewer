import { useEffect, useRef, type ReactNode } from 'react';
import { HIST_BINS } from '../data/generate';
import { viridisCss } from '../data/colormap';
import type { Range } from '../data/settings';

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const { label, value, min, max, step, format = (v) => v.toFixed(2), onChange, disabled } = props;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`slider ${disabled ? 'is-disabled' : ''}`}>
      <span className="row">
        <span className="label">{label}</span>
        <span className="value">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Two native range inputs stacked on one track; thumbs stay keyboard accessible. */
export function RangeSlider(props: {
  label: string;
  value: Range;
  steps: number;
  format: (v: number) => string;
  onChange: (v: Range) => void;
}) {
  const { label, value, steps, format, onChange } = props;
  const step = 1 / steps;
  const [a, b] = value;
  return (
    <div className="range2">
      <span className="row">
        <span className="label">{label}</span>
        <span className="value">
          {format(a)} – {format(b)}
        </span>
      </span>
      <div className="range2-track">
        <div className="range2-fill" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
        <input
          type="range"
          aria-label={`${label} minimum`}
          min={0}
          max={1}
          step={step}
          value={a}
          onChange={(e) => onChange([Math.min(Number(e.target.value), b - step), b])}
        />
        <input
          type="range"
          aria-label={`${label} maximum`}
          min={0}
          max={1}
          step={step}
          value={b}
          onChange={(e) => onChange([a, Math.max(Number(e.target.value), a + step)])}
        />
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <span>
        <span className="label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
    </label>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Probability histogram; bars below the threshold dim. Click to set the threshold. */
export function Histogram({ bins, threshold, onPick }: { bins: Uint32Array; threshold: number; onPick: (t: number) => void }) {
  let max = 1;
  for (const b of bins) max = Math.max(max, Math.sqrt(b));
  const w = 100 / HIST_BINS;
  return (
    <svg
      className="histogram"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label="Distribution of cell probabilities"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick(Math.round(((e.clientX - r.left) / r.width) * 100) / 100);
      }}
    >
      {Array.from(bins, (b, i) => {
        const h = (Math.sqrt(b) / max) * 30;
        const on = (i + 1) / HIST_BINS > threshold;
        return <rect key={i} x={i * w + 0.15} y={32 - h} width={w - 0.3} height={h} fill={viridisCss((i + 0.5) / HIST_BINS, on ? 1 : 0.18)} />;
      })}
      <line x1={threshold * 100} x2={threshold * 100} y1={0} y2={32} className="hist-cursor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Bivariate legend: probability across, confidence up. Drawn with the same
 * colour and opacity formula as the shader, over a checkerboard so the
 * opacity channel is visible.
 */
export function Legend({ useConfidence, minOpacity, gamma }: { useConfidence: boolean; minOpacity: number; gamma: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 220, H = 64;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    const ctx = cvs.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const sq = 6;
    for (let y = 0; y < H; y += sq) for (let x = 0; x < W; x += sq) {
      ctx.fillStyle = ((x + y) / sq) % 2 ? '#2a3442' : '#151c26';
      ctx.fillRect(x, y, sq, sq);
    }
    const cols = 44, rows = 8;
    for (let r = 0; r < rows; r++) {
      const c = 1 - (r + 0.5) / rows;
      const w = Math.pow(c, gamma);
      const alpha = useConfidence ? minOpacity + (1 - minOpacity) * w : 1;
      const sat = useConfidence ? 0.4 + 0.6 * w : 1;
      for (let q = 0; q < cols; q++) {
        const p = (q + 0.5) / cols;
        ctx.fillStyle = desaturate(viridisCss(p), sat, alpha);
        ctx.fillRect((q * W) / cols, (r * H) / rows, W / cols + 0.5, H / rows + 0.5);
      }
    }
  }, [useConfidence, minOpacity, gamma]);

  return (
    <figure className="legend">
      <div className="legend-body">
        <span className="legend-y">
          <span>high</span>
          <span className="legend-axis">confidence</span>
          <span>low</span>
        </span>
        <canvas ref={ref} style={{ width: 220, height: 64 }} aria-label="Legend: colour shows probability, opacity shows confidence" />
      </div>
      <figcaption>
        <span>0</span>
        <span className="legend-axis">probability</span>
        <span>1</span>
      </figcaption>
    </figure>
  );
}

function desaturate(rgba: string, sat: number, alpha: number) {
  const [r, g, b] = rgba.match(/[\d.]+/g)!.map(Number);
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const m = (v: number) => Math.round(l + (v - l) * sat);
  return `rgba(${m(r)}, ${m(g)}, ${m(b)}, ${alpha})`;
}
