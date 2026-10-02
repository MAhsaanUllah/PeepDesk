import type { AppState, LinkPreview } from '../../shared/types.js';

declare global {
  interface Window {
    canvasApi: {
      loadState: () => Promise<AppState>;
      saveState: (state: AppState) => void;
      hide: () => void;
      openLink: (url: string) => void;
      readClipboard: () => Promise<string>;
      getLinkPreview: (url: string) => Promise<LinkPreview | null>;
      pickVideo: () => Promise<{ name: string; size: number } | null>;
      importVideo: (srcPath: string) => Promise<{ name: string; size: number } | null>;
      videoUrl: (name: string) => Promise<string | null>;
      forgetVideo: (name: string) => void;
      openVideo: (content: string) => void;
      pathForFile: (file: File) => string;
    };
  }
}

const SAVE_DEBOUNCE_MS = 500;

let state: AppState = { items: [], timers: { lastHydration: 0, lastBreak: 0 } };
let saveTimer: number | undefined;

export async function initState(): Promise<AppState> {
  state = await window.canvasApi.loadState();
  return state;
}

export function getState(): AppState {
  return state;
}

export function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => window.canvasApi.saveState(state), SAVE_DEBOUNCE_MS);
}
