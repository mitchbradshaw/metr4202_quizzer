// Pinhole camera sandbox (summary notes §7 "Pinhole calculations, step by step"; 2023 Q33(c), 2024 Q30(c)-(d),
// 2025 Q30(d); review deck slides 23-24, JWST and Saturn).
//
// A side view: the object of height h at depth Z, the pinhole, the image plane f behind it and the inverted image
// h′ = f h / Z. The two sides are drawn at different horizontal scales (metres vs millimetres) with the same vertical
// exaggeration relative to each, so the ray through the pinhole stays straight and the similar triangles are exact.
// Scales re-range with hysteresis, so within a range you see the object move and the image grow and shrink.
import { memo, useDeferredValue, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { imageSize, depthFromImage, focalFromImage } from '../../../core/camera';
import { Callout, Readout, Readouts, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { fmt } from '../../../engine/format';
import { Panel, fmtLen, nice125, texLen, useTween } from './visionCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'pinhole',
  title: "Pinhole camera: h' = f h / Z",
  summary:
    'A side view of an object, the pinhole and the image plane. Change the focal length, the depth and the object size (or solve for the depth or the focal length from a measured image) and watch the similar triangles. Presets: the 2023, 2024 and 2025 arm-camera parts and the review deck’s JWST photo of Saturn.',
  notice:
    "The ray from the top of the object through the pinhole makes the **same angle** on both sides, so $h/Z = h'/f$: double $Z$ and the image halves, double $f$ and it doubles. Convert $f$ and $h'$ to metres before you divide.",
  minutes: 8,
};

type Mode = 'img' | 'Z' | 'f';
interface Vals {
  f: number;
  Z: number;
  h: number;
  hi: number;
}

interface Preset {
  id: string;
  label: string;
  mode: Mode;
  v: Vals;
  astro?: boolean;
  note: string;
}

const PRESETS: Preset[] = [
  {
    id: 'q33',
    label: '2023 Q33(c): a person, 50 mm lens',
    mode: 'img',
    v: { f: 0.05, Z: 4.6, h: 1.7, hi: imageSize(0.05, 1.7, 4.6) },
    note: 'The camera sits at $p = (-0.2, 0.4, 1.5)$ m and looks along $\\hat{z}_b = +\\hat{y}_s$. The 1.7 m person stands at $(-0.2, 5, 0)$, straight ahead, so $Z = 5 - 0.4 = 4.6$ m: measured **from the camera**, not from the base. $h\' = 0.050 \\times 1.7 / 4.6 = 0.01848$ m $\\approx$ **18.5 mm**.',
  },
  {
    id: 'wheel',
    label: '2024 Q30(c): Wheel of Brisbane, how far?',
    mode: 'Z',
    v: { f: 0.05, Z: 78.95, h: 60, hi: 0.038 },
    note: 'The 60 m wheel makes a 38 mm image through a 50 mm lens: $Z = f h / h\' = 0.050 \\times 60 / 0.038 = $ **78.95 m** from the camera. The camera is $L_3 = 1.5$ m in front of the base along its view, so the base is $78.95 + 1.5 \\approx$ **80.4 m** away. Part (d), 20 m closer: $h\'\' = 0.050 \\times 60 / 58.95 = $ **50.9 mm**.',
  },
  {
    id: 'mast',
    label: '2025 Q30(d): mast head, which lens?',
    mode: 'f',
    v: { f: 0.08, Z: 1.847, h: 0.163, hi: 0.00706 },
    note: 'The fully stretched arm (2.1 m, rising 1.0 m) puts the camera $Z = \\sqrt{2.1^2 - 1.0^2} = 1.847$ m from the 0.163 m mast head, whose image is 7.06 mm: $f = h\' Z / h = 0.00706 \\times 1.847 / 0.163 = $ **0.080 m = 80 mm**.',
  },
  {
    id: 'jwst',
    label: 'Review deck: JWST photographs Saturn',
    mode: 'img',
    astro: true,
    v: { f: 131.4, Z: 1.2e12, h: 2.82e8, hi: imageSize(131.4, 2.82e8, 1.2e12) },
    note: 'Saturn’s rings ($h = 282\\,000$ km $= 2.82 \\times 10^8$ m) at $Z = 1.2 \\times 10^{12}$ m through JWST’s $f = 131.4$ m: $h\' = 131.4 \\times 2.82 \\times 10^8 / 1.2 \\times 10^{12} = $ **0.0309 m** (about 3 cm). Same formula, just bigger exponents: keep everything in metres.',
  },
  { id: 'free', label: 'Free play', mode: 'img', v: { f: 0.035, Z: 10, h: 2, hi: imageSize(0.035, 2, 10) }, note: 'Pick what to solve for, then drag the sliders. Every distance is from the pinhole (the camera’s optical centre).' },
];

/** Values with the solved-for one derived from the other three. */
function derive(mode: Mode, v: Vals): Vals {
  if (mode === 'img') return { ...v, hi: imageSize(v.f, v.h, v.Z) };
  if (mode === 'Z') return { ...v, Z: depthFromImage(v.f, v.h, v.hi) };
  return { ...v, f: focalFromImage(v.h, v.hi, v.Z) };
}

// ------------------------------------------------------------------ the figure

const W = 760;
const H = 330;
const Y0 = 168;
const XP = 482;
const WORLD_W = 420;
const CAM_W = 236;

/** Keep a range while the value sits inside [lo, hi] of it, else choose a fresh 1-2-5 range. */
function keepRange(prev: number, x: number, lo = 0.22, hi = 0.95): number {
  if (prev > 0 && x >= lo * prev && x <= hi * prev) return prev;
  return nice125(x / 0.7);
}

interface Scales {
  rZ: number;
  rF: number;
  V: number;
}

function PinholeFigure({ v, mode, scales }: { v: Vals; mode: Mode; scales: MutableRefObject<Scales> }) {
  const sc = scales.current;
  sc.rZ = keepRange(sc.rZ, v.Z);
  sc.rF = keepRange(sc.rF, v.f);
  const so = WORLD_W / sc.rZ; // px per metre, world side
  const si = CAM_W / sc.rF; // px per metre, camera side
  const big = Math.max(so * v.h, si * v.hi);
  if (!(sc.V > 0) || sc.V * big < 40 || sc.V * big > 132) sc.V = 100 / big;
  const V = sc.V;
  const xo = XP - so * v.Z;
  const xi = XP + si * v.f;
  const ho = V * so * v.h;
  const hi = V * si * v.hi;
  const boxH = Math.max(46, hi + 14);
  const th = Math.atan2(ho, XP - xo);
  const arcR = 34;
  const ratio = si / so;
  const solved = mode === 'img' ? 'hi' : mode;
  const ticks = [0.25, 0.5, 0.75, 1].map((k) => k * sc.rZ).filter((d) => so * d > 24);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="vision-svg" role="img" aria-label={`Side view: object ${fmtLen(v.h)} tall at ${fmtLen(v.Z)}, focal length ${fmtLen(v.f)}, image ${fmtLen(v.hi)}`}>
      {/* camera body */}
      <rect x={XP} y={Y0 - boxH} width={xi - XP + 10} height={2 * boxH} rx={6} className="vision-cambody" />
      <line x1={XP} y1={Y0 - boxH} x2={XP} y2={Y0 - 5} className="vision-camwall" />
      <line x1={XP} y1={Y0 + 5} x2={XP} y2={Y0 + boxH} className="vision-camwall" />
      <line x1={xi} y1={Y0 - boxH + 4} x2={xi} y2={Y0 + boxH - 4} className="vision-sensor" />
      <text x={xi + 14} y={Y0 - boxH + 14} className="vision-small">
        image plane
      </text>
      {/* optical axis and distance ticks */}
      <line x1={14} y1={Y0} x2={W - 6} y2={Y0} className="vision-axis" />
      {ticks.map((d) => (
        <g key={d}>
          <line x1={XP - so * d} y1={Y0 - 3} x2={XP - so * d} y2={Y0 + 3} className="vision-axis" />
          <text x={XP - so * d} y={Y0 + 15} textAnchor="middle" className="vision-tick">
            {fmtLen(d, 3)}
          </text>
        </g>
      ))}
      {/* similar triangles */}
      <polygon points={`${XP},${Y0} ${xo},${Y0} ${xo},${Y0 - ho}`} className="vision-tri" />
      <polygon points={`${XP},${Y0} ${xi},${Y0} ${xi},${Y0 + hi}`} className="vision-tri" />
      {/* the ray from the top of the object through the pinhole */}
      <line x1={xo} y1={Y0 - ho} x2={xi} y2={Y0 + hi} className="vision-ray" />
      {/* equal angles at the pinhole */}
      <path d={`M ${XP - arcR} ${Y0} A ${arcR} ${arcR} 0 0 1 ${XP - arcR * Math.cos(th)} ${Y0 - arcR * Math.sin(th)}`} className="vision-arc" />
      <path d={`M ${XP + arcR} ${Y0} A ${arcR} ${arcR} 0 0 1 ${XP + arcR * Math.cos(th)} ${Y0 + arcR * Math.sin(th)}`} className="vision-arc" />
      <text x={XP - arcR - 12} y={Y0 - 6} className="vision-label" textAnchor="end">
        θ
      </text>
      <text x={XP + arcR + 6} y={Y0 + 16} className="vision-label">
        θ
      </text>
      {/* object and image */}
      <line x1={xo} y1={Y0} x2={xo} y2={Y0 - ho} className="vision-obj" markerEnd="url(#vision-ph-head)" />
      <line x1={xi} y1={Y0} x2={xi} y2={Y0 + hi} className="vision-obj is-img" markerEnd="url(#vision-ph-head)" />
      <defs>
        <marker id="vision-ph-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="vision-obj-head" />
        </marker>
      </defs>
      <circle cx={XP} cy={Y0} r={3.5} className="vision-pinhole" />
      <text x={XP + 6} y={Y0 - 8} textAnchor="start" className="vision-small">
        pinhole
      </text>
      {/* dimension labels */}
      <text x={xo - 8} y={Y0 - ho / 2 + 4} textAnchor="end" className="vision-label">
        h = {fmtLen(v.h, 4)}
      </text>
      <line x1={xo} y1={Y0 + 30} x2={XP} y2={Y0 + 30} className="vision-dim" />
      <text x={(xo + XP) / 2} y={Y0 + 46} textAnchor="middle" className={`vision-label ${solved === 'Z' ? 'is-solved' : ''}`}>
        Z = {fmtLen(v.Z, 4)}
      </text>
      <line x1={XP} y1={Y0 - boxH - 22} x2={xi} y2={Y0 - boxH - 22} className="vision-dim" />
      <text x={(XP + xi) / 2} y={Y0 - boxH - 28} textAnchor="middle" className={`vision-label ${solved === 'f' ? 'is-solved' : ''}`}>
        f = {fmtLen(v.f, 4)}
      </text>
      <text x={xi + 10} y={Y0 + hi / 2 + 4} className={`vision-label ${solved === 'hi' ? 'is-solved' : ''}`}>
        h′ = {fmtLen(v.hi, 4)}
      </text>
      <text x={14} y={H - 8} className="vision-small">
        Not to scale: the camera side is magnified ×{fmt(ratio, 2)} and heights are drawn ×{fmt(V, 2)} on both sides, so the ray stays straight.
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ the simulation

interface Api {
  doubleZ(): void;
  closer(): void;
  lens(): void;
  mast(): void;
}

export default function PinholeSandbox() {
  const [preset, setPreset] = useState('q33');
  const [mode, setMode] = useState<Mode>('img');
  const [astro, setAstro] = useState(false);
  const [raw, setRaw] = useState<Vals>(PRESETS[0].v);
  const v = derive(mode, raw);
  const scales = useRef<Scales>({ rZ: 0, rF: 0, V: 0 });
  const tween = useTween();
  const pr = PRESETS.find((p) => p.id === preset) ?? PRESETS[0];

  const load = (id: string, m?: Mode) => {
    const p = PRESETS.find((q) => q.id === id) ?? PRESETS[0];
    setPreset(id);
    setMode(m ?? p.mode);
    setAstro(!!p.astro);
    setRaw(derive(m ?? p.mode, p.v));
    scales.current = { rZ: 0, rF: 0, V: 0 };
  };
  const setVal = (k: keyof Vals, x: number) => {
    setRaw({ ...v, [k]: x });
    if (preset !== 'free') setPreset('free');
  };
  const changeMode = (m: Mode) => {
    setRaw(v); // carry the derived value over, so nothing jumps
    setMode(m);
  };
  const toggleAstro = (on: boolean) => {
    setAstro(on);
    if (!on) {
      const c = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
      setRaw({ f: c(v.f, 0.004, 0.3), Z: c(v.Z, 0.5, 150), h: c(v.h, 0.05, 100), hi: c(v.hi, 0.0001, 0.1) });
      scales.current = { rZ: 0, rF: 0, V: 0 };
      setPreset('free');
    }
  };

  const api = useRef<Api>(null as unknown as Api);
  api.current = {
    doubleZ: () => {
      load('q33', 'img');
      tween({ from: [4.6], to: [9.2], ms: 1200 }, ([z]) => setRaw((r) => ({ ...r, Z: z })));
    },
    closer: () => {
      load('wheel', 'img');
      setRaw({ f: 0.05, h: 60, Z: 78.95, hi: 0.038 });
      tween({ from: [78.95], to: [58.95], ms: 1200 }, ([z]) => setRaw((r) => ({ ...r, Z: z })));
    },
    lens: () => {
      load('q33', 'img');
      tween({ from: [0.05], to: [0.1], ms: 1200 }, ([f]) => setRaw((r) => ({ ...r, f })));
    },
    mast: () => load('mast', 'f'),
  };

  // Units shown on the sliders: mm for f and h', m for Z and h.
  const sl = astro
    ? {
        f: { min: 1, max: 3e5, log: true },
        Z: { min: 0.1, max: 1e13, log: true },
        h: { min: 0.01, max: 1e9, log: true },
        hi: { min: 0.001, max: 1000, log: true },
      }
    : {
        f: { min: 4, max: 300, step: 1, log: false },
        Z: { min: 0.5, max: 150, step: 0.05, log: false },
        h: { min: 0.05, max: 100, step: 0.01, log: false },
        hi: { min: 0.1, max: 100, step: 0.01, log: false },
      };
  const fmtM = (x: number) => fmtLen(x, 4);
  const fmtMm = (mm: number) => fmtLen(mm / 1000, 4);

  const dv = useDeferredValue(v);
  const work = useMemo(() => formulaText(mode, dv), [mode, dv]);

  return (
    <div className="vision-sim">
      <div className="vision-toolbar">
        <Select label="Preset" value={preset} onChange={(id) => load(id)} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        <Segmented
          label="Solve for"
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'img', label: "Solve for h′", title: 'image size from f, h and Z' },
            { value: 'Z', label: 'Solve for Z', title: 'depth from a measured image' },
            { value: 'f', label: 'Solve for f', title: 'focal length from a measured image' },
          ]}
        />
        <Toggle checked={astro} onChange={toggleAstro} label="Astronomical range (log sliders)" />
      </div>

      <div className="vision-panels vision-panels-wide">
        <Panel title="Side view" hint="object · pinhole · image plane">
          <PinholeFigure v={v} mode={mode} scales={scales} />
        </Panel>
        <div className="vision-box">
          <h4>Inputs</h4>
          {mode !== 'f' && (
            <Slider label="focal length" tex="f" tip="Pinhole to image plane (the lens's focal length)" value={v.f * 1000} {...sl.f} unit="mm" format={astro ? fmtMm : undefined} onChange={(x) => setVal('f', x / 1000)} />
          )}
          {mode !== 'Z' && <Slider label="depth" tex="Z" tip="Distance from the pinhole to the object, along the optical axis" value={v.Z} {...sl.Z} unit="m" format={astro ? fmtM : undefined} onChange={(x) => setVal('Z', x)} />}
          <Slider label="object height" tex="h" tip="Real size of the object, perpendicular to the optical axis" value={v.h} {...sl.h} unit="m" format={astro ? fmtM : undefined} onChange={(x) => setVal('h', x)} />
          {mode !== 'img' && (
            <Slider label="measured image" tex="h'" tip="Size of the object's image on the sensor" value={v.hi * 1000} {...sl.hi} unit="mm" format={astro ? fmtMm : undefined} onChange={(x) => setVal('hi', x / 1000)} />
          )}
          <Readouts min={130}>
            <Readout tex="h'" label="image" text={fmtLen(v.hi)} tip="Image size h' = f h / Z" tone={mode === 'img' ? 'accent' : undefined} />
            <Readout tex="Z" label="depth" text={fmtLen(v.Z)} tip="Depth from the camera" tone={mode === 'Z' ? 'accent' : undefined} />
            <Readout tex="f" label="focal" text={fmtLen(v.f)} tip="Focal length" tone={mode === 'f' ? 'accent' : undefined} />
            <Readout tex="h/Z = h'/f" value={v.h / v.Z} sig={3} tip="The common ratio of the similar triangles: tan θ" />
          </Readouts>
        </div>
      </div>

      <div className="vision-controls">
        <div className="vision-box">
          <h4>Working (everything in metres)</h4>
          <Rich text={work} />
        </div>
        <div className="vision-box">
          <h4>{pr.id === 'free' ? 'Free play' : pr.label}</h4>
          <Rich className="vision-explain" text={pr.note} />
          <Callout kind="trap" title="Assumptions to state in the exam">
            Ideal pinhole, no lens distortion; the object is centred on the optical axis and its face is perpendicular to it; Z is measured from the camera’s optical centre (from the arm’s FK), not from the robot base.
          </Callout>
        </div>
      </div>

      <PredictBlock api={api} />
    </div>
  );
}

