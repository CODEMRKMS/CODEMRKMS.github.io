/**
 * Click the name five times (or type `drone` in the terminal): the wordmark's particles assemble into a small
 * quadcopter seen from above, it hovers for a moment, flies off to the right, and the name re-forms.
 */
import gsap from 'gsap';
import type { EggApi } from './index';
import { mulberry32, STRIDE } from '../gl/shapes';

let flying = false;

/** N records: x y z tone, group (3 dust, 4 airframe, 5 rotors) size alpha 0 */
function genDrone(N: number): Float32Array {
  const r = mulberry32(404), d = new Float32Array(N * STRIDE);
  const hubs: [number, number][] = [[-0.95, 0.62], [0.95, 0.62], [-0.95, -0.62], [0.95, -0.62]];
  for (let i = 0; i < N; i++) {
    const o = i * STRIDE, pick = r();
    let x = 0, y = 0, z = 0, tone = 0.5, grp = 4, size = 0.8, alpha = 0.9;
    if (pick < 0.07) {                       // body: a rounded hull
      const a = r() * 6.2832, q = Math.sqrt(r());
      x = Math.cos(a) * 0.34 * q; y = Math.sin(a) * 0.22 * q; tone = 0.55;
    } else if (pick < 0.08) {                // camera at the nose
      const a = r() * 6.2832, q = Math.sqrt(r()) * 0.06;
      x = 0.3 + Math.cos(a) * q; y = Math.sin(a) * q; tone = 1; size = 1.1;
    } else if (pick < 0.14) {                // four arms
      const h = hubs[Math.floor(r() * 4)], t = 0.25 + r() * 0.75;
      x = h[0] * t + (r() - 0.5) * 0.03; y = h[1] * t + (r() - 0.5) * 0.03; tone = 0.3; size = 0.7;
    } else if (pick < 0.3) {                 // rotors: a bright rim and a faint disc
      const h = hubs[Math.floor(r() * 4)], a = r() * 6.2832, rim = r() < 0.55;
      const q = rim ? 0.4 + (r() - 0.5) * 0.02 : Math.sqrt(r()) * 0.4;
      x = h[0] + Math.cos(a) * q; y = h[1] + Math.sin(a) * q; grp = 5; tone = rim ? 0.95 : 0.7; size = rim ? 0.75 : 0.55; alpha = rim ? 0.9 : 0.35;
    } else {                                 // the rest of the name hangs in the air as dust
      x = (r() - 0.5) * 9; y = (r() - 0.5) * 5; z = (r() - 0.5) * 2; grp = 3; tone = r(); size = 0.5; alpha = 0.12;
    }
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = tone; d[o + 4] = grp; d[o + 5] = size; d[o + 6] = alpha;
  }
  return d;
}

/** false when it cannot fly right now (no scene, reduced motion, or the name is not on screen) */
export function flyDrone(api: EggApi): boolean {
  const field = api.field;
  if (!field || api.reduced || flying || !field.nameRect()) return false;
  if (!field.showToy(genDrone(field.N), [3, 2.2], 0.5, 1.1)) return false;
  flying = true;
  const s = { x: 0, y: 0, roll: 0, t: 0 };
  const tick = () => {
    s.t += 1 / 60;
    if (!field.toyOn) { done(); return; } // the reader scrolled away: the field has already let go
    field.setToy(s.x, s.y + 0.06 * Math.sin(s.t * 3.2), s.roll + 0.04 * Math.sin(s.t * 2.1), 0);
  };
  const tl = gsap.timeline();
  const done = () => { gsap.ticker.remove(tick); tl.kill(); flying = false; };
  gsap.ticker.add(tick);
  tl.to(s, { roll: -0.42, duration: 0.45, ease: 'power2.in' }, 2.5)
    .to(s, { x: 16, y: 2.6, duration: 1.05, ease: 'power2.in' }, 2.65)
    .call(() => field.hideToy(1.2), [], 3.75)
    .call(done, [], 5.1);
  return true;
}
