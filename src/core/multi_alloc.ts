// Multi-robot task allocation (summary notes §9): N robots must visit M task sites in an arena.
//
// EXPLICIT coordination: a simple auction over a lossy network. An idle robot calls for bids on the nearest task it
// believes open (one message to each teammate); idle teammates bid their travel distance (one message each),
// teammates that know better reply "already claimed / done"; the caller awards the task to the lowest bid and
// broadcasts the award; the finisher broadcasts "done". Every message is lost independently with probability
// `dropout`. Lost messages cause stale claims (a winner that never heard it won), duplicated work (a robot that
// never heard of a claim or a completion) and worse allocations (lost bids). Claims expire after a deadline.
//
// IMPLICIT coordination: no messages. Each robot sees teammates and task sites within `senseRange` and assumes
// the convention "every open task is taken by the robot nearest to it": it runs that greedy assignment over what
// it can see and heads for the task the convention gives itself. Out-of-view teammates and completions it did not
// witness make its inferences wrong now and then (two robots heading for one task, trips to finished tasks).
//
// Units: metres, seconds. Deterministic for a given seed. Pure module, no React.

import { mulberry32 } from '../engine/rng';

export type CoordMode = 'explicit' | 'implicit';

export interface AllocParams {
  nRobots: number;
  nTasks: number;
  mode: CoordMode;
  /** Probability that any single message is lost (explicit only). */
  dropout: number;
  /** How far a robot can see teammates and task sites, m (implicit only). */
  senseRange: number;
  /** Layout seed (task and robot positions) and message-loss seed. */
  seed: number;
  width?: number;
  height?: number;
  /** m/s */
  speed?: number;
  /** Time spent working at a task site, s. */
  serviceTime?: number;
  dt?: number;
  maxTime?: number;
}

export const ARENA_W = 12;
export const ARENA_H = 8;
export const MAX_ROBOTS = 12;
export const MAX_TASKS = 20;

export type AllocEventKind = 'auction' | 'award' | 'award-lost' | 'claimed-reply' | 'done' | 'done-lost' | 'duplicate' | 'stale' | 'yield' | 'switch';

export interface AllocEvent {
  t: number;
  kind: AllocEventKind;
  robot: number;
  task: number;
  /** Another robot involved (winner, the robot that already did it …), or −1. */
  other: number;
  text: string;
}

/** One message on the network, for drawing. */
export interface Msg {
  t: number;
  from: number;
  to: number;
  delivered: boolean;
  kind: 'call' | 'bid' | 'reply' | 'award' | 'done';
}

export interface AllocMetrics {
  done: number;
  /** Trips that ended because another robot had already done (or was doing) the task. */
  duplicates: number;
  totalDist: number;
  /** Distance that did not lead to a task this robot completed. */
  wastedDist: number;
  messages: number;
  lost: number;
  /** Time when the last task was finished (or the time limit). */
  makespan: number;
  /** Robot-seconds spent idle while unfinished tasks remained. */
  idle: number;
  finished: boolean;
}

export interface AllocTrace {
  params: Required<AllocParams>;
  tasks: { x: number; y: number }[];
  /** Number of recorded frames (one per tick, frame 0 = start). */
  frames: number;
  dt: number;
  /** x, y per robot per frame: pos[(f * N + i) * 2]. */
  pos: Float32Array;
  /** Target task per robot per frame (−1 none). */
  target: Int16Array;
  /** 1 while the robot is working at its task site. */
  serving: Uint8Array;
  /** Time each task was completed (Infinity if never) and by whom. */
  doneAt: Float64Array;
  doneBy: Int16Array;
  events: AllocEvent[];
  msgs: Msg[];
  /** Cumulative counters per frame: messages, lost, duplicates, wasted distance, total distance. */
  cumMsgs: Int32Array;
  cumLost: Int32Array;
  cumDup: Int16Array;
  cumWaste: Float32Array;
  cumDist: Float32Array;
  metrics: AllocMetrics;
}

const OPEN = -1;
const DONE = -2;

