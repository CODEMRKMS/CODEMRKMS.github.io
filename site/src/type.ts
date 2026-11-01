import gsap from 'gsap';
import type Lenis from 'lenis';

/**
 * The type idea: Anybody's width axis opens with scroll velocity and settles back.
 * Applied directly to the few `.display` elements, so no page-wide style recalculation.
 */
export function initWidthAxis(lenis: Lenis) {
  let amount = 0;
  let last = -1;
  const REST = 92, OPEN = 20;
  gsap.ticker.add(() => {
    const target = Math.min(1, Math.abs(lenis.velocity) / 34);
    amount += (target - amount) * (target > amount ? 0.18 : 0.07);
    const w = REST + OPEN * amount;
    if (Math.abs(w - last) < 0.15) return;
    last = w;
    document.querySelectorAll<HTMLElement>('.display').forEach((el) => {
      el.style.fontVariationSettings = `"wdth" ${w.toFixed(1)}`;
    });
  });
}
