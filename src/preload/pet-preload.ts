import { contextBridge, ipcRenderer } from 'electron';
import type { AlertKind, TimerAction } from '../shared/types';

// Channel names inlined: sandboxed Electron preloads cannot require relative
// local modules (see Electron's sandboxed_renderer/preload.ts module resolver).
const IPC = {
  toggleCanvas: 'window:toggle-canvas',
  movePet: 'window:move-pet',
  petIgnoreMouse: 'pet:ignore-mouse',
  petBubbleMode: 'pet:bubble-mode',
  timerAlert: 'timer:alert',
  timerAction: 'timer:action'
} as const;

contextBridge.exposeInMainWorld('petApi', {
  toggleCanvas: () => ipcRenderer.send(IPC.toggleCanvas),
  movePet: (dx: number, dy: number) => ipcRenderer.send(IPC.movePet, { dx, dy }),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send(IPC.petIgnoreMouse, ignore),
  setBubbleMode: (show: boolean) => ipcRenderer.send(IPC.petBubbleMode, show),
  onTimerAlert: (callback: (kind: AlertKind) => void) => {
    ipcRenderer.on(IPC.timerAlert, (_event, kind: AlertKind) => callback(kind));
  },
  timerAction: (kind: AlertKind, action: TimerAction) =>
    ipcRenderer.send(IPC.timerAction, { kind, action })
});
