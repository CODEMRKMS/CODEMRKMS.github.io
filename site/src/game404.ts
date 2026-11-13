/**
 * The 404 page's game, "signal from noise": 30 seconds to catch the amber signals drifting among grey noise.
 * Pointer, touch or arrow keys / WASD. Fetched only when the Play button is pressed.
 */
export interface Game { stop(): void }

const DURATION = 30;

export function startGame(stage: HTMLElement, onEnd: (score: number, best: number) => void): Game {
  stage.hidden = false;
  stage.textContent = '';
  const cv = document.createElement('canvas');
  cv.tabIndex = 0;
  cv.setAttribute('role', 'application');
  cv.setAttribute('aria-label', 'Game area. Move the ring with the mouse, a finger, or the arrow keys, and catch the amber signals. Escape ends the game.');
  stage.appendChild(cv);
  const g = cv.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  const size = () => {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(120, r.width); H = Math.max(120, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  };
  size();

  const css = getComputedStyle(document.documentElement);
  let col = { fg: '#ece8e1', dim: '#a9a8ae', amber: '#f2a541', teal: '#2bb3a3' };
  const readColours = () => {
    const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
    col = { fg: v('--fg', col.fg), dim: v('--fg-2', col.dim), amber: v('--accent', col.amber), teal: v('--p2', col.teal) };
  };
  readColours();

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const noise = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-26, 26), vy: rnd(-26, 26), r: rnd(1, 2.2) }));
  interface Sig { x: number; y: number; vx: number; vy: number; age: number; life: number }
  const sigs: Sig[] = [];
  const pops: { x: number; y: number; age: number }[] = [];
  const me = { x: W / 2, y: H / 2, r: 17 };
  const keys = new Set<string>();
  let score = 0, left = DURATION, spawn = 0.5, last = performance.now(), raf = 0, over = false, frame = 0;

  const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); me.x = e.clientX - r.left; me.y = e.clientY - r.top; };
  const kd = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { end(); return; }
    if (/^(Arrow(Up|Down|Left|Right)|[wasd])$/i.test(e.key)) { keys.add(e.key.toLowerCase()); e.preventDefault(); }
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const blur = () => keys.clear();
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerdown', move);
  cv.addEventListener('keydown', kd);
  cv.addEventListener('keyup', ku);
  cv.addEventListener('blur', blur);
  window.addEventListener('resize', size);

  function end() {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    let best = score;
    try { best = Math.max(score, Number(localStorage.getItem('g404')) || 0); localStorage.setItem('g404', String(best)); } catch { /* private mode */ }
    draw();
    onEnd(score, best);
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = col.dim;
    g.globalAlpha = 0.55;
    for (const n of noise) { g.beginPath(); g.arc(n.x, n.y, n.r, 0, 6.2832); g.fill(); }
    for (const s of sigs) {
      const k = Math.min(1, s.age / 0.25) * Math.min(1, (s.life - s.age) / 0.5);
      g.globalAlpha = Math.max(0, k);
      g.fillStyle = col.amber;
      g.beginPath(); g.arc(s.x, s.y, 4.5 + Math.sin(s.age * 9) * 1.2, 0, 6.2832); g.fill();
    }
    g.lineWidth = 2;
    for (const p of pops) {
      g.globalAlpha = Math.max(0, 1 - p.age / 0.45);
      g.strokeStyle = col.amber;
      g.beginPath(); g.arc(p.x, p.y, 10 + p.age * 90, 0, 6.2832); g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = col.teal;
    g.beginPath(); g.arc(me.x, me.y, me.r, 0, 6.2832); g.stroke();
    g.fillStyle = col.fg;
    g.font = '600 14px "Instrument Sans", system-ui, sans-serif';
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillText(`signals ${score}`, 14, 12);
    g.textAlign = 'right';
    g.fillText(over ? 'time' : `${Math.ceil(left)} s`, W - 14, 12);
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (frame++ % 45 === 0) readColours(); // follows a theme change
    left -= dt;
    const ax = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    const ay = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    me.x = Math.max(me.r, Math.min(W - me.r, me.x + ax * 340 * dt));
    me.y = Math.max(me.r, Math.min(H - me.r, me.y + ay * 340 * dt));
    for (const n of noise) {
      n.x = (n.x + n.vx * dt + W) % W; n.y = (n.y + n.vy * dt + H) % H;
    }
    spawn -= dt;
    if (spawn <= 0 && sigs.length < 3) {
      sigs.push({ x: rnd(24, W - 24), y: rnd(40, H - 24), vx: rnd(-34, 34), vy: rnd(-34, 34), age: 0, life: rnd(2.2, 3.2) });
      spawn = rnd(0.55, 1.1);
    }
    for (let i = sigs.length - 1; i >= 0; i--) {
      const s = sigs[i];
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < 10 || s.x > W - 10) s.vx *= -1;
      if (s.y < 10 || s.y > H - 10) s.vy *= -1;
      if (Math.hypot(s.x - me.x, s.y - me.y) < me.r + 5) { score++; pops.push({ x: s.x, y: s.y, age: 0 }); sigs.splice(i, 1); }
      else if (s.age > s.life) sigs.splice(i, 1);
    }
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].age += dt; if (pops[i].age > 0.45) pops.splice(i, 1); }
    if (left <= 0) { left = 0; end(); return; }
    draw();
    raf = requestAnimationFrame(tick);
  }
  cv.focus({ preventScroll: true });
  raf = requestAnimationFrame((t) => { last = t; tick(t); });

  return {
    stop() {
      over = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      stage.textContent = '';
      stage.hidden = true;
    },
  };
}
