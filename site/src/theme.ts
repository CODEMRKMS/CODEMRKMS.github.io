export type Theme = 'night' | 'day';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'day' ? 'day' : 'night';
}

/** Wires the toggle button. The initial theme was already applied by the inline script in <head>. */
export function initTheme(onChange: (t: Theme) => void) {
  const btn = document.querySelector<HTMLButtonElement>('.theme-toggle');
  const label = btn?.querySelector<HTMLElement>('[data-theme-label]');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const paint = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    if (label) label.textContent = t === 'night' ? 'Daylight' : 'Night';
    btn?.setAttribute('aria-label', t === 'night' ? 'Switch to daylight theme' : 'Switch to night theme');
    meta?.setAttribute('content', t === 'night' ? '#0C0E14' : '#F3EFE6');
  };
  paint(currentTheme());
  onChange(currentTheme());
  btn?.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'night' ? 'day' : 'night';
    paint(next);
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
    onChange(next);
  });
}
