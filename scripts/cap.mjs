// Viewport captures: node scripts/cap.mjs <outDir> <WxH> <night|day> <path>[@selector|@y] ...
// e.g. node scripts/cap.mjs shots 1440x900 night "/@[data-form=face]" "/work/proctoring/@0"
// Env: BASE (default http://localhost:4173), WAIT ms after scroll (default 2600), REDUCED=1, GPU=1 to try the real GPU.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out, size, theme, ...targets] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const base = process.env.BASE || 'http://localhost:4173';
const wait = Number(process.env.WAIT || 2600);
mkdirSync(out, { recursive: true });
const args = process.env.GPU ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const browser = await chromium.launch({ args });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 700, isMobile: W < 700, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
const log = [];
let n = 0;
for (const t of targets) {
  const at = t.lastIndexOf('@');
  const path = at < 0 ? t : t.slice(0, at), where = at < 0 ? '0' : t.slice(at + 1);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ReadPixels|GPU stall/.test(m.text())) log.push(`[${t}] ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log.push(`[${t}] PAGEERROR: ${e.message}`));
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  if (where !== '0') {
    await page.evaluate((w) => {
      if (/^\d+$/.test(w)) { window.scrollTo(0, Number(w)); return; }
      const el = document.querySelector(w);
      if (!el) throw new Error('no element ' + w);
      const r = el.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, r.top + window.scrollY + Math.min(r.height, innerHeight) / 2 - innerHeight / 2));
    }, where);
    await page.waitForTimeout(wait);
  }
  const name = `${String(n++).padStart(2, '0')}-${(path + '_' + where).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}-${W}-${theme}.png`;
  await page.screenshot({ path: `${out}/${name}` });
  await page.close();
}
await browser.close();
console.log(log.join('\n') || 'no console errors');
