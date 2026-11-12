import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Stat figures count up when they come into view. The real value stays readable throughout: it is in a
 * visually hidden span while the visible digits run, and the element is put back exactly as it was at the end.
 */
export function countUps(root: HTMLElement): ScrollTrigger[] {
  const out: ScrollTrigger[] = [];
  root.querySelectorAll<HTMLElement>('.fig-n').forEach((el) => {
    const final = el.textContent ?? '';
    const m = /^(\D*)([\d,]+)(.*)$/.exec(final);
    if (!m) return;
    const target = Number(m[2].replace(/,/g, ''));
    const fmt = (v: number) => (m[2].includes(',') ? v.toLocaleString('en-US') : String(v));
    out.push(ScrollTrigger.create({
      trigger: el, start: 'top 92%', once: true,
      onEnter: () => {
        const w = el.getBoundingClientRect().width;
        const sr = document.createElement('span'), vis = document.createElement('span');
        sr.className = 'sr-only'; sr.textContent = final;
        vis.setAttribute('aria-hidden', 'true'); vis.style.display = 'inline-block'; vis.style.minWidth = `${w}px`;
        vis.textContent = m[1] + fmt(0) + m[3];
        el.replaceChildren(sr, vis);
        const o = { v: 0 };
        gsap.to(o, {
          v: target, duration: 1.3, ease: 'power2.out', delay: 0.15,
          onUpdate: () => { vis.textContent = m[1] + fmt(Math.round(o.v)) + m[3]; },
          onComplete: () => { el.textContent = final; },
        });
      },
    }));
  });
  return out;
}

/** Magnetic buttons and tilt, for mice and trackpads. Returns a cleanup. */
export function hover(root: HTMLElement): () => void {
  if (!fine()) return () => {};
  const offs: (() => void)[] = [];
  const on = (el: HTMLElement, move: (e: PointerEvent, r: DOMRect) => void, leave: () => void, props: string) => {
    let r: DOMRect | null = null;
    const enter = () => { r = el.getBoundingClientRect(); };
    const mv = (e: PointerEvent) => { if (!r) r = el.getBoundingClientRect(); move(e, r); };
    const lv = () => { r = null; leave(); };
    el.addEventListener('pointerenter', enter); el.addEventListener('pointermove', mv); el.addEventListener('pointerleave', lv);
    offs.push(() => {
      el.removeEventListener('pointerenter', enter); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerleave', lv);
      gsap.killTweensOf(el); gsap.set(el, { clearProps: props });
    });
  };
  // buttons and calls to action lean towards the pointer
  root.querySelectorAll<HTMLElement>('.btn, .cta, .mail, .theme-toggle').forEach((el) => {
    const qx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' }), qy = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' });
    on(el, (e, r) => { qx((e.clientX - (r.left + r.width / 2)) * 0.3); qy((e.clientY - (r.top + r.height / 2)) * 0.4); }, () => { qx(0); qy(0); }, 'x,y');
  });
  // stat blocks, the next-project link and the portrait tilt under the pointer
  root.querySelectorAll<HTMLElement>('.fig, .next-link, .portrait').forEach((el) => {
    const max = el.classList.contains('next-link') ? 5 : 9;
    gsap.set(el, { transformPerspective: 700 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' }), ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    on(el, (e, r) => { ry(((e.clientX - r.left) / r.width - 0.5) * 2 * max); rx(-((e.clientY - r.top) / r.height - 0.5) * 2 * max); }, () => { rx(0); ry(0); }, 'rotationX,rotationY,transformPerspective,transform');
  });
  return () => offs.forEach((f) => f());
}
