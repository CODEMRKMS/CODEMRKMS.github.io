import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type Lenis from 'lenis';
import type { PointField, Kind, Station } from './gl/field';
import type { FormName } from './gl/shapes';
import { startMic } from './mic';
import { trackDisplays } from './type';
import { countUps, hover } from './motion';

gsap.registerPlugin(ScrollTrigger, SplitText);

export interface Ctx { field: PointField | null; lenis: Lenis | null; reduced: boolean }
export interface PageHandle { destroy(): void }

const TEXT_SEL = 'h1,h2,h3,p,li,dt,dd,figcaption,.fig-n';

export function splitLines(el: HTMLElement) {
  return SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'ln', aria: 'none' });
}
/** headings come in letter by letter inside their line masks; the heading keeps its text as its accessible name */
function splitHeading(el: HTMLElement) {
  return SplitText.create(el, { type: 'lines,chars', mask: 'lines', linesClass: 'ln', aria: 'auto' });
}
const isHeading = (el: HTMLElement) => el.classList.contains('display');
const pieces = (el: HTMLElement, st: SplitText) => (isHeading(el) ? st.chars : st.lines);
export function inView(el: Element, margin = 0.96) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight * margin && r.height > 0;
}
/** leaf text blocks (an li that holds a p is not a leaf), skipping visually hidden ones */
export function textBlocks(root: Element): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(TEXT_SEL)).filter((e) => !e.closest('.sr-only') && !e.classList.contains('sr-only'));
  // stat blocks move as one piece (and count up on their own), so their text is not split
  return all.filter((e) => !e.closest('.fig') && !all.some((o) => o !== e && e.contains(o)));
}

/** the sections that own a form, in page order: these are the stations the camera visits */
export function readStations(main: Element): { els: HTMLElement[]; stations: Station[] } {
  const els = Array.from(main.querySelectorAll<HTMLElement>('[data-form]'));
  return { els, stations: els.map((el) => ({ form: el.dataset.form as FormName, kind: (el.dataset.kind as Kind) || 'center', year: el.dataset.t })) };
}

