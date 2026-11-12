import gsap from 'gsap';

/**
 * A noise dissolve for DOM content: a set of tiling masks, each letting a little more of a noise field
 * through, stepped across the element. 0 is fully hidden, 1 fully shown.
 */
const STEPS = 12, SIZE = 192, CELL = 3;
let tiles: string[] | null = null;

function build(): string[] {
  const n = SIZE / CELL, noise = new Float32Array(n * n);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d')!;
  const out: string[] = [];
  for (let s = 1; s < STEPS; s++) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (noise[y * n + x] < s / STEPS) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    out.push(`url(${cv.toDataURL('image/png')})`);
  }
  return out;
}

function apply(el: HTMLElement, v: number) {
  const s = Math.round(v * STEPS), st = el.style;
  if (s <= 0) { st.visibility = 'hidden'; return; }
  st.visibility = 'visible';
  const img = s >= STEPS ? '' : tiles![s - 1];
  st.setProperty('-webkit-mask-image', img); st.setProperty('mask-image', img);
  st.setProperty('-webkit-mask-size', img ? `${SIZE}px ${SIZE}px` : ''); st.setProperty('mask-size', img ? `${SIZE}px ${SIZE}px` : '');
}

export function dissolveEl(el: HTMLElement, from: number, to: number, duration: number): Promise<void> {
  try { tiles ??= build(); } catch { tiles = null; }
  if (!tiles) { el.style.visibility = to > 0.5 ? 'visible' : 'hidden'; return Promise.resolve(); }
  const o = { v: from };
  apply(el, from);
  return new Promise<void>((done) => { gsap.to(o, { v: to, duration, ease: 'none', onUpdate: () => apply(el, o.v), onComplete: () => { apply(el, to); done(); } }); });
}
