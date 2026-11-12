import gsap from 'gsap';
import type { FaceHud, PointField } from './gl/field';

/**
 * The tracker's read-out beside the face mesh: confidence above the detection box, pose and gaze below it.
 * Decorative, so it is hidden from assistive tech, and it is never created on the low tier.
 */
export function initFaceHud(field: PointField) {
  if (field.low) return;
  const el = document.createElement('div');
  el.className = 'hud';
  el.setAttribute('aria-hidden', 'true');
  const a = document.createElement('p'), b = document.createElement('p');
  el.append(a, b);
  document.body.appendChild(el);
  const o: FaceHud = { yaw: 0, pitch: 0, gx: 0, gy: 0, conf: 0, fps: 0, x0: 0, y0: 0, x1: 0, y1: 0, kind: 'right' };
  const sign = (v: number, d: number) => (v < 0 ? '\u2212' : '+') + Math.abs(v).toFixed(d);
  let on = false, last = -1;
  gsap.ticker.add((time) => {
    const show = field.faceHud(o);
    if (show !== on) { on = show; el.classList.toggle('on', on); }
    if (!on) return;
    a.style.transform = `translate(${o.x0.toFixed(1)}px, ${(o.y0 - 22).toFixed(1)}px)`;
    // the lower block hangs from the corner of the box that is away from the copy
    b.style.transform = o.kind === 'left' ? `translate(${o.x0.toFixed(1)}px, ${(o.y1 + 8).toFixed(1)}px)` : `translate(${o.x1.toFixed(1)}px, ${(o.y1 + 8).toFixed(1)}px) translateX(-100%)`;
    b.style.textAlign = o.kind === 'left' ? 'left' : 'right';
    if (time - last < 0.12) return;
    last = time;
    a.textContent = `face ${o.conf.toFixed(2)}`;
    b.textContent = `yaw ${sign(o.yaw, 1)}\u00b0  pitch ${sign(o.pitch, 1)}\u00b0\ngaze ${sign(o.gx, 2)}, ${sign(o.gy, 2)}\n${Math.round(o.fps)} fps`;
  });
}
