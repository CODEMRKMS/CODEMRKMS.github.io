export type Theme = 'night' | 'day';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'day' ? 'day' : 'night';
}

/** Wires the toggle button. The initial theme was already applied by the inline script in <head>. */
export function initTheme(onChange: (t: Theme, animate: boolean) => void, reduced = false) {
  const btn = document.querySelector<HTMLButtonElement>('.theme-toggle');
  const label = btn?.querySelector<HTMLElement>('[data-theme-label]');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const paint = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    if (label) label.textContent = t === 'night' ? 'Daylight' : 'Night';
    btn?.setAttribute('aria-label', t === 'night' ? 'Switch to daylight theme' : 'Switch to night theme');
    meta?.setAttribute('content', t === 'night' ? '#0C0E14' : '#F3EFE6');
  };
  let timer = 0;
  paint(currentTheme());
  onChange(currentTheme(), false);
  btn?.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'night' ? 'day' : 'night';
    // the colour tokens are registered properties, so they can travel with the scene's lighting for 1.6 s
    const root = document.documentElement;
    if (!reduced) {
      root.classList.add('theme-anim');
      clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.remove('theme-anim'), 1750);
    }
    paint(next);
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
    onChange(next, !reduced);
  });
}
