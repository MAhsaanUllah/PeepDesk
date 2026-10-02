import { BrowserWindow } from 'electron';
import path from 'path';
import { lifecycle } from './app-state';
import { APP_ICON } from './pet-window';

let canvasWindow: BrowserWindow | null = null;

export function createCanvasWindow(): BrowserWindow {
  canvasWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 560,
    minHeight: 400,
    frame: false,
    title: 'PeepDesk Canvas',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#334155',
      height: 54
    },
    transparent: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    backgroundColor: '#fafbfc',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/canvas-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  canvasWindow.loadFile(path.join(__dirname, '../../src/renderer/canvas/index.html'));
  // Lock the main frame to our own page: no window.open, no top-level navigation.
  canvasWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  canvasWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  // Native close button must not destroy the window: hotkey/pet toggle needs it alive.
  canvasWindow.on('close', (e) => {
    if (!lifecycle.quitting) {
      e.preventDefault();
      canvasWindow?.hide();
    }
  });
  // A maximized always-on-top window would block every other app — unpin while maximized.
  canvasWindow.on('maximize', () => canvasWindow?.setAlwaysOnTop(false));
  canvasWindow.on('unmaximize', () => canvasWindow?.setAlwaysOnTop(true));
  canvasWindow.on('closed', () => {
    canvasWindow = null;
  });
  return canvasWindow;
}

export function getCanvasWindow(): BrowserWindow | null {
  return canvasWindow;
}

export function toggleCanvas(): void {
  if (!canvasWindow) return;
  if (canvasWindow.isVisible()) {
    canvasWindow.hide();
  } else {
    canvasWindow.show();
    canvasWindow.focus();
  }
}
