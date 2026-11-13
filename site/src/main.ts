import './styles/index.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type { PointField } from './gl/field';
import { initTheme } from './theme';
import { initWidthAxis } from './type';
import { Router } from './router';
import { initFaceHud } from './hud';
import { gpuAvailable } from './gl/quality';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function boot() {
  const canvas = document.getElementById('field') as HTMLCanvasElement | null;
  let hasGL = !!canvas && !!window.WebGLRenderingContext && (await gpuAvailable());
  let field: PointField | null = null;
  let mod: typeof import('./gl/field') | null = null;
  if (hasGL) {
    // three.js lives in its own chunk, fetched only now, after the page has painted
    mod = await import('./gl/field');
    hasGL = mod.webglAvailable();
  }

  if (!hasGL) {
    root.classList.remove('gl');
    root.classList.add('no-gl');
  } else {
    try {
      field = new mod!.PointField(canvas!, reduced);
    } catch {
      field = null;
      root.classList.remove('gl');
      root.classList.add('no-gl');
    }
  }

  // smooth scroll shares the GSAP ticker; native scrolling when motion is reduced
  let lenis: Lenis | null = null;
  if (!reduced) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.1, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.lagSmoothing(0);
    initWidthAxis(lenis);
  }
  gsap.ticker.add((time, dt) => {
    lenis?.raf(time * 1000);
    if (field) { field.setVelocity(lenis ? lenis.velocity : 0); field.tick(dt); }
  });

  // ?debug exposes the field for inspection from the console and the capture scripts
  if (field && /[?&](debug|fps)/.test(location.search)) (window as unknown as { __field: PointField }).__field = field;
  if (field && /[?&]fps/.test(location.search)) void import('./fps').then((m) => m.initFps(field!));
  initTheme((t, animate) => field?.setTheme(t, animate), reduced);

  const ctx = { field, lenis, reduced };
  const router = new Router(ctx);
  router.start();

  if (field) {
    // wait (briefly) for the display font so the wordmark is sampled from the real glyphs
    const fontReady = Promise.race([
      document.fonts.load('800 120px Anybody').catch(() => undefined),
      new Promise((r) => setTimeout(r, 900)),
    ]);
    await fontReady;
    await field.build('Anybody, "Arial Black", sans-serif');
    initFaceHud(field);
    const tl = field.intro();
    if (!reduced) {
      // skippable: any scroll, click, touch or key finishes the intro quickly
      const skip = () => { tl.timeScale(9); cleanup(); };
      const evs = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
      const cleanup = () => evs.forEach((e) => window.removeEventListener(e, skip));
      evs.forEach((e) => window.addEventListener(e, skip, { passive: true, once: true }));
      tl.eventCallback('onComplete', cleanup);
    }
    // re-resolve the section under the viewport after the intro (handles reloads mid-page)
    ScrollTrigger.refresh();
    root.classList.add('gl-ready');
  }
  root.classList.add('is-ready');
  // hover effects and the custom cursor are for mice and trackpads only, and never with reduced motion
  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    void import('./cursor').then((m) => m.initCursor());
    void import('./motion').then((m) => m.hover(document.querySelector<HTMLElement>('.site-header')!));
  }
  if (field && !reduced && window.matchMedia('(pointer: coarse)').matches) void import('./gyro').then((m) => m.initGyro(field!));
  // easter eggs are not needed to use the site: fetch them when the browser has nothing better to do
  const idle = window.requestIdleCallback ? (f: () => void) => window.requestIdleCallback(f, { timeout: 4000 }) : (f: () => void) => window.setTimeout(f, 1500);
  idle(() => void import('./eggs').then((m) => m.initEggs({ field, lenis, reduced })));
}

// Let the first paint (the real HTML text) happen, then start. Nothing here waits for window.load,
// so a slow third-party request or image can no longer hold the scene back.
const start = () => requestAnimationFrame(() => (window.requestIdleCallback ? window.requestIdleCallback(() => void boot(), { timeout: 400 }) : setTimeout(() => void boot(), 60)));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
