/** A burst of particles in the site's three colours, drawn on a throwaway 2D canvas above the page. */
export function confetti(count = 170) {
  const cv = document.createElement('canvas');
  cv.className = 'egg-confetti';
  cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const cols = ['--p1', '--p2', '--p3'].map((v) => css.getPropertyValue(v).trim() || '#f2a541');
  const ps = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = 420 + Math.random() * 760;
    return { x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.72, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.5 + Math.random() * 3, c: cols[i % 3], s: Math.random() * 6.28 };
  });
  let last = performance.now(), age = 0;
  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; age += dt;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 1500 * dt; p.vx *= 1 - 0.9 * dt;
      p.x += p.vx * dt + Math.sin(age * 9 + p.s) * 0.6; p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - age / 2.6);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    if (age < 2.6) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