/** A length as TeX in the unit a person would use (µm, mm, m, or ×10ⁿ m). */
function texNat(m: number): string {
  const a = Math.abs(m);
  const n = (x: number) => String(Number(x.toPrecision(4)));
  if (a > 0 && a < 1e-3) return `${n(m * 1e6)}\\ \\mu\\text{m}`;
  if (a < 1) return `${n(m * 1e3)}\\ \\text{mm}`;
  return texLen(m);
}

function formulaText(mode: Mode, v: Vals): string {
  const f = texLen(v.f);
  const Z = texLen(v.Z);
  const h = texLen(v.h);
  const hi = texLen(v.hi);
  const convs: string[] = [];
  if (v.f < 1 && mode !== 'f') convs.push(`$f = ${texNat(v.f)} = ${f}$`);
  if (v.hi < 1 && mode !== 'img') convs.push(`$h' = ${texNat(v.hi)} = ${hi}$`);
  const conv = convs.length ? `Convert to metres first: ${convs.join(', ')}.` : 'The inputs are already in metres.';
  const back = (m: number) => (m < 1 ? ` = ${texNat(m)}` : '');
  if (mode === 'img')
    return `${conv}\n\n$$h' = \\frac{f\\,h}{Z} = \\frac{${f} \\times ${h}}{${Z}} = ${hi}${back(v.hi)}$$\n\nThe image grows with $f$ and $h$ and shrinks as $1/Z$.`;
  if (mode === 'Z')
    return `${conv}\n\n$$Z = \\frac{f\\,h}{h'} = \\frac{${f} \\times ${h}}{${hi}} = ${Z}$$\n\nmeasured from the camera. A smaller image means a farther object.`;
  return `${conv}\n\n$$f = \\frac{h'\\,Z}{h} = \\frac{${hi} \\times ${Z}}{${h}} = ${f}${back(v.f)}$$\n\nA longer lens gives a bigger image of the same object at the same distance.`;
}

