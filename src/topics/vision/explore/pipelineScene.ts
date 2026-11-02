// three.js renderer for the world → pixel pipeline (Pipeline3D.tsx). The simulation describes the scene as plain
// data (segments, points, translucent quads, labels) in a z-up world; this class turns it into a few batched line
// and mesh objects. It renders on demand (after a change or while orbiting), caps the pixel ratio at 2, lets the
// student drag points tagged with an id on a horizontal plane, and disposes everything on unmount.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { V3 } from '../../../core/vision';

export const PIPE_COLOR_VARS = ['--m1', '--m2', '--m3', '--m4', '--accent', '--text', '--text-2', '--text-3', '--surface', '--bad', '--warn'] as const;
export type PColor = (typeof PIPE_COLOR_VARS)[number];
export type PipeColors = Record<PColor, string>;

export interface Seg {
  a: V3;
  b: V3;
  color: PColor;
  dashed?: boolean;
  opacity?: number;
}
export interface Pt {
  at: V3;
  color: PColor;
  r: number;
  /** Draggable when set. */
  id?: string;
}
export interface Quad {
  pts: V3[];
  color: PColor;
  opacity: number;
}
export interface Lbl {
  key: string;
  text: string;
  at: V3;
  color?: string;
}
export interface PipeSpec {
  segs: Seg[];
  pts: Pt[];
  quads: Quad[];
  labels: Lbl[];
}

const tv = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

export class PipeRenderer {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(36, 1, 0.05, 400);
  private controls: OrbitControls;
  private dyn = new THREE.Group();
  private grid: THREE.GridHelper | null = null;
  private colors: PipeColors;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private labelEls = new Map<string, HTMLSpanElement>();
  private spec: PipeSpec | null = null;
  private hits: THREE.Mesh[] = [];
  private drag: { id: string; z: number; pid: number } | null = null;
  private rc = new THREE.Raycaster();
  private w = 1;
  private h = 1;
  onDrag: ((id: string, p: V3) => void) | null = null;

