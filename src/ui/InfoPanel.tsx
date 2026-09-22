import { useEffect, useRef } from 'react';
import { viridisCss } from '../data/colormap';

const SEEN_KEY = 'pv-info-seen';

export function hasSeenInfo(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag on every load
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

const gradient = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => viridisCss(t)).join(', ')})`;

/** Plain-language primer on the synthetic geology, for non-geologists. */
export function InfoPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    markSeen();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className="info"
      aria-labelledby="info-title"
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="info-inner">
        <header className="info-head">
          <h2 id="info-title">What am I looking at?</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        <p className="info-lead">
          A block of ground 1 km across and 500 m deep, cut into small cubes (cells). For every cell, a model answers two
          questions: <em>is there likely to be ore here?</em> and <em>how sure are we?</em> All data here is synthetic.
        </p>

        <div className="info-grid">
          <section>
            <h3>
              <span className="info-swatch" style={{ background: gradient }} /> Probability = colour
            </h3>
            <p>
              How likely the cell contains copper–gold mineralisation. Ore tends to form where hot fluids rise along a{' '}
              <strong>fault</strong> (a crack in the crust, the pathway) and meet a reactive <strong>rock layer</strong>{' '}
              that makes the metals drop out (the trap). So the brightest cells sit where the tilted fault crosses that layer.
            </p>
          </section>

          <section>
            <h3>
              <span className="info-swatch fade" /> Confidence = opacity
            </h3>
            <p>
              How much real evidence supports the prediction. Near a drill hole we have actual rock samples, so cells are
              solid. Far from holes, and deeper down, the model is guessing, so cells fade toward clear glass. A faded cell
              is not "low", it is <em>unknown</em>.
            </p>
          </section>

          <section>
            <h3>
              <span className="info-swatch hole" /> Drill holes = white lines
            </h3>
            <p>
              Each line is a hole drilled from the surface (labelled DH- or RC-). Holes are where confidence comes from. Most
              were drilled near targets already known, which is typical in exploration, and it leaves blind spots elsewhere.
            </p>
          </section>
        </div>

        <h3 className="info-sub">Reading colour and opacity together</h3>
        <ul className="info-quad">
          <li>
            <span className="q" style={{ background: viridisCss(0.95) }} />
            <span><strong>Bright and solid</strong>: likely ore, well supported. A drill-ready target.</span>
          </li>
          <li>
            <span className="q" style={{ background: viridisCss(0.95, 0.25) }} />
            <span><strong>Bright but faded</strong>: the model likes it, but nobody has checked. The best place for the next hole.</span>
          </li>
          <li>
            <span className="q" style={{ background: viridisCss(0.15) }} />
            <span><strong>Dark and solid</strong>: drilled and found nothing. Confidently barren.</span>
          </li>
          <li>
            <span className="q" style={{ background: viridisCss(0.15, 0.25) }} />
            <span><strong>Dark and faded</strong>: probably background, but untested.</span>
          </li>
        </ul>

        <p className="info-tip">
          Try it: find the faint yellow body away from the fault, far from any drill hole, and hover it. That is the
          "speculative" target the panel counts.
        </p>

        <footer className="info-foot">
          <button className="btn primary" onClick={close} autoFocus>
            Explore the model
          </button>
        </footer>
      </div>
    </dialog>
  );
}