// ------------------------------------------------------------------ predict, then check

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<Api> }) {
  return (
    <div className="vision-predicts">
      <PredictReveal
        id="vision-pinhole-double-z"
        question="The 1.7 m person in 2023 Q33 makes an 18.5 mm image at $Z$ = 4.6 m. They walk back to 9.2 m. Their image becomes about…"
        options={['9.2 mm: half as tall', '4.6 mm: a quarter, because it falls as $1/Z^2$', '37 mm: twice as tall', '18.5 mm: the person has not changed size']}
        answer={0}
        explain="$h' = f h / Z$, so $h' \propto 1/Z$: doubling the depth halves the image, $0.050 \times 1.7 / 9.2 = 0.00924$ m = 9.24 mm. The similar triangles keep the same shape on both sides: a flatter ray on the world side is a flatter ray on the camera side. ($1/Z^2$ is how brightness falls off, not size.)"
        tryIt="press Show me: the person walks from 4.6 m to 9.2 m."
        onApply={() => api.current.doubleZ()}
      />
      <PredictReveal
        id="vision-pinhole-closer"
        question="2024 Q30: the 60 m Wheel of Brisbane makes a 38 mm image through a 50 mm lens, so $Z$ = 78.95 m. The robot drives 20 m closer. The new image is…"
        options={['50.9 mm', '28.4 mm', '58 mm', '0.0509 mm']}
        answer={0}
        explain="Image size is inversely proportional to depth: $h'' = 38 \times 78.95 / 58.95 = 50.9$ mm, or directly $0.050 \times 60 / 58.95 = 0.0509$ m. 28.4 mm multiplies by the ratio the wrong way up (the image would shrink as you approach); 58 mm adds the 20 m to the image; 0.0509 mm is the right digits in the wrong unit (it is 0.0509 **m**)."
        tryIt="press Show me: the camera closes from 78.95 m to 58.95 m."
        onApply={() => api.current.closer()}
      />
      <PredictReveal
        id="vision-pinhole-lens"
        question="Same person at 4.6 m. Swap the 50 mm lens for a 100 mm lens. The image…"
        options={['doubles, to about 37 mm', 'halves, to about 9.2 mm', 'stays 18.5 mm: the focal length only changes the focus', 'grows four times, to about 74 mm']}
        answer={0}
        explain="$h' = f h / Z$ is proportional to $f$: the image plane moves twice as far behind the pinhole along the same ray, so the image is twice as tall, 36.96 mm. That is why a longer (telephoto) lens magnifies, and why $f$ is an **intrinsic** parameter: it changes the image without moving the camera."
        tryIt="press Show me: f grows from 50 mm to 100 mm."
        onApply={() => api.current.lens()}
      />
      <PredictReveal
        id="vision-pinhole-mast"
        question="2025 Q30(d): the 0.163 m mast head is 1.847 m from the camera and its image is 7.06 mm. The focal length is…"
        options={['80 mm', '42.6 m', '0.62 mm', '8.0 mm']}
        answer={0}
        explain="Rearrange for $f$: $f = h' Z / h = 0.00706 \times 1.847 / 0.163 = 0.080$ m = 80 mm. 42.6 m is $h Z / h'$ (the triangle upside down); 0.62 mm is $h' h / Z$; 8.0 mm drops a factor of ten while converting 7.06 mm."
        tryIt="press Show me: the sandbox switches to “Solve for f” with the 2025 numbers."
        onApply={() => api.current.mast()}
      />
    </div>
  );
});
