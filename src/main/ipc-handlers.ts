import { app, clipboard, dialog, ipcMain, session, shell } from 'electron';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { pathToFileURL } from 'url';
import { IPC } from '../shared/ipc';
import { DEFAULT_SETTINGS, type AppState, type LinkPreview, type ReminderSettings } from '../shared/types';
import { movePetBy } from './pet-window';
import { getCanvasWindow, toggleCanvas } from './canvas-window';

const SAVE_DEBOUNCE_MS = 500;
const PREVIEW_TIMEOUT_MS = 8000;
const PREVIEW_HTML_CAP = 300_000;
const VIDEO_EXT = ['.mp4', '.webm', '.m4v', '.mov'];
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

function mediaDir(): string {
  const dir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function importVideoFile(srcPath: string): { name: string; size: number } | null {
  try {
    const src = path.normalize(srcPath);
    const ext = path.extname(src).toLowerCase();
    if (!VIDEO_EXT.includes(ext)) return null;
    const size = fs.statSync(src).size;
    if (size === 0 || size > MAX_VIDEO_BYTES) return null;
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.copyFileSync(src, path.join(mediaDir(), name));
    return { name, size };
  } catch {
    return null;
  }
}

function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(target);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function extractMeta(html: string, prop: string): string | null {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

async function fetchPreviewHtml(target: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PeepDeskPreview/1.0)', accept: 'text/html' }
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < PREVIEW_HTML_CAP) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    void reader.cancel();
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let statePath: string | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let pendingState: AppState | null = null;

let currentSettings: ReminderSettings = structuredClone(DEFAULT_SETTINGS);

export function getSettings(): ReminderSettings {
  return currentSettings;
}

function cacheSettings(state: AppState): void {
  const s = state.settings;
  if (!s) return;
  currentSettings = {
    water: { ...DEFAULT_SETTINGS.water, ...s.water },
    chai: { ...DEFAULT_SETTINGS.chai, ...s.chai }
  };
}

function getStatePath(): string {
  if (!statePath) {
    statePath = path.join(app.getPath('userData'), 'nekoboard-state.json');
  }
  return statePath;
}

export const defaultState: AppState = {
  items: [],
  timers: { lastHydration: Date.now(), lastBreak: Date.now() }
};

function flushSave(): void {
  if (!pendingState) return;
  const snapshot = pendingState;
  pendingState = null;
  const file = getStatePath();
  try {
    // Atomic: write beside the target then rename over it, so a crash mid-write
    // can never leave the board state half-saved.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    // Fail-silent: disk write issues must never crash the companion app.
  }
}

function scheduleSave(state: AppState): void {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, SAVE_DEBOUNCE_MS);
}

function isValidState(value: unknown): value is AppState {
  const s = value as AppState;
  return (
    !!s &&
    Array.isArray(s.items) &&
    !!s.timers &&
    typeof s.timers.lastHydration === 'number' &&
    typeof s.timers.lastBreak === 'number'
  );
}

export function registerIpcHandlers(): void {
  ipcMain.on(IPC.toggleCanvas, toggleCanvas);
  ipcMain.on(IPC.movePet, (_event, delta: { dx: number; dy: number }) => {
    if (typeof delta?.dx === 'number' && typeof delta?.dy === 'number') {
      movePetBy(delta.dx, delta.dy);
    }
  });

  ipcMain.on(IPC.stateSave, (_event, state: unknown) => {
    if (isValidState(state)) {
      cacheSettings(state);
      scheduleSave(state);
    }
  });

  ipcMain.on(IPC.openLink, (_event, url: unknown) => {
    const target = normalizeHttpUrl(url);
    if (target) void shell.openExternal(target);
  });

  ipcMain.handle(IPC.clipRead, () => clipboard.readText());

  ipcMain.handle(IPC.linkPreview, async (_event, url: unknown): Promise<LinkPreview | null> => {
    const target = normalizeHttpUrl(url);
    if (!target) return null;
    const html = await fetchPreviewHtml(target);
    if (!html) return null;
    const image = extractMeta(html, 'og:image');
    const title = extractMeta(html, 'og:title') ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');
    if (!title && !description && !image) return null;
    let resolvedImage: string | undefined;
    if (image) {
      try {
        resolvedImage = new URL(image, target).toString();
      } catch {
        // malformed og:image — skip
      }
    }
    return {
      title: title ?? undefined,
      description: description ?? undefined,
      image: resolvedImage,
      siteName: new URL(target).hostname.replace(/^www\./, ''),
      url: target
    };
  });

  ipcMain.handle(IPC.videoPick, async () => {
    const win = getCanvasWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Pin a video to the canvas',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: VIDEO_EXT.map(e => e.slice(1)) }]
    };
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (res.canceled || !res.filePaths[0]) return null;
    return importVideoFile(res.filePaths[0]);
  });

  ipcMain.handle(IPC.videoImport, (_event, srcPath: unknown) => {
    if (typeof srcPath !== 'string') return null;
    return importVideoFile(srcPath);
  });

  ipcMain.handle(IPC.videoUrl, (_event, name: unknown) => {
    if (typeof name !== 'string' || !name) return null;
    const file = path.join(mediaDir(), path.basename(name));
    try {
      if (!fs.statSync(file).isFile()) return null;
    } catch {
      return null;
    }
    return pathToFileURL(file).toString();
  });

  ipcMain.on(IPC.videoForget, (_event, name: unknown) => {
    if (typeof name !== 'string' || !name) return;
    try {
      fs.rmSync(path.join(mediaDir(), path.basename(name)));
    } catch {
      // already gone or never existed — fail-silent
    }
  });

  ipcMain.on(IPC.videoOpen, (_event, content: unknown) => {
    if (typeof content !== 'string' || !content) return;
    if (content.startsWith('yt:')) {
      const id = content.slice(3);
      if (/^[\w-]{6,}$/.test(id)) void shell.openExternal(`https://www.youtube.com/watch?v=${id}`);
    } else if (content.startsWith('media:')) {
      const file = path.join(mediaDir(), path.basename(content.slice(6)));
      if (fs.existsSync(file)) void shell.openPath(file);
    }
  });

  // YouTube error 153: file:// pages send no Referer, and the embed player refuses to
  // configure without one — stamp a synthetic origin onto the iframe document requests.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'] },
    (details, callback) => {
      if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://peepdesk.local/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  ipcMain.handle(IPC.stateLoad, () => {
    try {
      const raw = fs.readFileSync(getStatePath(), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) {
        cacheSettings(parsed);
        return parsed;
      }
    } catch {
      // first launch or unreadable file — fall through to defaults
    }
    return { ...defaultState, timers: { ...defaultState.timers } };
  });
}

export function flushSaveOnQuit(): void {
  if (saveTimer) clearTimeout(saveTimer);
  flushSave();
}
