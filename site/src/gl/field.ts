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
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import gsap from 'gsap';
import vert from './shaders/vert.glsl?raw';
import frag from './shaders/frag.glsl?raw';
import sceneryVert from './shaders/scenery.vert.glsl?raw';
import { AWARD_STARS, FACE_BOX, FORM, FORM_COUNT, STRIDE, faceGeo, genSeeds, genWordmark, mulberry32, buildShapes, sampleText, type FormName } from './shapes';
import { CAM_Z, buildScenery, placeStations, type Kind, type Station } from './rail';

export type { Kind, Station };
interface Layout { s: number; x: number; y: number }
/** what the face tracker is reporting right now, and where its detection box is on screen (css px) */
export interface FaceHud { yaw: number; pitch: number; gx: number; gy: number; conf: number; fps: number; x0: number; y0: number; x1: number; y1: number; kind: Kind }
interface Mask { side: number; edge: number; soft: number; k: number; dim: number; band: number }
/** a station resolved for the current viewport */
interface Stop { form: number; name: FormName; kind: Kind; w: Vector3; cam: Vector3; lay: Layout; mask: Mask; lateral: boolean }

const FOV = 38;
const SIZE: Record<FormName, readonly [number, number]> = {
  stars: [8, 4.6], name: [6, 2.5], face: [5.2, 4.0], candles: [6.4, 4.4], voice: [4.6, 4.2], pipeline: [7.2, 3.5], docs: [5.6, 4.3], pulse: [3.4, 3.4],
};

const PALETTE = {
  night: { c0: '#5B5BD6', c1: '#2BB3A3', c2: '#F2A541', neutral: '#7F8A97', alpha: 1, size: 2.3 },
  day: { c0: '#3A3AA8', c1: '#0E7F73', c2: '#C26F08', neutral: '#6F685C', alpha: 1.35, size: 2.0 },
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
  // ?n=12000 forces a point count, for checking how a form reads on a small budget
  const q = /[?&]n=(\d+)/.exec(location.search);
  if (q) n = Math.max(2000, Math.min(60000, Number(q[1])));
  return n;
}

export class PointField {
  readonly canvas: HTMLCanvasElement;
  readonly N: number;
  reduced: boolean;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  private geo = new BufferGeometry();
  private mat: ShaderMaterial;
  private points: Points;
  private sceneryGeo = new BufferGeometry();
  private sceneryMat: ShaderMaterial;
  private scenery: Points;
  private pos: (InterleavedBufferAttribute | null)[] = new Array(FORM_COUNT).fill(null);
  private ext: (InterleavedBufferAttribute | null)[] = new Array(FORM_COUNT).fill(null);
  private ready = false;
  private font = 'sans-serif';

  // the route: stations of the current page and where we are between them
  private stations: Station[] = [];
  private stops: Stop[] = [];
  private u = 0; // damped position along the route (station index + progress)
  private uT = 0; // where scroll says we should be
  private boundA = -1;
  private boundB = -1;
  private look = new Vector3();
  private camPos = new Vector3(0, 0, CAM_Z);

