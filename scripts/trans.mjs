import { chromium } from 'playwright';
const out = process.argv[2], w = +(process.argv[3] || 1440);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: w, height: w < 700 ? 844 : 900 } });
p.on('console', (m) => ['error','warning'].includes(m.type()) && console.log('C', m.text().slice(0,300)));
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/?noadapt'); await p.waitForTimeout(3500);
await p.click('.site-header nav a[href="/experience/"]');
for (let i = 0; i < 6; i++) { await p.waitForTimeout(380); await p.screenshot({ path: `${out}/t${i}.png` }); }
await p.waitForTimeout(1500);
console.log(p.url(), await p.title());
await p.goBack(); await p.waitForTimeout(3200);
console.log(p.url(), await p.title());
await p.screenshot({ path: `${out}/back.png` });
await b.close();
