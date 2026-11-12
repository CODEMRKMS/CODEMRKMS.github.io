/**
 * Procedural point targets for every form. Pure functions (no DOM) so they can run in a worker.
 * Each shape is a Float32Array of N * 8:  [x, y, z, tone, e0, e1, e2, e3]
 * "tone" and the extras are interpreted by the matching branch in vert.glsl.
 */

export const FORM = { stars: 0, name: 1, gaze: 2, terrain: 3, voice: 4, pipeline: 5, docs: 6, pulse: 7 } as const;
export type FormName = keyof typeof FORM;
export const FORM_COUNT = 8;

export const STRIDE = 8;

/** Award stars (canonical coordinates). Index matches the order of the awards in the page markup. */
export const AWARD_STARS: [number, number, number][] = [
  [-3.1, 1.25, 0.0], // 0 Gen AI Hackathon runner-up
  [-1.75, 0.15, -0.3], // 1 Smart India Hackathon
  [0.8, 1.55, 0.0], // 2 Ops Essentia
  [-2.35, -1.45, 0.2], // 3 Amazon HackOn finalist
  [0.55, -0.95, 0.1], // 4 IRM level 1
  [2.55, -1.6, 0.2], // 5 Google AI / Marketing in a Digital World
  [2.85, 0.55, -0.2], // 6 Drone Challenge
];
/** constellations: pairs of award indices */
export const AWARD_LINKS: [number, number][] = [
  [0, 1],
  [1, 3],
  [2, 6],
  [4, 5],
];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rnd = () => number;

function gauss(r: Rnd) {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r());
}
function put(o: Float32Array, i: number, x: number, y: number, z: number, w: number, a = 0, b = 0, c = 0, d = 0) {
  const k = i * STRIDE;
  o[k] = x; o[k + 1] = y; o[k + 2] = z; o[k + 3] = w;
  o[k + 4] = a; o[k + 5] = b; o[k + 6] = c; o[k + 7] = d;
}

export function genSeeds(N: number, seed = 7): Float32Array {
  const r = mulberry32(seed);
  const s = new Float32Array(N * 4);
  for (let i = 0; i < s.length; i++) s[i] = r();
  return s;
}

/* ---------- 0: stars / noise ---------- */
export function genStars(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  let i = 0;
  for (const p of AWARD_STARS) put(o, i++, p[0], p[1], p[2], 0.95, 1);
  const M = Math.max(30, Math.floor(N / 560));
  for (const [a, b] of AWARD_LINKS) {
    const A = AWARD_STARS[a], B = AWARD_STARS[b];
    for (let j = 0; j < M; j++) {
      const t = (j + 0.5) / M;
      put(o, i++, A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, 0.55, 2);
    }
  }
  const ang = 0.5, ca = Math.cos(ang), sa = Math.sin(ang);
  for (; i < N; i++) {
    let x: number, y: number, z: number;
    if (r() < 0.38) {
      const u = (r() - 0.5) * 19, v = gauss(r) * 0.95;
      x = u * ca - v * sa; y = u * sa + v * ca; z = -7 + r() * 9;
    } else {
      x = (r() - 0.5) * 17; y = (r() - 0.5) * 10; z = -9 + r() * 12;
    }
    let w = Math.pow(r(), 1.7) * 0.85;
    if (r() < 0.035) w = 1;
    put(o, i, x, y, z, w, 0);
  }
  return o;
}

/* ---------- 1: wordmark (main thread, needs the loaded font) ---------- */
export function genWordmark(N: number, lines: string[], font: string, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const size = 260;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `800 ${size}px ${font}`;
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
  const lh = size * 0.98;
  const pad = 20;
  cv.width = Math.ceil(maxW + pad * 2);
  cv.height = Math.ceil(lh * lines.length + pad * 2);
  ctx.font = `800 ${size}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + lh * i + size * 0.8));
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const px: number[] = [];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let y = 0; y < cv.height; y += 2) {
    for (let x = 0; x < cv.width; x += 2) {
      if (img[(y * cv.width + x) * 4 + 3] > 140) {
        px.push(x, y);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const n = px.length / 2;
  const s = 6 / (maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (let i = 0; i < N; i++) {
    const k = n > 0 ? Math.floor(r() * n) : 0;
    const x = ((px[k * 2] ?? cx) + (r() - 0.5) * 1.2 - cx) * s;
    const y = -((px[k * 2 + 1] ?? cy) + (r() - 0.5) * 1.2 - cy) * s;
    put(o, i, x, y, (r() - 0.5) * 0.14, Math.min(1, Math.max(0, x / 6 + 0.5)), 0);
  }
  return o;
}

/** sample a short string into xy points (cap height 1, origin bottom-left). Main thread only. */
export function sampleText(text: string, font: string): { pts: number[]; w: number } | null {
  try {
    const size = 120;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.font = `800 ${size}px ${font}`;
    cv.width = Math.ceil(ctx.measureText(text).width + 8);
    cv.height = Math.ceil(size * 1.1);
    ctx.font = `800 ${size}px ${font}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 4, size * 0.9);
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const cap = size * 0.72;
    const pts: number[] = [];
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
      if (img[(y * cv.width + x) * 4 + 3] > 140) pts.push(x / cap, (size * 0.9 - y) / cap);
    }
    return pts.length ? { pts, w: cv.width / cap } : null;
  } catch {
    return null;
  }
}

