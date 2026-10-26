import type { AppState, LinkPreview, BoardsResult } from '../../shared/types.js';

declare global {
  interface Window {
    canvasApi: {
      loadState: () => Promise<AppState>;
      saveState: (state: AppState) => void;
      hide: () => void;
      openLink: (url: string) => void;
      readClipboard: () => Promise<string>;
      getLinkPreview: (url: string) => Promise<LinkPreview | null>;
      pickImage?: () => Promise<{ name: string; size: number } | null>;
      importImage?: (srcPath: string) => Promise<{ name: string; size: number } | null>;
      imageUrl?: (name: string) => Promise<string | null>;
      pickVideo: () => Promise<{ name: string; size: number } | null>;
      importVideo: (srcPath: string) => Promise<{ name: string; size: number } | null>;
      videoUrl: (name: string) => Promise<string | null>;
      forgetVideo: (name: string) => void;
      openVideo: (content: string) => void;
      pathForFile: (file: File) => string;
      testMockDialog?: (targetPath: string | null) => Promise<boolean>;
      previewTestSetDns?: (map: Record<string, string | string[]> | null) => Promise<boolean>;
      previewTestConnCount?: () => Promise<number>;
      previewTestProbe?: (raw: string) => Promise<{ ok: boolean; ip?: string; family?: number; blocked?: string }>;
      previewTestReset?: () => Promise<boolean>;
      boardsList?: () => Promise<BoardsResult>;
      boardCreate?: (name: string) => Promise<BoardsResult>;
      boardRename?: (id: string, name: string) => Promise<BoardsResult>;
      boardArchive?: (id: string) => Promise<BoardsResult>;
      boardRestore?: (id: string) => Promise<BoardsResult>;
      boardSwitch?: (id: string) => Promise<BoardsResult>;
      boardDocumentExport?: () => Promise<unknown>;
      boardDocumentImport?: (doc: unknown) => Promise<BoardsResult>;
      setTheme?: (theme: string) => void;
    };
  }
}

export const LOCAL_STORAGE_KEY = 'peepdesk_offline_board';
const SAVE_DEBOUNCE_MS = 400;

let state: AppState = { items: [], timers: { lastHydration: 0, lastBreak: 0 } };
let saveTimer: number | undefined;
let saveSuppressed = false;

/**
 * QA-G5B A2: board switching replaces the module state object entirely.
 * Suppression guards against a stale debounce timer from the PREVIOUS board
 * firing a save after the switch resolves (which would merge old board
 * content into the new active record on the main side).
 */
export function setActiveState(next: AppState): void {
  state = next;
  window.clearTimeout(saveTimer);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // mirror best-effort only
  }
}

export function suppressSaves(): void {
  saveSuppressed = true;
  window.clearTimeout(saveTimer);
}

export function resumeSaves(): void {
  saveSuppressed = false;
}

/**
 * QA-G5B A2: synchronously hand the CURRENT flat state to the main process
 * (clearing the debounce timer first). Called right before any board-list
 * mutation (switch/create/archive/import), whose main-side handler flushes
 * pendingState before changing the wrapper - without this, renderer-side
 * changes still inside the 400ms debounce would never reach the file.
 */
export function flushSaveNow(): void {
  window.clearTimeout(saveTimer);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // mirror best-effort only
  }
  if (window.canvasApi?.saveState) {
    window.canvasApi.saveState(state);
  }
}

export async function initState(): Promise<AppState> {
  if (window.canvasApi?.loadState) {
    try {
      state = await window.canvasApi.loadState();
      // Mirror to localStorage
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
      return state;
    } catch (err) {
      console.warn('IPC loadState failed, checking localStorage fallback', err);
    }
  }

  // Local storage fallback
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      state = JSON.parse(stored) as AppState;
    } catch {
      state = { items: [], timers: { lastHydration: 0, lastBreak: 0 } };
    }
  }

  return state;
}

export function getState(): AppState {
  return state;
}

export function scheduleSave(): void {
  if (saveSuppressed) return;
  // Notify saving status
  window.dispatchEvent(new CustomEvent('board-save-status', { detail: { status: 'saving' } }));

  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    // 1. Save to localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('localStorage save failed', err);
    }

    // 2. Save via Electron IPC if available
    if (window.canvasApi?.saveState) {
      window.canvasApi.saveState(state);
    }

    // Notify saved status
    window.dispatchEvent(new CustomEvent('board-save-status', { detail: { status: 'saved' } }));
  }, SAVE_DEBOUNCE_MS);
}
