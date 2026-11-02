// SVG plotting kit. <Plot> sets up axes/scales; children (Line, VLine, Band, Dot, Handle...) draw in data units.
//
//   <Plot x={{ min: 0, max: 3, label: 'r = Ω/ωₙ' }} y={{ min: 0, max: 5, label: 'X/(F₀/k)' }}>
//     <Line points={pts} color="var(--m1)" />
//     <VLine x={Math.SQRT2} label="√2" dash />
//     <Handle x={r} y={T} axis="x" onChange={(x) => setR(x)} label="operating point" />
//   </Plot>
import {
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { linearScale, logScale, logTicks, niceTicks, tickLabel, type Scale } from './scale';
import { useWidth } from '../anim/hooks';

export interface AxisSpec {
  min: number;
  max: number;
  log?: boolean;
  label?: string;
  /** Explicit tick values (else automatic). */
  ticks?: number[];
  format?: (v: number) => string;
  /** Hide grid lines for this axis. */
  noGrid?: boolean;
}

interface Ctx {
  sx: Scale;
  sy: Scale;
  x0: number;
  y0: number;
  iw: number;
  ih: number;
  clip: string;
  xAxis: AxisSpec;
  yAxis: AxisSpec;
}

const PlotCtx = createContext<Ctx | null>(null);

export function usePlot(): Ctx {
  const c = useContext(PlotCtx);
  if (!c) throw new Error('Plot children must be inside <Plot>');
  return c;
}

export interface PlotProps {
  x: AxisSpec;
  y: AxisSpec;
  height?: number;
  children?: ReactNode;
  /** Accessible description of what the plot shows. */
  ariaLabel?: string;
  /** Pointer position in data units (null when the pointer leaves). */
  onHover?: (x: number | null, y: number | null) => void;
  onClickData?: (x: number, y: number) => void;
  /** Draw a vertical cursor line at this x. */
  cursorX?: number | null;
  margin?: Partial<{ l: number; r: number; t: number; b: number }>;
  className?: string;
}

export function Plot({ x, y, height = 260, children, ariaLabel, onHover, onClickData, cursorX, margin, className }: PlotProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const clip = useId().replace(/:/g, '');
  const m = { l: 54, r: 14, t: 12, b: 40, ...margin };
  if (!y.label) m.l = Math.min(m.l, 44);
  if (!x.label) m.b = Math.min(m.b, 26);
  const iw = Math.max(40, width - m.l - m.r);
  const ih = Math.max(40, height - m.t - m.b);
  const ctx = useMemo<Ctx>(() => {
    const sx = x.log ? logScale(x.min, x.max, m.l, m.l + iw) : linearScale(x.min, x.max, m.l, m.l + iw);
    const sy = y.log ? logScale(y.min, y.max, m.t + ih, m.t) : linearScale(y.min, y.max, m.t + ih, m.t);
    return { sx, sy, x0: m.l, y0: m.t, iw, ih, clip, xAxis: x, yAxis: y };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x.min, x.max, x.log, y.min, y.max, y.log, iw, ih, m.l, m.t, clip, x, y]);

  const xt = useMemo(() => axisTicks(x, Math.max(2, Math.round(iw / 90))), [x, iw]);
  const yt = useMemo(() => axisTicks(y, Math.max(2, Math.round(ih / 50))), [y, ih]);

  const toData = (e: ReactPointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    return [ctx.sx.invert(e.clientX - r.left), ctx.sy.invert(e.clientY - r.top)] as const;
  };

  return (
    <div ref={wrapRef} className={`plot ${className || ''}`}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="plot-svg">
        <defs>
          <clipPath id={clip}>
            <rect x={m.l} y={m.t} width={iw} height={ih} />
          </clipPath>
        </defs>
        {/* grid */}
        {!x.noGrid &&
          xt.minor.map((v) => <line key={`xm${v}`} className="grid-minor" x1={ctx.sx(v)} x2={ctx.sx(v)} y1={m.t} y2={m.t + ih} />)}
        {!y.noGrid &&
          yt.minor.map((v) => <line key={`ym${v}`} className="grid-minor" y1={ctx.sy(v)} y2={ctx.sy(v)} x1={m.l} x2={m.l + iw} />)}
        {!x.noGrid && xt.major.map((v) => <line key={`xg${v}`} className="grid" x1={ctx.sx(v)} x2={ctx.sx(v)} y1={m.t} y2={m.t + ih} />)}
        {!y.noGrid && yt.major.map((v) => <line key={`yg${v}`} className="grid" y1={ctx.sy(v)} y2={ctx.sy(v)} x1={m.l} x2={m.l + iw} />)}
        <rect x={m.l} y={m.t} width={iw} height={ih} className="plot-frame" />
        {/* zero line */}
        {!y.log && y.min < 0 && y.max > 0 && <line className="zero" x1={m.l} x2={m.l + iw} y1={ctx.sy(0)} y2={ctx.sy(0)} />}
        {/* tick labels */}
        {xt.major.map((v) => (
          <text key={`xl${v}`} className="tick" x={ctx.sx(v)} y={m.t + ih + 15} textAnchor="middle">
            {(x.format || tickLabel)(v)}
          </text>
        ))}
        {yt.major.map((v) => (
          <text key={`yl${v}`} className="tick" x={m.l - 6} y={ctx.sy(v) + 4} textAnchor="end">
            {(y.format || tickLabel)(v)}
          </text>
        ))}
        {x.label && (
          <text className="axis-label" x={m.l + iw / 2} y={height - 6} textAnchor="middle">
            {x.label}
          </text>
        )}
        {y.label && (
          <text className="axis-label" transform={`translate(13 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle">
            {y.label}
          </text>
        )}
        <PlotCtx.Provider value={ctx}>
          {(onHover || onClickData) && (
            <rect
              x={m.l}
              y={m.t}
              width={iw}
              height={ih}
              fill="transparent"
              style={{ cursor: onClickData ? 'crosshair' : undefined }}
              onPointerMove={(e) => {
                const [dx, dy] = toData(e);
                onHover?.(dx, dy);
              }}
              onPointerLeave={() => onHover?.(null, null)}
              onClick={(e) => {
                const [dx, dy] = toData(e as unknown as ReactPointerEvent<SVGRectElement>);
                onClickData?.(dx, dy);
              }}
            />
          )}
          {children}
          {cursorX != null && Number.isFinite(cursorX) && (
            <line className="cursor" x1={ctx.sx(cursorX)} x2={ctx.sx(cursorX)} y1={m.t} y2={m.t + ih} pointerEvents="none" />
          )}
        </PlotCtx.Provider>
      </svg>
    </div>
  );
}

function axisTicks(a: AxisSpec, count: number): { major: number[]; minor: number[] } {
  if (a.ticks) return { major: a.ticks, minor: [] };
  if (a.log) return logTicks(a.min, a.max);
  // Short axes: ask for denser ticks until at least 3 land inside [min, max].
  let major = niceTicks(a.min, a.max, count);
  for (let c = count + 1; major.length < 3 && c <= count + 8; c++) major = niceTicks(a.min, a.max, c);
  return { major, minor: [] };
}

// ------------------------------------------------------------------ series

type Pts = ArrayLike<readonly [number, number]> | { x: ArrayLike<number>; y: ArrayLike<number> };

function toPath(pts: Pts, sx: Scale, sy: Scale, yLog?: boolean): string {
  const n = 'x' in pts ? pts.x.length : pts.length;
  const get = 'x' in pts ? (i: number) => [pts.x[i], pts.y[i]] : (i: number) => (pts as ArrayLike<readonly [number, number]>)[i];
  let d = '';
  let pen = false;
  for (let i = 0; i < n; i++) {
    const [xv, yv] = get(i);
    if (!Number.isFinite(xv) || !Number.isFinite(yv) || (yLog && yv <= 0)) {
      pen = false;
      continue;
    }
    const px = sx(xv);
    const py = Math.max(-5000, Math.min(5000, sy(yv)));
    d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function Line({ points, color = 'var(--m1)', width = 2, dash, opacity, label }: { points: Pts; color?: string; width?: number; dash?: string | boolean; opacity?: number; label?: string }) {
  const { sx, sy, clip, yAxis } = usePlot();
  const d = toPath(points, sx, sy, yAxis.log);
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dash === true ? '6 4' : dash || undefined}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={opacity}
      clipPath={`url(#${clip})`}
      aria-label={label}
    />
  );
}

/** Filled area between a curve and y = base. */
export function Area({ points, base = 0, color = 'var(--m1)', opacity = 0.15 }: { points: Pts; base?: number; color?: string; opacity?: number }) {
  const { sx, sy, clip } = usePlot();
  const n = 'x' in points ? points.x.length : points.length;
  if (!n) return null;
  const first = 'x' in points ? points.x[0] : points[0][0];
  const last = 'x' in points ? points.x[n - 1] : points[n - 1][0];
  const d = `${toPath(points, sx, sy)}L${sx(last)} ${sy(base)}L${sx(first)} ${sy(base)}Z`;
  return <path d={d} fill={color} opacity={opacity} stroke="none" clipPath={`url(#${clip})`} />;
}

export function VLine({ x, color = 'var(--text-3)', dash = true, label, labelY = 'top', width = 1.5 }: { x: number; color?: string; dash?: boolean | string; label?: string; labelY?: 'top' | 'bottom'; width?: number }) {
  const { sx, y0, ih, x0, iw } = usePlot();
  if (!Number.isFinite(x)) return null;
  const px = sx(x);
  if (px < x0 - 1 || px > x0 + iw + 1) return null;
  return (
    <g pointerEvents="none">
      <line x1={px} x2={px} y1={y0} y2={y0 + ih} stroke={color} strokeWidth={width} strokeDasharray={dash === true ? '5 4' : dash || undefined} />
      {label && (
        <text className="plot-note" x={px + 4} y={labelY === 'top' ? y0 + 13 : y0 + ih - 6} fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

export function HLine({ y, color = 'var(--text-3)', dash = true, label, width = 1.5 }: { y: number; color?: string; dash?: boolean | string; label?: string; width?: number }) {
  const { sy, x0, iw, y0, ih } = usePlot();
  if (!Number.isFinite(y)) return null;
  const py = sy(y);
  if (py < y0 - 1 || py > y0 + ih + 1) return null;
  return (
    <g pointerEvents="none">
      <line x1={x0} x2={x0 + iw} y1={py} y2={py} stroke={color} strokeWidth={width} strokeDasharray={dash === true ? '5 4' : dash || undefined} />
      {label && (
        <text className="plot-note" x={x0 + iw - 4} y={py - 4} textAnchor="end" fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Vertical band between x0 and x1 (e.g. the ±x % exclusion band, or the isolation region). */
export function Band({ x0: a, x1: b, color = 'var(--accent)', opacity = 0.1, label }: { x0: number; x1: number; color?: string; opacity?: number; label?: string }) {
  const { sx, y0, ih, clip } = usePlot();
  const pa = sx(a);
  const pb = sx(b);
  return (
    <g pointerEvents="none">
      <rect x={Math.min(pa, pb)} y={y0} width={Math.abs(pb - pa)} height={ih} fill={color} opacity={opacity} clipPath={`url(#${clip})`} />
      {label && (
        <text className="plot-note" x={(pa + pb) / 2} y={y0 + ih - 6} textAnchor="middle" fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Horizontal band between y0 and y1. */
export function HBand({ y0: a, y1: b, color = 'var(--accent)', opacity = 0.1 }: { y0: number; y1: number; color?: string; opacity?: number }) {
  const { sy, x0, iw, clip } = usePlot();
  const pa = sy(a);
  const pb = sy(b);
  return <rect x={x0} y={Math.min(pa, pb)} width={iw} height={Math.abs(pb - pa)} fill={color} opacity={opacity} clipPath={`url(#${clip})`} pointerEvents="none" />;
}

export function Dot({ x, y, r = 4.5, color = 'var(--m1)', label, hollow, labelPos = 'right' }: { x: number; y: number; r?: number; color?: string; label?: string; hollow?: boolean; labelPos?: 'right' | 'left' | 'above' | 'below' }) {
  const { sx, sy, x0, iw, y0, ih } = usePlot();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const px = sx(x);
  const py = sy(y);
  if (px < x0 - 2 || px > x0 + iw + 2 || py < y0 - 2 || py > y0 + ih + 2) return null;
  return (
    <g pointerEvents="none">
      <circle cx={px} cy={py} r={r} fill={hollow ? 'var(--surface)' : color} stroke={color} strokeWidth={2} />
      {label && (
        <text
          className="plot-note"
          x={labelPos === 'left' ? px - r - 3 : labelPos === 'above' || labelPos === 'below' ? px : px + r + 3}
          y={labelPos === 'above' ? py - r - 4 : labelPos === 'below' ? py + r + 13 : py + 4}
          textAnchor={labelPos === 'left' ? 'end' : labelPos === 'above' || labelPos === 'below' ? 'middle' : 'start'}
          fill={color}
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function PlotText({ x, y, children, anchor = 'start', color = 'var(--text-2)', dx = 0, dy = 0 }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; color?: string; dx?: number; dy?: number }) {
  const { sx, sy } = usePlot();
  return (
    <text className="plot-note" x={sx(x) + dx} y={sy(y) + dy} textAnchor={anchor} fill={color} pointerEvents="none">
      {children}
    </text>
  );
}

/** Vertical stems from y = base (spectra, modal contributions). */
export function Stems({ xs, ys, color = 'var(--m1)', base = 0, width = 2, dots = true }: { xs: ArrayLike<number>; ys: ArrayLike<number>; color?: string; base?: number; width?: number; dots?: boolean }) {
  const { sx, sy, clip, yAxis } = usePlot();
  const b = yAxis.log ? yAxis.min : base;
  const out: ReactNode[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(ys[i]) || (yAxis.log && ys[i] <= 0)) continue;
    const px = sx(xs[i]);
    out.push(<line key={`l${i}`} x1={px} x2={px} y1={sy(b)} y2={sy(ys[i])} stroke={color} strokeWidth={width} />);
    if (dots) out.push(<circle key={`c${i}`} cx={px} cy={sy(ys[i])} r={2.5} fill={color} />);
  }
  return <g clipPath={`url(#${clip})`}>{out}</g>;
}

/** Bars centred on x with width w (data units). */
export function Bars({ bars, width }: { bars: { x: number; y: number; color?: string; label?: string }[]; width: number }) {
  const { sx, sy, clip, yAxis } = usePlot();
  const base = yAxis.min > 0 ? yAxis.min : yAxis.max < 0 ? yAxis.max : 0;
  return (
    <g clipPath={`url(#${clip})`}>
      {bars.map((b, i) => {
        const xa = sx(b.x - width / 2);
        const xb = sx(b.x + width / 2);
        const ya = sy(base);
        const yb = sy(b.y);
        return (
          <g key={i}>
            <rect x={Math.min(xa, xb)} y={Math.min(ya, yb)} width={Math.abs(xb - xa)} height={Math.abs(yb - ya)} fill={b.color || 'var(--m1)'} rx={2} />
            {b.label && (
              <text className="plot-note" x={(xa + xb) / 2} y={Math.min(ya, yb) - 4} textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Draggable point. Pointer drag and arrow keys (Shift for bigger steps).
 * axis="x" moves only horizontally (y follows from the parent's curve), etc.
 */
export function Handle({
  x,
  y,
  onChange,
  axis = 'xy',
  color = 'var(--accent)',
  label,
  ariaLabel,
  r = 7,
  clampX,
  clampY,
  labelPos = 'auto',
  onDragStart,
  onDragEnd,
}: {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  axis?: 'x' | 'y' | 'xy';
  color?: string;
  label?: string;
  ariaLabel?: string;
  r?: number;
  clampX?: [number, number];
  clampY?: [number, number];
  /** Where to draw `label`; 'auto' flips to the left near the right edge. */
  labelPos?: 'auto' | 'right' | 'left' | 'below';
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { sx, sy, xAxis, yAxis, x0, iw } = usePlot();
  const dragging = useRef(false);
  const cx = sx(x);
  const cy = sy(y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const clampV = (v: number, c?: [number, number], a?: AxisSpec) => {
    const lo = c ? c[0] : a!.min;
    const hi = c ? c[1] : a!.max;
    return Math.max(lo, Math.min(hi, v));
  };
  const move = (e: ReactPointerEvent<SVGGElement>) => {
    if (!dragging.current) return;
    const svg = (e.currentTarget as SVGGElement).ownerSVGElement as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const nx = axis === 'y' ? x : clampV(sx.invert(e.clientX - rect.left), clampX, xAxis);
    const ny = axis === 'x' ? y : clampV(sy.invert(e.clientY - rect.top), clampY, yAxis);
    onChange(nx, ny);
  };
  const stepOf = (a: AxisSpec, v: number, big: boolean) => {
    const f = big ? 0.05 : 0.01;
    return a.log ? v * (Math.pow(a.max / a.min, f) - 1) : (a.max - a.min) * f;
  };
  const onKey = (e: ReactKeyboardEvent<SVGGElement>) => {
    const big = e.shiftKey;
    let nx = x;
    let ny = y;
    if (axis !== 'y' && e.key === 'ArrowRight') nx = clampV(x + stepOf(xAxis, x, big), clampX, xAxis);
    else if (axis !== 'y' && e.key === 'ArrowLeft') nx = clampV(x - stepOf(xAxis, x, big), clampX, xAxis);
    else if (axis !== 'x' && e.key === 'ArrowUp') ny = clampV(y + stepOf(yAxis, y, big), clampY, yAxis);
    else if (axis !== 'x' && e.key === 'ArrowDown') ny = clampV(y - stepOf(yAxis, y, big), clampY, yAxis);
    else return;
    e.preventDefault();
    onChange(nx, ny);
  };
  return (
    <g
      className="handle"
      tabIndex={0}
      role="slider"
      aria-label={ariaLabel || label || 'draggable point'}
      aria-valuenow={Number((axis === 'y' ? y : x).toPrecision(4))}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
        onDragStart?.();
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        dragging.current = false;
        (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
        onDragEnd?.();
      }}
      onKeyDown={onKey}
      style={{ cursor: axis === 'x' ? 'ew-resize' : axis === 'y' ? 'ns-resize' : 'move', touchAction: 'none' }}
    >
      <circle cx={cx} cy={cy} r={r + 12} fill="transparent" />
      <circle cx={cx} cy={cy} r={r} fill="var(--surface)" stroke={color} strokeWidth={3} />
      {label &&
        (() => {
          const pos = labelPos === 'auto' ? (cx > x0 + iw - 110 ? 'left' : 'right') : labelPos;
          const lx = pos === 'left' ? cx - r - 5 : pos === 'below' ? cx : cx + r + 5;
          const ly = pos === 'below' ? cy + r + 14 : cy - r - 2;
          return (
            <text className="plot-note" x={lx} y={ly} fill={color} textAnchor={pos === 'left' ? 'end' : pos === 'below' ? 'middle' : 'start'}>
              {label}
            </text>
          );
        })()}
    </g>
  );
}

/** Scales of a <Plot>, captured for imperative (per-frame) drawing. */
export type PlotScales = Pick<Ctx, 'sx' | 'sy' | 'clip'> & { yLog?: boolean };

/**
 * A path you update every animation frame without re-rendering React:
 *   const pathRef = useRef<SVGPathElement>(null); const scales = useRef<PlotScales | null>(null);
 *   <Plot ...><LivePath pathRef={pathRef} scalesRef={scales} color="var(--m1)" /></Plot>
 *   useRaf(() => { pathRef.current?.setAttribute('d', livePathD(points, scales.current)); });
 */
export function LivePath({
  pathRef,
  scalesRef,
  color = 'var(--m1)',
  width = 2,
  dash,
}: {
  pathRef: { current: SVGPathElement | null };
  scalesRef: { current: PlotScales | null };
  color?: string;
  width?: number;
  dash?: string;
}) {
  const ctx = usePlot();
  scalesRef.current = { sx: ctx.sx, sy: ctx.sy, clip: ctx.clip, yLog: ctx.yAxis.log };
  return <path ref={pathRef} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" clipPath={`url(#${ctx.clip})`} />;
}

/** Path data for LivePath from [x, y] points in data units. */
export function livePathD(points: ArrayLike<readonly [number, number]> | { x: ArrayLike<number>; y: ArrayLike<number> }, s: PlotScales | null): string {
  return s ? toPath(points, s.sx, s.sy, s.yLog) : '';
}

/** Sample y = f(x) at n+1 points over [a, b] (log-spaced if log). Wrap calls in useMemo. */
export function sample(f: (x: number) => number, a: number, b: number, n = 400, log = false): { x: Float64Array; y: Float64Array } {
  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const xv = log ? a * Math.pow(b / a, t) : a + (b - a) * t;
    xs[i] = xv;
    ys[i] = f(xv);
  }
  return { x: xs, y: ys };
}