export function initPage(main: HTMLElement, ctx: Ctx, opts: { first: boolean }): PageHandle {
  const { field, reduced } = ctx;
  const cleanups: (() => void)[] = [];
  trackDisplays(main);
  const triggers: ScrollTrigger[] = [];
  const splits: { el: HTMLElement; st: SplitText; revealed: boolean }[] = [];

  /* ----- below-the-fold headings assemble by masked line (everything else stays still) ----- */
  const prepareReveals = () => {
    main.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
      if (inView(el)) return; // first-screen text is handled by the intro / the router
      const st = isHeading(el) ? splitHeading(el) : splitLines(el);
      if (!st.lines.length) { st.revert(); return; }
      gsap.set(pieces(el, st), { yPercent: 110 });
      const rec = { el, st, revealed: false };
      splits.push(rec);
      triggers.push(
        ScrollTrigger.create({
          trigger: el, start: 'top 90%', once: true,
          onEnter: () => {
            rec.revealed = true;
            const head = isHeading(rec.el), ps = pieces(rec.el, rec.st);
            if (ps.length) gsap.to(ps, { yPercent: 0, duration: head ? 0.8 : 0.95, stagger: head ? 0.022 : 0.07, ease: 'power3.out' });
          },
        }),
      );
    });
  };
  if (!reduced) {
    prepareReveals();
    let t: number;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        splits.forEach((r) => {
          r.st.revert();
          if (!r.revealed) { r.st = isHeading(r.el) ? splitHeading(r.el) : splitLines(r.el); if (r.st.lines.length) gsap.set(pieces(r.el, r.st), { yPercent: 110 }); }
        });
        ScrollTrigger.refresh();
      }, 260);
    };
    window.addEventListener('resize', onResize, { passive: true });
    cleanups.push(() => window.removeEventListener('resize', onResize));
  }

  if (!reduced) {
    triggers.push(...countUps(main));
    cleanups.push(hover(main));
  }

  /* ----- forms follow the sections ----- */
  if (field) {
    // One scrubbed trigger maps scroll to a position on the route. Each station hands over to the next
    // in a band around the moment the next section's top crosses 55% of the viewport.
    const { els, stations } = readStations(main);
    field.setScore(stations);
    let bounds: number[] = [], halves: number[] = [];
    const measure = () => {
      const vh = window.innerHeight, sy = window.scrollY;
      const maxS = Math.max(vh * 0.12, document.documentElement.scrollHeight - vh - 2);
      bounds = els.map((el, i) => (i === 0 ? -1e9 : Math.min(maxS, Math.max(vh * 0.12, el.getBoundingClientRect().top + sy - vh * 0.55))));
      halves = bounds.map((b, i) => {
        if (i === 0) return 1;
        let h = Math.min(vh * 0.34, b);
        if (i > 1) h = Math.min(h, (b - bounds[i - 1]) / 2);
        if (i < bounds.length - 1) h = Math.min(h, (bounds[i + 1] - b) / 2);
        return Math.max(1, h);
      });
    };
    const posAt = (y: number) => {
      let u = 0;
      for (let i = 1; i < bounds.length; i++) u += Math.max(0, Math.min(1, (y - (bounds[i] - halves[i])) / (2 * halves[i])));
      return u;
    };
    measure();
    field.setPos(posAt(window.scrollY), true);
    triggers.push(ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: (self) => { field.setPos(posAt(self.scroll())); field.setScroll(self.progress * 2.2); },
      onRefresh: (self) => { measure(); field.setPos(posAt(self.scroll())); },
    }));
    // document sorting is scrubbed by scroll through its section
    main.querySelectorAll<HTMLElement>('[data-scrub]').forEach((sec) => {
      triggers.push(
        ScrollTrigger.create({
          trigger: sec, start: 'top 55%', end: 'bottom 70%',
          onUpdate: (self) => field.setSection(self.progress),
          onLeave: () => field.setSection(1),
          onLeaveBack: () => field.setSection(0),
        }),
      );
    });
    field.setSection(0);

    // stacked layouts: tell the field which rows of the screen hold copy, so the form is only drawn in the clear above it
    const blocks = Array.from(main.children) as HTMLElement[];
    let lastY = -1, lastN = false, age = 0;
    const bands = () => {
      const narrow = field.narrow, y = window.scrollY;
      if (narrow === lastN && y === lastY && age++ < 20) return;
      lastN = narrow; lastY = y; age = 0;
      if (!narrow) { field.setBands([]); return; }
      const vh = window.innerHeight, rows: [number, number][] = [];
      for (const sec of blocks) {
        const sr = sec.getBoundingClientRect();
        if (sr.bottom < 0 || sr.top > vh) continue;
        for (const el of Array.from(sec.children)) {
          const r = el.getBoundingClientRect();
          if (r.height < 4 || r.bottom < 0 || r.top > vh) continue;
          rows.push([r.top - 8, r.bottom + 8]);
        }
      }
      rows.sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const r of rows) {
        const m = merged[merged.length - 1];
        if (m && r[0] - m[1] < 56) m[1] = Math.max(m[1], r[1]); else merged.push([r[0], r[1]]);
      }
      // at most three rows reach the shader; if there are more, the gaps between the last ones close
      while (merged.length > 3) { const b = merged.pop()!; merged[merged.length - 1][1] = b[1]; }
      field.setBands(merged.flat());
    };
    bands();
    gsap.ticker.add(bands);
    cleanups.push(() => gsap.ticker.remove(bands));
  }

  /* ----- award labels sit on their stars (desktop only; on phones the list just flows) ----- */
  const stage = main.querySelector<HTMLElement>('[data-constellation]');
  if (stage && field) {
    const items = Array.from(stage.querySelectorAll<HTMLElement>('[data-star]'));
    const pt = { x: 0, y: 0 };
    const mq = window.matchMedia('(min-width: 900px)');
    let near = false;
    const io = new IntersectionObserver((en) => { near = en[en.length - 1].isIntersecting; }, { rootMargin: '20% 0px' });
    io.observe(stage);
    cleanups.push(() => io.disconnect());
    const place = () => {
      const at = field.resting;
      if (!near || !mq.matches || !at || at.form !== 'stars' || at.kind !== 'hero') { if (stage.classList.contains('is-placed')) stage.classList.remove('is-placed'); return; }
      stage.classList.add('is-placed');
      const r = stage.getBoundingClientRect();
      for (const li of items) {
        field.projectStar(Number(li.dataset.star), pt);
        li.style.transform = `translate(${(pt.x - r.left).toFixed(1)}px, ${(pt.y - r.top).toFixed(1)}px)`;
      }
    };
    gsap.ticker.add(place);
    cleanups.push(() => gsap.ticker.remove(place));
  }

  /* ----- page widgets ----- */
  main.querySelectorAll<HTMLElement>('[data-email]').forEach((a) => {
    const on = () => field?.setBeatFast(true), off = () => field?.setBeatFast(false);
    a.addEventListener('pointerenter', on); a.addEventListener('pointerleave', off);
    a.addEventListener('focus', on); a.addEventListener('blur', off);
    cleanups.push(() => field?.setBeatFast(false));
  });

  const speak = main.querySelector<HTMLButtonElement>('[data-speak]');
  if (speak && field) {
    const status = main.querySelector<HTMLElement>('[data-speak-status]');
    let stop: (() => void) | null = null;
    const say = (s: string) => { if (status) status.textContent = s; };
    speak.addEventListener('click', async () => {
      if (stop) { stop(); stop = null; field.setMic(null); speak.setAttribute('aria-pressed', 'false'); speak.textContent = 'Speak'; say('Showing a simulated voice.'); return; }
      try {
        stop = await startMic((v) => field.setMic(v));
        speak.setAttribute('aria-pressed', 'true'); speak.textContent = 'Stop';
        say('Listening. The ring follows your voice. Nothing is recorded or sent anywhere.');
      } catch {
        field.setMic(null);
        say('Microphone not available, so the ring keeps showing a simulated voice.');
      }
    });
    cleanups.push(() => { stop?.(); field.setMic(null); });
  }

  // layout changes after fonts/images settle
  void document.fonts?.ready.then(() => ScrollTrigger.refresh());
  const img = main.querySelectorAll('img');
  img.forEach((i) => i.addEventListener('load', () => ScrollTrigger.refresh(), { once: true }));
  void opts;

  return {
    destroy() {
      triggers.forEach((t) => t.kill());
      splits.forEach((r) => r.st.revert());
      cleanups.forEach((c) => c());
    },
  };
}