  // runtime
  private time = 3 + Math.random() * 40;
  private dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  private ft: number[] = [];
  private lowDraw = 1;
  private visible = true;
  private dirty = true;
  private sizeW = 0;
  private sizeH = 0;
  private ptrTarget = { x: 0, y: 0, a: 0 };
  private ptr = { x: 0, y: 0, a: 0 };
  private lastMove = 0;
  private dollyZ = { z: 0 };
  private chaos = { v: 1 };
  private beat = 0;
  private beatRate = 0.55;
  beatFast = false;
  private micLevel = 0;
  private velRaw = 0;
  private vel = 0;
  private vol = 0;
  private gazeOn = 0;
  private fps = 60;
  // the face: where the head and eyes are, blinks, saccades and what the tracker reports
  private fs = {
    aimX: 0, aimY: 0, hx: 0.5, hy: 0.12, ex: 0.5, ey: 0.12, sx: 0, sy: 0, stx: 0, sty: 0, sacAt: 0,
    blink: 0, blinkT: -1, blinkAt: 2.4, yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, conf: 0.98, flash: 0, drop: 0,
  };
  private adaptive = !/[?&]noadapt/.test(location.search);
  private tmp = new Vector3();
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
      if (/swiftshader|llvmpipe|software/i.test(name) && !/[?&](noadapt|n=)/.test(location.search)) {
        n = Math.min(n, 9000);
        this.dpr = 1;
      }
    } catch { /* keep the default */ }
    this.N = n;
    this.renderer.setClearColor(0x000000, 0);
    const shared = {
      uDay: { value: 0 },
      uTime: { value: 0 }, uPR: { value: this.dpr }, uSize: { value: 2.3 }, uIntro: { value: 0 }, uAlphaMul: { value: 1 },
      uC0: { value: new Color() }, uC1: { value: new Color() }, uC2: { value: new Color() }, uNeutral: { value: new Color() },
      // narrow screens: the rows (ndc y: top, bottom) that copy occupies right now, and how hard points fade inside them
      uBands: { value: [new Vector2(-9, -9), new Vector2(-9, -9), new Vector2(-9, -9)] }, uBandK: { value: 0 },
    };
    const fg = faceGeo();
    this.mat = new ShaderMaterial({
      vertexShader: vert,
      defines: {
        EYE_X: fg.eye.x.toFixed(4), EYE_Y: fg.eye.y.toFixed(4), EYE_Z: fg.eye.z.toFixed(4), EYE_A: fg.eye.a.toFixed(4), EYE_B: fg.eye.b.toFixed(4),
        BRIDGE_Y: fg.bridge.y.toFixed(4), BRIDGE_Z: fg.bridge.z.toFixed(4), BOX_Z: FACE_BOX.z.toFixed(4),
      },
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        ...shared,
        uProgress: { value: 0 }, uScroll: { value: 0 }, uSection: { value: 0 }, uChaos: { value: 1 }, uBeat: { value: 0 },
        uMic: { value: 0 }, uMicOn: { value: 0 }, uRipple: { value: 0 }, uDim: { value: 0 },
        uFormA: { value: 0 }, uFormB: { value: 0 }, uTurb: { value: 1 }, uDrift: { value: reduced ? 0 : 1 },
        uLayoutA: { value: new Vector3(1, 0, 0) }, uLayoutB: { value: new Vector3(1, 0, 0) },
        uStationA: { value: new Vector3() }, uStationB: { value: new Vector3() }, uFocus: { value: new Vector3() },
        uPointer: { value: new Vector4(0, 0, 0, 1.15) },
        // fewer points are drawn a little larger, so a small budget still reads
        uDens: { value: Math.min(1.5, Math.pow(40000 / this.N, 0.33)) }, uRepel: { value: 1 },
        uGaze: { value: new Vector3() }, uHead: { value: new Vector3() }, uFace: { value: new Vector4(0, 0, 0, 9) }, uEye: { value: new Vector2() }, uVol: { value: 0 }, uEnergy: { value: 0 }, uBeatAmt: { value: 0 },
        uTextMask: { value: new Vector4(0, 0, 0.12, 0) },
      },
    });
    this.sceneryMat = new ShaderMaterial({
      vertexShader: sceneryVert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...shared, uSceneDim: { value: 1 } },
    });

    const N = this.N;
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    this.geo.setAttribute('aSeed', new BufferAttribute(genSeeds(N), 4));
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.sceneryGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    this.sceneryGeo.setAttribute('aS', new BufferAttribute(new Float32Array(3), 3));
    this.scenery = new Points(this.sceneryGeo, this.sceneryMat);
    this.scenery.frustumCulled = false;
    this.scene.add(this.scenery, this.points);
    this.camera.position.set(0, 0, CAM_Z);
    this.setTheme('night');
    this.resize();

    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(() => this.resize(), 120); }, { passive: true });
    window.addEventListener('pointermove', (e) => this.onPointer(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.onPointer(e), { passive: true });
    document.addEventListener('visibilitychange', () => { this.visible = !document.hidden; });
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => { this.sizeW = 0; this.resize(); });
  }

  /* ---------- shapes ---------- */
  private install(form: number, data: Float32Array) {
    const buf = new InterleavedBuffer(data, STRIDE);
    this.pos[form] = new InterleavedBufferAttribute(buf, 4, 0);
    this.ext[form] = new InterleavedBufferAttribute(buf, 4, 4);
  }

  /** Generate every procedural form (worker if available) and the wordmark. */
  async build(fontFamily: string): Promise<void> {
    const N = this.N;
    this.font = fontFamily;
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
    } catch { /* no 2d canvas: bind() falls back to the star field so the page still works */ }
    await rest;
    this.ready = true;
    this.boundA = this.boundB = -1;
    this.rebuildScenery();
    this.dirty = true;
  }

  private bind(a: number, b: number) {
    if (a === this.boundA && b === this.boundB) return;
    this.boundA = a; this.boundB = b;
    const s = FORM.stars;
    this.geo.setAttribute('aA', (this.pos[a] ?? this.pos[s])!);
    this.geo.setAttribute('aA2', (this.ext[a] ?? this.ext[s])!);
    this.geo.setAttribute('aB', (this.pos[b] ?? this.pos[s])!);
    this.geo.setAttribute('aB2', (this.ext[b] ?? this.ext[s])!);
    this.mat.uniforms.uFormA.value = this.pos[a] ? a : s;
    this.mat.uniforms.uFormB.value = this.pos[b] ? b : s;
  }

  /* ---------- layout of a form inside its station ---------- */
  private get aspect() { return (this.sizeW || window.innerWidth) / Math.max(1, this.sizeH || window.innerHeight); }
  /** side-by-side layout (form beside the copy). Matches the CSS breakpoint, so a small landscape window stacks too. */
  private get wide() { return this.aspect > 1.05 && (this.sizeW || window.innerWidth) >= 900; }
  /** stacked layout: the form sits in the space above its copy and is masked by the copy's position */
  get narrow() { return !this.wide; }
  /** viewport rows (css px, top/bottom pairs, at most three) that copy covers right now. Only used on narrow screens. */
  setBands(px: number[]) {
    const B = this.mat.uniforms.uBands.value as Vector2[];
    const h = Math.max(1, this.sizeH);
    for (let i = 0; i < 3; i++) {
      const has = i * 2 + 1 < px.length;
      const top = has ? 1 - (2 * px[i * 2]) / h : -9, bot = has ? 1 - (2 * px[i * 2 + 1]) / h : -9;
      if (Math.abs(B[i].x - top) > 1e-4 || Math.abs(B[i].y - bot) > 1e-4) { B[i].set(top, bot); this.dirty = true; }
    }
  }
  private layoutFor(form: FormName, kind: Kind): Layout {
    const aspect = this.aspect;
    const viewH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    const viewW = viewH * aspect;
    const cw = this.sizeW || window.innerWidth;
    if (form === 'stars') {
      const s = Math.min(1.15, Math.max(0.45, viewW / 9.5));
      return kind === 'hero' && this.wide ? { s: s * 0.9, x: 0, y: -viewH * 0.1 } : { s, x: 0, y: 0 };
    }
    const [w, h] = SIZE[form];
    const wide = this.wide;
    if (form === 'name') {
      const s = wide ? Math.min((viewW * 0.72) / w, (viewH * 0.55) / h) : (viewW * 0.9) / w;
      const padPx = Math.min(64, Math.max(20, cw * 0.04));
      const left = -viewW / 2 + (padPx / cw) * viewW;
      return { s, x: left + (w * s) / 2, y: wide ? viewH * 0.12 : viewH * 0.17 };
    }
    if (!wide) {
      // stacked: the form lives in the upper part of the screen, in the space the section keeps free above its copy
      const s = Math.min((viewW * 0.95) / w, (viewH * (kind === 'hero' ? 0.36 : 0.32)) / h);
      return { s, x: 0, y: kind === 'hero' ? viewH * 0.17 : viewH * 0.185 };
    }
    if (kind === 'hero') {
      const s = Math.min((viewW * 0.78) / w, (viewH * 0.6) / h);
      return { s, x: viewW * 0.03, y: viewH * 0.1 };
    }
    if (kind === 'center') {
      const s = Math.min((viewW * 0.7) / w, (viewH * 0.74) / h);
      return { s, x: 0, y: 0 };
    }
    // ultrawide: keep the form beside the text column instead of drifting to the far edge
    const s = Math.min((viewW * 0.46) / w, (viewH * 0.74) / h);
    const off = Math.min(viewW * 0.235, viewH * 0.62);
    return { s, x: (kind === 'right' ? 1 : -1) * off, y: 0 };
  }
  private maskFor(form: FormName, kind: Kind): Mask {
    const wide = this.wide;
    // on narrow screens points fade out wherever a block of copy is (uBands), so no line ever crosses text
    const band = wide ? 0 : form === 'stars' ? 0.55 : 0.95;
    // the star field sits behind long reading sections: keep it quiet there
    if (form === 'stars' && kind === 'center') return { side: 0, edge: 0, soft: 0.1, k: 0, dim: 0.45, band };
    if (!wide) return { side: 0, edge: 0, soft: 0.1, k: 0, dim: 0, band };
    if (kind === 'right') return { side: -1, edge: 0.04, soft: 0.13, k: 0.9, dim: 0, band };
    if (kind === 'left') return { side: 1, edge: -0.04, soft: 0.13, k: 0.9, dim: 0, band };
    return { side: 0, edge: 0, soft: 0.1, k: 0, dim: 0, band };
  }

  /* ---------- the route ---------- */
  /** Define the stations of the current page (one per section that owns a form). */
  setScore(stations: Station[]) {
    this.stations = stations.length ? stations : [{ form: 'stars', kind: 'center' }];
    this.layoutStops();
    this.u = this.uT = Math.min(this.uT, this.stops.length - 1);
    this.rebuildScenery();
    this.dirty = true;
  }
  private layoutStops() {
    const places = placeStations(this.stations);
    this.stops = this.stations.map((st, i) => {
      const w = new Vector3(...places[i].w);
      return {
        form: FORM[st.form], name: st.form, kind: st.kind, w, cam: new Vector3(w.x, w.y, w.z + CAM_Z),
        lay: this.layoutFor(st.form, st.kind), mask: this.maskFor(st.form, st.kind), lateral: places[i].lateral,
      };
    });
  }
  private rebuildScenery() {
    if (!this.ready || !this.stops.length) return;
    const mobile = this.N <= 12000;
    const sc = buildScenery({
      stations: this.stations,
      places: this.stops.map((s) => ({ w: [s.w.x, s.w.y, s.w.z], lateral: s.lateral })),
      // under a page hero the copy sits bottom-left, so the year goes to the right of it
      formX: this.stops.map((s) => (s.kind === 'hero' ? 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360) * this.aspect * 0.3 : s.lay.x)),
      dust: mobile ? 900 : 2600,
      wide: this.wide,
      label: (t) => sampleText(t, this.font),
    });
    this.sceneryGeo.dispose();
    this.sceneryGeo = new BufferGeometry();
    this.sceneryGeo.setAttribute('position', new BufferAttribute(sc.pos, 3));
    this.sceneryGeo.setAttribute('aS', new BufferAttribute(sc.ext, 3));
    this.scenery.geometry = this.sceneryGeo;
  }
  /** Position along the route: station index plus progress to the next one. Driven by scroll. */
  setPos(u: number, immediate = false) {
    this.uT = Math.max(0, Math.min(this.stops.length - 1, u));
    if (immediate || this.reduced) this.u = this.reduced ? Math.round(this.uT) : this.uT;
    this.dirty = true;
  }
  /** the station we are resting at, or null while travelling */
  get resting(): { form: FormName; kind: Kind } | null {
    const i = Math.round(this.u);
    const s = this.stops[i];
    return s && Math.abs(this.u - i) < 0.03 && this.chaos.v < 0.05 ? { form: s.name, kind: s.kind } : null;
  }

  /* ---------- scalar controls ---------- */
  setScroll(v: number) { this.mat.uniforms.uScroll.value = v; this.dirty = true; }
  setSection(v: number) { this.mat.uniforms.uSection.value = v; this.dirty = true; }
  setMic(level: number | null) {
    this.mat.uniforms.uMicOn.value = level === null ? 0 : 1;
    this.micLevel = level ?? 0;
  }
  setBeatFast(v: boolean) { this.beatFast = v; }
  /** scroll speed (Lenis velocity, px per frame): feeds the voice ring, the candles and the lens */
  setVelocity(v: number) { this.velRaw = Math.min(160, Math.abs(v)); }

  /** the opening: the points are noise, then condense into whatever the page starts on. Skippable timeline. */
  intro(): gsap.core.Timeline {
    const U = this.mat.uniforms;
    const tl = gsap.timeline();
    this.dirty = true;
    if (this.reduced) {
      this.chaos.v = 0; U.uIntro.value = 1;
      return tl;
    }
    this.chaos.v = 1;
    tl.to(U.uIntro, { value: 1, duration: 0.45, ease: 'power1.out' }, 0)
      .to(this.chaos, { v: 0, duration: 1.45, ease: 'power2.inOut' }, 0.3);
    return tl;
  }

  /** page change, first half: the form dissolves into the noise cloud while the camera pushes through it */
  dissolve(dir: 1 | -1): Promise<void> {
    if (this.reduced) return Promise.resolve();
    gsap.killTweensOf(this.chaos);
    gsap.killTweensOf(this.dollyZ);
    const tl = gsap.timeline();
    tl.to(this.chaos, { v: 1, duration: 0.6, ease: 'power2.in' }, 0)
      .to(this.dollyZ, { z: dir > 0 ? -4.6 : 4, duration: 0.6, ease: 'power2.in' }, 0);
    return tl.then().then(() => undefined);
  }
  /** page change, second half: the cloud condenses into the new page's first form */
  resolve(dir: 1 | -1) {
    if (this.reduced) { this.chaos.v = 0; this.dirty = true; return; }
    gsap.killTweensOf(this.chaos);
    gsap.killTweensOf(this.dollyZ);
    this.chaos.v = 1;
    this.dollyZ.z = dir > 0 ? 4 : -4.6;
    gsap.to(this.chaos, { v: 0, duration: 1.15, ease: 'power2.out' });
    gsap.to(this.dollyZ, { z: 0, duration: 1.15, ease: 'power3.out' });
  }

  setTheme(t: 'night' | 'day') {
    this.theme = t;
    const p = PALETTE[t], U = this.mat.uniforms;
    U.uC0.value.set(p.c0); U.uC1.value.set(p.c1); U.uC2.value.set(p.c2); U.uNeutral.value.set(p.neutral);
    U.uAlphaMul.value = p.alpha;
    U.uDay.value = t === 'day' ? 1 : 0;
    U.uSize.value = p.size;
    for (const m of [this.mat, this.sceneryMat]) {
      m.blending = t === 'night' ? AdditiveBlending : NormalBlending;
      m.needsUpdate = true;
    }
    this.dirty = true;
  }

  /* ---------- pointer ---------- */
  private onPointer(e: PointerEvent) {
    this.ptrTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.ptrTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
    this.lastMove = performance.now();
    this.dirty = true;
  }

  /** screen position (css px) of award star i, for labels. Only meaningful while resting on the star station. */
  projectStar(i: number, out: { x: number; y: number }) {
    const s = this.stops[Math.round(this.u)];
    if (!s) return;
    const p = AWARD_STARS[i];
    const v = this.tmp.set(p[0] * s.lay.s + s.lay.x + s.w.x, p[1] * s.lay.s + s.lay.y + s.w.y, p[2] * s.lay.s + s.w.z);
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.sizeW;
    out.y = (-v.y * 0.5 + 0.5) * this.sizeH;
  }

  /* ---------- sizing + loop ---------- */
  resize() {
    // the canvas is sized in CSS to the large viewport, so a phone's address bar sliding away is not a resize
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    if (w === this.sizeW && h === this.sizeH) return;
    const wasWide = this.wide;
    this.sizeW = w; this.sizeH = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.mat.uniforms.uPR.value = this.dpr;
    // keep every station's layout valid for the new aspect
    for (const s of this.stops) { s.lay = this.layoutFor(s.name, s.kind); s.mask = this.maskFor(s.name, s.kind); }
    if (wasWide !== this.wide) this.rebuildScenery();
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
        this.renderer.setSize(this.sizeW, this.sizeH, false);
        this.mat.uniforms.uPR.value = this.dpr;
      } else if (this.lowDraw > 0.5) {
        this.lowDraw -= 0.15;
        this.geo.setDrawRange(0, Math.floor(this.N * this.lowDraw));
      }
    }
  }

  /** where the camera is and what it looks at, for the current position on the route */
  private fly(dt: number) {
    const n = this.stops.length;
    const seg = Math.max(0, Math.min(n - 2, Math.floor(this.u)));
    const A = this.stops[seg], B = this.stops[Math.min(n - 1, seg + 1)];
    const t = n > 1 ? Math.max(0, Math.min(1, this.u - seg)) : 0;
    const same = A.form === B.form;
    const U = this.mat.uniforms;

    this.bind(A.form, B.form);
    U.uProgress.value = t;
    U.uTurb.value = same ? 0.15 : 1;
    (U.uLayoutA.value as Vector3).set(A.lay.s, A.lay.x, A.lay.y);
    (U.uLayoutB.value as Vector3).set(B.lay.s, B.lay.x, B.lay.y);
    (U.uStationA.value as Vector3).copy(A.w);
    (U.uStationB.value as Vector3).copy(B.w);
    const m = smooth(t);
    (U.uTextMask.value as Vector4).set(lerp(A.mask.side, B.mask.side, m), lerp(A.mask.edge, B.mask.edge, m), lerp(A.mask.soft, B.mask.soft, m), lerp(A.mask.k, B.mask.k, m));
    U.uDim.value = lerp(A.mask.dim, B.mask.dim, m);
    U.uBandK.value = lerp(A.mask.band, B.mask.band, m);
    // the face is a measured mesh: the pointer steers its gaze instead of pushing its points around
    U.uRepel.value = lerp(A.name === 'face' ? 0.08 : 1, B.name === 'face' ? 0.08 : 1, m);

    // camera: ease between the two rest poses, bowing off the straight line so the route reads as a curve
    const e = smoother(t), arc = Math.sin(Math.PI * e);
    this.camPos.lerpVectors(A.cam, B.cam, e);
    let roll = 0;
    if (!same && !this.reduced) {
      if (B.lateral) { this.camPos.z -= arc * 2.4; this.camPos.y += arc * 0.5; }
      else { const side = seg % 2 ? 1 : -1; this.camPos.x += arc * 1.5 * side; this.camPos.y += arc * 0.7; roll = arc * 0.07 * side; }
    }
    this.look.lerpVectors(A.w, B.w, smoother(Math.min(1, t * 1.2)));
    (U.uFocus.value as Vector3).copy(this.look);

    // the face looks at the cursor while it is moving, and wanders on its own otherwise
    const F = t < 0.5 ? A : B;
    if (F.name === 'face') {
      const halfH = Math.tan((FOV * Math.PI) / 360) * CAM_Z, halfW = halfH * this.aspect;
      this.fs.aimX = Math.max(-1, Math.min(1, (this.ptr.x - F.lay.x / halfW) * 1.25));
      this.fs.aimY = Math.max(-1, Math.min(1, (this.ptr.y - F.lay.y / halfH) * 1.25));
      this.faceTick(dt);
    }

    const k = this.reduced ? 1 : 1 - Math.pow(0.0015, dt);
    this.ptr.x += (this.ptrTarget.x - this.ptr.x) * k;
    this.ptr.y += (this.ptrTarget.y - this.ptr.y) * k;
    const par = this.reduced ? 0 : 1;
    this.camera.position.set(this.camPos.x + this.ptr.x * 0.28 * par, this.camPos.y + this.ptr.y * 0.16 * par, this.camPos.z + this.dollyZ.z);
    this.camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
  }

  /** the life in the face: head follows the gaze target, eyes get there first, blinks and saccades come at irregular intervals */
  private faceTick(dt: number) {
    const f = this.fs, t = this.time, U = this.mat.uniforms;
    let breath = 0, scan = 9;
    if (this.reduced) {
      // a still pose: looking a little to the side, eyes open, rays drawn
      f.hx = f.ex = 0.5; f.hy = f.ey = 0.12; f.sx = f.sy = f.blink = 0;
    } else {
      this.gazeOn += (this.ptrTarget.a - this.gazeOn) * (1 - Math.pow(0.02, dt));
      const tx = lerp(0.62 * Math.sin(t * 0.33) + 0.14 * Math.sin(t * 0.9), f.aimX, this.gazeOn);
      const ty = lerp(0.4 * Math.sin(t * 0.47 + 1), f.aimY, this.gazeOn);
      f.ex += (tx - f.ex) * (1 - Math.exp(-dt * 11));
      f.ey += (ty - f.ey) * (1 - Math.exp(-dt * 11));
      f.hx += (tx - f.hx) * (1 - Math.exp(-dt * 3.2));
      f.hy += (ty - f.hy) * (1 - Math.exp(-dt * 3.2));
      // saccades: small quick jumps of the eyes, larger when nothing is steering them
      if (t > f.sacAt) {
        const amp = this.gazeOn < 0.5 ? 1 : 0.2;
        f.stx = (Math.random() - 0.5) * 0.36 * amp; f.sty = (Math.random() - 0.5) * 0.2 * amp;
        f.sacAt = t + 0.35 + Math.random() * 1.9;
      }
      const ks = 1 - Math.exp(-dt * 32);
      f.sx += (f.stx - f.sx) * ks; f.sy += (f.sty - f.sy) * ks;
      // blinks: 2 to 6 seconds apart, now and then a double
      if (f.blinkT < 0 && t > f.blinkAt) f.blinkT = 0;
      if (f.blinkT >= 0) {
        f.blinkT += dt;
        const x = f.blinkT / 0.18;
        f.blink = x < 0.36 ? smooth(x / 0.36) : x < 1 ? 1 - smooth((x - 0.36) / 0.64) : 0;
        if (x >= 1) { f.blinkT = -1; f.blinkAt = t + (Math.random() < 0.18 ? 0.2 : 1.8 + Math.random() * 4.4); }
      }
      breath = Math.sin(t * 1.25);
      const ph = (t % 5.6) / 5.6;
      if (ph < 0.42) scan = 1.3 - (ph / 0.42) * 2.6;
      f.flash *= Math.exp(-dt * 1.5);
      f.drop *= Math.exp(-dt * 0.9);
    }
    f.gx = Math.max(-1.1, Math.min(1.1, f.ex + f.sx)); f.gy = Math.max(-1.1, Math.min(1.1, f.ey + f.sy));
    // the head turns at most about 25 degrees (including the fixed quarter turn in the shader); the eyes do the rest
    f.yaw = Math.max(-0.3, Math.min(0.3, f.hx * 0.3));
    f.pitch = Math.max(-0.22, Math.min(0.22, -f.hy * 0.22)) + breath * 0.008;
    f.roll = -f.yaw * 0.12 + (this.reduced ? 0 : 0.012 * Math.sin(t * 0.4));
    const away = Math.max(0, Math.min(1, (Math.hypot(f.gx, f.gy) - 0.15) / 0.3));
    (U.uGaze.value as Vector3).set(f.gx, f.gy, smooth(away));
    (U.uHead.value as Vector3).set(f.yaw, f.pitch, f.roll);
    (U.uFace.value as Vector4).set(f.blink, breath, Math.min(1, f.flash), scan);
    (U.uEye.value as Vector2).set(
      Math.max(-0.062, Math.min(0.062, (f.gx - f.hx) * 0.1 + f.gx * 0.034)),
      Math.max(-0.028, Math.min(0.028, (f.gy - f.hy) * 0.05 + f.gy * 0.018)),
    );
    const turned = Math.min(1, Math.abs(f.yaw + 0.12) / 0.42);
    const target = 0.985 - 0.09 * turned * turned - 0.2 * f.blink - f.drop;
    f.conf += (target - f.conf) * (this.reduced ? 1 : 1 - Math.exp(-dt * 7));
  }
  /** the tracker loses the face for a moment: the mesh flashes amber and its confidence drops, then recovers */
  lookAway() { this.fs.flash = 1.4; this.fs.drop = 0.55; this.dirty = true; }
  /** small devices get the mesh, irises and gaze rays only */
  get low() { return this.N <= 12000; }
  /** live values for the labels beside the face. False when they should not be shown. */
  faceHud(o: FaceHud): boolean {
    const at = this.resting, s = this.stops[Math.round(this.u)];
    if (!at || !s || at.form !== 'face' || this.low || this.narrow) return false;
    const f = this.fs, k = 1.65 * s.lay.s;
    const cx = Math.sin(f.yaw) * 0.4, cy = -Math.sin(f.pitch) * 0.4;
    const v = this.tmp.set((cx - FACE_BOX.x) * k + s.lay.x + s.w.x, (cy + FACE_BOX.y) * k + s.lay.y + s.w.y, FACE_BOX.z * k + s.w.z).project(this.camera);
    o.x0 = (v.x * 0.5 + 0.5) * this.sizeW; o.y0 = (-v.y * 0.5 + 0.5) * this.sizeH;
    v.set((cx + FACE_BOX.x) * k + s.lay.x + s.w.x, (cy - FACE_BOX.y) * k + s.lay.y + s.w.y, FACE_BOX.z * k + s.w.z).project(this.camera);
    o.x1 = (v.x * 0.5 + 0.5) * this.sizeW; o.y1 = (-v.y * 0.5 + 0.5) * this.sizeH;
    o.yaw = ((f.yaw + 0.12) * 180) / Math.PI; o.pitch = (-f.pitch * 180) / Math.PI;
    o.gx = f.gx; o.gy = f.gy; o.conf = f.conf; o.fps = this.fps; o.kind = s.kind;
    return true;
  }

  /** called from the shared GSAP ticker */
  tick(dtMs: number) {
    if (!this.ready || !this.visible || !this.stops.length) return;
    const U = this.mat.uniforms;
    const dt = Math.min(dtMs, 50) / 1000;
    if (dtMs > 0) this.fps += (1000 / dtMs - this.fps) * 0.06;
    if (this.reduced) {
      if (!this.dirty) return;
      this.dirty = false;
      U.uTime.value = this.time;
    } else {
      this.time += dt;
      U.uTime.value = this.time;
      this.adapt(dtMs);
      // follow the scroll position with a little inertia, so fast scrolling streams through stations instead of snapping
      const d = this.uT - this.u;
      this.u = Math.abs(d) < 0.0004 ? this.uT : this.u + d * (1 - Math.exp(-dt * 6.5));
      this.ptrTarget.a = performance.now() - this.lastMove < 1400 ? 1 : 0;
      this.ptr.a += (this.ptrTarget.a - this.ptr.a) * (1 - Math.pow(0.02, dt));
      // beat phase accumulates so hover changes the rate without a jump
      const target = this.beatFast ? 1.7 : 0.55;
      this.beatRate += (target - this.beatRate) * (1 - Math.pow(0.05, dt));
      this.beat += dt * this.beatRate;
      U.uBeat.value = this.beat;
      U.uBeatAmt.value += ((this.beatFast ? 1 : 0) - U.uBeatAmt.value) * (1 - Math.pow(0.03, dt));
      // scroll energy: quick to rise, slow to settle
      this.vel += (this.velRaw - this.vel) * (1 - Math.pow(this.velRaw > this.vel ? 0.0001 : 0.08, dt));
      U.uEnergy.value = Math.min(1, this.vel / 55) + this.ptr.a * 0.12;
      const volT = Math.max(0, Math.min(1, (this.vel - 38) / 70));
      this.vol += (volT - this.vol) * (1 - Math.pow(volT > this.vol ? 0.001 : 0.25, dt));
      U.uVol.value = this.vol;
    }
    this.fly(dt);
    U.uChaos.value = this.chaos.v;
    const halfH = Math.tan((FOV * Math.PI) / 360);
    (U.uPointer.value as Vector4).set(this.ptr.x * halfH * this.aspect, this.ptr.y * halfH, this.reduced ? 0 : this.ptr.a, 1.15);
    U.uRipple.value = this.reduced ? 0 : this.ptr.a;
    U.uMic.value += (this.micLevel - U.uMic.value) * 0.35;
    this.renderer.render(this.scene, this.camera);
  }
}
