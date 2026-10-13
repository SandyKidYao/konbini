// Desktop pet shell (macOS first): a transparent, frameless, floating window that shows only the model
// (the web app with ?pet=1). Clicks fall through wherever the model isn't — the page reports when the pointer
// is on it. Right-click on the model, or the menu-bar icon, opens the native menu.
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
const SIZE_LABEL = { small: '小', medium: '中', large: '大' };
const WEATHER = [['clear', '晴'], ['partly', '少云'], ['cloudy', '阴'], ['fog', '雾'], ['drizzle', '小雨'], ['rain', '雨'], ['storm', '雷雨'], ['snow', '雪']];
const TIMES = [['dawn', '清晨'], ['noon', '正午'], ['dusk', '傍晚'], ['night', '深夜']];
const SEASONS = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];

const probe = process.argv.find((a) => a.startsWith('--probe'))?.split('=')[1] ?? (process.argv.includes('--probe') ? 'pet-probe.png' : null);

// --- preferences: size, floating, where the window was ---
const prefsFile = path.join(app.getPath('userData'), 'pet.json');
const prefs = { size: 'medium', onTop: true, x: null, y: null };
try { Object.assign(prefs, JSON.parse(fs.readFileSync(prefsFile, 'utf8'))); } catch { /* first run */ }
if (!SIZES[prefs.size]) prefs.size = 'medium';
const savePrefs = () => { try { fs.writeFileSync(prefsFile, JSON.stringify(prefs)); } catch { /* read-only */ } };

/** @type {BrowserWindow} */ let win;
/** @type {Tray} */ let tray;
let state = { weather: 'clear', live: false, spin: false, sound: false, season: 'autumn', pickedDate: false, saver: false };
let dragTimer = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win?.showInactive());

app.whenReady().then(() => {
  app.dock?.hide();   // lives in the menu bar, not the Dock or the app switcher
  createWindow();
  createTray();
  if (probe) void runProbe(probe);
});
app.on('window-all-closed', () => app.quit());

function createWindow() {
  const [w, h] = SIZES[prefs.size];
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

  const dev = process.env.KONBINI_DEV_URL;
  if (dev) void win.loadURL(`${dev}${dev.includes('?') ? '&' : '?'}pet=1`);
  else void win.loadFile(path.join(here, '..', 'dist', 'index.html'), { query: { pet: '1' } });
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
  const [x, y] = win.getPosition(), [w0, h0] = win.getSize(), [w, h] = SIZES[size];
  prefs.size = size;
  win.setBounds({ x: Math.round(x + (w0 - w) / 2), y: y + h0 - h, width: w, height: h });
  savePosition();
}

// --- messages from the page (desktop/preload.cjs) ---
ipcMain.on('pet:hit', (_e, over) => { if (!dragTimer) win.setIgnoreMouseEvents(!over, { forward: true }); });
ipcMain.on('pet:state', (_e, s) => { state = s; });
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

function buildMenu() {
  const s = state;
  return Menu.buildFromTemplate([
    { label: '天气', submenu: WEATHER.map(([k, label]) => ({ label, type: 'radio', checked: !s.live && s.weather === k, click: () => send({ type: 'weather', value: k }) })) },
    { label: '时刻', submenu: TIMES.map(([k, label]) => ({ label, click: () => send({ type: 'time', value: k }) })) },
    { label: '季节', submenu: [
      ...SEASONS.map(([k, label]) => ({ label, type: 'radio', checked: s.season === k, click: () => send({ type: 'season', value: k }) })),
      { type: 'separator' },
      { label: '回到今天', enabled: s.pickedDate, click: () => send({ type: 'today' }) },
    ] },
    { label: '实况（跟随当地天气）', type: 'checkbox', checked: s.live, click: () => send({ type: 'live' }) },
    { type: 'separator' },
    { label: '转台', type: 'checkbox', checked: s.spin, click: () => send({ type: 'spin' }) },
    { label: '声音', type: 'checkbox', checked: s.sound, click: () => send({ type: 'sound' }) },
    { label: '省电（降低帧率）', type: 'checkbox', checked: s.saver, click: () => send({ type: 'saver' }) },
    { type: 'separator' },
    { label: '大小', submenu: Object.keys(SIZES).map((k) => ({ label: SIZE_LABEL[k], type: 'radio', checked: prefs.size === k, click: () => setSize(k) })) },
    { label: '浮在最上层', type: 'checkbox', checked: prefs.onTop, click: () => { prefs.onTop = !prefs.onTop; applyOnTop(); savePrefs(); } },
    { type: 'separator' },
    { label: '退出', accelerator: 'Command+Q', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🏪');
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
