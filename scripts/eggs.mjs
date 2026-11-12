// Egg smoke test: node scripts/eggs.mjs <outDir>
// Drives the terminal, the Konami pile, the tab-return egg and the counter, and takes a capture of each.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
const base = process.env.BASE || 'http://localhost:4173';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ReadPixels|GPU stall/.test(m.text())) log.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => log.push(`PAGEERROR: ${e.message}`));
await page.goto(base + '/?debug&noadapt', { waitUntil: 'load' });
await page.waitForTimeout(6000);
const count = () => page.evaluate(() => document.querySelector('.foot-eggs')?.textContent ?? 'none');

await page.keyboard.press('Backquote');
await page.waitForTimeout(800);
for (const c of ['help', 'whoami', 'projects', 'nope', 'sudo hire-me']) { await page.keyboard.type(c); await page.keyboard.press('Enter'); await page.waitForTimeout(250); }
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/1-terminal.png` });
console.log('focus in dialog:', await page.evaluate(() => document.activeElement?.id), '| after terminal + hire:', await count());
await page.keyboard.type('git push --force'); await page.keyboard.press('Enter');
await page.waitForTimeout(3600);
await page.screenshot({ path: `${out}/2-force-fail.png` });
await page.waitForTimeout(4200);
await page.screenshot({ path: `${out}/3-force-green.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('dialog open after Esc:', await page.evaluate(() => document.querySelector('dialog.term')?.open), '| count:', await count());

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2500);
for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await page.keyboard.press(k);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/4-pile-start.png` });
await page.waitForTimeout(2600);
const l = await page.locator('.pile-l').nth(3).boundingBox();
await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2); await page.mouse.down();
await page.mouse.move(700, 300, { steps: 8 }); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/5-pile-drag.png` });
await page.mouse.move(1100, 200, { steps: 3 }); await page.mouse.up();
await page.waitForTimeout(1200);
await page.keyboard.press('Escape');
await page.waitForTimeout(1600);
console.log('pile gone:', await page.evaluate(() => !document.querySelector('.pile')), '| count:', await count());

await page.evaluate(() => { const el = document.querySelector('[data-form=face]'); const r = el.getBoundingClientRect(); window.scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2); });
await page.waitForTimeout(3500);
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/6-away.png` });
await page.evaluate(() => void window.hi);
await page.waitForTimeout(300);
console.log('final count:', await count());
await browser.close();
console.log(log.join('\n') || 'no console errors');
