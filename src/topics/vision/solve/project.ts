// vision-project: world → pixel with K, R, t, and back again (summary notes §7 "Image formation"; review deck slides
// 21-22; the Q14 intrinsic / extrinsic trap of 2023-2025).
//   Tier 1: a point already in the camera frame → (u, v) with K.
//   Tier 2: a world point → X_c = R X_w + t → (u, v), plus an intrinsic / extrinsic question.
//   Tier 3: back-projection: a pixel and a measured depth → the normalised ray → the world point; what one pixel gives.
import type { SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { tex } from '../../../engine/format';
import { mv, tr, type Mat3, type V3 } from '../../../core/vision';

const t4 = (x: number) => tex(Math.abs(x) < 1e-12 ? 0 : x, 4);
const PX = { tol: 0.002, absTol: 0.6 };
const M = { tol: 0.005, absTol: 0.005 };

interface View {
  R: Mat3;
  desc: string;
}
const VIEWS: View[] = [
  {
    R: [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ],
    desc: 'looks horizontally along $+\\hat{y}_w$ (world $\\hat{z}_w$ up)',
  },
  {
    R: [
      [0, -1, 0],
      [0, 0, -1],
      [1, 0, 0],
    ],
    desc: 'looks horizontally along $+\\hat{x}_w$ (world $\\hat{z}_w$ up)',
  },
  {
    R: [
      [0, 1, 0],
      [0, 0, -1],
      [-1, 0, 0],
    ],
    desc: 'looks horizontally along $-\\hat{x}_w$ (world $\\hat{z}_w$ up)',
  },
  {
    R: [
      [0, -1, 0],
      [-1, 0, 0],
      [0, 0, -1],
    ],
    desc: 'looks straight down, along $-\\hat{z}_w$',
  },
];

const IMGS = [
  { w: 640, h: 480, f: [400, 500, 600, 800] },
  { w: 800, h: 600, f: [500, 600, 800, 1000] },
  { w: 1280, h: 720, f: [800, 1000, 1200] },
];

const num = (label: string, id: string, answer: number, unit: string, tol: { tol: number; absTol: number }, traps: { value: number; message: string; trapId?: string }[] = [], marks = 1): SolvePart => ({
  kind: 'numeric',
  id,
  label,
  answer,
  unit,
  ...tol,
  marks,
  traps: traps.filter((t) => Number.isFinite(t.value) && Math.abs(t.value - answer) > Math.max(3 * tol.absTol, 0.02 * Math.abs(answer))),
});

const matTeX = (A: number[][]) => `\\begin{bmatrix} ${A.map((r) => r.map(t4).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const vecTeX = (v: number[]) => matTeX(v.map((x) => [x]));

const STAGES = `World to pixel in three stages:

1. **Extrinsics** (where the camera is): $X_c = R\\,X_w + t$, the point in the camera frame ($\\hat{x}_c$ right, $\\hat{y}_c$ down, $\\hat{z}_c$ along the optical axis).
2. **Perspective division**: $x = X_c/Z_c$, $y = Y_c/Z_c$ (normalised image coordinates; the depth is lost here).
3. **Intrinsics** (inside the camera): $(u, v, 1)^T = K\\,(x, y, 1)^T$, i.e. $u = \\alpha_x x + s\\,y + u_0$, $v = \\alpha_y y + v_0$.`;

function camera(rng: Rng) {
  const img = rng.pick(IMGS);
  const ax = rng.pick(img.f);
  const ay = rng.chance(0.3) ? ax + rng.pick([-20, -10, 10, 20]) : ax;
  const u0 = img.w / 2;
  const v0 = img.h / 2;
  const K: Mat3 = [
    [ax, 0, u0],
    [0, ay, v0],
    [0, 0, 1],
  ];
  return { img, ax, ay, u0, v0, K };
}

/** A camera-frame point in front of the camera whose image lies well inside the frame. */
function pointInView(rng: Rng, c: ReturnType<typeof camera>): V3 {
  const Z = rng.step(2, 7, 0.5);
  const xl = Math.floor(((0.8 * c.u0 * Z) / c.ax) * 10) / 10;
  const yl = Math.floor(((0.8 * c.v0 * Z) / c.ay) * 10) / 10;
  let X = rng.step(-xl, xl, 0.1);
  let Y = rng.step(-yl, yl, 0.1);
  if (Math.abs(X) < 0.05) X = 0.3;
  if (Math.abs(Y) < 0.05) Y = -0.2;
  return [Number(X.toFixed(2)), Number(Y.toFixed(2)), Z];
}

const kTeX = (c: ReturnType<typeof camera>) => matTeX(c.K);

// ------------------------------------------------------------------ intrinsic / extrinsic choices

interface Opt {
  text: string;
  correct: boolean;
  why: string;
}
function paramChoice(rng: Rng): SolvePart {
  const style = rng.pick(['intr', 'extr', 'move', 'turn'] as const);
  const INTR: Opt[] = [
    { text: 'the focal length in pixels, $\\alpha_x$', correct: true, why: 'It is fixed by the lens and the pixel size: inside the camera, in $K$.' },
    { text: 'the principal point $(u_0, v_0)$', correct: true, why: 'Where the optical axis meets the sensor: inside the camera, in $K$.' },
    { text: 'the skew $s$', correct: true, why: 'The angle between the pixel axes: a sensor property, in $K$.' },
    { text: 'the lens distortion coefficients', correct: true, why: 'A property of the lens, estimated with $K$ during calibration.' },
  ];
  const EXTR: Opt[] = [
    { text: 'the camera’s 3-D position', correct: true, why: 'Where the camera is in the world: extrinsic (it sets $t = -RC$).' },
    { text: 'the camera’s 3-D orientation', correct: true, why: 'How the camera is turned in the world: extrinsic, the rotation $R$.' },
  ];
  const NOTP: Opt = { text: 'the range to the object', correct: false, why: 'Range is a measurement of the scene (a lidar measures it), not a parameter of the camera model.' };
  if (style === 'intr' || style === 'extr') {
    const intr = style === 'intr';
    const key = intr ? rng.pick(INTR) : rng.pick(EXTR);
    const wrongs = intr
      ? EXTR.map((o) => ({ ...o, correct: false, why: `${o.why} So it is not intrinsic.` }))
      : rng.shuffle(INTR).slice(0, 2).map((o) => ({ ...o, correct: false, why: `${o.why} So it is not extrinsic.` }));
    return {
      kind: 'choice',
      id: 'param',
      label: `Which of these is an **${intr ? 'intrinsic' : 'extrinsic'}** parameter of the camera?`,
      options: [{ ...key, correct: true }, ...wrongs, NOTP],
      marks: 1,
    };
  }
  if (style === 'move')
    return {
      kind: 'choice',
      id: 'param',
      label: 'The robot now moves the camera 0.5 m straight forward along its optical axis, without turning it. Which parameters change?',
      options: [
        { text: 'Only $t$ (extrinsic)', correct: true, why: 'The centre $C$ moves and $R$ is unchanged, so $t = -RC$ changes. $K$ belongs to the camera and does not care where it is.' },
        { text: 'Only $K$: the object gets bigger in the image', correct: false, why: 'The image does grow, but because $Z_c$ falls, not because $K$ changed. Zooming (changing $\\alpha_x$) would be a change of $K$.' },
        { text: 'Both $R$ and $t$', correct: false, why: 'The camera did not turn, so $R$ is unchanged.' },
        { text: 'None of $K$, $R$, $t$: only the scene changed', correct: false, why: 'The camera moved relative to the world, so its extrinsics changed.' },
      ],
      marks: 1,
    };
  return {
    kind: 'choice',
    id: 'param',
    label: 'The camera now pans 10° about a vertical axis through its optical centre (its centre does not move). Which parameters change?',
    options: [
      { text: '$R$, and $t$ with it (because $t = -RC$)', correct: true, why: 'Orientation is extrinsic, so $R$ changes; and since $t = -RC$, $t$ changes too unless $C$ is the origin. $K$ is untouched.' },
      { text: 'Only $K$', correct: false, why: 'Turning the camera does not change the lens or the sensor.' },
      { text: '$K$ and $R$', correct: false, why: 'Orientation is extrinsic; $K$ (focal length, principal point, skew) is unchanged.' },
      { text: 'Nothing: the camera stayed in the same place', correct: false, why: '3-D orientation is an extrinsic parameter just like position (the Q14 trap).' },
    ],
    marks: 1,
  };
}

// ------------------------------------------------------------------ tiers

function tier1(rng: Rng): SolveInstance {
  const c = camera(rng);
  const Xc = pointInView(rng, c);
  const x = Xc[0] / Xc[2];
  const y = Xc[1] / Xc[2];
  const u = c.ax * x + c.u0;
  const v = c.ay * y + c.v0;
  return {
    prompt: `A ${c.img.w} × ${c.img.h} camera has intrinsic matrix $K = ${kTeX(c)}$ (pixels). A point is at $X_c = (${t4(Xc[0])}, ${t4(Xc[1])}, ${t4(Xc[2])})$ m in the camera frame ($\\hat{x}_c$ right, $\\hat{y}_c$ down, $\\hat{z}_c$ forward). Where is it in the image?`,
    givens: [
      { sym: '\\alpha_x, \\alpha_y', value: `${c.ax}, ${c.ay} px`, label: 'focal lengths in pixels' },
      { sym: '(u_0, v_0)', value: `(${c.u0}, ${c.v0}) px`, label: 'principal point' },
      { sym: 'X_c', value: `(${t4(Xc[0])}, ${t4(Xc[1])}, ${t4(Xc[2])}) m`, label: 'point in the camera frame' },
    ],
    parts: [
      num('$u$', 'u', u, 'px', PX, [
        { value: c.ax * x, message: 'You left out the principal point: $u = \\alpha_x x + u_0$.' },
        { value: c.ax * Xc[0] + c.u0, message: 'Divide by the depth first: $x = X_c / Z_c$.' },
        { value: c.ax * y + c.u0, message: '$u$ goes with $X_c$ (right), $v$ with $Y_c$ (down).' },
      ]),
      num('$v$', 'v', v, 'px', PX, [
        { value: c.ay * y, message: 'You left out the principal point: $v = \\alpha_y y + v_0$.' },
        { value: c.ay * Xc[1] + c.v0, message: 'Divide by the depth first: $y = Y_c / Z_c$.' },
      ]),
    ],
    hints: [
      `${STAGES}\n\nHere the point is already in the camera frame, so start at stage 2.`,
      `$$x = \\frac{X_c}{Z_c}, \\quad y = \\frac{Y_c}{Z_c}, \\qquad u = \\alpha_x x + u_0, \\quad v = \\alpha_y y + v_0$$`,
      `$$x = \\frac{${t4(Xc[0])}}{${t4(Xc[2])}} = ${t4(x)}, \\quad y = \\frac{${t4(Xc[1])}}{${t4(Xc[2])}} = ${t4(y)}$$\n\n$$u = ${c.ax} \\times ${t4(x)} + ${c.u0}, \\qquad v = ${c.ay} \\times ${t4(y)} + ${c.v0}$$`,
      `$$\\begin{array}{l|l} x = X_c/Z_c & ${t4(x)} \\\\ y = Y_c/Z_c & ${t4(y)} \\\\ u = \\alpha_x x + u_0 & ${t4(u)} \\\\ v = \\alpha_y y + v_0 & ${t4(v)} \\end{array}$$\n\n**$(u, v)$ = (${t4(u)}, ${t4(v)}) px.** Negative $X_c$ lands left of the principal point; negative $Y_c$ (up) lands above it, because $v$ counts down.`,
    ],
  };
}

function worldSetup(rng: Rng) {
  const c = camera(rng);
  const view = rng.pick(VIEWS);
  const C: V3 = [rng.step(-3, 3, 0.5), rng.step(-3, 3, 0.5), view.desc.includes('down') ? rng.step(3, 5, 0.5) : rng.step(0.5, 2, 0.5)];
  const t = mv(view.R, C).map((x) => -x + 0) as V3;
  const Xc = pointInView(rng, c);
  const Xw = mv(tr(view.R), Xc).map((x, i) => Number((x + C[i]).toFixed(3))) as V3;
  return { c, view, C, t, Xc, Xw };
}

function tier2(rng: Rng): SolveInstance {
  const { c, view, t, Xc, Xw } = worldSetup(rng);
  const x = Xc[0] / Xc[2];
  const y = Xc[1] / Xc[2];
  const u = c.ax * x + c.u0;
  const v = c.ay * y + c.v0;
  const RtX = mv(tr(view.R), Xw).map((a, i) => a + t[i]);
  const noT = mv(view.R, Xw);
  return {
    prompt: `A ${c.img.w} × ${c.img.h} camera has the intrinsics $K$ and extrinsics $R$, $t$ below, with $X_c = R X_w + t$ ($\\hat{x}_c$ right, $\\hat{y}_c$ down, $\\hat{z}_c$ forward; the camera ${view.desc}). Find where the world point $X_w$ is in the camera frame and in the image.`,
    givens: [
      { sym: 'K', value: `$${kTeX(c)}$`, label: 'intrinsics (px)' },
      { sym: 'R', value: `$${matTeX(view.R)}$`, label: 'world → camera rotation' },
      { sym: 't', value: `$${vecTeX(t)}$ m`, label: 'translation' },
      { sym: 'X_w', value: `(${t4(Xw[0])}, ${t4(Xw[1])}, ${t4(Xw[2])}) m`, label: 'world point' },
    ],
    layout: 'side',
    parts: [
      num('$X_c$', 'Xc', Xc[0], 'm', M, [
        { value: RtX[0], message: 'That uses $R^T$. The extrinsics map world to camera: $X_c = R X_w + t$.' },
        { value: noT[0], message: 'You forgot to add $t$.' },
      ]),
      num('$Y_c$', 'Yc', Xc[1], 'm', M, [
        { value: RtX[1], message: 'That uses $R^T$. Use $X_c = R X_w + t$.' },
        { value: noT[1], message: 'You forgot to add $t$.' },
      ]),
      num('$Z_c$ (depth)', 'Zc', Xc[2], 'm', M, [
        { value: RtX[2], message: 'That uses $R^T$. Use $X_c = R X_w + t$.' },
        { value: noT[2], message: 'You forgot to add $t$.' },
      ]),
      num('$u$', 'u', u, 'px', PX, [{ value: c.ax * x, message: 'Add the principal point: $u = \\alpha_x x + u_0$.' }]),
      num('$v$', 'v', v, 'px', PX, [{ value: c.ay * y, message: 'Add the principal point: $v = \\alpha_y y + v_0$.' }]),
      paramChoice(rng),
    ],
    hints: [
      STAGES,
      `$$X_c = R\\,X_w + t, \\qquad x = \\frac{X_c}{Z_c},\\ y = \\frac{Y_c}{Z_c}, \\qquad u = \\alpha_x x + u_0,\\ v = \\alpha_y y + v_0$$\n\nEach row of $R$ is a camera axis written in world coordinates, so $X_c$ is just "how far along $\\hat{x}_c$", and so on.`,
      `$$X_c = ${matTeX(view.R)} ${vecTeX(Xw)} + ${vecTeX(t)} = ${vecTeX(mv(view.R, Xw))} + ${vecTeX(t)}$$`,
      `$$\\begin{array}{l|l} X_c & ${t4(Xc[0])}\\ \\text{m} \\\\ Y_c & ${t4(Xc[1])}\\ \\text{m} \\\\ Z_c & ${t4(Xc[2])}\\ \\text{m} \\\\ x = X_c/Z_c & ${t4(x)} \\\\ y = Y_c/Z_c & ${t4(y)} \\\\ u & ${t4(u)}\\ \\text{px} \\\\ v & ${t4(v)}\\ \\text{px} \\end{array}$$\n\n**$X_c$ = (${t4(Xc[0])}, ${t4(Xc[1])}, ${t4(Xc[2])}) m; $(u, v)$ = (${t4(u)}, ${t4(v)}) px.** $Z_c > 0$, so the point is in front of the camera. Position and orientation (in $R$, $t$) are extrinsic; $\\alpha$, $(u_0, v_0)$ and skew (in $K$) are intrinsic.`,
    ],
  };
}

function tier3(rng: Rng): SolveInstance {
  const { c, view, t, Xc } = worldSetup(rng);
  const u = Number((c.ax * (Xc[0] / Xc[2]) + c.u0).toFixed(1));
  const v = Number((c.ay * (Xc[1] / Xc[2]) + c.v0).toFixed(1));
  const Z = Xc[2];
  const x = (u - c.u0) / c.ax;
  const y = (v - c.v0) / c.ay;
  const XcB: V3 = [x * Z, y * Z, Z];
  const Xw = mv(tr(view.R), [XcB[0] - t[0], XcB[1] - t[1], XcB[2] - t[2]]);
  const wrongR = mv(view.R, [XcB[0] - t[0], XcB[1] - t[1], XcB[2] - t[2]]);
  const noT = mv(tr(view.R), XcB);
  return {
    prompt: `**Back-projection.** A ${c.img.w} × ${c.img.h} camera with the $K$, $R$, $t$ below ($X_c = R X_w + t$; it ${view.desc}) detects a feature at pixel $(u, v) = (${t4(u)}, ${t4(v)})$, and a depth sensor says it is $Z_c$ = ${t4(Z)} m in front of the camera. Where is the feature in the world?`,
    givens: [
      { sym: '(u, v)', value: `(${t4(u)}, ${t4(v)}) px`, label: 'detected pixel' },
      { sym: 'Z_c', value: `${t4(Z)} m`, label: 'measured depth' },
      { sym: 'K', value: `$${kTeX(c)}$`, label: 'intrinsics (px)' },
      { sym: 'R,\\ t', value: `$${matTeX(view.R)}$, $${vecTeX(t)}$ m`, label: 'extrinsics' },
    ],
    layout: 'side',
    parts: [
      num('Normalised $x = (u - u_0)/\\alpha_x$', 'x', x, '', { tol: 0.002, absTol: 0.0006 }, [{ value: u / c.ax, message: 'Subtract the principal point first: $x = (u - u_0)/\\alpha_x$.' }]),
      num('Normalised $y = (v - v_0)/\\alpha_y$', 'y', y, '', { tol: 0.002, absTol: 0.0006 }, [{ value: v / c.ay, message: 'Subtract the principal point first: $y = (v - v_0)/\\alpha_y$.' }]),
      num('World $X_w$', 'Xw', Xw[0], 'm', { tol: 0.005, absTol: 0.01 }, [
        { value: wrongR[0], message: 'Undo the rotation with $R^T$ (its inverse), not $R$: $X_w = R^T (X_c - t)$.' },
        { value: noT[0], message: 'Subtract $t$ before rotating back: $X_w = R^T (X_c - t)$.' },
      ]),
      num('World $Y_w$', 'Yw', Xw[1], 'm', { tol: 0.005, absTol: 0.01 }, [
        { value: wrongR[1], message: 'Undo the rotation with $R^T$: $X_w = R^T (X_c - t)$.' },
        { value: noT[1], message: 'Subtract $t$ before rotating back.' },
      ]),
      num('World $Z_w$', 'Zw', Xw[2], 'm', { tol: 0.005, absTol: 0.01 }, [
        { value: wrongR[2], message: 'Undo the rotation with $R^T$: $X_w = R^T (X_c - t)$.' },
        { value: noT[2], message: 'Subtract $t$ before rotating back.' },
      ]),
      {
        kind: 'choice',
        id: 'ray',
        label: 'Without the depth sensor, what would the pixel alone tell you about the feature?',
        options: [
          { text: 'A ray from the camera centre through the pixel: its direction, not its distance', correct: true, why: 'Every point $Z_c (x, y, 1)$ with $Z_c > 0$ projects to the same pixel: the perspective division removed the depth.' },
          { text: 'Its full 3-D position, because $K$, $R$ and $t$ are known', correct: false, why: 'Calibration fixes the ray, not the distance along it (scale ambiguity).' },
          { text: 'Its depth, from how far the pixel is from the principal point', correct: false, why: 'The offset from $(u_0, v_0)$ gives the ray’s angle, not the distance along it.' },
          { text: 'Nothing at all until the camera is calibrated again', correct: false, why: 'With $K$, $R$, $t$ known the pixel gives a definite ray in the world.' },
        ],
        marks: 1,
      },
    ],
    hints: [
      `${STAGES}\n\nBack-projection runs the stages backwards: undo $K$ to get the ray $(x, y, 1)$, scale it by the measured depth, then undo the extrinsics.`,
      `$$x = \\frac{u - u_0}{\\alpha_x},\\quad y = \\frac{v - v_0}{\\alpha_y}, \\qquad X_c = Z_c \\begin{bmatrix} x \\\\ y \\\\ 1 \\end{bmatrix}, \\qquad X_w = R^T (X_c - t)$$\n\n($R^{-1} = R^T$ for a rotation.)`,
      `$$x = \\frac{${t4(u)} - ${c.u0}}{${c.ax}} = ${t4(x)}, \\quad y = \\frac{${t4(v)} - ${c.v0}}{${c.ay}} = ${t4(y)}, \\quad X_c = ${t4(Z)} ${vecTeX([x, y, 1])} = ${vecTeX(XcB)}$$`,
      `$$X_w = R^T (X_c - t) = ${matTeX(tr(view.R))} ${vecTeX([XcB[0] - t[0], XcB[1] - t[1], XcB[2] - t[2]])} = ${vecTeX(Xw)}$$\n\n**$x$ = ${t4(x)}, $y$ = ${t4(y)}; $X_w$ = (${t4(Xw[0])}, ${t4(Xw[1])}, ${t4(Xw[2])}) m.** Without $Z_c$ the answer would be the whole ray $C + \\lambda R^T (x, y, 1)^T$, $\\lambda > 0$.`,
    ],
  };
}

export function projectInstance(rng: Rng, tier: Tier): SolveInstance {
  return tier === 1 ? tier1(rng) : tier === 2 ? tier2(rng) : tier3(rng);
}

/** For the self-tests. */
export const _internal = { worldSetup, camera };
