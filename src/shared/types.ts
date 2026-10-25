export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName: string;
  url: string;
}

export type ShapeType = 'rectangle' | 'rounded-rect' | 'circle' | 'diamond' | 'triangle';
export type ConnectorLineStyle = 'straight' | 'curved';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface CanvasNode {
  id: string;
  type:
    | 'thought'
    | 'todo'
    | 'text'
    | 'image'
    | 'link'
    | 'video'
    | 'sticky'
    | 'shape'
    | 'connector'
    | 'drawing'
    | 'section'
    | 'stamp';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text, image data URL, video source, or shape/sticky content */
  content: string;
  /** Optional card heading shown above the body */
  title?: string;
  /** Target URL for link cards (http/https only, opened via main process) */
  url?: string;
  /** Page metadata fetched by the main process, shown inside the card */
  preview?: LinkPreview;
  status?: 'pending' | 'in_progress' | 'done';
  /** Pastel yellow, green, blue, pink, or custom hex */
  color?: string;
  /** Text color for contrast on colored sticky/shape */
  textColor?: string;
  /** 8–72 px (default 13) */
  fontSize?: number;
  /** Full CSS font-family stack (Google families + system fallbacks) */
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  isBold?: boolean;
  fontStyle?: 'normal' | 'italic';
  isItalic?: boolean;
  /** Heading level / style: h1, h2, h3, h4, or p (paragraph) */
  textType?: 'h1' | 'h2' | 'h3' | 'h4' | 'p';
  /** Title-specific typography for sticky notes (independent from body) */
  titleLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'p';
  titleFontSize?: number;
  titleFontWeight?: 'normal' | 'bold';
  titleIsBold?: boolean;
  titleFontStyle?: 'normal' | 'italic';
  titleIsItalic?: boolean;
  titleFontFamily?: string;
  /** Tilt angle in degrees for paper sticky notes (-1.5 to 1.5) */
  rotation?: number;
  /** Author tag on sticky notes, e.g. "You" */
  author?: string;
  /** Whether sticky note is in checklist / to-do mode */
  isChecklist?: boolean;
  /** List of checklist items when in to-do mode */
  checklistItems?: Array<{ id: string; text: string; done: boolean }>;
  /** Geometric shape type */
  shapeType?: ShapeType;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Connector line endpoints */
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  /** Optional quadratic bezier control point (persistent bend) */
  controlX?: number;
  controlY?: number;
  startElementId?: string;
  endElementId?: string;
  lineStyle?: ConnectorLineStyle;
  arrowEnd?: boolean;
  arrowStart?: boolean;
  arrowheadSize?: number;
  arrowheadStyle?: string;
  label?: string;
  /** Freehand drawing strokes */
  points?: DrawingPoint[];
  isHighlighter?: boolean;
  zIndex?: number;
  createdAt: number;
}

export interface ReminderSettings {
  water: { enabled: boolean; everyMin: number };
  /** Chai = the 'break' alert; only fires inside the from/to window ("HH:MM", wraps past midnight). */
  chai: { enabled: boolean; everyMin: number; from: string; to: string };
  /** Canvas UI theme preference. Optional so older saved boards stay valid (missing value = dark). */
  theme?: 'dark' | 'light' | 'system';
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
  title?: string;
  pan?: { x: number; y: number };
  zoom?: number;
  gridStyle?: 'dots' | 'lines' | 'blank';
  items: CanvasNode[];
  timers: {
    lastHydration: number;
    lastBreak: number;
  };
  settings?: ReminderSettings;
  clips?: Clip[];
}

/**
 * One independent canvas. Board-scoped content lives here; app-scoped service
 * data (timers/settings/clips) stays at the wrapper level (QA-G5B A2).
 */
export interface BoardRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  title?: string;
  pan?: { x: number; y: number };
  zoom?: number;
  gridStyle?: 'dots' | 'lines' | 'blank';
  items: CanvasNode[];
}

/**
 * v2 persistence wrapper: same single state file, but boards are explicit
 * records. Recovery (savedAt, .tmp/.bak ranking) operates identically at the
 * file level; the renderer keeps receiving the flat AppState of the active
 * board.
 */
export interface AppStateV2 {
  savedAt?: number;
  boards: BoardRecord[];
  activeBoardId: string;
  timers: {
    lastHydration: number;
    lastBreak: number;
  };
  settings?: ReminderSettings;
  clips?: Clip[];
}

/** Lightweight descriptor for the Boards / Recent Canvases UI. */
export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  itemCount: number;
  active: boolean;
}

export interface BoardsResult {
  ok: boolean;
  error?: 'invalid-id' | 'invalid-name' | 'not-found' | 'already-archived' | 'last-board' | 'save-failed' | 'not-ready' | 'invalid-document';
  boards?: BoardMeta[];
  activeBoardId?: string | null;
  state?: AppState;
}

export type AlertKind = 'water' | 'break';
export type TimerAction = 'snooze' | 'dismiss';

