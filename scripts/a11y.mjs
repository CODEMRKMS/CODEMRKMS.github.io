// Accessibility checks: node scripts/a11y.mjs <outDir> [keys|contrast|all]
//  keys      Tab through every page; each stop must show a focus ring, be on screen and not sit under the header.
//  contrast  Scroll every page in both themes with the text made transparent, then compare each text colour with
//            the pixels really behind it (background, particles, bloom). Reports WCAG AA failures.
// Env: BASE (default http://localhost:4173), QUERY (default ?noadapt&tier=high), SIZES (default 1440x900,375x740),
//      PAGES (comma list), REDUCED=1.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out = 'shots-a11y', mode = 'all'] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:4173';
const query = process.env.QUERY ?? '?noadapt&tier=high';
const sizes = (process.env.SIZES || '1440x900,375x740').split(',').map((s) => s.split('x').map(Number));
const pages = (process.env.PAGES || '/,/work/proctoring/,/work/quant-trading/,/work/voicepay/,/experience/,/about/').split(',');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const problems = [];
const slug = (p) => p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';

async function open(W, H, theme, path) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 700, isMobile: W < 700, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${path}] PAGEERROR ${e.message}`));
  await page.goto(base + path + query, { waitUntil: 'load' });
  await page.waitForTimeout(3600);
  return { ctx, page };
}

/* ---------------- keyboard ---------------- */
async function keys(W, H, theme, path) {
  const { ctx, page } = await open(W, H, theme, path);
  const tag = `${slug(path)}-${W}-${theme}`;
  const seen = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(350);
    const s = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const head = document.querySelector('.site-header').getBoundingClientRect();
      return {
        id: (el.tagName + '.' + el.className + ' "' + (el.textContent || '').trim().slice(0, 32) + '"').replace(/\s+/g, ' '),
        key: el.tagName + '|' + (el.getAttribute('href') || '') + '|' + (el.textContent || '').trim().slice(0, 40) + '|' + (el.closest('header,footer,main')?.tagName || ''),
        ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
        ringColor: cs.outlineColor,
        onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth + 1,
        covered: !!top && top !== el && !el.contains(top) && !top.contains(el),
        underHeader: !el.closest('.site-header') && !el.classList.contains('skip') && r.top < head.bottom - 2 && r.bottom > head.top,
        size: [Math.round(r.width), Math.round(r.height)],
        rect: [Math.round(r.left), Math.round(r.top)],
      };
    });
    if (!s) continue;
    if (seen.some((o) => o.key === s.key)) break;
    seen.push(s);
    const bad = [!s.ring && 'no focus ring', !s.onScreen && 'off screen', s.covered && 'covered by another element', s.underHeader && 'under the header'].filter(Boolean);
    if (bad.length) {
      problems.push(`[keys ${tag}] stop ${seen.length} ${s.id} at ${s.rect}: ${bad.join(', ')}`);
      await page.screenshot({ path: `${out}/keys-${tag}-${String(seen.length).padStart(2, '0')}.png` });
    }
  }
  console.log(`keys ${tag}: ${seen.length} stops`);
  console.log('  ' + seen.map((s) => s.id.replace(/^(\w+)\.[^"]*/, '$1 ')).join(' > '));
  // one picture of a focused link in the middle of the page, for a look at the ring itself
  await page.screenshot({ path: `${out}/keys-${tag}-last.png` });
  await ctx.close();
}

/* ---------------- contrast ---------------- */
async function contrast(W, H, theme, path) {
  const { ctx, page } = await open(W, H, theme, path);
  const tag = `${slug(path)}-${W}-${theme}`;
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const fails = new Map();
  let shots = 0;
  for (let y = 0; ; y += Math.round(H * 0.7)) {
    const sy = Math.min(y, total);
    await page.evaluate((v) => window.scrollTo(0, v), sy);
    await page.waitForTimeout(sy === 0 ? 300 : 1700);
    // what is drawn behind the text: hide the glyphs (their shadows stay, they are part of the design)
    // colours are read first: links fade their colour, and a value read during the fade back would be wrong
    await page.evaluate(() => {
      window.__col = new Map();
      for (const el of document.body.querySelectorAll('*')) window.__col.set(el, getComputedStyle(el).color);
    });
    const hide = await page.addStyleTag({ content: '*{color:transparent !important;caret-color:transparent !important;border-color:transparent !important;transition:none !important} .hud,.fps{visibility:hidden !important}' });
    await page.waitForTimeout(60);
    const png = (await page.screenshot()).toString('base64');
    await hide.evaluate((n) => n.remove());
    const res = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const done = new Set();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const el = n.parentElement;
        if (!el || done.has(el) || el.closest('.sr-only,.hud,.fps,script,style,[aria-hidden=true]')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
        const er = el.getBoundingClientRect();
        if (er.width < 3 || er.height < 3) continue; // clipped (visually hidden) text
        done.add(el);
        const color = window.__col.get(el) || cs.color;
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(color);
        if (!m) continue;
        const fgL = lum(+m[1], +m[2], +m[3]);
        const fs = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
        const need = fs >= 24 || (fs >= 18.66 && bold) ? 3 : 4.5;
        range.selectNodeContents(el);
        const vals = [];
        for (const r of range.getClientRects()) {
          const x0 = Math.max(0, Math.floor(r.left)), x1 = Math.min(c.width, Math.ceil(r.right));
          const y0 = Math.max(0, Math.floor(r.top)), y1 = Math.min(c.height, Math.ceil(r.bottom));
          for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
            const i = (yy * c.width + xx) * 4;
            vals.push(ratio(fgL, lum(px[i], px[i + 1], px[i + 2])));
          }
        }
        if (vals.length < 20) continue;
        vals.sort((a, b) => a - b);
        const worst = vals[0], p05 = vals[Math.floor(vals.length * 0.05)], med = vals[vals.length >> 1];
        if (p05 < need) out.push({ id: (el.tagName + '.' + el.className).slice(0, 40), text: el.textContent.trim().slice(0, 40), color, fs: Math.round(fs), need, worst: +worst.toFixed(2), p05: +p05.toFixed(2), med: +med.toFixed(2) });
      }
      return out;
    }, png);
    for (const f of res) {
      const k = f.id + '|' + f.text;
      const old = fails.get(k);
      if (!old || f.p05 < old.p05) fails.set(k, { ...f, y: sy });
    }
    if (res.length && shots < 4) { await page.screenshot({ path: `${out}/contrast-${tag}-${sy}.png` }); shots++; }
    if (sy >= total) break;
  }
  for (const f of fails.values()) problems.push(`[contrast ${tag}] y=${f.y} ${f.id} "${f.text}" ${f.color} ${f.fs}px: median ${f.med}, 5th pct ${f.p05}, worst ${f.worst} (needs ${f.need})`);
  console.log(`contrast ${tag}: ${fails.size} failing`);
  await ctx.close();
}

for (const [W, H] of sizes) for (const theme of ['night', 'day']) for (const path of pages) {
  if (mode !== 'contrast' && (theme === 'night' || path === '/')) await keys(W, H, theme, path);
  if (mode !== 'keys') await contrast(W, H, theme, path);
}
await browser.close();
console.log('\n' + (problems.join('\n') || 'no problems found'));
