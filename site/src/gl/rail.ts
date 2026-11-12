/**
 * The world the camera travels through. Every section that owns a form is a station with a
 * position in world space; consecutive sections that show the same form share a station.
 * Stations step away in depth, except the experience timeline, which runs sideways (older = left)
 * so the camera tracks along it.
 */
import { mulberry32, type FormName } from './shapes';

export type Kind = 'hero' | 'left' | 'right' | 'center';
export interface Station { form: FormName; kind: Kind; year?: string }
export type V3 = [number, number, number];

export const CAM_Z = 8;
const STEP_Z = 16;
const STEP_X = 15;

/** world position of each station, and whether the step into it was a lateral (timeline) one */
export function placeStations(st: Station[]): { w: V3; lateral: boolean }[] {
  const out: { w: V3; lateral: boolean }[] = [];
  let k = 0;
  let w: V3 = [0, 0, 0];
  for (let i = 0; i < st.length; i++) {
    let lateral = false;
    if (i > 0 && st[i].form !== st[i - 1].form) {
      lateral = !!st[i].year && !!st[i - 1].year;
      if (lateral) w = [w[0] - STEP_X, w[1], w[2]];
      else {
        k++;
        w = [w[0] + Math.sin(k * 1.9) * 4.5, w[1] + Math.cos(k * 2.1) * 1.6, w[2] - STEP_Z];
      }
    } else if (i > 0) lateral = out[i - 1].lateral;
    out.push({ w: [w[0], w[1], w[2]], lateral });
  }
  return out;
}

export interface SceneryInput {
  stations: Station[];
  places: { w: V3; lateral: boolean }[];
  /** x offset of the form inside its station (from the layout) */
  formX: number[];
  dust: number;
  wide: boolean;
  /** returns sampled glyph points for a short label: xy pairs, cap height 1, plus the width */
  label: (text: string) => { pts: number[]; w: number } | null;
}

/** static points: dust along the route (parallax while the camera moves) and the timeline with its years */
export function buildScenery(inp: SceneryInput): { pos: Float32Array; ext: Float32Array } {
  const r = mulberry32(4242);
  const P: number[] = [], E: number[] = [];
  const push = (x: number, y: number, z: number, size: number, alpha: number, tone: number) => { P.push(x, y, z); E.push(size, alpha, tone); };
  const { stations, places } = inp;

  // distinct stations, in order
  const idx: number[] = [];
  places.forEach((p, i) => { if (i === 0 || stations[i].form !== stations[i - 1].form) idx.push(i); });

  // dust: a loose tube around every leg of the route (and around a lone station)
  const legs = Math.max(1, idx.length - 1);
  const per = Math.floor(inp.dust / legs);
  for (let l = 0; l < legs; l++) {
    const a = places[idx[l]].w, b = places[idx[Math.min(idx.length - 1, l + 1)]].w;
    for (let j = 0; j < per; j++) {
      const t = idx.length === 1 ? 0.5 : -0.25 + r() * 1.5;
      const x = a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 26;
      const y = a[1] + (b[1] - a[1]) * t + (r() - 0.5) * 15;
      const z = a[2] + (b[2] - a[2]) * t + (r() - 0.5) * 16 - 3;
      const bright = r() < 0.04;
      push(x, y, z, bright ? 1.5 : 0.45 + r() * 0.7, bright ? 0.8 : 0.14 + r() * 0.3, bright ? 0.9 : r() < 0.3 ? r() : -1);
    }
  }

  // timeline: a dotted line under the forms of every dated station, with ticks and the year
  const dated = idx.filter((i) => stations[i].year);
  if (dated.length) {
    const y0 = inp.wide ? -2.08 : -0.82;
    const dim = inp.wide ? 1 : 0.55;
    const xs = dated.map((i) => places[i].w[0]);
    const lo = Math.min(...xs) - 9, hi = Math.max(...xs) + 9;
    const base = places[dated[0]].w;
    for (let x = lo; x <= hi; x += 0.075) {
      const edge = Math.min(1, (x - lo) / 3, (hi - x) / 3);
      push(x, base[1] + y0, base[2], 0.7, 0.5 * edge * dim, 0.5);
    }
    for (let x = Math.ceil(lo / 1.5) * 1.5; x <= hi; x += 1.5) {
      const edge = Math.min(1, (x - lo) / 3, (hi - x) / 3);
      const major = Math.abs((x / 1.5) % 5) < 0.01;
      const h = major ? 0.3 : 0.14;
      for (let k = 0; k < (major ? 14 : 7); k++) push(x, base[1] + y0 + (k / (major ? 14 : 7)) * h, base[2], 0.7, 0.55 * edge * dim, 0.5);
    }
    let lastYear = '';
    for (const i of dated) {
      const year = stations[i].year!;
      if (year === lastYear) continue;
      lastYear = year;
      const g = inp.label(year);
      if (!g) continue;
      const H = 0.34;
      const cx = places[i].w[0] + inp.formX[i];
      const n = g.pts.length / 2;
      const want = Math.min(n, 900);
      for (let k = 0; k < want; k++) {
        const q = Math.floor(r() * n);
        push(cx + (g.pts[q * 2] - g.w / 2) * H, places[i].w[1] + y0 + 0.2 + g.pts[q * 2 + 1] * H, places[i].w[2], 0.75, 0.85 * dim, 0.95);
      }
      // a marker dot on the line under the year
      for (let k = 0; k < 40; k++) {
        const a = r() * 6.2832, rr = Math.sqrt(r()) * 0.07;
        push(cx + Math.cos(a) * rr, places[i].w[1] + y0 + Math.sin(a) * rr, places[i].w[2], 0.9, 0.9 * dim, 0.97);
      }
    }
  }
  return { pos: new Float32Array(P), ext: new Float32Array(E) };
}
