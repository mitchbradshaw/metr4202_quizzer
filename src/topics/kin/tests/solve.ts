// Self-tests for the kinematics exam-mode generators (kin-m, kin-screws, kin-arm-camera, kin-poe, kin-jacobian)
// and the exam-style arm figure: the exam robots' M and screw tables against the worked solutions, the three
// camera parts against the papers' numbers, PoE / Jacobian consistency, figure layout quality, and a sanity
// sweep of every generator × tier × 40 seeds.
import katex from 'katex';
import type { CheckResult, SelfTest } from '../../../selftest/types';
import type { MatrixPart, SolveGenerator, SolveInstance } from '../../../engine/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkMatrix, checkNumeric } from '../../../engine/check';
import { armM, armScrewsB, armScrewsS, EXAM_ARMS, fkBody, fkSpace, jacobianSpace, linVecEval, posOf, type ArmSpec } from '../../../core/kin';
import { examArm, pickRandomArm, type ViewKey } from '../solve/kinfigArms';
import { layoutArmFigure } from '../solve/kinfigLayout';
import { mMatrixPart } from '../solve/m';
import { screwRowPart, screwTablePart } from '../solve/screws';
import { armCameraInstance, cameraA, cameraB, cameraC } from '../solve/armcamera';
import { poe } from '../solve/poe';
import type { PickPart } from '../solve/kinfigPick';
import { generators as mGens } from '../solve/m';
import { generators as screwGens } from '../solve/screws';
import { generators as camGens } from '../solve/armcamera';
import { generators as poeGens } from '../solve/poe';

const ALL: SolveGenerator[] = [...mGens, ...screwGens, ...camGens, ...poeGens];

// ------------------------------------------------------------------ sanity helpers

function texIn(s: string): string[] {
  const src = s.replace(/\\\$/g, '\u0000');
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2]).replace(/\u0000/g, '\\$'));
  return out;
}

