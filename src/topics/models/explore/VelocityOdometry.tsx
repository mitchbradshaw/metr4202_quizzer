// Velocity vs odometry motion models (summary notes §3 table; 2023 Q6, 2024 Q6, 2025 Q6; review deck learning
// outcome "analyse the differences between velocity and odometry motion models").
// A robot drives a route of velocity commands while its motors under-deliver and its wheels slip on a wet
// patch (odoWorld.ts). Each step has two phases: the command is issued (only the velocity model can predict),
// then the robot moves and the encoders give (δrot1, δtrans, δrot2) (now the odometry model can predict).
// Both models' sample clouds are propagated from the start with no correction step, beside the true path.
// Below: the comparison table, filled in by predicting.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import type { Pose } from '../../../core/motion';
import { useRaf } from '../../../anim/hooks';
import { useThemeColors } from '../../../ui/theme';
import { Button, Callout, More, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { usePersisted } from '../../../ui/persist';
import { Key, RobotGlyph, WorldGrid, fitView, headD, makeFrame, rgba, useStageCanvas, type Frame } from './modelsDraw';
import { DEG, fx, g } from './modelsFmt';
import { ROUTES, meanOf, propagate, routeById, simulateRoute, type Actuation, type Route, type RouteSim } from './odoWorld';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'odometry',
  title: 'Velocity vs odometry models',
  summary:
    'A robot drives a route of velocity commands while its motors under-deliver and its wheels slip on a wet patch. Step through each move: when the command is issued only the velocity model can predict; after the move the encoders give $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$ and the odometry model predicts too. Compare both sample clouds with the truth, then fill in the comparison table by predicting.',
  notice:
    'The velocity model can predict before the robot moves, so it can plan; the odometry model needs encoder readings that only exist afterwards, but it tracks what the wheels really did. Neither one sees wheel slip.',
  minutes: 9,
};

const W = 680;
const H = 520;
const N = 300;

function viewFor(route: Route) {
  const sim = simulateRoute(route, { gain: 0.85, imbalance: 0.01, slip: 0.35 });
  const pts: { x: number; y: number }[] = [...sim.cmd, ...sim.truth, { x: route.patch.x0, y: route.patch.y0 }, { x: route.patch.x1, y: route.patch.y1 }];
  return fitView(pts, W / H, 0.45, 2.5);
}

