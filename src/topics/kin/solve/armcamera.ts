// The 15-mark arm + camera long answer (kin-arm-camera): (a) M, (b) the screw table in {s}, (c)–(d) a camera
// on the end effector, solved with the pinhole model h' = f h / Z at the zero configuration.
//   Tier 2: an exam robot with a camera question in the style of its paper, lengths and object sizes redrawn
//           within the papers' ranges (and the paper's own numbers one time in four):
//             A (2023 Q33): image height of a person standing at a given point; depth Z along ẑ_b from p;
//             B (2024 Q30): distance from the BASE to a landmark of known size from its image, then the image
//               after moving closer (Z from the pinhole, plus the camera's offset p·ẑ_b along the line of sight);
//             C (2025 Q30): the arm fully extended up to mast height (lateral distance by Pythagoras from the
//               pivot at joint 2), then the focal length from the image of the mast head.
//           The 2023 and 2024 robots sometimes get the other horizontal-camera style (A ↔ B) for variety.
//   Tier 3: a random arm whose camera looks horizontally, with style A or B (so p·ẑ_b may be negative).
import type { ChoicePart, NumericPart, SolveGenerator, SolvePart, Tier, Given } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { AXIS_ROTATIONS, linEval, linVecEval, type ArmSpec, type Mat3, type Vec3 } from '../../../core/kin';
import { depthFromImage, focalFromImage, imageSize } from '../../../core/camera';
import { tex } from '../../../engine/format';
import { armFigure } from './kinfigArm';
import { axisTeX, examArm, linVecTeX3, mTeX, pathSentence, pickRandomArm, sAxesSentence, screwRow, vecTeX3, type ViewKey } from './kinfigArms';
import { columnReadings, FRAMES_SENTENCE, mMatrixPart, rightHandCheck } from './m';
import { drawnAs, robotIntroS, screwTablePart, screwTableTeX, SHORTCUT_TABLE } from './screws';
import './kinfigTraps';

// ------------------------------------------------------------------ the camera questions (pure, tested)

/** 2023 style: the object's depth along ẑ_b from the camera at c, and its image height (mm; f in mm, h in m). */
export function cameraA(c: Vec3, zb: Vec3, obj: Vec3, h: number, fmm: number) {
  const Z = (obj[0] - c[0]) * zb[0] + (obj[1] - c[1]) * zb[1] + (obj[2] - c[2]) * zb[2];
  return { Z, img: imageSize(fmm, h, Z) };
}

/** 2024 style: depth from the image (m), the base's distance along the line of sight, and the image after moving Δ closer. */
export function cameraB(c: Vec3, zb: Vec3, H: number, fmm: number, imgmm: number, delta: number) {
  const Z = depthFromImage(fmm / 1000, H, imgmm / 1000);
  const offset = c[0] * zb[0] + c[1] * zb[1] + c[2] * zb[2];
  const Z2 = Z - delta;
  return { Z, offset, base: Z + offset, Z2, img2: imageSize(fmm, H, Z2) };
}

/** 2025 style: straight arm of length Lt pivoting at height L1 up to height H; then f (mm) from the image. */
export function cameraC(L1: number, Lt: number, H: number, hmm: number, imgmm: number) {
  const rise = H - L1;
  const lateral = Math.sqrt(Lt * Lt - rise * rise);
  return { rise, lateral, f: focalFromImage(hmm / 1000, imgmm, lateral) };
}

// ------------------------------------------------------------------ arms and numbers

