import { app, BrowserWindow, globalShortcut } from 'electron';
import fs from 'fs';
import path from 'path';
import { lifecycle } from './app-state';
import { createPetWindow } from './pet-window';
import { createCanvasWindow, toggleCanvas } from './canvas-window';
import { flushSaveOnQuit, registerIpcHandlers } from './ipc-handlers';
import { registerTimerIpc, startTimers, stopTimers } from './timers';
import { createTray } from './tray';

// Storage lives in %APPDATA%\PeepDesk; one-time migration from the legacy
// NekoBoard folder so pre-rename installs keep their boards. A standard
// Chromium --user-data-dir switch wins when present (portable profile).
const appData = app.getPath('appData');
let dataDir = path.join(appData, 'PeepDesk');
const legacyDir = path.join(appData, 'NekoBoard');
if (!fs.existsSync(dataDir) && fs.existsSync(legacyDir)) {
  try {
    fs.renameSync(legacyDir, dataDir);
  } catch {
    dataDir = legacyDir;
  }
}
app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir') || dataDir);

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', toggleCanvas);

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    registerIpcHandlers();
    registerTimerIpc();

    createPetWindow();
    createCanvasWindow();
    createTray();
    startTimers();

    globalShortcut.register('Alt+Shift+C', toggleCanvas);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createPetWindow();
        createCanvasWindow();
      }
    });
  });

  app.on('before-quit', () => {
    lifecycle.quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopTimers();
    flushSaveOnQuit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
