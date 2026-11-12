import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type Lenis from 'lenis';
import type { PointField, Target, Kind } from './gl/field';
import type { FormName } from './gl/shapes';
import { startMic } from './mic';
import { trackDisplays } from './type';

gsap.registerPlugin(ScrollTrigger, SplitText);

export interface Ctx { field: PointField | null; lenis: Lenis | null; reduced: boolean }
export interface PageHandle { destroy(): void }

const TEXT_SEL = 'h1,h2,h3,p,li,dt,dd,figcaption,.fig-n';

export function splitLines(el: HTMLElement) {
  return SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'ln', aria: 'none' });
}
export function inView(el: Element, margin = 0.96) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight * margin && r.height > 0;
}
/** leaf text blocks (an li that holds a p is not a leaf), skipping visually hidden ones */
export function textBlocks(root: Element): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(TEXT_SEL)).filter((e) => !e.closest('.sr-only') && !e.classList.contains('sr-only'));
  return all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
}

export function readTarget(main: Element): Target {
  const el = main.querySelector<HTMLElement>('[data-form]');
  return { form: (el?.dataset.form as FormName) || 'stars', kind: ((el?.dataset.kind as Kind) || 'center') };
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
      const st = splitLines(el);
      if (!st.lines.length) { st.revert(); return; }
      gsap.set(st.lines, { yPercent: 110 });
      const rec = { el, st, revealed: false };
      splits.push(rec);
      triggers.push(
        ScrollTrigger.create({
          trigger: el, start: 'top 90%', once: true,
          onEnter: () => {
            rec.revealed = true;
            if (rec.st.lines.length) gsap.to(rec.st.lines, { yPercent: 0, duration: 0.95, stagger: 0.07, ease: 'power3.out' });
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
          if (!r.revealed) { r.st = splitLines(r.el); if (r.st.lines.length) gsap.set(r.st.lines, { yPercent: 110 }); }
        });
        ScrollTrigger.refresh();
      }, 260);
    };
    window.addEventListener('resize', onResize, { passive: true });
    cleanups.push(() => window.removeEventListener('resize', onResize));
  }

  /* ----- forms follow the sections ----- */
  if (field) {
    main.querySelectorAll<HTMLElement>('[data-form]').forEach((sec) => {
      const target: Target = { form: sec.dataset.form as FormName, kind: (sec.dataset.kind as Kind) || 'center' };
      const go = () => field.go(target);
      triggers.push(ScrollTrigger.create({ trigger: sec, start: 'top 58%', end: 'bottom 58%', onEnter: go, onEnterBack: go }));
    });
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
    // slow star parallax follows page progress
    triggers.push(ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => field.setScroll(self.progress * 2.2) }));
    field.setSection(0);
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
      if (!near || !mq.matches || field.target.form !== 'stars') { if (stage.classList.contains('is-placed')) stage.classList.remove('is-placed'); return; }
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
