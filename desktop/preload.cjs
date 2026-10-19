// The page's only way to talk to the shell (src/ui/pet.ts reads it as window.konbiniDesktop).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('konbiniDesktop', {
  /** the pointer is (or isn't) on the model: catch clicks there, let them through elsewhere */
  setHit: (over) => ipcRenderer.send('pet:hit', !!over),
  /** the window follows the cursor between drag(true) and drag(false) */
  drag: (on) => ipcRenderer.send('pet:drag', !!on),
  showMenu: () => ipcRenderer.send('pet:menu'),
  setState: (state) => ipcRenderer.send('pet:state', state),
  /** the window's size (the page's size slider) and where its foot stands (screen px); the shell keeps it on the screen */
  setWindow: (w, h, footX, footY) => ipcRenderer.send('pet:window', Math.round(w), Math.round(h), footX, footY),
  onAction: (fn) => { ipcRenderer.on('pet:action', (_e, action) => fn(action)); },
  /** the cursor over the window (page coordinates), or null once it has left: watched by the shell, see main.js */
  onPointer: (fn) => { ipcRenderer.on('pet:pointer', (_e, p) => fn(p)); },
});
