import { app, clipboard, session, shell } from 'electron';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { pathToFileURL } from 'url';
import { IPC } from '../shared/ipc';
import { DEFAULT_SETTINGS, type AppState, type LinkPreview, type ReminderSettings } from '../shared/types';
import { movePetBy, setPetBubbleMode, setPetIgnoreMouse } from './pet-window';
import { getCanvasWindow, toggleCanvas, updateCanvasTitleBarTheme } from './canvas-window';
import { registerAuthorizedHandle, registerAuthorizedOn } from './ipc-auth';
import { candidateTimestamp, isSkewArtifactStamp, skewFallbackSort } from './state-recovery';
import {
  boardMetaList,
  cloneDoc,
  flattenActiveBoard,
  freshDoc,
  isValidStateFlat,
  isValidStateV2,
  looksLikeV2,
  migrateV1ToV2,
  newBoardId,
  normalizeActiveBoard,
  unarchivedCount,
  upsertBoardFromFlat
} from './boards';
import type { AppStateV2, BoardMeta, BoardsResult } from '../shared/types';
import { isTestMode, setMockDialogResult, showOpenDialogSafe } from './test-seam';
import {
  guardedPreviewFetch,
  parsePreviewTarget,
  setPreviewDnsOverride,
  getPreviewConnectionCount,
  resetPreviewTestState,
  previewProbeResolve
} from './url-guard';

