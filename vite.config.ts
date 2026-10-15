import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Vite emits an HTML-linked icon as its own file; inline it so the build stays a single file.
const inlineIcon: Plugin = {
  name: 'inline-icon',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('./assets/icon.svg', `data:image/svg+xml;base64,${readFileSync(r('./assets/icon.svg')).toString('base64')}`),
  },
};

// `npm run build:single` style output: everything inlined into dist/index.html (opens with a double-click).
// External mods placed in public/mods are copied next to it and can still be loaded at runtime.
export default defineConfig({
  base: './',
  resolve: { alias: { '@engine': r('./src/engine'), '@fx': r('./src/fx'), '@content': r('./src/content') } },
  plugins: [inlineIcon, viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
