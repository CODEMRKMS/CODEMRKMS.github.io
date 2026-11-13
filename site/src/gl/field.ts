import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
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
import { AWARD_STARS, FORM, FORM_COUNT, STRIDE, faceGeo, genSeeds, genWordmark, mulberry32, buildShapes, sampleText, type FormName } from './shapes';
import { Post } from './post';
import { Quality } from './quality';
import { CAM_Z, buildScenery, placeStations, type Kind, type Station } from './rail';

export type { Kind, Station };
interface Layout { s: number; x: number; y: number }
/** what the face tracker is reporting right now, and where its detection box is on screen (css px) */
export interface FaceHud { yaw: number; pitch: number; gx: number; gy: number; conf: number; rate: number; infer: number; x0: number; y0: number; x1: number; y1: number; kind: Kind }
interface Mask { side: number; edge: number; soft: number; k: number; dim: number; band: number }
/** a station resolved for the current viewport */
interface Stop { form: number; name: FormName; kind: Kind; w: Vector3; cam: Vector3; lay: Layout; mask: Mask; lateral: boolean }

const FOV = 38;
const SIZE: Record<FormName, readonly [number, number]> = {
  stars: [8, 4.6], name: [6, 2.5], face: [5.2, 4.0], candles: [6.4, 4.4], voice: [4.6, 4.2], pipeline: [7.2, 3.5], docs: [5.6, 4.3], pulse: [3.4, 3.4],
};

// bg is written to the canvas as these exact bytes: #0C0E14 and #F3EFE6
const PALETTE = {
  night: { c0: '#5B5BD6', c1: '#2BB3A3', c2: '#F2A541', neutral: '#7F8A97', alpha: 1, size: 2.3, bg: [12, 14, 20] },
  day: { c0: '#3A3AA8', c1: '#0E7F73', c2: '#C26F08', neutral: '#6F685C', alpha: 1.35, size: 2.0, bg: [243, 239, 230] },
};
// the head turns about a point behind the face (matches PIV in vert.glsl)
const PIV_Y = -0.15, PIV_Z = -0.6;

/** the extra form slot a toy is installed into */
const TOY = FORM_COUNT;

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

