// Shared three.js arm renderer for the 3-D kinematics simulations (Viewer3D, BuildM, ScrewTable, PoeStepper).
//
// The robot is a set of bodies: body a moves with the partial product P[a] = e^[S1]θ1 ⋯ e^[Sa]θa, so every
// link, joint glyph, frame triad, screw axis and label is stored in the home (θ = 0) coordinates of the body it
// rides on and setPose() only rewrites n + 1 matrices. "Extras" (arrows, axes, points, arcs, dashed vectors)
// are rebuilt by the simulation when its state changes, never per frame. Labels are KaTeX in an HTML overlay.
// Rendering is on demand (after a change, while orbiting or flying the camera), devicePixelRatio ≤ 2, and
// everything is disposed on unmount.
//
// Exam view: an orthographic camera looking along −out with an oblique shear, so the out-of-page axis is drawn
// at half length, 45° down-left, exactly as on the papers. Orbit view: perspective camera + OrbitControls.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EXAM_ARMS, armScrewsS, linVecEval, partialSpace, type ArmSpec, type Mat4, type Screw, type Vec3 } from '../../../core/kin';
import { renderTeX } from '../../../ui/Rich';
import { useThemeColors } from '../../../ui/theme';
import { Button, Callout, Segmented, Select } from '../../../ui/kit';
import { freshSeed } from '../../../engine/rng';
import { useRaf } from '../../../anim/hooks';
import { AXIS_VARS, OBLIQUE_ANGLE, OBLIQUE_K, armBounds, drawValues, examOrbitDir, frontDir, hatTeX, paperXY, randomArmFor, sideDir, topDir, type View } from './kin3dMath';
import '../kin3d.css';

export const KIN3D_COLOR_VARS = ['--m1', '--m2', '--m3', '--m4', '--accent', '--text', '--text-2', '--text-3', '--surface', '--surface-2', '--bad', '--ok', '--pred', '--warn'] as const;
export type ColorKey = (typeof KIN3D_COLOR_VARS)[number];
export type Kin3DColors = Record<ColorKey, string>;

interface ExtraBase {
  /** Body the item rides on (0 = fixed in {s}; n = the end-effector). Coordinates are that body's home ones. */
  body?: number;
  color: ColorKey;
  opacity?: number;
}
export type Extra =
  | (ExtraBase & { kind: 'arrow'; from: Vec3; dir: Vec3; len: number; r?: number })
  | (ExtraBase & { kind: 'rod'; from: Vec3; to: Vec3; r?: number })
  | (ExtraBase & { kind: 'dash'; from: Vec3; to: Vec3 })
  | (ExtraBase & { kind: 'axis'; q: Vec3; w: Vec3; span: [number, number]; r?: number; head?: boolean })
  | (ExtraBase & { kind: 'point'; at: Vec3; r?: number })
  | (ExtraBase & { kind: 'arc'; at: Vec3; w: Vec3; r: number; tube?: number });

export interface Label {
  key: string;
  tex: string;
  at: Vec3;
  /** If given, the label is pushed 15 px further along the on-screen direction from → at (beyond an arrow tip). */
  from?: Vec3;
  body?: number;
  /** CSS colour, e.g. 'var(--m2)'. */
  color?: string;
  /** Extra class, e.g. 'is-big'. */
  cls?: string;
}

/** Pointer interaction on the canvas: hit-test in canvas pixels; a hit is captured (orbiting is suspended). */
export interface Interaction {
  hit(x: number, y: number): string | null;
  drag?(id: string, x: number, y: number): void;
  click?(id: string): void;
  end?(id: string): void;
  hover?(id: string | null): void;
}

export type ViewMode = 'exam' | 'orbit';

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_UP = new THREE.Vector3(0, 0, 1);
const tv = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);
const toM4 = (T: Mat4, out = new THREE.Matrix4()) =>
  out.set(T[0][0], T[0][1], T[0][2], T[0][3], T[1][0], T[1][1], T[1][2], T[1][3], T[2][0], T[2][1], T[2][2], T[2][3], 0, 0, 0, 1);

type Mat = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | THREE.LineDashedMaterial;

/** Triad arrows for a frame with origin o and axes the columns of R (x̂ orange, ŷ green, ẑ blue). */
export function triad(o: Vec3, R: readonly (readonly number[])[], len: number, body = 0, opacity?: number, r?: number): Extra[] {
  return [0, 1, 2].map((k) => ({ kind: 'arrow' as const, from: o, dir: [R[0][k], R[1][k], R[2][k]] as Vec3, len, color: AXIS_VARS[k], body, opacity, r }));
}
export function triadLabels(key: string, o: Vec3, R: readonly (readonly number[])[], len: number, sub: string, body = 0, cls?: string): Label[] {
  return [0, 1, 2].map((k) => ({
    key: `${key}${k}`,
    tex: hatTeX(k as 0 | 1 | 2, sub),
    at: [o[0] + len * R[0][k], o[1] + len * R[1][k], o[2] + len * R[2][k]] as Vec3,
    from: o,
    body,
    color: `var(${AXIS_VARS[k]})`,
    cls,
  }));
}

