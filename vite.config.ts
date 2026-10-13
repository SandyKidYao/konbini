import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// `npm run build:single` style output: everything inlined into dist/index.html (opens with a double-click).
// External mods placed in public/mods are copied next to it and can still be loaded at runtime.
export default defineConfig({
  base: './',
  resolve: { alias: { '@engine': r('./src/engine'), '@fx': r('./src/fx'), '@content': r('./src/content') } },
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
