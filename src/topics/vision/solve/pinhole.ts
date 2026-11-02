// vision-pinhole: h′ = f h / Z by hand (2023 Q33(c), 2024 Q30(c)-(d), 2025 Q30(d); review deck JWST; notes §7
// "Pinhole calculations, step by step").
//   Tier 1: one formula: image size, depth or focal length, with the mm vs m trap.
//   Tier 2: paper style: depth from the camera position (not the base), the base offset, moving closer.
//   Tier 3: a two-step chain: arm geometry then f (2025), a same-depth reference object, or astronomy (km to m).
import type { SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { depthFromImage, focalFromImage, heightFromImage, imageSize } from '../../../core/camera';
import { tex } from '../../../engine/format';
import { makePinholeFigure } from './figures';

const t4 = (x: number) => tex(x, 4);
const TOL = 0.01;

const CONCEPT = `Similar triangles through the pinhole: the ray from the top of the object makes the same angle on both sides, so

$$\\frac{h'}{f} = \\frac{h}{Z} \\quad\\Longrightarrow\\quad h' = \\frac{f\\,h}{Z}$$

$Z$ is the depth **from the camera's optical centre** along the optical axis (not from the robot's base). Put every length in metres before dividing, then convert the answer to the unit asked for. Assumptions: ideal pinhole, no distortion, object centred on and perpendicular to the optical axis.`;

interface Obj {
  name: string;
  h: [number, number, number];
  Z: [number, number, number];
}
const OBJECTS: Obj[] = [
  { name: 'a person', h: [1.55, 1.95, 0.01], Z: [3, 25, 0.1] },
  { name: 'a doorway', h: [2.0, 2.4, 0.05], Z: [3, 15, 0.1] },
  { name: 'a stop sign', h: [0.6, 0.9, 0.05], Z: [5, 40, 0.5] },
  { name: 'a gum tree', h: [8, 25, 0.5], Z: [20, 120, 1] },
  { name: 'a shipping container (2.59 m tall)', h: [2.59, 2.59, 0.01], Z: [10, 60, 0.5] },
  { name: 'an office building', h: [15, 60, 1], Z: [60, 300, 5] },
];
const LENSES = [16, 24, 28, 35, 50, 85, 100, 135, 200];

function num(label: string, id: string, answer: number, unit: string, traps: { value: number; message: string; trapId?: string }[] = [], marks = 1): SolvePart {
  return { kind: 'numeric', id, label, answer, unit, tol: TOL, marks, traps: traps.filter((t) => Number.isFinite(t.value) && Math.abs(t.value - answer) > 0.03 * Math.abs(answer)) };
}

const table = (rows: [string, string][]) => `$$\\begin{array}{l|l} ${rows.map(([a, b]) => `${a} & ${b}`).join(' \\\\ ')} \\end{array}$$`;

// ------------------------------------------------------------------ tier 1

function tier1(rng: Rng): SolveInstance {
  const o = rng.pick(OBJECTS);
  const f = rng.pick(LENSES) / 1000;
  const h = rng.step(o.h[0], o.h[1], o.h[2]);
  const Z = rng.step(o.Z[0], o.Z[1], o.Z[2]);
  const hi = imageSize(f, h, Z);
  const kind = rng.pick(['size', 'depth', 'focal'] as const);
  const fmm = f * 1000;
  const himm = Number((hi * 1000).toPrecision(3));
  if (kind === 'size') {
    return {
      prompt: `A camera with a ${t4(fmm)} mm lens photographs ${o.name} of height ${t4(h)} m standing ${t4(Z)} m in front of it. How tall is its image on the sensor?`,
      givens: [
        { sym: 'f', value: `${t4(fmm)} mm`, label: 'focal length' },
        { sym: 'h', value: `${t4(h)} m`, label: 'object height' },
        { sym: 'Z', value: `${t4(Z)} m`, label: 'depth from the camera' },
      ],
      figure: makePinholeFigure({ f: `= ${t4(fmm)} mm`, Z: `= ${t4(Z)} m`, h: `= ${t4(h)} m`, hi: '= ?' }),
      parts: [num("Image height $h'$", 'hi', hi * 1000, 'mm', [{ value: (f * Z) / h * 1000, message: "That is $f Z / h$: the triangle is upside down. $h'/f = h/Z$, so $h' = f h / Z$." }], 2)],
      hints: [
        CONCEPT,
        `Unknown: $h'$. Use $h' = \\dfrac{f\\,h}{Z}$ with $f$ in metres: $f = ${t4(fmm)}$ mm $= ${t4(f)}$ m.`,
        `$$h' = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(Z)}}\\ \\text{m}$$`,
        `${table([
          ['f', `${t4(f)}\\ \\text{m}`],
          ['h', `${t4(h)}\\ \\text{m}`],
          ['Z', `${t4(Z)}\\ \\text{m}`],
        ])}\n\n$$h' = \\frac{f\\,h}{Z} = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(Z)}} = ${t4(hi)}\\ \\text{m}$$\n\n**$h'$ = ${t4(hi * 1000)} mm.**`,
      ],
    };
  }
  if (kind === 'depth') {
    const Zs = depthFromImage(f, h, himm / 1000);
    return {
      prompt: `${o.name.charAt(0).toUpperCase() + o.name.slice(1)}, ${t4(h)} m tall, makes an image ${t4(himm)} mm tall through a ${t4(fmm)} mm lens. How far is it from the camera?`,
      givens: [
        { sym: 'f', value: `${t4(fmm)} mm`, label: 'focal length' },
        { sym: 'h', value: `${t4(h)} m`, label: 'object height' },
        { sym: "h'", value: `${t4(himm)} mm`, label: 'measured image height' },
      ],
      figure: makePinholeFigure({ f: `= ${t4(fmm)} mm`, Z: '= ?', h: `= ${t4(h)} m`, hi: `= ${t4(himm)} mm` }),
      parts: [num('Depth $Z$ from the camera', 'Z', Zs, 'm', [{ value: (himm / 1000) * h / f, message: "That is $h' h / f$. Rearrange $h' = f h / Z$ for $Z$: $Z = f h / h'$." }], 2)],
      hints: [
        CONCEPT,
        `Unknown: $Z$. Rearrange: $Z = \\dfrac{f\\,h}{h'}$, with $f = ${t4(f)}$ m and $h' = ${t4(himm / 1000)}$ m.`,
        `$$Z = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(himm / 1000)}}\\ \\text{m}$$`,
        `${table([
          ['f', `${t4(f)}\\ \\text{m}`],
          ['h', `${t4(h)}\\ \\text{m}`],
          ["h'", `${t4(himm / 1000)}\\ \\text{m}`],
        ])}\n\n$$Z = \\frac{f\\,h}{h'} = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(himm / 1000)}} = ${t4(Zs)}\\ \\text{m}$$\n\n**$Z$ = ${t4(Zs)} m** from the camera.`,
      ],
    };
  }
  const fs = focalFromImage(h, himm / 1000, Z);
  return {
    prompt: `${o.name.charAt(0).toUpperCase() + o.name.slice(1)}, ${t4(h)} m tall and ${t4(Z)} m from the camera, makes an image ${t4(himm)} mm tall. What is the focal length of the lens?`,
    givens: [
      { sym: 'h', value: `${t4(h)} m`, label: 'object height' },
      { sym: 'Z', value: `${t4(Z)} m`, label: 'depth from the camera' },
      { sym: "h'", value: `${t4(himm)} mm`, label: 'measured image height' },
    ],
    figure: makePinholeFigure({ f: '= ?', Z: `= ${t4(Z)} m`, h: `= ${t4(h)} m`, hi: `= ${t4(himm)} mm` }),
    parts: [num('Focal length $f$', 'f', fs * 1000, 'mm', [{ value: ((h * Z) / (himm / 1000)) * 1000, message: "That is $h Z / h'$. Rearrange $h' = f h / Z$ for $f$: $f = h' Z / h$." }], 2)],
    hints: [
      CONCEPT,
      `Unknown: $f$. Rearrange: $f = \\dfrac{h'\\,Z}{h}$, with $h' = ${t4(himm / 1000)}$ m.`,
      `$$f = \\frac{${t4(himm / 1000)} \\times ${t4(Z)}}{${t4(h)}}\\ \\text{m}$$`,
      `${table([
        ["h'", `${t4(himm / 1000)}\\ \\text{m}`],
        ['Z', `${t4(Z)}\\ \\text{m}`],
        ['h', `${t4(h)}\\ \\text{m}`],
      ])}\n\n$$f = \\frac{h'\\,Z}{h} = \\frac{${t4(himm / 1000)} \\times ${t4(Z)}}{${t4(h)}} = ${t4(fs)}\\ \\text{m}$$\n\n**$f$ = ${t4(fs * 1000)} mm.**`,
    ],
  };
}

// ------------------------------------------------------------------ tier 2

function tier2Camera(rng: Rng): SolveInstance {
  // 2023 Q33(c): camera position from FK, optical axis along a base axis, person straight ahead.
  const axis = rng.pick(['+y', '-x', '+x'] as const);
  const px = rng.step(-0.5, 0.5, 0.1);
  const py = rng.step(-0.5, 0.6, 0.1);
  const pz = rng.step(1.0, 1.8, 0.1);
  const d = rng.step(3, 9, 0.1);
  const f = rng.pick([35, 50, 85]) / 1000;
  const h = rng.step(1.55, 1.95, 0.01);
  const person: [number, number, number] = axis === '+y' ? [px, Number((py + d).toFixed(2)), 0] : axis === '-x' ? [Number((px - d).toFixed(2)), py, 0] : [Number((px + d).toFixed(2)), py, 0];
  const Z = d;
  const fromBase = axis === '+y' ? person[1] : Math.abs(person[0]);
  const hi = imageSize(f, h, Z);
  const axTeX = axis === '+y' ? '+\\hat{y}_s' : axis === '-x' ? '-\\hat{x}_s' : '+\\hat{x}_s';
  const sub = axis === '+y' ? `${t4(person[1])} - ${t4(py)}` : axis === '-x' ? `${t4(px)} - (${t4(person[0])})` : `${t4(person[0])} - ${t4(px)}`;
  const coordName = axis === '+y' ? 'y' : 'x';
  const base = Math.abs(fromBase - Z) > 0.05 * Z;
  return {
    prompt: `**2023 Q33 style.** At this configuration the arm's forward kinematics put the camera at $p = (${t4(px)}, ${t4(py)}, ${t4(pz)})$ m in {s}, with its optical axis $\\hat{z}_b$ along $${axTeX}$. A person ${t4(h)} m tall stands upright at $(${t4(person[0])}, ${t4(person[1])}, 0)$ m, straight ahead of the camera. The lens has $f$ = ${t4(f * 1000)} mm.`,
    givens: [
      { sym: 'p', value: `(${t4(px)}, ${t4(py)}, ${t4(pz)}) m`, label: 'camera position in {s}' },
      { sym: '\\hat{z}_b', value: `$${axTeX}$`, label: 'optical axis' },
      { sym: 'h', value: `${t4(h)} m`, label: 'person height' },
      { sym: 'f', value: `${t4(f * 1000)} mm`, label: 'focal length' },
    ],
    figure: makePinholeFigure({ f: `= ${t4(f * 1000)} mm`, Z: '= ?', h: `= ${t4(h)} m`, hi: '= ?', note: 'Z is measured from the camera along its optical axis, not from the base.' }),
    parts: [
      num('Depth $Z$ of the person from the camera', 'Z', Z, 'm', base ? [{ value: fromBase, message: `That is the person's ${coordName} coordinate, measured from the base origin. The depth is measured from the **camera**: subtract the camera's ${coordName}.`, trapId: 'depth-from-camera' }] : [], 1),
      num("Height of the person's image $h'$", 'hi', hi * 1000, 'mm', base ? [{ value: imageSize(f, h, fromBase) * 1000, message: 'That uses the distance from the base, not from the camera.', trapId: 'depth-from-camera' }] : [], 2),
    ],
    hints: [
      CONCEPT,
      `Depth: the person is straight ahead along $${axTeX}$, so $Z$ is the difference of the ${coordName} coordinates of the person and the camera. Then $h' = f h / Z$.`,
      `$$Z = ${sub} = ${t4(Z)}\\ \\text{m}, \\qquad h' = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(Z)}}$$`,
      `${table([
        ['\\text{camera } ' + coordName, `${t4(axis === '+y' ? py : px)}\\ \\text{m}`],
        ['\\text{person } ' + coordName, `${t4(axis === '+y' ? person[1] : person[0])}\\ \\text{m}`],
        ['Z', `${t4(Z)}\\ \\text{m}`],
        ['f', `${t4(f)}\\ \\text{m}`],
      ])}\n\n$$h' = \\frac{f\\,h}{Z} = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(Z)}} = ${t4(hi)}\\ \\text{m}$$\n\n**$Z$ = ${t4(Z)} m; $h'$ = ${t4(hi * 1000)} mm.** Assumptions: ideal pinhole, no distortion, the person upright in a plane perpendicular to the optical axis.`,
    ],
  };
}

function tier2Wheel(rng: Rng): SolveInstance {
  // 2024 Q30(c)-(d): depth from a measured image, base offset, then drive closer.
  const name = rng.pick(['a Ferris wheel', 'a radio mast', 'a lighthouse', 'a stadium light tower']);
  const h = rng.step(30, 80, 1);
  const f = rng.pick([35, 50, 85]) / 1000;
  const himm = rng.step(20, 60, 0.5);
  const L = rng.step(0.8, 1.8, 0.1);
  const Z = depthFromImage(f, h, himm / 1000);
  const D = Math.min(Math.round(Z * rng.uniform(0.15, 0.4)), Math.floor(Z) - 5);
  const Z2 = Z - D;
  const hi2 = imageSize(f, h, Z2);
  return {
    prompt: `**2024 Q30 style.** The camera on the robot's arm sits $L$ = ${t4(L)} m in front of the robot's base and looks straight ahead, away from the base. ${name.charAt(0).toUpperCase() + name.slice(1)}, ${t4(h)} m tall, fills an image ${t4(himm)} mm tall through a ${t4(f * 1000)} mm lens. Then the robot drives ${D} m straight towards it.`,
    givens: [
      { sym: 'h', value: `${t4(h)} m`, label: 'object height' },
      { sym: "h'", value: `${t4(himm)} mm`, label: 'image height' },
      { sym: 'f', value: `${t4(f * 1000)} mm`, label: 'focal length' },
      { sym: 'L', value: `${t4(L)} m`, label: 'camera in front of the base' },
    ],
    figure: makePinholeFigure({ f: `= ${t4(f * 1000)} mm`, Z: '= ?', h: `= ${t4(h)} m`, hi: `= ${t4(himm)} mm` }),
    layout: 'side',
    parts: [
      num('(a) Distance $Z$ from the camera', 'Z', Z, 'm', [{ value: ((himm / 1000) * h) / f, message: "That is $h' h / f$: rearrange $h' = f h / Z$ to $Z = f h / h'$." }], 1),
      num('(b) Distance from the robot’s base', 'base', Z + L, 'm', [{ value: Z - L, message: 'The camera is in front of the base, looking away from it, so the base is **farther**: add $L$.', trapId: 'depth-from-camera' }], 1),
      num(`(c) Image height after driving ${D} m closer`, 'hi2', hi2 * 1000, 'mm', [{ value: himm * (Z2 / Z), message: "Image size is **inversely** proportional to depth: closer means bigger, $h'' = h' Z / Z'$." }], 1),
    ],
    hints: [
      CONCEPT,
      `(a) $Z = \\dfrac{f\\,h}{h'}$. (b) The base is $L$ behind the camera along the line of sight: $d = Z + L$. (c) New depth $Z' = Z - ${D}$, then $h'' = \\dfrac{f\\,h}{Z'}$ (or $h'' = h' Z / Z'$).`,
      `$$Z = \\frac{${t4(f)} \\times ${t4(h)}}{${t4(himm / 1000)}}, \\qquad d = Z + ${t4(L)}, \\qquad h'' = \\frac{${t4(f)} \\times ${t4(h)}}{Z - ${D}}$$`,
      `${table([
        ['Z = f h / h\'', `${t4(Z)}\\ \\text{m}`],
        ['d = Z + L', `${t4(Z + L)}\\ \\text{m}`],
        ["Z' = Z - " + D, `${t4(Z2)}\\ \\text{m}`],
        ["h'' = f h / Z'", `${t4(hi2)}\\ \\text{m}`],
      ])}\n\n**(a) $Z$ = ${t4(Z)} m; (b) ${t4(Z + L)} m from the base; (c) $h''$ = ${t4(hi2 * 1000)} mm.** Check: $${t4(himm)} \\times ${t4(Z)} / ${t4(Z2)} = ${t4((himm * Z) / Z2)}$ mm. Assumes the object is centred and perpendicular to the optical axis, and ignores the small height difference between the camera and the object's centre.`,
    ],
  };
}

// ------------------------------------------------------------------ tier 3

function tier3Arm(rng: Rng): SolveInstance {
  // 2025 Q30(c)-(d): fully stretched arm reaching a height; horizontal distance; then the focal length.
  const L = rng.step(1.6, 2.6, 0.1);
  const b = rng.step(0.1, 0.3, 0.05);
  const H = rng.step(b + 0.5, b + Math.min(1.4, L - 0.5), 0.05);
  const rise = H - b;
  const Z = Math.sqrt(L * L - rise * rise);
  const h = rng.step(0.12, 0.3, 0.001);
  const fTrue = rng.pick([50, 60, 80, 100]) / 1000;
  const himm = Number((imageSize(fTrue, h, Z) * 1000).toPrecision(3));
  const f = focalFromImage(h, himm / 1000, Z);
  return {
    prompt: `**2025 Q30 style.** A robot arm pivots about a joint ${t4(b)} m above its base. Fully stretched, its links form one straight segment of length $L$ = ${t4(L)} m from that joint to the camera. The arm is raised until the camera is level with a mast head ${t4(H)} m above the ground, directly above the base; the camera looks horizontally at the mast head, which is ${t4(h * 1000)} mm tall and makes an image ${t4(himm)} mm tall.`,
    givens: [
      { sym: 'L', value: `${t4(L)} m`, label: 'stretched arm length' },
      { sym: 'b', value: `${t4(b)} m`, label: 'pivot height' },
      { sym: 'H', value: `${t4(H)} m`, label: 'camera / mast-head height' },
      { sym: 'h', value: `${t4(h * 1000)} mm`, label: 'mast-head size' },
      { sym: "h'", value: `${t4(himm)} mm`, label: 'image size' },
    ],
    layout: 'side',
    figure: makePinholeFigure({ f: '= ?', Z: '= ? (horizontal)', h: `= ${t4(h * 1000)} mm`, hi: `= ${t4(himm)} mm` }),
    parts: [
      num('(a) Horizontal distance $Z$ from the camera to the mast head', 'Z', Z, 'm', [
        { value: L, message: 'That is the arm length. The arm is inclined: the horizontal distance is one side of a right triangle with hypotenuse $L$.' },
        { value: L - rise, message: 'Subtracting lengths does not work for a right triangle: use Pythagoras.' },
      ], 1),
      num('(b) Focal length $f$', 'f', f * 1000, 'mm', [{ value: (((himm / 1000) * L) / h) * 1000, message: 'That uses the arm length as the depth. Use the horizontal distance from (a).', trapId: 'depth-from-camera' }], 2),
    ],
    hints: [
      `${CONCEPT}\n\nHere the depth comes from geometry first: the stretched arm is the hypotenuse of a right triangle.`,
      `The arm rises $H - b$ over its length $L$, so the horizontal distance is $Z = \\sqrt{L^2 - (H - b)^2}$. The mast head is above the base, so $Z$ is also the camera-to-target depth. Then $f = \\dfrac{h'\\,Z}{h}$.`,
      `$$Z = \\sqrt{${t4(L)}^2 - (${t4(H)} - ${t4(b)})^2} = \\sqrt{${t4(L * L)} - ${t4(rise * rise)}}, \\qquad f = \\frac{${t4(himm / 1000)} \\times Z}{${t4(h)}}$$`,
      `${table([
        ['H - b', `${t4(rise)}\\ \\text{m}`],
        ['Z', `${t4(Z)}\\ \\text{m}`],
        ["h'", `${t4(himm / 1000)}\\ \\text{m}`],
        ['h', `${t4(h)}\\ \\text{m}`],
      ])}\n\n$$f = \\frac{h'\\,Z}{h} = \\frac{${t4(himm / 1000)} \\times ${t4(Z)}}{${t4(h)}} = ${t4(f)}\\ \\text{m}$$\n\n**(a) $Z$ = ${t4(Z)} m; (b) $f$ = ${t4(f * 1000)} mm.** Assumes an ideal pinhole, the mast head's face perpendicular to the optical axis and its depth (thickness) ignored.`,
    ],
  };
}

function tier3Reference(rng: Rng): SolveInstance {
  // A person of known height next to a tree at the same depth: Z from the person, then the tree.
  const f = rng.pick([24, 35, 50]) / 1000;
  const hp = rng.step(1.6, 1.9, 0.01);
  const Ztrue = rng.step(12, 40, 0.5);
  const hpi = Number((imageSize(f, hp, Ztrue) * 1000).toPrecision(3));
  const Z = depthFromImage(f, hp, hpi / 1000);
  const ht = rng.step(6, 20, 0.5);
  const hti = Number((imageSize(f, ht, Z) * 1000).toPrecision(3));
  const H = heightFromImage(f, hti / 1000, Z);
  return {
    prompt: `A ${t4(f * 1000)} mm camera photographs a person ${t4(hp)} m tall standing beside a tree, at the same distance. On the sensor the person is ${t4(hpi)} mm tall and the tree ${t4(hti)} mm.`,
    givens: [
      { sym: 'f', value: `${t4(f * 1000)} mm`, label: 'focal length' },
      { sym: 'h_p', value: `${t4(hp)} m`, label: 'person height' },
      { sym: "h'_p", value: `${t4(hpi)} mm`, label: "person's image" },
      { sym: "h'_t", value: `${t4(hti)} mm`, label: "tree's image" },
    ],
    figure: makePinholeFigure({ f: `= ${t4(f * 1000)} mm`, Z: '= ?', h: `= ${t4(hp)} m (person)`, hi: `= ${t4(hpi)} mm` }),
    parts: [
      num('(a) Distance $Z$ to the person (and the tree)', 'Z', Z, 'm', [{ value: ((hpi / 1000) * hp) / f, message: "That is $h' h / f$: use $Z = f h / h'$." }], 1),
      num('(b) Height of the tree', 'tree', H, 'm', [{ value: (hp * hpi) / hti, message: 'Inverted ratio: the tree has the **bigger** image, so it is taller: $h_t = h_p\\,h\'_t / h\'_p$.' }], 2),
    ],
    hints: [
      `${CONCEPT}\n\nA known object at the same depth acts as a ruler: both share the same $Z$ and $f$.`,
      `(a) $Z = \\dfrac{f\\,h_p}{h'_p}$. (b) Same $Z$: $h_t = \\dfrac{h'_t\\,Z}{f}$, which simplifies to $h_t = h_p\\,\\dfrac{h'_t}{h'_p}$ ($f$ cancels).`,
      `$$Z = \\frac{${t4(f)} \\times ${t4(hp)}}{${t4(hpi / 1000)}}, \\qquad h_t = ${t4(hp)} \\times \\frac{${t4(hti)}}{${t4(hpi)}}$$`,
      `${table([
        ['Z', `${t4(Z)}\\ \\text{m}`],
        ["h'_t / h'_p", `${t4(hti / hpi)}`],
        ['h_t', `${t4(H)}\\ \\text{m}`],
      ])}\n\n**(a) $Z$ = ${t4(Z)} m; (b) the tree is ${t4(H)} m tall.** Image heights at the same depth are in the same ratio as the real heights.`,
    ],
  };
}

const SKY = [
  { name: 'the Moon', size: 3474, dist: 384400, what: 'diameter' },
  { name: 'Saturn’s rings', size: 282000, dist: 1.2e9, what: 'diameter' },
  { name: 'Jupiter', size: 139820, dist: 6.3e8, what: 'diameter' },
  { name: 'the Sun', size: 1.392e6, dist: 1.496e8, what: 'diameter' },
];
function tier3Sky(rng: Rng): SolveInstance {
  const s = rng.pick(SKY);
  const f = rng.pick([1.2, 2.5, 4, 8, 20, 131.4]);
  const h = s.size * 1000;
  const Z = s.dist * 1000;
  const hi = imageSize(f, h, Z);
  const iss = { size: 109, dist: rng.step(400, 430, 5) };
  const hi2 = imageSize(f, iss.size, iss.dist * 1000);
  return {
    prompt: `A telescope with focal length $f$ = ${t4(f)} m photographs ${s.name} (${s.what} ${t4(s.size)} km, ${tex(s.dist, 4)} km away), then the International Space Station (${iss.size} m across, ${iss.dist} km overhead). Like the review deck's JWST photo of Saturn: keep everything in metres.`,
    givens: [
      { sym: 'f', value: `${t4(f)} m`, label: 'focal length' },
      { sym: 'h', value: `${t4(s.size)} km`, label: s.name },
      { sym: 'Z', value: `${t4(s.dist)} km`, label: 'distance' },
    ],
    figure: makePinholeFigure({ f: `= ${t4(f)} m`, Z: `= ${t4(s.dist)} km`, h: `= ${t4(s.size)} km`, hi: '= ?' }),
    parts: [num(`(a) Size of the image of ${s.name}`, 'hi', hi * 1000, 'mm', [], 2), num('(b) Size of the image of the ISS', 'iss', hi2 * 1000, 'mm', [], 1)],
    hints: [
      `${CONCEPT}\n\nKilometres cancel in $h/Z$ if both are in km, but mixing km and m is a factor of 1000: convert both to metres.`,
      `$$h' = \\frac{f\\,h}{Z}$$ with $h$ = ${t4(s.size)} km $= ${t4(h)}$ m and $Z$ = ${tex(s.dist, 4)} km $= ${tex(Z, 4)}$ m.`,
      `$$h'_{a} = \\frac{${t4(f)} \\times ${t4(h)}}{${tex(Z, 4)}}, \\qquad h'_{b} = \\frac{${t4(f)} \\times ${iss.size}}{${tex(iss.dist * 1000, 4)}}$$`,
      `${table([
        ['h / Z\\ (' + s.name.replace('’', "'") + ')', tex(h / Z, 4)],
        ["h'_a", `${tex(hi, 4)}\\ \\text{m}`],
        ['h / Z\\ (\\text{ISS})', tex(iss.size / (iss.dist * 1000), 4)],
        ["h'_b", `${tex(hi2, 4)}\\ \\text{m}`],
      ])}\n\n**(a) ${t4(hi * 1000)} mm; (b) ${t4(hi2 * 1000)} mm.** Only the ratio $h/Z$ (the angular size) matters, which is why a 109 m station and a planet can look similar in size.`,
    ],
  };
}

export function pinholeInstance(rng: Rng, tier: Tier): SolveInstance {
  if (tier === 1) return tier1(rng);
  if (tier === 2) return rng.chance(0.5) ? tier2Camera(rng) : tier2Wheel(rng);
  return rng.pick([tier3Arm, tier3Reference, tier3Sky])(rng);
}