type Style = 'A' | 'B' | 'C';
const OWN: Record<string, Style> = { 'rprr-2023': 'A', 'prr-2024': 'B', 'rrrrr-2025': 'C' };
const RANGES: Record<string, Record<string, [number, number, number]>> = {
  'rprr-2023': { L1: [1.2, 1.8, 0.1], L2: [0.1, 0.4, 0.05], L3: [0.2, 0.8, 0.1] },
  'prr-2024': { L1: [1.0, 2.0, 0.1], L2: [0.1, 0.3, 0.05], L3: [1.0, 2.0, 0.1] },
  'rrrrr-2025': { L1: [0.1, 0.3, 0.05], L2: [0.8, 1.2, 0.1], L3: [0.8, 1.2, 0.1], L4: [0.1, 0.3, 0.05] },
};
const PAPER_VALUES: Record<string, Record<string, number>> = {
  'rprr-2023': { L1: 1.5, L2: 0.2, L3: 0.4 },
  'prr-2024': { L1: 1.5, L2: 0.1, L3: 1.5 },
  'rrrrr-2025': { L1: 0.1, L2: 0.9, L3: 1.0, L4: 0.2 },
};
const LANDMARKS: { name: string; h: number }[] = [
  { name: 'a 60 m tall Ferris wheel', h: 60 },
  { name: 'a 38 m tall water tower', h: 38 },
  { name: 'a 75 m tall office tower', h: 75 },
  { name: 'a 24 m tall gum tree', h: 24 },
  { name: 'a 120 m tall radio mast', h: 120 },
];
const PEOPLE = ['a person', 'a surveyor', 'a technician', 'a visitor'];

const col = (R: Mat3, k: number): Vec3 => [R[0][k], R[1][k], R[2][k]];
const m4 = (x: number) => tex(x, 4);
const r2 = (x: number) => Math.round(x * 100) / 100;
const close = (a: number, b: number, rel = 0.012) => Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-9);

/** The paper-style numeric trap list: drop any that coincide with the answer or each other. */
function trapList(answer: number, ts: { value: number; message: string; trapId?: string }[]) {
  const out: { value: number; message: string; trapId?: string }[] = [];
  for (const t of ts) if (Number.isFinite(t.value) && t.value > 0 && !close(t.value, answer, 0.01) && !out.some((o) => close(o.value, t.value, 0.005))) out.push(t);
  return out;
}

/** A random arm (views with ẑ_s up) whose camera ẑ_b is horizontal and sits above the floor. */
function cameraRandomArm(rng: Rng): ArmSpec {
  const VIEWS: ViewKey[] = ['xOut', 'yIn'];
  const horiz = AXIS_ROTATIONS.filter((R) => Math.abs(R[2][2]) < 0.5);
  let arm = pickRandomArm(rng, rng.int(3, 4), { views: VIEWS });
  for (let k = 0; k < 40; k++) {
    if (linEval(arm.p[2], arm.values) >= 0.4) break;
    arm = pickRandomArm(rng, rng.int(3, 4), { views: VIEWS });
  }
  return { ...arm, R: rng.pick(horiz) };
}

interface CamQ {
  style: Style;
  parts: SolvePart[];
  givens: Given[];
  text: string;
  /** Hint pieces for (c)–(d). */
  setup: string;
  subs: string;
  worked: string;
  /** A configuration worth revealing on the figure (the 2025 arm raised to mast height). */
  pose?: number[];
}

function assumptions(style: Style): ChoicePart {
  const common: ChoicePart['options'] = [
    { text: 'An ideal pinhole camera: no lens distortion, image in focus', correct: true, why: 'The relation $h^{\\prime} = fh/Z$ is the ideal pinhole model; a real lens adds distortion that it ignores.' },
    {
      text: 'The object’s face is perpendicular to the optical axis, so all of it sits at one depth $Z$',
      correct: true,
      why: 'A tilted or deep object has parts at different depths, and $h^{\\prime} = fh/Z$ would need one $Z$ per part.',
    },
    {
      text: 'The depth $Z$ is measured from the robot’s base',
      correct: false,
      why: 'The pinhole $Z$ is measured from the **camera** (the {b} origin) along its optical axis $\\hat z_b$. The base is $p \\cdot \\hat z_b$ away along that line.',
    },
    { text: 'The image height grows in proportion to the distance', correct: false, why: 'It is **inversely** proportional: $h^{\\prime} = fh/Z$, so halving the distance doubles the image.' },
  ];
  if (style === 'C')
    common.splice(2, 0, {
      text: 'The camera points straight at the mast head (gyroscopically controlled), with the mast head centred',
      correct: true,
      why: 'The question lets the camera aim itself, so the depth is the straight-line distance from (c) and the mast head is on the optical axis.',
    });
  else
    common.splice(2, 0, {
      text: 'The object is centred on the optical axis, wholly inside the image',
      correct: true,
      why: 'Then the depth along $\\hat z_b$ is simply the coordinate difference along that axis, and none of the object is cropped.',
    });
  return { kind: 'choice', id: 'assume', label: 'Which assumptions does your camera answer rely on? (Select all that apply.)', options: common, multi: true, marks: 1 };
}

