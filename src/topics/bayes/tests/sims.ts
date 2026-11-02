// Self-tests for the engines behind the bayes simulations (explore/corridorModel.ts, bayesRuleModel.ts,
// markovEngine.ts, and the core tables the grid-world and classifier simulations draw): every number a simulation
// shows or a predict-then-reveal promises is checked here.
import type { SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { mulberry32 } from '../../../engine/rng';
import { argmax, correctCorridor, countModes, entropyBits, predictCorridor, shiftsOf, uniform } from '../../../core/bayes1d';
import { MAP_2024_Q28, type MoveOutcome, type TileMap } from '../../../core/gridloc';
import { beliefOn, classifierRun, decide, gridCorrectTable, gridPredictTable } from '../../../core/bayestables';
import { CORRIDOR_PRESETS, DEFAULT_PARAMS, doCorrect, doorsOf, initSnap, runCycles } from '../explore/corridorModel';
import {
  RULE_SCENARIOS,
  TERM_CHIPS,
  TERM_ORDER,
  naturalFrequencies,
  productRule,
  repeatReading,
  ruleUpdate,
  scenarioById,
  setBoundary,
  setLikAt,
  setPriorAt,
  twoReadings,
} from '../explore/bayesRuleModel';
import { MARKOV_CARDS, STEPS, coverage, meanSd, rmsError, runMarkov, sigmaTrue, type MarkovMode } from '../explore/markovEngine';
import { EXAM_2025 } from '../solve/classifier';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const f3 = (x: number) => x.toFixed(3);
const preset = (id: string) => CORRIDOR_PRESETS.find((p) => p.id === id)!;
const EXAM_MOVES: MoveOutcome[] = [
  { dc: 0, dr: -1, p: 0.8 },
  { dc: -1, dr: -1, p: 0.2 },
];
const cell = (bel: number[][], label: string) => bel[Number(label.slice(1)) - 1][label.charCodeAt(0) - 65];

export const tests: SelfTest[] = [
  {
    id: 'bayes-sims-corridor',
    topic: 'bayes',
    title: 'Corridor (grid1d): one peak per door after the first “door”; predict only blurs; a useless sensor changes nothing; even doors alias forever',
    source: 'Summary notes §1 (prediction grows uncertainty, correction shrinks it); the classic corridor example',
    run: () => {
      const doors = doorsOf(preset('classic'));
      const s = DEFAULT_PARAMS.sensor;
      const first = correctCorridor(uniform(30), doors, 'door', s);
      const doorCells = preset('classic').doors;
      // blur: a known position, then 8 moves without sensing (the prediction's own numbers)
      let bel = new Array<number>(30).fill(0);
      bel[12] = 1;
      const hs = [entropyBits(bel)];
      for (let k = 0; k < 8; k++) {
        bel = predictCorridor(bel, shiftsOf({ under: 0.15, exact: 0.7, over: 0.15 }), 'loop').bel;
        hs.push(entropyBits(bel));
      }
      // a sensor whose hit rate equals its false-alarm rate
      const prior = predictCorridor(first.posterior, shiftsOf(DEFAULT_PARAMS.motion), 'loop').bel;
      const flat = correctCorridor(prior, doors, 'door', { hit: 0.6, falseAlarm: 0.6 });
      const maxDiff = Math.max(...prior.map((p, i) => Math.abs(p - flat.posterior[i])));
      // perceptual aliasing: evenly spaced doors on the loop
      const even = doorsOf(preset('even'));
      const rand = mulberry32(7);
      const runs = runCycles(initSnap(even, 5, s, rand), even, DEFAULT_PARAMS, 12, rand);
      const end = runs[runs.length - 1].bel;
      const periodic = end.every((p, i) => Math.abs(p - end[(i + 10) % 30]) < 1e-12);
      const modes = countModes(end, 0.3, true);
      return [
        isTrue('default sensor: hit 0.9, false alarm 0.05 (the numbers the first prediction quotes)', s.hit === 0.9 && s.falseAlarm === 0.05),
        nearAbs('first “door”: posterior at a door = 0.9/4.05 ≈ 0.22', first.posterior[3], 0.9 / 4.05, 1e-12),
        nearAbs('first “door”: posterior at a wall = 0.05/4.05 ≈ 0.01', first.posterior[0], 0.05 / 4.05, 1e-12),
        isTrue('all three doors equally likely', doorCells.every((d) => Math.abs(first.posterior[d] - first.posterior[doorCells[0]]) < 1e-15)),
        isTrue('three peaks (one per door)', countModes(first.posterior) === 3, String(countModes(first.posterior))),
        nearAbs('P(z = door) = 4.05/30 = 0.135', first.evidence, 0.135, 1e-12),
        isTrue(`entropy rises at every prediction: ${hs.map((h) => h.toFixed(2)).join(' → ')}`, hs.every((h, k) => k === 0 || h > hs[k - 1] + 1e-9)),
        isTrue('entropy stays below log₂ 30 (uniform)', hs[8] < Math.log2(30)),
        isTrue('hit = false alarm: posterior = prior', maxDiff < 1e-12, maxDiff.toExponential(2)),
        isTrue('even doors after 12 cycles: belief repeats every 10 cells', periodic),
        isTrue('even doors: peaks come in threes (≥ 3)', modes >= 3 && modes % 3 === 0, String(modes)),
        isTrue('even doors: no hypothesis above 1/3', Math.max(...end) <= 1 / 3 + 1e-12, f3(Math.max(...end))),
      ];
    },
  },
  {
    id: 'bayes-sims-corridor-classic',
    topic: 'bayes',
    title: 'Corridor (grid1d): with three unevenly spaced doors and the default models the robot usually localises within one lap (30 cycles)',
    source: 'Perceptual aliasing is broken by an irregular landmark pattern (the predict-then-reveal on even doors says “usually within one lap”)',
    run: () => {
      const doors = doorsOf(preset('classic'));
      let good = 0;
      let peakAtRobot = 0;
      const N = 20;
      for (let seed = 1; seed <= N; seed++) {
        const rand = mulberry32(seed * 7919);
        const runs = runCycles(initSnap(doors, Math.floor(rand() * 30), DEFAULT_PARAMS.sensor, rand), doors, DEFAULT_PARAMS, 30, rand);
        const last = runs[runs.length - 1];
        let near2 = 0;
        for (let d = -2; d <= 2; d++) near2 += last.bel[(((last.robot + d) % 30) + 30) % 30];
        if (near2 >= 0.5) good++;
        const off = Math.abs(argmax(last.bel) - last.robot);
        if (Math.min(off, 30 - off) <= 2) peakAtRobot++;
      }
      return [
        isTrue(`≥ half the belief within ±2 cells of the robot in ≥ 60 % of runs (${good} of ${N})`, good >= 0.6 * N),
        isTrue(`the most likely cell is within 2 cells of the robot in ≥ 70 % of runs (${peakAtRobot} of ${N})`, peakAtRobot >= 0.7 * N),
      ];
    },
  },
  {
    id: 'bayes-sims-grid2d',
    topic: 'bayes',
    title: 'Grid world (grid2d): exam preset; start colour irrelevant; contributions add (C3 + D3 → C2 = 0.5); a perfect camera zeroes the black tiles',
    source: '2024 Q28 worked solution; summary notes §1 steps 2–4',
    run: () => {
      const starts = [
        { c: 2, r: 2 },
        { c: 6, r: 3 },
      ];
      const cam = { pBlackGivenBlack: 0.83, pWhiteGivenWhite: 0.9 };
      const pr = gridPredictTable(MAP_2024_Q28, beliefOn(MAP_2024_Q28, starts), EXAM_MOVES);
      const co = gridCorrectTable(MAP_2024_Q28, pr.predicted, 0, cam, pr.cells);
      const white: TileMap = { ...MAP_2024_Q28, tiles: MAP_2024_Q28.tiles.map((row, r) => row.map((t, c) => (r === 3 && c === 6 ? 0 : t))) };
      const pr2 = gridPredictTable(white, beliefOn(white, starts), EXAM_MOVES);
      const same = pr.predicted.every((row, r) => row.every((p, c) => p === pr2.predicted[r][c]));
      const add = gridPredictTable(MAP_2024_Q28, beliefOn(MAP_2024_Q28, [{ c: 2, r: 2 }, { c: 3, r: 2 }]), EXAM_MOVES);
      const perfect = gridCorrectTable(MAP_2024_Q28, pr.predicted, 0, { pBlackGivenBlack: 1, pWhiteGivenWhite: 1 }, pr.cells);
      return [
        nearAbs('P(white) = 0.535', co.evidence, 0.535, 1e-12),
        nearAbs('C2 0.1271', cell(co.posterior, 'C2'), 0.1271, 5e-5),
        nearAbs('B2 0.0318', cell(co.posterior, 'B2'), 0.0318, 5e-5),
        nearAbs('G3 0.6729', cell(co.posterior, 'G3'), 0.6729, 5e-5),
        nearAbs('F3 0.1682', cell(co.posterior, 'F3'), 0.1682, 5e-5),
        isTrue('G4 white instead of black: identical prediction', same),
        nearAbs('C3 + D3: P(C2) = 0.4 + 0.1 = 0.5', cell(add.predicted, 'C2'), 0.5, 1e-12),
        isTrue('C2 has two contributions', (add.cells.find((c) => c.label === 'C2')?.parts.length ?? 0) === 2),
        nearAbs('perfect camera: C2 = 0', cell(perfect.posterior, 'C2'), 0, 1e-15),
        nearAbs('perfect camera: B2 = 0', cell(perfect.posterior, 'B2'), 0, 1e-15),
        nearAbs('perfect camera: G3 = 0.8', cell(perfect.posterior, 'G3'), 0.8, 1e-12),
        nearAbs('perfect camera: F3 = 0.2', cell(perfect.posterior, 'F3'), 0.2, 1e-12),
      ];
    },
  },
  {
    id: 'bayes-sims-rule',
    topic: 'bayes',
    title: 'Bayes’ rule (bayes-rule): door 0.4706; rare crack 0.167 then 0.80; flat likelihood leaves the prior; a zero prior stays 0; product rule both ways; two readings dependent',
    source: 'Summary notes §1 (rules to know cold; 2024 MCQ product-rule trap); review deck slide 4',
    run: () => {
      const door = scenarioById('door');
      const crack = scenarioById('crack');
      const fruit = scenarioById('fruit');
      const td = ruleUpdate(door.prior, door.table, 0);
      const tc = ruleUpdate(crack.prior, crack.table, 0);
      const two = repeatReading(crack.prior, crack.table, 0, 2);
      const flatTable = setLikAt(setLikAt(door.table, 0, 0, 0.5), 1, 0, 0.5);
      const tf = ruleUpdate(door.prior, flatTable, 0);
      const zero = repeatReading([0, 1], crack.table, 0, 10);
      const pr = productRule(td, 0);
      const tr = twoReadings(door.prior, door.table, 0);
      const nf = naturalFrequencies(crack.prior, crack.table, 0);
      const tFruit = ruleUpdate(fruit.prior, fruit.table, fruit.z);
      const sp = setPriorAt([0.3, 0.5, 0.2], 1, 0.8);
      const sb = setBoundary([0.3, 0.5, 0.2], 1, 0.6);
      const sl = setLikAt(EXAM_2025.table, 1, 1, 0.5);
      return [
        nearAbs('P(door | saw door) = 0.08/0.17 = 0.4706', td.posterior[0], 0.08 / 0.17, 1e-12),
        nearAbs('P(cracked | beep) = 0.0099/0.0594 = 0.1667', tc.posterior[0], 0.0099 / 0.0594, 1e-12),
        nearAbs('second beep: 0.7984', two[0], 0.7984, 5e-5),
        isTrue('natural frequencies: 9.9 of 59.4 beeps are cracked', Math.abs(nf.hits[0] - 9.9) < 1e-9 && Math.abs(nf.total - 59.4) < 1e-9),
        nearAbs('equal likelihoods: posterior = prior (0.1)', tf.posterior[0], 0.1, 1e-12),
        nearAbs('zero prior after 10 beeps: still 0', zero[0], 0, 0),
        nearAbs('product rule: P(z | x)P(x) = 0.08', pr.joint, 0.08, 1e-12),
        nearAbs('product rule the other way: P(x | z)P(z) = 0.08', pr.other, 0.08, 1e-12),
        isTrue('the 2024 distractor P(x | z)P(x) is a different number (0.0471)', Math.abs(pr.trap - 0.0471) < 5e-5 && Math.abs(pr.trap - pr.joint) > 0.01, f3(pr.trap)),
        nearAbs('two readings: P(z₂ = saw door) = 0.17', tr.marginal, 0.17, 1e-12),
        nearAbs('two readings: P(z₂ | z₁) = 0.8(0.4706) + 0.1(0.5294) = 0.4294', tr.givenFirst, 0.8 * (0.08 / 0.17) + 0.1 * (0.09 / 0.17), 1e-12),
        nearAbs('fruit, detects B: P(A) = 0.0723', tFruit.posterior[0], 0.0723, 5e-5),
        nearAbs('fruit, detects B: P(B) = 0.9036', tFruit.posterior[1], 0.9036, 5e-5),
        nearAbs('fruit, detects B: P(N) = 0.0241', tFruit.posterior[2], 0.0241, 5e-5),
        isTrue('setPriorAt keeps the sum 1 and the others’ ratio', Math.abs(sum(sp) - 1) < 1e-12 && Math.abs(sp[0] / sp[2] - 1.5) < 1e-12),
        isTrue('setBoundary keeps the pair total (0.8) and the third state', Math.abs(sb[1] + sb[2] - 0.7) < 1e-12 && sb[0] === 0.3 && Math.abs(sb[1] - 0.3) < 1e-12),
        isTrue('setLikAt keeps every sensor-table row summing to 1', sl.every((row) => Math.abs(sum(row) - 1) < 1e-12) && sl[1][1] === 0.5),
        isTrue('label game: one chip per term plus one distractor', TERM_ORDER.every((t) => TERM_CHIPS.filter((c) => c.term === t).length === 1) && TERM_CHIPS.filter((c) => !c.term).length === 1),
        isTrue('every scenario: rows of the sensor table sum to 1 and the prior sums to 1', RULE_SCENARIOS.every((s) => Math.abs(sum(s.prior) - 1) < 1e-12 && s.table.every((row) => Math.abs(sum(row) - 1) < 1e-12))),
      ];
    },
  },
  {
    id: 'bayes-sims-classifier',
    topic: 'bayes',
    title: 'Classifier (classifier): exam sequence and decision; order does not matter; a third B flips the choice to pinch; the likelihood is a column',
    source: '2025 Q28 worked solution (a)–(c)',
    run: () => {
      const { table, prior, success } = EXAM_2025;
      const ba = classifierRun(prior, table, [1, 0]);
      const ab = classifierRun(prior, table, [0, 1]);
      const bab = classifierRun(prior, table, [1, 0, 1]);
      const d2 = decide(ba[1].posterior, success);
      const d3 = decide(bab[2].posterior, success);
      const fin = ba[1].posterior;
      return [
        nearAbs('after B: A 0.0723', ba[0].posterior[0], 0.0723, 5e-5),
        nearAbs('after B: B 0.9036', ba[0].posterior[1], 0.9036, 5e-5),
        nearAbs('after A: A 0.4832', fin[0], 0.4832, 5e-5),
        nearAbs('after A: B 0.5034', fin[1], 0.5034, 5e-5),
        nearAbs('after A: N 0.0134', fin[2], 0.0134, 5e-5),
        nearAbs('suction 0.811', d2.expected[0], 0.811, 5e-4),
        nearAbs('pinch 0.743', d2.expected[1], 0.743, 5e-4),
        isTrue('use suction although banana is the most likely fruit', d2.best === 0 && fin[1] > fin[0]),
        isTrue('A then B ends at the same belief as B then A', ab[1].posterior.every((p, i) => Math.abs(p - fin[i]) < 1e-12)),
        nearAbs('B, A, B: P(B) = 0.885', bab[2].posterior[1], 0.885, 5e-4),
        isTrue(`B, A, B: pinch ${f3(d3.expected[1])} beats suction ${f3(d3.expected[0])}`, d3.best === 1 && Math.abs(d3.expected[1] - 0.865) < 1e-3 && Math.abs(d3.expected[0] - 0.727) < 1e-3),
        isTrue('a B detection multiplies by the B column (0.1, 0.75, 0.05), not the B row (0.05, 0.75, 0.2)', ba[0].likelihood.join() === '0.1,0.75,0.05' && table[1].join() === '0.05,0.75,0.2'),
      ];
    },
  },
  {
    id: 'bayes-sims-markov',
    topic: 'bayes',
    title: 'Markov demo: memoryless noise stays consistent; a heating sensor or a wearing motor left out of the state makes the filter overconfident and wrong; adding it fixes that',
    source: 'Summary notes §1 (Markov assumption); 2023 Q2 (heating sensor), 2024 Q2 (decaying motor)',
    run: () => {
      const seeds = Array.from({ length: 20 }, (_, k) => k + 1);
      const avg = (mode: MarkovMode, f: (r: ReturnType<typeof runMarkov>) => number) => sum(seeds.map((s) => f(runMarkov(mode, s)))) / seeds.length;
      const cov = (mode: MarkovMode, aug: boolean) => avg(mode, (r) => coverage(aug ? r.aug : r.naive));
      const r1 = runMarkov('heat', 1);
      const m1 = runMarkov('motor', 1);
      const late = (r: ReturnType<typeof runMarkov>) => sum(r.naive.mean.slice(41).map((m, k) => m - r.truth[41 + k])) / (STEPS - 40);
      const again = runMarkov('heat', 1);
      return [
        isTrue(`random noise: position-only filter covers the truth ≥ 90 % (${f3(cov('random', false))})`, cov('random', false) >= 0.9),
        isTrue(`heat, position only: coverage ≤ 60 % (${f3(cov('heat', false))})`, cov('heat', false) <= 0.6),
        isTrue(`heat, + temperature: coverage ≥ 90 % (${f3(cov('heat', true))})`, cov('heat', true) >= 0.9),
        isTrue(`motor, position only: coverage ≤ 60 % (${f3(cov('motor', false))})`, cov('motor', false) <= 0.6),
        isTrue(`motor, + health: coverage ≥ 90 % (${f3(cov('motor', true))})`, cov('motor', true) >= 0.9),
        isTrue('heat: the position-only filter claims more certainty but is further off', avg('heat', (r) => meanSd(r.naive)) < avg('heat', (r) => meanSd(r.aug)) && avg('heat', (r) => rmsError(r.naive, r.truth)) > avg('heat', (r) => rmsError(r.aug, r.truth))),
        nearAbs('heat: claimed σ ≈ 0.6 cells (position only)', avg('heat', (r) => meanSd(r.naive)), 0.6, 0.1),
        nearAbs('heat: claimed σ ≈ 1.5 cells (+ temperature)', avg('heat', (r) => meanSd(r.aug)), 1.5, 0.15),
        isTrue(`default run (seed 1), heat: ${f3(coverage(r1.naive))} vs ${f3(coverage(r1.aug))}`, coverage(r1.naive) < 0.5 && coverage(r1.aug) > 0.85),
        isTrue(`default run, motor: the belief sits ahead of the robot late in the run (${f3(late(m1))} cells)`, late(m1) > 2),
        near('true sensor noise at the end of the heat run ≈ 7 cells (±2σ ≈ ±14)', sigmaTrue('heat', STEPS), 6.9, 0.02),
        isTrue('runs are deterministic', again.truth.join() === r1.truth.join() && again.z.slice(1).join() === r1.z.slice(1).join()),
        isTrue('cards: 3 fine, 4 break it', MARKOV_CARDS.filter((c) => !c.breaks).length === 3 && MARKOV_CARDS.filter((c) => c.breaks).length === 4),
      ];
    },
  },
  {
    id: 'bayes-sims-corridor-correct-forced',
    topic: 'bayes',
    title: 'Corridor (grid1d): forcing the opposite reading is still a valid correction (posterior sums to 1, entropy falls from uniform)',
    run: () => {
      const doors = doorsOf(preset('classic'));
      const s0 = initSnap(doors, 7, DEFAULT_PARAMS.sensor, () => 0.99);
      const s1 = doCorrect(s0, doors, 'wall', DEFAULT_PARAMS, () => 0.5);
      const st = s1.step;
      const doorCell = doors.indexOf(true);
      const wallCell = doors.indexOf(false);
      return [
        nearAbs('posterior sums to 1', sum(s1.bel), 1, 1e-12),
        isTrue('entropy below uniform', entropyBits(s1.bel) < Math.log2(30)),
        isTrue('the robot did not move during a correction', s1.robot === s0.robot),
        // The breakdown text quotes the likelihoods stored with the step (the sliders may change afterwards).
        isTrue('the step stores P(no door | door) = 1 − hit and P(no door | wall) = 1 − false alarm, matching its likelihood row',
          !!st && st.kind === 'correct' && Math.abs(st.likDoor - (1 - DEFAULT_PARAMS.sensor.hit)) < 1e-12 && Math.abs(st.likWall - (1 - DEFAULT_PARAMS.sensor.falseAlarm)) < 1e-12 && st.lik[doorCell] === st.likDoor && st.lik[wallCell] === st.likWall),
      ];
    },
  },
];
