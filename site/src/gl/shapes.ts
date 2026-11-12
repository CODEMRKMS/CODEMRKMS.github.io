/**
 * Procedural point targets for every form. Pure functions (no DOM) so they can run in a worker.
 * Each shape is a Float32Array of N * 8:  [x, y, z, tone, e0, e1, e2, e3]
 * "tone" and the extras are interpreted by the matching branch in vert.glsl.
 */

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

/* ---------- 2: face mesh with tracked eyes and gaze lines ---------- */
/** half-width of the face outline at height y (y runs from -1 at the chin to 1 at the crown) */
function faceHalf(y: number) {
  if (y >= 0.15) return 0.74 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.15) / 0.85, 2)));
  const s = Math.min(1, (0.15 - y) / 1.15);
  return 0.74 * (1 - 0.42 * Math.pow(s, 1.5)) * Math.sqrt(Math.max(0, 1 - Math.pow(s, 8)));
}
const g2 = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-Math.pow((x - cx) / sx, 2) - Math.pow((y - cy) / sy, 2));
/** depth of the face surface at (x, y): an ellipsoid with a nose, sockets, brow, cheeks, lips and chin */
function faceZ(x: number, y: number) {
  const hw = Math.max(0.02, faceHalf(y));
  const u = Math.min(1, Math.abs(x) / hw);
  let z = 0.62 * Math.pow(Math.max(0, 1 - u * u), 0.42) * (1 - 0.28 * y * y);
  const ax = Math.abs(x);
  // nose: a ridge that grows from the bridge to the tip, then tucks under
  const ny = Math.max(0, Math.min(1, (0.24 - y) / 0.46));
  const under = 1 - Math.max(0, Math.min(1, (-0.2 - y) / 0.08));
  if (y < 0.3 && y > -0.3) z += (0.04 + 0.24 * ny * ny) * under * Math.exp(-Math.pow(x / (0.06 + 0.07 * ny), 2));
  z -= 0.085 * g2(ax, y, 0.3, 0.2, 0.17, 0.1); // eye sockets
  z += 0.045 * Math.exp(-Math.pow((y - 0.36) / 0.07, 2)) * (ax < 0.56 ? 1 : 0); // brow ridge
  z += 0.04 * g2(ax, y, 0.46, -0.04, 0.16, 0.16); // cheekbones
  z += 0.055 * g2(x, y, 0, -0.5, 0.24, 0.075); // lips
  z += 0.05 * g2(x, y, 0, -0.84, 0.2, 0.1); // chin
  return z;
}
export const EYE_X = 0.3, EYE_Y = 0.2, EYE_Z = faceZ(0.3, 0.2) + 0.03;
const inEye = (x: number, y: number) => Math.pow((Math.abs(x) - EYE_X) / 0.165, 2) + Math.pow((y - EYE_Y) / 0.075, 2) < 1;

