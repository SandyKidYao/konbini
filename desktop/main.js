// Desktop pet shell (macOS first): a transparent, frameless, floating window that shows only the model
// (the web app with ?pet=1). Clicks fall through wherever the model isn't — the page reports when the pointer
// is on it. The scene's settings are the page's own (a double-click opens them), its size too: the page sizes the
// window to it. Right-click on the model, the menu-bar icon or the Dock icon opens the native menu, which keeps the
// window's: form, the sky, floating (or sinking beneath every window), icons, power saving. Whether the menu-bar and
// Dock icons show is a preference (at least one of them stays).
//
//   npm run pet                 build, then open dist/index.html
//   npm run dev + npm run pet:dev   load the Vite dev server instead (live reload)
//   electron . --probe=out.png  warm up, measure frame rate / CPU / GPU idle and active, save a capture, quit
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const FORMS = [['model', '模型'], ['plan', '俯视图']];
// the window until the page says what its size wants (pet.json keeps the last one)
const FIRST_WINDOW = [560, 460];

const probe = process.argv.find((a) => a.startsWith('--probe'))?.split('=')[1] ?? (process.argv.includes('--probe') ? 'pet-probe.png' : null);

// --- preferences: size, floating, where the window was ---
// size: the page's size slider (0–100; before it, 'small' / 'medium' / 'large', which the page still reads)
const prefsFile = path.join(app.getPath('userData'), 'pet.json');
// onTop / onBottom: above every window, or beneath them all (at most one of the two)
const prefs = { size: 'medium', form: 'model', onTop: true, onBottom: false, x: null, y: null, w: null, h: null, tray: true, dock: false };
try { Object.assign(prefs, JSON.parse(fs.readFileSync(prefsFile, 'utf8'))); } catch { /* first run */ }
if (prefs.onTop && prefs.onBottom) prefs.onBottom = false;
if (!FORMS.some(([k]) => k === prefs.form)) prefs.form = 'model';
const windowSize = () => (prefs.w > 0 && prefs.h > 0 ? [prefs.w, prefs.h] : FIRST_WINDOW);
if (!prefs.tray && !prefs.dock) prefs.tray = true;
// written a moment later (dragging the size slider changes the window every frame), and at quit
let saveTimer = null;
const writePrefs = () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { fs.writeFileSync(prefsFile, JSON.stringify(prefs)); } catch { /* read-only */ }
};
const savePrefs = () => {
  if (!saveTimer) saveTimer = setTimeout(writePrefs, 400);
  refreshDockMenu();   // every preference shows in the menu; the Dock's copy is static, so rebuild it
};
app.on('will-quit', () => { if (saveTimer) writePrefs(); });

/** @type {BrowserWindow} */ let win;
/** @type {Tray} */ let tray;
let state = { saver: false, sky: false, form: prefs.form, size: prefs.size };
let dragTimer = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win?.showInactive());

app.whenReady().then(() => {
  // with the Dock icon shown the app gets a menu bar of its own: keep it to the app menu (About, Hide, Quit)
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }]));
  applyPresence();
  createWindow();
  if (probe) void runProbe(probe);
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => win?.show());   // a click on the Dock icon brings the model to the front

function createWindow() {
  const [w, h] = windowSize();
  win = new BrowserWindow({
    width: w, height: h, ...startPosition(w, h),
    transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, acceptFirstMouse: true, show: false,
    webPreferences: { preload: path.join(here, 'preload.cjs'), sandbox: true, contextIsolation: true },
  });
  applyLayer();
  win.setIgnoreMouseEvents(true, { forward: true });   // until the page says the pointer is on the model
  win.once('ready-to-show', () => win.showInactive());
  watchCursor();
  win.on('moved', savePosition);

  const query = { pet: '1', size: String(prefs.size), ...(prefs.form === 'plan' ? { view: 'plan' } : {}) };
  const dev = process.env.KONBINI_DEV_URL;
  if (dev) void win.loadURL(`${dev}${dev.includes('?') ? '&' : '?'}${new URLSearchParams(query)}`);
  else void win.loadFile(path.join(here, '..', 'dist', 'index.html'), { query });
}

/** Last place if it is still on a screen, otherwise the bottom-right corner of the main screen. */
function startPosition(w, h) {
  if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) {
    const a = screen.getDisplayMatching({ x: prefs.x, y: prefs.y, width: w, height: h }).workArea;
    if (prefs.x + w > a.x + 40 && prefs.x < a.x + a.width - 40 && prefs.y >= a.y - 10 && prefs.y < a.y + a.height - 40) return { x: prefs.x, y: prefs.y };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - w - 24, y: a.y + a.height - h - 12 };
}

