import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import gsap from 'gsap';
import vert from './shaders/vert.glsl?raw';
import frag from './shaders/frag.glsl?raw';
import { AWARD_STARS, FORM, FORM_COUNT, STRIDE, genSeeds, genWordmark, mulberry32, buildShapes, type FormName } from './shapes';

export type Kind = 'hero' | 'left' | 'right' | 'center';
export interface Target { form: FormName; kind: Kind }
interface Layout { s: number; x: number; y: number }

const FOV = 38;
const CAM_Z = 8;
const SIZE = { name: [6, 2.5], gaze: [6.3, 3.6], terrain: [6.4, 3.9], voice: [4.6, 4.2], pipeline: [7.2, 3.5], docs: [5.6, 4.3], pulse: [3.4, 3.4], stars: [8, 4.6] } as const;

const PALETTE = {
  night: { c0: '#5B5BD6', c1: '#2BB3A3', c2: '#F2A541', neutral: '#7F8A97', alpha: 1, size: 2.3 },
  day: { c0: '#3A3AA8', c1: '#0E7F73', c2: '#C26F08', neutral: '#6F685C', alpha: 1.35, size: 2.0 },
};

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function pointBudget(): number {
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 8;
  const low = cores <= 4 || mem <= 4;
  let n = mobile ? 12000 : 40000;
  if (low) n = Math.min(n, mobile ? 9000 : 22000);
  return n;
}

export class PointField {
  readonly canvas: HTMLCanvasElement;
  readonly N: number;
  reduced: boolean;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  private geo = new BufferGeometry();
  private mat: ShaderMaterial;
  private points: Points;
  private pos: (InterleavedBufferAttribute | null)[] = new Array(FORM_COUNT).fill(null);
  private ext: (InterleavedBufferAttribute | null)[] = new Array(FORM_COUNT).fill(null);
  private waiting: (() => void)[][] = Array.from({ length: FORM_COUNT }, () => []);

  // morph state
  private cur: number = FORM.stars; // form currently shown (or morph origin)
  private morphing = false;
  private queued: Target | null = null;
  private held = true; // scroll-driven requests wait until the intro has started
  private ready = false;
  private curTarget: Target = { form: 'stars', kind: 'center' };
  private layout: Layout = { s: 1, x: 0, y: 0 };
  private mask = { side: 0, edge: 0, soft: 0.12, k: 0 };
  private tw: gsap.core.Tween | null = null;