export function genFace(N: number, r: Rnd): Float32Array {
  const o = new Float32Array(N * STRIDE);
  let i = 0;
  const take = (f: number) => Math.floor(N * f);
  const onFace = (x: number, y: number, tone: number, kind: number, lift = 0.012) => put(o, i++, x, y, faceZ(x, y) + lift, tone, 0, kind);

  // the mesh: lines of constant height and meridians that converge at the crown and the chin
  const ROWS = 23, COLS = 15;
  const rowY = (k: number) => -0.95 + (1.9 * k) / (ROWS - 1);
  const colU = (k: number) => -0.93 + (1.86 * k) / (COLS - 1);
  for (let n = take(0.4); n > 0; n--) {
    let x: number, y: number;
    do {
      if (r() < 0.52) { y = rowY(Math.floor(r() * ROWS)); x = (r() * 2 - 1) * 0.97 * faceHalf(y); }
      else { y = -0.97 + r() * 1.94; x = colU(Math.floor(r() * COLS)) * faceHalf(y); }
    } while (inEye(x, y));
    onFace(x, y, 0.1 + r() * 0.16, 0, 0);
  }
  // tracked landmarks sit on the mesh crossings
  for (let n = take(0.08); n > 0; n--) {
    let x: number, y: number;
    do { y = rowY(Math.floor(r() * ROWS)); x = colU(Math.floor(r() * COLS)) * faceHalf(y); } while (inEye(x, y));
    const a = r() * 6.2832, rr = Math.sqrt(r()) * 0.011;
    onFace(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.5, 1);
  }
  // outline
  for (let n = take(0.07); n > 0; n--) {
    const y = -1 + r() * 2, sgn = r() < 0.5 ? -1 : 1;
    put(o, i++, sgn * faceHalf(y), y, -0.02, 0.36, 0, 2);
  }
  // eyelids
  for (let n = take(0.05); n > 0; n--) {
    const sgn = r() < 0.5 ? -1 : 1, d = (r() * 2 - 1) * 0.16, q = Math.pow(Math.max(0, 1 - Math.pow(d / 0.16, 2)), 0.8);
    onFace(sgn * (EYE_X + d), EYE_Y + (r() < 0.58 ? 0.072 : -0.05) * q, 0.52, 2);
  }
  // brows
  for (let n = take(0.035); n > 0; n--) {
    const sgn = r() < 0.5 ? -1 : 1, t = r();
    onFace(sgn * (0.13 + 0.38 * t), 0.37 + 0.05 * Math.sin(Math.PI * Math.pow(t, 0.8)) - 0.03 * t + (r() - 0.5) * 0.022 * (1 - t * 0.6), 0.5, 2);
  }
  // nose: two lines down from the bridge, the wings and the tip
  for (let n = take(0.04); n > 0; n--) {
    const sgn = r() < 0.5 ? -1 : 1, v = r();
    if (v < 0.55) { const t = r(); onFace(sgn * (0.045 + 0.07 * t * t), 0.22 - 0.44 * t, 0.46, 2); }
    else if (v < 0.85) { const a = -0.3 + r() * 3.2; onFace(sgn * (0.1 + Math.cos(a) * 0.045), -0.25 - Math.sin(a) * 0.04, 0.46, 2); }
    else { const a = Math.PI + r() * Math.PI; onFace(Math.cos(a) * 0.055, -0.245 + Math.sin(a) * 0.03, 0.46, 2); }
  }
  // lips
  for (let n = take(0.045); n > 0; n--) {
    const x = (r() * 2 - 1) * 0.25, q = Math.pow(Math.max(0, 1 - Math.pow(x / 0.25, 2)), 0.7), v = r();
    const y = v < 0.36 ? -0.5 + 0.05 * q * (1 - 0.4 * Math.exp(-Math.pow(x / 0.045, 2))) : v < 0.66 ? -0.502 - 0.012 * q : -0.5 - 0.068 * q;
    onFace(x, y, 0.5, 2);
  }
  // irises: stored relative to the eye centre so the shader can turn them
  for (let n = take(0.04); n > 0; n--) {
    const sgn = r() < 0.5 ? -1 : 1, a = r() * 6.2832;
    const rr = r() < 0.6 ? 0.058 + (r() - 0.5) * 0.008 : Math.sqrt(r()) * 0.026;
    put(o, i++, Math.cos(a) * rr, Math.sin(a) * rr, 0, 0.95, 1, sgn);
  }
  // gaze lines: one per eye, e1 is the distance along the line
  for (let n = take(0.13); n > 0; n--) {
    const t = Math.pow(r(), 0.8);
    put(o, i++, gauss(r) * 0.012, gauss(r) * 0.012, gauss(r) * 0.012, 0.45 + 0.5 * t, 2, t, r() < 0.5 ? -1 : 1);
  }
  // the point being looked at: a ring and a cross
  for (let n = take(0.02); n > 0; n--) {
    const v = r(), a = r() * 6.2832;
    if (v < 0.6) put(o, i++, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, 1, 3);
    else { const d = (r() * 2 - 1) * 0.16; put(o, i++, v < 0.8 ? d : 0, v < 0.8 ? 0 : d, 0, 1, 3); }
  }
  // ultrasonic proximity pulses around the head
  for (; i < N; ) {
    const ph = r() * 6.2831853, j = Math.floor(r() * 3);
    put(o, i++, Math.cos(ph), Math.sin(ph), 0, 0.3, 4, j / 3 + r() * 0.002);
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
