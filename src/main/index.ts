import { app, BrowserWindow, globalShortcut, session } from 'electron';
import fs from 'fs';
import path from 'path';
import { lifecycle } from './app-state';
import { createPetWindow } from './pet-window';
import { createCanvasWindow, toggleCanvas } from './canvas-window';
import { flushSaveOnQuit, registerIpcHandlers } from './ipc-handlers';
import { registerTimerIpc, startTimers, stopTimers } from './timers';
import { createTray } from './tray';

export function configureSessionPermissions(ses = session.defaultSession): void {
  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    // Legitimate permission: fullscreen for video embeds (e.g. YouTube allowfullscreen)
    if (permission === 'fullscreen') {
      callback(true);
      return;
    }

    // Legitimate permission: clipboard-read / clipboard-sanitized-write for local application main frames
    if (
      (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') &&
      details?.isMainFrame &&
      details?.requestingUrl?.startsWith('file:')
    ) {
      callback(true);
      return;
    }

    // Explicitly deny all unneeded permissions:
    // camera, microphone (media), geolocation, notifications, midi, midiSysex,
    // pointerLock, keyboardLock, openExternal, display-capture, idle-detection,
    // speaker-selection, storage-access, top-level-storage-access, window-management,
    // fileSystem, usb, serial, hid, etc.
    callback(false);
  });

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    // Legitimate permission: fullscreen
    if (permission === 'fullscreen') {
      return true;
    }

    // Legitimate permission: clipboard check for local application main frames
    if (
      (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') &&
      details?.isMainFrame &&
      (details?.requestingUrl?.startsWith('file:') || requestingOrigin?.startsWith('file:') || requestingOrigin === 'null' || requestingOrigin === '')
    ) {
      return true;
    }

    // Explicitly deny all unneeded permissions
    return false;
  });
}

// Storage lives in %APPDATA%\PeepDesk; one-time migration from the legacy
// NekoBoard folder so pre-rename installs keep their boards. A standard
// Chromium --user-data-dir switch wins when present (portable profile).
if (typeof app !== 'undefined' && app?.getPath) {
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

  const customDir = app.commandLine?.getSwitchValue('user-data-dir');
  app.setPath('userData', customDir ? path.resolve(customDir) : dataDir);

  const gotLock = app.requestSingleInstanceLock();

  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', toggleCanvas);

    app.whenReady().then(() => {
      if (process.platform === 'win32') {
        app.setLoginItemSettings({ openAtLogin: true });
      }

      configureSessionPermissions();
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
}

