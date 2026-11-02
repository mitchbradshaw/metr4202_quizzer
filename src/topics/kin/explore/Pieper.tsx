// Closed-form IK or not? Pieper's criterion on a deck of nine 6-DOF joint layouts (summary notes §6 "Closed-form IK";
// 2023 Q12 and its worked solution; review deck slide 19 "conditions that permit a closed-form IK solution").
//
// The layouts live in core/kin_pieper.ts; tests/ik.ts proves every hand-written label against an automatic check of
// the consecutive axes (meet at one point / parallel) and the generic Jacobian rank. Decide for each arm, then the
// reveal colours the qualifying triple (or shows by how much a near miss misses) with a triple-by-triple table.
// The view turns about the vertical (drag it), and the joint groups can be set moving: with a spherical wrist,
// joints 4–6 cannot move the wrist centre W, which is exactly why position and orientation decouple.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { add3, cross3, dot3, norm3, scale3, sub3, type Vec3 } from '../../../core/kin';
import { layoutById, pieperCheck, sameLine, tripleName, type PLayout, type TripleCheck } from '../../../core/kin_pieper';
import { Button, Callout, LinkButton, More, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { useRaf } from '../../../anim/hooks';
import { usePersisted } from '../../../ui/persist';
import { completeChallenge } from '../../../app/store';
import { href } from '../../../app/router';
import { fmt } from '../../../engine/format';
import { PieperSvg, fitView, focusPoint, highlightFor, layoutWords, poseLayout, sceneMarkup, type Posed, type View } from './kinikPieperDraw';
import '../kinik.css';

const CHALLENGE = 'kin-ik-pieper-deck';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'pieper',
  title: 'Closed-form IK or not? (Pieper)',
  summary:
    'Nine six-axis arms drawn like the 2023 Q12 sketches. Decide whether each has a closed-form IK solution, then see the three consecutive axes that meet at a point or run parallel (or by how much a near miss misses). Turn the view to check that axes really cross, and move the wrist to watch the wrist centre stay put.',
  notice:
    'Closed-form IK needs three **consecutive** revolute axes that meet at one point (a spherical wrist) or are parallel: then the wrist centre depends on joints 1–3 only, so position and orientation decouple.',
  minutes: 8,
  challenge: { id: CHALLENGE, title: 'Classify all nine arms correctly' },
};

// ------------------------------------------------------------------ deck and view

/** Yes and no layouts interleaved, the four 2023 Q12 sketches among them. */
const DECK: PLayout[] = ['puma', 'q12a', 'ur', 'skew', 'stanford', 'q12b', 'shoulder', 'q12d', 'gantry'].map(layoutById);
const VW = 660;
const VH = 400;
const DEG = Math.PI / 180;
/** The frame fits the home pose at every yaw, so turning the view never rescales it. */
const YAWS = Array.from({ length: 25 }, (_, k) => (-180 + 15 * k) * DEG);
const ZERO6 = [0, 0, 0, 0, 0, 0];

type Group = 'arm' | 'wrist' | 'triple';
interface Anim {
  group: Group;
  t: number;
  trace: Vec3[];
  start: Vec3 | null;
  maxMove: number;
}

const typesOf = (L: PLayout) => L.joints.map((j) => j.type).join(' ');

function groupJoints(L: PLayout, g: Group): number[] {
  if (g === 'arm') return [0, 1, 2];
  if (g === 'wrist') return [3, 4, 5];
  return L.triple ? [...L.triple] : [];
}

/** Show a third "move" button when the layout's triple is not simply joints 1–3 or 4–6. */
const hasOwnTriple = (L: PLayout) => !!L.triple && L.triple.join() !== '0,1,2' && L.triple.join() !== '3,4,5';
const tripleText = (L: PLayout) => (L.triple ? L.triple.map((i) => i + 1).join(', ') : '');