/** The latest encoder increment, enlarged: rotate by δrot1, translate δtrans, rotate by δrot2. */
function OdoInset({ a, b, u }: { a: Pose; b: Pose; u: { rot1: number; trans: number; rot2: number } }) {
  const IW = 330;
  const IH = 150;
  const h1 = a.theta + u.rot1;
  // Enlarge the move to a fixed on-screen length (world orientation kept), shorter when it runs up or down.
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const k = (170 - 85 * Math.abs(Math.sin(ang))) / Math.max(0.02, u.trans);
  const cxw = (a.x + b.x) / 2;
  const cyw = (a.y + b.y) / 2;
  const X = (x: number) => IW / 2 + (x - cxw) * k;
  const Y = (y: number) => IH / 2 - (y - cyw) * k + 6;
  const ax = X(a.x);
  const ay = Y(a.y);
  const bx = X(b.x);
  const by = Y(b.y);
  const R = 44;
  const cl = (x: number) => Math.max(34, Math.min(IW - 34, x));
  const lab = (ang: number, r: number, x0: number, y0: number) => ({ x: cl(x0 + r * Math.cos(ang)), y: Math.max(14, Math.min(IH - 8, y0 - r * Math.sin(ang) + 4)) });
  // Labels sit on the far side of each arc from the translation line.
  const side1 = u.rot1 >= 0 ? -1 : 1;
  const l1 = lab(a.theta + side1 * 0.6, R + 14, ax, ay);
  const side2 = u.rot2 >= 0 ? 1 : -1;
  const l2 = lab(h1 + u.rot2 + side2 * 0.5, R + 14, bx, by);
  const pure = u.trans < 0.01;
  return (
    <svg className="models-svg" viewBox={`0 0 ${IW} ${IH}`} role="img" aria-label={`Odometry increment: rotate ${fx(u.rot1, 3)} rad, translate ${fx(u.trans, 3)} m, rotate ${fx(u.rot2, 3)} rad.`} style={{ maxWidth: IW }}>
      <rect x={0.5} y={0.5} width={IW - 1} height={IH - 1} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
      <line x1={ax} y1={ay} x2={ax + 46 * Math.cos(a.theta)} y2={ay - 46 * Math.sin(a.theta)} stroke="var(--text-3)" strokeWidth={1.3} strokeDasharray="3 3" />
      {!pure && <line x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--m2)" strokeWidth={2.6} />}
      {!pure && <path d={headD(ax, ay, bx, by, 9)} fill="var(--m2)" />}
      {!pure && Math.abs(u.rot1) > 0.004 && <path d={angleArc(ax, ay, R, a.theta, u.rot1)} fill="none" stroke="var(--m2)" strokeWidth={2} />}
      {!pure && <line x1={bx} y1={by} x2={bx + 40 * Math.cos(h1)} y2={by - 40 * Math.sin(h1)} stroke="var(--text-3)" strokeWidth={1.3} strokeDasharray="3 3" />}
      {Math.abs(u.rot2) > 0.004 && <path d={angleArc(bx, by, R, h1, u.rot2)} fill="none" stroke="var(--m2)" strokeWidth={2} />}
      <line x1={bx} y1={by} x2={bx + 40 * Math.cos(b.theta)} y2={by - 40 * Math.sin(b.theta)} stroke="var(--m2)" strokeWidth={2} />
      <path d={headD(bx, by, bx + 44 * Math.cos(b.theta), by - 44 * Math.sin(b.theta), 7)} fill="var(--m2)" />
      <circle cx={ax} cy={ay} r={4} fill="var(--text-2)" />
      {!pure && (
        <text className="models-note is-strong" x={l1.x} y={l1.y} textAnchor="middle" fill="var(--m2)">
          δrot1 = {fx(u.rot1, 2)}
        </text>
      )}
      {!pure && (
        <text className="models-note is-strong" x={(ax + bx) / 2 + 8 * Math.sin(Math.atan2(by - ay, bx - ax))} y={(ay + by) / 2 - 10} textAnchor="middle" fill="var(--m2)">
          δtrans = {fx(u.trans, 2)} m
        </text>
      )}
      <text className="models-note is-strong" x={pure ? bx : l2.x} y={pure ? by - 40 : l2.y} textAnchor="middle" fill="var(--m2)">
        δrot2 = {fx(u.rot2, 2)}
      </text>
    </svg>
  );
}

