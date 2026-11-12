// Face review captures: node scripts/face.mjs <outDir> [night|day]
// Shoots the home face section at 40k points (1440x900) and 12k points (390x844), looking at the camera and turned.
// The pointer is kept moving a little so the head settles on it instead of going back to its idle wander.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out, theme = 'night'] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:4173';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const log = [];
const shots = [
  { name: '40k-front', w: 1440, h: 900, n: 40000, at: [0.725, 0.5] },
  { name: '40k-turned', w: 1440, h: 900, n: 40000, at: [0.08, 0.3] },
  { name: '12k-front', w: 390, h: 844, n: 12000, at: [0.5, 0.31] },
  { name: '12k-turned', w: 390, h: 844, n: 12000, at: [0.98, 0.12] },
];
for (const s of shots) {
  if (process.env.ONLY && !s.name.includes(process.env.ONLY)) continue;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ReadPixels|GPU stall/.test(m.text())) log.push(`[${s.name}] ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log.push(`[${s.name}] PAGEERROR: ${e.message}`));
  await page.goto(`${base}/?n=${s.n}&noadapt`, { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  await page.evaluate(() => {
    const el = document.querySelector('[data-form=face]');
    const r = el.getBoundingClientRect();
    // on a phone the form sits in the space above the copy, so stop where the copy has only just come in
    const y = innerWidth < 900 ? r.top + scrollY - innerHeight * 0.12 : r.top + scrollY + Math.min(r.height, innerHeight) / 2 - innerHeight / 2;
    window.scrollTo(0, Math.max(0, y));
  });
  await page.waitForTimeout(2600);
  const [x, y] = [s.at[0] * s.w, s.at[1] * s.h];
  for (let i = 0; i < 16; i++) { await page.mouse.move(x + (i % 2 ? 3 : -3), y + (i % 3) - 1); await page.waitForTimeout(140); }
  await page.screenshot({ path: `${out}/${s.name}-${theme}.png` });
  await ctx.close();
}
await browser.close();
console.log(log.join('\n') || 'no console errors');
