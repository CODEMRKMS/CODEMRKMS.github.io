import type { PointField } from './gl/field';

/** ?fps: frame time, quality tier and particle count, refreshed a few times a second */
export function initFps(field: PointField) {
  const el = document.createElement('pre');
  el.className = 'fps';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  const paint = () => {
    const s = field.stats();
    el.textContent =
      `${s.ms.toFixed(1)} ms  (${Math.round(1000 / s.ms)} fps, worst ${s.worst.toFixed(0)} ms)\n` +
      `tier ${s.tier}  level ${s.step + 1}/${s.steps}\n` +
      `${s.points.toLocaleString('en')} points  dpr ${s.dpr.toFixed(2)}  bloom ${s.bloom || 'off'}`;
  };
  paint();
  setInterval(paint, 300);
}