function styleA(rng: Rng, arm: ArmSpec, exact: boolean): CamQ {
  const c = linVecEval(arm.p, arm.values);
  const zb = col(arm.R, 2);
  const k = zb.findIndex((x) => Math.abs(x) > 0.5);
  const s = Math.sign(zb[k]);
  const j = [0, 1].find((a) => a !== k)!; // the other horizontal axis
  const h = exact ? 1.7 : rng.step(1.5, 1.9, 0.05);
  const fmm = exact ? 50 : rng.pick([35, 50, 85]);
  // the object's coordinate along the viewing axis: a round number at least 2 m ahead of the camera
  let along = exact ? 5 : rng.step(3, 9, 0.5);
  if (!exact) while (along - s * c[k] < 2 || imageSize(fmm, h, along - s * c[k]) > 50) along += 1;
  const obj: Vec3 = [0, 0, 0];
  obj[k] = s * along;
  obj[j] = r2(c[j]);
  const { Z, img } = cameraA(c, zb, obj, h, fmm);
  const who = exact ? 'a person' : rng.pick(PEOPLE);
  const straight = Math.hypot(Z, c[2]);
  const fromBase = along;
  const added = along + s * c[k];
  // the camera's offset from the base along the viewing direction, in words and in the subtraction
  const off = s * c[k];
  const zExpr = off >= 0 ? `${m4(along)} - ${m4(off)}` : `${m4(along)} + ${m4(-off)}`;
  const where = off >= 0 ? `${m4(off)} m ahead of the base (towards the object)` : `${m4(-off)} m behind the base (further from the object)`;
  const zPart: NumericPart = {
    kind: 'numeric',
    id: 'Z',
    label: `(c) The depth $Z$ of the ${who.replace(/^a /, '')} from the camera, along its optical axis`,
    answer: Z,
    unit: 'm',
    tol: 0.01,
    traps: trapList(Z, [
      { value: fromBase, message: `That is the distance from the **base** along $${axisTeX(zb)}$. The camera is not at the base: it sits at $p$, ${where} along the viewing direction, so $Z = ${zExpr}$.`, trapId: 'depth-from-camera' },
      { value: straight, message: 'That is the straight-line distance from the camera to the feet. The pinhole $Z$ is the component along the optical axis $\\hat z_b$, not the length of the line of sight to one point.', trapId: 'kin-camera-straight-line' },
      { value: added, message: `The camera’s offset went the wrong way: it sits ${where} along $\\hat z_b$, so $Z = ${zExpr}$.`, trapId: 'depth-from-camera' },
    ]),
    marks: 1,
  };
  const imgPart: NumericPart = {
    kind: 'numeric',
    id: 'img',
    label: `(c) How tall is the person in the image plane?`,
    answer: img,
    unit: 'mm',
    tol: 0.01,
    traps: trapList(img, [
      { value: imageSize(fmm, h, fromBase), message: `That uses $Z$ = ${m4(fromBase)} m, the distance from the base. Depth is measured from the **camera**: $Z$ = ${m4(Z)} m.`, trapId: 'depth-from-camera' },
      { value: imageSize(fmm, h, straight), message: 'That divides by the straight-line distance to the feet. $Z$ is the depth along the optical axis.', trapId: 'kin-camera-straight-line' },
      { value: (Z * h) / fmm, message: 'The pinhole relation is $h^{\\prime} = fh/Z$: multiply by the focal length, divide by the depth.', trapId: 'kin-camera-inverse' },
    ]),
    marks: 1,
  };
  const text = `With the arm in its zero configuration and ${givenLengths(arm)}, a camera mounted at the end-effector frame $\\{b\\}$ observes ${who}, ${m4(h)} m tall, standing at $(${obj.map(m4).join(', ')})$ (coordinates in $\\{s\\}$). The camera has a focal length of ${fmm} mm; the person is in focus and wholly in the image.`;
  const givens: Given[] = [
    { sym: 'f', value: `${fmm} mm`, label: 'focal length' },
    { sym: 'h', value: `${m4(h)} m`, label: 'height of the person' },
    { sym: 'X', value: `$(${obj.map(m4).join(', ')})$ m`, label: 'where the person stands, in {s}' },
  ];
  const setup = `(c) The camera is at the $\\{b\\}$ origin, $p$ with the lengths substituted, and looks along $\\hat z_b = ${axisTeX(zb)}$ (the third column of $R$). The depth is the component of (person − camera) along that axis, $Z = (X - p)\\cdot\\hat z_b$; then $h^{\\prime} = fh/Z$ with $f$ in metres.`;
  const subs = `(c) $p = (${c.map(m4).join(', ')})$ m and $\\hat z_b = ${axisTeX(zb)}$, so $Z = ${s > 0 ? '' : '-'}(${m4(obj[k])} - (${m4(c[k])})) = ${m4(Z)}$ m; $h^{\\prime} = \\dfrac{${m4(fmm / 1000)} \\times ${m4(h)}}{${m4(Z)}}$.`;
  const worked = `(c) Depth from the camera, which is ${where}: $Z = ${zExpr} = $ **${m4(Z)} m**, so $$h^{\\prime} = \\frac{fh}{Z} = \\frac{${m4(fmm / 1000)} \\times ${m4(h)}}{${m4(Z)}} = ${m4(img / 1000)}\\ \\text{m} \\;\\Rightarrow\\; \\textbf{${m4(img)} mm}$$ (Using the distance from the base, ${m4(fromBase)} m, would give ${m4(imageSize(fmm, h, fromBase))} mm.) Assumptions: ideal pinhole, in focus, the person centred on and perpendicular to the optical axis.`;
  return { style: 'A', parts: [zPart, imgPart], givens, text, setup, subs, worked };
}

