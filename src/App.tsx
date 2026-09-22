import { useEffect, useState } from 'react';
import { CLASS, EXTENT, generateVolume, type Volume } from './data/generate';
import { DEFAULT_SETTINGS, RESOLUTIONS, type Settings } from './data/settings';
import { Scene, type ViewName, type ViewRequest } from './scene/Scene';
import { Histogram, Legend, RangeSlider, Section, Segmented, Slider, Toggle } from './ui/controls';
import { FpsMeter, Tooltip } from './ui/overlays';
import { hasSeenInfo, InfoPanel } from './ui/InfoPanel';

const fmt = new Intl.NumberFormat('en-US');
const INITIAL = { nx: 40, seed: 7 };

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [target, setTarget] = useState(INITIAL);
  const [volume, setVolume] = useState<Volume>(() => generateVolume(INITIAL.nx, INITIAL.seed));
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewRequest>({ name: 'iso', nonce: 0 });
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 720);
  const [infoOpen, setInfoOpen] = useState(() => !hasSeenInfo());

  // Regenerate off the input event so the "Generating" state can paint first.
  useEffect(() => {
    if (volume.nx === target.nx && volume.seed === target.seed) return;
    setBusy(true);
    const t = setTimeout(() => {
      setVolume(generateVolume(target.nx, target.seed));
      setBusy(false);
    }, 30);
    return () => clearTimeout(t);
  }, [target, volume.nx, volume.seed]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const setClip = (axis: keyof Settings['clip'], r: [number, number]) => setSettings((s) => ({ ...s, clip: { ...s.clip, [axis]: r } }));
  const goView = (name: ViewName) => setView((v) => ({ name, nonce: v.nonce + 1 }));
  const clipped = Object.values(settings.clip).some(([a, b]) => a > 0 || b < 1);
  const m = (scale: number) => (v: number) => `${Math.round(v * scale)} m`;

  return (
    <div className="app">
      <Scene volume={volume} settings={settings} view={view} />

      <aside className={`panel ${panelOpen ? '' : 'is-collapsed'}`} aria-label="Controls">
        <header className="panel-head">
          <div>
            <h1>Prospectivity Viewer</h1>
            <p className="subtitle">Synthetic Cu–Au block · 1 × 1 km × 500 m</p>
            <button className="link-btn about-link" onClick={() => setInfoOpen(true)}>
              What am I looking at?
            </button>
          </div>
          <button className="icon-btn panel-toggle" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} aria-label="Toggle controls">
            {panelOpen ? '–' : '+'}
          </button>
        </header>

        <div className="panel-body">
          <Section title="Probability" aside={<span className="pill">p ≥ {settings.threshold.toFixed(2)}</span>}>
            <Histogram bins={volume.histogram} threshold={settings.threshold} onPick={(t) => set('threshold', t)} />
            <Slider label="Threshold" value={settings.threshold} min={0} max={0.95} step={0.01} onChange={(v) => set('threshold', v)} />
          </Section>

          <Section
            title="Slices"
            aside={
              <button className="link-btn" disabled={!clipped} onClick={() => set('clip', DEFAULT_SETTINGS.clip)}>
                Reset
              </button>
            }
          >
            <RangeSlider label="East" value={settings.clip.x} steps={volume.nx} format={m(EXTENT.x)} onChange={(r) => setClip('x', r)} />
            <RangeSlider label="North" value={settings.clip.y} steps={volume.ny} format={m(EXTENT.y)} onChange={(r) => setClip('y', r)} />
            <RangeSlider label="Depth" value={settings.clip.z} steps={volume.nz} format={m(EXTENT.z)} onChange={(r) => setClip('z', r)} />
          </Section>

          <Section title="Confidence">
            <Toggle
              label="Fade uncertain cells"
              hint="Confidence → opacity"
              checked={settings.useConfidence}
              onChange={(v) => set('useConfidence', v)}
            />
            <Slider label="Floor opacity" value={settings.minOpacity} min={0} max={0.5} step={0.01} disabled={!settings.useConfidence} onChange={(v) => set('minOpacity', v)} />
            <Slider label="Fade curve" value={settings.gamma} min={0.4} max={3} step={0.05} format={(v) => `γ ${v.toFixed(2)}`} disabled={!settings.useConfidence} onChange={(v) => set('gamma', v)} />
            <Legend useConfidence={settings.useConfidence} minOpacity={settings.minOpacity} gamma={settings.gamma} />
          </Section>

          <Section title="What the model says">
            <div className="stats">
              <div className="stat">
                <span className="stat-num go">{fmt.format(volume.stats.drillReady)}</span>
                <span className="stat-label">
                  drill-ready cells
                  <br />
                  <span className="tt-dim">
                    p ≥ {CLASS.prospective}, conf ≥ {CLASS.confident}
                  </span>
                </span>
              </div>
              <div className="stat">
                <span className="stat-num warn">{fmt.format(volume.stats.speculative)}</span>
                <span className="stat-label">
                  speculative cells
                  <br />
                  <span className="tt-dim">
                    p ≥ {CLASS.prospective}, conf &lt; {CLASS.uncertain}
                  </span>
                </span>
              </div>
            </div>
            <p className="note">Faded high-probability cells are where new data would change the picture most. Look for the undrilled body away from the fault.</p>
          </Section>

          <Section title="Display">
            <Segmented
              value={target.nx}
              onChange={(nx) => setTarget((t) => ({ ...t, nx }))}
              options={RESOLUTIONS.map((r) => ({ value: r.nx as number, label: r.note, title: r.label }))}
            />
            <Slider label="Voxel size" value={settings.voxelScale} min={0.4} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('voxelScale', v)} />
            <Toggle label="Drill holes" checked={settings.showDrillHoles} onChange={(v) => set('showDrillHoles', v)} />
            <div className="btn-row">
              {(['iso', 'top', 'south', 'east'] as ViewName[]).map((v) => (
                <button key={v} className="btn" onClick={() => goView(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button className="btn wide" onClick={() => setTarget((t) => ({ ...t, seed: (t.seed * 48271 + 11) % 2147483647 }))}>
                New synthetic block
              </button>
              <span className="tt-dim seed">seed {volume.seed}</span>
            </div>
          </Section>
        </div>
      </aside>

      <FpsMeter total={volume.stats.total} />
      <Tooltip volume={volume} />
      <InfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} />
      {busy && <div className="busy">Generating {RESOLUTIONS.find((r) => r.nx === target.nx)?.note}…</div>}
      <p className="hint-bar">Drag to orbit · scroll to zoom · right-drag to pan · hover a cell to inspect</p>
    </div>
  );
}
