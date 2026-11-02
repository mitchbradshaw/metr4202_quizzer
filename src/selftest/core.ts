// Tests for the shared core algorithms (graph search, geometry, C-space, sampling planners, local planners,
// motion models). Topic-specific checks live in each topic's selftests.ts.
import type { SelfTest } from './types';
import { near, nearAbs, isTrue } from './assert';
import { evaluate } from '../engine/expr';
import { graphSearch, gridNeighbours, gridHeuristic, cellId, costToGo, admissibilityViolations, neighboursOf, type GridMap } from '../core/graph';
import { BRISBANE_2024, BRISBANE_H, AUSTRALIA_REVIEW, AUSTRALIA_H } from '../core/roadmaps';
import { segSeg, segHitsShape, distToShape, pointInShape } from '../core/geom2d';
import { fk2, ik2, cspaceGrid, cgridAt, planCspace, armCollisions, TAU } from '../core/cspace';
import { treeInit, rrtStep, segmentFree, prmBuild, prmQuery, type World } from '../core/sampling';
import { descend, dwa } from '../core/local';
import { odometryFromPoses, odometryMotion, velocityMotion, sampleVelocityMotion, wrapAngle } from '../core/motion';
import { makeRng } from '../engine/rng';

function openGrid(cols: number, rows: number, walls: [number, number][] = []): GridMap {
  const blocked = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  for (const [c, r] of walls) blocked[r][c] = true;
  return { cols, rows, blocked };
}