const SAVE_DEBOUNCE_MS = 500;
const VIDEO_EXT = ['.mp4', '.webm', '.m4v', '.mov'];
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function mediaDir(): string {
  const dir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function validateFileSignature(filePath: string, ext: string): boolean {
  let fd: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 4) return false;

    // Special SVG handling: check structure and active content risks
    if (ext === '.svg') {
      if (stat.size > 10 * 1024 * 1024) return false; // reject oversized SVGs
      const content = fs.readFileSync(filePath, 'utf8');
      // Must contain an <svg tag
      if (!/<svg[\s>]/i.test(content)) return false;
      // Active content security checks: reject script tags, javascript: URLs, objects/embeds/iframes, event handlers
      if (/<script[\s>]/i.test(content)) return false;
      if (/javascript\s*:/i.test(content)) return false;
      if (/<(?:iframe|object|embed|foreignObject)[\s>]/i.test(content)) return false;
      if (/\son[a-z]+\s*=/i.test(content)) return false;
      return true;
    }

    const buffer = Buffer.alloc(512);
    fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    if (bytesRead < 4) return false;

    switch (ext) {
      case '.png':
        return (
          bytesRead >= 8 &&
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47 &&
          buffer[4] === 0x0d &&
          buffer[5] === 0x0a &&
          buffer[6] === 0x1a &&
          buffer[7] === 0x0a
        );

      case '.jpg':
      case '.jpeg':
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

      case '.gif':
        return (
          bytesRead >= 6 &&
          buffer[0] === 0x47 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x38 &&
          (buffer[4] === 0x37 || buffer[4] === 0x39) &&
          buffer[5] === 0x61
        );

      case '.webp':
        return (
          bytesRead >= 12 &&
          buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
          buffer.subarray(8, 12).toString('ascii') === 'WEBP'
        );

      case '.bmp':
        return buffer[0] === 0x42 && buffer[1] === 0x4d;

      case '.ico':
        return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00;

      case '.mp4':
      case '.m4v':
      case '.mov':
        if (bytesRead >= 8) {
          const brand = buffer.subarray(4, 8).toString('ascii');
          if (brand === 'ftyp' || brand === 'moov' || brand === 'mdat') return true;
        }
        return false;

      case '.webm':
        return (
          bytesRead >= 4 &&
          buffer[0] === 0x1a &&
          buffer[1] === 0x45 &&
          buffer[2] === 0xdf &&
          buffer[3] === 0xa3
        );

      default:
        return false;
    }
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

function importImageFile(srcPath: string): { name: string; size: number } | null {
  try {
    const src = path.normalize(srcPath);
    if (!fs.existsSync(src)) return null;
    const stat = fs.statSync(src);
    if (!stat.isFile()) return null;
    const ext = path.extname(src).toLowerCase();
    if (!IMAGE_EXT.includes(ext)) return null;
    if (stat.size === 0 || stat.size > MAX_IMAGE_BYTES) return null;
    if (!validateFileSignature(src, ext)) return null;

    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.copyFileSync(src, path.join(mediaDir(), name));
    return { name, size: stat.size };
  } catch {
    return null;
  }
}

function importVideoFile(srcPath: string): { name: string; size: number } | null {
  try {
    const src = path.normalize(srcPath);
    if (!fs.existsSync(src)) return null;
    const stat = fs.statSync(src);
    if (!stat.isFile()) return null;
    const ext = path.extname(src).toLowerCase();
    if (!VIDEO_EXT.includes(ext)) return null;
    if (stat.size === 0 || stat.size > MAX_VIDEO_BYTES) return null;
    if (!validateFileSignature(src, ext)) return null;

    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.copyFileSync(src, path.join(mediaDir(), name));
    return { name, size: stat.size };
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

let statePath: string | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let pendingState: AppState | null = null;
// QA-G5B A2: in-memory truth for the multi-board document. Seeded by the
// stateLoad handler at boot; every flush merges the pending flat save into
// the active record before writing the whole wrapper to disk.
let boardsDoc: AppStateV2 | null = null;

let currentSettings: ReminderSettings = structuredClone(DEFAULT_SETTINGS);

export function getSettings(): ReminderSettings {
  return currentSettings;
}

function cacheSettings(state: Pick<AppState, 'timers' | 'settings'>): void {
  const s = state.settings;
  if (!s) return;
  currentSettings = {
    water: { ...DEFAULT_SETTINGS.water, ...s.water },
    chai: { ...DEFAULT_SETTINGS.chai, ...s.chai }
  };
}

function getStatePath(): string {
  if (!statePath) {
    const file = path.join(app.getPath('userData'), 'peepdesk-state.json');
    const legacy = path.join(app.getPath('userData'), 'nekoboard-state.json');
    if (!fs.existsSync(file) && fs.existsSync(legacy)) {
      try {
        fs.renameSync(legacy, file);
      } catch {
        statePath = legacy;
        return statePath;
      }
    }
    statePath = file;
  }
  return statePath;
}

export const defaultState: AppState = {
  items: [],
  timers: { lastHydration: Date.now(), lastBreak: Date.now() }
};

/**
 * QA-G5B A2: flush merges the pending flat renderer save into the active
 * board record, then stamps + writes the whole wrapper atomically. Returns
 * false when the write fails so board-switch/create/archive flows can cancel
 * or roll back instead of reporting success over lost data.
 * `force` makes a no-pending-change flush still attempt a real disk write,
 * so board-list mutations (create/rename/archive) are durably persisted AND
 * verified against a failing/denied filesystem instead of being skipped.
 */
function flushSave(force = false): boolean {
  const flat = pendingState ?? (force ? flattenActiveBoard(boardsDoc ?? freshDoc()) : null);
  if (!flat) return true;
  pendingState = null;
  const file = getStatePath();
  try {
    // Explicit timestamp to evaluate candidate freshness during recovery
    const now = Date.now();
    const doc = upsertBoardFromFlat(boardsDoc ?? migrateV1ToV2(flat), flat, now);
    boardsDoc = doc;
    doc.savedAt = now;
    const tmp = `${file}.tmp`;
    const bak = `${file}.bak`;
    fs.writeFileSync(tmp, JSON.stringify(doc), 'utf8');

    // Preserve known-good backup before replacing primary file
    if (fs.existsSync(file)) {
      try {
        const existingRaw = fs.readFileSync(file, 'utf8');
        const existingParsed: unknown = JSON.parse(existingRaw);
        if (isValidStateFlat(existingParsed) || isValidStateV2(existingParsed)) {
          fs.copyFileSync(file, bak);
        }
      } catch {
        // file is already corrupt â€” preserve whatever .bak was previously saved
      }
    }

    fs.renameSync(tmp, file);
    return true;
  } catch {
    // Fail-silent: disk write issues must never crash the companion app.
    return false;
  }
}

function cancelPendingSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
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
  registerAuthorizedOn(IPC.toggleCanvas, ['canvas', 'pet'], toggleCanvas);
  registerAuthorizedOn(IPC.movePet, 'pet', (_event, delta: { dx: number; dy: number }) => {
    if (typeof delta?.dx === 'number' && typeof delta?.dy === 'number') {
      movePetBy(delta.dx, delta.dy);
    }
  });
  registerAuthorizedOn(IPC.petIgnoreMouse, 'pet', (_event, ignore: unknown) => {
    if (typeof ignore === 'boolean') {
      setPetIgnoreMouse(ignore);
    }
  });
  registerAuthorizedOn(IPC.petBubbleMode, 'pet', (_event, show: unknown) => {
    if (typeof show === 'boolean') {
      setPetBubbleMode(show);
    }
  });

  registerAuthorizedOn(IPC.themeSet, 'canvas', (_event, theme: unknown) => {
    if (typeof theme === 'string') {
      updateCanvasTitleBarTheme(theme);
    }
  });

  registerAuthorizedOn(IPC.stateSave, 'canvas', (_event, state: unknown) => {
    if (isValidState(state)) {
      cacheSettings(state);
      scheduleSave(state);
    }
  });

  // ---- QA-G5B A2: Boards / Recent Canvases IPC (all sender-authorized) ----

  const metaResult = (doc: AppStateV2 | null, extra?: Partial<BoardsResult>): BoardsResult => ({
    ok: true,
    boards: doc ? boardMetaList(doc) : [],
    activeBoardId: doc ? doc.activeBoardId : null,
    ...extra
  });

  function flushPendingOrCancel(force = false): BoardsResult | null {
    // Serialize board mutations against pending/in-flight saves: the current
    // board MUST reach disk before the wrapper changes; otherwise the switch
    // (or create/archive/rename) is cancelled. `force` guarantees a real
    // write attempt even with no renderer-pending change.
    cancelPendingSave();
    if (!flushSave(force)) {
      return { ok: false, error: 'save-failed', ...metaDoc() };
    }
    return null;
  }

  function metaDoc(): { boards: BoardMeta[]; activeBoardId: string | null } {
    return boardsDoc
      ? { boards: boardMetaList(boardsDoc), activeBoardId: boardsDoc.activeBoardId }
      : { boards: [], activeBoardId: null };
  }

  registerAuthorizedHandle(IPC.boardsList, 'canvas', (): BoardsResult => {
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    return metaResult(boardsDoc);
  });

  registerAuthorizedHandle(IPC.boardCreate, 'canvas', (_event, name: unknown): BoardsResult => {
    if (typeof name !== 'string' || !name.trim()) {
      return { ok: false, error: 'invalid-name', ...metaDoc() };
    }
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    // Flush pending OLD-board content while boardsDoc.activeBoardId still
    // points at the old record - otherwise the pending save merges into the
    // newly-created board instead of the board it came from.
    const preFailed = flushPendingOrCancel(false);
    if (preFailed) return preFailed;
    const now = Date.now();
    const trimmed = name.trim().slice(0, 120);
    const board = {
      id: newBoardId(),
      name: trimmed,
      title: trimmed,
      createdAt: now,
      updatedAt: now,
      items: []
    };
    const prevActive = boardsDoc.activeBoardId;
    const prevLen = boardsDoc.boards.length;
    boardsDoc.boards.push(board);
    boardsDoc.activeBoardId = board.id;
    const failed = flushPendingOrCancel(true);
    if (failed) {
      // Roll back the in-memory adoption: disk never changed.
      boardsDoc.boards.splice(prevLen);
      boardsDoc.activeBoardId = prevActive;
      return failed;
    }
    return metaResult(boardsDoc, { state: flattenActiveBoard(boardsDoc) });
  });

  registerAuthorizedHandle(IPC.boardRename, 'canvas', (_event, id: unknown, name: unknown): BoardsResult => {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'invalid-id', ...metaDoc() };
    if (typeof name !== 'string' || !name.trim()) {
      return { ok: false, error: 'invalid-name', ...metaDoc() };
    }
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    const target = boardsDoc.boards.find((b) => b.id === id);
    if (!target) return { ok: false, error: 'not-found', ...metaDoc() };
    const prevName = target.name;
    const prevTitle = target.title;
    const trimmed = name.trim().slice(0, 120);
    target.name = trimmed;
    target.title = trimmed;
    target.updatedAt = Date.now();
    if (flushPendingOrCancel(true)) {
      target.name = prevName;
      target.title = prevTitle;
      return { ok: false, error: 'save-failed', ...metaDoc() };
    }
    const extra = id === boardsDoc.activeBoardId ? { state: flattenActiveBoard(boardsDoc) } : {};
    return metaResult(boardsDoc, extra);
  });

  registerAuthorizedHandle(IPC.boardArchive, 'canvas', (_event, id: unknown): BoardsResult => {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'invalid-id', ...metaDoc() };
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    const target = boardsDoc.boards.find((b) => b.id === id);
    if (!target) return { ok: false, error: 'not-found', ...metaDoc() };
    if (target.archived) return { ok: false, error: 'already-archived', ...metaDoc() };
    // Last-usable-board protection: always keep at least one unarchived board.
    if (unarchivedCount(boardsDoc) <= 1) {
      return { ok: false, error: 'last-board', ...metaDoc() };
    }
    const prevActive = boardsDoc.activeBoardId;
    const prevArchived = false;
    const switching = id === boardsDoc.activeBoardId;
    // Flush pending OLD-board content while the active pointer still names
    // the current board (pre-switch), so the pending save lands in the board
    // it came from.
    const preFailed = flushPendingOrCancel(false);
    if (preFailed) return preFailed;
    if (switching) {
      const replacement = boardsDoc.boards.find(
        (b) => !b.archived && b.id !== id
      );
      if (!replacement) return { ok: false, error: 'last-board', ...metaDoc() };
      boardsDoc.activeBoardId = replacement.id;
    }
    target.archived = true;
    let result: BoardsResult | null = flushPendingOrCancel(true);
    if (result && switching) {
      // Undo the pointer/flag change before reporting the failure.
      target.archived = prevArchived;
      boardsDoc.activeBoardId = prevActive;
    } else if (result && !switching) {
      target.archived = prevArchived;
    }
    if (result) return result;
    // Archiving the active board swapped it away: hand the renderer the new
    // flat state so it can adopt the replacement board.
    const extra = switching ? { state: flattenActiveBoard(boardsDoc) } : {};
    return metaResult(boardsDoc, extra);
  });

  registerAuthorizedHandle(IPC.boardRestore, 'canvas', (_event, id: unknown): BoardsResult => {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'invalid-id', ...metaDoc() };
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    const target = boardsDoc.boards.find((b) => b.id === id);
    if (!target) return { ok: false, error: 'not-found', ...metaDoc() };
    if (!target.archived) return { ok: false, error: 'already-archived', ...metaDoc() };
    target.archived = false;
    target.updatedAt = Date.now();
    if (flushPendingOrCancel(true)) {
      target.archived = true;
      return { ok: false, error: 'save-failed', ...metaDoc() };
    }
    return metaResult(boardsDoc);
  });

  registerAuthorizedHandle(IPC.boardSwitch, 'canvas', (_event, id: unknown): BoardsResult => {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'invalid-id', ...metaDoc() };
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    const candidate = boardsDoc.boards.find((b) => b.id === id);
    if (candidate?.archived) return { ok: false, error: 'already-archived', ...metaDoc() };
    const target = boardsDoc.boards.find((b) => b.id === id && !b.archived);
    if (!target) return { ok: false, error: 'not-found', ...metaDoc() };
    if (id === boardsDoc.activeBoardId) {
      return metaResult(boardsDoc, { state: flattenActiveBoard(boardsDoc) });
    }
    // Serialize: flush the pending active-board save first; cancel the
    // switch if the current board cannot be persisted.
    if (flushPendingOrCancel()) {
      return { ok: false, error: 'save-failed', ...metaDoc() };
    }
    const prevActive = boardsDoc.activeBoardId;
    boardsDoc.activeBoardId = id;
    // Immediate flush so the new activeBoardId is durable across restart.
    const nextFlat = flattenActiveBoard(boardsDoc);
    pendingState = nextFlat;
    cancelPendingSave();
    if (!flushSave()) {
      boardsDoc.activeBoardId = prevActive;
      return { ok: false, error: 'save-failed', ...metaDoc() };
    }
    cacheSettings(nextFlat);
    return metaResult(boardsDoc, { state: nextFlat });
  });

  registerAuthorizedHandle(IPC.boardDocumentExport, 'canvas', (): AppStateV2 | null => {
    if (!boardsDoc) return null;
    flushPendingOrCancel(false);
    return cloneDoc(boardsDoc);
  });

  registerAuthorizedHandle(IPC.boardDocumentImport, 'canvas', (_event, raw: unknown): BoardsResult => {
    if (!looksLikeV2(raw) || !isValidStateV2(raw)) {
      return { ok: false, error: 'invalid-document', ...metaDoc() };
    }
    if (!boardsDoc) return { ok: false, error: 'not-ready', ...metaDoc() };
    const prevDoc = boardsDoc;
    const doc = cloneDoc(raw as AppStateV2);
    normalizeActiveBoard(doc);
    delete (doc as { savedAt?: number }).savedAt;
    boardsDoc = doc;
    const nextFlat = flattenActiveBoard(doc);
    pendingState = nextFlat;
    cancelPendingSave();
    if (!flushSave()) {
      boardsDoc = prevDoc;
      return { ok: false, error: 'save-failed', ...metaDoc() };
    }
    cacheSettings(nextFlat);
    return metaResult(boardsDoc, { state: nextFlat });
  });

  registerAuthorizedOn(IPC.openLink, 'canvas', (_event, url: unknown) => {
    const target = normalizeHttpUrl(url);
    if (target) void shell.openExternal(target);
  });

  registerAuthorizedHandle(IPC.clipRead, 'canvas', () => clipboard.readText());

  registerAuthorizedHandle(IPC.linkPreview, 'canvas', async (_event, url: unknown): Promise<LinkPreview | null> => {
    const target = parsePreviewTarget(url);
    if (!target) return null;
    const fetched = await guardedPreviewFetch(target.href);
    if (!fetched) return null;
    const html = fetched.body;
    if (!html) return null;
    const image = extractMeta(html, 'og:image');
    const title = extractMeta(html, 'og:title') ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');
    if (!title && !description && !image) return null;
    let resolvedImage: string | undefined;
    if (image) {
      try {
        resolvedImage = new URL(image, fetched.finalUrl).toString();
      } catch {
        // malformed og:image - skip
      }
    }
    return {
      title: title ?? undefined,
      description: description ?? undefined,
      image: resolvedImage,
      siteName: new URL(fetched.finalUrl).hostname.replace(/^www\./, ''),
      url: fetched.finalUrl
    };
  });

  if (isTestMode()) {
    // Test seams for the SSRF guard: deterministic DNS + connect-attempt counter.
    // validate+resolve only, never connects; used to assert block decisions.
    registerAuthorizedHandle('__test:preview-dns', 'canvas', (_e, map: unknown) => {
      setPreviewDnsOverride(map);
      return true;
    });
    registerAuthorizedHandle('__test:preview-conns', 'canvas', () => getPreviewConnectionCount());
    registerAuthorizedHandle('__test:preview-probe', 'canvas', (_e, raw: unknown) => previewProbeResolve(raw));
    registerAuthorizedHandle('__test:preview-raw', 'canvas', async (_e, raw: unknown) => {
      const r = await guardedPreviewFetch(String(raw));
      return r ? { finalUrl: r.finalUrl, bodyLen: r.body.length } : 'null';
    });
    registerAuthorizedHandle('__test:preview-reset', 'canvas', () => {
      resetPreviewTestState();
      return true;
    });
  }

  registerAuthorizedHandle(IPC.imagePick, 'canvas', async () => {
    const win = getCanvasWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Insert image onto canvas',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: IMAGE_EXT.map((e) => e.slice(1)) }]
    };
    const res = await showOpenDialogSafe(win, options);
    if (res.canceled || !res.filePaths[0]) return null;
    return importImageFile(res.filePaths[0]);
  });

  registerAuthorizedHandle(IPC.imageImport, 'canvas', (_event, srcPath: unknown) => {
    if (typeof srcPath !== 'string') return null;
    return importImageFile(srcPath);
  });

  registerAuthorizedHandle(IPC.imageUrl, 'canvas', (_event, name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return null;
    const safeName = path.basename(name);
    const ext = path.extname(safeName).toLowerCase();
    if (!IMAGE_EXT.includes(ext)) return null;

    const dir = mediaDir();
    const resolved = path.resolve(dir, safeName);
    // Strict enclosure check inside media directory
    if (path.dirname(resolved) !== path.resolve(dir)) return null;

    try {
      if (!fs.statSync(resolved).isFile()) return null;
    } catch {
      return null;
    }
    return pathToFileURL(resolved).toString();
  });

  registerAuthorizedHandle(IPC.videoPick, 'canvas', async () => {
    const win = getCanvasWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Pin a video to the canvas',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: VIDEO_EXT.map((e) => e.slice(1)) }]
    };
    const res = await showOpenDialogSafe(win, options);
    if (res.canceled || !res.filePaths[0]) return null;
    return importVideoFile(res.filePaths[0]);
  });

  registerAuthorizedHandle(IPC.videoImport, 'canvas', (_event, srcPath: unknown) => {
    if (typeof srcPath !== 'string') return null;
    return importVideoFile(srcPath);
  });

  registerAuthorizedHandle(IPC.videoUrl, 'canvas', (_event, name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return null;
    const safeName = path.basename(name);
    const ext = path.extname(safeName).toLowerCase();
    if (!VIDEO_EXT.includes(ext)) return null;

    const dir = mediaDir();
    const resolved = path.resolve(dir, safeName);
    // Strict enclosure check inside media directory
    if (path.dirname(resolved) !== path.resolve(dir)) return null;

    try {
      if (!fs.statSync(resolved).isFile()) return null;
    } catch {
      return null;
    }
    return pathToFileURL(resolved).toString();
  });

  registerAuthorizedOn(IPC.videoForget, 'canvas', (_event, _name: unknown) => {
    // Prohibit automatic media deletion when nodes are deleted or canvas cleared,
    // protecting undo/redo history, shared references, and backups.
  });

  registerAuthorizedOn(IPC.videoOpen, 'canvas', (_event, content: unknown) => {
    if (typeof content !== 'string' || !content) return;
    if (content.startsWith('yt:')) {
      const id = content.slice(3);
      if (/^[\w-]{6,}$/.test(id)) void shell.openExternal(`https://www.youtube.com/watch?v=${id}`);
    } else if (content.startsWith('media:')) {
      const file = path.join(mediaDir(), path.basename(content.slice(6)));
      if (fs.existsSync(file)) void shell.openPath(file);
    }
  });

  // Dedicated test seam: ONLY registered in explicit test mode for automated test suites
  if (isTestMode()) {
    registerAuthorizedHandle('__test:mock-dialog', 'canvas', (_event, targetPath: unknown) => {
      if (targetPath === '__CANCEL__') {
        setMockDialogResult({ canceled: true, filePaths: [] });
        return true;
      }
      if (typeof targetPath === 'string' && targetPath.trim()) {
        setMockDialogResult({ canceled: false, filePaths: [targetPath] });
        return true;
      }
      setMockDialogResult(null);
      return false;
    });
  }

  // YouTube error 153: file:// pages send no Referer, and the embed player refuses to
  // configure without one â€” stamp a synthetic origin onto the iframe document requests.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'] },
    (details, callback) => {
      if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://peepdesk.local/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  registerAuthorizedHandle(IPC.stateLoad, 'canvas', () => {
    const file = getStatePath();
    const candidates = [file, `${file}.tmp`, `${file}.bak`];
    let bestDoc: AppStateV2 | null = null;
    let bestTimestamp = -1;
    let recoveredFrom: string | null = null;
    let primaryCorrupted = false;
    // QA-G4S tier B: structurally valid candidates rejected ONLY by the
    // future-skew guard (valid shape, finite stamp beyond tolerance). Tier A
    // ranking still ignores them entirely; the pool is consulted only when
    // NO candidate carried a normal stamp, so in normal cases a valid
    // primary (or any within-tolerance candidate) is never overridden.
    // QA-G5B A2: candidates may be legacy flat (v1, migrated in memory) or
    // v2 wrappers; ranking semantics are unchanged at the file level.
    const skewPool: Array<{ state: AppStateV2; savedAt: number; order: number }> = [];

    for (let order = 0; order < candidates.length; order++) {
      const candidate = candidates[order];
      try {
        if (!fs.existsSync(candidate)) continue;
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        const isValidShape =
          isValidStateFlat(parsed) || isValidStateV2(parsed);
        if (isValidShape) {
          // QA-G4 D-1: future-stamped candidates are clock-skew artifacts and
          // must never outrank valid options whose stamps sat on the real wall
          // clock (backward clock jump made older saves look "fresher").
          const doc = looksLikeV2(parsed)
            ? (parsed as AppStateV2)
            : migrateV1ToV2(parsed as AppState);
          const savedAt = doc.savedAt;
          const timestamp = candidateTimestamp(
            savedAt,
            Math.max(doc.timers.lastHydration, doc.timers.lastBreak, 0),
            Date.now()
          );
          if (timestamp !== null && (bestDoc === null || timestamp > bestTimestamp)) {
            bestDoc = doc;
            bestTimestamp = timestamp;
            recoveredFrom = candidate;
          } else if (timestamp === null && isSkewArtifactStamp(savedAt, Date.now())) {
            skewPool.push({ state: doc, savedAt, order });
          }
        } else if (candidate === file) {
          primaryCorrupted = true;
        }
      } catch {
        if (candidate === file) {
          primaryCorrupted = true;
        }
      }
    }

    // QA-G4S: if nothing ranked normally, recover the best skew-stamped state
    // instead of dropping to defaults - otherwise the renderer boot-save would
    // overwrite the only recoverable state with factory defaults (G4R finding
    // G4R-F1). Deterministic: newest raw stamp first, ties by candidate order.
    // Malformed/invalid candidates still never qualify (shape gates above).
    if (bestDoc === null && skewPool.length > 0) {
      skewPool.sort(skewFallbackSort);
      const winner = skewPool[0];
      bestDoc = winner.state;
      bestTimestamp = winner.savedAt;
      recoveredFrom = candidates[winner.order];
    }

    // Preserve corrupted primary file for diagnostics instead of silently losing evidence
    if (primaryCorrupted) {
      try {
        if (fs.existsSync(file)) {
          const corruptArtifact = `${file}.corrupt.${Date.now()}`;
          fs.copyFileSync(file, corruptArtifact);
        }
      } catch {}
    }

    if (bestDoc) {
      cacheSettings(bestDoc);
      normalizeActiveBoard(bestDoc);
      // Seed the in-memory multi-board document before any save arrives.
      boardsDoc = bestDoc;
      // Self-healing: if recovered from a backup/tmp or if primary was corrupt, heal the primary state file
      if (recoveredFrom !== file || primaryCorrupted) {
        try {
          fs.writeFileSync(file, JSON.stringify(bestDoc), 'utf8');
        } catch {}
      }
      // Renderer keeps consuming the flat AppState of the active board.
      return flattenActiveBoard(bestDoc);
    }

    // All candidates failed or first launch
    boardsDoc = freshDoc();
    return { ...flattenActiveBoard(boardsDoc), timers: { ...boardsDoc.timers } };
  });
}

export function flushSaveOnQuit(): void {
  if (saveTimer) clearTimeout(saveTimer);
  flushSave();
}