function texError(src: string): string {
  try {
    katex.renderToString(src, { displayMode: false, throwOnError: true, strict: 'ignore', output: 'html' });
  } catch (e) {
    return `${(e as Error).message.slice(0, 100)} in "${src.slice(0, 70)}"`;
  }
  // a TeX command that lost its backslash (e.g. 'omega' from a single '\o' in a template string)
  const bare = /(^|[^\\A-Za-z])(omega|theta|hat|mathcal|boldsymbol|times|begin\{|end\{|tfrac|dfrac|mathrm|cdot|qquad|hline)/.exec(src);
  if (bare) return `TeX command without backslash "${bare[2]}" in "${src.slice(0, 70)}"`;
  return '';
}

/** What a student would type for a part's own answer. */
function ownCells(p: MatrixPart): string[][] {
  return p.symbolic ? p.symbolic.answer : p.answer.map((r) => r.map(String));
}

export function kinInstanceProblems(inst: SolveInstance): string[] {
  const bad: string[] = [];
  const texts: string[] = [inst.prompt, ...inst.hints];
  if (inst.hints.length !== 4) bad.push(`${inst.hints.length} hints`);
  if (inst.hints.some((h) => !h || !h.trim())) bad.push('empty hint');
  if (!inst.parts.length) bad.push('no parts');
  if (inst.figure && typeof inst.figure !== 'function') bad.push('figure is not a component');
  const ids = new Set<string>();
  for (const p of inst.parts) {
    if (ids.has(p.id)) bad.push(`duplicate part id ${p.id}`);
    ids.add(p.id);
    texts.push(p.label);
    if (p.kind === 'numeric') {
      if (!Number.isFinite(p.answer)) bad.push(`${p.id}: answer not finite`);
      else if (!checkNumeric(p, String(p.answer)).correct) bad.push(`${p.id}: own answer rejected`);
      for (const t of p.traps ?? []) {
        texts.push(t.message);
        if (checkNumeric(p, String(t.value)).correct) bad.push(`${p.id}: trap ${t.value} accepted`);
      }
    } else if (p.kind === 'choice') {
      const keys = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      if (!p.multi && keys.length !== 1) bad.push(`${p.id}: ${keys.length} correct options`);
      if (!keys.length) bad.push(`${p.id}: no correct option`);
      if (!checkChoice(p, keys).correct) bad.push(`${p.id}: own key rejected`);
      if (new Set(p.options.map((o) => o.text)).size !== p.options.length) bad.push(`${p.id}: duplicate option text`);
      for (const o of p.options) {
        texts.push(o.text);
        if (!o.why || !o.why.trim()) bad.push(`${p.id}: option without a why`);
        else texts.push(o.why);
      }
    } else if (p.kind === 'custom') {
      // the compact direction picker (kinfigPick): checked like a choice part through its spec
      const pick = (p as Partial<PickPart>).pick;
      if (!pick) bad.push(`${p.id}: custom part without a pick spec`);
      else {
        const keys = pick.options.filter((o) => o.correct).length;
        if (keys !== 1) bad.push(`${p.id}: ${keys} correct options`);
        if (new Set(pick.options.map((o) => o.text)).size !== pick.options.length) bad.push(`${p.id}: duplicate option text`);
        if (pick.options.length < 2 || pick.cols < 1) bad.push(`${p.id}: degenerate picker`);
        for (const o of pick.options) {
          texts.push(o.text);
          if (!o.why || !o.why.trim()) bad.push(`${p.id}: option without a why`);
          else texts.push(o.why);
          if (o.correct && o.trapId) bad.push(`${p.id}: the key carries a trap id`);
        }
      }
    } else if (p.kind === 'matrix') {
      if (p.answer.some((row) => row.some((x) => !Number.isFinite(x)))) bad.push(`${p.id}: matrix not finite`);
      const v = checkMatrix(p, ownCells(p));
      if (!v.correct) bad.push(`${p.id}: own matrix rejected (${v.message ?? ''})`);
      if (p.symbolic) {
        if (p.symbolic.answer.length !== p.answer.length || p.symbolic.answer.some((r, i) => r.length !== p.answer[i].length)) bad.push(`${p.id}: symbolic shape differs`);
        for (const t of p.symbolic.traps ?? []) {
          texts.push(t.message);
          const tv = checkMatrix(p, t.answer);
          if (tv.correct) bad.push(`${p.id}: symbolic trap accepted as correct`);
          else if (tv.trapId !== t.trapId) bad.push(`${p.id}: trap ${t.trapId} not recognised (got ${tv.trapId})`);
        }
        // blank cells count as 0 with the '0' placeholder
        const blanks = p.symbolic.answer.map((r) => r.map((c) => (c === '0' ? '' : c)));
        if (p.placeholder === '0' && !checkMatrix(p, blanks).correct) bad.push(`${p.id}: blank-for-zero rejected`);
      } else
        for (const t of p.traps ?? []) {
          texts.push(t.message);
          const tv = checkMatrix(p, t.value.map((r) => r.map(String)));
          if (tv.correct) bad.push(`${p.id}: matrix trap accepted as correct`);
        }
      texts.push(...(p.rowLabels ?? []), ...(p.colLabels ?? []));
    }
  }
  for (const g of inst.givens ?? []) {
    const e = texError(g.sym);
    if (e) bad.push(`given ${g.sym}: ${e}`);
    texts.push(g.value, g.label ?? '');
  }
  for (const t of texts) {
    if (/NaN|undefined|Infinity|\[object|e-1\d/.test(t)) bad.push(`bad text: "${t.slice(0, 80)}"`);
    if ((t.replace(/\\\$/g, '').match(/\$/g) ?? []).length % 2) bad.push(`unbalanced $ in "${t.slice(0, 60)}"`);
    for (const tx of texIn(t)) {
      const e = texError(tx);
      if (e) bad.push(e);
    }
  }
  return bad;
}

function sanity(gen: SolveGenerator, seeds = 40): CheckResult[] {
  return gen.tiers.map((tier) => {
    let bad = '';
    let parts = 0;
    for (let s = 1; s <= seeds && !bad; s++) {
      const seed = s * 7919 + tier;
      try {
        const inst = gen.generate(makeRng(seed), tier);
        const again = gen.generate(makeRng(seed), tier);
        if (again.prompt !== inst.prompt) bad = `seed ${seed}: not reproducible`;
        parts += inst.parts.length;
        const probs = kinInstanceProblems(inst);
        if (probs.length) bad = `seed ${seed}: ${probs.slice(0, 3).join('; ')}`;
      } catch (e) {
        bad = `seed ${seed} threw ${(e as Error).message}`;
      }
    }
    return isTrue(`${gen.id} tier ${tier}: ${seeds} seeds well formed (${parts} parts)`, !bad, bad);
  });
}

// ------------------------------------------------------------------ worked-solution tables

const W = (s: string) => s.split(';').map((r) => r.split(',').map((c) => c.trim()));

/** The worked solutions’ answers (rows ωx ωy ωz vx vy vz), as a student would type them. */
const TABLES: { id: string; frame: 's' | 'b'; src: string; M: string; rows: string }[] = [
  { id: 'rprr-2023', frame: 's', src: '2023 Q33(a)–(b) worked solutions', M: '0,-1,0,-L2; 0,0,1,L3; -1,0,0,L1; 0,0,0,1', rows: '0,0,1,0,0,0; 0,0,0,0,0,1; 1,0,0,0,L1,0; 0,1,0,-L1,0,-L2' },
  { id: 'prr-2024', frame: 's', src: '2024 Q30(a)–(b) worked solutions', M: '0,0,-1,-L3; 0,1,0,L2; 1,0,0,L1; 0,0,0,1', rows: '0,0,0,0,0,1; 0,1,0,-L1,0,0; -1,0,0,0,-L1,L2' },
  { id: 'rrrrr-2025', frame: 's', src: '2025 Q30(a)–(b) worked solutions', M: '0,0,1,L2+L3+L4; 1,0,0,0; 0,1,0,L1; 0,0,0,1', rows: '0,0,1,0,0,0; 0,1,0,-L1,0,0; 0,1,0,-L1,0,L2; 0,1,0,-L1,0,L2+L3; 1,0,0,0,L1,0' },
  { id: 'review-6dof', frame: 'b', src: 'Review deck slide 20 ({b}-frame table)', M: '1,0,0,L1; 0,1,0,L3+L4; 0,0,1,-L5-L6; 0,0,0,1', rows: '1,0,0,0,L5+L6,L3+L4; 0,0,-1,L3+L4,0,0; 0,1,0,-L2-L5-L6,0,0; 1,0,0,0,L5+L6,L4; 0,0,0,0,1,0; 0,1,0,-L6,0,0' },
];

function tableChecks(): CheckResult[] {
  const out: CheckResult[] = [];
  for (const t of TABLES) {
    const arm = examArm(t.id);
    const Mp = mMatrixPart(arm, { labels: true, marks: 4 });
    out.push(isTrue(`${t.id}: M typed as in the worked solution is marked correct`, checkMatrix(Mp, W(t.M)).correct, JSON.stringify(Mp.symbolic?.answer)));
    const rows = W(t.rows);
    const table = screwTablePart(arm, t.frame, { marks: 6 });
    out.push(isTrue(`${t.id}: the whole ${t.frame === 's' ? 'S' : 'B'} table typed as printed is marked correct`, checkMatrix(table, rows).correct, JSON.stringify(table.symbolic?.answer)));
    rows.forEach((row, i) => {
      const part = screwRowPart(arm, i, t.frame, { marks: 1 });
      out.push(isTrue(`${t.id}: ${t.frame === 's' ? 'S' : 'B'}${i + 1} = (${row.join(', ')}) is marked correct on its own`, checkMatrix(part, [row]).correct, JSON.stringify(part.symbolic?.answer)));
      // the same row with v negated (ω × q) is caught as a named slip, in the row part and in the whole table
      const flipped = row.map((c, j) => (j >= 3 && c !== '0' ? (c.startsWith('-') ? c.slice(1).replace(/-/g, '+').replace(/^\+/, '') : `-(${c})`) : c));
      if (arm.joints[i].type === 'R' && row.slice(3).some((c) => c !== '0')) {
        const v = checkMatrix(part, [flipped]);
        const vt = checkMatrix(table, rows.map((r, k) => (k === i ? flipped : r)));
        out.push(
          isTrue(`${t.id}: joint ${i + 1} with ω × q (v negated) is flagged v-cross-sign (row and table)`, !v.correct && v.trapId === 'v-cross-sign' && !vt.correct && vt.trapId === 'v-cross-sign' && /Row \d/.test(vt.message ?? ''), `${v.trapId} / ${vt.trapId} ${flipped.join(',')}`)
        );
      }
    });
  }
  return out;
}

// ------------------------------------------------------------------ camera parts

function cameraChecks(): CheckResult[] {
  const a = cameraA([-0.2, 0.4, 1.5], [0, 1, 0], [-0.2, 5, 0], 1.7, 50);
  const b = cameraB([-1.5, 0.1, 1.5], [-1, 0, 0], 60, 50, 38, 20);
  const c = cameraC(0.1, 2.1, 1.1, 163, 7.06);
  const out: CheckResult[] = [
    nearAbs('2023 Q33(c): Z = 5 − 0.4 = 4.6 m', a.Z, 4.6, 1e-9),
    near('2023 Q33(c): h′ = 18.48 mm', a.img, 18.48, 1e-3),
    near('2024 Q30(c): Z = 78.95 m from the camera', b.Z, 78.95, 1e-3),
    near('2024 Q30(c): base 78.95 + 1.5 = 80.45 m', b.base, 80.45, 1e-3),
    near('2024 Q30(d): 20 m closer → 50.9 mm', b.img2, 50.9, 2e-3),
    near('2025 Q30(c): lateral √(2.1² − 1.0²) = 1.847 m', c.lateral, 1.847, 1e-3),
    near('2025 Q30(d): f = 80 mm', c.f, 80, 2e-3),
  ];
  // the generator's own parts with the papers' numbers
  const want: Record<string, Record<string, number>> = {
    'rprr-2023': { Z: 4.6, img: 18.48 },
    'prr-2024': { Z: 78.95, base: 80.45, img2: 50.9 },
    'rrrrr-2025': { lat: 1.847, f: 80 },
  };
  const style: Record<string, 'A' | 'B' | 'C'> = { 'rprr-2023': 'A', 'prr-2024': 'B', 'rrrrr-2025': 'C' };
  const paper: Record<string, Record<string, number>> = {
    'rprr-2023': { L1: 1.5, L2: 0.2, L3: 0.4 },
    'prr-2024': { L1: 1.5, L2: 0.1, L3: 1.5 },
    'rrrrr-2025': { L1: 0.1, L2: 0.9, L3: 1.0, L4: 0.2 },
  };
  for (const id of Object.keys(want)) {
    const arm: ArmSpec = { ...examArm(id), values: paper[id] };
    const { parts } = armCameraInstance(makeRng(1), arm, style[id], true);
    for (const [pid, v] of Object.entries(want[id])) {
      const p = parts.find((q) => q.id === pid);
      out.push(p && p.kind === 'numeric' ? near(`${id} generator part ${pid} with the paper’s numbers`, p.answer, v, 2e-3) : isTrue(`${id}: part ${pid} exists`, false));
    }
    const table = parts.find((p) => p.id === 'table');
    out.push(isTrue(`${id}: the camera instance also asks for M and the whole screw table`, !!parts.find((p) => p.id === 'M') && !!table && table.kind === 'matrix' && table.answer.length === arm.joints.length));
    const total = parts.reduce((t, p) => t + (p.marks ?? 0), 0);
    out.push(isTrue(`${id}: its parts add up to 15 marks, as on the paper`, total === 15, `${total} marks`));
  }
  return out;
}

// ------------------------------------------------------------------ PoE / Jacobian consistency

function poeChecks(): CheckResult[] {
  const out: CheckResult[] = [];
  const rng = makeRng(424242);
  for (const arm of EXAM_ARMS) {
    const n = arm.joints.length;
    const zero = new Array<number>(n).fill(0);
    const T0 = poe(arm, zero);
    const M = armM(arm);
    out.push(isTrue(`${arm.id}: PoE at θ = 0 is M`, T0.every((r, i) => r.every((x, j) => Math.abs(x - M[i][j]) < 1e-12))));
    const th = Array.from({ length: n }, () => rng.uniform(-2, 2));
    const Ts = fkSpace(M, armScrewsS(arm), th);
    const Tb = fkBody(M, armScrewsB(arm), th);
    const err = Math.max(...Ts.flatMap((r, i) => r.map((x, j) => Math.abs(x - Tb[i][j]))));
    out.push(nearAbs(`${arm.id}: space form = body form at a random θ (symbolic {b} table is consistent)`, err, 0, 1e-9));
    const J0 = jacobianSpace(armScrewsS(arm), zero);
    out.push(isTrue(`${arm.id}: J_s(0) columns are the screw axes`, J0.every((c, i) => [...c.w, ...c.v].every((x, k) => Math.abs(x - [...armScrewsS(arm)[i].w, ...armScrewsS(arm)[i].v][k]) < 1e-12))));
  }
  // 2023 robot: θ1 = π/2 swings the camera from (−L2, L3, L1) to (−L3, −L2, L1)
  const a23 = examArm('rprr-2023');
  const p = posOf(poe(a23, [Math.PI / 2, 0, 0, 0]));
  const v = a23.values;
  out.push(nearAbs('2023 robot, θ1 = π/2: p = (−L3, −L2, L1)', Math.hypot(p[0] + v.L3, p[1] + v.L2, p[2] - v.L1), 0, 1e-9));
  return out;
}

// ------------------------------------------------------------------ figures

const FIG_VIEWS: ViewKey[] = ['xOut', 'yIn', 'xUp', 'xLeft', 'yLeft', 'zRight'];

function figureChecks(): CheckResult[] {
  const out: CheckResult[] = [];
  const arms: ArmSpec[] = EXAM_ARMS.map((a) => examArm(a.id));
  for (let s = 1; s <= 30; s++) arms.push(pickRandomArm(makeRng(9000 + s), 3 + (s % 3), { views: [FIG_VIEWS[s % FIG_VIEWS.length]] }));
  let worst = Infinity;
  let worstId = '';
  let missing = '';
  let tooWide = '';
  let leaders = '';
  for (const arm of arms) {
    // the line-of-sight overlay is only offered for camera arms, whose ẑ_b is horizontal
    const up = arm.view.up;
    const horizontalCamera = Math.abs(arm.R[0][2] * up[0] + arm.R[1][2] * up[1] + arm.R[2][2] * up[2]) < 0.5;
    const m = layoutArmFigure(arm, { overlays: horizontalCamera ? ['screws-s', 'screws-b', 'p', 'sight'] : ['screws-s', 'screws-b', 'p'] });
    if (m.stats.leaderHits && !leaders) leaders = `${arm.id} ${arm.name} (${arm.view.right.join(',')} right): ${m.stats.leaderHits} hits`;
    if (m.stats.minLabelGap < worst) {
      worst = m.stats.minLabelGap;
      worstId = `${arm.id} ${arm.name} (${m.stats.worst})`;
    }
    const lacking = arm.symbols.filter((s) => !m.stats.dims.includes(s) && linVecEval(arm.p, arm.values).every(Number.isFinite));
    if (lacking.length && !missing) missing = `${arm.id}: no dimension for ${lacking.join(', ')}`;
    if ((m.W > 760 || m.H > 620) && !tooWide) tooWide = `${arm.id} ${m.W}×${m.H}`;
  }
  out.push(isTrue(`figures: every length symbol has a dimension line (${arms.length} arms)`, !missing, missing));
  out.push(isTrue('figures: no figure wider than 760 px or taller than 620 px', !tooWide, tooWide));
  out.push(isTrue('figures: labels never overlap the drawing (min gap ≥ −1.5 px; chained dimension lines touch at −1.2)', worst >= -1.5, `${worst.toFixed(1)} px on ${worstId}`));
  out.push(isTrue('figures: no frame leader runs along its own axis arrows or through its own axis labels', !leaders, leaders));
  return out;
}

export const tests: SelfTest[] = [
  { id: 'kin-solve-tables', topic: 'kin', title: 'Exam robots: M and the screw-axis tables equal the worked solutions (typed as printed)', source: '2023 Q33, 2024 Q30, 2025 Q30 worked solutions; review deck slide 20', run: tableChecks },
  { id: 'kin-solve-camera', topic: 'kin', title: 'Camera parts: 2023 18.48 mm (Z = 4.6 m); 2024 78.95 m, base 80.45 m, 50.9 mm; 2025 1.847 m, f = 80 mm', source: '2023 Q33(c), 2024 Q30(c)–(d), 2025 Q30(c)–(d) worked solutions', run: cameraChecks },
  { id: 'kin-solve-poe', topic: 'kin', title: 'PoE: θ = 0 gives M, space = body form, J_s(0) = screw axes', source: 'Modern Robotics ch. 4–5; summary notes §6', run: poeChecks },
  { id: 'kin-solve-figures', topic: 'kin', title: 'Exam-style arm figures: dimensions, size, label clearance (exam robots + 30 random arms)', source: 'Layout self-check', run: figureChecks },
  { id: 'kin-solve-sanity', topic: 'kin', title: 'Kinematics generators: every tier × 40 seeds well formed, answers pass their own checkers, traps named', source: 'Generator sanity', run: () => ALL.flatMap((g) => sanity(g, 40)) },
];
