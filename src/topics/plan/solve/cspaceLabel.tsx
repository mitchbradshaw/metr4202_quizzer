// React pieces of the plan-cspace generator: the paper-style figure (workspace | C-space with numbered answer
// boxes), one answer part per box, and the tier-3 "match the workspaces to their C-spaces" figure and parts.
// The figure and the parts share a tiny store per instance: a picked letter appears in its box (green or red),
// hovering a part outlines its box, and once a box is answered, clicking it (or "Pose the arm here") puts the
// arm at that configuration, so the student sees which link hits which obstacle (the notes' FK check).
import { useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type KeyboardEvent } from 'react';
import type { CustomPartProps } from '../../../engine/types';
import { usePersisted } from '../../../ui/persist';
import { Button } from '../../../ui/kit';
import { Rich } from '../../../ui/Rich';
import { makeCollider } from '../../../core/cspacegen';
import { ArmView, CsFrame, FR, ObstacleView, WsFrame, cellsPathD, labelPoint, wsLen, wsX, wsY } from '../explore/cspaceDraw';
import {
  BOX_H,
  BOX_W,
  boxWhy,
  boxWrong,
  cfgPx,
  letterOf,
  m2,
  matchSignature,
  plotStory,
  pt,
  touching,
  workspaceStory,
  type CsProblem,
  type MatchProblem,
} from './cspaceBoxes';

const OBS_COLOURS = ['--m1', '--m2', '--m3', '--m4'];
const colourOf = (o: number) => `var(${OBS_COLOURS[o % 4]})`;

// ------------------------------------------------------------------ shared store (figure <-> parts)

export interface LabelState {
  /** Picked obstacle (or plot) per box (or workspace); null = not answered yet. */
  picks: (number | null)[];
  /** Box whose configuration the arm is posed at. */
  shown: number | null;
  /** Box outlined because its part is hovered or focused. */
  hover: number | null;
}

export interface LabelStore {
  get(): LabelState;
  subscribe(f: () => void): () => void;
  setPick(i: number, v: number | null): void;
  setShown(i: number | null): void;
  setHover(i: number | null): void;
  /** A part registers how to bring itself into view (clicking an unanswered box). */
  onFocus(i: number, f: () => void): () => void;
  focusPart(i: number): void;
}

export function makeLabelStore(n: number): LabelStore {
  let s: LabelState = { picks: new Array<number | null>(n).fill(null), shown: null, hover: null };
  const subs = new Set<() => void>();
  const focus = new Map<number, () => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    get: () => s,
    subscribe(f) {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    setPick(i, v) {
      if (s.picks[i] === v) return;
      const picks = s.picks.slice();
      picks[i] = v;
      s = { ...s, picks, shown: v === null && s.shown === i ? null : s.shown };
      emit();
    },
    setShown(i) {
      if (s.shown === i) return;
      s = { ...s, shown: i };
      emit();
    },
    setHover(i) {
      if (s.hover === i) return;
      s = { ...s, hover: i };
      emit();
    },
    onFocus(i, f) {
      focus.set(i, f);
      return () => {
        if (focus.get(i) === f) focus.delete(i);
      };
    },
    focusPart(i) {
      focus.get(i)?.();
    },
  };
}

const useStore = (store: LabelStore) => useSyncExternalStore(store.subscribe, store.get, store.get);

// ------------------------------------------------------------------ figure pieces

/** The workspace as the papers draw it: 1 m grid, dashed L1 circle, grey lettered obstacles, the arm. */
function WorkspaceSvg({
  p,
  t1,
  t2,
  hit1,
  hit2,
  highlight,
  letters = true,
  label,
}: {
  p: { ws: CsProblem['ws'] };
  t1: number;
  t2: number;
  hit1?: boolean;
  hit2?: boolean;
  highlight?: number | null;
  letters?: boolean;
  label: string;
}) {
  const ws = p.ws;
  return (
    <svg viewBox={`0 0 ${FR.W} ${FR.H}`} className="plan-cspace-svg plan-cspace-paper" role="img" aria-label={label}>
      <WsFrame />
      <circle cx={wsX(ws.base.x)} cy={wsY(ws.base.y)} r={wsLen(ws.l1)} className="plan-cspace-circle" />
      {ws.obstacles.map((ob, o) => (
        <ObstacleView
          key={o}
          s={ob.shape}
          label={letters ? ob.label : undefined}
          fill={highlight === o ? colourOf(o) : 'var(--plan-cs-grey)'}
          labelPos={labelPoint(ob.shape)}
        />
      ))}
      <ArmView pose={{ base: ws.base, l1: ws.l1, l2: ws.l2, t1, t2 }} c1={hit1 ? 'var(--bad)' : 'var(--text)'} c2={hit2 ? 'var(--bad)' : 'var(--text)'} />
    </svg>
  );
}

