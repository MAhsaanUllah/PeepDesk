import { ipcMain } from 'electron';
import { IPC } from '../shared/ipc';
import type { AlertKind, TimerAction } from '../shared/types';
import { getSettings } from './ipc-handlers';
import { getPetWindow } from './pet-window';

// coarse clock; intervals derived from timestamps
const SNOOZE_MS = 10 * 60 * 1000; // snooze = re-fire after 10 min
const TICK_MS = 30 * 1000;

const lastAlertAt: Record<AlertKind, number> = {
  water: Date.now(),
  break: Date.now()
};

function intervalMs(kind: AlertKind): number {
  const s = getSettings();
  return (kind === 'water' ? s.water.everyMin : s.chai.everyMin) * 60 * 1000;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0);
}

function inWindow(from: string, to: string): boolean {
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  const f = minutesOf(from);
  const t = minutesOf(to);
  return f <= t ? now >= f && now < t : now >= f || now < t; // supports overnight windows
}

let interval: NodeJS.Timeout | null = null;

function fire(kind: AlertKind): void {
  lastAlertAt[kind] = Date.now();
  getPetWindow()?.webContents.send(IPC.timerAlert, kind);
}

function check(): void {
  const now = Date.now();
  const s = getSettings();
  if (s.water.enabled && now - lastAlertAt.water >= intervalMs('water')) fire('water');
  // Outside the chai window nothing fires and the clock keeps "owing" one,
  // so the first alert lands right as the window opens.
  if (s.chai.enabled && inWindow(s.chai.from, s.chai.to) && now - lastAlertAt.break >= intervalMs('break')) {
    fire('break');
  }
}

export function startTimers(): void {
  if (interval) return;
  interval = setInterval(check, TICK_MS);
}

export function stopTimers(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

export function registerTimerIpc(): void {
  ipcMain.on(
    IPC.timerAction,
    (_event, payload: { kind: AlertKind; action: TimerAction }) => {
      const { kind, action } = payload ?? {};
      if (kind !== 'water' && kind !== 'break') return;
      if (action === 'snooze') {
        // Push the next alert out by exactly one snooze window.
        lastAlertAt[kind] = Date.now() - (intervalMs(kind) - SNOOZE_MS);
      } else if (action === 'dismiss') {
        lastAlertAt[kind] = Date.now();
      }
    }
  );
}
