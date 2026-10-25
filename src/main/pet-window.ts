import { app, BrowserWindow, nativeImage, screen } from 'electron';
import path from 'path';

export const PET_NORMAL_SIZE = { width: 88, height: 88 };
export const PET_ALERT_SIZE = { width: 140, height: 180 };
export const PET_SIZE = PET_NORMAL_SIZE;

let appIconInstance: ReturnType<typeof nativeImage.createFromPath> | null = null;
function getAppIconInstance(): ReturnType<typeof nativeImage.createFromPath> {
  if (!appIconInstance && typeof nativeImage !== 'undefined' && nativeImage?.createFromPath) {
    appIconInstance = nativeImage.createFromPath(path.join(__dirname, '../../assets/app-icon.png'));
  }
  return appIconInstance!;
}

export const APP_ICON = new Proxy({} as ReturnType<typeof nativeImage.createFromPath>, {
  get(_target, prop) {
    const inst = getAppIconInstance();
    const val = (inst as any)?.[prop];
    return typeof val === 'function' ? val.bind(inst) : val;
  }
});

let petWindow: BrowserWindow | null = null;

export function createPetWindow(): BrowserWindow {
  const bounds = screen.getPrimaryDisplay().bounds;

  petWindow = new BrowserWindow({
    ...PET_NORMAL_SIZE,
    x: bounds.width - PET_NORMAL_SIZE.width - 24,
    y: 60,
    frame: false,
    title: 'PeepJam',
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
      sandbox: true
    }
  });

  petWindow.loadFile(path.join(__dirname, '../../src/renderer/pet/index.html'));
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  // 'screen-saver' level = above every other window, incl. fullscreen apps, on every display.
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setIgnoreMouseEvents(true, { forward: true });
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

export function setPetIgnoreMouse(ignore: boolean): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

export function setPetBubbleMode(show: boolean): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const currentBounds = petWindow.getBounds();
  if (show && currentBounds.height < PET_ALERT_SIZE.height) {
    const dy = PET_ALERT_SIZE.height - PET_NORMAL_SIZE.height;
    const dx = Math.round((PET_ALERT_SIZE.width - PET_NORMAL_SIZE.width) / 2);
    petWindow.setBounds({
      x: x - dx,
      y: y - dy,
      width: PET_ALERT_SIZE.width,
      height: PET_ALERT_SIZE.height
    });
  } else if (!show && currentBounds.height > PET_NORMAL_SIZE.height) {
    const dy = PET_ALERT_SIZE.height - PET_NORMAL_SIZE.height;
    const dx = Math.round((PET_ALERT_SIZE.width - PET_NORMAL_SIZE.width) / 2);
    petWindow.setBounds({
      x: x + dx,
      y: y + dy,
      width: PET_NORMAL_SIZE.width,
      height: PET_NORMAL_SIZE.height
    });
  }
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
