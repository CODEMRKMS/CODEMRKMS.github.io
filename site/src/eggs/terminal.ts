/**
 * The backtick terminal: a modal <dialog> (focus trap and Esc come with it) docked to the bottom of the screen.
 * Everything it says about me is copy that already exists on the pages.
 */
import type { EggApi } from './index';
import { confetti } from './confetti';

const WHO = [
  'Mohammed Shadab',
  'I build systems that turn noisy signals into decisions, from edge AI and NLP to DevOps.',
  'B.Tech student in Computer and Communication Engineering at MIT Manipal. In summer 2026 I was a DevOps intern at Volvo Group.',
];
const PROJECTS: [string, string, string][] = [
  ['AI-proctored exam', '/work/proctoring/', 'Edge AI on an Android phone that watches gaze, head pose, sound and typing, and locks the device down while the exam runs.'],
  ['Sentiment-driven quant trading', '/work/quant-trading/', 'A framework that reads market commentary, tests 100+ strategies against it, and routes live orders with risk limits.'],
  ['VoicePay', '/work/voicepay/', 'A multilingual, voice-first UPI payment SDK for mobile apps and IVR systems, built for Amazon HackOn Season 5.'],
];
const HELLO = 'If you are building something where the data is messy and the answer still has to be clear, I would like to hear about it.';
const MAIL = 'itskmshadab@gmail.com';
const HELP: [string, string][] = [
  ['help', 'this list'], ['whoami', 'who made this'], ['projects', 'selected work'], ['resume', 'open the PDF'],
  ['sudo hire-me', 'say hello'], ['theme', 'switch Daylight / Night'], ['matrix', 'rain'], ['drone', 'fly-past (home page, top)'], ['exit', 'close (Esc works too)'],
];

let dlg: HTMLDialogElement | null = null;

export function terminalOpen() { return !!dlg?.open; }
export function closeTerminal() { dlg?.close(); }

