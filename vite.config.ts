import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, 'site');

/**
 * Inlines <!--include:name key="value"--> from site/partials/name.html and replaces {{key}} inside it.
 * Keeps every output file complete, prerendered HTML.
 */
function partials(): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/<!--include:([\w-]+)([^>]*?)-->/g, (_m, name: string, attrs: string) => {
          const vars: Record<string, string> = {};
          attrs.replace(/(\w+)="([^"]*)"/g, (_a, k: string, v: string) => ((vars[k] = v), ''));
          const file = readFileSync(resolve(root, 'partials', `${name}.html`), 'utf8');
          return file.replace(/\{\{(\w+)\}\}/g, (_x: string, k: string) => vars[k] ?? '');
        });
      },
    },
  };
}

const pages = ['index.html', 'work/proctoring/index.html', 'work/quant-trading/index.html', 'work/voicepay/index.html', 'experience/index.html', 'about/index.html', '404.html'];

export default defineConfig({
  root,
  publicDir: resolve(__dirname, 'public'),
  appType: 'mpa',
  plugins: [partials()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p.replace(/\/?index\.html$/, '').replace(/\.html$/, '') || 'index', resolve(root, p)])),
    },
  },
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
