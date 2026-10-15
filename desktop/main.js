// Desktop pet shell (macOS first): a transparent, frameless, floating window that shows only the model
// (the web app with ?pet=1). Clicks fall through wherever the model isn't — the page reports when the pointer
// is on it. The scene's settings are the page's own (a button under the model); right-click on the model, the menu-bar
// icon or the Dock icon opens the native menu, which keeps the window's: size, floating, icons, power saving. Whether
// the menu-bar and Dock icons show is a preference (at least one of them stays).
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
const SIZES = { small: [400, 330], medium: [560, 460], large: [760, 625] };
// the map form: the page draws the map at the chosen size (small / medium / large) on the window's lower edge; the
// window keeps room above it for the settings, and is click-through wherever there's nothing
const PLAN_WINDOW = [380, 470];
const SIZE_LABEL = { small: '小', medium: '中', large: '大' };
const FORMS = [['model', '模型'], ['plan', '俯视图']];

const probe = process.argv.find((a) => a.startsWith('--probe'))?.split('=')[1] ?? (process.argv.includes('--probe') ? 'pet-probe.png' : null);

// --- preferences: size, floating, where the window was ---
const prefsFile = path.join(app.getPath('userData'), 'pet.json');
const prefs = { size: 'medium', form: 'model', onTop: true, x: null, y: null, tray: true, dock: false };
try { Object.assign(prefs, JSON.parse(fs.readFileSync(prefsFile, 'utf8'))); } catch { /* first run */ }
if (!SIZES[prefs.size]) prefs.size = 'medium';
if (!FORMS.some(([k]) => k === prefs.form)) prefs.form = 'model';
const windowSize = () => (prefs.form === 'plan' ? PLAN_WINDOW : SIZES[prefs.size]);
if (!prefs.tray && !prefs.dock) prefs.tray = true;
const savePrefs = () => {
  try { fs.writeFileSync(prefsFile, JSON.stringify(prefs)); } catch { /* read-only */ }
  refreshDockMenu();   // every preference shows in the menu; the Dock's copy is static, so rebuild it
};

/** @type {BrowserWindow} */ let win;
/** @type {Tray} */ let tray;
let state = { saver: false, form: prefs.form };
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
  applyOnTop();
  win.setIgnoreMouseEvents(true, { forward: true });   // until the page says the pointer is on the model
  win.once('ready-to-show', () => win.showInactive());
  win.on('moved', savePosition);

  const query = { pet: '1', size: prefs.size, ...(prefs.form === 'plan' ? { view: 'plan' } : {}) };
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

function applyOnTop() {
  // 'floating' sits above normal windows; on every Space and over full-screen apps too
  win.setAlwaysOnTop(prefs.onTop, 'floating');
  win.setVisibleOnAllWorkspaces(prefs.onTop, { visibleOnFullScreen: true, skipTransformProcessType: true });
}

/** Change size around the bottom centre, so the model stays where it stands on the desk. */
function setSize(size) {
  prefs.size = size;
  send({ type: 'size', value: size });
  fitWindow();
}

function fitWindow() {
  const [x, y] = win.getPosition(), [w0, h0] = win.getSize(), [w, h] = windowSize();
  if (w !== w0 || h !== h0) win.setBounds({ x: Math.round(x + (w0 - w) / 2), y: y + h0 - h, width: w, height: h });
  savePosition();
}

// --- messages from the page (desktop/preload.cjs) ---
ipcMain.on('pet:hit', (_e, over) => { if (!dragTimer) win.setIgnoreMouseEvents(!over, { forward: true }); });
ipcMain.on('pet:state', (_e, s) => {
  state = s;
  // the form is chosen in the page (or this menu): the window follows it
  if (s.form && s.form !== prefs.form) { prefs.form = s.form; fitWindow(); }
  refreshDockMenu();
});
ipcMain.on('pet:menu', () => buildMenu().popup({ window: win }));
ipcMain.on('pet:drag', (_e, on) => {
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
    // weather, time, date, views… are in the page's own settings, the same as on the web
    { label: '设置…', click: () => { win.showInactive(); send({ type: 'settings' }); } },
    { label: '形态', submenu: FORMS.map(([k, label]) => ({ label, type: 'radio', checked: s.form === k, click: () => send({ type: 'form', value: k }) })) },
    { type: 'separator' },
    { label: '省电（降低帧率）', type: 'checkbox', checked: s.saver, click: () => send({ type: 'saver' }) },
    { type: 'separator' },
    { label: '大小', submenu: Object.keys(SIZES).map((k) => ({ label: SIZE_LABEL[k], type: 'radio', checked: prefs.size === k, click: () => setSize(k) })) },
    { label: '浮在最上层', type: 'checkbox', checked: prefs.onTop, click: () => { prefs.onTop = !prefs.onTop; applyOnTop(); savePrefs(); } },
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
  if (win) applyOnTop();
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
