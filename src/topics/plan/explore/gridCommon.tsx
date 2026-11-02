// Shared React pieces of the grid search lab and the heuristic lab: the editable grid (SVG with a viewBox,
// pointer + touch painting, draggable S and G with keyboard support), the map toolbar, the legend and small
// drawing helpers. Pure algorithms live in gridEngine.ts.
import { memo, useId, useMemo, useRef, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { svgPoint } from '../../../ui/diagrams';
import { Button, Segmented, Select } from '../../../ui/kit';
import {
  FREE,
  MUD,
  PRESETS,
  WALL,
  cellLabel,
  cellsBetween,
  colLetter,
  colOf,
  rowOf,
  type Grid,
  type PresetId,
} from './gridEngine';
import '../grid.css';

// ------------------------------------------------------------------ geometry (viewBox units)

export const CELL = 32;
export const PAD_L = 24;
export const PAD_T = 18;

export const viewW = (g: Grid) => PAD_L + g.cols * CELL + 3;
export const viewH = (g: Grid) => PAD_T + g.rows * CELL + 3;
export const cellX = (g: Grid, k: number) => PAD_L + colOf(g, k) * CELL;
export const cellY = (g: Grid, k: number) => PAD_T + rowOf(g, k) * CELL;
export const centreX = (g: Grid, k: number) => cellX(g, k) + CELL / 2;
export const centreY = (g: Grid, k: number) => cellY(g, k) + CELL / 2;

/** One SVG path with a square per cell (much cheaper than a <rect> per cell). */
export function cellsPath(g: Grid, ks: Iterable<number>, inset = 0): string {
  let d = '';
  const s = CELL - 2 * inset;
  for (const k of ks) d += `M${cellX(g, k) + inset} ${cellY(g, k) + inset}h${s}v${s}h${-s}z`;
  return d;
}

/** Polyline through cell centres. */
export function centresPath(g: Grid, ks: readonly number[]): string {
  return ks.map((k, i) => `${i ? 'L' : 'M'}${centreX(g, k)} ${centreY(g, k)}`).join('');
}

/**
 * Short arrows from each cell towards its parent (the search tree): shafts and heads as two paths.
 * `parent[k]` is -1 for none.
 */
export function parentArrows(g: Grid, cells: Iterable<number>, parent: (k: number) => number): { shafts: string; heads: string } {
  let shafts = '';
  let heads = '';
  for (const k of cells) {
    const p = parent(k);
    if (p < 0) continue;
    const x0 = centreX(g, k);
    const y0 = centreY(g, k);
    const dx = centreX(g, p) - x0;
    const dy = centreY(g, p) - y0;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const tip = 0.62 * CELL * (L > CELL * 1.2 ? 1.2 : 1);
    const tx = x0 + ux * tip;
    const ty = y0 + uy * tip;
    shafts += `M${(x0 + ux * 3).toFixed(1)} ${(y0 + uy * 3).toFixed(1)}L${(tx - ux * 4).toFixed(1)} ${(ty - uy * 4).toFixed(1)}`;
    const bx = tx - ux * 7;
    const by = ty - uy * 7;
    heads += `M${tx.toFixed(1)} ${ty.toFixed(1)}L${(bx - uy * 3.5).toFixed(1)} ${(by + ux * 3.5).toFixed(1)}L${(bx + uy * 3.5).toFixed(1)} ${(by - ux * 3.5).toFixed(1)}z`;
  }
  return { shafts, heads };
}

/** Arrow from the centre of cell a to the edge of cell b (this step's neighbour updates). */
export function stepArrow(g: Grid, a: number, b: number): { shaft: string; head: string } {
  const x0 = centreX(g, a);
  const y0 = centreY(g, a);
  const x1 = centreX(g, b);
  const y1 = centreY(g, b);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const tx = x1 - ux * 6;
  const ty = y1 - uy * 6;
  const bx = tx - ux * 7;
  const by = ty - uy * 7;
  return {
    shaft: `M${(x0 + ux * 7).toFixed(1)} ${(y0 + uy * 7).toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`,
    head: `M${tx.toFixed(1)} ${ty.toFixed(1)}L${(bx - uy * 4).toFixed(1)} ${(by + ux * 4).toFixed(1)}L${(bx + uy * 4).toFixed(1)} ${(by - ux * 4).toFixed(1)}z`,
  };
}

// ------------------------------------------------------------------ tools

export type Tool = 'wall' | 'mud' | 'erase' | 'inspect';

export const TOOL_OPTIONS: { value: Tool; label: string; title: string }[] = [
  { value: 'wall', label: '▦ Wall', title: 'Paint walls (start on a wall to erase walls instead)' },
  { value: 'mud', label: '≋ Mud ×5', title: 'Paint mud: entering a mud cell costs 5 × the step' },
  { value: 'erase', label: '⌫ Erase', title: 'Erase walls and mud' },
  { value: 'inspect', label: '🔍 Inspect', title: 'Click a cell to read its numbers' },
];

// ------------------------------------------------------------------ the grid view

export interface GridViewProps {
  grid: Grid;
  /** Called with a new Grid while painting or dragging S / G. `how` says which. */
  onChange: (g: Grid, how: 'paint' | 'move') => void;
  tool: Tool;
  onInspect?: (k: number) => void;
  /** Highlight this cell with a dashed frame. */
  inspect?: number | null;
  /** Drawn on top of the terrain (mud), under the walls. */
  under?: ReactNode;
  /** Drawn above the walls, under S and G. */
  over?: ReactNode;
  ariaLabel: string;
  /** Extra class on the <svg>. */
  className?: string;
}

interface Drag {
  mode: 'paint' | 'S' | 'G' | 'inspect';
  value: number;
  last: number;
  grid: Grid;
  pointerId: number;
  /** S or G actually moved (a tap on S/G with the inspect tool inspects it instead). */
  moved?: boolean;
}

function GridViewImpl({ grid, onChange, tool, onInspect, inspect, under, over, ariaLabel, className }: GridViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const uid = useId().replace(/:/g, '');
  const W = viewW(grid);
  const H = viewH(grid);

  // Static layers: grid lines and axis labels depend only on the size.
  const lines = useMemo(() => {
    let d = '';
    for (let c = 0; c <= grid.cols; c++) d += `M${PAD_L + c * CELL} ${PAD_T}v${grid.rows * CELL}`;
    for (let r = 0; r <= grid.rows; r++) d += `M${PAD_L} ${PAD_T + r * CELL}h${grid.cols * CELL}`;
    return d;
  }, [grid.cols, grid.rows]);
  const axis = useMemo(
    () => (
      <g aria-hidden="true">
        {Array.from({ length: grid.cols }, (_, c) => (
          <text key={`c${c}`} className="plan-grid-axis" x={PAD_L + c * CELL + CELL / 2} y={PAD_T - 5} textAnchor="middle">
            {colLetter(c)}
          </text>
        ))}
        {Array.from({ length: grid.rows }, (_, r) => (
          <text key={`r${r}`} className="plan-grid-axis" x={PAD_L - 5} y={PAD_T + r * CELL + CELL / 2 + 3.5} textAnchor="end">
            {r + 1}
          </text>
        ))}
      </g>
    ),
    [grid.cols, grid.rows]
  );
  const terrain = useMemo(() => {
    const walls: number[] = [];
    const mud: number[] = [];
    grid.cells.forEach((v, k) => (v === WALL ? walls.push(k) : v === MUD ? mud.push(k) : 0));
    return { walls: cellsPath(grid, walls), mud: cellsPath(grid, mud) };
  }, [grid]);

  const cellAt = (clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return -1;
    const p = svgPoint(svg, clientX, clientY);
    const c = Math.floor((p.x - PAD_L) / CELL);
    const r = Math.floor((p.y - PAD_T) / CELL);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
    return r * grid.cols + c;
  };

  const paintTo = (d: Drag, k: number) => {
    const cells = d.grid.cells.slice();
    let changed = false;
    for (const q of cellsBetween(d.grid, d.last, k)) {
      if (q === d.grid.start || q === d.grid.goal) continue;
      if (cells[q] !== d.value) {
        cells[q] = d.value;
        changed = true;
      }
    }
    d.last = k;
    if (changed) {
      d.grid = { ...d.grid, cells };
      onChange(d.grid, 'paint');
    }
  };

  const moveEnd = (d: Drag, k: number) => {
    const g = d.grid;
    if (k === g.start || k === g.goal || g.cells[k] === WALL) return;
    d.grid = d.mode === 'S' ? { ...g, start: k } : { ...g, goal: k };
    d.moved = true;
    onChange(d.grid, 'move');
  };

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const k = cellAt(e.clientX, e.clientY);
    if (k < 0) return;
    let mode: Drag['mode'];
    let value = FREE;
    if (k === grid.start) mode = 'S';
    else if (k === grid.goal) mode = 'G';
    else if (tool === 'inspect') mode = 'inspect';
    else {
      mode = 'paint';
      const cur = grid.cells[k];
      value = tool === 'erase' ? FREE : tool === 'wall' ? (cur === WALL ? FREE : WALL) : cur === MUD ? FREE : MUD;
    }
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const d: Drag = { mode, value, last: k, grid, pointerId: e.pointerId };
    drag.current = d;
    if (mode === 'paint') paintTo(d, k);
    else if (mode === 'inspect') onInspect?.(k);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const k = cellAt(e.clientX, e.clientY);
    if (k < 0 || k === d.last) return;
    if (d.mode === 'paint') paintTo(d, k);
    else if (d.mode === 'inspect') {
      d.last = k;
      onInspect?.(k);
    } else {
      d.last = k;
      moveEnd(d, k);
    }
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if ((d.mode === 'S' || d.mode === 'G') && !d.moved && tool === 'inspect' && e.type === 'pointerup') onInspect?.(d.mode === 'S' ? d.grid.start : d.grid.goal);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const keyMove = (which: 'S' | 'G') => (e: RKeyboardEvent<SVGGElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const dv = dirs[e.key];
    if (!dv) return;
    e.preventDefault();
    const k = which === 'S' ? grid.start : grid.goal;
    const c = colOf(grid, k) + dv[0];
    const r = rowOf(grid, k) + dv[1];
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return;
    moveEnd({ mode: which, value: 0, last: k, grid, pointerId: -1 }, r * grid.cols + c);
  };

  const handle = (which: 'S' | 'G') => {
    const k = which === 'S' ? grid.start : grid.goal;
    const x = centreX(grid, k);
    const y = centreY(grid, k);
    return (
      <g
        className="plan-grid-handle"
        tabIndex={0}
        role="button"
        aria-label={`${which === 'S' ? 'Start' : 'Goal'} ${which} at ${cellLabel(grid, k)}. Drag it, or focus and use the arrow keys.`}
        onKeyDown={keyMove(which)}
      >
        {which === 'S' ? (
          <>
            <circle className="plan-grid-handle-ring" cx={x} cy={y} r={12.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            <text className="plan-grid-handle-text" x={x} y={y + 5.2} textAnchor="middle" fill="var(--surface)">
              S
            </text>
          </>
        ) : (
          <>
            <circle className="plan-grid-handle-ring" cx={x} cy={y} r={12.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={3} />
            <circle cx={x} cy={y} r={8.2} fill="none" stroke="var(--accent)" strokeWidth={1.2} />
            <text className="plan-grid-handle-text" x={x} y={y + 5.2} textAnchor="middle" fill="var(--accent)">
              G
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={`plan-grid-svg ${tool === 'inspect' ? 'tool-inspect' : 'tool-paint'} ${className ?? ''}`}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <defs>
        <pattern id={`${uid}-mud`} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect width={8} height={8} fill="var(--warn)" fillOpacity={0.2} />
          <circle cx={2} cy={2} r={1.15} fill="var(--warn)" fillOpacity={0.75} />
          <circle cx={6} cy={6} r={1.15} fill="var(--warn)" fillOpacity={0.75} />
        </pattern>
      </defs>
      <rect x={PAD_L} y={PAD_T} width={grid.cols * CELL} height={grid.rows * CELL} fill="var(--surface)" />
      <path d={terrain.mud} fill={`url(#${uid}-mud)`} />
      {under}
      <path d={lines} fill="none" stroke="var(--border)" strokeWidth={1} />
      <path d={terrain.walls} fill="var(--text-2)" />
      {axis}
      {over}
      {inspect != null && inspect >= 0 && (
        <rect
          x={cellX(grid, inspect) + 1.5}
          y={cellY(grid, inspect) + 1.5}
          width={CELL - 3}
          height={CELL - 3}
          fill="none"
          stroke="var(--text)"
          strokeWidth={2.5}
          strokeDasharray="5 3"
          pointerEvents="none"
        />
      )}
      {handle('S')}
      {handle('G')}
    </svg>
  );
}

export const GridView = memo(GridViewImpl);

// ------------------------------------------------------------------ map toolbar

export function MapBar({
  tool,
  setTool,
  preset,
  onPreset,
  onClear,
  presets = PRESETS.map((p) => p.id),
  tools = TOOL_OPTIONS.map((t) => t.value),
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  preset: PresetId | 'custom';
  onPreset: (id: PresetId) => void;
  onClear: () => void;
  presets?: PresetId[];
  tools?: Tool[];
}) {
  const opts = PRESETS.filter((p) => presets.includes(p.id)).map((p) => ({ value: p.id as string, label: p.label }));
  return (
    <div className="plan-grid-bar" role="toolbar" aria-label="Map tools">
      <Segmented size="sm" label="Drawing tool" value={tool} onChange={setTool} options={TOOL_OPTIONS.filter((t) => tools.includes(t.value)).map((t) => ({ value: t.value, label: t.label, title: t.title }))} />
      <Select
        label="Load a preset map"
        value={preset === 'custom' ? '__custom' : preset}
        onChange={(v) => v !== '__custom' && onPreset(v as PresetId)}
        options={[...(preset === 'custom' ? [{ value: '__custom', label: 'Your map (edited)' }] : []), ...opts]}
      />
      <Button size="sm" onClick={onClear} title="Remove every wall and mud cell">
        Clear
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ legend

export type SwatchKind = 'closed' | 'open' | 'current' | 'path' | 'wall' | 'mud' | 'added' | 'improved' | 'tentative' | 'optimal' | 'over' | 'expanded';

export function Swatch({ kind }: { kind: SwatchKind }) {
  const box = (fill: string, opacity: number, stroke?: string, sw = 2) => (
    <rect x={2} y={2} width={14} height={14} rx={2} fill={fill} fillOpacity={opacity} stroke={stroke ?? 'none'} strokeWidth={sw} />
  );
  return (
    <svg width={18} height={18} aria-hidden="true">
      {kind === 'closed' && box('var(--m1)', 0.3)}
      {kind === 'open' && box('var(--accent)', 0.15, 'var(--accent)')}
      {kind === 'current' && box('var(--m2)', 0.35, 'var(--m2)', 2.5)}
      {kind === 'wall' && box('var(--text-2)', 1)}
      {kind === 'mud' && (
        <>
          {box('var(--warn)', 0.22)}
          <circle cx={6} cy={6} r={1.3} fill="var(--warn)" />
          <circle cx={12} cy={12} r={1.3} fill="var(--warn)" />
        </>
      )}
      {kind === 'path' && <line x1={1} y1={9} x2={17} y2={9} stroke="var(--m3)" strokeWidth={4} strokeLinecap="round" />}
      {kind === 'optimal' && <line x1={1} y1={9} x2={17} y2={9} stroke="var(--text-2)" strokeWidth={2} strokeDasharray="4 3" />}
      {kind === 'tentative' && <line x1={1} y1={9} x2={17} y2={9} stroke="var(--m2)" strokeWidth={2} strokeDasharray="4 3" />}
      {kind === 'added' && (
        <>
          <line x1={2} y1={9} x2={11} y2={9} stroke="var(--m2)" strokeWidth={2} />
          <path d="M16 9L10 5.5L10 12.5z" fill="var(--m2)" />
        </>
      )}
      {kind === 'improved' && (
        <>
          <line x1={2} y1={9} x2={11} y2={9} stroke="var(--m4)" strokeWidth={2.4} />
          <path d="M16 9L10 5.5L10 12.5z" fill="var(--m4)" />
        </>
      )}
      {kind === 'over' && (
        <>
          {box('var(--bad)', 0.3)}
          <path d="M9 4L14 13H4z" fill="var(--bad)" />
        </>
      )}
      {kind === 'expanded' && (
        <>
          {box('var(--surface)', 1, 'var(--border)', 1)}
          <circle cx={9} cy={9} r={3.2} fill="var(--m1)" />
        </>
      )}
    </svg>
  );
}

export function GridLegend({ items }: { items: { kind: SwatchKind; label: ReactNode }[] }) {
  return (
    <div className="plan-grid-legend">
      {items.map((it) => (
        <span key={it.kind} className="plan-grid-legend-item">
          <Swatch kind={it.kind} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ small text helpers

/** A cell label as a monospace chip. */
export function CellChip({ grid, k }: { grid: Grid; k: number }) {
  return <span className="plan-grid-chip">{k >= 0 ? cellLabel(grid, k) : '–'}</span>;
}

/** Scroll the grid into view when the layout is stacked (tablet portrait), so "Show me" is visible. */
export function revealGrid(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  // Scroll as little as possible so the map column sits below the app's sticky top bar and topic tabs
  // (98 px) and the map itself is on screen. Works whether or not the column is currently stuck.
  const HEADER = 106;
  const col = el.getBoundingClientRect();
  const map = (el.querySelector('.plan-grid-svg') ?? el).getBoundingClientRect();
  let dy = 0;
  if (col.top < HEADER - 4) dy = col.top - HEADER;
  else if (map.bottom > window.innerHeight) dy = Math.min(map.bottom - window.innerHeight + 12, col.top - HEADER);
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}
