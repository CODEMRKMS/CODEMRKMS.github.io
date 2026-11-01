// Generates public/og.png: the name as a point cloud on the night sky (static, committed).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,100..900&display=swap"><body style="margin:0;background:#0C0E14"><canvas id=c width=1200 height=630></canvas></body>`);
await p.evaluate(() => document.fonts.load('800 200px Anybody'));
await p.waitForTimeout(800);
await p.evaluate(() => {
  let a = 7; const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const c = document.getElementById('c'), x = c.getContext('2d');
  x.fillStyle = '#0C0E14'; x.fillRect(0, 0, 1200, 630);
  const ramp = (t) => { const s = [[91,91,214],[43,179,163],[242,165,65]]; const k = t * 2, i = Math.min(1, Math.floor(k)), f = k - i; return s[i].map((v, j) => Math.round(v + (s[i+1][j] - v) * f)); };
  for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(236,232,225,${0.15 + r() * 0.5})`; x.beginPath(); x.arc(r() * 1200, r() * 630, 0.6 + r() * 1.1, 0, 7); x.fill(); }
  const t = document.createElement('canvas'); t.width = 1200; t.height = 630; const q = t.getContext('2d');
  q.font = '800 150px Anybody'; q.fillStyle = '#fff'; q.fillText('Mohammed', 70, 270); q.fillText('Shadab', 70, 430);
  const d = q.getImageData(0, 0, 1200, 630).data, px = [];
  for (let y = 0; y < 630; y += 2) for (let xx = 0; xx < 1200; xx += 2) if (d[(y * 1200 + xx) * 4 + 3] > 140) px.push(xx, y);
  for (let i = 0; i < 26000; i++) { const k = Math.floor(r() * px.length / 2); const X = px[k*2] + (r()-.5)*1.4, Y = px[k*2+1] + (r()-.5)*1.4; const [R,G,B] = ramp(Math.min(1, Math.max(0, (X - 70) / 780))); x.fillStyle = `rgba(${R},${G},${B},0.85)`; x.fillRect(X, Y, 1.4, 1.4); }
  x.fillStyle = '#A9A8AE'; x.font = '400 30px "Instrument Sans", sans-serif'; x.fillText('Edge AI, NLP and DevOps', 74, 520);
});
await p.locator('#c').screenshot({ path: 'public/og.png' });
await b.close();