/** Arc of radius `rad` px at (cx, cy) from screen angle a0 turning by da (world radians, anticlockwise). */
function angleArc(cx: number, cy: number, rad: number, a0: number, da: number): string {
  const n = Math.max(2, Math.ceil(Math.abs(da) / 0.08));
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = a0 + (da * i) / n;
    d += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy - rad * Math.sin(a)).toFixed(1)}`;
  }
  return d;
}

function pathD(ps: Pose[], f: Frame): string {
  return ps.map((p, i) => `${i ? 'L' : 'M'}${f.sx(p.x).toFixed(1)} ${f.sy(p.y).toFixed(1)}`).join('');
}

// ------------------------------------------------------------------ the fill-in comparison table

interface Row {
  id: string;
  label: string;
  options: string[];
  vel: number;
  odo: number;
  why: { vel: string; odo: string };
}

const ROWS: Row[] = [
  {
    id: 'input',
    label: 'Control input $u_t$',
    options: ['commanded $(v, \\omega)$', 'measured $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$'],
    vel: 0,
    odo: 1,
    why: {
      vel: 'It takes the translational and rotational velocity sent to the motors and assumes they are held for $\\Delta t$.',
      odo: 'It turns two consecutive odometry poses into rotate, translate, rotate.',
    },
  },
  {
    id: 'source',
    label: 'Where the data comes from',
    options: ['the controller (a command)', 'proprioceptive sensors (wheel encoders)', 'exteroceptive sensors (lidar, camera)'],
    vel: 0,
    odo: 1,
    why: {
      vel: 'A command is not a sensor reading at all: it is what we asked for.',
      odo: 'Encoders measure the robot’s own wheels: proprioceptive (2025 Q6). Lidar and cameras sense the world and belong to the correction step.',
    },
  },
  {
    id: 'when',
    label: 'When it is known',
    options: ['before the robot moves', 'only after the robot has moved'],
    vel: 0,
    odo: 1,
    why: {
      vel: 'The command exists the moment it is issued.',
      odo: 'The wheels have to turn before the encoders can count anything (2023 Q6).',
    },
  },
  {
    id: 'plan',
    label: 'Usable for motion planning',
    options: ['yes', 'no'],
    vel: 0,
    odo: 1,
    why: {
      vel: 'Given a candidate command it predicts where the robot will go: the RRT steering function in 2023 Q32 (2024 Q6).',
      odo: 'You cannot read the encoders for a move you have not made yet (2023 Q6).',
    },
  },
  {
    id: 'acc',
    label: 'Typical accuracy',
    options: ['higher', 'lower'],
    vel: 1,
    odo: 0,
    why: {
      vel: 'Motors never deliver exactly the command (load, battery, controller lag), and the model cannot know by how much.',
      odo: 'It measures what the wheels actually did, so actuator errors are already in the data. Only slip and wheel-size errors remain.',
    },
  },
  {
    id: 'step',
    label: 'Bayes-filter step that uses it',
    options: ['prediction (motion update)', 'correction (measurement update)'],
    vel: 0,
    odo: 0,
    why: {
      vel: 'Both are motion models $p(x_t \\mid u_t, x_{t-1})$: they predict, and uncertainty grows.',
      odo: 'Odometry is a sensor reading, but the filter treats it as the control $u_t$ in the prediction step, not as a measurement $z_t$ (2025 Q6).',
    },
  },
];

function CompareTable() {
  const [ans, setAns] = usePersisted<Record<string, number | undefined>>('models-odo-compare', {});
  const [checked, setChecked] = usePersisted('models-odo-compare-checked', false);
  const keys = ROWS.flatMap((r) => [`${r.id}:vel`, `${r.id}:odo`]);
  const filled = keys.filter((k) => ans[k] !== undefined).length;
  const right = ROWS.reduce((a, r) => a + (ans[`${r.id}:vel`] === r.vel ? 1 : 0) + (ans[`${r.id}:odo`] === r.odo ? 1 : 0), 0);
  const cell = (r: Row, m: 'vel' | 'odo') => {
    const k = `${r.id}:${m}`;
    const v = ans[k];
    const ok = v === r[m];
    return (
      <td>
        <Segmented
          size="sm"
          label={`${r.label}: ${m === 'vel' ? 'velocity' : 'odometry'} model`}
          value={v ?? -1}
          onChange={(x) => {
            setAns((a) => ({ ...a, [k]: x }));
            setChecked(false);
          }}
          options={r.options.map((o, i) => ({ value: i, label: <Rich text={o} inline /> }))}
        />
        {checked && v !== undefined && (
          <div className="models-verdict">
            <span className={ok ? 'models-ok' : 'models-bad'}>{ok ? '✓ ' : '✗ '}</span>
            {!ok && <Rich text={`It is **${r.options[r[m]]}**. `} inline />}
            <Rich text={r.why[m]} inline />
          </div>
        )}
      </td>
    );
  };
  return (
    <section className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>Fill in the comparison: predict each cell, then check</h4>
        <span className="models-hint">
          {filled} / {keys.length} filled{checked ? `, ${right} right` : ''}
        </span>
      </div>
      <div className="models-table-wrap">
        <table className="models-table models-compare">
          <thead>
            <tr>
              <th className="models-txt" style={{ width: '22%' }}>
                property
              </th>
              <th className="models-txt">velocity motion model</th>
              <th className="models-txt">odometry motion model</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id}>
                <td className="models-txt">
                  <Rich text={r.label} inline />
                </td>
                {cell(r, 'vel')}
                {cell(r, 'odo')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="models-bar">
        <Button size="sm" variant="primary" disabled={filled === 0} onClick={() => setChecked(true)}>
          Check my table
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setAns({});
            setChecked(false);
          }}
        >
          Clear
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const all: Record<string, number> = {};
            for (const r of ROWS) {
              all[`${r.id}:vel`] = r.vel;
              all[`${r.id}:odo`] = r.odo;
            }
            setAns(all);
            setChecked(true);
          }}
        >
          Show the answers
        </Button>
        {checked && filled === keys.length && right === keys.length && <span className="models-ok">✓ All {keys.length} right: this is the 2023–2025 Q6 table.</span>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ component

export default function VelocityOdometry() {
  const [routeId, setRouteId] = useState('turn');
  const [gain, setGain] = useState(0.85);
  const [imb, setImb] = useState(0.01);
  const [slip, setSlip] = useState(0.35);
  const [noise, setNoise] = useState(1);
  const [seed, setSeed] = useState(1);
  const [paths, setPaths] = useState(true);
  const [showVel, setShowVel] = useState(true);
  const [showOdo, setShowOdo] = useState(true);
  const col = useThemeColors(['--m1', '--m2']);

  const route = routeById(routeId);
  const act: Actuation = useMemo(() => ({ gain, imbalance: imb, slip }), [gain, imb, slip]);
  const dAct = useDeferredValue(act);
  const dNoise = useDeferredValue(noise);
  const sim: RouteSim = useMemo(() => simulateRoute(route, dAct, seed), [route, dAct, seed]);
  const clouds = useMemo(() => propagate(route, sim, dNoise, N, seed * 31 + 7), [route, sim, dNoise, seed]);
  const view = useMemo(() => viewFor(route), [route]);
  const f = useMemo(() => makeFrame(view, W, H), [view]);

  const K = route.cmds.length;
  const st = useStepper(2 * K, { speed: 2 });
  const i = Math.min(st.i, 2 * K);
  const kVel = Math.ceil(i / 2);
  const kOdo = Math.floor(i / 2);
  const before = i % 2 === 1;
  const kCmd = kVel; // the command just issued (before) or just executed (after), 1-based

  // ---------------------------------------------------------------- animate the true robot through each move
  const animRef = useRef<SVGGElement>(null);
  const anim = useRef<{ k: number; t: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const prevI = useRef(i);
  useEffect(() => {
    if (i === prevI.current + 1 && i % 2 === 0 && i > 0) {
      anim.current = { k: i / 2 - 1, t: 0 };
      setAnimating(true);
    } else {
      anim.current = null;
      setAnimating(false);
    }
    prevI.current = i;
  }, [i]);
  useRaf(
    (dt) => {
      const a = anim.current;
      const el = animRef.current;
      if (!a || !el) return;
      a.t += dt / 0.4;
      const subs = sim.sub[a.k];
      if (!subs) return;
      const u = Math.min(1, a.t) * (subs.length - 1);
      const p = subs[Math.min(subs.length - 1, Math.round(u))];
      el.setAttribute('transform', `translate(${f.sx(p.x).toFixed(1)} ${f.sy(p.y).toFixed(1)}) rotate(${(-p.theta * DEG).toFixed(1)})`);
      if (a.t >= 1) {
        anim.current = null;
        setAnimating(false);
      }
    },
    animating
  );

  // ---------------------------------------------------------------- clouds on the canvas
  const velPts = clouds.vel[kVel] ?? clouds.vel[0];
  const odoPts = clouds.odo[kOdo] ?? clouds.odo[0];
  const canvasRef = useStageCanvas(
    W,
    H,
    (ctx) => {
      const dot = (ps: Pose[], c: string) => {
        ctx.fillStyle = rgba(c, 0.38);
        for (const p of ps) {
          ctx.beginPath();
          ctx.arc(f.sx(p.x), f.sy(p.y), 1.8, 0, 2 * Math.PI);
          ctx.fill();
        }
      };
      if (showVel && i > 0) dot(velPts, col['--m1']);
      if (showOdo && kOdo > 0) dot(odoPts, col['--m2']);
    },
    [velPts, odoPts, f, col, showVel, showOdo, i, kOdo]
  );

  const truthNow = sim.truth[kOdo];
  const mv = meanOf(velPts);
  const mo = meanOf(odoPts);
  const errV = Math.hypot(mv.x - sim.truth[kVel].x, mv.y - sim.truth[kVel].y);
  const errO = Math.hypot(mo.x - truthNow.x, mo.y - truthNow.y);
  const cmdNow = kCmd >= 1 ? route.cmds[kCmd - 1] : null;
  const uNow = kOdo >= 1 ? sim.u[kOdo - 1] : null;
  const actNow = kOdo >= 1 ? sim.actual[kOdo - 1] : null;

  const cross = (p: { x: number; y: number }, c: string, key: string) => {
    const x = f.sx(p.x);
    const y = f.sy(p.y);
    return <path key={key} d={`M${x - 7} ${y}L${x + 7} ${y}M${x} ${y - 7}L${x} ${y + 7}`} stroke={c} strokeWidth={2.6} pointerEvents="none" />;
  };

  const pz = route.patch;
  const world = (
    <div className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>
          {i === 0 ? 'Start: both models agree' : before ? `Command ${kCmd} issued: the robot has not moved yet` : `Command ${kCmd} done: encoders read`}
        </h4>
        <span className="models-phase" style={{ color: before ? 'var(--m1)' : i === 0 ? 'var(--text-3)' : 'var(--m2)' }}>
          {i === 0 ? 'start' : before ? 'before moving' : 'after moving'}
        </span>
      </div>
      <div className="models-stage">
        <canvas ref={canvasRef} className="models-stage-under" aria-hidden="true" />
        <svg className="models-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Route ${route.label}, step ${kOdo} of ${K}. Velocity-model cloud mean ${fx(errV, 2)} m from the truth, odometry cloud mean ${fx(errO, 2)} m.`}>
          <WorldGrid f={f} />
          <rect x={f.sx(pz.x0)} y={f.sy(pz.y1)} width={(pz.x1 - pz.x0) * f.k} height={(pz.y1 - pz.y0) * f.k} fill="var(--m3)" opacity={slip > 0 ? 0.16 : 0.06} rx={6} />
          <text className="models-note" x={f.sx((pz.x0 + pz.x1) / 2)} y={f.sy(pz.y1) - 6} textAnchor="middle" fill="var(--m3)">
            wet patch{slip > 0 ? `: ${Math.round(slip * 100)} % slip` : ' (dry now)'}
          </text>
          {paths && (
            <g pointerEvents="none">
              <path d={pathD(sim.cmd, f)} fill="none" stroke="var(--m1)" strokeWidth={1.8} strokeDasharray="7 5" opacity={0.75} />
              <path d={pathD(sim.odo, f)} fill="none" stroke="var(--m2)" strokeWidth={1.8} strokeDasharray="3 4" opacity={0.85} />
            </g>
          )}
          <path d={pathD(sim.sub.slice(0, kOdo).flat(), f)} fill="none" stroke="var(--text)" strokeWidth={3} strokeLinecap="round" pointerEvents="none" />
          {showVel && i > 0 && cross(mv, 'var(--m1)', 'mv')}
          {showOdo && kOdo > 0 && cross(mo, 'var(--m2)', 'mo')}
          {!animating && <RobotGlyph pose={truthNow} f={f} color="var(--text)" r={0.12} minPx={9} label={before ? `waiting to move` : i === 0 ? 'start' : 'true pose'} />}
          <g ref={animRef} transform="translate(-100 -100)" pointerEvents="none" style={{ display: animating ? undefined : 'none' }}>
            <circle r={9} fill="var(--surface)" stroke="var(--text)" strokeWidth={2} />
            <line x1={0} y1={0} x2={15} y2={0} stroke="var(--text)" strokeWidth={2.4} strokeLinecap="round" />
          </g>
          {before && showOdo && (
            <text className="models-note is-strong" x={W - 10} y={22} textAnchor="end" fill="var(--m2)">
              odometry cloud waits: no encoder data for move {kCmd} yet
            </text>
          )}
        </svg>
      </div>
      <StepControls st={st} label="phase" speeds={[1, 2, 4]} />
      <Key
        items={[
          { label: 'true path', color: 'var(--text)' },
          { label: 'velocity-model samples (+ mean)', color: 'var(--m1)', kind: 'dot' },
          { label: 'odometry-model samples (+ mean)', color: 'var(--m2)', kind: 'dot' },
          ...(paths
            ? [
                { label: 'path the commands assume', color: 'var(--m1)', kind: 'dash' as const },
                { label: 'path the encoders report', color: 'var(--m2)', kind: 'dash' as const },
              ]
            : []),
        ]}
      />
    </div>
  );

  const stepPanel = (
    <section className="models-panel" aria-live="polite">
      <h4>{i === 0 ? 'Before the first command' : `Move ${kCmd} of ${K}`}</h4>
      <div className="models-two">
        <div>
          <div className="models-label" style={{ color: 'var(--m1)' }}>
            velocity model input
          </div>
          {cmdNow ? (
            <TeX>{`u_t = (v, \\omega) = (${g(cmdNow.v, 2)}\\ \\text{m/s},\\ ${g(cmdNow.w, 2)}\\ \\text{rad/s}),\\ \\Delta t = ${g(cmdNow.dt)}\\ \\text{s}`}</TeX>
          ) : (
            <p className="small muted">no command yet</p>
          )}
          <p className="small" style={{ margin: '4px 0 0' }}>
            {cmdNow ? 'Known as soon as the command is issued: the prediction exists before the move.' : 'Press ▶| to issue command 1.'}
          </p>
        </div>
        <div>
          <div className="models-label" style={{ color: 'var(--m2)' }}>
            odometry model input
          </div>
          {uNow && !before ? (
            <TeX>{`u_t = (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2}) = (${fx(uNow.rot1, 3)},\\ ${fx(uNow.trans, 3)}\\ \\text{m},\\ ${fx(uNow.rot2, 3)})`}</TeX>
          ) : (
            <p className="small models-bad" style={{ margin: 0 }}>
              {i === 0 ? 'nothing yet' : 'not yet: the wheels have not turned'}
            </p>
          )}
          <p className="small" style={{ margin: '4px 0 0' }}>
            {uNow && !before ? 'From the two encoder poses either side of the move: rotate, translate, rotate (angles in rad).' : 'It exists only after the robot has moved.'}
          </p>
        </div>
      </div>
      {uNow && !before && kOdo >= 1 && (
        <div>
          <div className="models-label">the encoder increment of move {kOdo}, enlarged: rotate, translate, rotate</div>
          <OdoInset a={sim.odo[kOdo - 1]} b={sim.odo[kOdo]} u={uNow} />
        </div>
      )}
      {actNow && !before && cmdNow && (
        <Rich
          className="note"
          text={`The motors actually delivered $v' = ${g(actNow.v, 3)}$ m/s and $\\omega' = ${g(actNow.w, 3)}$ rad/s for a command of $(${g(cmdNow.v, 2)}, ${g(cmdNow.w, 2)})$${sim.slipFrac[kOdo - 1] > 0 ? `, and ${Math.round(sim.slipFrac[kOdo - 1] * 100)} % of this move was on the wet patch, where the ground moved ${Math.round((1 - slip) * 100)} % of what the wheels turned` : ''}.`}
        />
      )}
      <div className="models-two">
        <div>
          <div className="small">velocity cloud mean to the truth{before ? ' (after this move)' : ''}</div>
          <div className="models-scorebar" title={`${fx(errV, 3)} m`}>
            <span style={{ width: `${Math.min(100, (errV / 1.2) * 100)}%`, background: 'var(--m1)' }} />
          </div>
          <div className="models-mono small">{i === 0 ? '—' : `${fx(errV, 2)} m`}</div>
        </div>
        <div>
          <div className="small">odometry cloud mean to the truth</div>
          <div className="models-scorebar" title={`${fx(errO, 3)} m`}>
            <span style={{ width: `${Math.min(100, (errO / 1.2) * 100)}%`, background: 'var(--m2)' }} />
          </div>
          <div className="models-mono small">{kOdo === 0 ? '—' : `${fx(errO, 2)} m`}</div>
        </div>
      </div>
      {i === 2 * K && (
        <Callout kind={errO < errV ? 'ok' : 'note'} title={errO < errV ? 'Odometry ended nearer the truth' : 'Here the velocity model ended nearer'}>
          <Rich
            text={
              errO < errV
                ? `After ${K} moves the odometry cloud is ${fx(errO, 2)} m from the robot and the velocity cloud ${fx(errV, 2)} m: the encoders saw the weak motors, the commands did not. ${slip > 0 ? 'The slip on the wet patch still pulled both off: only a correction step with an exteroceptive sensor can fix that.' : ''}`
                : 'With perfect motors the command is exactly what happens, so both models agree; odometry’s advantage comes from measuring actuator errors. Set the motor gain below 1.'
            }
          />
        </Callout>
      )}
    </section>
  );

  const loadScenario = (o: { route?: string; gain?: number; imb?: number; slip?: number; to?: number }) => {
    if (o.route) setRouteId(o.route);
    if (o.gain !== undefined) setGain(o.gain);
    if (o.imb !== undefined) setImb(o.imb);
    if (o.slip !== undefined) setSlip(o.slip);
    st.pause();
    const r = o.route ? routeById(o.route) : route;
    st.setI(Math.min(o.to ?? 2 * r.cmds.length, 2 * r.cmds.length));
  };

  const controls = (
    <section className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>The robot and its world</h4>
        <Select
          label="Route"
          value={routeId}
          onChange={(v) => {
            setRouteId(v);
            st.reset();
          }}
          options={ROUTES.map((r) => ({ value: r.id, label: r.label }))}
        />
      </div>
      <div className="models-sliders">
        <Slider label="motor gain" tip="Fraction of the commanded wheel speed the motors actually deliver (1 = perfect). The encoders see this; the commands do not." value={gain} min={0.6} max={1.15} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={setGain} />
        <Slider label="right wheel weaker by" tip="Left/right motor imbalance: the robot drifts towards the weaker wheel. The encoders see this too." value={imb} min={-0.05} max={0.05} step={0.0025} format={(v) => `${(v * 100).toFixed(1)} %`} onChange={setImb} />
        <Slider label="slip on the wet patch" tip="On the patch the ground moves (1 − slip) times what the wheels turn. Encoders count wheel turns, so they cannot see it." value={slip} min={0} max={0.6} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={setSlip} />
        <Slider label="model noise ×" tip="Scales the α parameters of both sampled models together" value={noise} min={0} max={3} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={setNoise} />
      </div>
      <div className="models-bar">
        <Toggle checked={paths} onChange={setPaths} label="Paths the models assume" />
        <Toggle checked={showVel} onChange={setShowVel} label="Velocity cloud" />
        <Toggle checked={showOdo} onChange={setShowOdo} label="Odometry cloud" />
        <Button size="sm" onClick={() => setSeed((s) => s + 1)}>
          New noise
        </Button>
      </div>
    </section>
  );

  const predictions = (
    <section className="models-panel">
      <h4>Predict, then check</h4>
      <PredictReveal
        id="models-odo-before"
        question="Command 3 has just been issued; the robot has not moved yet. Which model can predict where it will be?"
        options={['Only the velocity model', 'Only the odometry model', 'Both', 'Neither until the robot moves']}
        answer={0}
        explain="The velocity model needs only the command, which exists now: that is why it can serve as a planner’s steering function (2023 Q32, 2024 Q6). The odometry model needs the encoder counts for this move, and they only exist after the wheels have turned (2023 Q6): see the empty odometry input."
        tryIt="step to “Command 3 issued” and read the two input boxes."
        onApply={() => loadScenario({ to: 5 })}
      />
      <PredictReveal
        id="models-odo-motor"
        question="The motors deliver only 80 % of the commanded speed (dry floor). After the whole route, which cloud is nearer the true robot?"
        options={['The odometry cloud', 'The velocity cloud', 'Both equally far off']}
        answer={0}
        explain="The encoders count what the wheels really turned, so the odometry increments already contain the shortfall. The velocity model assumes the command was delivered and runs ahead of the robot. This is why odometry is typically the more accurate of the two (2023 Q6, 2024 Q6, 2025 Q6)."
        tryIt="set the motor gain to 80 %, the slip to 0 and play to the end."
        onApply={() => loadScenario({ gain: 0.8, imb: 0, slip: 0 })}
      />
      <PredictReveal
        id="models-odo-slip"
        question="Perfect motors, but on the wet patch the ground moves only 50 % of what the wheels turn. What does odometry report for that stretch?"
        options={['Too far: it counts wheel turns, not ground motion', 'The true distance', 'Too short']}
        answer={0}
        explain="Encoders are proprioceptive: they measure the wheels, not the floor. Spinning wheels look like progress, so odometry (and the command) put the robot past where it really is. Only the correction step, with an exteroceptive sensor such as a lidar or camera, can catch slip."
        tryIt="set gain 100 %, slip 50 % and play through the patch."
        onApply={() => loadScenario({ route: 'turn', gain: 1, imb: 0, slip: 0.5 })}
      />
      <PredictReveal
        id="models-odo-true"
        question="Which statement is TRUE of the odometry motion model?"
        options={['It relies on proprioceptive data', 'It can be used for motion planning', 'It is used in the measurement (correction) step', 'It is typically less accurate than the velocity model']}
        answer={0}
        explain="Wheel encoders are proprioceptive sensors. It cannot plan (the data exist only after moving), it belongs to the prediction step like every motion model, and it is typically more accurate than the velocity model (2025 Q6; 2023 Q6 asks the same as a NOT question)."
        tryIt="look at the odometry input after a move: it is built from the encoders."
        onApply={() => loadScenario({ to: 4 })}
      />
    </section>
  );

  return (
    <div className="models-sim">
      <div className="models-layout">
        <div className="models-left">{world}</div>
        <div className="models-right">
          {stepPanel}
          {controls}
          {predictions}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <CompareTable />
      </div>
      <More label="How the simulation works">
        <Rich
          text={`- Each command $(v, \\omega)$ becomes wheel speeds $v_{r,l} = v \\pm \\omega b/2$ ($b$ = ${'0.3'} m). The motors deliver gain × (1 ∓ imbalance) of each, with 1.5 % random jitter; that wheel motion is what the encoders measure.
- The encoder poses give $\\delta_{rot1} = \\operatorname{atan2}(\\bar y' - \\bar y, \\bar x' - \\bar x) - \\bar\\theta$, $\\delta_{trans} = \\sqrt{(\\bar x' - \\bar x)^2 + (\\bar y' - \\bar y)^2}$, $\\delta_{rot2} = \\bar\\theta' - \\bar\\theta - \\delta_{rot1}$ (Thrun Table 5.6). A move under 1 cm is treated as a pure rotation.
- On the wet patch the ground moves $(1 - \\text{slip})$ times the wheel motion. The encoders cannot tell.
- Both clouds start at the true start and are never corrected (dead reckoning), so they only grow. Velocity samples: Thrun Table 5.3; odometry samples: Table 5.6. Both use similar noise, so the difference you see is bias, not spread.`}
        />
      </More>
    </div>
  );
}
