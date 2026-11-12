import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';
import { initPage, inView, splitLines, textBlocks, type Ctx, type PageHandle } from './page';
import { dissolveEl } from './dissolve';

const ROUTES = new Set(['/', '/work/proctoring/', '/work/quant-trading/', '/work/voicepay/', '/experience/', '/about/']);

interface Loaded { title: string; desc: string; canonical: string; main: HTMLElement; path: string }

/**
 * Real pages, soft navigation. The canvas (outside <main>) never reloads: JS fetches the next
 * prerendered page, runs the transition, swaps <main>, updates history and metadata.
 */
export class Router {
  private cache = new Map<string, Promise<Loaded>>();
  private busy = false;
  private pending: { url: URL; dir: 1 | -1; push: boolean } | null = null;
  private page: PageHandle | null = null;
  private main: HTMLElement;

  constructor(private ctx: Ctx) {
    this.main = document.getElementById('main') as HTMLElement;
  }

  start() {
    history.scrollRestoration = 'manual';
    this.page = initPage(this.main, this.ctx, { first: true });
    document.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('popstate', () => void this.go(new URL(location.href), this.dirFor(location.pathname), false));
    const warm = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a');
      const u = a && this.routable(a as HTMLAnchorElement);
      if (u) void this.load(u.pathname);
    };
    document.addEventListener('pointerover', warm, { passive: true });
    document.addEventListener('focusin', warm);
    this.mark(location.pathname);
  }

  private order = ['/', '/work/proctoring/', '/work/quant-trading/', '/work/voicepay/', '/experience/', '/about/'];
  private dirFor(next: string): 1 | -1 {
    return this.order.indexOf(next) >= this.order.indexOf(this.current) ? 1 : -1;
  }
  private current = location.pathname;

  private routable(a: HTMLAnchorElement): URL | null {
    if (a.target && a.target !== '_self') return null;
    if (a.hasAttribute('download') || a.origin !== location.origin) return null;
    const u = new URL(a.href);
    return ROUTES.has(u.pathname) ? u : null;
  }

  private onClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest('a');
    if (!a) return;
    const u = this.routable(a as HTMLAnchorElement);
    if (!u) return;
    e.preventDefault();
    if (u.pathname === location.pathname) {
      if (u.hash) this.scrollToHash(u.hash, false);
      else this.ctx.lenis ? this.ctx.lenis.scrollTo(0) : window.scrollTo({ top: 0, behavior: this.ctx.reduced ? 'auto' : 'smooth' });
      return;
    }
    void this.go(u, this.dirFor(u.pathname), true);
  }

  private scrollToHash(hash: string, immediate: boolean) {
    const el = hash ? document.querySelector<HTMLElement>(decodeURIComponent(hash)) : null;
    if (!el) return;
    if (this.ctx.lenis) this.ctx.lenis.scrollTo(el, { immediate });
    else el.scrollIntoView({ behavior: immediate || this.ctx.reduced ? 'auto' : 'smooth' });
    history.replaceState(history.state, '', location.pathname + hash);
  }

  private load(path: string): Promise<Loaded> {
    let p = this.cache.get(path);
    if (!p) {
      p = fetch(path, { credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
        .then((html) => {
          const d = new DOMParser().parseFromString(html, 'text/html');
          return {
            title: d.title,
            desc: d.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
            canonical: d.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
            main: d.getElementById('main') as HTMLElement,
            path,
          };
        });
      p.catch(() => this.cache.delete(path));
      this.cache.set(path, p);
    }
    return p;
  }

  async go(url: URL, dir: 1 | -1, push: boolean) {
    if (this.busy) { this.pending = { url, dir, push }; return; }
    this.busy = true;
    const { field, reduced } = this.ctx;
    let next: Loaded;
    try {
      next = await this.load(url.pathname);
      if (!next.main) throw new Error('no main');
    } catch {
      location.href = url.href;
      return;
    }
    document.documentElement.classList.add('is-transitioning');

    if (reduced) {
      await this.crossfade(() => this.swap(next, url, push));
    } else {
      // the form dissolves into noise while the text leaves; the new page's route is installed under the noise
      // the page dissolves into noise while the camera flies into the cloud; the swap happens under cover
      await Promise.all([dissolveEl(this.main, 1, 0, 0.6), field?.dissolve(dir)]);
      this.swap(next, url, push);
      field?.resolve(dir);
      await Promise.all([dissolveEl(this.main, 0, 1, 0.85), this.enterText(dir)]);
    }
    document.documentElement.classList.remove('is-transitioning');
    this.busy = false;
    const q = this.pending;
    this.pending = null;
    if (q && q.url.pathname !== location.pathname) void this.go(q.url, q.dir, q.push);
  }

  /* ---- swap the content ---- */
  private swap(next: Loaded, url: URL, push: boolean) {
    this.page?.destroy();
    const fresh = document.importNode(next.main, true) as HTMLElement;
    if (!this.ctx.reduced) fresh.style.visibility = 'hidden'; // stays covered until the dissolve brings it in
    this.main.replaceWith(fresh);
    this.main = fresh;
    document.title = next.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', next.desc);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', next.canonical);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', next.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', next.desc);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', next.canonical);
    if (push) history.pushState({}, '', url.pathname + url.hash);
    this.current = url.pathname;
    this.mark(url.pathname);
    // a new page starts at the top. ScrollTrigger remembers the old position and would put it back on refresh, so forget it first
    const top = () => { window.scrollTo(0, 0); this.ctx.lenis?.scrollTo(0, { immediate: true, force: true }); };
    ScrollTrigger.clearScrollMemory();
    top();
    ScrollTrigger.refresh();
    top();
    this.page = initPage(this.main, this.ctx, { first: false });
    if (url.hash) this.scrollToHash(url.hash, true);
    fresh.focus({ preventScroll: true });
  }

  /* ---- enter: the headline assembles through its line masks while the rest condenses out of the noise ---- */
  private async enterText(dir: 1 | -1): Promise<void> {
    const from = dir > 0 ? 110 : -110;
    const heads = textBlocks(this.main).filter((el) => inView(el) && (/^H[1-3]$/.test(el.tagName) || el.dataset.split !== undefined));
    const lines: Element[] = [];
    const sts: { revert(): void }[] = [];
    for (const el of heads) { const st = splitLines(el); sts.push(st); lines.push(...st.lines); }
    if (!lines.length) return;
    gsap.set(lines, { yPercent: from });
    await gsap.to(lines, { yPercent: 0, duration: 0.85, ease: 'power3.out', stagger: 0.06, delay: 0.1 }).then();
    sts.forEach((st) => st.revert());
  }

  private async crossfade(swap: () => void) {
    this.main.style.transition = 'opacity .15s linear';
    this.main.style.opacity = '0';
    await new Promise((r) => setTimeout(r, 160));
    swap();
    this.main.style.opacity = '0';
    void this.main.offsetWidth;
    this.main.style.transition = 'opacity .15s linear';
    this.main.style.opacity = '1';
    await new Promise((r) => setTimeout(r, 160));
    this.main.style.transition = '';
    this.main.style.opacity = '';
  }

  private mark(path: string) {
    document.querySelectorAll<HTMLAnchorElement>('.site-header nav a').forEach((a) => {
      const u = new URL(a.href);
      const on = u.pathname === path && !u.hash || (path.startsWith('/work/') && u.hash === '#work');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
}

export type { Lenis };
