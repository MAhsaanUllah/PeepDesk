// QA-G4 main-process bootstrap bridge, installed via NODE_OPTIONS=--require.
// IMPORTANT: installing during Node bootstrap (module top-level) breaks
// Electron's internal init (app.whenReady never fires, no windows). The real
// install therefore DEFERS to setImmediate - after the entry module finished
// loading - and shares the CJS module cache with the app (same instances).
function install() {
  try {
    const path = require('path');
    const root = path.resolve(__dirname, '..');
    const cw = require(path.join(root, 'dist', 'main', 'canvas-window.js'));
    const pw = require(path.join(root, 'dist', 'main', 'pet-window.js'));
    const ipc = require(path.join(root, 'dist', 'main', 'ipc-handlers.js'));
    const electron = require('electron');
    globalThis.__g4CW = () => cw.getCanvasWindow();
    globalThis.__g4PW = () => pw.getPetWindow();
    globalThis.__g4getSettings = () => ipc.getSettings();
    // screen is not materialized at bootstrap time -> lazy accessor
    globalThis.__g4screen = () => electron.screen;
    globalThis.__g4ipcMain = () => electron.ipcMain;
    globalThis.__g4bridgeError = null;
  } catch (e) {
    globalThis.__g4CW = null;
    globalThis.__g4PW = null;
    globalThis.__g4screen = null;
    globalThis.__g4bridgeError = String((e && e.message) || e);
  }
}
setImmediate(install);