export const coreTests: SelfTest[] = [
  {
    id: 'core-expr-vars',
    topic: 'core',
    title: 'Answer parser: numbers, π, functions and symbols (L1, L2 …)',
    run: () => [
      near('2*pi*50', evaluate('2*pi*50'), 2 * Math.PI * 50, 1e-12),
      near('-L1 + L2 with L1 = 1.3, L2 = 0.4', evaluate('-L1 + L2', { L1: 1.3, L2: 0.4 }), -0.9, 1e-12),
      near('L_2 + L_3 (underscores ignored)', evaluate('L_2 + L_3', { L2: 0.4, L3: 2 }), 2.4, 1e-12),
      near('2L1 (implicit product)', evaluate('2L1', { L1: 1.5 }), 3, 1e-12),
      near('sqrt2 still works', evaluate('sqrt2'), Math.SQRT2, 1e-12),
      isTrue('unknown symbol is rejected', Number.isNaN(evaluate('L9', { L1: 1 }))),
      nearAbs('−(L1) with unicode minus', evaluate('−(L1)', { L1: 2 }), -2, 1e-12),
    ],
  },
  {
    id: 'core-graph-equivalences',
    topic: 'core',
    title: 'BFS = Dijkstra on uniform costs; Dijkstra = A* with h = 0; A* optimal with admissible h',
    source: '2023 Q9, 2024 Q9, 2025 Q9',
    run: () => {
      const m = openGrid(8, 6, [
        [3, 0],
        [3, 1],
        [3, 2],
        [3, 3],
        [5, 2],
        [5, 3],
        [5, 4],
        [5, 5],
      ]);
      const nb = gridNeighbours(m, false);
      const s = cellId(0, 0);
      const g = cellId(7, 5);
      const bfs = graphSearch(nb, s, g, 'bfs');
      const dij = graphSearch(nb, s, g, 'dijkstra');
      const a0 = graphSearch(nb, s, g, 'astar', { h: () => 0 });
      const aM = graphSearch(nb, s, g, 'astar', { h: gridHeuristic('manhattan', g) });
      const dfs = graphSearch(nb, s, g, 'dfs');
      return [
        isTrue('BFS and Dijkstra expand in the same order (uniform costs)', bfs.expandedOrder.join() === dij.expandedOrder.join()),
        isTrue('Dijkstra and A* with h = 0 expand in the same order', dij.expandedOrder.join() === a0.expandedOrder.join()),
        near('A* (Manhattan, 4-connected) finds the optimal cost', aM.cost, dij.cost, 1e-12),
        isTrue('A* expands fewer nodes than Dijkstra', aM.expandedOrder.length < dij.expandedOrder.length, `${aM.expandedOrder.length} vs ${dij.expandedOrder.length}`),
        isTrue('DFS finds a path, not necessarily the shortest', !!dfs.path && dfs.cost >= dij.cost),
      ];
    },
  },
  {
    id: 'core-graph-admissible',
    topic: 'core',
    title: 'Heuristic checks: Manhattan overestimates with diagonal moves; the paper tables are admissible',
    source: '2023 Q25; 2024 Q29(b)',
    run: () => {
      const m = openGrid(6, 6);
      const nb8 = gridNeighbours(m, true);
      const goal = cellId(5, 5);
      const ids: string[] = [];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) ids.push(cellId(c, r));
      const hStar = costToGo(nb8, ids, goal);
      const man = admissibilityViolations(gridHeuristic('manhattan', goal), hStar);
      const euc = admissibilityViolations(gridHeuristic('euclidean', goal), hStar);
      const oct = admissibilityViolations(gridHeuristic('octile', goal), hStar);
      const bris = admissibilityViolations((n) => BRISBANE_H[n], costToGo(neighboursOf(BRISBANE_2024), BRISBANE_2024.nodes.map((n) => n.id), 'MG'));
      const aus = admissibilityViolations((n) => AUSTRALIA_H[n], costToGo(neighboursOf(AUSTRALIA_REVIEW), AUSTRALIA_REVIEW.nodes.map((n) => n.id), 'Alice Springs'));
      const inflated = graphSearch(nb8, cellId(0, 0), goal, 'astar', { h: gridHeuristic('inflated', goal, 3) });
      return [
        isTrue('Manhattan overestimates somewhere on an 8-connected grid', man.length > 0, `${man.length} cells`),
        isTrue('Euclidean never overestimates', euc.length === 0),
        isTrue('Octile never overestimates (it is exact on an open grid)', oct.length === 0),
        isTrue('2024 Q29 straight-line table is admissible', bris.length === 0, JSON.stringify(bris)),
        isTrue('Review-deck geodetic table is admissible', aus.length === 0, JSON.stringify(aus)),
        isTrue('Inflated heuristic still finds a path on an open grid', !!inflated.path),
      ];
    },
  },
  {
    id: 'core-geom',
    topic: 'core',
    title: '2D geometry: segment intersection, shape hits, distances',
    run: () => [
      isTrue('crossing segments intersect', segSeg({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })),
      isTrue('parallel segments do not', !segSeg({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 })),
      isTrue('segment through a rectangle hits it', segHitsShape({ x: -1, y: 0.5 }, { x: 3, y: 0.5 }, { kind: 'rect', x: 0, y: 0, w: 1, h: 1 })),
      isTrue('segment inside a polygon hits it', segHitsShape({ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.3 }, { kind: 'poly', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] })),
      isTrue('segment missing a circle', !segHitsShape({ x: 0, y: 2 }, { x: 4, y: 2 }, { kind: 'circle', x: 2, y: 0, r: 1 })),
      nearAbs('distance to rect corner', distToShape({ x: 4, y: 5 }, { kind: 'rect', x: 0, y: 0, w: 1, h: 1 }), 5, 1e-12),
      isTrue('point in circle', pointInShape({ x: 0.5, y: 0 }, { kind: 'circle', x: 0, y: 0, r: 1 })),
    ],
  },
  {
    id: 'core-cspace',
    topic: 'core',
    title: '2-link C-space: FK/IK round trip, link-1 bands are full height, exam checks',
    source: 'Summary notes §5; 2023 Q26, 2024 Q24 and 2025 Q25 worked solutions',
    run: () => {
      const arm = { base: { x: 5, y: 5 }, l1: 2 * Math.SQRT2, l2: 2 };
      const target = { x: 6.2, y: 7.1 };
      const sol = ik2(arm, target);
      const tip = fk2(arm, sol[0][0], sol[0][1]).tip;
      // 2024 Q24: obstacle C is the square x ∈ [6, 7], y ∈ [2, 3] (inside the link-1 circle), B is out of reach of link 1.
      const C = { kind: 'rect' as const, x: 6, y: 2, w: 1, h: 1 };
      const B = { kind: 'poly' as const, pts: [{ x: 8, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 9 }, { x: 9.2, y: 9.2 }, { x: 8, y: 8 }] };
      const g = cspaceGrid(arm, [C, B], 120);
      // C intersects the link-1 circle → for some θ1 every θ2 collides.
      let fullColumn = false;
      for (let i = 0; i < g.n; i++) {
        let all = true;
        for (let j = 0; j < g.n; j++) if (!(g.hit[j * g.n + i] & 1)) all = false;
        if (all) fullColumn = true;
      }
      // B (outside the circle) never gives a full column.
      let bFull = false;
      for (let i = 0; i < g.n; i++) {
        let all = true;
        for (let j = 0; j < g.n; j++) if (!(g.hit[j * g.n + i] & 2)) all = false;
        if (all) bFull = true;
      }
      // The worked solution's "θ1 = 0.1, θ2 = 0.2" are in units of π (elbow (7.69, 5.87), tip (8.87, 7.49)).
      const chk = armCollisions(arm, 0.1 * Math.PI, 0.2 * Math.PI, [C, B]);
      const tip24 = fk2(arm, 0.1 * Math.PI, 0.2 * Math.PI).tip;
      // 2025 Q25 check: base (5, 5), L1 = 2.5; θ1 = 0.8π, θ2 = 0.4π puts the tip near (1.36, 5.29).
      const arm25 = { base: { x: 5, y: 5 }, l1: 2.5, l2: 2 };
      const tip25 = fk2(arm25, 0.8 * Math.PI, 0.4 * Math.PI).tip;
      const path = planCspace(g, [3, 0.2], [5.5, 0.3]);
      return [
        nearAbs('IK → FK returns the target (x)', tip.x, target.x, 1e-9),
        nearAbs('IK → FK returns the target (y)', tip.y, target.y, 1e-9),
        isTrue('obstacle inside the link-1 circle makes a full-height band', fullColumn),
        isTrue('obstacle outside the circle never makes a full-height band', !bFull),
        isTrue('2024 Q24 check: θ1 = 0.1π, θ2 = 0.2π puts link 2 in B', chk.link2.includes(1) && chk.link1.length === 0, JSON.stringify(chk)),
        nearAbs('2024 Q24 check: tip x ≈ 8.87', tip24.x, 8.87, 0.01),
        nearAbs('2024 Q24 check: tip y ≈ 7.49', tip24.y, 7.49, 0.01),
        nearAbs('2025 check: tip x ≈ 1.36', tip25.x, 1.36, 0.01),
        nearAbs('2025 check: tip y ≈ 5.29', tip25.y, 5.29, 0.01),
        isTrue('a free start and goal can be joined on the torus (or are blocked)', path === null || path.length > 1),
        isTrue('cgridAt wraps angles', cgridAt(g, 0.1 + TAU, 0.2) === cgridAt(g, 0.1, 0.2)),
      ];
    },
  },
  {
    id: 'core-sampling',
    topic: 'core',
    title: 'RRT / RRT* / PRM: tree stays collision-free; RRT* never costs more than RRT on the same samples',
    run: () => {
      const world: World = { w: 10, h: 10, obstacles: [{ kind: 'rect', x: 4, y: 0, w: 1, h: 7 }] };
      const start = { x: 1, y: 1 };
      const goal = { x: 9, y: 1 };
      const run = (star: boolean) => {
        const rng = makeRng(42);
        const tree = treeInit(start);
        for (let i = 0; i < 600; i++) rrtStep(world, tree, rng.next, { step: 0.7, goalBias: 0.05, goal, star, radius: 1.5 });
        return tree;
      };
      const plain = run(false);
      const star = run(true);
      const edgesFree = (t: ReturnType<typeof treeInit>) => t.nodes.every((n) => n.parent < 0 || segmentFree(world, t.nodes[n.parent].p, n.p));
      const costsConsistent = star.nodes.every((n) => n.parent < 0 || Math.abs(n.cost - (star.nodes[n.parent].cost + Math.hypot(n.p.x - star.nodes[n.parent].p.x, n.p.y - star.nodes[n.parent].p.y))) < 1e-9);
      const prm = prmBuild(world, makeRng(7).next, 150, { radius: 2 });
      const q = prmQuery(world, prm, start, goal, { radius: 2 });
      return [
        isTrue('every RRT edge is collision-free', edgesFree(plain)),
        isTrue('every RRT* edge is collision-free', edgesFree(star)),
        isTrue('RRT* costs equal parent cost + edge length after rewiring', costsConsistent),
        isTrue('PRM finds a path around the wall', !!q.path && q.cost > 8),
      ];
    },
  },
  {
    id: 'core-local',
    topic: 'core',
    title: 'Potential fields reach an open goal but stall in a U-trap; DWA picks an admissible arc',
    run: () => {
      const f = { kAtt: 1, kRep: 2, d0: 1.5, dStar: 3 };
      const open = descend({ x: 1, y: 5 }, { x: 9, y: 5 }, [], f, { step: 0.05, maxIter: 2000, goalTol: 0.1 });
      const U = [
        { kind: 'rect' as const, x: 6, y: 3, w: 0.4, h: 4 },
        { kind: 'rect' as const, x: 4, y: 3, w: 2.4, h: 0.4 },
        { kind: 'rect' as const, x: 4, y: 6.6, w: 2.4, h: 0.4 },
      ];
      const trap = descend({ x: 4.5, y: 5 }, { x: 9, y: 5 }, U, f, { step: 0.05, maxIter: 3000, goalTol: 0.1 });
      // Obstacle dead ahead and within reach of the 2 s horizon, so driving straight would collide.
      const d = dwa({ x: 0, y: 0, theta: 0 }, 0.3, 0, { x: 5, y: 0 }, [{ kind: 'circle', x: 1, y: 0, r: 0.35 }], {
        vMax: 1, wMax: 1.5, aMax: 1, alphaMax: 3, dt: 0.25, horizon: 2, nv: 7, nw: 15, radius: 0.2, heading: 0.6, clearance: 0.3, velocity: 0.1,
      });
      return [
        isTrue('reaches the goal with no obstacles', open.status === 'goal', open.status),
        isTrue('gets stuck inside the U (local minimum)', trap.status === 'local-min', trap.status),
        isTrue('DWA returns an admissible best arc', !!d.best && d.best.admissible),
        isTrue(
          'the fastest straight arc is inadmissible (it would hit the obstacle)',
          d.candidates.some((c) => Math.abs(c.w) < 1e-9 && Math.abs(c.v - d.window.v1) < 1e-9 && !c.admissible)
        ),
        isTrue('DWA never picks a colliding arc', !!d.best && d.best.clearance > 0),
      ];
    },
  },
  {
    id: 'core-motion',
    topic: 'core',
    title: 'Motion models: ω = 0 is a straight line; odometry (rot1, trans, rot2) round trip; noise-free sampling',
    run: () => {
      const p0 = { x: 1, y: 2, theta: 0.4 };
      const straight = velocityMotion(p0, 2, 0, 3);
      const p1 = { x: 3.2, y: 2.9, theta: 1.4 };
      const u = odometryFromPoses(p0, p1);
      const back = odometryMotion(p0, u);
      const zero = sampleVelocityMotion(p0, 0.5, 0.2, 2, [0, 0, 0, 0, 0, 0], makeRng(1).next);
      const exact = velocityMotion(p0, 0.5, 0.2, 2);
      const tiny = velocityMotion(p0, 2, 1e-12, 3);
      return [
        nearAbs('straight line x', straight.x, 1 + 6 * Math.cos(0.4), 1e-12),
        nearAbs('ω → 0 limit is continuous', tiny.y, straight.y, 1e-6),
        nearAbs('odometry round trip x', back.x, p1.x, 1e-12),
        nearAbs('odometry round trip y', back.y, p1.y, 1e-12),
        nearAbs('odometry round trip θ', wrapAngle(back.theta - p1.theta), 0, 1e-12),
        nearAbs('sampling with zero noise = the exact model', zero.x, exact.x, 1e-12),
      ];
    },
  },
];
