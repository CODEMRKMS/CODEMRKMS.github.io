import gsap from 'gsap';

/**
 * Custom cursor for mice and trackpads. It names what a click will do (view a case study, open something
 * in a new tab, drag a letter). Text fields, the terminal and keyboard navigation get the native cursor back.
 */
export function initCursor() {
  const root = document.documentElement;
  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  el.appendChild(label);
  document.body.appendChild(el);
  const qx = gsap.quickTo(el, 'x', { duration: 0.16, ease: 'power3.out' }), qy = gsap.quickTo(el, 'y', { duration: 0.16, ease: 'power3.out' });
  let state = '', shown = false;

  const set = (s: string) => {
    if (s === state) return;
    state = s;
    el.dataset.state = s;
    label.textContent = s === 'view' || s === 'open' || s === 'drag' ? s : '';
  };
  const show = (v: boolean) => {
    if (v === shown) return;
    shown = v;
    root.classList.toggle('has-cursor', v);
  };
  const stateFor = (t: Element | null): string => {
    if (!t) return '';
    if (t.closest('input, textarea, select, [contenteditable], dialog')) return 'native';
    if (t.closest('.pile-l')) return 'drag';
    const a = t.closest('a');
    if (a) {
      const href = a.getAttribute('href') ?? '';
      if (a.target === '_blank' || href.startsWith('mailto:') || href.endsWith('.pdf')) return 'open';
      if (href.startsWith('/work/') || a.classList.contains('next-link')) return 'view';
      return 'link';
    }
    return t.closest('button, [role="button"], summary') ? 'link' : '';
  };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') { show(false); return; }
    const s = stateFor(e.target as Element | null);
    if (s === 'native') { show(false); return; }
    if (!shown) { gsap.set(el, { x: e.clientX, y: e.clientY }); show(true); }
    qx(e.clientX); qy(e.clientY);
    set(s);
  }, { passive: true });
  window.addEventListener('pointerdown', () => el.classList.add('down'), { passive: true });
  window.addEventListener('pointerup', () => el.classList.remove('down'), { passive: true });
  // keyboard use: the focus ring is the pointer now
  window.addEventListener('keydown', (e) => { if (e.key === 'Tab') show(false); });
  document.addEventListener('pointerleave', () => show(false));
  window.addEventListener('blur', () => show(false));
}