interface Robot {
  x: number;
  y: number;
  target: number;
  /** Time the current service ends (when serving). */
  serveEnd: number;
  serving: boolean;
  legDist: number;
  /** Explicit: what this robot believes about each task (OPEN, DONE or the claimant). */
  belief: Int16Array;
  /** Explicit: when a heard claim expires. */
  deadline: Float64Array;
}

/** Fixed layout for a seed: task sites and robot start positions (the first N of MAX_ROBOTS), well spread. */
export function allocLayout(seed: number, nTasks: number, w = ARENA_W, h = ARENA_H): { tasks: { x: number; y: number }[]; robots: { x: number; y: number }[] } {
  const rand = mulberry32(seed * 2654435761 + 17);
  const pts: { x: number; y: number }[] = [];
  const place = (minSep: number, margin: number) => {
    for (let k = 0; k < 400; k++) {
      const p = { x: margin + rand() * (w - 2 * margin), y: margin + rand() * (h - 2 * margin) };
      if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minSep) || k === 399) {
        pts.push(p);
        return p;
      }
    }
    return pts[pts.length - 1];
  };
  const robots: { x: number; y: number }[] = [];
  for (let i = 0; i < MAX_ROBOTS; i++) robots.push(place(1.3, 0.5));
  const tasks: { x: number; y: number }[] = [];
  for (let k = 0; k < MAX_TASKS; k++) tasks.push(place(1.0, 0.6));
  return { tasks: tasks.slice(0, nTasks), robots };
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Run the allocation simulation to completion (or the time limit) and record every frame. */
export function simulateAllocation(input: AllocParams): AllocTrace {
  const P: Required<AllocParams> = {
    width: ARENA_W,
    height: ARENA_H,
    speed: 1,
    serviceTime: 1,
    dt: 0.1,
    maxTime: 150,
    ...input,
    nRobots: Math.max(1, Math.min(MAX_ROBOTS, Math.round(input.nRobots))),
    nTasks: Math.max(1, Math.min(MAX_TASKS, Math.round(input.nTasks))),
  };
  const N = P.nRobots;
  const M = P.nTasks;
  const layout = allocLayout(P.seed, M, P.width, P.height);
  const tasks = layout.tasks;
  const lossRand = mulberry32(P.seed * 7919 + Math.round(P.dropout * 1000) * 31 + N * 101 + (P.mode === 'explicit' ? 1 : 2));
  const robots: Robot[] = layout.robots.slice(0, N).map((p) => ({
    x: p.x,
    y: p.y,
    target: -1,
    serveEnd: 0,
    serving: false,
    legDist: 0,
    belief: new Int16Array(M).fill(OPEN),
    deadline: new Float64Array(M),
  }));
  const doneAt = new Float64Array(M).fill(Infinity);
  const doneBy = new Int16Array(M).fill(-1);
  /** Robot currently working at each task (−1 none). */
  const servedBy = new Int16Array(M).fill(-1);
  const maxFrames = Math.ceil(P.maxTime / P.dt) + 1;
  const pos = new Float32Array(maxFrames * N * 2);
  const target = new Int16Array(maxFrames * N).fill(-1);
  const serving = new Uint8Array(maxFrames * N);
  const cumMsgs = new Int32Array(maxFrames);
  const cumLost = new Int32Array(maxFrames);
  const cumDup = new Int16Array(maxFrames);
  const cumWaste = new Float32Array(maxFrames);
  const cumDist = new Float32Array(maxFrames);
  const events: AllocEvent[] = [];
  const msgs: Msg[] = [];
  let messages = 0;
  let lost = 0;
  let duplicates = 0;
  let wasted = 0;
  let total = 0;
  let idle = 0;
  let nDone = 0;
  let t = 0;
  const R = (i: number) => `R${i + 1}`;
  const T = (k: number) => `T${k + 1}`;
  const ev = (kind: AllocEventKind, robot: number, task: number, other: number, text: string) => events.push({ t, kind, robot, task, other, text });

  /** Send one message; returns whether it arrived. */
  const send = (from: number, to: number, kind: Msg['kind']): boolean => {
    messages++;
    const ok = P.dropout <= 0 ? true : lossRand() >= P.dropout;
    if (!ok) lost++;
    msgs.push({ t, from, to, delivered: ok, kind });
    return ok;
  };
  const hearClaim = (j: number, task: number, claimant: number, d: number) => {
    const rb = robots[j];
    if (rb.belief[task] === DONE) return;
    rb.belief[task] = claimant;
    rb.deadline[task] = t + (1.5 * d) / P.speed + P.serviceTime + 4;
  };
  /** The task counts as open for robot i (never claimed, or the claim has expired). */
  const looksOpen = (i: number, k: number) => {
    const b = robots[i].belief[k];
    return b === OPEN || (b >= 0 && b !== i && t > robots[i].deadline[k]);
  };
  const giveUp = (i: number, why: 'duplicate' | 'yield' | 'switch', other: number) => {
    const rb = robots[i];
    const k = rb.target;
    wasted += rb.legDist;
    if (why === 'duplicate') duplicates++;
    rb.legDist = 0;
    rb.target = -1;
    return k;
  };

  const record = (f: number) => {
    for (let i = 0; i < N; i++) {
      pos[(f * N + i) * 2] = robots[i].x;
      pos[(f * N + i) * 2 + 1] = robots[i].y;
      target[f * N + i] = robots[i].target;
      serving[f * N + i] = robots[i].serving ? 1 : 0;
    }
    cumMsgs[f] = messages;
    cumLost[f] = lost;
    cumDup[f] = duplicates;
    cumWaste[f] = wasted;
    cumDist[f] = total;
  };

  // ---------------------------------------------------------------- explicit: auctions by idle robots
  const explicitDecide = () => {
    for (let i = 0; i < N; i++) {
      const rb = robots[i];
      if (rb.serving || rb.target >= 0) continue;
      // Nearest task this robot believes is open; a claim on itself that it missed counts as its own.
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < M; k++) {
        if (!looksOpen(i, k)) continue;
        const d = dist(rb.x, rb.y, tasks[k].x, tasks[k].y);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best < 0) continue;
      const k = best;
      if (rb.belief[k] >= 0 && rb.belief[k] !== i) ev('stale', i, k, rb.belief[k], `${R(i)} heard ${T(k)} was claimed by ${R(rb.belief[k])}, but no “done” came in time: the claim looks stale, so ${R(i)} re-auctions it`);
      // 1. Call for bids.
      const bids: { j: number; d: number }[] = [{ j: i, d: bd }];
      let blocked: { by: number; state: number } | null = null;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        if (!send(i, j, 'call')) continue;
        const rj = robots[j];
        const bj = rj.belief[k];
        if (bj === DONE || (bj >= 0 && bj !== j && !looksOpen(j, k)) || rj.target === k) {
          // j knows better: the task is finished or already claimed (by j itself if it is heading there).
          const state = bj === DONE ? DONE : rj.target === k ? j : bj;
          if (send(j, i, 'reply') && !blocked) blocked = { by: j, state };
          continue;
        }
        if (!rj.serving && rj.target < 0) {
          const d = dist(rj.x, rj.y, tasks[k].x, tasks[k].y);
          if (send(j, i, 'bid')) bids.push({ j, d });
        }
      }
      ev('auction', i, k, -1, `${R(i)} calls for bids on ${T(k)} (${N - 1} messages)`);
      if (blocked) {
        if (blocked.state === DONE) {
          rb.belief[k] = DONE;
          ev('claimed-reply', i, k, blocked.by, `${R(blocked.by)} replies: ${T(k)} is already done`);
        } else if (blocked.state === i) {
          // Teammates say i itself won this task earlier (i missed the award): take it now.
          rb.belief[k] = i;
          rb.target = k;
          rb.legDist = 0;
          ev('claimed-reply', i, k, blocked.by, `${R(blocked.by)} replies: ${T(k)} was awarded to ${R(i)}, so ${R(i)} goes`);
        } else {
          hearClaim(i, k, blocked.state, dist(robots[blocked.state].x, robots[blocked.state].y, tasks[k].x, tasks[k].y));
          ev('claimed-reply', i, k, blocked.by, `${R(blocked.by)} replies: ${T(k)} is claimed by ${R(blocked.state)}`);
        }
        continue;
      }
      // 2. Award to the lowest bid heard (ties to the lower id).
      bids.sort((a, b) => a.d - b.d || a.j - b.j);
      const win = bids[0];
      rb.belief[k] = win.j;
      rb.deadline[k] = t + (1.5 * win.d) / P.speed + P.serviceTime + 4;
      let winnerHeard = win.j === i;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        if (send(i, j, 'award')) {
          hearClaim(j, k, win.j, win.d);
          if (j === win.j) winnerHeard = true;
        }
      }
      if (winnerHeard) {
        const w = robots[win.j];
        w.target = k;
        w.legDist = 0;
        w.belief[k] = win.j;
        ev('award', i, k, win.j, `${T(k)} awarded to ${R(win.j)} (bid ${win.d.toFixed(1)} m, ${bids.length} bid${bids.length === 1 ? '' : 's'} heard)`);
      } else ev('award-lost', i, k, win.j, `${R(win.j)} won ${T(k)} but the award message was lost: a stale claim`);
    }
  };

  // ---------------------------------------------------------------- implicit: infer from what you can see
  const implicitDecide = () => {
    for (let i = 0; i < N; i++) {
      const rb = robots[i];
      if (rb.serving) continue;
      // What i sees: tasks within range update its belief (finished or not).
      for (let k = 0; k < M; k++) {
        if (dist(rb.x, rb.y, tasks[k].x, tasks[k].y) <= P.senseRange && (doneBy[k] >= 0 || servedBy[k] >= 0)) rb.belief[k] = DONE;
      }
      if (rb.target >= 0 && rb.belief[rb.target] === DONE) {
        const k = giveUp(i, 'duplicate', doneBy[rb.target]);
        ev('duplicate', i, k, doneBy[k] >= 0 ? doneBy[k] : servedBy[k], `${R(i)} sees ${T(k)} already taken care of: a wasted trip`);
      }
      const visible: number[] = [];
      for (let j = 0; j < N; j++) if (j === i || (!robots[j].serving && dist(rb.x, rb.y, robots[j].x, robots[j].y) <= P.senseRange)) visible.push(j);
      const open: number[] = [];
      for (let k = 0; k < M; k++) if (rb.belief[k] !== DONE) open.push(k);
      // Greedy "nearest robot takes it" assignment over what i sees.
      const pairs: { j: number; k: number; d: number }[] = [];
      for (const j of visible) for (const k of open) pairs.push({ j, k, d: dist(robots[j].x, robots[j].y, tasks[k].x, tasks[k].y) });
      pairs.sort((a, b) => a.d - b.d || a.j - b.j || a.k - b.k);
      const usedR = new Set<number>();
      const usedT = new Set<number>();
      let mine = -1;
      for (const p of pairs) {
        if (usedR.has(p.j) || usedT.has(p.k)) continue;
        usedR.add(p.j);
        usedT.add(p.k);
        if (p.j === i) {
          mine = p.k;
          break;
        }
      }
      if (mine !== rb.target) {
        if (rb.target >= 0) {
          const k = giveUp(i, 'yield', -1);
          ev('yield', i, k, -1, `${R(i)} now sees a teammate nearer to ${T(k)} and leaves it to them`);
        }
        rb.target = mine;
        rb.legDist = 0;
      }
    }
  };

  // ---------------------------------------------------------------- movement and service
  const moveAll = () => {
    for (let i = 0; i < N; i++) {
      const rb = robots[i];
      if (rb.serving) {
        if (t >= rb.serveEnd - 1e-9) {
          const k = rb.target;
          rb.serving = false;
          servedBy[k] = -1;
          doneAt[k] = t;
          doneBy[k] = i;
          nDone++;
          rb.belief[k] = DONE;
          rb.legDist = 0;
          rb.target = -1;
          if (P.mode === 'explicit') {
            let heard = 0;
            for (let j = 0; j < N; j++) {
              if (j === i) continue;
              if (send(i, j, 'done')) {
                robots[j].belief[k] = DONE;
                heard++;
              }
            }
            ev(heard === N - 1 ? 'done' : 'done-lost', i, k, -1, heard === N - 1 ? `${R(i)} finished ${T(k)} and tells everyone` : `${R(i)} finished ${T(k)}; ${N - 1 - heard} of ${N - 1} teammates missed the message`);
          } else ev('done', i, k, -1, `${R(i)} finished ${T(k)}`);
        }
        continue;
      }
      const k = rb.target;
      if (k < 0) {
        if (nDone < M) idle += P.dt;
        continue;
      }
      // Explicit robots drop a target they have heard is finished by someone else.
      if (P.mode === 'explicit' && rb.belief[k] === DONE) {
        giveUp(i, 'duplicate', doneBy[k]);
        ev('duplicate', i, k, doneBy[k], `${R(i)} hears ${T(k)} was finished by ${R(Math.max(0, doneBy[k]))} while on the way: wasted effort`);
        continue;
      }
      const tx = tasks[k].x;
      const ty = tasks[k].y;
      const d = dist(rb.x, rb.y, tx, ty);
      const step = P.speed * P.dt;
      if (d <= step + 1e-9) {
        rb.x = tx;
        rb.y = ty;
        rb.legDist += d;
        total += d;
        if (doneBy[k] >= 0 || (servedBy[k] >= 0 && servedBy[k] !== i)) {
          const other = doneBy[k] >= 0 ? doneBy[k] : servedBy[k];
          rb.belief[k] = DONE;
          giveUp(i, 'duplicate', other);
          ev('duplicate', i, k, other, `${R(i)} arrives at ${T(k)} but ${R(other)} ${doneBy[k] >= 0 ? 'already did it' : 'is already working there'}: duplicated work`);
        } else {
          rb.serving = true;
          rb.serveEnd = t + P.serviceTime;
          servedBy[k] = i;
        }
      } else {
        rb.x += ((tx - rb.x) / d) * step;
        rb.y += ((ty - rb.y) / d) * step;
        rb.legDist += step;
        total += step;
      }
    }
  };

  record(0);
  let f = 0;
  while (f < maxFrames - 1 && nDone < M) {
    if (P.mode === 'explicit') explicitDecide();
    else implicitDecide();
    t = Number(((f + 1) * P.dt).toFixed(6));
    moveAll();
    f++;
    record(f);
  }
  const frames = f + 1;
  return {
    params: P,
    tasks,
    frames,
    dt: P.dt,
    pos: pos.slice(0, frames * N * 2),
    target: target.slice(0, frames * N),
    serving: serving.slice(0, frames * N),
    doneAt,
    doneBy,
    events,
    msgs,
    cumMsgs: cumMsgs.slice(0, frames),
    cumLost: cumLost.slice(0, frames),
    cumDup: cumDup.slice(0, frames),
    cumWaste: cumWaste.slice(0, frames),
    cumDist: cumDist.slice(0, frames),
    metrics: { done: nDone, duplicates, totalDist: total, wastedDist: wasted, messages, lost, makespan: t, idle, finished: nDone === M },
  };
}

/** Mean metrics over several layouts (for the team-size and dropout sweeps). */
export function meanMetrics(base: Omit<AllocParams, 'seed'>, seeds: readonly number[]): AllocMetrics {
  const acc: AllocMetrics = { done: 0, duplicates: 0, totalDist: 0, wastedDist: 0, messages: 0, lost: 0, makespan: 0, idle: 0, finished: true };
  for (const seed of seeds) {
    const m = simulateAllocation({ ...base, seed }).metrics;
    acc.done += m.done;
    acc.duplicates += m.duplicates;
    acc.totalDist += m.totalDist;
    acc.wastedDist += m.wastedDist;
    acc.messages += m.messages;
    acc.lost += m.lost;
    acc.makespan += m.makespan;
    acc.idle += m.idle;
    acc.finished = acc.finished && m.finished;
  }
  const n = seeds.length;
  return { ...acc, done: acc.done / n, duplicates: acc.duplicates / n, totalDist: acc.totalDist / n, wastedDist: acc.wastedDist / n, messages: acc.messages / n, lost: acc.lost / n, makespan: acc.makespan / n, idle: acc.idle / n };
}