  // runtime
  private time = 3 + Math.random() * 40;
  private dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  private dprMax = this.dpr;
  private ft: number[] = [];
  private lowDraw = 1;
  private visible = true;
  private onScreen = true;
  private dirty = true;
  private ptrTarget = { x: 0, y: 0, a: 0 };
  private ptr = { x: 0, y: 0, a: 0, nx: 0, ny: 0 };
  private lastMove = 0;
  private dollyZ = { z: CAM_Z };
  private beat = 0;
  private beatRate = 0.55;
  beatFast = false;
  private dim = { v: 0 };
  private micLevel = 0;
  private adaptive = !/[?&]noadapt/.test(location.search);
  theme: 'night' | 'day' = 'night';

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    // a software rasteriser (no GPU) is the lowest tier there is: use the light budget
    let n = pointBudget();
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|software/i.test(name) && !/[?&]noadapt/.test(location.search)) {
        n = Math.min(n, 9000);
        this.dpr = this.dprMax = 1;
      }
    } catch { /* keep the default */ }
    this.N = n;
    this.renderer.setClearColor(0x000000, 0);
    this.mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uProgress: { value: 1 }, uPR: { value: this.dpr }, uSize: { value: 2.3 }, uScroll: { value: 0 },
        uSection: { value: 0 }, uChaos: { value: 1 }, uIntro: { value: 0 }, uBeat: { value: 0 }, uMic: { value: 0 }, uMicOn: { value: 0 },
        uRipple: { value: 0 }, uDim: { value: 0 }, uAlphaMul: { value: 1 },
        uFormA: { value: 0 }, uFormB: { value: 0 },
        uLayout: { value: new Vector3(1, 0, 0) },
        uPointer: { value: new Vector4(0, 0, 0, 1.15) },
        uTextMask: { value: new Vector4(0, 0, 0.12, 0) },
        uC0: { value: new Color() }, uC1: { value: new Color() }, uC2: { value: new Color() }, uNeutral: { value: new Color() },
      },
    });

    const N = this.N;
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    this.geo.setAttribute('aSeed', new BufferAttribute(genSeeds(N), 4));
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.camera.position.set(0, 0, CAM_Z);
    this.setTheme('night');
    this.resize();

    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.addEventListener('pointermove', (e) => this.onPointer(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.onPointer(e), { passive: true });
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden;
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => {
        this.onScreen = en[en.length - 1].isIntersecting;
      }).observe(canvas);
    }
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  }

  /* ---------- shapes ---------- */
  private install(form: number, data: Float32Array) {
    const buf = new InterleavedBuffer(data, STRIDE);
    this.pos[form] = new InterleavedBufferAttribute(buf, 4, 0);
    this.ext[form] = new InterleavedBufferAttribute(buf, 4, 4);
    const w = this.waiting[form];
    this.waiting[form] = [];
    w.forEach((f) => f());
  }
  private whenReady(form: number) {
    return new Promise<void>((res) => (this.pos[form] ? res() : this.waiting[form].push(res)));
  }

  /** Generate every procedural form (worker if available) and the wordmark. Resolves when stars + wordmark exist. */
  async build(fontFamily: string): Promise<void> {
    const N = this.N;
    const rest = new Promise<void>((resolve) => {
      const done = (shapes: Float32Array[]) => {
        shapes.forEach((s, i) => { if (s && i !== FORM.name) this.install(i, s); });
        resolve();
      };
      try {
        const w = new Worker(new URL('./shapes.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<{ shapes: Float32Array[] }>) => { done(e.data.shapes); w.terminate(); };
        w.onerror = () => { w.terminate(); done(buildShapes(N)); };
        w.postMessage({ N });
      } catch {
        done(buildShapes(N));
      }
    });
    try {
      this.install(FORM.name, genWordmark(N, ['Mohammed', 'Shadab'], fontFamily, mulberry32(99)));
    } catch {
      // wordmark failed (no 2d canvas): bind() falls back to the star field so the page still works
      this.waiting[FORM.name].forEach((f) => f());
    }
    await rest;
    this.bind(FORM.stars, FORM.stars);
    this.cur = FORM.stars;
    this.ready = true;
  }

  private bind(a: number, b: number) {
    const A = this.pos[a] ?? this.pos[FORM.stars], B = this.pos[b] ?? this.pos[FORM.stars];
    this.geo.setAttribute('aA', A!);
    this.geo.setAttribute('aA2', (this.ext[a] ?? this.ext[FORM.stars])!);
    this.geo.setAttribute('aB', B!);
    this.geo.setAttribute('aB2', (this.ext[b] ?? this.ext[FORM.stars])!);
    this.mat.uniforms.uFormA.value = a;
    this.mat.uniforms.uFormB.value = b;
  }

  /* ---------- layout ---------- */
  private layoutFor(t: Target): Layout {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const viewH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    const viewW = viewH * aspect;
    if (t.form === 'stars') {
      const s = Math.min(1.15, Math.max(0.45, viewW / 9.5));
      return t.kind === 'hero' && aspect > 1.05 ? { s: s * 0.9, x: 0, y: -viewH * 0.1 } : { s, x: 0, y: 0 };
    }
    const [w, h] = SIZE[t.form];
    const wide = aspect > 1.05;
    if (t.form === 'name') {
      const s = wide ? Math.min((viewW * 0.72) / w, (viewH * 0.55) / h) : (viewW * 0.9) / w;
      const padPx = Math.min(64, Math.max(20, this.canvas.clientWidth * 0.04));
      const left = -viewW / 2 + (padPx / this.canvas.clientWidth) * viewW;
      return { s, x: left + (w * s) / 2, y: wide ? viewH * 0.12 : viewH * 0.17 };
    }
    if (!wide) {
      const s = Math.min((viewW * 0.95) / w, (viewH * (t.kind === 'hero' ? 0.5 : 0.42)) / h);
      return { s, x: 0, y: t.kind === 'hero' ? viewH * 0.14 : viewH * 0.12 };
    }
    if (t.kind === 'hero') {
      const s = Math.min((viewW * 0.78) / w, (viewH * 0.6) / h);
      return { s, x: viewW * 0.03, y: viewH * 0.1 };
    }
    if (t.kind === 'center') {
      const s = Math.min((viewW * 0.7) / w, (viewH * 0.74) / h);
      return { s, x: 0, y: 0 };
    }
    const s = Math.min((viewW * 0.46) / w, (viewH * 0.74) / h);
    return { s, x: (t.kind === 'right' ? 1 : -1) * viewW * 0.235, y: 0 };
  }
  private maskFor(t: Target) {
    const wide = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight) > 1.05;
    // the star field sits behind long reading sections: keep it quiet there
    if (t.form === 'stars' && t.kind === 'center') return { side: 0, edge: 0, soft: 0.1, k: 0, dim: 0.45 };
    if (!wide) return { side: 0, edge: 0, soft: 0.1, k: 0, dim: t.kind === 'hero' || t.form === 'name' ? 0 : 0.5 };
    if (t.kind === 'right') return { side: -1, edge: 0.04, soft: 0.13, k: 0.9, dim: 0 };
    if (t.kind === 'left') return { side: 1, edge: -0.04, soft: 0.13, k: 0.9, dim: 0 };
    return { side: 0, edge: 0, soft: 0.1, k: 0, dim: 0 };
  }

  /* ---------- morph queue ---------- */
  /** Show a form. Interrupts are queued so a morph is never cut mid-flight (no popping). */
  go(t: Target, opts: { duration?: number; instant?: boolean } = {}) {
    const id = FORM[t.form];
    const instant = opts.instant || this.reduced;
    if (this.held) { this.queued = t; return; }
    if (this.morphing && !instant) {
      this.queued = t;
      return;
    }
    this.curTarget = t;
    this.applyLayout(t, instant ? 0 : 1.4);
    if (id === this.cur && !this.morphing) return;
    void this.whenReady(id).then(() => {
      if (instant) {
        this.tw?.kill();
        this.morphing = false;
        this.cur = id;
        this.bind(id, id);
        this.mat.uniforms.uProgress.value = 1;
        this.dirty = true;
        return;
      }
      this.morphing = true;
      this.bind(this.cur, id);
      const u = this.mat.uniforms.uProgress;
      u.value = 0;
      this.tw = gsap.to(u, {
        value: 1,
        duration: opts.duration ?? 1.5,
        ease: 'none',
        onComplete: () => {
          this.cur = id;
          this.morphing = false;
          this.bind(id, id);
          const q = this.queued;
          this.queued = null;
          if (q) this.go(q);
        },
      });
    });
  }

  private applyLayout(t: Target, dur: number) {
    const L = this.layoutFor(t), m = this.maskFor(t);
    gsap.to(this.layout, { s: L.s, x: L.x, y: L.y, duration: dur, ease: 'power3.inOut', overwrite: true, onUpdate: () => { this.dirty = true; } });
    gsap.to(this.mask, { side: m.side, edge: m.edge, soft: m.soft, k: m.k, duration: dur * 0.8, ease: 'power2.inOut', overwrite: true });
    gsap.to(this.dim, { v: m.dim, duration: dur * 0.8, ease: 'power2.inOut', overwrite: true });
  }

  /** current target form was resolved by DOM; used by the router to know where we are */
  get target(): Target { return this.curTarget; }

  /* ---------- scalar controls ---------- */
  setScroll(v: number) { this.mat.uniforms.uScroll.value = v; this.dirty = true; }
  setSection(v: number) { this.mat.uniforms.uSection.value = v; this.dirty = true; }
  setMic(level: number | null) {
    this.mat.uniforms.uMicOn.value = level === null ? 0 : 1;
    this.micLevel = level ?? 0;
  }
  setBeatFast(v: boolean) { this.beatFast = v; }

  /** cinematic dolly through the cloud. dir 1 pushes in, -1 pulls back. */
  dolly(dir: 1 | -1): gsap.core.Timeline {
    const z = this.dollyZ;
    const tl = gsap.timeline();
    if (this.reduced) return tl;
    tl.to(z, { z: dir > 0 ? 2.4 : 12.5, duration: 0.7, ease: 'power2.in' }).to(z, { z: CAM_Z, duration: 0.95, ease: 'power3.out' });
    return tl;
  }

  /** the opening: points are noise, then condense into the name. returns the timeline (so it can be skipped). */
  intro(target: Target): gsap.core.Timeline {
    const U = this.mat.uniforms;
    const tl = gsap.timeline();
    const id = FORM[target.form];
    this.held = false;
    const q0 = this.queued;
    this.queued = q0 && q0.form === target.form ? null : q0;
    this.curTarget = target;
    const L = this.layoutFor(this.curTarget);
    Object.assign(this.layout, L);
    Object.assign(this.mask, { side: 0, edge: 0, soft: 0.1, k: 0 });
    this.dim.v = 0;
    this.dirty = true;
    if (this.reduced) {
      U.uChaos.value = 0; U.uIntro.value = 1;
      this.cur = id; this.bind(id, id); U.uProgress.value = 1;
      const q = this.queued; this.queued = null; if (q) this.go(q);
      return tl;
    }
    this.bind(FORM.stars, id);
    U.uProgress.value = 0;
    this.morphing = true;
    tl.to(U.uIntro, { value: 1, duration: 0.7, ease: 'power1.out' }, 0)
      .to(U.uProgress, { value: 1, duration: 1.7, ease: 'none' }, 0.5)
      .to(U.uChaos, { value: 0, duration: 1.5, ease: 'power2.inOut' }, 0.5)
      .add(() => {
        this.morphing = false;
        this.cur = id;
        this.bind(id, id);
        U.uProgress.value = 1;
        const q = this.queued;
        this.queued = null;
        if (q) this.go(q);
      });
    this.tw = null;
    return tl;
  }

  setTheme(t: 'night' | 'day') {
    this.theme = t;
    const p = PALETTE[t], U = this.mat.uniforms;
    U.uC0.value.set(p.c0); U.uC1.value.set(p.c1); U.uC2.value.set(p.c2); U.uNeutral.value.set(p.neutral);
    U.uAlphaMul.value = p.alpha;
    U.uSize.value = p.size;
    this.mat.blending = t === 'night' ? AdditiveBlending : NormalBlending;
    this.mat.needsUpdate = true;
    this.dirty = true;
  }

  /* ---------- pointer ---------- */
  private onPointer(e: PointerEvent) {
    const w = window.innerWidth, h = window.innerHeight;
    const nx = (e.clientX / w) * 2 - 1, ny = -((e.clientY / h) * 2 - 1);
    const halfH = Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    this.ptrTarget.x = nx * halfH * (w / h);
    this.ptrTarget.y = ny * halfH;
    this.ptr.nx = nx; this.ptr.ny = ny;
    this.lastMove = performance.now();
    this.dirty = true;
  }

  /** screen position (css px) of award star i, for labels */
  projectStar(i: number, out: { x: number; y: number }) {
    const p = AWARD_STARS[i];
    const v = new Vector3(p[0] * this.layout.s + this.layout.x, p[1] * this.layout.s + this.layout.y, p[2] * this.layout.s);
    this.camera.updateMatrixWorld();
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.canvas.clientWidth;
    out.y = (-v.y * 0.5 + 0.5) * this.canvas.clientHeight;
  }

  /* ---------- sizing + loop ---------- */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.mat.uniforms.uPR.value = this.dpr;
    // keep the layout valid for the new aspect
    const L = this.layoutFor(this.curTarget), m = this.maskFor(this.curTarget);
    Object.assign(this.layout, L);
    Object.assign(this.mask, { side: m.side, edge: m.edge, soft: m.soft, k: m.k });
    this.dim.v = m.dim;
    this.dirty = true;
  }

  private adapt(dt: number) {
    if (!this.adaptive) return;
    this.ft.push(dt);
    if (this.ft.length < 40) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length;
    this.ft.length = 0;
    if (avg > 20) {
      if (this.dpr > 1.01) {
        this.dpr = Math.max(1, this.dpr - 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.mat.uniforms.uPR.value = this.dpr;
      } else if (this.lowDraw > 0.5) {
        this.lowDraw -= 0.15;
        this.geo.setDrawRange(0, Math.floor(this.N * this.lowDraw));
      }
    }
  }

  /** called from the shared GSAP ticker */
  tick(dtMs: number) {
    if (!this.ready || !this.visible || !this.onScreen) return;
    const U = this.mat.uniforms;
    const dt = Math.min(dtMs, 50) / 1000;
    if (this.reduced) {
      if (!this.dirty) return;
      this.dirty = false;
      U.uTime.value = this.time;
    } else {
      this.time += dt;
      U.uTime.value = this.time;
      this.adapt(dtMs);
      // pointer smoothing
      const active = performance.now() - this.lastMove < 1400 ? 1 : 0;
      this.ptrTarget.a = active;
      const k = 1 - Math.pow(0.0015, dt);
      this.ptr.x += (this.ptrTarget.x - this.ptr.x) * k;
      this.ptr.y += (this.ptrTarget.y - this.ptr.y) * k;
      this.ptr.a += (this.ptrTarget.a - this.ptr.a) * (1 - Math.pow(0.02, dt));
      // camera: dolly + a little parallax from the pointer
      const cz = this.dollyZ.z;
      this.camera.position.set(this.ptr.nx * 0.28, this.ptr.ny * 0.16, cz);
      this.camera.lookAt(0, 0, 0);
      // beat phase accumulates so hover changes the rate without a jump
      const target = this.beatFast ? 1.7 : 0.55;
      this.beatRate += (target - this.beatRate) * (1 - Math.pow(0.05, dt));
      this.beat += dt * this.beatRate;
      U.uBeat.value = this.beat;
    }
    (U.uPointer.value as Vector4).set(this.ptr.x, this.ptr.y, this.reduced ? 0 : this.ptr.a, 1.15);
    U.uRipple.value = this.reduced ? 0 : this.ptr.a;
    (U.uTextMask.value as Vector4).set(this.mask.side, this.mask.edge, this.mask.soft, this.mask.k);
    U.uDim.value = this.dim.v;
    (U.uLayout.value as Vector3).set(this.layout.s, this.layout.x, this.layout.y);
    U.uMic.value += (this.micLevel - U.uMic.value) * 0.35;
    this.renderer.render(this.scene, this.camera);
  }
}