// ------------------------------------------------------------------ tiers 1-2: label the boxes

/** Workspace and C-space side by side, with the numbered answer boxes. */
export function makeLabelFigure(p: CsProblem, store: LabelStore): ComponentType {
  const regionD = cellsPathD(p.g, (k) => p.g.hit[k] !== 0);
  const cols = p.ws.obstacles.map((o) => makeCollider(o.shape));
  const compPaths = new Map<number, string>();
  const compD = (bi: number) => {
    let d = compPaths.get(bi);
    if (d === undefined) {
      const b = p.boxes[bi];
      const tl = p.ra.torus[b.answer];
      d = cellsPathD(p.g, (k) => tl[k] === b.comp);
      compPaths.set(bi, d);
    }
    return d;
  };
  const ws = p.ws;
  function CspaceLabelFigure() {
    const st = useStore(store);
    const sb = st.shown !== null ? p.boxes[st.shown] : null;
    const pose: [number, number] = sb ? [sb.t1, sb.t2] : p.pose;
    const hits = useMemo(() => touching(ws, cols, pose[0], pose[1]), [pose[0], pose[1]]);
    const click = (bi: number) => {
      if (st.picks[bi] === null) store.focusPart(bi);
      else store.setShown(st.shown === bi ? null : bi);
    };
    const key = (bi: number) => (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        click(bi);
      }
    };
    let foot = `Dashed circle: the reach of link 1 ($L_1$ = ${m2(ws.l1)} m); link 2 is ${m2(ws.l2)} m. Grey on the right: the arm collides. Once a box is answered, click it to pose the arm there.`;
    if (sb) {
      const X = letterOf(ws, sb.answer);
      const who = hits.link1.includes(sb.answer) ? `**Link 1** hits ${X}, so every $\\theta_2$ in this column collides (a band)` : `**Link 2** hits ${X} while link 1 is clear`;
      foot = `Arm posed at box ${sb.num}: $(\\theta_1, \\theta_2) = (${pt(sb.t1)}, ${pt(sb.t2)})$. ${who}. The whole region of ${X} is coloured on the right. Click the box again to go back.`;
    }
    return (
      <div className="plan-cspace plan-cspace-solvefig">
        <div className="plan-cspace-fig">
          <figure>
            <div className="plan-cspace-figcap">Workspace</div>
            <WorkspaceSvg
              p={p}
              t1={pose[0]}
              t2={pose[1]}
              hit1={hits.link1.length > 0}
              hit2={hits.link2.length > 0}
              highlight={sb ? sb.answer : null}
              label={`Workspace: base at (${ws.base.x}, ${ws.base.y}), link lengths ${m2(ws.l1)} m and ${m2(ws.l2)} m, obstacles ${ws.obstacles.map((o) => o.label).join(', ')}`}
            />
          </figure>
          <figure>
            <div className="plan-cspace-figcap">Configuration space</div>
            <svg viewBox={`0 0 ${FR.W} ${FR.H}`} className="plan-cspace-svg" role="group" aria-label={`Configuration space with ${p.boxes.length} numbered boxes`}>
              <CsFrame />
              <path d={regionD} className="plan-cspace-region" />
              {sb && <path d={compD(st.shown!)} fill={colourOf(sb.answer)} style={{ fill: colourOf(sb.answer) }} opacity={0.92} />}
              {p.boxes.map((b, bi) => {
                const pick = st.picks[bi];
                const state = pick === null ? '' : pick === b.answer ? ' is-ok' : ' is-bad';
                return (
                  <g
                    key={bi}
                    className={`plan-cspace-ansbox${state}${st.hover === bi ? ' is-focus' : ''}${st.shown === bi ? ' is-shown' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={pick === null ? `Box ${b.num}: not answered yet (go to its question)` : `Box ${b.num}: ${letterOf(ws, pick)}${pick === b.answer ? ', correct' : ', wrong'}. ${st.shown === bi ? 'Back to the drawn pose' : 'Pose the arm here'}`}
                    onClick={() => click(bi)}
                    onKeyDown={key(bi)}
                  >
                    <line x1={b.P.x} y1={b.P.y} x2={b.Q.x} y2={b.Q.y} className="plan-cspace-leader" />
                    <circle cx={b.P.x} cy={b.P.y} r={2.3} className="plan-cspace-tipdot" />
                    <rect x={b.cx - BOX_W / 2} y={b.cy - BOX_H / 2} width={BOX_W} height={BOX_H} rx={2} />
                    <text className="num" x={b.cx - BOX_W / 2 + 2.5} y={b.cy - BOX_H / 2 + 8.5}>
                      {b.num}
                    </text>
                    {pick !== null && (
                      <text className="ans" x={b.cx + 3} y={b.cy + 6.5} textAnchor="middle">
                        {letterOf(ws, pick)}
                      </text>
                    )}
                  </g>
                );
              })}
              {sb && (() => {
                const c = cfgPx(sb.t1, sb.t2);
                return <circle cx={c.x} cy={c.y} r={4.2} className="plan-cspace-posedot" />;
              })()}
            </svg>
          </figure>
        </div>
        <div className="plan-cspace-figfoot small" aria-live="polite">
          <Rich text={foot} />
        </div>
      </div>
    );
  }
  return Object.assign(CspaceLabelFigure, { cspace: p });
}

/** Answer part for one box: pick the obstacle (checked on the click), then see why and pose the arm there. */
export function makeBoxPart(p: CsProblem, store: LabelStore, bi: number): ComponentType<CustomPartProps> {
  const b = p.boxes[bi];
  function CspaceBoxPart({ onResult, pkey, disabled }: CustomPartProps) {
    const [pick, setPick] = usePersisted<number | null>(`${pkey}:x`, null);
    const groupRef = useRef<HTMLDivElement>(null);
    const shown = useSyncExternalStore(
      store.subscribe,
      () => store.get().shown === bi,
      () => false
    );
    useEffect(() => {
      store.setPick(bi, pick);
    }, [pick]);
    useEffect(
      () =>
        store.onFocus(bi, () => {
          const el = groupRef.current;
          if (!el) return;
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          (el.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus({ preventScroll: true });
        }),
      []
    );
    const choose = (o: number) => {
      if (pick !== null || disabled) return;
      setPick(o);
      const ok = o === b.answer;
      onResult({ correct: ok, trapId: ok ? undefined : boxWrong(p, b, o).trapId });
    };
    const ok = pick === b.answer;
    return (
      <div
        className="plan-cspace-boxpart"
        onMouseEnter={() => store.setHover(bi)}
        onMouseLeave={() => store.setHover(null)}
        onFocus={() => store.setHover(bi)}
        onBlur={() => store.setHover(null)}
      >
        <div ref={groupRef} className="seg plan-cspace-letters" role="group" aria-label={`Box ${b.num}: which obstacle?`}>
          {p.ws.obstacles.map((ob, o) => {
            const st = pick === null ? '' : o === b.answer ? ' is-key' : o === pick ? ' is-wrong' : '';
            return (
              <button key={o} type="button" className={`seg-btn plan-cspace-letter${st}`} aria-pressed={pick === o} disabled={disabled || pick !== null} onClick={() => choose(o)}>
                {ob.label}
                {pick !== null && o === b.answer ? ' ✓' : pick === o ? ' ✗' : ''}
              </button>
            );
          })}
        </div>
        {pick !== null && (
          <div className={`plan-cspace-verdict ${ok ? 'is-ok' : 'is-bad'}`}>
            <Rich text={ok ? `**✓ ${letterOf(p.ws, b.answer)}.** ${boxWhy(p, b)}` : `**✗ ${letterOf(p.ws, pick)}: it is ${letterOf(p.ws, b.answer)}.** ${boxWrong(p, b, pick).text}`} />
            <Button size="sm" onClick={() => store.setShown(shown ? null : bi)} aria-pressed={shown}>
              {shown ? 'Back to the drawn pose' : `Pose the arm at box ${b.num}`}
            </Button>
          </div>
        )}
      </div>
    );
  }
  return Object.assign(CspaceBoxPart, { cspace: { problem: p, box: b } });
}

/** Reference data attached to a box part or the figure (for the self-tests). */
export function boxPartData(render: unknown): { problem: CsProblem; box: CsProblem['boxes'][number] } | null {
  const r = render as { cspace?: { problem: CsProblem; box: CsProblem['boxes'][number] } };
  return r && r.cspace && r.cspace.box ? r.cspace : null;
}

// ------------------------------------------------------------------ tier 3: match workspaces to C-spaces

const WS_NAMES = ['A', 'B', 'C'];

export function makeMatchFigure(mp: MatchProblem, store: LabelStore): ComponentType {
  const plotD = [0, 1, 2].map((k) => {
    const w = mp.plotOf.indexOf(k);
    const g = mp.grids[w];
    return cellsPathD(g, (c) => g.hit[c] !== 0);
  });
  function CspaceMatchFigure() {
    const st = useStore(store);
    return (
      <div className="plan-cspace plan-cspace-solvefig">
        <div className="plan-cspace-fig3">
          {plotD.map((d, k) => (
            <figure key={k}>
              <div className="plan-cspace-figcap">C-space {k + 1}</div>
              <svg viewBox={`0 0 ${FR.W} ${FR.H}`} className="plan-cspace-svg" role="img" aria-label={`Configuration space plot ${k + 1}`}>
                <CsFrame />
                <path d={d} className="plan-cspace-region" />
              </svg>
            </figure>
          ))}
          {mp.wss.map((ws, w) => {
            const pick = st.picks[w];
            const ok = pick === mp.plotOf[w];
            return (
              <figure key={`w${w}`} className={st.hover === w ? 'is-focus' : undefined}>
                <div className="plan-cspace-figcap">
                  Workspace {WS_NAMES[w]}
                  {pick !== null && (
                    <span className={`plan-cspace-matchtag ${ok ? 'ok-text' : 'bad-text'}`}>
                      {' '}
                      → plot {pick + 1} {ok ? '✓' : `✗ (it is ${mp.plotOf[w] + 1})`}
                    </span>
                  )}
                </div>
                <WorkspaceSvg p={{ ws }} t1={mp.pose[0]} t2={mp.pose[1]} letters={false} label={`Workspace ${WS_NAMES[w]}: ${mp.names[w].join(', ')}`} />
              </figure>
            );
          })}
        </div>
        <div className="plan-cspace-figfoot small">
          <Rich text={`Same arm in every workspace: base at (5, 5), $L_1$ = ${m2(mp.wss[0].l1)} m (dashed circle), $L_2$ = ${m2(mp.wss[0].l2)} m. Grey in the plots: the arm collides.`} />
        </div>
      </div>
    );
  }
  return Object.assign(CspaceMatchFigure, { cspaceMatch: mp });
}

/** Why workspace w goes with its plot (Rich). */
export function matchWhy(mp: MatchProblem, w: number): string {
  const sig = matchSignature(mp, w);
  return `In workspace ${WS_NAMES[w]}, ${workspaceStory(mp, w)}. That is ${sig.bands} full-height band${sig.bands === 1 ? '' : 's'} and ${sig.blobs} blob${sig.blobs === 1 ? '' : 's'}: ${plotStory(mp, mp.plotOf[w])}`;
}

/** Wrong plot picked: what that plot shows, and the trap when it has the same number of regions but bands and blobs swapped. */
export function matchWrong(mp: MatchProblem, w: number, pick: number): { text: string; trapId?: string } {
  const sig = matchSignature(mp, w);
  const other = matchSignature(mp, mp.plotOf.indexOf(pick));
  const confused = sig.bands + sig.blobs === other.bands + other.blobs && sig.bands !== other.bands;
  return { text: `Not plot ${pick + 1}: ${plotStory(mp, pick)} ${matchWhy(mp, w)}`, trapId: confused ? 'cspace-band-blob' : undefined };
}

export function makeMatchPart(mp: MatchProblem, store: LabelStore, w: number): ComponentType<CustomPartProps> {
  const answer = mp.plotOf[w];
  function CspaceMatchPart({ onResult, pkey, disabled }: CustomPartProps) {
    const [pick, setPick] = usePersisted<number | null>(`${pkey}:x`, null);
    useEffect(() => {
      store.setPick(w, pick);
    }, [pick]);
    const choose = (k: number) => {
      if (pick !== null || disabled) return;
      setPick(k);
      const ok = k === answer;
      onResult({ correct: ok, trapId: ok ? undefined : matchWrong(mp, w, k).trapId });
    };
    return (
      <div className="plan-cspace-boxpart" onMouseEnter={() => store.setHover(w)} onMouseLeave={() => store.setHover(null)}>
        <div className="seg plan-cspace-letters" role="group" aria-label={`Workspace ${WS_NAMES[w]}: which C-space plot?`}>
          {[0, 1, 2].map((k) => {
            const st = pick === null ? '' : k === answer ? ' is-key' : k === pick ? ' is-wrong' : '';
            return (
              <button key={k} type="button" className={`seg-btn plan-cspace-letter${st}`} aria-pressed={pick === k} disabled={disabled || pick !== null} onClick={() => choose(k)}>
                {k + 1}
                {pick !== null && k === answer ? ' ✓' : pick === k ? ' ✗' : ''}
              </button>
            );
          })}
        </div>
        {pick !== null && (
          <div className={`plan-cspace-verdict ${pick === answer ? 'is-ok' : 'is-bad'}`}>
            <Rich text={pick === answer ? `**✓ Plot ${answer + 1}.** ${matchWhy(mp, w)}` : `**✗ It is plot ${answer + 1}.** ${matchWrong(mp, w, pick).text}`} />
          </div>
        )}
      </div>
    );
  }
  return Object.assign(CspaceMatchPart, { cspaceMatch: { problem: mp, w } });
}

export function matchPartData(render: unknown): { problem: MatchProblem; w: number } | null {
  const r = render as { cspaceMatch?: { problem: MatchProblem; w: number } };
  return r && r.cspaceMatch && typeof r.cspaceMatch.w === 'number' ? r.cspaceMatch : null;
}
