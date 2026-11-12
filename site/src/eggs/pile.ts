/**
 * Konami code: the name falls into a pile of letters that can be dragged and thrown. Esc puts it back.
 * Letters are DOM elements moved by a small circle-based physics step; nothing here touches the WebGL scene
 * except asking it to hide its own particle wordmark while the letters are out.
 */
import gsap from 'gsap';
import type { EggApi } from './index';

interface Body { el: HTMLElement; x: number; y: number; vx: number; vy: number; a: number; va: number; r: number; hx: number; hy: number }

let active: (() => void) | null = null;

export function startPile(api: EggApi) {
  if (active) return;
  const W = () => window.innerWidth, H = () => window.innerHeight;
  const wrap = document.createElement('div');
  wrap.className = 'pile';
  const hint = document.createElement('button');
  hint.type = 'button'; hint.className = 'pile-hint'; hint.textContent = 'Drag the letters. Esc puts the name back.';
  wrap.appendChild(hint);
  document.body.appendChild(wrap);

  // lay the name out where the wordmark sits on the home page
  const wide = W() / H() > 1.05 && W() >= 900;
  const fs = wide ? Math.min(0.72 * W(), 1.32 * H()) / 5.9 : (0.9 * W()) / 5.9;
  const pad = Math.min(64, Math.max(20, W() * 0.04));
  const top = (wide ? 0.38 : 0.33) * H() - fs * 1.05;
  const bodies: Body[] = [];
  ['Mohammed', 'Shadab'].forEach((word, li) => {
    let x = pad;
    for (const ch of word) {
      const el = document.createElement('span');
      el.className = 'pile-l'; el.textContent = ch; el.style.fontSize = `${fs}px`; el.setAttribute('aria-hidden', 'true');
      wrap.appendChild(el);
      const w = el.offsetWidth, h = el.offsetHeight;
      const b: Body = { el, x: x + w / 2, y: top + li * fs * 1.02 + h / 2, vx: 0, vy: 0, a: 0, va: 0, r: Math.max(w, h * 0.62) * 0.4, hx: 0, hy: 0 };
      b.hx = b.x; b.hy = b.y;
      el.style.marginLeft = `${-w / 2}px`; el.style.marginTop = `${-h / 2}px`;
      bodies.push(b);
      x += w * 0.94;
    }
  });
  const draw = () => { for (const b of bodies) b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) rotate(${b.a.toFixed(3)}rad)`; };
  draw();
  api.field?.hideName(true);

  let grabbed: Body | null = null, px = 0, py = 0, falling = false;
  const step = (_t: number, dtMs: number) => {
    if (!falling) return;
    const sub = 2, dt = Math.min(0.033, dtMs / 1000) / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of bodies) {
        if (b === grabbed) { b.vx = (px - b.x) * 22; b.vy = (py - b.y) * 22; b.va *= 0.9; }
        else b.vy += 2800 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
        const floor = H() - b.r;
        if (b.y > floor) { b.y = floor; if (b.vy > 0) b.vy *= -0.3; b.vx *= 1 - 3 * dt; b.va += (b.vx / b.r - b.va) * Math.min(1, 8 * dt); }
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.4; }
        if (b.x > W() - b.r) { b.x = W() - b.r; b.vx = -Math.abs(b.vx) * 0.4; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.4; }
      }
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const A = bodies[i], B = bodies[j];
        const dx = B.x - A.x, dy = B.y - A.y, min = A.r + B.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
        const ka = A === grabbed ? 0 : B === grabbed ? 2 : 1, kb = 2 - ka;
        A.x -= nx * push * ka; A.y -= ny * push * ka; B.x += nx * push * kb; B.y += ny * push * kb;
        const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rel < 0) {
          const imp = -rel * 0.62;
          if (A !== grabbed) { A.vx -= nx * imp; A.vy -= ny * imp; A.va -= imp * 0.004; }
          if (B !== grabbed) { B.vx += nx * imp; B.vy += ny * imp; B.va += imp * 0.004; }
        }
      }
    }
    for (const b of bodies) { b.vx = Math.max(-4200, Math.min(4200, b.vx)); b.vy = Math.max(-4200, Math.min(4200, b.vy)); b.va *= 0.995; }
    draw();
  };
  gsap.ticker.add(step);
  const start = window.setTimeout(() => {
    falling = true;
    for (const b of bodies) { b.vx = (Math.random() - 0.5) * 260; b.vy = -Math.random() * 220; b.va = (Math.random() - 0.5) * 5; }
  }, 350);

  const down = (e: PointerEvent) => {
    const el = (e.target as Element).closest('.pile-l');
    const b = bodies.find((q) => q.el === el);
    if (!b) return;
    e.preventDefault();
    grabbed = b; px = e.clientX; py = e.clientY; falling = true;
    b.el.setPointerCapture(e.pointerId);
    b.el.classList.add('held');
  };
  const move = (e: PointerEvent) => { if (grabbed) { px = e.clientX; py = e.clientY; } };
  const up = () => { grabbed?.el.classList.remove('held'); grabbed = null; };
  wrap.addEventListener('pointerdown', down);
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);

  const restore = () => {
    if (!active) return;
    active = null;
    window.clearTimeout(start);
    gsap.ticker.remove(step);
    window.removeEventListener('keydown', key, true);
    hint.remove();
    gsap.to(bodies, {
      x: (i: number) => bodies[i].hx, y: (i: number) => bodies[i].hy, a: 0, duration: 0.75, ease: 'power3.inOut', stagger: 0.02, onUpdate: draw,
      onComplete: () => { api.field?.hideName(false); gsap.to(wrap, { opacity: 0, duration: 0.3, onComplete: () => wrap.remove() }); },
    });
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); restore(); } };
  window.addEventListener('keydown', key, true);
  hint.addEventListener('click', restore);
  active = restore;
}