export class PointField {
  readonly canvas: HTMLCanvasElement;
  readonly N: number;
  reduced: boolean;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  private geo = new BufferGeometry();
  private mat: ShaderMaterial;
  private bgMat: ShaderMaterial;
  private bg = new Vector3();
  private post = new Post();
  readonly quality: Quality;
  private ca = 0;
  private painted = false;
  private points: Points;
  private sceneryGeo = new BufferGeometry();
  private sceneryMat: ShaderMaterial;
  private scenery: Points;
  private pos: (InterleavedBufferAttribute | null)[] = new Array(FORM_COUNT + 1).fill(null);
  private ext: (InterleavedBufferAttribute | null)[] = new Array(FORM_COUNT + 1).fill(null);
  // a toy (the drone) borrows the points of the form on screen for a while
  private over = { on: false, k: 0, stop: -1, size: [6, 3.6] as readonly [number, number], shrink: 1 };
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
  private dpr = 1;
  private visible = true;
  private dirty = true;
  private sizeW = 0;
  private sizeH = 0;
  private ptrTarget = { x: 0, y: 0, a: 0 };
  private tilt = { x: 0, y: 0 };
  private tiltT = { x: 0, y: 0 };
  /** device tilt, -1..1 on each axis (gyro.ts) */
  setTilt(x: number, y: number) { this.tiltT.x = x; this.tiltT.y = y; }
  private ptr = { x: 0, y: 0, a: 0 };
  private lastMove = 0;
  private dollyZ = { z: 0, x: 0, roll: 0 };
  private day = { v: 0 }; // 0 night .. 1 Daylight
  private pv = { x: 0, y: 0, rx: 0, ry: 0, lx: 0, ly: 0, lt: 0 }; // pointer velocity (ndc per second): smoothed, raw, last sample
  private chaos = { v: 1 };
  private beat = 0;
  private beatRate = 0.55;
  beatFast = false;
  private micLevel = 0;
  private velRaw = 0;
  private vel = 0;
  private vol = 0;
  private gazeOn = 0;
  // the face: where the head and eyes are, blinks, saccades and what the tracker reports
  private fs = {
    aimX: 0, aimY: 0, hx: 0.5, hy: 0.12, ex: 0.5, ey: 0.12, sx: 0, sy: 0, stx: 0, sty: 0, sacAt: 0,
    blink: 0, blinkT: -1, blinkAt: 2.4, yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, conf: 0.98, flash: 0, drop: 0,
    bx: 0, by: 0, bw: 1, bh: 1.1,
  };
  private outline: number[] = [];
  private tmp = new Vector3();
  theme: 'night' | 'day' = 'night';

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.canvas = canvas;
    this.reduced = reduced;
    // opaque canvas: the scene paints its own background, so the post pass has something exact to work against
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    let gpu = '';
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    } catch { /* keep the default */ }
    this.quality = new Quality(gpu);
    // No GPU: a software rasteriser needs seconds of main-thread time just to compile this scene's shaders, and
    // every frame after that is a long task. Those browsers get the no-WebGL page instead (the caller falls back).
    // ?noadapt, ?tier= and ?n= keep the scene on, which is how the capture scripts run it.
    if (this.quality.software && !/[?&](noadapt|tier=|n=)/.test(location.search)) {
      this.renderer.dispose();
      throw new Error('software renderer');
    }
    this.N = this.quality.points;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality.level.dpr);
    this.bgMat = new ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 1., 1.); }',
      // the sky: flat background colour, plus a sun and a warm horizon that exist only while the theme is changing
      fragmentShader: `precision highp float; uniform vec3 uBg; uniform vec3 uSun; uniform float uAspect; varying vec2 vUv;
        void main() {
          vec3 c = uBg;
          if (uSun.z > 0.) {
            vec2 d = (vUv - uSun.xy) * vec2(uAspect, 1.);
            float r = length(d);
            c += uSun.z * (vec3(1., .62, .3) * (exp(-r * r * 7.) * .42 + smoothstep(.05, .035, r) * .55) + vec3(.55, .2, .08) * pow(1. - vUv.y, 3.) * .34);
          }
          gl_FragColor = vec4(c, 1.);
        }`,
      uniforms: { uBg: { value: this.bg }, uSun: { value: new Vector3() }, uAspect: { value: 1 } }, depthTest: false, depthWrite: false, blending: NoBlending,
    });
    const bgGeo = new BufferGeometry();
    bgGeo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const sky = new Mesh(bgGeo, this.bgMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky);
    const shared = {
      uDay: { value: 0 },
      uTime: { value: 0 }, uPR: { value: this.dpr }, uSize: { value: 2.3 }, uIntro: { value: 0 }, uAlphaMul: { value: 1 },
      uC0: { value: new Color() }, uC1: { value: new Color() }, uC2: { value: new Color() }, uNeutral: { value: new Color() },
      // narrow screens: the rows (ndc y: top, bottom) that copy occupies right now, and how hard points fade inside them
      uBands: { value: [new Vector2(-9, -9), new Vector2(-9, -9), new Vector2(-9, -9)] }, uBandK: { value: 0 },
    };
    const fg = faceGeo();
    this.outline = fg.outline;
    this.mat = new ShaderMaterial({
      vertexShader: vert,
      defines: {
        EYE_X: fg.eye.x.toFixed(4), EYE_Y: fg.eye.y.toFixed(4), EYE_Z: fg.eye.z.toFixed(4), EYE_A: fg.eye.a.toFixed(4), EYE_B: fg.eye.b.toFixed(4),
        BRIDGE_Y: fg.bridge.y.toFixed(4), BRIDGE_Z: fg.bridge.z.toFixed(4),
      },
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        ...shared,
        uProgress: { value: 0 }, uScroll: { value: 0 }, uSection: { value: 0 }, uChaos: { value: 1 }, uBeat: { value: 0 },
        uMic: { value: 0 }, uMicOn: { value: 0 }, uRipple: { value: 0 }, uDim: { value: 0 },
        uFormA: { value: 0 }, uFormB: { value: 0 }, uTurb: { value: 1 }, uDrift: { value: reduced ? 0 : 1 },
        uLayoutA: { value: new Vector3(1, 0, 0) }, uLayoutB: { value: new Vector3(1, 0, 0) },
        uStationA: { value: new Vector3() }, uStationB: { value: new Vector3() }, uFocus: { value: new Vector3() },
        uPointer: { value: new Vector4(0, 0, 0, 1.15) }, uSwirl: { value: 0 }, uPtrVel: { value: new Vector2() },
        uDens: { value: Math.min(1.5, Math.pow(40000 / this.N, 0.33)) }, uRepel: { value: 1 },
        uGaze: { value: new Vector3() }, uHead: { value: new Vector3() }, uFace: { value: new Vector4(0, 0, 0, 9) }, uEye: { value: new Vector2() }, uBox: { value: new Vector4(0, 0, 1, 1.1) }, uPipe: { value: new Vector3() }, uToy: { value: new Vector4() }, uNameHide: { value: 0 }, uVol: { value: 0 }, uEnergy: { value: 0 }, uBeatAmt: { value: 0 },
        uTextMask: { value: new Vector4(0, 0, 0.12, 0) },
      },
    });
    this.sceneryMat = new ShaderMaterial({
      vertexShader: sceneryVert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
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
    this.scenery.renderOrder = 1; this.points.renderOrder = 2;
    this.scene.add(this.scenery, this.points);
    this.camera.position.set(0, 0, CAM_Z);
    this.setTheme('night');
    this.resize();

    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(() => this.resize(), 120); }, { passive: true });
    window.addEventListener('pointermove', (e) => this.onPointer(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.onPointer(e), { passive: true });
    // a finger that is scrolling gets no pointermove events, so touches are followed directly
    const touch = (e: TouchEvent) => { const t = e.touches[0]; if (t) this.point(t.clientX, t.clientY); };
    window.addEventListener('touchstart', touch, { passive: true });
    window.addEventListener('touchmove', touch, { passive: true });
    document.addEventListener('visibilitychange', () => { this.visible = !document.hidden; });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.painted = false; document.documentElement.classList.remove('gl-on'); });
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
    // compile the shaders off the main thread where the driver allows it, so the first frame does not hitch
    try { this.bind(FORM.stars, FORM.stars); await this.post.warm(this.renderer, this.scene, this.camera); } catch { /* compiled on first draw instead */ }
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
  private layoutFor(form: FormName, kind: Kind, size?: readonly [number, number]): Layout {
    const aspect = this.aspect;
    const viewH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    const viewW = viewH * aspect;
    const cw = this.sizeW || window.innerWidth;
    if (form === 'stars') {
      const s = Math.min(1.15, Math.max(0.45, viewW / 9.5));
      return kind === 'hero' && this.wide ? { s: s * 0.9, x: 0, y: -viewH * 0.1 } : { s, x: 0, y: 0 };
    }
    const [w, h] = size ?? SIZE[form];
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
    const band = wide ? 0 : form === 'stars' ? 0.9 : 0.95;
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
    const mobile = this.low;
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
      .to(this.dollyZ, { z: dir > 0 ? -9 : 7, x: 2.4 * dir, roll: 0.14 * dir, duration: 0.6, ease: 'power2.in' }, 0);
    return tl.then().then(() => undefined);
  }
  /** page change, second half: the cloud condenses into the new page's first form */
  resolve(dir: 1 | -1) {
    if (this.reduced) { this.chaos.v = 0; this.dollyZ.z = this.dollyZ.x = this.dollyZ.roll = 0; this.dirty = true; return; }
    gsap.killTweensOf(this.chaos);
    gsap.killTweensOf(this.dollyZ);
    this.chaos.v = 1;
    // the camera arrives along the rail from the other side of the cloud it just flew into
    this.dollyZ.z = dir > 0 ? 8 : -9; this.dollyZ.x = -2.4 * dir; this.dollyZ.roll = -0.14 * dir;
    gsap.to(this.chaos, { v: 0, duration: 1.2, ease: 'power2.out' });
    gsap.to(this.dollyZ, { z: 0, x: 0, roll: 0, duration: 1.25, ease: 'power3.out' });
  }

  /** Night or Daylight. Animated, it is a change of lighting: the sun crosses the sky and every colour moves with it. */
  setTheme(t: 'night' | 'day', animate = false) {
    this.theme = t;
    const to = t === 'day' ? 1 : 0;
    gsap.killTweensOf(this.day);
    if (!animate || this.reduced) { this.day.v = to; this.applyDay(); }
    else gsap.to(this.day, { v: to, duration: 1.6, ease: 'sine.inOut', onUpdate: () => this.applyDay() });
  }
  private pal = (['night', 'day'] as const).map((k) => ({ c0: new Color(PALETTE[k].c0), c1: new Color(PALETTE[k].c1), c2: new Color(PALETTE[k].c2), neutral: new Color(PALETTE[k].neutral) }));
  private applyDay() {
    const k = this.day.v, U = this.mat.uniforms, [n, d] = this.pal, N = PALETTE.night, D = PALETTE.day;
    (U.uC0.value as Color).lerpColors(n.c0, d.c0, k); (U.uC1.value as Color).lerpColors(n.c1, d.c1, k);
    (U.uC2.value as Color).lerpColors(n.c2, d.c2, k); (U.uNeutral.value as Color).lerpColors(n.neutral, d.neutral, k);
    U.uAlphaMul.value = lerp(N.alpha, D.alpha, k);
    U.uSize.value = lerp(N.size, D.size, k);
    U.uDay.value = k;
    // the sky warms on the way: dawn colours peak in the middle and are gone at both ends, where the bytes are exact
    const mid = Math.sin(Math.PI * k), e = smooth(k);
    this.bg.set(
      lerp(N.bg[0], D.bg[0], e) / 255 + 0.09 * mid * (1 - 0.6 * k),
      lerp(N.bg[1], D.bg[1], e) / 255 + 0.025 * mid * (1 - 0.6 * k),
      lerp(N.bg[2], D.bg[2], e) / 255 - 0.02 * mid * (1 - k),
    );
    // the sun climbs an arc from below the horizon and leaves through the top of the frame as full daylight arrives
    (this.bgMat.uniforms.uSun.value as Vector3).set(lerp(0.14, 0.8, k), -0.14 + 1.3 * Math.sin((k * Math.PI) / 2), k <= 0 || k >= 1 ? 0 : Math.pow(mid, 0.8));
    this.dirty = true;
  }

  /* ---------- pointer ---------- */
  private onPointer(e: PointerEvent) { this.point(e.clientX, e.clientY); }
  private point(cx: number, cy: number) {
    const x = (cx / window.innerWidth) * 2 - 1, y = -((cy / window.innerHeight) * 2 - 1);
    const now = performance.now(), p = this.pv, dt = now - p.lt;
    if (dt > 0 && dt < 120) { p.rx = ((x - p.lx) / dt) * 1000; p.ry = ((y - p.ly) / dt) * 1000; }
    p.lx = x; p.ly = y; p.lt = now;
    this.ptrTarget.x = x; this.ptrTarget.y = y;
    this.lastMove = now;
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
    this.sizeBuffers();
    this.camera.aspect = w / h;
    this.bgMat.uniforms.uAspect.value = w / h;
    this.camera.updateProjectionMatrix();
    // keep every station's layout valid for the new aspect
    for (const s of this.stops) { s.lay = this.layoutFor(s.name, s.kind); s.mask = this.maskFor(s.name, s.kind); }
    if (wasWide !== this.wide) this.rebuildScenery();
    this.dirty = true;
  }

  /** drawing buffer, post targets and point sizes for the current pixel ratio and quality level */
  private sizeBuffers() {
    const lv = this.quality.level;
    this.dpr = Math.min(window.devicePixelRatio || 1, lv.dpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.sizeW, this.sizeH, false);
    this.post.configure(Math.floor(this.sizeW * this.dpr), Math.floor(this.sizeH * this.dpr), this.reduced && lv.bloom ? Math.min(lv.bloom, 3) : lv.bloom);
    this.mat.uniforms.uPR.value = this.dpr;
    // fewer points are drawn a little larger, and so are points on tall screens, where the same form covers more pixels
    this.mat.uniforms.uDens.value = Math.min(1.5, Math.pow(40000 / (this.N * lv.draw), 0.33)) * Math.max(1, Math.min(1.8, this.sizeH / 900));
    this.geo.setDrawRange(0, Math.floor(this.N * lv.draw));
    this.dirty = true;
  }
  /** numbers for the ?fps overlay */
  stats() {
    const q = this.quality, lv = q.level;
    return { ms: q.avg, worst: q.worst, tier: q.tier, step: q.step, steps: q.steps, points: Math.floor(this.N * lv.draw), dpr: this.dpr, bloom: lv.bloom };
  }

  /** where the camera is and what it looks at, for the current position on the route */
  private fly(dt: number) {
    const n = this.stops.length;
    const seg = Math.max(0, Math.min(n - 2, Math.floor(this.u)));
    const A = this.stops[seg], B = this.stops[Math.min(n - 1, seg + 1)];
    const t = n > 1 ? Math.max(0, Math.min(1, this.u - seg)) : 0;
    const same = A.form === B.form;
    const U = this.mat.uniforms;

    // a toy only lives while the reader stays put on the station it started on
    const oi = Math.round(this.u), O = this.stops[oi];
    if (this.over.on && (!O || oi !== this.over.stop || Math.abs(this.u - oi) > 0.06)) this.dropToy();
    if (this.over.on && O) {
      const kind: Kind = O.kind === 'left' || O.kind === 'right' ? O.kind : 'hero';
      const L = this.layoutFor('pulse', kind, this.over.size);
      this.bind(O.form, TOY);
      U.uProgress.value = this.over.k;
      U.uTurb.value = 0.55;
      (U.uLayoutA.value as Vector3).set(O.lay.s, O.lay.x, O.lay.y);
      (U.uLayoutB.value as Vector3).set(L.s * this.over.shrink, L.x, L.y);
      (U.uStationA.value as Vector3).copy(O.w);
      (U.uStationB.value as Vector3).copy(O.w);
    } else {
      this.bind(A.form, B.form);
      U.uProgress.value = t;
      U.uTurb.value = same ? 0.15 : 1;
      (U.uLayoutA.value as Vector3).set(A.lay.s, A.lay.x, A.lay.y);
      (U.uLayoutB.value as Vector3).set(B.lay.s, B.lay.x, B.lay.y);
      (U.uStationA.value as Vector3).copy(A.w);
      (U.uStationB.value as Vector3).copy(B.w);
    }
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
    // phones: tilting the device moves the camera the way the pointer does on a desk
    const kt = 1 - Math.pow(0.03, dt);
    this.tilt.x += (this.tiltT.x - this.tilt.x) * kt; this.tilt.y += (this.tiltT.y - this.tilt.y) * kt;
    this.camera.position.set(this.camPos.x + (this.ptr.x * 0.28 + this.tilt.x * 0.55) * par + this.dollyZ.x, this.camPos.y + (this.ptr.y * 0.16 + this.tilt.y * 0.34) * par, this.camPos.z + this.dollyZ.z);
    roll += this.dollyZ.roll;
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
    // the detection box: bounds of the mesh outline as it is turned right now, so the head stays centred in it
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), cp = Math.cos(f.pitch), sp = Math.sin(f.pitch), cr = Math.cos(f.roll), sr = Math.sin(f.roll);
    const v = faceGeo().v, c12 = Math.cos(0.12), s12 = Math.sin(0.12);
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const i of this.outline) {
      const x = v[i * 3], y = v[i * 3 + 1] - PIV_Y, z = v[i * 3 + 2] - PIV_Z;
      const xa = cy * x + sy * z, za = -sy * x + cy * z;
      const yb = cp * y - sp * za, zb = sp * y + cp * za;
      const xc = cr * xa - sr * yb, yc = sr * xa + cr * yb + PIV_Y;
      const xd = c12 * xc + s12 * (zb + PIV_Z);
      if (xd < x0) x0 = xd; if (xd > x1) x1 = xd; if (yc < y0) y0 = yc; if (yc > y1) y1 = yc;
    }
    f.bx = (x0 + x1) / 2; f.by = (y0 + y1) / 2; f.bw = (x1 - x0) / 2 + 0.07; f.bh = (y1 - y0) / 2 + 0.07;
    (U.uBox.value as Vector4).set(f.bx, f.by, f.bw, f.bh);
    const turned = Math.min(1, Math.abs(f.yaw + 0.12) / 0.42);
    const target = 0.985 - 0.09 * turned * turned - 0.2 * f.blink - f.drop;
    f.conf += (target - f.conf) * (this.reduced ? 1 : 1 - Math.exp(-dt * 7));
  }
  /** the tracker loses the face for a moment: the mesh flashes amber and its confidence drops, then recovers */
  lookAway() { if (this.reduced) return; this.fs.flash = 1.4; this.fs.drop = 0.55; this.dirty = true; }
  /** what the eggs need to know: the form in front of the camera, how volatile the candles are, how much the cursor steers the gaze */
  eggState() { return { form: this.stops[Math.round(this.u)]?.name ?? 'stars', vol: this.vol, gaze: this.gazeOn }; }
  /** the particle wordmark fades out while the name is on screen as loose letters, and back in afterwards */
  hideName(v: boolean) { gsap.to(this.mat.uniforms.uNameHide, { value: v ? 1 : 0, duration: this.reduced ? 0 : 0.35, onUpdate: () => { this.dirty = true; } }); }
  /** git push --force: the pipeline fails, runs backwards to the last good build, then goes green */
  forcePush() {
    const p = this.mat.uniforms.uPipe.value as Vector3;
    if (this.reduced) return;
    gsap.killTweensOf(p);
    p.set(0, 0, 0);
    gsap.timeline()
      .to(p, { x: 1, duration: 0.35, ease: 'power2.out' }, 0.5)
      .to(p, { y: -7, duration: 1.5, ease: 'power2.inOut' }, 1.3)
      .to(p, { x: 0, duration: 0.5, ease: 'power1.inOut' }, 2.4)
      .to(p, { z: 1, duration: 0.3, ease: 'power2.out' }, 3.4)
      .to(p, { z: 0, duration: 1.2, ease: 'power2.in' }, 3.9);
  }
  /* ---------- toys: the points on screen re-form into something else for a while ---------- */
  /** true while resting on a form that has clear space of its own (not the star field, which sits behind copy) */
  get toyReady() { const at = this.resting; return this.ready && !this.reduced && !this.over.on && !!at && at.form !== 'stars'; }
  get toyOn() { return this.over.on; }
  /** hand over N records (STRIDE floats each: x y z tone, group size alpha 0). size is the toy's extent in its own units. */
  showToy(data: Float32Array, size: readonly [number, number], shrink = 1, duration = 1.2): boolean {
    if (!this.toyReady || data.length !== this.N * STRIDE) return false;
    const cur = this.pos[TOY];
    if (cur) { (cur.data.array as Float32Array).set(data); cur.data.needsUpdate = true; } else this.install(TOY, data);
    (this.mat.uniforms.uToy.value as Vector4).set(0, 0, 0, 0);
    this.over.on = true; this.over.k = 0; this.over.stop = Math.round(this.u); this.over.size = size; this.over.shrink = shrink;
    gsap.killTweensOf(this.over);
    gsap.to(this.over, { k: 1, duration, ease: 'power2.inOut' });
    return true;
  }
  /** the points go back to the form they came from */
  hideToy(duration = 0.7) {
    if (!this.over.on) return;
    gsap.killTweensOf(this.over);
    gsap.to(this.over, { k: 0, duration, ease: 'power2.inOut', onComplete: () => this.dropToy() });
  }
  private dropToy() { gsap.killTweensOf(this.over); this.over.on = false; this.over.k = 0; }
  setToy(x: number, y: number, z: number, w: number) { (this.mat.uniforms.uToy.value as Vector4).set(x, y, z, w); }
  /** where the particle wordmark is on screen (css px), or null when it is not the form in front of the camera */
  nameRect(): { x0: number; y0: number; x1: number; y1: number } | null {
    const at = this.resting, s = this.stops[Math.round(this.u)];
    if (!at || at.form !== 'name' || !s || this.over.on) return null;
    const [w, h] = SIZE.name, k = s.lay.s;
    const a = this.tmp.set(s.lay.x - (w * k) / 2 + s.w.x, s.lay.y + (h * k) / 2 + s.w.y, s.w.z).project(this.camera);
    const x0 = (a.x * 0.5 + 0.5) * this.sizeW, y0 = (-a.y * 0.5 + 0.5) * this.sizeH;
    a.set(s.lay.x + (w * k) / 2 + s.w.x, s.lay.y - (h * k) / 2 + s.w.y, s.w.z).project(this.camera);
    return { x0, y0, x1: (a.x * 0.5 + 0.5) * this.sizeW, y1: (-a.y * 0.5 + 0.5) * this.sizeH };
  }

  /** small devices get the mesh, irises and gaze rays only */
  get low() { return this.N <= 12000; }
  /** live values for the labels beside the face. False when they should not be shown. */
  faceHud(o: FaceHud): boolean {
    const at = this.resting, s = this.stops[Math.round(this.u)];
    if (!at || !s || at.form !== 'face' || this.low || this.narrow) return false;
    const f = this.fs, k = 1.65 * s.lay.s;
    const v = this.tmp.set((f.bx - f.bw) * k + s.lay.x + s.w.x, (f.by + f.bh) * k + s.lay.y + s.w.y, s.w.z).project(this.camera);
    o.x0 = (v.x * 0.5 + 0.5) * this.sizeW; o.y0 = (-v.y * 0.5 + 0.5) * this.sizeH;
    v.set((f.bx + f.bw) * k + s.lay.x + s.w.x, (f.by - f.bh) * k + s.lay.y + s.w.y, s.w.z).project(this.camera);
    o.x1 = (v.x * 0.5 + 0.5) * this.sizeW; o.y1 = (-v.y * 0.5 + 0.5) * this.sizeH;
    o.yaw = ((f.yaw + 0.12) * 180) / Math.PI; o.pitch = (-f.pitch * 180) / Math.PI;
    o.gx = f.gx; o.gy = f.gy; o.conf = f.conf; o.kind = s.kind;
    // the tracker's own figures from the case study (22 fps, under 120 ms), with the small wobble a live read-out has
    const t = this.reduced ? 0 : this.time;
    o.rate = 22 + 0.3 * Math.sin(t * 1.7) + 0.15 * Math.sin(t * 4.3);
    o.infer = 112 + 4 * Math.sin(t * 0.9) + 2 * Math.sin(t * 3.1);
    return true;
  }

  /** called from the shared GSAP ticker */
  tick(dtMs: number) {
    if (!this.ready || !this.visible || !this.stops.length) return;
    const U = this.mat.uniforms;
    const dt = Math.min(dtMs, 50) / 1000;
    if (this.reduced) {
      if (!this.dirty) return;
      this.dirty = false;
      U.uTime.value = this.time;
    } else {
      this.time += dt;
      U.uTime.value = this.time;
      if (this.quality.frame(dtMs)) this.sizeBuffers();
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
    // repel and swirl follow how fast the pointer (or finger) is moving: a resting pointer leaves the form alone
    const p = this.pv, still = performance.now() - this.lastMove > 70;
    if (still) p.rx = p.ry = 0;
    const kv = 1 - Math.pow(still ? 0.004 : 0.0002, dt);
    p.x += (p.rx - p.x) * kv; p.y += (p.ry - p.y) * kv;
    const sp = this.reduced ? 0 : Math.min(1, Math.hypot(p.x, p.y) / 2.4);
    (U.uPointer.value as Vector4).set(this.ptr.x * halfH * this.aspect, this.ptr.y * halfH, sp, 1.15);
    U.uSwirl.value = sp * (p.x >= 0 ? 1 : -1);
    const carry = sp > 0 ? (0.4 * sp) / Math.max(0.001, Math.hypot(p.x, p.y)) : 0;
    (U.uPtrVel.value as Vector2).set(p.x * carry, p.y * carry);
    U.uRipple.value = this.reduced ? 0 : this.ptr.a;
    U.uMic.value += (this.micLevel - U.uMic.value) * 0.35;
    // chromatic aberration follows scroll speed and is exactly zero at rest
    const caT = this.reduced ? 0 : Math.max(0, Math.min(1, (this.velRaw - 4) / 70));
    this.ca += (caT - this.ca) * (1 - Math.pow(caT > this.ca ? 0.001 : 0.00002, dt));
    if (this.ca < 0.004) this.ca = 0;
    if (this.post.active) this.post.render(this.renderer, this.scene, this.camera, { bg: this.bg, day: U.uDay.value as number, ca: this.ca * 0.02, time: this.time });
    else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
    if (!this.painted) { this.painted = true; document.documentElement.classList.add('gl-on'); }
  }
}
