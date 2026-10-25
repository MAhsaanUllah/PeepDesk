import { type IpcMainEvent, type IpcMainInvokeEvent, ipcMain } from 'electron';
import { getCanvasWindow } from './canvas-window';
import { getPetWindow } from './pet-window';

export type AllowedSender = 'canvas' | 'pet';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  senderType?: AllowedSender;
}

let customCanvasGetter: (() => any) | null = null;
let customPetGetter: (() => any) | null = null;

export function setWindowGettersForTest(getCanvas: (() => any) | null, getPet: (() => any) | null): void {
  customCanvasGetter = getCanvas;
  customPetGetter = getPet;
}

/**
 * Validate that an incoming IPC event originates from a trusted, top-level main frame
 * of an authorized BrowserWindow with expected file URL.
 */
export function validateIpcSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  allowed: AllowedSender | readonly AllowedSender[]
): ValidationResult {
  const allowedList = Array.isArray(allowed) ? allowed : [allowed];

  // 1. Validate webContents sender exists and is not destroyed
  if (!event.sender || event.sender.isDestroyed()) {
    return { valid: false, reason: 'Sender webContents is missing or destroyed' };
  }

  // 2. Validate senderFrame exists
  const frame = event.senderFrame;
  if (!frame) {
    return { valid: false, reason: 'Sender frame is missing' };
  }

  // 3. Strict anti-iframe check: must be the top-level main frame
  if (frame.parent !== null || frame.top !== frame) {
    return { valid: false, reason: 'IPC invocation from non-top-level frame / iframe is rejected' };
  }

  // 4. Validate senderFrame URL scheme and expected target
  let frameUrl: URL;
  try {
    frameUrl = new URL(frame.url);
  } catch {
    return { valid: false, reason: 'Invalid or unparseable frame URL' };
  }

  if (frameUrl.protocol !== 'file:') {
    return { valid: false, reason: `Invalid frame protocol: ${frameUrl.protocol}` };
  }

  const normalizedPath = frameUrl.pathname.replace(/\\/g, '/').toLowerCase();

  // 5. Match sender against allowed window webContents and expected URL path
  const canvasWin = customCanvasGetter ? customCanvasGetter() : getCanvasWindow();
  const petWin = customPetGetter ? customPetGetter() : getPetWindow();
  const senderId = event.sender.id;

  let matchedSenderType: AllowedSender | null = null;

  if (
    allowedList.includes('canvas') &&
    canvasWin &&
    !canvasWin.isDestroyed() &&
    canvasWin.webContents.id === senderId &&
    normalizedPath.endsWith('/canvas/index.html')
  ) {
    matchedSenderType = 'canvas';
  } else if (
    allowedList.includes('pet') &&
    petWin &&
    !petWin.isDestroyed() &&
    petWin.webContents.id === senderId &&
    normalizedPath.endsWith('/pet/index.html')
  ) {
    matchedSenderType = 'pet';
  }

  if (!matchedSenderType) {
    return {
      valid: false,
      reason: `Sender webContents ${senderId} (url: ${frame.url}) is not authorized for allowed window scope: ${allowedList.join(', ')}`
    };
  }

  return { valid: true, senderType: matchedSenderType };
}

/**
 * Register an authorized one-way IPC event listener (ipcMain.on).
 * Unauthenticated or unauthorized callers are silently dropped after logging a security warning.
 */
export function registerAuthorizedOn<T = any>(
  channel: string,
  allowed: AllowedSender | readonly AllowedSender[],
  listener: (event: IpcMainEvent, ...args: any[]) => void
): void {
  ipcMain.on(channel, (event: IpcMainEvent, ...args: any[]) => {
    const validation = validateIpcSender(event, allowed);
    if (!validation.valid) {
      console.warn(`[SECURITY] Rejected unauthorized 'on' invocation on channel '${channel}': ${validation.reason}`);
      return;
    }
    listener(event, ...args);
  });
}

/**
 * Register an authorized two-way IPC invoke handler (ipcMain.handle).
 * Unauthenticated or unauthorized callers reject with an Error.
 */
export function registerAuthorizedHandle<T = any>(
  channel: string,
  allowed: AllowedSender | readonly AllowedSender[],
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: any[]) => {
    const validation = validateIpcSender(event, allowed);
    if (!validation.valid) {
      const msg = `[SECURITY] Rejected unauthorized 'handle' invocation on channel '${channel}': ${validation.reason}`;
      console.warn(msg);
      throw new Error(`Unauthorized IPC call on channel '${channel}'`);
    }
    return handler(event, ...args);
  });
}
