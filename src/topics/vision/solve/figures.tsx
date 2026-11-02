// Static figure for the vision-pinhole generator: a side view with this instance's labels (not to scale).
import type { ComponentType } from 'react';
import '../vision.css';

export interface PinholeLabels {
  f: string;
  Z: string;
  h: string;
  hi: string;
  /** Optional caption under the figure. */
  note?: string;
}

/** Side view: object of height h at depth Z, the pinhole, the image plane f behind it and the inverted image h′. */
export function makePinholeFigure(l: PinholeLabels): ComponentType {
  return function PinholeFigure() {
    const y0 = 104;
    const xo = 70;
    const xp = 330;
    const xi = 430;
    const ho = 70;
    const hi = (ho * (xi - xp)) / (xp - xo);
    return (
      <svg viewBox="0 0 520 190" className="vision-svg vision-fig" role="img" aria-label={`Pinhole side view: f ${l.f}, Z ${l.Z}, h ${l.h}, image ${l.hi}`}>
        <rect x={xp} y={y0 - 50} width={xi - xp + 8} height={100} rx={5} className="vision-cambody" />
        <line x1={xp} y1={y0 - 50} x2={xp} y2={y0 - 4} className="vision-camwall" />
        <line x1={xp} y1={y0 + 4} x2={xp} y2={y0 + 50} className="vision-camwall" />
        <line x1={xi} y1={y0 - 46} x2={xi} y2={y0 + 46} className="vision-sensor" />
        <line x1={20} y1={y0} x2={505} y2={y0} className="vision-axis" />
        <polygon points={`${xp},${y0} ${xo},${y0} ${xo},${y0 - ho}`} className="vision-tri" />
        <polygon points={`${xp},${y0} ${xi},${y0} ${xi},${y0 + hi}`} className="vision-tri" />
        <line x1={xo} y1={y0 - ho} x2={xi} y2={y0 + hi} className="vision-ray" />
        <line x1={xo} y1={y0} x2={xo} y2={y0 - ho} className="vision-obj" />
        <line x1={xi} y1={y0} x2={xi} y2={y0 + hi} className="vision-obj is-img" />
        <circle cx={xp} cy={y0} r={3.5} className="vision-pinhole" />
        <text x={xo - 6} y={y0 - ho / 2} textAnchor="end" className="vision-label">
          h {l.h}
        </text>
        <line x1={xo} y1={y0 + 22} x2={xp} y2={y0 + 22} className="vision-dim" />
        <text x={(xo + xp) / 2} y={y0 + 38} textAnchor="middle" className="vision-label">
          Z {l.Z}
        </text>
        <line x1={xp} y1={y0 - 60} x2={xi} y2={y0 - 60} className="vision-dim" />
        <text x={(xp + xi) / 2} y={y0 - 66} textAnchor="middle" className="vision-label">
          f {l.f}
        </text>
        <text x={xi + 8} y={y0 + hi / 2 + 4} className="vision-label">
          h′ {l.hi}
        </text>
        {l.note && (
          <text x={10} y={184} className="vision-small">
            {l.note}
          </text>
        )}
      </svg>
    );
  };
}