function savePosition() {
  [prefs.x, prefs.y] = win.getPosition();
  savePrefs();
}

function applyLayer() {
  // 'floating' sits above normal windows, on every Space and over full-screen apps too. At the bottom: one level under
  // 'normal', beneath every app's windows (even once it is clicked) but above the desktop and its icons, so it still
  // takes clicks and drags (a 'desktop' type window sits under the Finder's desktop and gets none); on every Space,
  // where full-screen apps cover it anyway
  if (prefs.onTop) win.setAlwaysOnTop(true, 'floating');
  else if (prefs.onBottom) win.setAlwaysOnTop(true, 'normal', -1);
  else win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(prefs.onTop || prefs.onBottom, { visibleOnFullScreen: prefs.onTop, skipTransformProcessType: true });
}

/** Above everything, beneath everything, or neither: the two menu switches turn each other off. */
function setLayer(layer) {
  prefs.onTop = layer === 'top';
  prefs.onBottom = layer === 'bottom';
  applyLayer();
  savePrefs();
}

/** where the window's foot belongs while the screen's edge holds the window elsewhere (null: where it is) */
let home = null;

/**
 * Change size around the bottom centre, so the model stays where it stands on the desk. A window too big to stand
 * there is moved onto the screen (as far as the whole screen, at the slider's top); once it is small enough again it
 * goes back to where it stood.
 */
function setWindowSize(w, h) {
  const [x, y] = win.getPosition(), [w0, h0] = win.getSize();
  const foot = home ?? [x + w0 / 2, y + h0];
  const want = { x: Math.round(foot[0] - w / 2), y: Math.round(foot[1] - h), width: w, height: h };
  const b = onScreen(want);
  home = b.x !== want.x || b.y !== want.y ? foot : null;
  [prefs.w, prefs.h] = [w, h];
  if (w !== w0 || h !== h0 || b.x !== x || b.y !== y) win.setBounds(b);
  savePosition();
}

/** Bounds moved just far enough to lie inside the screen they are mostly on (growing near an edge would push past it). */
function onScreen(b) {
  const a = screen.getDisplayMatching(b).workArea;
  const x = Math.max(a.x, Math.min(a.x + a.width - b.width, b.x)), y = Math.max(a.y, Math.min(a.y + a.height - b.height, b.y));
  return { ...b, x, y };
}

// --- where the cursor is over the window ---
// While the window lets clicks through, the page only hears the pointer through forwarded mouse moves, and macOS stops
// sending those once another app is active (click the desktop or another app, and the pet no longer notices the
// pointer on it, so it never takes the click). So the shell watches the cursor itself and tells the page where it
// is while it is over the window, and that it left; the page decides whether that is on the model.
let cursorAt = '';
function watchCursor() {
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || dragTimer) return;
    const p = screen.getCursorScreenPoint(), b = win.getContentBounds();
    const x = p.x - b.x, y = p.y - b.y, inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
    const at = inside ? `${x},${y}` : '';
    if (at === cursorAt) return;
    cursorAt = at;
    win.webContents.send('pet:pointer', inside ? { x, y } : null);
  }, 50);
}

// --- messages from the page (desktop/preload.cjs) ---
ipcMain.on('pet:hit', (_e, over) => { if (!dragTimer) win.setIgnoreMouseEvents(!over, { forward: true }); });
ipcMain.on('pet:state', (_e, s) => {
  state = s;
  // the form and the size are chosen in the page (or this menu), and kept here for the next start
  if (s.form !== prefs.form || s.size !== prefs.size) { prefs.form = s.form; prefs.size = s.size; savePrefs(); }
  refreshDockMenu();
});
// the page sizes the window to its size slider
ipcMain.on('pet:window', (_e, w, h) => {
  if (Number.isInteger(w) && Number.isInteger(h) && w >= 100 && h >= 100 && w <= 4000 && h <= 4000) setWindowSize(w, h);
});
ipcMain.on('pet:menu', () => buildMenu().popup({ window: win }));
ipcMain.on('pet:drag', (_e, on) => {
  home = null;   // moved by hand: where it stands now is its place
  clearInterval(dragTimer);
  dragTimer = null;
  if (!on) { savePosition(); return; }
  const from = screen.getCursorScreenPoint(), [wx, wy] = win.getPosition();
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    win.setPosition(wx + p.x - from.x, wy + p.y - from.y);
  }, 1000 / 60);
});

const send = (action) => win.webContents.send('pet:action', action);

