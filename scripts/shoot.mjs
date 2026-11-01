// Screenshot harness: node scripts/shoot.mjs <outDir> <base> [pages=all] [widths=1440,1024,390] [themes=night,day]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out = 'shots', base = 'http://localhost:5173', pagesArg = 'all', widthsArg = '1440,1024,390', themesArg = 'night,day'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const ALL = ['/', '/work/proctoring/', '/work/quant-trading/', '/work/voicepay/', '/experience/', '/about/'];
const ALIAS = { home: '/', proctoring: '/work/proctoring/', quant: '/work/quant-trading/', voicepay: '/work/voicepay/', experience: '/experience/', about: '/about/' };
const pages = pagesArg === 'all' ? ALL : pagesArg.split(',').map((x) => ALIAS[x] || x);
const widths = widthsArg.split(',').map(Number);
const themes = themesArg.split(',');
const H = { 1440: 900, 1024: 768, 390: 844 };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const log = [];
for (const w of widths) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: H[w] || 800 }, deviceScaleFactor: 1, hasTouch: w < 700, isMobile: w < 700 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
    for (const p of pages) {
      const page = await ctx.newPage();
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`[${w}/${theme}${p}] ${m.type()}: ${m.text().slice(0, 300)}`); });
      page.on('pageerror', (e) => log.push(`[${w}/${theme}${p}] PAGEERROR: ${e.message}`));
      await page.goto(base + p + '?noadapt', { waitUntil: 'load' });
      await page.waitForTimeout(3800);
      const slug = (p === '/' ? 'home' : p.replace(/\//g, '_').replace(/^_|_$/g, '')) + `-${w}-${theme}`;
      // top of page, then a few scroll positions
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const vh = H[w] || 800;
      const stops = p === '/' ? [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] : [0, 0.25, 0.5, 0.75, 1];
      for (let i = 0; i < stops.length; i++) {
        const y = Math.round((total - vh) * stops[i]);
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(i === 0 ? 300 : 2300);
        await page.screenshot({ path: `${out}/${slug}-s${String(i).padStart(2, '0')}.png` });
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(log.join('\n') || 'no console errors');
