import gsap from 'gsap';
import type Lenis from 'lenis';

/**
 * The type idea: Anybody's width axis opens with scroll velocity and settles back.
 * Only headings that are on screen are written to, and the node list is cached per page.
 */
const visible = new Set<HTMLElement>();
let io: IntersectionObserver | null = null;

/** call after every page swap so the cached heading list matches the DOM */
export function trackDisplays(root: ParentNode = document) {
  io?.disconnect();
  visible.clear();
  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll<HTMLElement>('.display').forEach((el) => visible.add(el));
    return;
  }
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      if (e.isIntersecting) { visible.add(el); el.style.fontVariationSettings = `"wdth" ${last.toFixed(1)}`; }
      else visible.delete(el);
    }
  }, { rootMargin: '10% 0px' });
  root.querySelectorAll<HTMLElement>('.display').forEach((el) => io!.observe(el));
}

const REST = 92, OPEN = 20;
let last = REST;

export function initWidthAxis(lenis: Lenis) {
  let amount = 0;
  gsap.ticker.add(() => {
    const target = Math.min(1, Math.abs(lenis.velocity) / 34);
    amount += (target - amount) * (target > amount ? 0.18 : 0.07);
    const w = REST + OPEN * amount;
    if (Math.abs(w - last) < 0.15) return;
    last = w;
    const v = `"wdth" ${w.toFixed(1)}`;
    visible.forEach((el) => { el.style.fontVariationSettings = v; });
  });
}
