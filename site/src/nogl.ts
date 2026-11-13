/**
 * Without WebGL (or with only a software rasteriser) the particle scene never starts. Each section that owns a
 * form gets a still line drawing of it instead, so the page keeps its pictures. Fetched only in that case.
 */
import { FACE_V, FACE_T } from './gl/facemesh';
import { mulberry32 } from './gl/shapes';

const f = (n: number) => n.toFixed(1);
const line = (x1: number, y1: number, x2: number, y2: number, c = 'a') => `<path class="${c}" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"/>`;
const circle = (x: number, y: number, r: number, c = 'a') => `<circle class="${c}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;

function face(): string {
  const nv = FACE_V.length / 3, px = new Float32Array(nv), py = new Float32Array(nv), pz = new Float32Array(nv);
  const yaw = 0.42, cs = Math.cos(yaw), sn = Math.sin(yaw), S = 0.2;
  for (let i = 0; i < nv; i++) {
    const x = FACE_V[i * 3], y = FACE_V[i * 3 + 1] + 57, z = FACE_V[i * 3 + 2] - 300;
    px[i] = 200 + (x * cs + z * sn) * S; py[i] = 196 - y * S; pz[i] = -x * sn + z * cs;
  }
  const seen = new Set<number>();
  let d = '';
  for (let t = 0; t < FACE_T.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = FACE_T[t + k], b = FACE_T[t + ((k + 1) % 3)], key = a < b ? a * 1000 + b : b * 1000 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      d += `M${f(px[a])} ${f(py[a])}L${f(px[b])} ${f(py[b])}`;
    }
  }
  let dots = '';
  for (let i = 0; i < nv; i++) if (pz[i] > -120) dots += `M${f(px[i])} ${f(py[i])}h.01`;
  // detection brackets around the head, the tracker's frame
  const B = (x: number, y: number, sx: number, sy: number) => `M${x} ${y + 22 * sy}V${y}H${x + 22 * sx}`;
  const box = B(40, 22, 1, 1) + B(360, 22, -1, 1) + B(40, 372, 1, -1) + B(360, 372, -1, -1);
  return `<path class="a thin" d="${d}"/><path class="a dot" d="${dots}"/><path class="c" d="${box}"/>`;
}

function candles(): string {
  const r = mulberry32(21);
  let s = '', price = 240, ma = '';
  for (let i = 0; i < 16; i++) {
    const x = 34 + i * 22, open = price, close = Math.max(50, Math.min(300, price + (r() - 0.5) * 150 - 5));
    const hi = Math.min(open, close) - 6 - r() * 30, lo = Math.max(open, close) + 6 + r() * 30, up = close < open;
    s += line(x, hi, x, lo, up ? 'b' : 'c');
    s += `<rect class="${up ? 'b' : 'c'}" x="${f(x - 6)}" y="${f(Math.min(open, close))}" width="12" height="${f(Math.max(3, Math.abs(close - open)))}"/>`;
    s += `<rect class="d" x="${f(x - 6)}" y="${f(372 - 8 - r() * 30)}" width="12" height="${f(8 + r() * 30)}"/>`;
    ma += `${i ? 'L' : 'M'}${f(x)} ${f((open + close) / 2 - 14 + Math.sin(i * 0.7) * 8)}`;
    price = close;
  }
  return s + `<path class="a" d="${ma}"/>` + line(22, 372, 378, 372, 'd');
}

function voice(): string {
  let s = '';
  for (let k = 0; k < 3; k++) {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * Math.PI * 2;
      const rr = 118 + k * 22 + Math.sin(t * 5 + k) * (10 - k * 2) + Math.sin(t * 11 + k * 2) * (6 - k) + Math.sin(t * 2) * 6;
      d += `${i ? 'L' : 'M'}${f(200 + Math.cos(t) * rr)} ${f(200 + Math.sin(t) * rr)}`;
    }
    s += `<path class="${k === 0 ? 'a' : k === 1 ? 'b' : 'd'}" d="${d}Z"/>`;
  }
  return s;
}

function pipeline(): string {
  let s = '';
  for (let row = 0; row < 3; row++) {
    const y = 110 + row * 90, off = row * 14;
    s += line(40 + off, y, 360 - off * 0.2, y + 26, 'a');
    for (let i = 0; i < 6; i++) {
      const t = i / 5, x = 40 + off + (320 - off * 1.2) * t;
      s += circle(x, y + 26 * t, 9, i === 5 ? 'c' : 'a');
    }
  }
  return s;
}

function docs(): string {
  const r = mulberry32(8);
  let s = '<rect class="d" x="70" y="30" width="260" height="340" rx="6"/>';
  for (let i = 0; i < 22; i++) {
    const y = 58 + i * 13.6, w = 90 + r() * 130, v = r();
    s += line(92, y, 92 + w, y, v < 0.62 ? 'a' : v < 0.84 ? 'd' : 'c');
  }
  return s;
}

function pulse(): string {
  let s = circle(200, 200, 10, 'c fill');
  for (let i = 1; i <= 5; i++) s += `<circle class="${i < 3 ? 'c' : 'd'}" cx="200" cy="200" r="${24 + i * 30}" opacity="${f(1 - i * 0.15)}"/>`;
  return s;
}

const DRAW: Record<string, () => string> = { face, candles, voice, pipeline, docs, pulse };

export function drawFallback(main: HTMLElement) {
  main.querySelectorAll<HTMLElement>('.sec[data-form]').forEach((sec) => {
    const make = DRAW[sec.dataset.form || ''];
    const kind = sec.dataset.kind;
    if (!make || (kind !== 'left' && kind !== 'right') || sec.querySelector(':scope > .form-svg')) return;
    const holder = document.createElement('div');
    holder.className = `form-svg form-svg-${kind}`;
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = `<svg viewBox="0 0 400 400" fill="none" stroke-linecap="round" stroke-linejoin="round">${make()}</svg>`;
    sec.prepend(holder);
  });
}
