export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName: string;
  url: string;
}

export interface CanvasNode {
  id: string;
  type: 'thought' | 'todo' | 'text' | 'image' | 'link' | 'video';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text, image data URL, or video source: 'yt:<id>' | 'media:<imported-file>' | direct video URL */
  content: string;
  /** Optional card heading shown above the body */
  title?: string;
  /** Target URL for link cards (http/https only, opened via main process) */
  url?: string;
  /** Page metadata fetched by the main process, shown inside the card */
  preview?: LinkPreview;
  status?: 'pending' | 'in_progress' | 'done';
  /** Pastel yellow, green, blue, pink (hex) */
  color?: string;
  /** 8–72 px (default 13) */
  fontSize?: number;
  /** Full CSS font-family stack (Google families + system fallbacks) */
  fontFamily?: string;
  createdAt: number;
}

export interface ReminderSettings {
  water: { enabled: boolean; everyMin: number };
  /** Chai = the 'break' alert; only fires inside the from/to window ("HH:MM", wraps past midnight). */
  chai: { enabled: boolean; everyMin: number; from: string; to: string };
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  water: { enabled: true, everyMin: 120 },
  chai: { enabled: true, everyMin: 50, from: '10:00', to: '15:00' }
};

export interface Clip {
  id: string;
  text: string;
  createdAt: number;
}

export interface AppState {
  items: CanvasNode[];
  timers: {
    lastHydration: number;
    lastBreak: number;
  };
  settings?: ReminderSettings;
  clips?: Clip[];
}

export type AlertKind = 'water' | 'break';
export type TimerAction = 'snooze' | 'dismiss';