export class ArmRenderer {
  readonly gl: THREE.WebGLRenderer;
  private host: HTMLDivElement;
  private overlay: HTMLDivElement;
  private scene = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private persp = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  private controls: OrbitControls | null = null;
  private controlsUp = '';
  private mode: ViewMode = 'exam';
  private colors: Kin3DColors;
  private mats = new Map<string, { key: ColorKey; m: Mat }>();
  private geo = {
    cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
    cone: new THREE.ConeGeometry(1, 1, 20),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  private owned: THREE.BufferGeometry[] = [];
  private root = new THREE.Group();
  private bodies: THREE.Group[] = [];
  private extraGroups: THREE.Group[] = [];
  private ghost = new THREE.Group();
  private vals: Record<string, number> = {};
  private joints: THREE.Mesh[][] = [];
  /** Link meshes of the main arm, per body (for tinting the part a PoE factor moves). */
  private links: THREE.Mesh[][] = [];
  private highlight: number | null = null;
  private examB = { l: -1, r: 1, t: 1, b: -1 };
  private examAnim: { from: { l: number; r: number; t: number; b: number }; to: { l: number; r: number; t: number; b: number }; t0: number; ms: number } | null = null;
  private labels = new Map<string, { el: HTMLDivElement; item: Label; tex: string }>();
  private arm: ArmSpec | null = null;
  private screws: Screw[] = [];
  private view: View = { right: [0, 1, 0], up: [0, 0, 1], out: [1, 0, 0] };
  private center = new THREE.Vector3();
  private radius = 1;
  /** Size unit for glyphs (largest dimension of the robot). */
  u = 1;
  /** Joint glyph radius and length, link radius. */
  jr = 0.07;
  jl = 0.2;
  lr = 0.025;
  private framePts: Vec3[] = [];
  private w = 1;
  private h = 1;
  private raf = 0;
  private flight: { from: THREE.Vector3; q: THREE.Quaternion; t0: number; ms: number } | null = null;
  private ro: ResizeObserver | null = null;
  private interaction: Interaction | null = null;
  private drag: { id: string; x0: number; y0: number; moved: boolean; pid: number } | null = null;
  private hoverId: string | null = null;
  private shear = new THREE.Matrix4();
  private disposed = false;
  private tmp = new THREE.Vector3();

  constructor(host: HTMLDivElement, overlay: HTMLDivElement, colors: Kin3DColors) {
    this.host = host;
    this.overlay = overlay;
    this.colors = colors;
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setClearColor(0x000000, 0);
    this.gl.domElement.className = 'kin3d-gl';
    host.appendChild(this.gl.domElement);
    this.scene.add(this.root, this.ghost);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.1);
    this.scene.add(hemi);
    for (const cam of [this.ortho, this.persp]) {
      const d = new THREE.DirectionalLight(0xffffff, 1.5);
      d.position.set(0.5, 0.9, 1);
      cam.add(d);
      this.scene.add(cam);
    }
    host.addEventListener('pointerdown', this.onDown, true);
    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerup', this.onUp);
    host.addEventListener('pointercancel', this.onUp);
    host.addEventListener('pointerleave', this.onLeave);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    this.resize();
  }

  // ---------------------------------------------------------------- materials