/** Joint values while a group is moving: smooth, out of phase, never all at once at the start. */
const FREQ = [1.7, 1.3, 2.1, 1.9, 1.45, 2.4];
function wiggle(L: PLayout, g: Group, t: number): number[] {
  const js = groupJoints(L, g);
  const ramp = Math.min(1, t / 0.6);
  return L.joints.map((j, i) => {
    if (!js.includes(i)) return 0;
    const amp = j.type === 'P' ? 0.3 : g === 'wrist' ? 0.85 : 0.32;
    return ramp * amp * Math.sin(FREQ[i] * t + 1.3 * i);
  });
}

function readout(L: PLayout, a: Anim, label: string): string {
  const d = fmt(a.maxMove, 2);
  if (a.group === 'wrist') {
    if (L.closedForm && L.reason === 'meet' && L.triple?.[0] === 3)
      return `Joints 4–6 moving, 1–3 locked: W has moved ${d} m. Every wrist axis passes through W, so the wrist only turns the gripper about it.`;
    if (L.closedForm && L.reason === 'meet') return `Joints 4–6 moving: ${label} (where axes ${tripleText(L)} meet) has moved ${d} m. Read the chain from the tool back and that point is a wrist centre.`;
    if (label === 'W′') return `Joints 4–6 moving, 1–3 locked: W′, where axes 5 and 6 (nearly) meet, has moved up to ${d} m. The hand’s position depends on the wrist joints too, so position and orientation stay coupled.`;
    return `Joints 4–6 moving, 1–3 locked: the gripper has moved up to ${d} m.`;
  }
  if (a.group === 'arm') return `Joints 1–3 moving: ${label === 'tool' ? 'the gripper' : label} travels up to ${d} m. Joints 1–3 are what place the wrist.`;
  if (L.reason === 'parallel') return `Joints ${tripleText(L)} moving: every link they move stays in the shaded plane, perpendicular to the three parallel axes. That is a planar 3R arm, solved with the law of cosines.`;
  if (L.reason === 'orientation') return `Joints ${tripleText(L)} (every revolute joint) moving: the gripper only ever turns about y, so most orientations are out of reach.`;
  return `Joints ${tripleText(L)} moving: the point ${label} has moved up to ${d} m.`;
}

/**
 * The plane a parallel triple moves its links in (home pose; joint 1 is locked while the triple moves): through the
 * first parallel axis's joint, spanned by the direction along the arm and the in-plane perpendicular.
 */
function motionPlane(L: PLayout) {
  const [i, , k] = L.triple!;
  const a = L.joints[i].at;
  const b = L.joints[Math.min(5, k + 1)].at;
  const n = L.joints[i].axis;
  const ab = sub3(b, a);
  const along = sub3(ab, scale3(n, dot3(ab, n)));
  const u = scale3(along, 1 / (norm3(along) || 1));
  const v = cross3(n, u);
  return { p: scale3(add3(a, b), 0.5), u, v, hu: norm3(along) / 2 + 0.9, hv: 1.5 };
}

const IDLE = 'Drag the picture (or use ← →) to turn the arm about the vertical. Real intersections stay put as the view turns; skew axes that only look crossed slide apart.';

// ------------------------------------------------------------------ component