function styleB(rng: Rng, arm: ArmSpec, exact: boolean): CamQ {
  const c = linVecEval(arm.p, arm.values);
  const zb = col(arm.R, 2);
  let lm = exact ? { name: 'the 60 m tall Wheel of Brisbane', h: 60 } : rng.pick(LANDMARKS);
  let fmm = exact ? 50 : rng.pick([35, 50, 70, 85]);
  let imgmm = 38;
  if (!exact)
    for (let k = 0; k < 30; k++) {
      // an image height like the paper's (38 mm), 12–48 mm, at a depth of 40–200 m
      const lo = Math.max(12, Math.ceil((fmm * lm.h) / 200));
      const hi = Math.min(48, Math.floor((fmm * lm.h) / 40));
      if (lo <= hi) {
        imgmm = rng.int(lo, hi);
        break;
      }
      lm = rng.pick(LANDMARKS);
      fmm = rng.pick([35, 50, 70, 85]);
    }
  const delta0 = exact ? 20 : rng.step(10, 30, 5);
  const Zpre = depthFromImage(fmm / 1000, lm.h, imgmm / 1000);
  // at most 40 % closer (the paper: 20 m of 78.95 m), so the new image stays a plausible size
  const delta = Math.min(delta0, Math.floor((0.4 * Zpre) / 5) * 5 || 5);
  const res = cameraB(c, zb, lm.h, fmm, imgmm, delta);
  const zPart: NumericPart = {
    kind: 'numeric',
    id: 'Z',
    label: '(c) The depth $Z$ of the object from the camera',
    answer: res.Z,
    unit: 'm',
    tol: 0.01,
    traps: trapList(res.Z, [{ value: (imgmm * lm.h) / fmm, message: 'Rearrange $h^{\\prime} = fh/Z$ for the depth: $Z = fh/h^{\\prime}$.', trapId: 'kin-camera-inverse' }]),
    marks: 1,
  };
  const basePart: NumericPart = {
    kind: 'numeric',
    id: 'base',
    label: '(c) How far is the **base** of the robot arm from the object (along the line of sight)?',
    answer: res.base,
    unit: 'm',
    tol: 0.01,
    traps: trapList(res.base, [
      { value: res.Z, message: `That is the distance from the **camera**. The base is ${m4(Math.abs(res.offset))} m ${res.offset >= 0 ? 'further back' : 'further forward'} along the line of sight ($p \\cdot \\hat z_b$ = ${m4(res.offset)} m), so add $p \\cdot \\hat z_b$ to $Z$.`, trapId: 'kin-camera-offset' },
      { value: res.Z - res.offset, message: `Right size of offset, wrong direction: the camera is ${m4(Math.abs(res.offset))} m ${res.offset >= 0 ? 'ahead of' : 'behind'} the base along $\\hat z_b$, so the base is ${res.offset >= 0 ? 'further from' : 'closer to'} the object than the camera.`, trapId: 'kin-camera-offset' },
    ]),
    marks: 1,
  };
  const img2Part: NumericPart = {
    kind: 'numeric',
    id: 'img2',
    label: `(d) The camera is moved ${delta} m closer to the object. How tall does it now appear in the image plane?`,
    answer: res.img2,
    unit: 'mm',
    tol: 0.01,
    traps: trapList(res.img2, [
      { value: imageSize(fmm, lm.h, res.base - delta), message: `That subtracts ${delta} m from the base distance. The pinhole needs the new depth from the **camera**: $Z^{\\prime} = ${m4(res.Z)} - ${delta}$.`, trapId: 'depth-from-camera' },
      { value: (imgmm * res.Z2) / res.Z, message: 'Image size is **inversely** proportional to depth: moving closer makes the object look bigger, $h^{\\prime\\prime} = h^{\\prime} Z/Z^{\\prime}$.', trapId: 'kin-camera-inverse' },
    ]),
    marks: 2,
  };
  const text = `With the arm in its zero configuration and ${givenLengths(arm)}, a camera mounted at the end-effector frame $\\{b\\}$ observes ${lm.name}, which appears ${imgmm} mm tall in the image plane. The object is in focus and fully in the image, and the camera has a focal length of ${fmm} mm.`;
  const givens: Given[] = [
    { sym: 'f', value: `${fmm} mm`, label: 'focal length' },
    { sym: 'h', value: `${lm.h} m`, label: 'true height of the object' },
    { sym: "h'", value: `${imgmm} mm`, label: 'its height in the image' },
  ];
  const setup = `(c) The pinhole model rearranged for depth: $Z = fh/h^{\\prime}$ (metres throughout). That $Z$ is measured from the **camera**, which is at $p$ and looks along $\\hat z_b = ${axisTeX(zb)}$. The base is at the origin, so along the line of sight it is $p \\cdot \\hat z_b$ behind the camera: $d_{\\text{base}} = Z + p\\cdot\\hat z_b$. (d) Moving $\\Delta$ closer makes the depth $Z^{\\prime} = Z - \\Delta$ and $h^{\\prime\\prime} = fh/Z^{\\prime}$.`;
  const subs = `(c) $Z = \\dfrac{${m4(fmm / 1000)} \\times ${lm.h}}{${m4(imgmm / 1000)}} = ${m4(res.Z)}$ m. $p = (${c.map(m4).join(', ')})$ m, so $p \\cdot \\hat z_b = ${m4(res.offset)}$ m. (d) $Z^{\\prime} = ${m4(res.Z)} - ${delta} = ${m4(res.Z2)}$ m.`;
  const worked = `(c) $$Z = \\frac{fh}{h^{\\prime}} = \\frac{${m4(fmm / 1000)} \\times ${lm.h}}{${m4(imgmm / 1000)}} = \\textbf{${m4(res.Z)} m} \\text{ from the camera},$$ and the camera is ${m4(Math.abs(res.offset))} m ${res.offset >= 0 ? 'ahead of' : 'behind'} the base along the line of sight ($p \\cdot \\hat z_b = ${m4(res.offset)}$ m), so $d_{\\text{base}} = ${m4(res.Z)} ${res.offset >= 0 ? '+' : '-'} ${m4(Math.abs(res.offset))} = $ **${m4(res.base)} m**. Assumptions: ideal pinhole; the object centred on and perpendicular to the optical axis; the small sideways and height offsets of the camera are negligible at this range.\n\n(d) $$Z^{\\prime} = ${m4(res.Z)} - ${delta} = ${m4(res.Z2)}\\ \\text{m}, \\qquad h^{\\prime\\prime} = \\frac{fh}{Z^{\\prime}} = \\frac{${m4(fmm / 1000)} \\times ${lm.h}}{${m4(res.Z2)}} = \\textbf{${m4(res.img2)} mm}$$ Check: $${imgmm} \\times ${m4(res.Z)}/${m4(res.Z2)} = ${m4(res.img2)}$: closer means bigger.`;
  return { style: 'B', parts: [zPart, basePart, img2Part], givens, text, setup, subs, worked };
}