  private mat(key: ColorKey, kind: 'lit' | 'flat' | 'dash' | 'xray' = 'lit', opacity = 1): Mat {
    const id = `${key}|${kind}|${opacity}`;
    let e = this.mats.get(id);
    if (!e) {
      const p = { color: new THREE.Color(this.colors[key]), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 };
      const m: Mat =
        kind === 'lit'
          ? new THREE.MeshLambertMaterial(p)
          : kind === 'flat'
            ? new THREE.MeshBasicMaterial(p)
            : kind === 'xray'
              ? new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity, depthTest: false, depthWrite: false })
              : new THREE.LineDashedMaterial({ ...p, dashSize: 0.04 * this.u, gapSize: 0.03 * this.u });
      e = { key, m };
      this.mats.set(id, e);
    }
    return e.m;
  }

  setColors(c: Kin3DColors) {
    this.colors = c;
    for (const { key, m } of this.mats.values()) m.color.set(c[key]);
    this.requestRender();
  }

  // ---------------------------------------------------------------- geometry helpers

  private place(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const d = b.clone().sub(a);
    const len = Math.max(1e-6, d.length());
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(Y_UP, d.divideScalar(len));
  }

  private rod(g: THREE.Object3D, a: Vec3, b: Vec3, r: number, m: Mat) {
    const mesh = new THREE.Mesh(this.geo.cyl, m);
    this.place(mesh, tv(a), tv(b), r);
    g.add(mesh);
    return mesh;
  }

  private arrowInto(g: THREE.Object3D, from: Vec3, dir: Vec3, len: number, m: Mat, r = 0.012 * this.u) {
    const d = tv(dir).normalize();
    const head = Math.min(len * 0.38, Math.max(0.06 * this.u, 4.2 * r));
    const a = tv(from);
    const b = a.clone().addScaledVector(d, len - head);
    const shaft = new THREE.Mesh(this.geo.cyl, m);
    this.place(shaft, a, b, r);
    const cone = new THREE.Mesh(this.geo.cone, m);
    cone.position.copy(b).addScaledVector(d, head / 2);
    cone.scale.set(r * 2.7, head, r * 2.7);
    cone.quaternion.setFromUnitVectors(Y_UP, d);
    g.add(shaft, cone);
  }

  // ---------------------------------------------------------------- the robot

  /** Build the robot (links, joint glyphs) at the zero configuration and frame the cameras on it. */
  setArm(arm: ArmSpec, vals: Record<string, number>) {
    this.arm = arm;
    this.vals = vals;
    this.view = arm.view;
    this.screws = armScrewsS(arm, vals);
    this.ghost.clear();
    const n = arm.joints.length;
    this.root.clear();
    this.bodies = [];
    this.extraGroups = [];
    for (let a = 0; a <= n; a++) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const e = new THREE.Group();
      g.add(e);
      this.bodies.push(g);
      this.extraGroups.push(e);
      this.root.add(g);
    }
    const b = armBounds(arm, vals);
    this.u = b.size;
    this.center.set(b.center[0], b.center[1], b.center[2]);
    this.radius = b.radius;
    // glyph sizes: proportional to the robot, but never bigger than the gaps between neighbouring joints
    const qs = arm.joints.map((j) => linVecEval(j.q, vals));
    let gap = Infinity;
    for (let i = 0; i < qs.length; i++)
      for (let j = i + 1; j < qs.length; j++) {
        const d = Math.hypot(qs[i][0] - qs[j][0], qs[i][1] - qs[j][1], qs[i][2] - qs[j][2]);
        if (d > 1e-6) gap = Math.min(gap, d);
      }
    if (!Number.isFinite(gap)) gap = this.u;
    this.jr = Math.min(0.062 * this.u, 0.25 * gap);
    this.jl = Math.min(0.19 * this.u, 0.62 * gap);
    this.lr = Math.min(0.024 * this.u, 0.4 * this.jr);
    this.links = this.bodies.map(() => []);
    this.joints = this.buildArm(arm, vals, this.bodies, this.mat('--text-2'), this.mat('--text-3'), true, this.links);
    // frame on the robot plus room for the {s} and {b} triads and their labels
    this.framePts = this.homePoints().map(([, x]) => x);
    this.highlight = null;
    this.setPose(arm.joints.map(() => 0));
    this.frameExam();
    this.frameOrbit();
    this.requestRender();
  }

  /** Points that must stay in view, each with the body it rides on: links, joints, {b} and both triads' tips. */
  private homePoints(triadLen = 0.36): [number, Vec3][] {
    const arm = this.arm;
    if (!arm) return [[0, [0, 0, 0]]];
    const vals = this.vals;
    const n = arm.joints.length;
    const out: [number, Vec3][] = [];
    arm.links.forEach((l) => l.pts.forEach((x) => out.push([Math.min(l.after, n), linVecEval(x, vals)])));
    arm.joints.forEach((j, i) => {
      const q = linVecEval(j.q, vals);
      out.push([i, q], [Math.min(i + 1, n), q]);
    });
    const p = linVecEval(arm.p, vals);
    const tl = triadLen * this.u;
    out.push([0, [0, 0, 0]], [n, p]);
    for (let k = 0; k < 3; k++) {
      const e: Vec3 = [0, 0, 0];
      e[k] = tl;
      out.push([0, e], [n, [p[0] + arm.R[0][k] * tl, p[1] + arm.R[1][k] * tl, p[2] + arm.R[2][k] * tl]]);
    }
    return out;
  }

  /**
   * Re-fit the exam view so that the robot stays in view in every listed state (each a list of n + 1 body
   * transforms, e.g. the poses a PoE animation passes through), plus any extra {s} points. Eased over `ms`.
   */
  fitBodies(sets: readonly (readonly Mat4[])[], extra: readonly Vec3[] = [], ms = 320, triadLen = 0.3) {
    if (!this.arm) return;
    const home = this.homePoints(triadLen);
    const pts: Vec3[] = [...extra];
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (const P of sets)
      for (const [body, x] of home) {
        toM4(P[Math.min(body, P.length - 1)], m);
        v.set(x[0], x[1], x[2]).applyMatrix4(m);
        pts.push([v.x, v.y, v.z]);
      }
    this.framePts = pts;
    // the orbit view only ever grows its framing radius (it is not re-aimed while the student orbits)
    for (const p of pts) this.radius = Math.max(this.radius, Math.hypot(p[0] - this.center.x, p[1] - this.center.y, p[2] - this.center.z) + 0.15 * this.u);
    this.frameExam(ms);
  }

  /** Links and joint glyphs into per-body groups; returns the joint meshes (for highlighting). */
  private buildArm(arm: ArmSpec, vals: Record<string, number>, groups: THREE.Object3D[], linkMat: Mat, jointMat: Mat, arrows: boolean, record?: THREE.Mesh[][]): THREE.Mesh[][] {
    const keep = (body: number, mesh: THREE.Mesh) => record?.[Math.min(body, record.length - 1)]?.push(mesh);
    for (const l of arm.links) {
      const a = Math.min(l.after, groups.length - 1);
      const g = groups[a];
      const pts = l.pts.map((p) => linVecEval(p, vals));
      for (let k = 0; k + 1 < pts.length; k++) keep(a, this.rod(g, pts[k], pts[k + 1], this.lr, linkMat));
      for (let k = 0; k < pts.length; k++) {
        const s = new THREE.Mesh(this.geo.sphere, linkMat);
        s.position.set(pts[k][0], pts[k][1], pts[k][2]);
        s.scale.setScalar(this.lr);
        g.add(s);
        keep(a, s);
      }
    }
    return arm.joints.map((j, i) => {
      const q = tv(linVecEval(j.q, vals));
      const ax = tv(j.axis).normalize();
      const g = groups[i];
      if (j.type === 'R') {
        const c = new THREE.Mesh(this.geo.cyl, jointMat);
        this.place(c, q.clone().addScaledVector(ax, -this.jl / 2), q.clone().addScaledVector(ax, this.jl / 2), this.jr);
        g.add(c);
        return [c];
      }
      // prismatic: a housing on the proximal body, a sliding rod on the distal one, an arrow for the direction of travel
      const box = new THREE.Mesh(this.geo.box, jointMat);
      box.position.copy(q);
      box.scale.set(this.jr * 1.9, this.jl * 1.25, this.jr * 1.9);
      box.quaternion.setFromUnitVectors(Y_UP, ax);
      g.add(box);
      const rod = new THREE.Mesh(this.geo.cyl, linkMat);
      this.place(rod, q.clone().addScaledVector(ax, -this.jl * 0.55), q.clone().addScaledVector(ax, this.jl * 0.75), this.lr * 1.15);
      groups[Math.min(i + 1, groups.length - 1)].add(rod);
      keep(i + 1, rod);
      const meshes = [box];
      if (arrows) {
        const side = new THREE.Vector3().crossVectors(ax, Math.abs(ax.z) < 0.9 ? Z_UP : new THREE.Vector3(1, 0, 0)).normalize();
        const from = q.clone().addScaledVector(side, this.jr * 1.9).addScaledVector(ax, -this.jl * 0.45);
        this.arrowInto(g, [from.x, from.y, from.z], [ax.x, ax.y, ax.z], this.jl * 0.9, linkMat, this.lr * 0.45);
      }
      return meshes;
    });
  }

  /** Joint values → body matrices. */
  setPose(theta: readonly number[]) {
    if (!this.arm) return;
    this.setBodies(partialSpace(this.screws, theta));
  }

  /** Body matrices directly (P[a] for a = 0 … n), e.g. a deliberately wrong product that tears the arm apart. */
  setBodies(P: readonly Mat4[]) {
    if (!this.arm) return;
    this.bodies.forEach((g, a) => {
      toM4(P[Math.min(a, P.length - 1)], g.matrix);
      g.matrixWorldNeedsUpdate = true;
    });
    this.requestRender();
  }

  setHighlight(i: number | null) {
    this.highlight = i;
    const hi = this.mat('--accent');
    const base = this.mat('--text-3');
    this.joints.forEach((ms, k) => ms.forEach((m) => (m.material = k === i ? hi : base)));
    this.requestRender();
  }

  /** Tint the links of bodies ≥ from (everything a PoE factor moves) in --m4, or none (null). */
  setMoving(from: number | null) {
    const on = this.mat('--m4');
    const off = this.mat('--text-2');
    this.links.forEach((ms, a) => ms.forEach((m) => (m.material = from !== null && a >= from ? on : off)));
    this.requestRender();
  }

  /** A faint copy of the robot at a fixed configuration (e.g. at M), or null to remove it. */
  setGhost(theta: readonly number[] | null) {
    this.ghost.clear();
    if (!theta || !this.arm) return this.requestRender();
    const P = partialSpace(this.screws, theta);
    const groups = P.map((T) => {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      toM4(T, g.matrix);
      this.ghost.add(g);
      return g;
    });
    const m = this.mat('--text-3', 'lit', 0.22);
    this.buildArm(this.arm, this.vals, groups, m, m, false);
    this.requestRender();
  }

  // ---------------------------------------------------------------- extras and labels

  setExtras(items: readonly Extra[]) {
    this.extraGroups.forEach((g) => g.clear());
    this.owned.forEach((g) => g.dispose());
    this.owned = [];
    for (const it of items) {
      const g = this.extraGroups[Math.max(0, Math.min(it.body ?? 0, this.extraGroups.length - 1))];
      if (!g) continue;
      const op = it.opacity ?? 1;
      if (it.kind === 'dash') {
        const geom = new THREE.BufferGeometry().setFromPoints([tv(it.from), tv(it.to)]);
        this.owned.push(geom);
        const line = new THREE.Line(geom, this.mat(it.color, 'dash', op));
        line.computeLineDistances();
        g.add(line);
        continue;
      }
      // each item twice: normally, and as a faint "x-ray" copy that shows through the links
      const solid = new THREE.Group();
      const xray = new THREE.Group();
      this.extraInto(it, solid, this.mat(it.color, 'flat', op));
      this.extraInto(it, xray, this.mat(it.color, 'xray', Math.round(op * 0.3 * 100) / 100));
      xray.traverse((o) => (o.renderOrder = 3));
      g.add(solid, xray);
    }
    this.requestRender();
  }

  private extraInto(it: Exclude<Extra, { kind: 'dash' }>, g: THREE.Object3D, m: Mat) {
    switch (it.kind) {
      case 'arrow':
        this.arrowInto(g, it.from, it.dir, it.len, m, it.r);
        break;
      case 'rod':
        this.rod(g, it.from, it.to, it.r ?? 0.008 * this.u, m);
        break;
      case 'axis': {
        const w = tv(it.w).normalize();
        const q = tv(it.q);
        const r = it.r ?? 0.0065 * this.u;
        const a = q.clone().addScaledVector(w, it.span[0]);
        const b = q.clone().addScaledVector(w, it.span[1]);
        const line = new THREE.Mesh(this.geo.cyl, m);
        this.place(line, a, b, r);
        g.add(line);
        if (it.head !== false) {
          const head = 0.075 * this.u;
          const cone = new THREE.Mesh(this.geo.cone, m);
          cone.position.copy(b).addScaledVector(w, head / 2);
          cone.scale.set(Math.max(r * 4.2, 0.022 * this.u), head, Math.max(r * 4.2, 0.022 * this.u));
          cone.quaternion.setFromUnitVectors(Y_UP, w);
          g.add(cone);
        }
        break;
      }
      case 'point': {
        const s = new THREE.Mesh(this.geo.sphere, m);
        s.position.copy(tv(it.at));
        s.scale.setScalar(it.r ?? 0.03 * this.u);
        g.add(s);
        break;
      }
      case 'arc': {
        const tube = it.tube ?? 0.009 * this.u;
        const geom = new THREE.TorusGeometry(it.r, tube, 8, 48, Math.PI * 1.5);
        this.owned.push(geom);
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(geom, m));
        const cone = new THREE.Mesh(this.geo.cone, m);
        // the arc runs anticlockwise about local +z from angle 0 to 270°; its tip at (0, −r, 0) moves along +x
        cone.position.set(0, -it.r, 0);
        cone.scale.set(tube * 3, tube * 7, tube * 3);
        cone.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(1, 0, 0));
        grp.add(cone);
        grp.position.copy(tv(it.at));
        grp.quaternion.setFromUnitVectors(Z_UP, tv(it.w).normalize());
        g.add(grp);
        break;
      }
    }
  }

  setLabels(items: readonly Label[]) {
    const keep = new Set<string>();
    for (const it of items) {
      keep.add(it.key);
      let e = this.labels.get(it.key);
      if (!e) {
        const el = document.createElement('div');
        el.className = 'kin3d-label';
        this.overlay.appendChild(el);
        e = { el, item: it, tex: '' };
        this.labels.set(it.key, e);
      }
      e.item = it;
      if (e.tex !== it.tex) {
        e.el.innerHTML = renderTeX(it.tex);
        e.tex = it.tex;
      }
      e.el.style.color = it.color ?? '';
      e.el.className = `kin3d-label ${it.cls ?? ''}`;
    }
    for (const [k, e] of this.labels)
      if (!keep.has(k)) {
        e.el.remove();
        this.labels.delete(k);
      }
    this.requestRender();
  }

  // ---------------------------------------------------------------- cameras

  private camera(): THREE.Camera {
    return this.mode === 'exam' ? this.ortho : this.persp;
  }

  getMode() {
    return this.mode;
  }

  /** Fit the exam view to framePts; with ms > 0 (and the exam view showing) the change is eased. */
  private frameExam(ms = 0) {
    const to = this.examTarget();
    if (ms > 0 && this.mode === 'exam' && !this.disposed) {
      this.examAnim = { from: { ...this.examB }, to, t0: performance.now(), ms };
      this.requestRender();
    } else {
      this.examAnim = null;
      this.applyExam(to);
    }
  }

  /** The orthographic window (in the camera's sheared screen coordinates) that holds every frame point. */
  private examTarget() {
    const c = this.center;
    const v = this.view;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of this.framePts.length ? this.framePts : [[0, 0, 0] as Vec3]) {
      const [x, y] = paperXY([p[0] - c.x, p[1] - c.y, p[2] - c.z], v);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    // fit the drawing below the view bar (top) and above the hint line (bottom)
    const pad = 0.1 * this.u;
    const topPx = 46;
    const botPx = 26;
    const avail = Math.max(60, this.h - topPx - botPx);
    const wpp = Math.max((y1 - y0 + 2 * pad) / avail, (x1 - x0 + 2 * pad) / Math.max(60, this.w - 30));
    const hh = (this.h / 2) * wpp;
    const hw = (this.w / 2) * wpp;
    const shift = (topPx + avail / 2 - this.h / 2) * wpp;
    return { l: cx - hw, r: cx + hw, t: cy + shift + hh, b: cy + shift - hh };
  }

  private applyExam(B: { l: number; r: number; t: number; b: number }) {
    const cam = this.ortho;
    const c = this.center;
    const v = this.view;
    const D = this.radius * 4 + 1;
    cam.position.set(c.x + v.out[0] * D, c.y + v.out[1] * D, c.z + v.out[2] * D);
    cam.up.set(v.up[0], v.up[1], v.up[2]);
    cam.lookAt(c);
    this.examB = B;
    cam.left = B.l;
    cam.right = B.r;
    cam.top = B.t;
    cam.bottom = B.b;
    cam.near = 0.01;
    cam.far = 2 * D;
    cam.updateProjectionMatrix();
    const a = OBLIQUE_K * Math.cos(OBLIQUE_ANGLE);
    const b = OBLIQUE_K * Math.sin(OBLIQUE_ANGLE);
    // x' = x − a(z + D), y' = y − b(z + D) in view space: the out-of-page axis (+z) goes down-left at half length
    this.shear.set(1, 0, -a, -a * D, 0, 1, -b, -b * D, 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.multiply(this.shear);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  private makeControls() {
    const up = this.view.up.join(',');
    if (this.controls && this.controlsUp === up) return;
    this.controls?.dispose();
    this.persp.up.set(this.view.up[0], this.view.up[1], this.view.up[2]);
    const c = new OrbitControls(this.persp, this.gl.domElement);
    c.enableDamping = false;
    c.rotateSpeed = 0.8;
    c.addEventListener('change', () => this.requestRender());
    c.enabled = this.mode === 'orbit';
    this.controls = c;
    this.controlsUp = up;
  }

  private orbitDistance() {
    return (this.radius / Math.sin((this.persp.fov * Math.PI) / 360)) * 1.02;
  }

  /** Put the orbit camera in the direction dir (default: like the exam view). */
  private frameOrbit(dir?: Vec3) {
    const D = this.orbitDistance();
    const d = tv(dir ?? examOrbitDir(this.view)).normalize();
    this.makeControls();
    this.persp.position.copy(this.center).addScaledVector(d, D);
    this.persp.near = D / 60;
    this.persp.far = D * 12;
    this.persp.updateProjectionMatrix();
    this.persp.lookAt(this.center);
    if (this.controls) {
      this.controls.target.copy(this.center);
      this.controls.maxDistance = D * 4;
      this.controls.minDistance = D * 0.25;
      this.controls.update();
    }
  }

  setView(mode: ViewMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.flight = null;
    if (mode === 'orbit') this.frameOrbit();
    if (this.controls) this.controls.enabled = mode === 'orbit';
    this.requestRender();
  }

  /** Swing the orbit camera round to look from direction dir (switches to the orbit view). */
  flyTo(dir: Vec3, ms = 900) {
    if (this.mode !== 'orbit') {
      this.mode = 'orbit';
      this.frameOrbit();
      if (this.controls) this.controls.enabled = true;
    }
    const from = this.persp.position.clone().sub(this.center);
    const to = tv(dir).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to);
    this.flight = { from, q, t0: performance.now(), ms };
    this.requestRender();
  }

  /** Named quick views. */
  flyNamed(name: 'exam' | 'top' | 'side' | 'front') {
    const v = this.view;
    this.flyTo(name === 'top' ? topDir(v) : name === 'side' ? sideDir(v) : name === 'front' ? frontDir(v) : examOrbitDir(v));
  }

  // ---------------------------------------------------------------- rendering

  requestRender() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    if (this.examAnim) {
      const a = this.examAnim;
      const t = Math.max(0, Math.min(1, (now - a.t0) / a.ms));
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const mix = (x: number, y: number) => x + (y - x) * e;
      this.applyExam({ l: mix(a.from.l, a.to.l), r: mix(a.from.r, a.to.r), t: mix(a.from.t, a.to.t), b: mix(a.from.b, a.to.b) });
      if (t < 1) this.requestRender();
      else this.examAnim = null;
    }
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.t0) / f.ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const q = new THREE.Quaternion().slerp(f.q, e);
      this.persp.position.copy(this.center).add(f.from.clone().applyQuaternion(q));
      this.persp.lookAt(this.center);
      if (t < 1) this.requestRender();
      else {
        this.flight = null;
        this.controls?.update();
      }
    }
    const cam = this.camera();
    this.scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    this.gl.render(this.scene, cam);
    this.placeLabels(cam);
  };

  private placeLabels(cam: THREE.Camera) {
    const v = this.tmp;
    const f = new THREE.Vector3();
    for (const { el, item } of this.labels.values()) {
      const g = this.bodies[Math.max(0, Math.min(item.body ?? 0, this.bodies.length - 1))];
      v.set(item.at[0], item.at[1], item.at[2]);
      if (g) v.applyMatrix4(g.matrixWorld);
      v.project(cam);
      if (!(v.z > -1 && v.z < 1)) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      let x = ((v.x + 1) / 2) * this.w;
      let y = ((1 - v.y) / 2) * this.h;
      if (item.from) {
        f.set(item.from[0], item.from[1], item.from[2]);
        if (g) f.applyMatrix4(g.matrixWorld);
        f.project(cam);
        const dx = x - ((f.x + 1) / 2) * this.w;
        const dy = y - ((1 - f.y) / 2) * this.h;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          x += (dx / d) * 15;
          y += (dy / d) * 15;
        } else {
          x += 13;
          y -= 11;
        }
      }
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  /** Canvas pixel position of a point given in a body's home coordinates (null if behind the camera). */
  project(p: Vec3, body = 0): { x: number; y: number } | null {
    const cam = this.camera();
    cam.updateMatrixWorld();
    const g = this.bodies[Math.max(0, Math.min(body, this.bodies.length - 1))];
    const v = tv(p);
    if (g) {
      g.updateMatrixWorld();
      v.applyMatrix4(g.matrixWorld);
    }
    v.project(cam);
    if (!(v.z > -1 && v.z < 1)) return null;
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.w = w;
    this.h = h;
    this.gl.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.frameExam();
    this.requestRender();
  }

  // ---------------------------------------------------------------- pointer interaction

  setInteraction(h: Interaction | null) {
    this.interaction = h;
    if (!h) this.host.style.cursor = '';
  }

  private local(e: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    const h = this.interaction;
    if (!h || e.button !== 0) return;
    const { x, y } = this.local(e);
    const id = h.hit(x, y);
    if (!id) return;
    e.stopPropagation();
    e.preventDefault();
    this.drag = { id, x0: x, y0: y, moved: false, pid: e.pointerId };
    try {
      this.host.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (h.drag) this.host.style.cursor = 'grabbing';
  };

  private onMove = (e: PointerEvent) => {
    const h = this.interaction;
    if (!h) return;
    const { x, y } = this.local(e);
    if (this.drag) {
      if (Math.hypot(x - this.drag.x0, y - this.drag.y0) > 3) this.drag.moved = true;
      if (this.drag.moved) h.drag?.(this.drag.id, x, y);
      return;
    }
    if (e.buttons !== 0) return;
    const id = h.hit(x, y);
    if (id !== this.hoverId) {
      this.hoverId = id;
      h.hover?.(id);
      this.host.style.cursor = id ? (h.drag ? 'grab' : 'pointer') : '';
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try {
      this.host.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.host.style.cursor = '';
    if (!d.moved) this.interaction?.click?.(d.id);
    this.interaction?.end?.(d.id);
  };

  private onLeave = () => {
    if (this.drag || !this.hoverId) return;
    this.hoverId = null;
    this.interaction?.hover?.(null);
    this.host.style.cursor = '';
  };

  // ---------------------------------------------------------------- teardown

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.host.removeEventListener('pointerdown', this.onDown, true);
    this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerup', this.onUp);
    this.host.removeEventListener('pointercancel', this.onUp);
    this.host.removeEventListener('pointerleave', this.onLeave);
    this.controls?.dispose();
    this.owned.forEach((g) => g.dispose());
    Object.values(this.geo).forEach((g) => g.dispose());
    for (const { m } of this.mats.values()) m.dispose();
    this.labels.forEach(({ el }) => el.remove());
    this.labels.clear();
    this.scene.clear();
    this.gl.dispose();
    this.gl.forceContextLoss();
    this.gl.domElement.remove();
  }
}

// ------------------------------------------------------------------ React wrapper

/**
 * The 3-D view: a canvas plus a label overlay. `onReady` receives the renderer once it exists (null when WebGL
 * is unavailable or on unmount); keep it in state so effects that drive the scene re-run with it.
 */
export function Kin3DView({ onReady, height = 470, label, children, hint }: { onReady: (r: ArmRenderer | null) => void; height?: number; label: string; children?: ReactNode; hint?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const colors = useThemeColors(KIN3D_COLOR_VARS);
  const rRef = useRef<ArmRenderer | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const [err, setErr] = useState('');
  useLayoutEffect(() => {
    if (!host.current || !overlay.current) return;
    let r: ArmRenderer;
    try {
      r = new ArmRenderer(host.current, overlay.current, colorsRef.current);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      readyRef.current(null);
      return;
    }
    rRef.current = r;
    readyRef.current(r);
    return () => {
      rRef.current = null;
      readyRef.current(null);
      r.dispose();
    };
  }, []);
  useEffect(() => {
    rRef.current?.setColors(colors);
  }, [colors]);
  return (
    <div className="kin3d-view" style={{ height }}>
      <div ref={host} className="kin3d-host" role="img" aria-label={label} />
      <div ref={overlay} className="kin3d-labels" aria-hidden="true" />
      {children}
      {hint && <div className="kin3d-hint">{hint}</div>}
      {err && (
        <div className="kin3d-noweb">
          <Callout kind="warn" title="3-D view unavailable">
            This browser could not start WebGL ({err}). The tables and checks below still work.
          </Callout>
        </div>
      )}
    </div>
  );
}

/** Exam view / Orbit toggle plus quick views, drawn over the top-left corner of the 3-D view. */
export function ViewBar({ r, mode, setMode, quick = true }: { r: ArmRenderer | null; mode: ViewMode; setMode: (m: ViewMode) => void; quick?: boolean }) {
  return (
    <div className="kin3d-viewbar">
      <Segmented
        size="sm"
        label="Camera"
        value={mode}
        onChange={(m) => {
          setMode(m);
          r?.setView(m);
        }}
        options={[
          { value: 'exam', label: 'Exam view', title: 'The paper’s oblique drawing: out of the page is drawn down-left' },
          { value: 'orbit', label: 'Orbit', title: 'Drag to rotate, wheel to zoom, right-drag to pan' },
        ]}
      />
      {quick && mode === 'orbit' && (
        <>
          <Button size="sm" onClick={() => r?.flyNamed('top')} title="Look down from above: into the page is at the top of the screen">
            Top
          </Button>
          <Button size="sm" onClick={() => r?.flyNamed('side')} title="Look from the right-hand side: into the page points right">
            Side
          </Button>
          <Button size="sm" onClick={() => r?.flyNamed('exam')} title="Back to the exam-like direction">
            Reset
          </Button>
        </>
      )}
    </div>
  );
}

/** Legend for the axis colours. */
export function AxisLegend({ extra }: { extra?: ReactNode }) {
  return (
    <div className="kin3d-legend" aria-label="Colour key">
      <span>
        <i style={{ background: 'var(--m2)' }} /> <span dangerouslySetInnerHTML={{ __html: renderTeX('\\hat x') }} />
      </span>
      <span>
        <i style={{ background: 'var(--m3)' }} /> <span dangerouslySetInnerHTML={{ __html: renderTeX('\\hat y') }} />
      </span>
      <span>
        <i style={{ background: 'var(--m1)' }} /> <span dangerouslySetInnerHTML={{ __html: renderTeX('\\hat z') }} />
      </span>
      {extra}
    </div>
  );
}

// ------------------------------------------------------------------ robot choice

export const ARM_OPTIONS = [...EXAM_ARMS.map((a) => ({ value: a.id, label: a.name })), { value: 'random', label: 'Random axis-aligned arm' }];

export interface ArmChoice {
  id: string;
  arm: ArmSpec;
  vals: Record<string, number>;
  setId: (id: string) => void;
  reroll: () => void;
}

export function useArmChoice(initial = 'rprr-2023', filter?: (a: ArmSpec) => boolean): ArmChoice {
  const [id, setId] = useState(initial);
  const [seed, setSeed] = useState(() => freshSeed());
  const arm = useMemo(() => {
    if (id === 'random') {
      for (let k = 0; k < 20; k++) {
        const a = randomArmFor(seed + k);
        if (!filter || filter(a)) return a;
      }
      return randomArmFor(seed);
    }
    return EXAM_ARMS.find((a) => a.id === id) ?? EXAM_ARMS[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, seed]);
  const vals = useMemo(() => drawValues(arm), [arm]);
  return {
    id,
    arm,
    vals,
    setId,
    reroll: () => {
      setSeed(freshSeed());
      setId('random');
    },
  };
}

export function ArmPicker({ choice, options = ARM_OPTIONS }: { choice: ArmChoice; options?: { value: string; label: string }[] }) {
  return (
    <>
      <Select label="Robot" value={choice.id} options={options} onChange={choice.setId} />
      <Button onClick={choice.reroll} title="A new random axis-aligned arm (like the exam figures)">
        🎲 Random arm
      </Button>
    </>
  );
}

/**
 * Bring the 3-D view inside `root` on screen (centred) when a prediction's "Show me" runs from further down the
 * page, so the student sees the answer happen. Does nothing if it is already fully visible below the app header.
 */
export function revealView(root: HTMLElement | null) {
  const el = root?.querySelector<HTMLElement>('.kin3d-view');
  if (!el || typeof window === 'undefined') return;
  const r = el.getBoundingClientRect();
  if (r.top >= 110 && r.bottom <= window.innerHeight - 8) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

// ------------------------------------------------------------------ small animation helper

export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Runs one tween at a time on the animation loop (pauses off-screen). step(t) gets t in [0, 1]. */
export function useTween() {
  const job = useRef<{ t0: number; ms: number; step: (t: number) => void; done?: () => void } | null>(null);
  const [active, setActive] = useState(false);
  useRaf(() => {
    const j = job.current;
    if (!j) return;
    const t = Math.min(1, (performance.now() - j.t0) / j.ms);
    j.step(t);
    if (t >= 1) {
      job.current = null;
      setActive(false);
      j.done?.();
    }
  }, active);
  return {
    active,
    run: (ms: number, step: (t: number) => void, done?: () => void) => {
      job.current = { t0: performance.now(), ms, step, done };
      setActive(true);
    },
    stop: () => {
      job.current = null;
      setActive(false);
    },
  };
}