  constructor(
    private host: HTMLDivElement,
    private overlay: HTMLDivElement,
    colors: PipeColors
  ) {
    this.colors = colors;
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setClearColor(0x000000, 0);
    this.gl.domElement.className = 'vision-gl';
    host.appendChild(this.gl.domElement);
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(-6.2, -8.4, 5.6);
    this.controls = new OrbitControls(this.cam, this.gl.domElement);
    this.controls.target.set(-1.2, -1.1, 0.7);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.update();
    this.scene.add(this.dyn);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.2));
    this.makeGrid();
    const el = this.gl.domElement;
    el.addEventListener('pointerdown', this.onDown, true);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    this.resize();
  }

  private makeGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    const g = new THREE.GridHelper(8, 8, new THREE.Color(this.colors['--text-3']), new THREE.Color(this.colors['--text-3']));
    g.rotation.x = Math.PI / 2;
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.35;
    this.grid = g;
    this.scene.add(g);
  }

  setColors(c: PipeColors) {
    this.colors = c;
    this.makeGrid();
    if (this.spec) this.setScene(this.spec);
  }

  private clearDyn() {
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    }
    this.hits = [];
  }

  setScene(spec: PipeSpec) {
    this.spec = spec;
    this.clearDyn();
    // Line segments, batched by colour / dash / opacity.
    const groups = new Map<string, Seg[]>();
    for (const s of spec.segs) {
      const k = `${s.color}|${s.dashed ? 1 : 0}|${s.opacity ?? 1}`;
      const arr = groups.get(k);
      if (arr) arr.push(s);
      else groups.set(k, [s]);
    }
    for (const [k, segs] of groups) {
      const [color, dashed, op] = k.split('|');
      const pos = new Float32Array(segs.length * 6);
      segs.forEach((s, i) => pos.set([...s.a, ...s.b], i * 6));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const opacity = Number(op);
      const base = { color: new THREE.Color(this.colors[color as PColor]), transparent: opacity < 1, opacity };
      const mat = dashed === '1' ? new THREE.LineDashedMaterial({ ...base, dashSize: 0.12, gapSize: 0.08 }) : new THREE.LineBasicMaterial(base);
      const lines = new THREE.LineSegments(geo, mat);
      if (dashed === '1') lines.computeLineDistances();
      this.dyn.add(lines);
    }
    // Points as small spheres (draggable ones are hit-tested).
    for (const p of spec.pts) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 18, 12), new THREE.MeshLambertMaterial({ color: new THREE.Color(this.colors[p.color]) }));
      m.position.copy(tv(p.at));
      if (p.id) {
        m.userData.id = p.id;
        this.hits.push(m);
      }
      this.dyn.add(m);
    }
    // Translucent quads (image plane, cube faces).
    for (const q of spec.quads) {
      const pos: number[] = [];
      for (let i = 1; i + 1 < q.pts.length; i++) pos.push(...q.pts[0], ...q.pts[i], ...q.pts[i + 1]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.colors[q.color]), transparent: true, opacity: q.opacity, side: THREE.DoubleSide, depthWrite: false });
      this.dyn.add(new THREE.Mesh(geo, mat));
    }
    // Labels (HTML overlay).
    const keep = new Set(spec.labels.map((l) => l.key));
    for (const [k, el] of this.labelEls)
      if (!keep.has(k)) {
        el.remove();
        this.labelEls.delete(k);
      }
    for (const l of spec.labels) {
      let el = this.labelEls.get(l.key);
      if (!el) {
        el = document.createElement('span');
        el.className = 'vision-3dlabel';
        this.overlay.appendChild(el);
        this.labelEls.set(l.key, el);
      }
      if (el.dataset.t !== l.text) {
        el.dataset.t = l.text;
        const [base, sub] = l.text.split("_");
        el.textContent = base;
        if (sub) {
          const s2 = document.createElement("sub");
          s2.textContent = sub;
          el.appendChild(s2);
        }
      }
      el.style.color = l.color ?? '';
    }
    this.requestRender();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.w = w;
    this.h = h;
    this.gl.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  };

  private render() {
    this.gl.render(this.scene, this.cam);
    if (!this.spec) return;
    const v = new THREE.Vector3();
    for (const l of this.spec.labels) {
      const el = this.labelEls.get(l.key);
      if (!el) continue;
      v.copy(tv(l.at)).project(this.cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${((v.x + 1) / 2) * this.w}px, ${((1 - v.y) / 2) * this.h}px) translate(-50%, -50%)`;
    }
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.gl.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.hits.length) return;
    this.rc.setFromCamera(this.ndc(e), this.cam);
    const hit = this.rc.intersectObjects(this.hits, false)[0];
    if (!hit) return;
    e.stopPropagation();
    e.preventDefault();
    this.controls.enabled = false;
    this.drag = { id: String(hit.object.userData.id), z: hit.object.position.z, pid: e.pointerId };
    this.gl.domElement.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) {
      if (!this.hits.length) return;
      this.rc.setFromCamera(this.ndc(e), this.cam);
      this.gl.domElement.style.cursor = this.rc.intersectObjects(this.hits, false).length ? 'grab' : '';
      return;
    }
    this.rc.setFromCamera(this.ndc(e), this.cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -d.z);
    const p = new THREE.Vector3();
    if (this.rc.ray.intersectPlane(plane, p)) this.onDrag?.(d.id, [Math.max(-4, Math.min(4, p.x)), Math.max(-4, Math.min(4, p.y)), d.z]);
  };

  private onUp = () => {
    if (!this.drag) return;
    try {
      this.gl.domElement.releasePointerCapture(this.drag.pid);
    } catch {
      /* already released */
    }
    this.drag = null;
    this.controls.enabled = true;
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clearDyn();
    if (this.grid) {
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    const el = this.gl.domElement;
    el.removeEventListener('pointerdown', this.onDown, true);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    this.ro?.disconnect();
    for (const l of this.labelEls.values()) l.remove();
    this.labelEls.clear();
    this.gl.dispose();
    el.remove();
  }
}