function styleC(rng: Rng, arm: ArmSpec, exact: boolean): CamQ {
  const v = arm.values;
  const Lt = v.L2 + v.L3 + v.L4;
  const H = exact ? 1.1 : rng.step(Math.max(0.8, v.L1 + 0.5), Math.min(1.6, v.L1 + 0.75 * Lt), 0.05);
  const hmm = exact ? 163 : rng.int(140, 190);
  const rise = H - v.L1;
  const lateral0 = Math.sqrt(Lt * Lt - rise * rise);
  const ftrue = rng.step(40, 120, 5);
  const imgmm = exact ? 7.06 : r2((ftrue * (hmm / 1000)) / lateral0);
  const res = cameraC(v.L1, Lt, H, hmm, imgmm);
  const latPart: NumericPart = {
    kind: 'numeric',
    id: 'lat',
    label: '(c) The lateral (horizontal) distance from the camera to the mast head when the photo was taken',
    answer: res.lateral,
    unit: 'm',
    tol: 0.01,
    traps: trapList(res.lateral, [
      { value: Math.sqrt(Math.max(0, Lt * Lt - H * H)), message: `The straight arm pivots at joint 2, which is already $L_1$ = ${m4(v.L1)} m up, so it only rises $${m4(H)} - ${m4(v.L1)} = ${m4(rise)}$ m.`, trapId: 'kin-camera-rise' },
      { value: Math.sqrt(Math.max(0, (v.L2 + v.L3) ** 2 - rise * rise)), message: 'Fully extended, the camera is at the end of $L_4$ as well: $L_2 + L_3 + L_4$ form one straight segment from joint 2.', trapId: 'kin-camera-rise' },
      { value: Lt - rise, message: 'The arm is the hypotenuse of a right triangle (rise vertical, lateral distance horizontal): use Pythagoras, not a difference of lengths.', trapId: 'kin-camera-rise' },
    ]),
    marks: 3,
  };
  const fPart: NumericPart = {
    kind: 'numeric',
    id: 'f',
    label: `(d) The mast head is ${hmm} mm tall and appears ${imgmm} mm tall in the image. What focal length was used?`,
    answer: res.f,
    unit: 'mm',
    tol: 0.01,
    traps: trapList(res.f, [
      { value: (imgmm * Math.sqrt(Math.max(0, Lt * Lt - H * H))) / (hmm / 1000), message: 'That uses the lateral distance from the full mast height. Depth = the lateral distance from (c), with the rise measured from joint 2.', trapId: 'kin-camera-rise' },
      { value: (imgmm * Lt) / (hmm / 1000), message: `The depth is the horizontal distance to the mast head (${m4(res.lateral)} m), not the arm length.`, trapId: 'depth-from-camera' },
    ]),
    marks: 2,
  };
  const text = `The link lengths are ${givenLengths(arm)}. The camera at $\\{b\\}$ takes a photo of the rover’s mast head, which sits ${m4(H)} m directly above the static frame $\\{s\\}$. When the photo was taken the arm was **fully extended** (joints 3 and 4 straight) and raised so that the camera was at the height of the mast head; assume the camera can be pointed in any direction.`;
  const givens: Given[] = [
    { sym: 'H', value: `${m4(H)} m`, label: 'mast-head height above {s}' },
    { sym: 'h', value: `${hmm} mm`, label: 'true mast-head height' },
    { sym: "h'", value: `${imgmm} mm`, label: 'its height in the image' },
  ];
  const setup = `(c) Fully extended, $L_2 + L_3 + L_4$ form one straight segment pivoting at joint 2, which is $L_1$ above $\\{s\\}$ (and directly below the mast head). That segment is the hypotenuse of a right triangle: vertical side = the rise $H - L_1$, horizontal side = the lateral distance. (d) Pinhole rearranged for the focal length, $f = h^{\\prime}Z/h$, with $Z$ = the lateral distance.`;
  const subs = `(c) Length $L_2 + L_3 + L_4 = ${m4(Lt)}$ m, rise $= ${m4(H)} - ${m4(v.L1)} = ${m4(rise)}$ m, so $d = \\sqrt{${m4(Lt)}^2 - ${m4(rise)}^2}$. (d) $f = \\dfrac{${imgmm}\\ \\text{mm} \\times ${m4(res.lateral)}\\ \\text{m}}{${m4(hmm / 1000)}\\ \\text{m}}$.`;
  const worked = `(c) $$d = \\sqrt{(L_2 + L_3 + L_4)^2 - (H - L_1)^2} = \\sqrt{${m4(Lt)}^2 - ${m4(rise)}^2} = \\sqrt{${m4(Lt * Lt - rise * rise)}} = \\textbf{${m4(res.lateral)} m}$$ The mast head is directly above $\\{s\\}$ (above joint 2), so this horizontal offset is the camera-to-mast-head distance at equal height.\n\n(d) $$f = \\frac{h^{\\prime} Z}{h} = \\frac{${imgmm}\\ \\text{mm} \\times ${m4(res.lateral)}\\ \\text{m}}{${m4(hmm / 1000)}\\ \\text{m}} = \\textbf{${m4(res.f)} mm}$$ Assumptions: ideal pinhole, in focus; the camera points straight at the mast head, whose face is perpendicular to the optical axis; the depth of the mast-head box itself is ignored.`;
  // joint 2 turns about +ŷ_s; a negative angle lifts the +x̂_s arm by asin(rise / length)
  const pose = arm.joints.map((_, i) => (i === 1 ? -Math.asin(Math.min(1, rise / Lt)) : 0));
  return { style: 'C', parts: [latPart, fPart], givens, text, setup, subs, worked, pose };
}

