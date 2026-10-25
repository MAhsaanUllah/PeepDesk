import type {
  AppState,
  AppStateV2,
  BoardMeta,
  BoardRecord,
  ReminderSettings
} from '../shared/types';

/**
 * QA-G5B Subphase A2: single-file multi-board persistence.
 *
 * The on-disk file may contain either the legacy flat AppState (v1) or the
 * AppStateV2 wrapper (v2). This module owns shape validation, migration and
 * board-record bookkeeping so the existing recovery pipeline (savedAt,
 * .tmp/.bak ranking, isValidState gates) keeps operating unchanged at the
 * file level. No Electron imports here: logic stays unit-testable.
 */

const BOARD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const GRID_STYLES = new Set(['dots', 'lines', 'blank']);

export function newBoardId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Structural validation of one board record (tolerant of unknown extra keys). */
export function isBoardRecord(value: unknown): value is BoardRecord {
  const b = value as BoardRecord;
  return (
    !!b &&
    typeof b.id === 'string' &&
    BOARD_ID_RE.test(b.id) &&
    typeof b.name === 'string' &&
    typeof b.createdAt === 'number' &&
    Number.isFinite(b.createdAt) &&
    typeof b.updatedAt === 'number' &&
    Number.isFinite(b.updatedAt) &&
    Array.isArray(b.items) &&
    (b.archived === undefined || typeof b.archived === 'boolean') &&
    (b.title === undefined || typeof b.title === 'string') &&
    (b.gridStyle === undefined || GRID_STYLES.has(b.gridStyle)) &&
    (b.pan === undefined || isFiniteXY(b.pan)) &&
    (b.zoom === undefined || (typeof b.zoom === 'number' && Number.isFinite(b.zoom) && b.zoom > 0))
  );
}

function isFiniteXY(pan: unknown): boolean {
  const p = pan as { x: unknown; y: unknown };
  return (
    !!p &&
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y)
  );
}

export function looksLikeV2(value: unknown): boolean {
  const v = value as AppStateV2;
  return !!v && Array.isArray(v.boards) && typeof v.activeBoardId === 'string';
}

/**
 * v2 wrapper validity. activeBoardId must reference an EXISTING board;
 * duplicate ids are rejected. A wrapper whose active board is archived is
 * ACCEPTED here (data-preserving) and normalized at load time instead of
 * nuking the whole candidate - losing user boards over an active-pointer
 * mistake would violate the "never silently discard data" policy.
 */