/** @param {{ dock?: boolean }} [opts] the Dock adds its own Quit */
function buildMenu({ dock = false } = {}) {
  const s = state;
  return Menu.buildFromTemplate([
    // how to handle the pet, where anyone who has forgotten looks first (the desk itself shows no words)
    { label: '双击打开设置 · ⌥ 拖动移动位置', enabled: false },
    { type: 'separator' },
    // weather, time, date, views… are in the page's own settings, the same as on the web
    { label: '设置…', click: () => { win.showInactive(); send({ type: 'settings' }); } },
    { label: '形态', submenu: FORMS.map(([k, label]) => ({ label, type: 'radio', checked: s.form === k, click: () => send({ type: 'form', value: k }) })) },
    // the model alone over the desk, or with its sky behind it (some wallpapers make a lone model look odd)
    { label: '显示天空', type: 'checkbox', checked: s.sky, enabled: s.form === 'model', click: () => send({ type: 'sky' }) },
    { type: 'separator' },
    { label: '省电（降低帧率）', type: 'checkbox', checked: s.saver, click: () => send({ type: 'saver' }) },
    { type: 'separator' },
    { label: '浮在最上层', type: 'checkbox', checked: prefs.onTop, click: () => setLayer(prefs.onTop ? null : 'top') },
    { label: '沉在最下层', type: 'checkbox', checked: prefs.onBottom, click: () => setLayer(prefs.onBottom ? null : 'bottom') },
    // the last icon left can't be turned off: with neither, the model's right-click would be the only way in
    { label: '显示图标', submenu: [
      { label: '菜单栏', type: 'checkbox', checked: prefs.tray, enabled: !prefs.tray || prefs.dock, click: () => togglePresence('tray') },
      { label: '程序坞', type: 'checkbox', checked: prefs.dock, enabled: !prefs.dock || prefs.tray, click: () => togglePresence('dock') },
    ] },
    ...(dock ? [] : [
      { type: 'separator' },
      { label: '退出', accelerator: 'Command+Q', click: () => app.quit() },
    ]),
  ]);
}

/** Show or hide the menu-bar and Dock icons as the preferences say. */
function applyPresence() {
  if (prefs.tray && !tray) createTray();
  if (!prefs.tray && tray) { tray.destroy(); tray = null; }
  // coming back into the Dock resets the icon to the bundle's (Electron's own when run from source): set ours after
  // it; the packaged .app carries icon.icns
  if (prefs.dock) void app.dock?.show().then(() => { if (!app.isPackaged) app.dock?.setIcon(path.join(here, 'icon.png')); });
  else app.dock?.hide();   // out of the Dock and the app switcher too
  // showing or hiding the Dock icon changes the process type; put the window back on its level after it
  if (win) applyLayer();
  refreshDockMenu();
}

function togglePresence(key) {
  prefs[key] = !prefs[key];
  savePrefs();
  applyPresence();
}

function refreshDockMenu() {
  if (prefs.dock) app.dock?.setMenu(buildMenu({ dock: true }));
}

function createTray() {
  // a template image (the name ends in "Template"): macOS tints the silhouette to suit the menu bar; @2x is picked up
  tray = new Tray(nativeImage.createFromPath(path.join(here, 'trayTemplate.png')));
  tray.setToolTip('ひかりマート');
  const open = () => tray.popUpContextMenu(buildMenu());
  tray.on('click', open);
  tray.on('right-click', open);
}

// --- probe: a quick measurement without anyone at the mouse ---
async function runProbe(out) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // whole-machine GPU busy % (Apple silicon reports it without sudo), sampled once a second
  const gpuBusy = () => { try { return Number(execFileSync('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator']).toString().match(/"Device Utilization %"=(\d+)/)?.[1]); } catch { return NaN; } };
  const frames = () => win.webContents.executeJavaScript('window.konbini?.frame ?? 0');
  const measure = async (ms) => {
    app.getAppMetrics();   // percentCPUUsage counts from the previous call
    const f0 = await frames(), gpu = [];
    for (let t = 0; t < ms; t += 1000) { await wait(1000); gpu.push(gpuBusy()); }
    const cpu = {};
    for (const m of app.getAppMetrics()) cpu[m.type] = Math.round(((cpu[m.type] ?? 0) + m.cpu.percentCPUUsage) * 10) / 10;
    const fps = Math.round(((await frames()) - f0) / (ms / 1000));
    return { fps, cpu, gpuBusy: Math.round(gpu.reduce((a, b) => a + b, 0) / gpu.length) };
  };
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await wait(12000);   // mods load, shaders compile, the scene settles
  const idle = await measure(10000);
  await win.webContents.executeJavaScript('window.pet?.setActive(true)');
  const active = await measure(10000);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.resolve(out), img.toPNG());
  console.log(JSON.stringify({ size: prefs.size, idle, active, capture: path.resolve(out) }));
  app.quit();
}
