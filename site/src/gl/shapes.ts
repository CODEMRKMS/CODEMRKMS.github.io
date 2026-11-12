/**
 * Procedural point targets for every form. Pure functions (no DOM) so they can run in a worker.
 * Each shape is a Float32Array of N * 8:  [x, y, z, tone, e0, e1, e2, e3]
 * "tone" and the extras are interpreted by the matching branch in vert.glsl.
 */
import { FACE_T, FACE_V } from './facemesh';

export const FORM = { stars: 0, name: 1, face: 2, candles: 3, voice: 4, pipeline: 5, docs: 6, pulse: 7 } as const;
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

/* ---------- 2: face-tracking landmark mesh ---------- */
// MediaPipe landmark indices: eyelid rings (corner to corner, lower then upper) and the inner lip ring
const EYE_LOWER = [[33, 7, 163, 144, 145, 153, 154, 155, 133], [263, 249, 390, 373, 374, 380, 381, 382, 362]];
const EYE_UPPER = [[33, 246, 161, 160, 159, 158, 157, 173, 133], [263, 466, 388, 387, 386, 385, 384, 398, 362]];
const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 191, 80, 81, 82, 13, 312, 311, 310, 415];

export interface FaceGeo {
  /** landmark positions: face height is 2 units, centred, z forward */
  v: Float32Array;
  /** unit vertex normals */
  n: Float32Array;
  /** how far each landmark drops (y) when the eyes close */
  blink: Float32Array;
  /** mesh edges as landmark index pairs; the eye and mouth openings are left open */
  edges: Uint16Array;
  /** landmarks on the outer boundary (plus the nose tip): enough to bound the turned head */
  outline: number[];
  /** 1 for edges on the outer boundary of the mesh */
  rim: Uint8Array;
  len: Float32Array;
  total: number;
  /** centre of the subject's left eye (the right one mirrors it) and the half axes of its opening */
  eye: { x: number; y: number; z: number; a: number; b: number };
  /** the nose bridge, where the pose gizmo sits */
  bridge: { y: number; z: number };
}
let geo: FaceGeo | null = null;
export function faceGeo(): FaceGeo {
  if (geo) return geo;
  const nv = FACE_V.length / 3, nt = FACE_T.length / 3;
  const S = 1 / 883, YC = -57, ZC = 300;
  const v = new Float32Array(nv * 3), n = new Float32Array(nv * 3), blink = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    v[i * 3] = FACE_V[i * 3] * S; v[i * 3 + 1] = (FACE_V[i * 3 + 1] - YC) * S; v[i * 3 + 2] = (FACE_V[i * 3 + 2] - ZC) * S;
  }
  // area-weighted vertex normals from the closed surface
  let flip = 0;
  for (let t = 0; t < nt; t++) {
    const a = FACE_T[t * 3] * 3, b = FACE_T[t * 3 + 1] * 3, c = FACE_T[t * 3 + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    flip += nz;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  const sg = flip < 0 ? -1 : 1;
  for (let i = 0; i < nv; i++) {
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    n[i * 3] *= sg / l; n[i * 3 + 1] *= sg / l; n[i * 3 + 2] *= sg / l;
  }
  // open the eyes a little (the canonical lids are nearly shut) and record how far the upper lid travels in a blink
  const hole = new Uint8Array(nv), upper = new Uint8Array(nv);
  for (let e = 0; e < 2; e++) {
    for (let k = 0; k < 9; k++) {
      const u = EYE_UPPER[e][k], l = EYE_LOWER[e][k];
      hole[u] = hole[l] = 1;
      if (u === l) continue;
      const gap = v[u * 3 + 1] - v[l * 3 + 1];
      v[u * 3 + 1] += gap * 0.3; v[l * 3 + 1] -= gap * 0.1;
      blink[u] = -(v[u * 3 + 1] - v[l * 3 + 1]) * 0.94;
      upper[u] = 1;
    }
  }
  for (const i of LIPS_INNER) hole[i] = 2;
  // edges of every triangle that does not close an eye or the mouth
  const key = (a: number, b: number) => (a < b ? a * 512 + b : b * 512 + a);
  const count = new Map<number, number>(), keep = new Set<number>();
  const drag = new Float32Array(nv), dragN = new Float32Array(nv);
  for (let t = 0; t < nt; t++) {
    const a = FACE_T[t * 3], b = FACE_T[t * 3 + 1], c = FACE_T[t * 3 + 2];
    const closed = hole[a] !== 0 && hole[a] === hole[b] && hole[b] === hole[c];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = key(p, q);
      count.set(k, (count.get(k) ?? 0) + 1);
      if (!closed) keep.add(k);
      // skin just above the lid follows it a little
      if (upper[p] && !hole[q]) { drag[q] += blink[p]; dragN[q]++; }
      if (upper[q] && !hole[p]) { drag[p] += blink[q]; dragN[p]++; }
    }
  }
  for (let i = 0; i < nv; i++) if (dragN[i] && v[i * 3 + 1] > 0.3) blink[i] = (drag[i] / dragN[i]) * 0.3;
  const edges = new Uint16Array(keep.size * 2), rim = new Uint8Array(keep.size), len = new Float32Array(keep.size);
  let total = 0, m = 0;
  const outer = new Set<number>([4]);
  for (const k of keep) {
    const a = Math.floor(k / 512), b = k % 512;
    edges[m * 2] = a; edges[m * 2 + 1] = b;
    rim[m] = count.get(k) === 1 ? 1 : 0;
    if (rim[m]) { outer.add(a); outer.add(b); }
    len[m] = Math.hypot(v[a * 3] - v[b * 3], v[a * 3 + 1] - v[b * 3 + 1], v[a * 3 + 2] - v[b * 3 + 2]);
    total += len[m++];
  }
  const L = EYE_LOWER[1], U = EYE_UPPER[1];
  let ex = 0, ey = 0, ez = 0;
  for (const i of [...L, ...U]) { ex += v[i * 3] / 18; ey += v[i * 3 + 1] / 18; ez += v[i * 3 + 2] / 18; }
  geo = {
    v, n, blink, edges, rim, len, total, outline: [...outer],
    eye: { x: ex, y: ey, z: ez - 0.015, a: Math.abs(v[L[0] * 3] - v[L[8] * 3]) / 2, b: (v[U[4] * 3 + 1] - v[L[4] * 3 + 1]) / 2 },
    bridge: { y: v[168 * 3 + 1], z: v[168 * 3 + 2] },
  };
  return geo;
}

