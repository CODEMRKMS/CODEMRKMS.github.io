/**
 * Easter eggs. This module is fetched when the page is idle and only wires up listeners; the terminal,
 * the letter pile and the confetti are fetched the first time they are used.
 * With reduced motion only the console greeting and the terminal remain.
 */
import type Lenis from 'lenis';
import type { PointField } from '../gl/field';
import { initCount, mark as markFound, total, available, EGGS, type Egg } from './count';

export interface EggApi { field: PointField | null; lenis: Lenis | null; reduced: boolean; mark(id: Egg): void }

let toastEl: HTMLElement | null = null;
let toastT = 0;
function toast(text: string) {
  if (!toastEl) {
    toastEl = document.createElement('p');
    toastEl.className = 'egg-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => toastEl?.classList.remove('on'), 2600);
}

function greet(api: EggApi) {
  const amber = 'color:#f2a541;font:700 13px/1.25 ui-monospace,Menlo,Consolas,monospace';
  const plain = 'color:inherit;font:13px/1.6 system-ui,sans-serif';
  const art = [
    ' __  __   ___ ',
    '|  \\/  | / __|   Mohammed Shadab',
    '| |\\/| | \\__ \\   signal from noise',
    '|_|  |_| |___/',
  ].join('\n');
  console.log(`%c${art}`, amber);
  console.log('%cRecruiters: the short version is at /resume.pdf, and itskmshadab@gmail.com reaches me.', plain);
  console.log('%cThere is a terminal on the page: press the backtick key (`). Typing hi here counts as finding this.', plain);
  try {
    Object.defineProperty(window, 'hi', { configurable: true, get() { api.mark('console'); return 'hello. Now try the backtick key on the page.'; } });
  } catch { /* someone else owns window.hi */ }
}

export function initEggs(base: { field: PointField | null; lenis: Lenis | null; reduced: boolean }) {
  const { field, reduced } = base;
  const api: EggApi = {
    ...base,
    mark(id) { if (markFound(id)) toast(`eggs found: ${total()}/${available()}`); },
  };
  // only count what this browser can find: reduced motion keeps the console and the terminal, no scene drops the scene's eggs
  const can: readonly Egg[] = reduced ? ['console', 'terminal', 'hire', 'force']
    : field ? EGGS : EGGS.filter((e) => !['away', 'eyes', 'volatile', 'drone'].includes(e));
  initCount(() => { if (!reduced) void import('./confetti').then((m) => m.confetti(260)); }, can);
  // the 404 game reports itself from the page code
  window.addEventListener('egg', (e) => api.mark((e as CustomEvent<Egg>).detail));
  greet(api);

  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let k = 0;
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    if (e.key === '`' || e.code === 'Backquote') {
      e.preventDefault();
      api.mark('terminal');
      void import('./terminal').then((m) => m.openTerminal(api));
      return;
    }
    if (reduced) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    k = key === KONAMI[k] ? k + 1 : key === KONAMI[0] ? 1 : 0;
    if (k === KONAMI.length) {
      k = 0;
      api.mark('konami');
      void import('./pile').then((m) => m.startPile(api));
    }
  });

  // selecting a real stretch of copy gets a nod, once per visit (not one of the counted eight)
  if (!reduced) {
    let t = 0, said = false;
    document.addEventListener('selectionchange', () => {
      if (said) return;
      clearTimeout(t);
      t = window.setTimeout(() => {
        const s = document.getSelection();
        const inMain = !!s && !!s.anchorNode && !!document.getElementById('main')?.contains(s.anchorNode);
        if (inMain && s!.toString().trim().length >= 24) { said = true; toast('signal selected'); api.mark('select'); }
      }, 600);
    });
  }

  if (!field || reduced) return;
  // coming back to the tab while the proctor is watching
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || field.eggState().form !== 'face') return;
    field.lookAway();
    api.mark('away');
    toast('caught you looking away');
  });
  // two things the scene already does: the eyes follow the cursor, and fast scrolling makes the candles volatile
  let watched = 0;
  const poll = window.setInterval(() => {
    const s = field.eggState();
    if (s.form === 'face' && s.gaze > 0.8) { watched += 0.4; if (watched > 2.4) api.mark('eyes'); }
    if (s.form === 'candles' && s.vol > 0.45) api.mark('volatile');
    if (total() === available()) window.clearInterval(poll);
  }, 400);
  // five clicks on the particle name send a drone out of it
  let clicks = 0, lastClick = 0;
  document.addEventListener('click', (e) => {
    const r = field.nameRect();
    if (!r || (e.target as Element).closest('a, button, input, dialog, .pile')) { clicks = 0; return; }
    if (e.clientX < r.x0 || e.clientX > r.x1 || e.clientY < r.y0 || e.clientY > r.y1) { clicks = 0; return; }
    clicks = e.timeStamp - lastClick < 1500 ? clicks + 1 : 1;
    lastClick = e.timeStamp;
    if (clicks >= 5) { clicks = 0; void import('./drone').then((m) => { if (m.flyDrone(api)) api.mark('drone'); }); }
  });
}