export default function Pieper() {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = usePersisted<Record<string, boolean>>('kin-ik-pieper:answers', {});
  const [peek, setPeek] = useState<Record<string, boolean>>({});
  const [yaw, setYaw] = useState(0);
  const [axes, setAxes] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [tween, setTween] = useState(false);

  const L = DECK[idx];
  const check = useMemo(() => pieperCheck(L.joints), [L]);
  const decided = answers[L.id];
  const revealed = decided !== undefined || !!peek[L.id];
  const right = decided === L.closedForm;
  const score = DECK.filter((d) => answers[d.id] === d.closedForm).length;
  const nDecided = DECK.filter((d) => answers[d.id] !== undefined).length;

  useEffect(() => {
    if (score === DECK.length) completeChallenge(CHALLENGE);
  }, [score]);

  // ---------------------------------------------------------------- imperative drawing (60 fps without React diffing)
  const svgRef = useRef<SVGSVGElement>(null);
  const readRef = useRef<HTMLParagraphElement>(null);
  const frame = useMemo(() => fitView(L, VW, VH, 16, YAWS), [L]);
  const live = useRef<{ yaw: number; th: number[]; anim: Anim | null; tw: { from: number; to: number; t: number } | null }>({ yaw: 0, th: ZERO6, anim: null, tw: null });
  const opts = useRef({ L, frame, axes, revealed });
  opts.current = { L, frame, axes, revealed };

  const draw = useCallback((posedIn?: Posed) => {
    const svg = svgRef.current;
    if (!svg) return;
    const { L: lay, frame: fr, axes: ax, revealed: rv } = opts.current;
    const lv = live.current;
    const posed = posedIn ?? poseLayout(lay, lv.th);
    const view: View = { ...fr, yaw: lv.yaw };
    const an = lv.anim;
    const fp = an ? focusPoint(lay, posed) : null;
    const plane = an && an.group === 'triple' && lay.reason === 'parallel' && lay.triple ? motionPlane(lay) : null;
    svg.innerHTML = sceneMarkup(lay, posed, view, { axes: ax, numbers: true, hl: rv ? highlightFor(lay, posed) : null, trace: an?.trace, mark: fp, plane });
  }, []);

  useEffect(() => {
    live.current.yaw = yaw * DEG;
    draw();
  }, [yaw, L, axes, revealed, draw]);

  const setIdle = () => {
    if (readRef.current) readRef.current.textContent = IDLE;
  };

  const startGroup = useCallback(
    (g: Group | null) => {
      live.current.anim = g ? { group: g, t: 0, trace: [], start: null, maxMove: 0 } : null;
      live.current.th = ZERO6;
      setGroup(g);
      draw();
      if (!g) setIdle();
    },
    [draw]
  );

  // joint-group motion
  useRaf(
    (dt) => {
      const lv = live.current;
      const an = lv.anim;
      if (!an) return;
      const lay = opts.current.L;
      an.t += dt;
      lv.th = wiggle(lay, an.group, an.t);
      const posed = poseLayout(lay, lv.th);
      const fp = focusPoint(lay, posed);
      if (!an.start) an.start = fp.p;
      an.maxMove = Math.max(an.maxMove, norm3(sub3(fp.p, an.start)));
      an.trace.push(fp.p);
      if (an.trace.length > 170) an.trace.shift();
      draw(posed);
      if (readRef.current) readRef.current.textContent = readout(lay, an, fp.label);
    },
    group !== null
  );

  // a smooth turn of the view (predict "Show me")
  useRaf(
    (dt) => {
      const lv = live.current;
      const tw = lv.tw;
      if (!tw) return;
      tw.t = Math.min(1, tw.t + dt / 0.9);
      const s = tw.t * tw.t * (3 - 2 * tw.t);
      lv.yaw = (tw.from + (tw.to - tw.from) * s) * DEG;
      if (!lv.anim) draw();
      if (tw.t >= 1) {
        lv.tw = null;
        setTween(false);
        setYaw(tw.to);
      }
    },
    tween
  );
  const turnTo = (deg: number, from = live.current.yaw / DEG) => {
    live.current.tw = { from, to: deg, t: 0 };
    setTween(true);
  };

  const select = useCallback(
    (k: number) => {
      setIdx(k);
      startGroup(null);
      live.current.tw = null;
      setTween(false);
      setYaw(0);
    },
    [startGroup]
  );

  // drag to turn
  const dragRef = useRef<{ x: number; yaw0: number } | null>(null);
  const rafRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, yaw0: live.current.yaw / DEG };
    live.current.tw = null;
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const w = svg.getBoundingClientRect().width || VW;
    const deg = Math.max(-180, Math.min(180, d.yaw0 + ((e.clientX - d.x) / w) * 260));
    live.current.yaw = deg * DEG;
    if (!rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (!live.current.anim) draw();
      });
  };
  const onUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setYaw(Math.round(live.current.yaw / DEG));
  };
  const onKey = (e: RKeyboardEvent) => {
    const s = e.shiftKey ? 15 : 5;
    const d = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
    if (!d) return;
    e.preventDefault();
    setYaw((y) => Math.max(-180, Math.min(180, y + d)));
  };

  const decide = (cf: boolean) => setAnswers((a) => ({ ...a, [L.id]: cf }));
  const forget = () => {
    setAnswers((a) => {
      const b = { ...a };
      delete b[L.id];
      return b;
    });
    setPeek((p) => ({ ...p, [L.id]: false }));
  };

  // predict-then-reveal hooks
  const api = useRef<Record<string, () => void>>({});
  api.current = {
    wrist: () => {
      select(DECK.findIndex((d) => d.id === 'puma'));
      startGroup('wrist');
    },
    offset: () => {
      select(DECK.findIndex((d) => d.id === 'q12a'));
      setPeek((p) => ({ ...p, q12a: true }));
      startGroup('wrist');
    },
    skew: () => {
      select(DECK.findIndex((d) => d.id === 'skew'));
      setPeek((p) => ({ ...p, skew: true }));
      setAxes(true);
      turnTo(62, 0);
    },
    parallel: () => {
      select(DECK.findIndex((d) => d.id === 'ur'));
      setPeek((p) => ({ ...p, ur: true }));
      startGroup('triple');
      // in the exam view the plane of motion is the page itself; turned, it reads as a plane
      turnTo(-35, 0);
    },
    orient: () => {
      select(DECK.findIndex((d) => d.id === 'q12d'));
      setPeek((p) => ({ ...p, q12d: true }));
      startGroup('triple');
    },
  };

  return (
    <div className="kin-ik">
      <div className="kin-ik-deck" role="group" aria-label="The nine arms">
        {DECK.map((d, k) => (
          <DeckThumb key={d.id} L={d} k={k} on={k === idx} ans={answers[d.id]} peeked={!!peek[d.id]} onPick={select} />
        ))}
      </div>

      <div className="kin-ik-pieper-main">
        <section className="kin-ik-panel" aria-label="The arm">
          <div className="kin-ik-panel-head">
            <h4>
              Arm {idx + 1} of {DECK.length}: {typesOf(L)}
            </h4>
            <span className="muted small">cylinder = revolute (turns about its length) · box + arrow = prismatic (slides)</span>
          </div>
          <div className="kin-ik-view">
            <span className="kin-ik-viewtag">{yaw === 0 && !tween ? 'exam view' : `view turned ${yaw}°`}</span>
            <svg
              ref={svgRef}
              className="kin-ik-scene"
              viewBox={`0 0 ${VW} ${VH}`}
              tabIndex={0}
              role="img"
              aria-label={`Arm ${idx + 1}. Joints from the base: ${layoutWords(L)}. Drag or use the arrow keys to turn the view.`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey}
            />
          </div>
          <p ref={readRef} className="kin-ik-readout" aria-live="polite">
            {IDLE}
          </p>
          <div className="kin-ik-controls">
            <Slider label="turn the view" tip="Turns the arm about the vertical before it is drawn; 0° is the exam’s oblique view." value={yaw} min={-180} max={180} step={1} unit="°" format={(v) => `${Math.round(v)}°`} onChange={(v) => setYaw(Math.round(v))} />
            <Toggle checked={axes} onChange={setAxes} label="Extend the joint axes" />
          </div>
          <div className="kin-ik-controls">
            <span className="muted small">Move:</span>
            <Button size="sm" variant={group === 'arm' ? 'primary' : 'default'} onClick={() => startGroup(group === 'arm' ? null : 'arm')} aria-pressed={group === 'arm'}>
              joints 1–3
            </Button>
            <Button size="sm" variant={group === 'wrist' ? 'primary' : 'default'} onClick={() => startGroup(group === 'wrist' ? null : 'wrist')} aria-pressed={group === 'wrist'}>
              joints 4–6
            </Button>
            {hasOwnTriple(L) && revealed && (
              <Button size="sm" variant={group === 'triple' ? 'primary' : 'default'} onClick={() => startGroup(group === 'triple' ? null : 'triple')} aria-pressed={group === 'triple'}>
                joints {tripleText(L)}
              </Button>
            )}
            {group && (
              <Button size="sm" variant="ghost" onClick={() => startGroup(null)}>
                ■ Stop
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setYaw(0);
                live.current.tw = null;
              }}
              disabled={yaw === 0}
            >
              Exam view
            </Button>
          </div>
        </section>

        <section className="kin-ik-panel kin-ik-decide" aria-label="Your decision">
          <div className="kin-ik-panel-head">
            <h4>Closed-form IK?</h4>
            <span className="kin-ik-score">
              {score} right of {nDecided} decided
            </span>
          </div>
          {decided === undefined ? (
            <>
              <Rich
                className="kin-ik-explain"
                text={`Joints from the base: ${L.joints.map((j, i) => `${i + 1} ${j.type}`).join(', ')}. Extend each revolute axis along its cylinder. Do three **neighbours** in the chain pass through one point, or run parallel?`}
              />
              <div className="kin-ik-choice">
                <Button variant="primary" onClick={() => decide(true)}>
                  Closed form
                </Button>
                <Button onClick={() => decide(false)}>No closed form</Button>
              </div>
              {peek[L.id] && <Rich className="kin-ik-explain" text="(The overlay is showing because of a prediction below; decide anyway to score it.)" />}
            </>
          ) : (
            <>
              <Callout kind={right ? 'ok' : 'bad'} title={`${right ? '✓ Right' : '✗ Not quite'}: ${L.closedForm ? 'closed form' : 'no closed form'}`}>
                <div className="kin-ik-src">
                  {L.name}
                  {L.source ? ` · ${L.source}` : ''}
                </div>
                <Rich text={L.why} />
              </Callout>
              <TripleTable L={L} triples={check.triples} />
              <Rich
                className="kin-ik-explain"
                text={`Generic rank of the Jacobian: ${check.rank} of 6 (rotation rows ${check.wRank} of 3).${check.wRank < 3 ? ' The gripper cannot rotate about every axis, so no IK method reaches every pose.' : ''}`}
              />
              <div className="kin-ik-choice">
                <Button variant="primary" onClick={() => select((idx + 1) % DECK.length)}>
                  Next arm →
                </Button>
                <Button variant="ghost" onClick={forget}>
                  Decide again
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <PredictBlock api={api} />

      <More label="Pieper’s criterion in the exam, step by step (and why it works)">
        <Rich
          text={`1. Number the joints from the base and mark each one R or P (a cylinder turns about its long axis; a box with an arrow slides).
2. Extend every revolute axis right through the drawing.
3. Check each run of three **consecutive** revolute joints (1–2–3, 2–3–4, 3–4–5, 4–5–6): do all three axes pass through one point, or are all three parallel?
4. Look for offsets: a link that steps sideways between two wrist cylinders (2023 Q12 (a)) moves one axis off the common point.
5. If a triple qualifies, say why it matters. With a spherical wrist the wrist centre is $p_w = p_d - d\\,\\hat z_d$ (step back from the tool along its approach axis); joints 1–3 place $p_w$, then joints 4–6 supply the rest of the orientation, $R_{\\text{wrist}} = R_{\\text{arm}}^T R_d$.

**Why it works.** A rotation about an axis leaves every point on that axis where it is. If axes 4, 5 and 6 share a point $W$, no value of $\\theta_4, \\theta_5, \\theta_6$ can move $W$, so the six coupled equations split into a 3-unknown position problem and a 3-unknown orientation problem. Three parallel axes give a planar 3R sub-arm instead, solved by the law of cosines. The same fact makes the check pose-independent: turning joint $i$ cannot change where axis $i+1$ meets axis $i$, so you can read it off the drawing in any configuration.

**And when it fails:** there is no general recipe (the criterion is sufficient, not necessary), so the default is numerical IK, Newton–Raphson from a good initial guess.`}
        />
        <div className="row gap-s" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <LinkButton href={href(['kin', 'solve', 'kin-pieper'], { t: 2 })} variant="primary">
            Practise: which arm has closed-form IK?
          </LinkButton>
          <LinkButton href={href(['kin', 'explore', 'ik'])}>Numerical IK, iteration by iteration</LinkButton>
        </div>
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

const DeckThumb = memo(function DeckThumb({ L, k, on, ans, peeked, onPick }: { L: PLayout; k: number; on: boolean; ans: boolean | undefined; peeked: boolean; onPick: (k: number) => void }) {
  const mark = ans === undefined ? (peeked ? '·' : '') : ans === L.closedForm ? '✓' : '✗';
  const cls = ans === undefined ? '' : ans === L.closedForm ? 'is-right' : 'is-wrong';
  return (
    <button
      type="button"
      className={`kin-ik-thumb ${on ? 'is-on' : ''}`}
      onClick={() => onPick(k)}
      aria-current={on ? 'true' : undefined}
      aria-label={`Arm ${k + 1}${ans === undefined ? '' : ans === L.closedForm ? ', decided correctly' : ', decided wrongly'}`}
    >
      <span className="kin-ik-thumb-n">{k + 1}</span>
      {mark && <span className={`kin-ik-thumb-mark ${cls}`}>{mark}</span>}
      <PieperSvg layout={L} width={150} height={92} thumb numbers={false} label={`Arm ${k + 1}`} />
      <span className="kin-ik-thumb-name">{typesOf(L)}</span>
    </button>
  );
});

function TripleTable({ L, triples }: { L: PLayout; triples: TripleCheck[] }) {
  const rel = (r: 'meet' | 'parallel' | 'skew') => (r === 'parallel' ? '∥' : r);
  return (
    <table className="kin-ik-triples">
      <thead>
        <tr>
          <th scope="col">Axes</th>
          <th scope="col">Types</th>
          <th scope="col">Pairs</th>
          <th scope="col">Qualifies?</th>
        </tr>
      </thead>
      <tbody>
        {triples.map((t) => {
          const ids = [t.start, t.start + 1, t.start + 2];
          const hit = t.kind === 'meet' || t.kind === 'parallel';
          const focus = !L.closedForm && L.triple?.join() === ids.join();
          const verdict = t.kind === 'meet' ? '✓ meet at one point' : t.kind === 'parallel' ? '✓ all parallel' : t.kind === 'prismatic' ? '✗ includes a slide' : '✗ no';
          return (
            <tr key={t.start} className={hit ? 'is-hit' : focus ? 'is-focus' : ''}>
              <td>{tripleName(ids)}</td>
              <td>{ids.map((i) => L.joints[i].type).join(' ')}</td>
              <td>{t.kind === 'prismatic' ? '—' : t.pairs.map((p) => `${p.a + 1}–${p.b + 1} ${p.rel === 'parallel' && sameLine(L.joints, p.a, p.b) ? 'same line' : rel(p.rel)}`).join(', ')}</td>
              <td>{verdict}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<Record<string, () => void>> }) {
  return (
    <div className="kin-ik-predicts">
      <PredictReveal
        id="kin-ik-pieper-wrist"
        question="Arm 1 (PUMA-like). Lock joints 1–3 and move only the wrist joints 4, 5 and 6. What does the wrist centre $W$, where axes 4, 5 and 6 meet, do?"
        options={['It moves on a small circle as joint 4 turns', 'It stays exactly where it is', 'It moves, but only when joint 6 turns']}
        answer={1}
        explain="Every wrist axis passes through $W$, and a rotation about an axis leaves the points on that axis where they are. So $\theta_4, \theta_5, \theta_6$ cannot move $W$: its position depends on $\theta_1$–$\theta_3$ alone. That is the decoupling Pieper’s criterion buys: find $W$ from the desired pose, solve joints 1–3 for it, then joints 4–6 for the orientation."
        tryIt="press Show me: the readout tracks how far W moves while the wrist swings the gripper about."
        onApply={() => api.current.wrist()}
      />
      <PredictReveal
        id="kin-ik-pieper-offset"
        question="2023 Q12 (a) looks almost the same, but joint 6 hangs from the far end of joint 5. Lock joints 1–3 and move 4–6 again. Does the point where axes 5 and 6 meet stay put?"
        options={['Yes: any three wrist joints keep their centre fixed', 'Yes, as long as joint 5 does not move', 'No: it swings round as joint 4 turns']}
        answer={2}
        explain="Axis 6 meets axis 5 at a point that is **not on axis 4** (the offset along joint 5 moves it 0.75 m away), so turning joint 4 carries that point round a circle. Position now depends on the wrist joints too: nothing decouples, and with no other qualifying triple there is no closed form (2023 worked solutions). This arm needs numerical IK."
        tryIt="press Show me and watch the traced path of W′."
        onApply={() => api.current.offset()}
      />
      <PredictReveal
        id="kin-ik-pieper-skew"
        question="Arm 4: the forearm doglegs down before joint 5. Axes 5 and 6 meet. Does axis 4 pass through that same point?"
        options={['Yes: all three wrist axes still meet', 'It depends on the value of $\\theta_4$', 'No: axis 4 misses it']}
        answer={2}
        explain="The dogleg drops joint 5 by 0.6 m, so axis 4 (along the forearm) passes 0.6 m above the point where 5 and 6 meet: axes 4 and 5 are **skew**, never meeting. It does not depend on $\theta_4$: turning joint 4 cannot change where (or whether) axis 5 meets it. In one drawing, skew axes can look as if they cross; turn the view and the apparent crossing slides along them, while a true intersection stays put."
        tryIt="press Show me: the view turns and the red dashed segment shows the 0.6 m miss."
        onApply={() => api.current.skew()}
      />
      <PredictReveal
        id="kin-ik-pieper-parallel"
        question="Arm 3 (UR-like) has no three axes meeting at a point anywhere in its chain. Closed-form IK?"
        options={['No: closed form needs a spherical wrist', 'Yes: axes 2, 3 and 4 are parallel', 'Only if joint 5 is locked']}
        answer={1}
        explain="Pieper’s criterion has two cases: three consecutive axes that meet at a point **or** three consecutive parallel axes (they “meet at infinity”). Joints 2, 3 and 4 then move their links in one plane, a planar 3R arm whose position comes from the law of cosines and whose in-plane angle is $\theta_2 + \theta_3 + \theta_4$. That is how the UR family of cobots is solved in closed form."
        tryIt="press Show me: the view turns, joints 2–4 move, and everything they carry stays in the shaded plane."
        onApply={() => api.current.parallel()}
      />
      <PredictReveal
        id="kin-ik-pieper-orient"
        question="2023 Q12 (d): three slides, and all three revolute axes parallel to $y$. Can the arm point its gripper in any direction you like?"
        options={['No: it can only turn about $y$', 'Yes: the three slides make up for it', 'Yes, but only in closed form']}
        answer={0}
        explain="Slides change position, never orientation, and every revolute joint turns about the same direction $y$. Whatever the joint values, the gripper is only rotated about $y$ (the rotation rows of the Jacobian have rank 1). Most orientations cannot be reached at all, closed form or not, which is why the worked solutions rule (d) out."
        tryIt="press Show me: all three revolute joints move and the gripper only ever spins about y."
        onApply={() => api.current.orient()}
      />
    </div>
  );
});