/**
 * e0 is the group: 0 mesh (e1 = 0 edge, 1 landmark, +0.5 on the outer boundary; e2, e3 = normal xy; tone = blink travel),
 * 1 iris (e1 = side), 2 gaze ray (e1 = distance along it, e2 = side), 3 reticle, 4 detection box (xy = corner, e1 = distance along the arm, e2 = arm), 5 pose gizmo (e1 = axis).
 */
export function genFace(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const g = faceGeo(), nv = g.v.length / 3, ne = g.len.length;
  const low = N <= 12000;
  let i = 0;
  const perV = N < 6000 ? 1 : low ? 2 : 4;
  // tracking layer first, so it is complete whatever is left for the mesh
  const nIris = low ? 80 : 170, nRay = low ? 110 : 230, nRet = low ? 90 : 190, nBox = low ? 240 : 640, nAxis = low ? 0 : 110;
  for (const side of [-1, 1]) {
    for (let k = 0; k < nIris; k++) {
      const a = (k / nIris) * 6.2832 * 3;
      if (k % 5 === 0) { const rr = Math.sqrt(r()) * 0.017, b = r() * 6.2832; put(o, i++, Math.cos(b) * rr, Math.sin(b) * rr, 0, 1, 1, side); }
      else put(o, i++, Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0, 0.9, 1, side);
    }
    for (let k = 0; k < nRay; k++) put(o, i++, gauss(r) * 0.003, gauss(r) * 0.003, 0, 1, 2, (k + r()) / nRay, side);
  }
  for (let k = 0; k < nRet; k++) {
    const v = k / nRet, a = v * 6.2832 * 4;
    if (v < 0.5) put(o, i++, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0, 1, 3);
    else if (v < 0.94) { const q = Math.floor(r() * 4) * 1.5708, d = 0.068 + r() * 0.05; put(o, i++, Math.cos(q) * d, Math.sin(q) * d, 0, 1, 3); }
    else put(o, i++, gauss(r) * 0.004, gauss(r) * 0.004, 0, 1, 3);
  }
  for (let k = 0; k < nBox; k++) {
    const cx = k & 1 ? 1 : -1, cy = k & 2 ? 1 : -1, d = r() * 0.24;
    put(o, i++, cx, cy, 0, 0, 4, d, k & 4 ? 0 : 1); // corner signs, distance along the arm, which arm
  }
  for (let ax = 0; ax < 3; ax++) for (let k = 0; k < nAxis; k++) put(o, i++, (k + 0.5) / nAxis, 0, 0, 0, 5, ax);
  // landmarks: a tight cluster reads as one brighter dot
  for (let k = 0; k < nv && i < N; k++) {
    for (let j = 0; j < perV && i < N; j++) {
      const jx = j ? gauss(r) * 0.003 : 0, jy = j ? gauss(r) * 0.003 : 0;
      put(o, i++, g.v[k * 3] + jx, g.v[k * 3 + 1] + jy, g.v[k * 3 + 2], g.blink[k], 0, 1, g.n[k * 3], g.n[k * 3 + 1]);
    }
  }
  // everything else is spent on the edges, evenly along their length
  const budget = N - i;
  let acc = 0;
  for (let e = 0; e < ne; e++) {
    const before = Math.floor(acc);
    acc += (g.len[e] / g.total) * budget;
    const cnt = e === ne - 1 ? N - i : Math.floor(acc) - before;
    const a = g.edges[e * 2], b = g.edges[e * 2 + 1], kind = g.rim[e] ? 0.5 : 0;
    for (let k = 0; k < cnt && i < N; k++) {
      const t = (k + 0.5) / cnt, s = 1 - t;
      put(o, i++, g.v[a * 3] * s + g.v[b * 3] * t, g.v[a * 3 + 1] * s + g.v[b * 3 + 1] * t, g.v[a * 3 + 2] * s + g.v[b * 3 + 2] * t,
        g.blink[a] * s + g.blink[b] * t, 0, kind, g.n[a * 3] * s + g.n[b * 3] * t, g.n[a * 3 + 1] * s + g.n[b * 3 + 1] * t);
    }
  }
  return o;
}

