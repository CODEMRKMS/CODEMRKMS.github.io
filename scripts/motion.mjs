// Motion smoke test: node scripts/motion.mjs <outDir>
// Captures the Daylight change mid-way, a page transition mid-way, the cursor states and a count-up in progress.
// TIER=high forces the post pass on (the default software renderer runs the low tier).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
const base = process.env.BASE || 'http://localhost:4173';
const q = process.env.TIER ? `?tier=${process.env.TIER}&noadapt` : '?noadapt';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ReadPixels|GPU stall/.test(m.text())) log.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => log.push(`PAGEERROR: ${e.message}`));
await page.goto(base + '/' + q, { waitUntil: 'load' });
await page.waitForTimeout(5000);

// Daylight: three frames through the change, then at rest
await page.click('.theme-toggle');
for (const [i, t] of [[1, 450], [2, 400], [3, 400]]) { await page.waitForTimeout(t); await page.screenshot({ path: `${out}/day-${i}.png` }); }
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/day-4-rest.png` });
await page.click('.theme-toggle');
await page.waitForTimeout(2500);

// cursor states and tilt
await page.evaluate(() => { const el = document.querySelector('[data-form=face]'); const r = el.getBoundingClientRect(); window.scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/count-up.png` });
await page.waitForTimeout(2500);
const cta = await page.locator('[data-form=face] .cta').boundingBox();
await page.mouse.move(cta.x + 20, cta.y + 8, { steps: 5 });
await page.waitForTimeout(500);
const fig = await page.locator('[data-form=face] .fig').first().boundingBox();
await page.screenshot({ path: `${out}/cursor-view.png`, clip: { x: 0, y: 380, width: 720, height: 520 } });
await page.mouse.move(fig.x + fig.width * 0.85, fig.y + 10, { steps: 5 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/tilt.png`, clip: { x: 0, y: 380, width: 720, height: 520 } });
console.log('figure text after count-up:', await page.evaluate(() => Array.from(document.querySelectorAll('[data-form=face] .fig-n')).map((e) => e.innerHTML).join(' | ')));

// page transition: mid-dissolve, mid-arrival, settled
await page.mouse.move(cta.x + 20, cta.y + 8, { steps: 3 });
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(380);
await page.screenshot({ path: `${out}/nav-1.png` });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/nav-2.png` });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/nav-3.png` });
console.log('url:', page.url(), '| main style:', await page.evaluate(() => document.getElementById('main').getAttribute('style')));
await browser.close();
console.log(log.join('\n') || 'no console errors');
