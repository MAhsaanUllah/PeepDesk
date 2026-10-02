import { app, BrowserWindow, nativeImage, screen } from 'electron';
import path from 'path';

export const PET_SIZE = { width: 130, height: 180 };

export const APP_ICON = nativeImage.createFromPath(path.join(__dirname, '../../assets/app-icon.png'));

let petWindow: BrowserWindow | null = null;

export function createPetWindow(): BrowserWindow {
  const bounds = screen.getPrimaryDisplay().bounds;

  petWindow = new BrowserWindow({
    ...PET_SIZE,
    x: bounds.width - PET_SIZE.width - 24,
    y: 60,
    frame: false,
    title: 'PeepDesk',
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    // Pet is an overlay; canvas is the single taskbar/alt-tab presence.
    skipTaskbar: true,
    hasShadow: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  petWindow.loadFile(path.join(__dirname, '../../src/renderer/pet/index.html'));
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  // 'screen-saver' level = above every other window, incl. fullscreen apps, on every display.
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.on('closed', () => {
    petWindow = null;
    // Canvas hides instead of closing, so pet close is the real exit path.
    app.quit();
  });
  return petWindow;
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow;
}

export function togglePet(): void {
  if (!petWindow) return;
  petWindow.isVisible() ? petWindow.hide() : petWindow.show();
}

export function movePetBy(dx: number, dy: number): void {
  if (!petWindow) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
}