/* ---------- 3: candlestick landscape ---------- */
export const CANDLE_ROWS = 3, CANDLE_COLS = 12;
/**
 * Three price series receding in depth. Each is drawn as candles (body + wick), a moving-average
 * line through the closes and volume bars on the floor. e0: 0 body, 1 wick, 2 floor, 3 average, 4 volume.
 */
export function genCandles(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  const total = CANDLE_ROWS * CANDLE_COLS;
  const per = Math.floor((N * 0.56) / total);
  const perVol = Math.floor((N * 0.12) / total);
  const perAvg = Math.floor((N * 0.12) / CANDLE_ROWS);
  let i = 0;
  const HW = 0.15, SPAN = 5.6, FLOOR = -1.62;
  const cx = (c: number) => (c / (CANDLE_COLS - 1) - 0.5) * SPAN;
  for (let row = 0; row < CANDLE_ROWS; row++) {
    const z = (row / (CANDLE_ROWS - 1) - 0.5) * 3.4;
    const oc: number[][] = [];
    let price = 0, lo = 1e9, hi = -1e9;
    const drift = 0.05 + (r() - 0.5) * 0.08;
    for (let c = 0; c < CANDLE_COLS; c++) {
      const open = price, close = open + (r() < 0.5 ? -1 : 1) * (0.22 + Math.abs(gauss(r)) * 0.3) + drift + 0.2 * Math.sin(c * 0.8 + row * 1.7);
      const h = Math.max(open, close) + Math.abs(gauss(r)) * 0.22, l = Math.min(open, close) - Math.abs(gauss(r)) * 0.22;
      oc.push([open, close, h, l]);
      price = close;
      lo = Math.min(lo, l); hi = Math.max(hi, h);
    }
    const sc = 2.9 / Math.max(0.5, hi - lo), ny = (v: number) => -1.3 + (v - lo) * sc;
    for (let c = 0; c < CANDLE_COLS; c++) {
      const [open, close, h, l] = oc[c];
      const x = cx(c);
      const y0 = ny(Math.min(open, close)), y1 = Math.max(ny(Math.max(open, close)), y0 + 0.12);
      const mid = (y0 + y1) / 2, sgn = close >= open ? 1 : -1, ph = r(), col = c / (CANDLE_COLS - 1);
      for (let k = 0; k < per; k++) {
        const v = r();
        if (v < 0.16) put(o, i++, x + gauss(r) * 0.005, ny(l) + r() * (ny(h) - ny(l)), z + gauss(r) * 0.005, mid, 1, sgn, col, ph); // wick
        else if (v < 0.74) { // the 12 edges, so the body reads as a box
          const e = Math.floor(r() * 12), t = r() * 2 - 1, a = e & 1 ? 1 : -1, b = e & 2 ? 1 : -1;
          if (e < 4) put(o, i++, x + a * HW, mid + (t * (y1 - y0)) / 2, z + b * HW, mid, 0, sgn, col, ph);
          else if (e < 8) put(o, i++, x + t * HW, a > 0 ? y1 : y0, z + b * HW, mid, 0, sgn, col, ph);
          else put(o, i++, x + a * HW, b > 0 ? y1 : y0, z + t * HW, mid, 0, sgn, col, ph);
        } else { // faces
          const f = Math.floor(r() * 4), t = r() * 2 - 1, yy = y0 + r() * (y1 - y0);
          if (f < 2) put(o, i++, x + (f ? HW : -HW), yy, z + t * HW, mid, 0, sgn, col, ph);
          else put(o, i++, x + t * HW, yy, z + (f === 2 ? HW : -HW), mid, 0, sgn, col, ph);
        }
      }
      // volume bar on the floor
      const vol = 0.08 + Math.min(0.5, Math.abs(close - open) * sc * 0.45 + r() * 0.1);
      for (let k = 0; k < perVol; k++) put(o, i++, x + (r() * 2 - 1) * HW * 0.8, FLOOR + r() * vol, z + gauss(r) * 0.01, FLOOR, 4, sgn, col, ph);
    }
    // moving average through the closes
    const avg = oc.map((_, c) => { let a = 0, n = 0; for (let k = Math.max(0, c - 2); k <= c; k++) { a += oc[k][1]; n++; } return ny(a / n) + 0.02; });
    for (let k = 0; k < perAvg; k++) {
      const f = r() * (CANDLE_COLS - 1), c = Math.floor(f), t = f - c;
      const y = avg[c] + (avg[Math.min(CANDLE_COLS - 1, c + 1)] - avg[c]) * (t * t * (3 - 2 * t));
      put(o, i++, cx(0) + (f / (CANDLE_COLS - 1)) * SPAN, y, z, y, 3, 0, f / (CANDLE_COLS - 1), r());
    }
  }
  // the floor: a line under each series and cross lines, like chart paper
  for (; i < N; ) {
    if (r() < 0.55) { const row = Math.floor(r() * CANDLE_ROWS); put(o, i++, (r() - 0.5) * (SPAN + 0.8), FLOOR, (row / (CANDLE_ROWS - 1) - 0.5) * 3.4, 0, 2, 0, r()); }
    else { const c = Math.floor(r() * 11); put(o, i++, (c / 10 - 0.5) * (SPAN + 0.8), FLOOR, (r() - 0.5) * 4, 0, 2, 0, c / 10); }
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

/**
 * Generators write points group by group. Shuffling the records means a reduced draw range
 * (the low-quality fallback) thins every part of a form evenly instead of cutting off whole groups.
 */
function shuffle(o: Float32Array, r: Rnd): Float32Array {
  const n = o.length / STRIDE, tmp = new Float32Array(STRIDE);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    if (i === j) continue;
    tmp.set(o.subarray(i * STRIDE, i * STRIDE + STRIDE));
    o.copyWithin(i * STRIDE, j * STRIDE, j * STRIDE + STRIDE);
    o.set(tmp, j * STRIDE);
  }
  return o;
}

/** every shape except the wordmark (index 1 is left empty for the caller) */
export function buildShapes(N: number, seed = 1234): Float32Array[] {
  const mk = (n: number) => mulberry32(seed + n * 101);
  const out: Float32Array[] = new Array(FORM_COUNT);
  out[FORM.stars] = genStars(N, mk(0));
  out[FORM.face] = genFace(N, mk(2));
  out[FORM.candles] = genCandles(N, mk(3));
  out[FORM.voice] = genVoice(N, mk(4));
  out[FORM.pipeline] = genPipeline(N, mk(5));
  out[FORM.docs] = genDocs(N, mk(6));
  out[FORM.pulse] = genPulse(N, mk(7));
  const sr = mulberry32(seed + 9001);
  for (const f of [FORM.face, FORM.candles, FORM.voice, FORM.pipeline, FORM.docs, FORM.pulse]) shuffle(out[f], sr);
  return out;
}
