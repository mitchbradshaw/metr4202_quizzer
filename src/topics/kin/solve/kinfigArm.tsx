// The exam-style arm figure (SVG) for the kinematics exam-mode generators, drawn from each instance's ArmSpec by
// kinfigLayout.ts. Optional "reveal" buttons overlay the answer geometry once the student has had a go:
// the q_i vectors and ω_i arrows (screw table), the vector p (M), and the camera's line of sight.
// "Pin figure" keeps a small copy in the corner of the window once the figure scrolls out of view, so the
// drawing stays readable while the student fills the screw table or the camera parts further down.
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { ArmSpec } from '../../../core/kin';
import { Button } from '../../../ui/kit';
import { usePersisted } from '../../../ui/persist';
import { layoutArmFigure, type ArmFigureModel, type FigItem, type OverlayId } from './kinfigLayout';
import './kinfig.css';

function Item({ it }: { it: FigItem }) {
  switch (it.k) {
    case 'line':
      return <line x1={it.a.x} y1={it.a.y} x2={it.b.x} y2={it.b.y} className={it.cls} />;
    case 'path':
      return <path d={`M${it.pts.map((p) => `${p.x},${p.y}`).join('L')}${it.closed ? 'Z' : ''}`} className={it.cls} />;
    case 'curve':
      return <path d={`M${it.a.x},${it.a.y}C${it.c1.x},${it.c1.y} ${it.c2.x},${it.c2.y} ${it.b.x},${it.b.y}`} className={it.cls} />;
    case 'dot':
      return <circle cx={it.c.x} cy={it.c.y} r={it.r} className={it.cls} />;
    default:
      return (
        <text x={it.x} y={it.y} textAnchor={it.anchor} className={`kin-fig-text ${it.cls}`}>
          {it.pre && <tspan>{it.pre}</tspan>}
          <tspan fontStyle="italic">
            {it.main}
            {it.hat ? '̂' : ''}
          </tspan>
          {it.sub && (
            <tspan dy="0.32em" fontSize="0.74em">
              {it.sub}
            </tspan>
          )}
        </text>
      );
  }
}

/** The drawing itself, with one overlay (or none) switched on. */
function FigSvg({ model, on, scale, className }: { model: ArmFigureModel; on: OverlayId | null; scale: number; className: string }) {
  const ov = on ? model.overlays[on] : undefined;
  // an overlay with its own view box (the arm at a pose) grows the canvas at the same scale
  const vb = (on && model.views[on]) || { x: 0, y: 0, w: model.W, h: model.H };
  return (
    <svg className={className} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} width="100%" style={{ maxWidth: Math.round(vb.w * scale) }} role="img" aria-label={model.aria}>
      {model.items.map((it, i) => (
        <Item key={i} it={it} />
      ))}
      {ov && (
        <g className="kin-fig-ov">
          {ov.map((it, i) => (
            <Item key={`o${i}`} it={it} />
          ))}
        </g>
      )}
    </svg>
  );
}

export interface ArmFigureOptions {
  /** Reveal buttons, in order: which overlay and its button label. */
  reveals?: { id: OverlayId; label: string }[];
  /** One line under the figure (plain text). */
  caption?: string;
  sName?: string;
  bName?: string;
  /** Start with this reveal switched on (previews). */
  initialReveal?: OverlayId;
  /** Joint values for the 'pose' reveal (the arm drawn dashed at this configuration). */
  pose?: number[];
  /** Offer the "Pin figure" button (default true). */
  pin?: boolean;
}

/** A figure component for one generated instance. The layout is computed once, on first render. */
export function armFigure(arm: ArmSpec, o: ArmFigureOptions = {}): ComponentType {
  function ArmFigure() {
    const model = useMemo(() => layoutArmFigure(arm, { overlays: o.reveals?.map((r) => r.id), sName: o.sName, bName: o.bName, pose: o.pose }), []);
    const [on, setOn] = useState<OverlayId | null>(o.initialReveal ?? null);
    // one switch for the whole session: once pinned, every later problem's figure follows the student too
    const [pinned, setPinned] = usePersisted<boolean>('kin-fig:pinned', false);
    const [away, setAway] = useState(false);
    const wrapRef = useRef<HTMLElement>(null);
    useEffect(() => {
      const el = wrapRef.current;
      if (!pinned || !el || typeof IntersectionObserver === 'undefined') {
        setAway(false);
        return;
      }
      // "away" once less than a third of the drawing is visible below the sticky header
      const io = new IntersectionObserver(([e]) => setAway(e.intersectionRatio < 0.34), { rootMargin: '-104px 0px 0px 0px', threshold: [0, 0.34, 0.67, 1] });
      io.observe(el);
      return () => io.disconnect();
    }, [pinned]);
    const offerPin = o.pin !== false;
    return (
      <figure className="kin-fig-wrap" ref={wrapRef}>
        <FigSvg model={model} on={on} scale={1.2} className="kin-fig" />
        {(o.caption || offerPin || (o.reveals && o.reveals.length > 0)) && (
          <figcaption className="kin-fig-cap">
            {o.caption && <span className="muted small">{o.caption}</span>}
            {o.reveals?.map((r) => (
              <Button key={r.id} size="sm" variant={on === r.id ? 'primary' : 'ghost'} aria-pressed={on === r.id} onClick={() => setOn(on === r.id ? null : r.id)}>
                {on === r.id ? `Hide: ${r.label}` : `Reveal: ${r.label}`}
              </Button>
            ))}
            {offerPin && (
              <Button
                size="sm"
                variant="ghost"
                className="kin-fig-pinbtn"
                aria-pressed={pinned}
                title="Keep a small copy of this figure in the corner of the window while you scroll down to the parts"
                onClick={() => setPinned(!pinned)}
              >
                {pinned ? 'Unpin figure' : 'Pin figure while scrolling'}
              </Button>
            )}
          </figcaption>
        )}
        {pinned && away && (
          <aside className="kin-fig-float" aria-label="Pinned copy of the figure">
            <div className="kin-fig-floathead">
              <span className="muted small">Figure{on ? ' (with the reveal shown above)' : ''}</span>
              <Button size="sm" variant="ghost" onClick={() => setPinned(false)}>
                Unpin
              </Button>
            </div>
            <FigSvg model={model} on={on} scale={1} className="kin-fig kin-fig-mini" />
          </aside>
        )}
      </figure>
    );
  }
  return ArmFigure;
}
