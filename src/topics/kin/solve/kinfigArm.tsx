// The exam-style arm figure (SVG) for the kinematics exam-mode generators, drawn from each instance's ArmSpec by
// kinfigLayout.ts. Optional "reveal" buttons overlay the answer geometry once the student has had a go:
// the q_i vectors and ω_i arrows (screw table), the vector p (M), and the camera's line of sight.
import { useMemo, useState, type ComponentType } from 'react';
import type { ArmSpec } from '../../../core/kin';
import { Button } from '../../../ui/kit';
import { layoutArmFigure, type FigItem, type OverlayId } from './kinfigLayout';
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

export interface ArmFigureOptions {
  /** Reveal buttons, in order: which overlay and its button label. */
  reveals?: { id: OverlayId; label: string }[];
  /** One line under the figure (plain text). */
  caption?: string;
  sName?: string;
  bName?: string;
  /** Start with this reveal switched on (previews). */
  initialReveal?: OverlayId;
}

/** A figure component for one generated instance. The layout is computed once, on first render. */
export function armFigure(arm: ArmSpec, o: ArmFigureOptions = {}): ComponentType {
  function ArmFigure() {
    const model = useMemo(() => layoutArmFigure(arm, { overlays: o.reveals?.map((r) => r.id), sName: o.sName, bName: o.bName }), []);
    const [on, setOn] = useState<OverlayId | null>(o.initialReveal ?? null);
    const ov = on ? model.overlays[on] : undefined;
    return (
      <figure className="kin-fig-wrap">
        <svg className="kin-fig" viewBox={`0 0 ${model.W} ${model.H}`} width="100%" style={{ maxWidth: model.W }} role="img" aria-label={model.aria}>
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
        {(o.caption || (o.reveals && o.reveals.length > 0)) && (
          <figcaption className="kin-fig-cap">
            {o.caption && <span className="muted small">{o.caption}</span>}
            {o.reveals?.map((r) => (
              <Button key={r.id} size="sm" variant={on === r.id ? 'primary' : 'ghost'} aria-pressed={on === r.id} onClick={() => setOn(on === r.id ? null : r.id)}>
                {on === r.id ? `Hide: ${r.label}` : `Reveal: ${r.label}`}
              </Button>
            ))}
          </figcaption>
        )}
      </figure>
    );
  }
  return ArmFigure;
}
