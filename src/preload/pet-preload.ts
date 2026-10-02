import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { AlertKind, TimerAction } from '../shared/types';

contextBridge.exposeInMainWorld('petApi', {
  toggleCanvas: () => ipcRenderer.send(IPC.toggleCanvas),
  movePet: (dx: number, dy: number) => ipcRenderer.send(IPC.movePet, { dx, dy }),
  onTimerAlert: (callback: (kind: AlertKind) => void) => {
    ipcRenderer.on(IPC.timerAlert, (_event, kind: AlertKind) => callback(kind));
  },
  timerAction: (kind: AlertKind, action: TimerAction) =>
    ipcRenderer.send(IPC.timerAction, { kind, action })
});
