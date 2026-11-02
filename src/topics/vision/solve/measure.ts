// vision-measure: what one image can and cannot tell you, perspective effects, and the visual-servoing requirements
// (2023 Q13/Q15, 2024 Q13/Q15, 2025 Q13/Q15; summary notes §7).
//   Tier 1: one paper-style multiple choice, every option with its why.
//   Tier 2: two identical objects in one photo: the depth ratio from their pixel sizes, what cannot be concluded,
//           and a perspective statement.
import type { SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { tex } from '../../../engine/format';

interface Stmt {
  text: string;
  why: string;
}

const PERSP_TRUE: Stmt[] = [
  { text: 'Parallel lines that are not parallel to the image plane meet at a vanishing point', why: 'Points far along each line have large $Z_c$ and crowd towards one image point, $K R d$ for the lines’ direction $d$.' },
  { text: 'Far-away objects appear smaller', why: '$h\' = f h / Z$: image size falls as $1/Z$.' },
  { text: 'Straight lines remain straight', why: 'A line and the camera centre span a plane, and that plane meets the image plane in a line.' },
  { text: 'Conics remain conics (a circle seen at an angle images as an ellipse)', why: 'Projection maps conics to conics, although the kind can change.' },
];
const PERSP_FALSE: Stmt[] = [
  { text: 'Angles are preserved', why: 'A right angle on the floor can image at 60° or 120°: perspective does not preserve angles (2023 Q13).' },
  { text: 'All parallel lines remain parallel', why: 'Only lines parallel to the image plane stay parallel; the rest converge to vanishing points (2024 Q13).' },
  { text: 'Radial (barrel) distortion', why: 'That is an imperfection of the lens, modelled with the intrinsics, not an effect of perspective (2024 Q13).' },
  { text: 'Lengths keep their true ratios everywhere in the image', why: 'Nearer parts are magnified more, so lengths at different depths change their ratios.' },
];

const MEAS_YES: Stmt = { text: 'The relative sizes of objects in the image (in pixels)', why: 'Pixel lengths and their ratios are read straight off the image (2025 Q13).' };
const MEAS_NO: Stmt[] = [
  { text: 'The absolute size of an object in metres', why: 'A big far object and a small near one make the same image (scale ambiguity): you need its depth or a reference of known size.' },
  { text: 'The distance from the camera to an object', why: 'The perspective division throws the depth away; you need a known size, stereo, motion or a range sensor.' },
  { text: 'The true angle between two edges lying on the floor', why: 'Perspective does not preserve angles, and without the floor’s pose you cannot undo it.' },
  { text: 'The speed of an object in metres per second', why: 'Pixels per frame need the depth (and the frame rate) to become metres per second.' },
];

interface Q {
  label: string;
  options: { text: string; correct: boolean; why: string }[];
  topic: 'persp' | 'meas' | 'servo';
}

function perspQ(rng: Rng, not: boolean): Q {
  const key = not ? rng.pick(PERSP_FALSE) : rng.pick(PERSP_TRUE);
  const others = not ? rng.shuffle(PERSP_TRUE).slice(0, 3) : rng.shuffle(PERSP_FALSE).slice(0, 3);
  return {
    topic: 'persp',
    label: not ? 'Which of the following is **NOT** an effect of perspective projection?' : 'Which of the following **is** an effect of perspective projection?',
    options: [{ ...key, correct: true }, ...others.map((o) => ({ ...o, correct: false }))],
  };
}

function measQ(rng: Rng): Q {
  return {
    topic: 'meas',
    label: 'Which of the following can be measured from a single camera image, with nothing else known about the scene?',
    options: [{ ...MEAS_YES, correct: true }, ...rng.shuffle(MEAS_NO).slice(0, 3).map((o) => ({ ...o, correct: false }))],
  };
}

function servoQ(rng: Rng): Q {
  const k = rng.int(0, 2);
  if (k === 0)
    return {
      topic: 'servo',
      label: 'Position-based visual servoing (PBVS) requires:',
      options: [
        { text: 'A known transform between the camera frame and the end-effector frame', correct: true, why: 'PBVS turns the estimated 3-D pose of the target into end-effector motion, so it must know where the camera sits on the arm (2024 Q15).' },
        { text: 'Multiple cameras', correct: false, why: 'One calibrated camera and a model of the target give the pose.' },
        { text: 'Motion planning', correct: false, why: 'The control law generates the motion directly; no planner is needed.' },
        { text: 'An eye-in-hand set-up', correct: false, why: 'PBVS also works with a fixed camera watching the arm (eye-to-hand).' },
      ],
    };
  if (k === 1)
    return {
      topic: 'servo',
      label: 'Image-based visual servoing (IBVS) requires:',
      options: [
        { text: 'A fixed transform between the camera frame and the end-effector frame', correct: true, why: 'IBVS works on the image error, and the desired image was taught with the same rigid mounting, so the transform only has to stay fixed, not be known precisely (2025 Q15).' },
        { text: 'A known transform between the camera frame and the end-effector frame', correct: false, why: 'That is what PBVS needs; IBVS is robust to errors in it.' },
        { text: 'Multiple cameras', correct: false, why: 'One camera and its image features are enough.' },
        { text: 'Fiducial markers', correct: false, why: 'Any features that can be tracked will do (corners, blobs, lines).' },
      ],
    };
  return {
    topic: 'servo',
    label: 'For an eye-in-hand camera, controlling the arm so that the features in the image align with a desired view is called:',
    options: [
      { text: 'Image-based visual servoing', correct: true, why: 'The error is defined directly on the image features (2023 Q15).' },
      { text: 'Position-based visual servoing', correct: false, why: 'PBVS drives an estimated 3-D pose to its goal, not the image features.' },
      { text: 'Feature extraction', correct: false, why: 'That only finds the features; it does not move the arm.' },
      { text: 'Motion planning', correct: false, why: 'Planning computes a path in advance; servoing closes the loop on the image.' },
    ],
  };
}

const CONCEPTS: Record<Q['topic'], string> = {
  persp:
    'Perspective projection $x = X_c/Z_c$, $y = Y_c/Z_c$ divides by depth. What survives: straight lines stay straight and conics stay conics. What does not: lengths, angles and parallelism; parallel lines meet at vanishing points and far things look smaller. Lens distortion is a separate, intrinsic effect.',
  meas:
    'One image fixes directions (rays), not distances: every point on a ray lands on the same pixel. So you can measure pixel sizes and their ratios, but absolute sizes, distances and true angles need extra information (a known size, stereo, motion, a range sensor).',
  servo:
    'PBVS: estimate the target’s 3-D pose and drive it to the goal, which needs a calibrated camera and a **known** camera-to-end-effector transform. IBVS: drive the image-feature error with the image Jacobian; it needs a depth estimate and only a **fixed** camera mounting, and it is robust to calibration error.',
};

function choicePart(q: Q, id: string, marks = 1): SolvePart {
  return { kind: 'choice', id, label: q.label, options: q.options, marks };
}

function key(q: Q) {
  return q.options.find((o) => o.correct)!;
}

function tier1(rng: Rng): SolveInstance {
  const q = rng.pick([() => perspQ(rng, true), () => perspQ(rng, false), () => measQ(rng), () => servoQ(rng)])();
  const k = key(q);
  return {
    prompt: 'Multiple choice, 1 mark (exam style). Pick one option, and be ready to say why the others are wrong.',
    parts: [choicePart(q, 'q')],
    hints: [
      CONCEPTS[q.topic],
      'Test each option against the model: does it hold for every point, whatever its depth? Anything that needs the depth, or a true length or angle, does not survive a single perspective image.',
      `Two you can rule out straight away:\n\n${q.options
        .filter((o) => !o.correct)
        .slice(0, 2)
        .map((o) => `- "${o.text}": ${o.why}`)
        .join('\n')}\n\nNow decide between the other two.`,
      `**${k.text}.** ${k.why}\n\n${q.options
        .filter((o) => !o.correct)
        .map((o) => `- Not "${o.text}": ${o.why}`)
        .join('\n')}`,
    ],
  };
}

const PAIRS = [
  { what: 'two identical cars', size: 4.5, unit: 'long' },
  { what: 'two identical shipping containers', size: 6.06, unit: 'long' },
  { what: 'two identical goal posts', size: 2.44, unit: 'tall' },
  { what: 'two identical robots', size: 0.8, unit: 'tall' },
];

function tier2(rng: Rng): SolveInstance {
  const p = rng.pick(PAIRS);
  const near = rng.step(120, 400, 2);
  const ratio = rng.pick([1.5, 2, 2.5, 3, 4, 5]);
  const far = Number((near / ratio).toFixed(1));
  const r = near / far;
  const persp = perspQ(rng, rng.chance(0.5));
  const k = key(persp);
  const parts: SolvePart[] = [
    {
      kind: 'numeric',
      id: 'ratio',
      label: 'How many times farther from the camera is the far one than the near one? ($Z_{far}/Z_{near}$)',
      answer: r,
      unit: '',
      tol: 0.01,
      traps: Math.abs(1 / r - r) > 0.05 ? [{ value: 1 / r, message: 'Upside down: the far one has the **smaller** image, and size falls as $1/Z$, so $Z_{far}/Z_{near} = h\'_{near}/h\'_{far} > 1$.' }] : [],
      marks: 1,
    },
    {
      kind: 'choice',
      id: 'abs',
      label: 'From this photo alone (lens unknown), what can you say about the distance to the near one?',
      options: [
        { text: `Nothing absolute: you also need the real size (${p.size} m) and the focal length in pixels, then $Z = f h / h'$`, correct: true, why: 'Pixel sizes give ratios. Turning them into metres needs a scale: the object’s real size and the camera’s focal length in pixels (from calibration).' },
        { text: `It is ${tex(near / 100, 3)} m, because a ${near} px image means about 100 px per metre`, correct: false, why: 'There is no fixed number of pixels per metre: it depends on the depth and the focal length.' },
        { text: 'It equals the far one’s distance minus their separation in the image', correct: false, why: 'Image separations are in pixels and mix directions with depths; they do not give distances.' },
        { text: 'It can be read from how low the object sits in the image', correct: false, why: 'Only with the camera’s height and tilt and a flat ground (extra information); the photo alone does not say.' },
      ],
      marks: 1,
    },
    { kind: 'choice', id: 'persp', label: persp.label, options: persp.options, marks: 1 },
  ];
  return {
    prompt: `A photo shows ${p.what} (each ${p.size} m ${p.unit}), both side-on to the camera. The near one is ${near} px ${p.unit} in the image, the far one ${far} px.`,
    givens: [
      { sym: "h'_{near}", value: `${near} px`, label: 'near image size' },
      { sym: "h'_{far}", value: `${far} px`, label: 'far image size' },
    ],
    parts,
    hints: [
      `${CONCEPTS.meas}\n\n${CONCEPTS.persp}`,
      `Same real size $h$ and same $f$: $h' = f h / Z$ gives $\\dfrac{h'_{near}}{h'_{far}} = \\dfrac{Z_{far}}{Z_{near}}$. The image size alone has no scale: $Z = f h / h'$ needs $f$ (pixels) and $h$.`,
      `$$\\frac{Z_{far}}{Z_{near}} = \\frac{${near}}{${far}}$$\n\nFor the perspective statement, ask whether it holds for points at every depth.`,
      `**$Z_{far}/Z_{near}$ = ${tex(r, 4)}.** The absolute distance needs the real size and the focal length in pixels: $Z = f h / h'$ (scale ambiguity otherwise).\n\nPerspective: **${k.text}.** ${k.why}`,
    ],
  };
}

export function measureInstance(rng: Rng, tier: Tier): SolveInstance {
  return tier === 1 ? tier1(rng) : tier2(rng);
}
