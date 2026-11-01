import { buildShapes } from './shapes';

self.onmessage = (e: MessageEvent<{ N: number }>) => {
  const t0 = performance.now();
  const shapes = buildShapes(e.data.N);
  const msg = { shapes, ms: performance.now() - t0 };
  (self as unknown as Worker).postMessage(msg, shapes.filter(Boolean).map((s) => s.buffer));
};