/* ---------- 2: gaze cone ---------- */
export const HEAD_X = -1.6;
export function genGaze(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const nh = Math.floor(N * 0.34), nc = Math.floor(N * 0.46);
  let i = 0;
  for (let k = 0; k < nh; k++, i++) {
    const y = 1 - (2 * (k + 0.5)) / nh, rr = Math.sqrt(1 - y * y), th = k * 2.399963;
    const R = 0.85 * (1 + (r() - 0.5) * 0.04);
    put(o, i, HEAD_X + R * rr * Math.cos(th), R * y, R * rr * Math.sin(th), 0.12 + 0.12 * r(), 0);
  }
  const tan = Math.tan(0.33), L = 3.5;
  for (let k = 0; k < nc; k++, i++) {
    const t = Math.pow(r(), 0.85);
    const x = HEAD_X + 0.85 + t * L;
    const rad = t * L * tan;
    const rr = r() < 0.74 ? rad : rad * Math.sqrt(r());
    const ph = r() * 6.2831853;
    put(o, i, x, rr * Math.cos(ph), rr * Math.sin(ph), 0.42 + 0.58 * t, 1, t);
  }
  for (; i < N; i++) {
    const ph = r() * 6.2831853, j = Math.floor(r() * 3);
    put(o, i, Math.cos(ph), Math.sin(ph), 0, 0.3, 2, j / 3 + r() * 0.002);
  }
  return o;
}

/* ---------- 3: volatility terrain ---------- */
function terrain(x: number, z: number) {
  const base = 0.34 * Math.sin(x * 0.9 + 1.3) * Math.cos(z * 1.1) + 0.2 * Math.sin(x * 2.1 - z * 1.7 + 0.5) + 0.1 * Math.sin(x * 3.9 + z * 3.1);
  const d = z - (0.25 * x - 0.1);
  const ridge = Math.exp(-(d * d) / 0.22) * (0.75 + 0.35 * Math.sin(x * 1.4 + 0.7));
  const edge = Math.min(1, (3.5 - Math.abs(x)) * 1.2) * Math.min(1, (2.5 - Math.abs(z)) * 1.4);
  const y = (base + 1.15 * ridge) * Math.max(0.2, edge) - 0.15;
  const s = Math.max(-1, Math.min(1, 0.72 * Math.sin(x * 0.7 + 0.4) * Math.cos(z * 0.9) + 0.5 * (ridge - 0.3) + 0.22 * Math.sin(x * 3 - z * 2)));
  return { y, ridge, s };
}
export function genTerrain(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const G = Math.floor(Math.sqrt(N));
  let i = 0;
  for (let gx = 0; gx < G; gx++) {
    for (let gz = 0; gz < G; gz++, i++) {
      const x = (gx / (G - 1) - 0.5) * 6.8, z = (gz / (G - 1) - 0.5) * 4.8;
      const t = terrain(x, z);
      put(o, i, x, t.y, z, 0, t.ridge, t.s);
    }
  }
  for (; i < N; i++) {
    const x = (r() - 0.5) * 6.8, z = (r() - 0.5) * 4.8, t = terrain(x, z);
    put(o, i, x, t.y, z, 0, t.ridge, t.s);
  }
  return o;
}

/* ---------- 4: voice ring ---------- */
export function genVoice(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const M = 44, per = Math.ceil(N / M), R = 1.9;
  for (let i = 0; i < N; i++) {
    const l = Math.min(M - 1, Math.floor(i / per)) / (M - 1);
    const th = r() * 6.2831853;
    put(o, i, Math.cos(th) * R, Math.sin(th) * R, -l * 1.5, l, th, l, r());
  }
  return o;
}

