// Self-tests for the engines behind the local-planning simulations (explore/localField.ts, localDwa.ts,
// localVo.ts): every behaviour a simulation shows or a predict-then-reveal promises is checked here.
import type { CheckResult, SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { descend, potential, type FieldParams } from '../../../core/local';
import { distPointSeg, pointInPoly, type Vec2 } from '../../../core/geom2d';
import { mulberry32 } from '../../../engine/rng';
import { DEFAULT_FIELD, FIELD_GOAL_TOL, FIELD_PRESETS, FIELD_STEP, forceParts, lineProfile, presetById, runField, sampleField } from '../explore/localField';
import { DWA_DEFAULT, DWA_PRESETS, dwaPlan, dwaPresetById, dwaStep, initState, runDwa, staticClearance, velocityMap, type DwaCfg } from '../explore/localDwa';
import { contactTime, voChoose, voShape, type Disc } from '../explore/localVo';

const fieldOf = (id: string, extra: Partial<FieldParams> = {}): FieldParams => ({ ...DEFAULT_FIELD, ...presetById(id).params, ...extra });
const endOf = (path: Vec2[]) => path[path.length - 1];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const f2 = (x: number) => x.toFixed(2);

export const tests: SelfTest[] = [
  {
    id: 'plan-sims-field-presets',
    topic: 'plan',
    title: 'Potential field presets: open and one-obstacle reach G; the U-trap stalls without escape and is escaped by the global plan',
    source: 'Summary notes §5: potential fields can get stuck in local minima; a global planner above a local one',
    run: () => {
      const open = runField(presetById('open').scene, fieldOf('open'), 'none');
      const single = runField(presetById('single').scene, fieldOf('single'), 'none');
      const trapSc = presetById('trap').scene;
      const trap = runField(trapSc, fieldOf('trap'), 'none');
      const trapG = runField(trapSc, fieldOf('trap'), 'global');
      const trapW = runField(trapSc, fieldOf('trap'), 'walk', 7);
      const stop = endOf(trap.path);
      const fp = forceParts(stop, trapSc.goal, trapSc.obstacles, fieldOf('trap'));
      const fa = Math.hypot(fp.att.x, fp.att.y);
      const fr = Math.hypot(fp.rep.x, fp.rep.y);
      return [
        isTrue('open field: plain descent reaches G', open.status === 'goal', open.status),
        isTrue('one obstacle: plain descent slides round to G', single.status === 'goal', single.status),
        isTrue('U-trap, plain descent: local minimum', trap.status === 'local-min', trap.status),
        isTrue(`U-trap stall point (${f2(stop.x)}, ${f2(stop.y)}) is inside the U, short of its back wall (x = 6)`, stop.x > 4 && stop.x < 6 && stop.y > 3.4 && stop.y < 6.6),
        isTrue(
          `the run ends at the balance point (settled): pull ${f2(fa)}, push ${f2(fr)}, |∇U| = ${Math.hypot(fp.tot.x, fp.tot.y).toFixed(4)} < 1 % of |F_att| + |F_rep|`,
          Math.hypot(fp.tot.x, fp.tot.y) < 0.01 * (fa + fr)
        ),
        nearAbs('U-trap stall: |F_att| = ζ d* = 2 (conic pull)', fa, 2, 1e-9),
        isTrue('U-trap with the global plan: reaches G', trapG.status === 'goal' && !!trapG.plan && trapG.plan.length >= 3, `${trapG.status}, ${trapG.plan?.length ?? 0} waypoints`),
        isTrue('U-trap with random walks (seed 7, the sim’s default): reaches G after ≥ 1 walk', trapW.status === 'goal' && trapW.walks.length >= 1, `${trapW.status}, ${trapW.walks.length} walks`),
        isTrue('runs are deterministic (same seed, same path)', runField(trapSc, fieldOf('trap'), 'walk', 7).path.length === trapW.path.length),
      ];
    },
  },
  {
    id: 'plan-sims-field-predictions',
    topic: 'plan',
    title: 'Potential field predictions: ζ × 4 still stalls (deeper); Q* closes the gap; goal next to a wall; a disc dead ahead is a saddle',
    run: () => {
      const trapSc = presetById('trap').scene;
      const t1 = endOf(runField(trapSc, fieldOf('trap'), 'none').path);
      const r4 = runField(trapSc, fieldOf('trap', { kAtt: 4 }), 'none');
      const gapSc = presetById('gap').scene;
      const g06 = runField(gapSc, fieldOf('gap', { d0: 0.6 }), 'none');
      const g15 = runField(gapSc, fieldOf('gap', { d0: 1.5 }), 'none');
      const nearSc = presetById('near').scene;
      const n15 = runField(nearSc, fieldOf('near'), 'none');
      const n03 = runField(nearSc, fieldOf('near', { d0: 0.3 }), 'none');
      const head = { start: { x: 1.5, y: 5 }, goal: { x: 8.5, y: 5 }, obstacles: [{ kind: 'circle' as const, x: 5, y: 5, r: 1 }] };
      const h = runField(head, { ...DEFAULT_FIELD }, 'none');
      const hs = endOf(h.path);
      const nudged = descend({ x: hs.x, y: hs.y + 0.15 }, head.goal, head.obstacles, DEFAULT_FIELD, { step: FIELD_STEP, maxIter: 2500, goalTol: FIELD_GOAL_TOL });
      const trapNudge = descend({ x: t1.x, y: t1.y + 0.15 }, trapSc.goal, trapSc.obstacles, DEFAULT_FIELD, { step: FIELD_STEP, maxIter: 2500, goalTol: FIELD_GOAL_TOL });
      // The verdict quotes |F_att| and |F_rep| at the stop as "equal and opposite": true at every stall the sim shows.
      const balanced = ([
        ['ζ = 4', r4, trapSc, fieldOf('trap', { kAtt: 4 })],
        ['gap, Q* = 1.5', g15, gapSc, fieldOf('gap', { d0: 1.5 })],
        ['goal by a wall', n15, nearSc, fieldOf('near')],
        ['disc dead ahead', h, head, { ...DEFAULT_FIELD }],
      ] as const).map(([name, r, sc, f]) => {
        const fp = forceParts(endOf(r.path), sc.goal, sc.obstacles, f);
        const fa = Math.hypot(fp.att.x, fp.att.y);
        const fr = Math.hypot(fp.rep.x, fp.rep.y);
        const ft = Math.hypot(fp.tot.x, fp.tot.y);
        return isTrue(`${name}: at the stop |F_att| = ${f2(fa)}, |F_rep| = ${f2(fr)}, |∇U| = ${ft.toFixed(4)} (< 1 % of their sum)`, ft < 0.01 * (fa + fr));
      });
      return [
        ...balanced,
        isTrue('U-trap, ζ = 4: still a local minimum', r4.status === 'local-min', r4.status),
        isTrue(`… and deeper in the U (x ${f2(endOf(r4.path).x)} > ${f2(t1.x)})`, endOf(r4.path).x > t1.x + 0.05),
        isTrue('narrow gap, Q* = 0.6 m (< half the 1 m gap): passes to G', g06.status === 'goal', g06.status),
        isTrue('narrow gap, Q* = 1.5 m: stops in front of the gap', g15.status === 'local-min' && endOf(g15.path).x < 4.6, `${g15.status} at x = ${f2(endOf(g15.path).x)}`),
        isTrue(`goal 0.4 m from a wall, Q* = 1.5 m: stalls ${f2(dist(endOf(n15.path), nearSc.goal))} m short of G`, n15.status === 'local-min' && dist(endOf(n15.path), nearSc.goal) > 0.3),
        isTrue('goal next to the wall, Q* = 0.3 m: reaches G', n03.status === 'goal', n03.status),
        isTrue('disc dead ahead: plain descent stops in front of it', h.status === 'local-min' && hs.x < 4, `${h.status} at x = ${f2(hs.x)}`),
        isTrue('… but it is a saddle: a 15 cm sideways nudge slides round to G', nudged.status === 'goal', nudged.status),
        isTrue('the U-trap is a real dip: the same nudge stays trapped', trapNudge.status !== 'goal', trapNudge.status),
      ];
    },
  },
  {
    id: 'plan-sims-field-descent',
    topic: 'plan',
    title: 'Plain descent never climbs: U is non-increasing along every preset’s path (tiny jitter at a stall allowed); field and profiles finite outside obstacles',
    run: () => {
      const out: CheckResult[] = [];
      for (const pr of FIELD_PRESETS) {
        const f = fieldOf(pr.id);
        const r = runField(pr.scene, f, 'none');
        let rise = 0;
        let prev = Infinity;
        for (const p of r.path) {
          const u = potential(p, pr.scene.goal, pr.scene.obstacles, f);
          if (u > prev) rise = Math.max(rise, (u - prev) / Math.max(prev, 1e-9));
          prev = u;
        }
        out.push(isTrue(`${pr.id}: largest step-to-step rise of U is ${(rise * 100).toFixed(2)} % (< 2 %)`, rise < 0.02));
      }
      const sc = presetById('trap').scene;
      const U = sampleField(sc.goal, sc.obstacles, DEFAULT_FIELD, 60);
      let inf = 0;
      let fin = 0;
      for (const u of U) Number.isFinite(u) ? fin++ : inf++;
      const lp = lineProfile(sc, DEFAULT_FIELD);
      out.push(isTrue(`sampleField: ${inf} cells inside the U’s walls are ∞, ${fin} finite, none NaN`, inf > 0 && fin > 3000 && !Array.from(U).some((u) => Number.isNaN(u))));
      out.push(isTrue(`line profile S → G crosses the back wall (${lp.inside.length} inside range)`, lp.inside.length === 1 && lp.inside[0][0] > 4 && lp.inside[0][1] < 5));
      out.push(nearAbs('line profile ends at G with U = 0', lp.U[lp.U.length - 1], 0, 1e-12));
      return out;
    },
  },
  {
    id: 'plan-sims-dwa-runs',
    topic: 'plan',
    title: 'DWA presets: obstacle ahead, doorway and crossing pedestrian reach G without touching anything; the U-trap is stuck without a plan and reaches G with one',
    source: 'Summary notes §5 (dynamic window approach; a global planner above a local one)',
    run: () => {
      const out: CheckResult[] = [];
      for (const id of ['open', 'gap', 'cross']) {
        const p = dwaPresetById(id);
        const r = runDwa(p.world, p.start, p.goal, { ...DWA_DEFAULT, ...p.cfg }, 60);
        out.push(isTrue(`${id}: reaches G in ${f2(r.state.t)} s, closest static clearance ${f2(r.minClear)} m > 0`, r.state.status === 'goal' && r.minClear > 0, r.state.status));
      }
      const t = dwaPresetById('trap');
      const noPlan = runDwa(t.world, t.start, t.goal, { ...DWA_DEFAULT }, 60, false);
      const withPlan = runDwa(t.world, t.start, t.goal, { ...DWA_DEFAULT }, 60, true);
      out.push(isTrue(`U-trap without a plan: stuck at (${f2(noPlan.state.pose.x)}, ${f2(noPlan.state.pose.y)}), inside the U`, noPlan.state.status === 'stuck' && noPlan.state.pose.x > 4 && noPlan.state.pose.x < 6, noPlan.state.status));
      out.push(isTrue(`U-trap with the global plan: reaches G in ${f2(withPlan.state.t)} s`, withPlan.state.status === 'goal', withPlan.state.status));
      out.push(isTrue('the U-trap plan goes round the U (a waypoint above y = 5.2 or below y = 1.8)', (dwaPlan(t.world, t.start, t.goal, DWA_DEFAULT)?.pts ?? []).some((q) => q.y > 5.2 || q.y < 1.8)));
      return out;
    },
  },
  {
    id: 'plan-sims-dwa-admissible',
    topic: 'plan',
    title: 'DWA never executes an inadmissible velocity: every cycle drives the best admissible sample (inside the window) or brakes',
    run: () => {
      let cycles = 0;
      let bad = '';
      let braked = 0;
      let rejected = 0;
      const cfgs: Partial<DwaCfg>[] = [{}, { wClear: 0, wVel: 0.6 }, { aMax: 0.4 }, { horizon: 2 }, { vMax: 1.6, wHeading: 0.3 }];
      for (const p of DWA_PRESETS)
        for (const extra of cfgs)
          for (const usePlan of [false, true]) {
            const cfg = { ...DWA_DEFAULT, ...p.cfg, ...extra };
            const plan = usePlan ? dwaPlan(p.world, p.start, p.goal, cfg) : null;
            let s = initState(p.start, p.goal);
            while (s.status === 'running' && s.t < 25 && !bad) {
              const { next, ev } = dwaStep(s, p.world, p.goal, cfg, plan);
              cycles++;
              rejected += ev.cands.filter((c) => !c.admissible).length;
              const tag = `${p.id} ${JSON.stringify(extra)} t=${f2(s.t)}`;
              if (ev.best && !ev.best.admissible) bad = `${tag}: best is inadmissible`;
              if (ev.best && ev.cands.some((c) => c.admissible && c.score > ev.best!.score + 1e-9)) bad = `${tag}: a better admissible sample was skipped`;
              if (next.status === 'running') {
                const v = ev.best ? ev.best.v : ev.window.v0;
                if (Math.abs(next.v - v) > 1e-12) bad = `${tag}: executed v ${next.v} is not the chosen ${v}`;
                if (next.v < ev.window.v0 - 1e-9 || next.v > ev.window.v1 + 1e-9 || next.w < ev.window.w0 - 1e-9 || next.w > ev.window.w1 + 1e-9) bad = `${tag}: executed (v, ω) outside the window`;
                if (!ev.best) braked++;
              }
              if (staticClearance(next.pose, p.world, cfg.radius) <= 0) bad = `${tag}: touched a static obstacle`;
              s = next;
            }
          }
      return [isTrue(`${cycles} cycles over every preset × 5 settings × plan on/off (${rejected} samples rejected, ${braked} braking cycles)`, !bad && cycles > 500 && rejected > 1000, bad)];
    },
  },
  {
    id: 'plan-sims-dwa-predictions',
    topic: 'plan',
    title: 'DWA predictions: w_c = 0 with w_v = 0.6 stalls in front of the obstacle without touching it; w_v = 0 never moves; the pedestrian makes it slow down',
    run: () => {
      const p = dwaPresetById('open');
      const speedy = runDwa(p.world, p.start, p.goal, { ...DWA_DEFAULT, wClear: 0, wVel: 0.6 }, 30);
      const lazy = runDwa(p.world, p.start, p.goal, { ...DWA_DEFAULT, wVel: 0 }, 30);
      const moved = Math.max(...lazy.poses.map((q) => dist(q, p.start)));
      const c = dwaPresetById('cross');
      let s = initState(c.start, c.goal);
      let minV = Infinity;
      let movingRejected = 0;
      let maxBefore = 0;
      while (s.status === 'running' && s.t < 20) {
        const { next, ev } = dwaStep(s, c.world, c.goal, { ...DWA_DEFAULT });
        movingRejected += ev.cands.filter((k) => k.reason === 'moving').length;
        if (s.t < 2.5) maxBefore = Math.max(maxBefore, next.v);
        if (s.t > 2.5 && s.t < 5) minV = Math.min(minV, next.v);
        s = next;
      }
      // A head-on obstacle right in front of a fast robot: the straight fast arcs are inadmissible.
      const vm = velocityMap(p.world, { x: 3.4, y: 3.4, theta: 0 }, DWA_DEFAULT, 10, 21);
      const fastStraight = vm[9 * 21 + 10];
      const slowStraight = vm[0 * 21 + 10];
      return [
        isTrue(`w_c = 0, w_v = 0.6: stuck at x = ${f2(speedy.state.pose.x)} m in front of the obstacle`, speedy.state.status === 'stuck' && speedy.state.pose.x < 4, speedy.state.status),
        isTrue(`… without touching it (closest clearance ${f2(speedy.minClear)} m)`, speedy.minClear > 0),
        isTrue(`w_v = 0: the robot never leaves the start (moved ${(moved * 100).toFixed(1)} cm), status ${lazy.state.status}`, moved < 0.01 && lazy.state.status === 'stuck'),
        isTrue(`crossing pedestrian: cruising at ${f2(maxBefore)} m/s, slows to ${f2(minV)} m/s while it crosses`, maxBefore > 0.95 && minV < 0.7),
        isTrue(`crossing pedestrian: ${movingRejected} samples rejected as meeting it`, movingRejected > 50),
        isTrue('velocity map 0.6 m in front of the obstacle: fast straight is "cannot stop", crawling straight is admissible', fastStraight === 1 && slowStraight === 0, `${fastStraight}, ${slowStraight}`),
      ];
    },
  },
  {
    id: 'plan-sims-vo',
    topic: 'plan',
    title: 'Velocity obstacles: head-on contact time, misses, τ cut-off; the drawn cone agrees with contactTime; voChoose leaves the cone',
    source: 'Fiorini & Shiller (1998); review deck learning outcomes (velocity obstacles)',
    run: () => {
      const A = { x: 0, y: 0 };
      const B: Disc = { p: { x: 5, y: 0 }, r: 0.5, v: { x: -1, y: 0 } };
      const out: CheckResult[] = [
        // gap 5 − 1 = 4 m closing at 1 + 1 = 2 m/s
        near('head-on, 1 m/s each, radii 0.5, 5 m apart: contact at t = 2 s', contactTime(A, 0.5, { x: 1, y: 0 }, B, 10) ?? NaN, 2, 1e-9),
        isTrue('… but not within τ = 1.5 s', contactTime(A, 0.5, { x: 1, y: 0 }, B, 1.5) === null),
        near('A standing still: contact when B has covered 4 m, t = 4 s', contactTime(A, 0.5, { x: 0, y: 0 }, B, 10) ?? NaN, 4, 1e-9),
        isTrue('offset by 2 m sideways: a miss (2 > r_A + r_B)', contactTime(A, 0.5, { x: 1, y: 0 }, { ...B, p: { x: 5, y: 2 } }, 10) === null),
        isTrue('moving apart: never', contactTime(A, 0.5, { x: -1, y: 0 }, { ...B, v: { x: 1, y: 0 } }, 10) === null),
        nearAbs('already overlapping: contact at t = 0', contactTime(A, 0.5, { x: 0, y: 0 }, { ...B, p: { x: 0.8, y: 0 } }, 10) ?? NaN, 0, 1e-12),
      ];
      const tau = 4;
      const shp = voShape(A, 0.5, B, tau, 8);
      out.push(nearAbs('cone apex = v_B', Math.hypot(shp.apex.x + 1, shp.apex.y), 0, 1e-12));
      out.push(nearAbs('cut-off disc centre = v_B + (p_B − p_A)/τ = (0.25, 0)', Math.hypot(shp.cut.c.x - 0.25, shp.cut.c.y), 0, 1e-12));
      out.push(nearAbs('cut-off disc radius = (r_A + r_B)/τ = 0.25', shp.cut.r, 0.25, 1e-12));
      // Every velocity well inside / well outside the drawn polygon agrees with contactTime.
      const rnd = mulberry32(42);
      let mismatch = 0;
      let inside = 0;
      let tested = 0;
      for (let k = 0; k < 3000; k++) {
        const v = { x: -2.5 + 5 * rnd(), y: -2.5 + 5 * rnd() };
        let edge = Infinity;
        for (let i = 0; i < shp.poly.length; i++) edge = Math.min(edge, distPointSeg(v, shp.poly[i], shp.poly[(i + 1) % shp.poly.length]));
        if (edge < 0.03 || Math.hypot(v.x - shp.apex.x, v.y - shp.apex.y) > 7.5) continue;
        tested++;
        const inPoly = pointInPoly(v, shp.poly);
        const hits = contactTime(A, 0.5, v, B, tau) !== null;
        if (inPoly) inside++;
        if (inPoly !== hits) mismatch++;
      }
      out.push(isTrue(`${tested} random velocities: polygon and contactTime agree (${inside} inside the cone, ${mismatch} mismatches)`, mismatch === 0 && inside > 50 && tested > 2000));
      const ch = voChoose(A, 0.5, { x: 1, y: 0 }, 1.2, [B], tau);
      out.push(isTrue(`voChoose from v_pref = (1, 0): (${f2(ch.v.x)}, ${f2(ch.v.y)}) is collision-free within τ`, ch.free && contactTime(A, 0.5, ch.v, B, tau) === null && Math.hypot(ch.v.x, ch.v.y) <= 1.2 + 1e-9));
      out.push(isTrue('a longer τ makes the cone reach closer to the apex (smaller cut-off disc)', voShape(A, 0.5, B, 8, 8).cut.r < shp.cut.r));
      return out;
    },
  },
];