function givenLengths(arm: ArmSpec): string {
  return arm.symbols.map((s) => `$${s.replace(/^([A-Za-z]+)(\d+)$/, '$1_$2')}$ = ${m4(arm.values[s])} m`).join(', ');
}

/** One whole instance (exported so the tests can force the papers' own numbers). */
export function armCameraInstance(rng: Rng, arm: ArmSpec, style: Style, exact: boolean) {
  const cam = style === 'A' ? styleA(rng, arm, exact) : style === 'B' ? styleB(rng, arm, exact) : styleC(rng, arm, exact);
  const n = arm.joints.length;
  const parts: SolvePart[] = [
    mMatrixPart(arm, { labels: true, marks: 4, id: 'M', label: '(a) $M$, the initial configuration of $\\{b\\}$ in $\\{s\\}$ (lengths as symbols)' }),
    screwTablePart(arm, 's', { marks: n >= 5 ? 5 : n === 4 ? 8 : 6, id: 'table', label: '(b) The screw-axis table in $\\{s\\}$: one row $\\mathcal{S}_i = (\\omega_i, v_i)$ per joint' }),
  ];
  parts.push(...cam.parts, assumptions(style));
  return { cam, parts };
}

export function chooseArm(rng: Rng, tier: Tier): { arm: ArmSpec; style: Style; exact: boolean } {
  if (tier === 3) {
    const arm = cameraRandomArm(rng);
    return { arm, style: rng.chance(0.5) ? 'A' : 'B', exact: false };
  }
  const id = rng.pick(['rprr-2023', 'prr-2024', 'rrrrr-2025']);
  const base = examArm(id);
  const own = rng.chance(0.65) || id === 'rrrrr-2025';
  const style: Style = own ? OWN[id] : OWN[id] === 'A' ? 'B' : 'A';
  const exact = own && rng.chance(0.25);
  const values = exact ? { ...PAPER_VALUES[id] } : Object.fromEntries(Object.entries(RANGES[id]).map(([k, [a, b, s]]) => [k, rng.step(a, b, s)]));
  return { arm: { ...base, values }, style, exact };
}

