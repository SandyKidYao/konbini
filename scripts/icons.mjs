// Build the desktop app's icons from assets/ (the favicon is assets/icon.svg as is).
//
//   npm run icons    # macOS only (needs iconutil). Writes, into desktop/:
//                    #   icon.icns                          the app icon, for the packaged .app
//                    #   icon.png                           the same at 1024, for the Dock when run from source
//                    #   trayTemplate.png, trayTemplate@2x.png   the menu-bar silhouette (from assets/tray.svg)
//
// macOS icons sit on a 1024 grid: the tile is 824 wide with a soft drop shadow around it. Every size is rendered
// from the vector with the installed Google Chrome (as in shots.mjs), so the small ones stay crisp.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataUri = (file) => `data:image/svg+xml;base64,${readFileSync(`${root}assets/${file}`).toString('base64')}`;
const icon = dataUri('icon.svg'), tray = dataUri('tray.svg');
const desk = `${root}desktop`;
const set = `${root}tmp/icon.iconset`;

rmSync(set, { recursive: true, force: true });
mkdirSync(set, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
// one large viewport, each size clipped from its corner: shrinking the viewport between shots leaves stale frames
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

/** Render an SVG into a px-square PNG; `tile` places it on the macOS icon grid. */
async function render(src, px, path, tile = false) {
  const k = px / 1024;
  const style = tile
    ? `left:${100 * k}px;top:${100 * k}px;width:${824 * k}px;height:${824 * k}px;filter:drop-shadow(0 ${10 * k}px ${12 * k}px rgba(0,0,0,.28))`
    : `left:0;top:0;width:${px}px;height:${px}px`;
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{position:absolute;${style}}</style><img src="${src}">`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path, clip: { x: 0, y: 0, width: px, height: px }, omitBackground: true });
}

for (const pt of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) await render(icon, pt * scale, `${set}/icon_${pt}x${pt}${scale === 2 ? '@2x' : ''}.png`, true);
}
await render(icon, 1024, `${desk}/icon.png`, true);
// menu-bar icons are 18pt; the "Template" suffix tells macOS to tint them for a light or dark menu bar
await render(tray, 18, `${desk}/trayTemplate.png`);
await render(tray, 36, `${desk}/trayTemplate@2x.png`);
await browser.close();

execFileSync('iconutil', ['-c', 'icns', set, '-o', `${desk}/icon.icns`]);
console.log(`wrote ${desk}/icon.icns, icon.png, trayTemplate.png, trayTemplate@2x.png`);