export function isValidStateV2(value: unknown): value is AppStateV2 {
  const v = value as AppStateV2;
  if (
    !looksLikeV2(value) ||
    !v.boards ||
    v.boards.length === 0 ||
    v.boards.length > 500 ||
    !isValidTimers(v.timers)
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (const board of v.boards) {
    if (!isBoardRecord(board)) return false;
    if (seen.has(board.id)) return false;
    seen.add(board.id);
  }
  return seen.has(v.activeBoardId);
}

function isValidTimers(timers: unknown): boolean {
  const t = timers as { lastHydration: unknown; lastBreak: unknown };
  return (
    !!t &&
    typeof t.lastHydration === 'number' &&
    Number.isFinite(t.lastHydration) &&
    typeof t.lastBreak === 'number' &&
    Number.isFinite(t.lastBreak)
  );
}

/** True when the flat shape is the legacy persistable AppState. */
export function isValidStateFlat(value: unknown): value is AppState {
  const s = value as AppState;
  return !!s && Array.isArray(s.items) && isValidTimers(s.timers);
}

/**
 * One-shot legacy migration: a v1 flat state becomes an ordinary editable
 * board. Never discards content; the existing title/items/viewport/grid all
 * survive inside the wrapper. App-level service data (timers/settings/clips)
 * moves to wrapper top-level unchanged.
 */
export function migrateV1ToV2(flat: AppState): AppStateV2 {
  const now = Date.now();
  const board: BoardRecord = {
    id: newBoardId(),
    name: (typeof flat.title === 'string' && flat.title.trim()) || 'My Board',
    createdAt: now,
    updatedAt: now,
    ...(flat.title !== undefined ? { title: flat.title } : {}),
    ...(flat.pan !== undefined ? { pan: flat.pan } : {}),
    ...(flat.zoom !== undefined ? { zoom: flat.zoom } : {}),
    ...(flat.gridStyle !== undefined ? { gridStyle: flat.gridStyle } : {}),
    items: flat.items
  };
  return {
    boards: [board],
    activeBoardId: board.id,
    timers: flat.timers ?? { lastHydration: 0, lastBreak: 0 },
    ...(flat.settings !== undefined ? { settings: flat.settings } : {}),
    ...(flat.clips !== undefined ? { clips: flat.clips } : {})
  };
}

/** Factory-default document: one empty unarchived board. */
export function freshDoc(): AppStateV2 {
  const now = Date.now();
  const board: BoardRecord = {
    id: newBoardId(),
    name: 'My Board',
    createdAt: now,
    updatedAt: now,
    items: []
  };
  return {
    boards: [board],
    activeBoardId: board.id,
    timers: { lastHydration: now, lastBreak: now }
  };
}

/**
 * Normalize a v2 document after load: if activeBoardId points at an archived
 * board (valid but unusual), fall back to the first unarchived board so the
 * renderer always sees a usable board. Mutates the document in place.
 */
export function normalizeActiveBoard(doc: AppStateV2): void {
  const active = doc.boards.find((b) => b.id === doc.activeBoardId);
  if (active && !active.archived) return;
  const firstUsable = doc.boards.find((b) => !b.archived);
  if (firstUsable) doc.activeBoardId = firstUsable.id;
}

/**
 * Project the wrapper into the flat AppState the canvas engine consumes.
 * Board-scoped fields come from the active record; service data stays.
 */
export function flattenActiveBoard(doc: AppStateV2): AppState {
  normalizeActiveBoard(doc);
  const board = doc.boards.find((b) => b.id === doc.activeBoardId) ?? doc.boards[0];
  return {
    ...(board.title !== undefined ? { title: board.title } : {}),
    ...(board.pan !== undefined ? { pan: board.pan } : {}),
    ...(board.zoom !== undefined ? { zoom: board.zoom } : {}),
    ...(board.gridStyle !== undefined ? { gridStyle: board.gridStyle } : {}),
    items: board.items,
    timers: doc.timers,
    ...(doc.settings !== undefined ? { settings: doc.settings } : {}),
    ...(doc.clips !== undefined ? { clips: doc.clips } : {})
  };
}

/**
 * Merge a renderer-side flat save into the wrapper: writes the board-scoped
 * fields into the ACTIVE record (other boards untouched) and refreshes
 * app-level service data. Mutates doc and returns it.
 */
export function upsertBoardFromFlat(
  doc: AppStateV2,
  flat: AppState,
  now: number
): AppStateV2 {
  let board = doc.boards.find((b) => b.id === doc.activeBoardId && !b.archived);
  if (!board) {
    normalizeActiveBoard(doc);
    board = doc.boards.find((b) => b.id === doc.activeBoardId);
  }
  if (!board) return doc;
  if (flat.title !== undefined) board.title = flat.title;
  if (flat.pan !== undefined) board.pan = flat.pan;
  if (flat.zoom !== undefined) board.zoom = flat.zoom;
  if (flat.gridStyle !== undefined) board.gridStyle = flat.gridStyle;
  board.items = flat.items;
  board.updatedAt = now;
  doc.timers = flat.timers ?? doc.timers;
  if (flat.settings !== undefined) doc.settings = flat.settings as ReminderSettings;
  if (flat.clips !== undefined) doc.clips = flat.clips;
  return doc;
}

export function boardMetaList(doc: AppStateV2): BoardMeta[] {
  return doc.boards.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    archived: !!b.archived,
    itemCount: Array.isArray(b.items) ? b.items.length : 0,
    active: b.id === doc.activeBoardId
  }));
}

/** Unarchived board count - the "last usable board" guard input. */
export function unarchivedCount(doc: AppStateV2): number {
  return doc.boards.filter((b) => !b.archived).length;
}

/** Defensive deep clone for import adoption (JSON-safe by construction). */
export function cloneDoc(doc: AppStateV2): AppStateV2 {
  return JSON.parse(JSON.stringify(doc)) as AppStateV2;
}