const CONCEPT =
  'The three parts chain together. (a) $M = \\begin{bmatrix} R & p \\\\ 0 & 1 \\end{bmatrix}$: the columns of $R$ are $\\hat x_b, \\hat y_b, \\hat z_b$ written in $\\{s\\}$ and $p$ is the $\\{b\\}$ origin in $\\{s\\}$. (b) One screw axis per joint: revolute $v = -\\omega \\times q$, prismatic $\\omega = 0$. (c) The camera sits at $p$ and looks along $\\hat z_b$ (the third column of $R$), so the depth in the pinhole model $h^{\\prime} = fh/Z$ is measured **from the camera, along $\\hat z_b$**: $Z = (X - p)\\cdot\\hat z_b$. A sign slip in (a) moves the camera or turns it around, so check $\\det R = +1$ before (c).';

export const generators: SolveGenerator[] = [
  {
    id: 'kin-arm-camera',
    title: 'The arm + camera long answer: M, screw table, pinhole camera',
    summary: 'The 15-mark question of every recent paper: build $M$, fill the screw-axis table in $\\{s\\}$, then use the camera at $\\{b\\}$ with $h^{\\prime} = fh/Z$, the depth measured from the camera along $\\hat z_b$.',
    tiers: [2, 3],
    source: 'Similar to 2023 Q33, 2024 Q30, 2025 Q30 (15 marks each); summary notes §6–§7',
    cardId: 'kin-arm-camera',
    marks: 15,
    sprint: false,
    generate(rng, tier) {
      const { arm, style, exact } = chooseArm(rng, tier);
      const { cam, parts } = armCameraInstance(rng, arm, style, exact);
      const figure = armFigure(arm, {
        reveals: [
          { id: 'p', label: 'p on the figure' },
          { id: 'screws-s', label: 'ω and q' },
          cam.pose ? { id: 'pose', label: 'the arm raised to mast height' } : { id: 'sight', label: 'the camera’s line of sight' },
        ],
        pose: cam.pose,
      });
      const prompt = [
        `${robotIntroS(arm)} ${FRAMES_SENTENCE}`,
        '(a) Compute the initial configuration $M$ of the body frame in the static frame. (b) With the screw axes defined in frame $\\{s\\}$, fill in $\\mathcal{S}_i = (\\omega_i, v_i)$ for every joint.',
        `(c)${cam.style === 'C' ? '–(d)' : cam.style === 'B' ? '–(d)' : ''} ${cam.text}`,
      ].join('\n\n');
      const zb = col(arm.R, 2);
      const moves = pathSentence(arm);
      const hints: [string, string, string, string] = [
        CONCEPT,
        `On this figure ${sAxesSentence(arm.view)}. (a) Translate each drawn $\\{b\\}$ arrow into an $\\{s\\}$ axis and write it as a **column** of $R$; walk from $\\{s\\}$ to $\\{b\\}$ along the links for $p$. (b) For each joint: its type, $\\omega_i$ (axis plus right-hand rule on the arrow), a point $q_i$ on the axis, then $v_i = -\\omega_i \\times q_i$: ${SHORTCUT_TABLE} ${cam.setup}`,
        [
          `(a) ${columnReadings(arm)}. ${moves ? `Walking to $\\{b\\}$: ${moves}, so $p = ${linVecTeX3(arm.p)}$.` : `$p = ${linVecTeX3(arm.p)}$.`} The camera looks along $\\hat z_b = ${axisTeX(zb)}$ (drawn ${drawnAs(zb, arm.view)}).`,
          `(b) ${arm.joints
            .map((J, i) => {
              const r = screwRow(arm, i, 's');
              return J.type === 'P'
                ? `joint ${i + 1} (P): $\\omega = 0$, $v = ${linVecTeX3(r.v)}$`
                : `joint ${i + 1} (R): $\\omega = ${vecTeX3(r.w)}$, $q = ${linVecTeX3(r.q!)}$, $v = -\\omega \\times q = ${linVecTeX3(r.v)}$`;
            })
            .join('; ')}.`,
          cam.subs,
        ].join('\n\n'),
        [
          `(a) $$M = ${mTeX(arm.R, arm.p)}$$ Check: ${rightHandCheck(arm)}.`,
          `(b) ${screwTableTeX(arm, 's')}`,
          cam.worked,
        ].join('\n\n'),
      ];
      return { prompt, givens: [...arm.symbols.map((s) => ({ sym: s.replace(/^([A-Za-z]+)(\d+)$/, '$1_$2'), value: `${m4(arm.values[s])} m`, label: 'link length (for the camera part)' })), ...cam.givens], figure, parts, hints };
    },
  },
];
