/**
 * Quality tiers. The tier is chosen once, from the GPU's name and the kind of device, and fixes how many
 * points are generated. Inside a tier a ladder of levels trades pixel ratio, bloom and the share of points
 * drawn; a 30-frame probe moves down the ladder when frames are slow and back up when there is headroom.
 */
export type Tier = 'high' | 'mid' | 'low';
/** dpr: pixel ratio cap; bloom: levels in the blur chain (0 = no post pass at all); draw: share of the points drawn */
export interface Level { dpr: number; bloom: number; draw: number }

const LADDER: Record<Tier, Level[]> = {
  high: [
    { dpr: 2, bloom: 4, draw: 1 }, { dpr: 1.5, bloom: 4, draw: 1 }, { dpr: 1.25, bloom: 3, draw: 1 }, { dpr: 1, bloom: 3, draw: 1 },
    { dpr: 1, bloom: 2, draw: 0.85 }, { dpr: 1, bloom: 0, draw: 0.7 }, { dpr: 1, bloom: 0, draw: 0.5 },
  ],
  mid: [
    { dpr: 1.5, bloom: 3, draw: 1 }, { dpr: 1.25, bloom: 3, draw: 1 }, { dpr: 1, bloom: 2, draw: 1 },
    { dpr: 1, bloom: 0, draw: 0.85 }, { dpr: 1, bloom: 0, draw: 0.6 },
  ],
  low: [
    { dpr: 1.5, bloom: 0, draw: 1 }, { dpr: 1.25, bloom: 0, draw: 1 }, { dpr: 1, bloom: 0, draw: 1 },
    { dpr: 1, bloom: 0, draw: 0.75 }, { dpr: 0.8, bloom: 0, draw: 0.55 },
  ],
};
const POINTS: Record<Tier, number> = { high: 40000, mid: 22000, low: 12000 };

const WINDOW = 30;

export function isSoftware(renderer: string) { return /swiftshader|llvmpipe|software|basic render/i.test(renderer); }

/** tier from the unmasked renderer string; falls back to cores and memory when the string says nothing useful */
export function detectTier(renderer: string): Tier {
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 8;
  const weak = cores <= 4 || mem <= 4;
  if (isSoftware(renderer)) return 'low';
  if (mobile) {
    const strong = /Apple|Adreno \(TM\) [78]\d\d|Mali-G7[1-9]|Mali-G[6-9]1\d|Immortalis|Xclipse/i.test(renderer);
    return strong && !weak ? 'mid' : 'low';
  }
  if (/NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro)|AMD Radeon|\bArc\b|Apple M\d|Apple GPU/i.test(renderer)) return weak ? 'mid' : 'high';
  if (/Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|Radeon/i.test(renderer)) return weak ? 'low' : 'mid';
  return weak ? 'mid' : 'high';
}

export class Quality {
  readonly tier: Tier;
  /** points generated for this session (the ladder only ever draws a share of them) */
  readonly points: number;
  /** index into the tier's ladder; 0 is the best */
  step: number;
  readonly software: boolean;
  private adaptive: boolean;
  private win: number[] = [];
  private refresh = 16.7; // best window average seen: an estimate of the display's frame interval
  private slow = 0;
  private good = 0;
  private wait = 6; // good windows needed before trying a step up; doubles every time a step up fails
  private sinceUp = 99;
  /** last window: average and worst frame time in ms */
  avg = 16.7;
  worst = 16.7;

  constructor(renderer: string) {
    const q = location.search;
    this.software = isSoftware(renderer);
    const forced = /[?&]tier=(high|mid|low)/.exec(q);
    this.tier = forced ? (forced[1] as Tier) : detectTier(renderer);
    this.adaptive = !/[?&]noadapt/.test(q);
    let n = POINTS[this.tier];
    this.step = 0;
    // a software rasteriser is slower than any GPU the tiers were written for
    if (this.software && !forced && !/[?&]n=/.test(q)) { n = 9000; this.step = 2; }
    // ?n=12000 forces a point count, for checking how a form reads on a small budget
    const pn = /[?&]n=(\d+)/.exec(q);
    if (pn) n = Math.max(2000, Math.min(60000, Number(pn[1])));
    this.points = n;
  }

  get level(): Level { return LADDER[this.tier][this.step]; }
  get steps() { return LADDER[this.tier].length; }

  /** feed one frame time; returns true when the level changed and the renderer has to be reconfigured */
  frame(dtMs: number): boolean {
    if (dtMs > 250 || dtMs <= 0) { this.win.length = 0; return false; } // a tab switch or a long task is not a slow GPU
    this.win.push(dtMs);
    if (this.win.length < WINDOW) return false;
    let sum = 0, worst = 0;
    for (const v of this.win) { sum += v; if (v > worst) worst = v; }
    this.win.length = 0;
    this.avg = sum / WINDOW; this.worst = worst;
    if (!this.adaptive) return false;
    this.refresh = Math.max(6.9, Math.min(this.refresh, this.avg));
    this.sinceUp++;
    if (this.avg > Math.max(20, this.refresh * 1.45)) {
      this.good = 0;
      if (++this.slow >= 2 && this.step < this.steps - 1) {
        this.slow = 0;
        // the level we just tried was too much: be slower to try it again
        if (this.sinceUp < 12) this.wait = Math.min(96, this.wait * 2);
        this.step++;
        return true;
      }
      return false;
    }
    this.slow = 0;
    if (this.avg < Math.max(17.8, this.refresh * 1.12)) {
      if (++this.good >= this.wait && this.step > 0) {
        this.good = 0; this.sinceUp = 0;
        this.step--;
        return true;
      }
    } else this.good = 0;
    return false;
  }
}