/* ---------- 5: pipeline lattice ---------- */
export const PIPE_STAGES = 6;
const LANE_Y = [-1.1, 0, 1.1];
const LANE_Z = [-0.9, 0.9];
export function genPipeline(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const ng = Math.floor(N * 0.08), nn = Math.floor(N * 0.07);
  const sx = (s: number) => -3.3 + (6.6 * s) / (PIPE_STAGES - 1);
  let i = 0;
  for (let k = 0; k < ng; k++, i++) {
    const s = Math.floor(r() * PIPE_STAGES);
    put(o, i, sx(s), (r() - 0.5) * 3.6, (r() - 0.5) * 2.6, 0.3, 1);
  }
  for (let k = 0; k < nn; k++, i++) {
    const s = Math.floor(r() * PIPE_STAGES), lane = Math.floor(r() * 6), ph = r() * 6.2831853;
    put(o, i, sx(s), LANE_Y[lane % 3] + Math.cos(ph) * 0.17, LANE_Z[Math.floor(lane / 3)] + Math.sin(ph) * 0.17, 0.55, 2);
  }
  for (; i < N; i++) {
    const lane = Math.floor(r() * 6);
    const fail = r() < 0.07 ? 1 : 0;
    put(o, i, r(), LANE_Y[lane % 3] + gauss(r) * 0.035, LANE_Z[Math.floor(lane / 3)] + gauss(r) * 0.035, 0.2 + r() * 0.3, 0, 0.75 + r() * 0.5, fail, 0.2 + r() * 0.6);
  }
  return o;
}

/* ---------- 6: document lines ---------- */
export const DOC_LINES = 40;
export function genDocs(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const gap = 0.092;
  const group: number[] = [];
  for (let l = 0; l < DOC_LINES; l++) { const v = r(); group.push(v < 0.5 ? 0 : v < 0.74 ? 1 : 2); }
  const target: number[] = new Array(DOC_LINES);
  let cur = 0;
  for (const g of [0, 1, 2]) {
    for (let l = 0; l < DOC_LINES; l++) if (group[l] === g) { target[l] = cur; cur -= gap; }
    cur -= 0.34;
  }
  const total = -(cur + 0.34);
  const initCenter = ((DOC_LINES - 1) * gap) / 2;
  const sortedShift = total / 2 - gap / 2;
  const per = Math.ceil(N / DOC_LINES);
  const segs: { a: number; b: number }[][] = [];
  const widths: number[] = [];
  for (let l = 0; l < DOC_LINES; l++) {
    const w = 3.4 + r() * 1.8, s: { a: number; b: number }[] = [];
    let x = 0;
    while (x < w) { const len = 0.22 + r() * 0.62; s.push({ a: x, b: Math.min(w, x + len) }); x += len + 0.14; }
    segs.push(s); widths.push(w);
  }
  for (let i = 0; i < N; i++) {
    const l = Math.min(DOC_LINES - 1, Math.floor(i / per));
    const s = segs[l];
    let tot = 0; for (const q of s) tot += q.b - q.a;
    let v = r() * tot, x = 0;
    for (const q of s) { const d = q.b - q.a; if (v <= d) { x = q.a + v; break; } v -= d; }
    const yInit = initCenter - l * gap;
    put(o, i, x - 2.6, yInit + (r() - 0.5) * 0.026, (r() - 0.5) * 0.05, r(), x / widths[l], l / (DOC_LINES - 1), group[l], target[l] + sortedShift);
  }
  return o;
}

/* ---------- 7: pulse ---------- */
export function genPulse(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const nc = Math.floor(N * 0.55);
  for (let i = 0; i < nc; i++) {
    let x = gauss(r), y = gauss(r), z = gauss(r);
    const l = Math.hypot(x, y, z) + 1e-6, rr = Math.min(1.3, Math.abs(gauss(r)) * 0.42);
    x = (x / l) * rr; y = (y / l) * rr; z = (z / l) * rr;
    put(o, i, x, y, z, 1 - rr / 1.3, 0);
  }
  const ns = N - nc;
  for (let k = 0; k < ns; k++) {
    const y = 1 - (2 * (k + 0.5)) / ns, rr = Math.sqrt(1 - y * y), th = k * 2.399963;
    const R = 1.0 + (r() - 0.5) * 0.05;
    put(o, nc + k, R * rr * Math.cos(th), R * y, R * rr * Math.sin(th), 0.15 + 0.3 * r(), 1);
  }
  return o;
}

/** every shape except the wordmark (index 1 is left empty for the caller) */
export function buildShapes(N: number, seed = 1234): Float32Array[] {
  const mk = (n: number) => mulberry32(seed + n * 101);
  const out: Float32Array[] = new Array(FORM_COUNT);
  out[FORM.stars] = genStars(N, mk(0));
  out[FORM.gaze] = genGaze(N, mk(2));
  out[FORM.terrain] = genTerrain(N, mk(3));
  out[FORM.voice] = genVoice(N, mk(4));
  out[FORM.pipeline] = genPipeline(N, mk(5));
  out[FORM.docs] = genDocs(N, mk(6));
  out[FORM.pulse] = genPulse(N, mk(7));
  return out;
}