export function openTerminal(api: EggApi) {
  if (dlg) { if (!dlg.open) dlg.showModal(); return; }
  const d = document.createElement('dialog');
  dlg = d;
  d.className = 'term';
  d.setAttribute('aria-label', 'Terminal');
  d.setAttribute('data-lenis-prevent', '');
  d.innerHTML =
    '<div class="term-bar"><span>shadab@portfolio</span><button type="button" class="term-x">Close</button></div>' +
    '<canvas class="term-rain" aria-hidden="true"></canvas>' +
    '<div class="term-log" role="log" aria-live="polite" aria-label="Terminal output" tabindex="0"></div>' +
    '<form class="term-in"><label class="sr-only" for="term-cmd">Command</label><span aria-hidden="true">$</span>' +
    '<input id="term-cmd" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></form>';
  document.body.appendChild(d);
  const log = d.querySelector<HTMLElement>('.term-log')!;
  const input = d.querySelector<HTMLInputElement>('input')!;
  const rain = d.querySelector<HTMLCanvasElement>('.term-rain')!;
  const history: string[] = [];
  let at = 0;
  let timers: number[] = [];

  const out = (text: string, cls = '') => {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    return p;
  };
  const link = (label: string, href: string, newTab = false) => {
    const p = document.createElement('p'), a = document.createElement('a');
    a.href = href; a.textContent = label;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    p.appendChild(a); log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  };
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };

  const matrix = () => {
    if (api.reduced) { out('matrix stays off while reduced motion is on.'); return; }
    const ctx = rain.getContext('2d');
    if (!ctx) return;
    const w = (rain.width = d.clientWidth), h = (rain.height = d.clientHeight);
    const cols = Math.floor(w / 14), drops = Array.from({ length: cols }, () => Math.random() * -30);
    const col = getComputedStyle(document.documentElement).getPropertyValue('--p2').trim() || '#2bb3a3';
    rain.classList.add('on');
    let n = 0;
    const id = window.setInterval(() => {
      ctx.fillStyle = 'rgba(8, 10, 14, 0.14)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = col; ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
      for (let i = 0; i < cols; i++) {
        ctx.fillText(String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96)), i * 14, drops[i] * 16);
        drops[i] = drops[i] * 16 > h && Math.random() > 0.96 ? 0 : drops[i] + 1;
      }
      if (++n > 150) { window.clearInterval(id); rain.classList.remove('on'); ctx.clearRect(0, 0, w, h); }
    }, 45);
    timers.push(id);
  };

  const forcePush = () => {
    api.mark('force');
    // the pipeline in the scene plays it out if it is on this page; the log tells the same story either way
    const sec = document.querySelector<HTMLElement>('[data-form="pipeline"]');
    if (sec && !api.reduced) {
      if (api.lenis) api.lenis.scrollTo(sec, { offset: -window.innerHeight * 0.1 }); else sec.scrollIntoView();
    }
    out('Azure Pipelines: run started');
    later(sec ? 1400 : 300, () => {
      api.field?.forcePush();
      out('build ........ passed');
      later(500, () => out('test ......... failed', 'term-bad'));
      later(1300, () => out('rolling back to the last green build'));
      later(2900, () => out('build ........ passed'));
      later(3400, () => out('test ......... passed', 'term-good'));
      later(3900, () => out('pipeline green. Maybe not --force next time.', 'term-good'));
    });
  };

  const run = (raw: string) => {
    const cmd = raw.trim().replace(/\s+/g, ' ');
    out('$ ' + raw, 'term-echo');
    if (!cmd) return;
    history.push(raw); at = history.length;
    const c = cmd.toLowerCase();
    if (c === 'help' || c === '?') HELP.forEach(([k, v]) => out(k.padEnd(14) + v));
    else if (c === 'whoami') WHO.forEach((l) => out(l));
    else if (c === 'projects' || c === 'ls') PROJECTS.forEach(([t, href, l]) => { link(t, href); out(l, 'term-dim'); });
    else if (c === 'resume') { link('Download my resume (PDF)', '/resume.pdf', true); window.open('/resume.pdf', '_blank', 'noopener'); }
    else if (c === 'sudo hire-me' || c === 'sudo hire me') {
      api.mark('hire');
      if (!api.reduced) confetti();
      out(HELLO); link(MAIL, 'mailto:' + MAIL);
    } else if (c === 'hire-me' || c === 'hire me') out('Permission denied. Try: sudo hire-me');
    else if (c === 'theme') {
      document.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
      out(document.documentElement.dataset.theme === 'day' ? 'Daylight' : 'Night');
    } else if (c === 'matrix') matrix();
    else if (c === 'drone') {
      if (api.reduced) out('the drone stays grounded while reduced motion is on.');
      else void import('./drone').then((m) => {
        if (m.flyDrone(api)) { api.mark('drone'); d.close(); } else out('the drone launches from the name: go to the top of the home page.');
      });
    }
    else if (c === 'exit' || c === 'quit' || c === ':q') d.close();
    else if (c === 'clear') log.textContent = '';
    else if (/^git push (--force|-f)\b/.test(c) || c === 'git push origin main --force') forcePush();
    else out(`${cmd.split(' ')[0]}: command not found. Try help.`);
  };

  d.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; run(v); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && at > 0) { e.preventDefault(); input.value = history[--at]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(history.length, at + 1); input.value = history[at] ?? ''; }
    else if (e.key === '`' && !input.value) { e.preventDefault(); d.close(); }
  });
  d.querySelector('.term-x')!.addEventListener('click', () => d.close());
  // a click on the backdrop closes; a click on a page link closes so the page change is visible
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
    else if ((e.target as Element).closest('a')) d.close();
    else if (!(e.target as Element).closest('a, button, input') && !String(window.getSelection())) input.focus();
  });
  d.addEventListener('close', () => { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; rain.classList.remove('on'); });

  out('Type help for the commands. Esc closes.', 'term-dim');
  d.showModal();
  input.focus();
}
