import type { CanvasNode, Clip, ReminderSettings } from '../../shared/types.js';
import { DEFAULT_SETTINGS } from '../../shared/types.js';
import { getState, initState, scheduleSave } from './storage.js';
import { applyFont, buildCard, DEFAULT_FONT_SIZE, faviconUrl, FONTS, FONT_SIZES, renderLinkPreview, sanitizeHtml, TEXT_COLORS } from './components/card.js';
import { closeAllDrops, createDrop, type Drop } from './components/fontdrop.js';
import { buildImageNode } from './components/image-node.js';
import { copyText } from './components/util-btn.js';
import { buildVideoNode, youtubeId } from './components/video-node.js';
import { createFluffyStar } from '../pet/fluffy-star.js';

const board = document.getElementById('board')!;
const world = document.getElementById('world')!;
const menu = document.getElementById('spawn-menu')!;
const zoomLabel = document.getElementById('zoom-label')!;
const emptyState = document.getElementById('empty-state')!;

document.getElementById('empty-star')!.appendChild(createFluffyStar({ size: 'hero', state: 'idle' }));

function updateEmpty(): void {
  emptyState.classList.toggle('hidden', getState().items.length > 0);
}

const view = { tx: 80, ty: 60, scale: 1 };
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

document.getElementById('tb-thought')!.addEventListener('click', () => spawnAtCenter('thought'));
document.getElementById('tb-todo')!.addEventListener('click', () => spawnAtCenter('todo'));
document.getElementById('tb-link')!.addEventListener('click', () => spawnAtCenter('link'));
document.getElementById('tb-video')!.addEventListener('click', () => void pickAndAddVideo());
document.getElementById('tb-text')!.addEventListener('click', () => spawnAtCenter('text'));

function applyTransform(): void {
  world.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  board.style.backgroundSize = `${24 * view.scale}px ${24 * view.scale}px`;
  board.style.backgroundPosition = `${view.tx}px ${view.ty}px`;
  zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
}

function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.tx) / view.scale,
    y: (clientY - rect.top - view.ty) / view.scale
  };
}

function findNode(id: string): CanvasNode | undefined {
  return getState().items.find((n) => n.id === id);
}

function buildNode(node: CanvasNode): HTMLElement {
  if (node.type === 'image') return buildImageNode(node);
  if (node.type === 'video') return buildVideoNode(node);
  return buildCard(node);
}

function renderNode(node: CanvasNode): void {
  const el = buildNode(node);
  world.appendChild(el);
  updateEmpty();
  el.querySelector<HTMLElement>('.card-title, .node-text')?.focus();
}

// ---------- undo / redo history ----------
// Snapshot-based: each entry is the items-array JSON captured BEFORE one action.
// Transient by design — never persisted, resets on restart.

const undoStack: string[] = [];
const redoStack: string[] = [];
const HISTORY_CAP = 80;

function pushHistory(json: string): void {
  if (undoStack[undoStack.length - 1] === json) return;
  undoStack.push(json);
  if (undoStack.length > HISTORY_CAP) undoStack.shift();
  redoStack.length = 0;
}

// An open contenteditable session (focusin → focusout); flushed before any
// other history push so entries stay chronological.
let editPre: string | null = null;

function flushEditTxn(): void {
  if (editPre === null) return;
  if (JSON.stringify(getState().items) !== editPre) pushHistory(editPre);
  editPre = null;
}

/** Run a board mutation as ONE undo entry (no entry when nothing changed). */
function txn(fn: () => void): void {
  flushEditTxn();
  const pre = JSON.stringify(getState().items);
  fn();
  if (JSON.stringify(getState().items) !== pre) pushHistory(pre);
}

function applyItems(json: string): void {
  flushEditTxn();
  getState().items = JSON.parse(json) as CanvasNode[];
  rebuildBoard();
  scheduleSave();
}

function undo(): void {
  const cur = JSON.stringify(getState().items);
  while (undoStack.length && undoStack[undoStack.length - 1] === cur) undoStack.pop();
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(cur);
  applyItems(prev);
}

function redo(): void {
  const cur = JSON.stringify(getState().items);
  while (redoStack.length && redoStack[redoStack.length - 1] === cur) redoStack.pop();
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(cur);
  applyItems(next);
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  // Checkbox/radio inputs can't be typed into, so they must not swallow undo/delete keys.
  return !!el?.closest?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]');
}

// ---------- pan & zoom ----------

let panning: { x: number; y: number } | null = null;
let marquee: { x: number; y: number } | null = null;
const marqueeEl = document.getElementById('marquee')!;

function paintMarquee(x: number, y: number): void {
  if (!marquee) return;
  marqueeEl.style.left = `${Math.min(marquee.x, x)}px`;
  marqueeEl.style.top = `${Math.min(marquee.y, y)}px`;
  marqueeEl.style.width = `${Math.abs(x - marquee.x)}px`;
  marqueeEl.style.height = `${Math.abs(y - marquee.y)}px`;
}

function finishMarquee(x: number, y: number): void {
  if (!marquee) return;
  const l = Math.min(marquee.x, x);
  const t = Math.min(marquee.y, y);
  const r = Math.max(marquee.x, x);
  const b = Math.max(marquee.y, y);
  marquee = null;
  marqueeEl.classList.add('hidden');
  selectedIds.clear();
  // Node rects and marquee are both viewport-space — no zoom/pan conversion needed.
  for (const el of Array.from(world.querySelectorAll<HTMLElement>('[data-node]'))) {
    const nr = el.getBoundingClientRect();
    if (nr.left < r && nr.right > l && nr.top < b && nr.bottom > t) selectedIds.add(el.dataset.node!);
  }
  paintSelection();
}

board.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || (e.target !== board && e.target !== world)) return;
  closeCtx();
  setActive(null);
  if (e.shiftKey) {
    marquee = { x: e.clientX, y: e.clientY };
    marqueeEl.classList.remove('hidden');
    paintMarquee(e.clientX, e.clientY);
  } else {
    panning = { x: e.clientX, y: e.clientY };
    board.classList.add('panning');
  }
  board.setPointerCapture(e.pointerId);
});

board.addEventListener('pointermove', (e) => {
  if (marquee) {
    paintMarquee(e.clientX, e.clientY);
    return;
  }
  if (!panning) return;
  view.tx += e.clientX - panning.x;
  view.ty += e.clientY - panning.y;
  panning = { x: e.clientX, y: e.clientY };
  applyTransform();
});

board.addEventListener('pointerup', (e) => {
  if (marquee) finishMarquee(e.clientX, e.clientY);
  panning = null;
  board.classList.remove('panning');
});

function zoomAt(mx: number, my: number, factor: number): void {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const k = next / view.scale;
  view.tx = mx - (mx - view.tx) * k;
  view.ty = my - (my - view.ty) * k;
  view.scale = next;
  applyTransform();
}

function zoomAtCenter(factor: number): void {
  const rect = board.getBoundingClientRect();
  zoomAt(rect.width / 2, rect.height / 2, factor);
}

board.addEventListener(
  'wheel',
  (e) => {
    if ((e.target as HTMLElement).closest('#ctx-menu, #spawn-menu')) return;
    e.preventDefault();
    closeCtx();
    const rect = board.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  },
  { passive: false }
);

document.getElementById('zoom-in')!.addEventListener('click', () => zoomAtCenter(1.2));
document.getElementById('zoom-out')!.addEventListener('click', () => zoomAtCenter(1 / 1.2));
document.getElementById('zoom-label')!.addEventListener('click', () => zoomAtCenter(1 / view.scale));

// ---------- node drag / resize (delegated) ----------

type GestureTarget = { node: CanvasNode; el: HTMLElement; x: number; y: number; w: number; h: number };
type Gesture = {
  mode: 'drag' | 'resize';
  x: number;
  y: number;
  pre: string;
  moved: boolean;
  targets: GestureTarget[];
};

let gesture: Gesture | null = null;

function nodeByIdInWorld(id: string): HTMLElement | null {
  return world.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`);
}

board.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
  if (!nodeEl) return;
  const node = findNode(nodeEl.dataset.node!);
  if (!node) return;
  if (e.ctrlKey || e.metaKey) {
    toggleSelect(nodeEl);
    return;
  }
  if (!(selectedIds.size > 1 && selectedIds.has(node.id))) setActive(nodeEl);

  const isResize = !!(e.target as HTMLElement).closest('[data-resize]');
  const isControl = !!(e.target as HTMLElement).closest('button, input, select, [contenteditable]');
  if (isControl && !isResize) return;
  if (!isResize && node.type !== 'image' && !(e.target as HTMLElement).closest('.node-head')) return;

  // Group drag: whole selection moves; resize always touches only the grabbed node.
  const inGroup = !isResize && selectedIds.size > 1 && selectedIds.has(node.id);
  const els = inGroup
    ? [...selectedIds].map(nodeByIdInWorld).filter((el): el is HTMLElement => !!el)
    : [nodeEl];
  gesture = {
    mode: isResize ? 'resize' : 'drag',
    x: e.clientX,
    y: e.clientY,
    pre: JSON.stringify(getState().items),
    moved: false,
    targets: els.map((el) => {
      const n = findNode(el.dataset.node!)!;
      return { node: n, el, x: n.x, y: n.y, w: n.width, h: n.height };
    })
  };
  // Embedded iframes/videos would swallow pointermove once the drag crosses them.
  for (const el of els) el.classList.add('dragging');
  try {
    nodeEl.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic/expired pointer ids throw; drag still works via board-level move events.
  }
});

board.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  const dx = (e.clientX - gesture.x) / view.scale;
  const dy = (e.clientY - gesture.y) / view.scale;
  if (dx !== 0 || dy !== 0) gesture.moved = true;
  for (const t of gesture.targets) {
    if (gesture.mode === 'drag') {
      t.node.x = t.x + dx;
      t.node.y = t.y + dy;
      t.el.style.left = `${t.node.x}px`;
      t.el.style.top = `${t.node.y}px`;
    } else {
      t.node.width = Math.max(120, t.w + dx);
      t.node.height = Math.max(60, t.h + dy);
      t.el.style.width = `${t.node.width}px`;
      t.el.style.height = `${t.node.height}px`;
    }
  }
});

board.addEventListener('pointerup', () => {
  if (gesture) {
    for (const t of gesture.targets) t.el.classList.remove('dragging');
    // A whole drag/resize = ONE history entry, captured at pointerdown, pushed only if anything moved.
    if (gesture.moved) pushHistory(gesture.pre);
    scheduleSave();
  }
  gesture = null;
});

// ---------- card interactions ----------

const previewTimers = new Map<string, number>();

async function fetchPreview(node: CanvasNode, nodeEl: HTMLElement): Promise<void> {
  const box = nodeEl.querySelector<HTMLElement>('.link-preview');
  if (!node.url?.trim()) {
    node.preview = undefined;
    if (box) renderLinkPreview(box, node);
    return;
  }
  const preview = await window.canvasApi.getLinkPreview(node.url.trim());
  node.preview = preview ?? undefined;
  if (box) renderLinkPreview(box, node);
  if (preview) scheduleSave();
}

// Wait until the user stops typing, then let the main process grab page metadata.
function schedulePreviewFetch(node: CanvasNode, nodeEl: HTMLElement): void {
  const pending = previewTimers.get(node.id);
  if (pending) window.clearTimeout(pending);
  previewTimers.set(
    node.id,
    window.setTimeout(() => {
      previewTimers.delete(node.id);
      void fetchPreview(node, nodeEl);
    }, 800)
  );
}

board.addEventListener('input', (e) => {
  const target = e.target as HTMLElement;
  const prop = target.dataset.prop as 'content' | 'title' | 'url' | undefined;
  if (!prop) return;
  const nodeEl = target.closest<HTMLElement>('[data-node]');
  const node = nodeEl && findNode(nodeEl.dataset.node!);
  if (node && nodeEl) {
    node[prop] =
      prop === 'url'
        ? (target as HTMLInputElement).value
        : prop === 'content' && 'rich' in target.dataset
          ? sanitizeHtml(target.innerHTML)
          : target.textContent ?? '';
    if (prop === 'url') {
      const fav = nodeEl.querySelector<HTMLImageElement>('.link-favicon');
      const src = node.url ? faviconUrl(node.url) : null;
      if (fav) {
        if (src) fav.src = src;
        fav.hidden = !src;
      }
      schedulePreviewFetch(node, nodeEl);
    }
    scheduleSave();
  }
});

// ---------- selection + toolbar font controls ----------

const selectedIds = new Set<string>();
let active: { id: string; el: HTMLElement } | null = null;

// Font/size picked with no card selected become the defaults for new cards.
const defaults: { family: string; size: number } = { family: FONTS[0].value, size: DEFAULT_FONT_SIZE };

function syncDrops(node: CanvasNode | null): void {
  const fmtOn = !!node && node.type !== 'todo' && node.type !== 'link';
  for (const btn of Object.values(fmtButtons)) btn.disabled = !fmtOn;
  colorDropBtn.disabled = !fmtOn;
  // Contextual formatting: hide B/I/U/color/clear unless a text-capable card is active (they take no inline width when hidden, so re-flow the toolbar).
  toolbar.classList.toggle('fmt-on', fmtOn);
  relayoutToolbar();
  if (!node) {
    familyDrop.setValue(defaults.family);
    sizeDrop.setValue(String(defaults.size));
    return;
  }
  familyDrop.setValue(node.fontFamily ?? defaults.family);
  const size = String(node.fontSize ?? defaults.size);
  if (!(FONT_SIZES as readonly number[]).includes(Number(size))) {
    // Legacy/off-menu size: make it pickable anyway.
    sizeDrop.setItems([...FONT_SIZES, Number(size)].sort((a, b) => a - b).map((s) => ({ value: String(s), label: `${s}px` })));
  }
  sizeDrop.setValue(size);
}

function paintSelection(): void {
  for (const el of Array.from(world.querySelectorAll<HTMLElement>('[data-node]'))) {
    el.classList.toggle('active', selectedIds.has(el.dataset.node!));
  }
  // 2+ selected never resolves to one "active" card: formatting stays off rather than showing a misleading state.
  const id = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const el = id ? nodeByIdInWorld(id) : null;
  active = id && el ? { id, el } : null;
  syncDrops(active ? (findNode(active.id) ?? null) : null);
}

function setActive(nodeEl: HTMLElement | null): void {
  selectedIds.clear();
  if (nodeEl && findNode(nodeEl.dataset.node!)) selectedIds.add(nodeEl.dataset.node!);
  paintSelection();
}

function toggleSelect(nodeEl: HTMLElement): void {
  const id = nodeEl.dataset.node!;
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  paintSelection();
}

board.addEventListener('focusin', (e) => {
  const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
  if (!nodeEl) return;
  if (selectedIds.size > 1 && selectedIds.has(nodeEl.dataset.node!)) return;
  // One undo entry per editing session: capture pre-edit state now, push on blur.
  editPre ??= JSON.stringify(getState().items);
  setActive(nodeEl);
});

board.addEventListener('focusout', (e) => {
  if ((e.target as HTMLElement).closest('[data-node]')) flushEditTxn();
});

function applyFontPick(kind: 'family' | 'size', value: string): void {
  if (!active) {
    if (kind === 'family') defaults.family = value;
    else defaults.size = Math.min(72, Math.max(8, Number(value) || DEFAULT_FONT_SIZE));
    return;
  }
  const a = active;
  txn(() => {
    const node = findNode(a.id);
    if (!node) return;
    if (kind === 'family') node.fontFamily = value;
    else node.fontSize = Math.min(72, Math.max(8, Number(value) || DEFAULT_FONT_SIZE));
    applyFont(a.el, node);
    scheduleSave();
  });
}

const familyDrop: Drop = createDrop(
  document.getElementById('font-drop-btn') as HTMLButtonElement,
  document.getElementById('font-drop-panel')!,
  'Aa',
  (v) => applyFontPick('family', v)
);
const sizeDrop: Drop = createDrop(
  document.getElementById('size-drop-btn') as HTMLButtonElement,
  document.getElementById('size-drop-panel')!,
  `${DEFAULT_FONT_SIZE}px`,
  (v) => applyFontPick('size', v)
);
familyDrop.setItems(FONTS.map((f) => ({ value: f.value, label: f.label, previewFont: f.value })));
sizeDrop.setItems(FONT_SIZES.map((s) => ({ value: String(s), label: `${s}px` })));
familyDrop.setValue(defaults.family);
sizeDrop.setValue(String(defaults.size));

// ---------- reminder settings (⚙ menu, main-process timers read these) ----------

const settingsDrop = document.getElementById('settings-drop')!;
const settingsBtn = document.getElementById('tb-settings') as HTMLButtonElement;
const settingsPanel = document.getElementById('settings-panel')!;
const setWaterOn = document.getElementById('set-water-on') as HTMLInputElement;
const setChaiOn = document.getElementById('set-chai-on') as HTMLInputElement;
const setChaiFrom = document.getElementById('set-chai-from') as HTMLInputElement;
const setChaiTo = document.getElementById('set-chai-to') as HTMLInputElement;

function curSettings(): ReminderSettings {
  const st = getState();
  return (st.settings ??= structuredClone(DEFAULT_SETTINGS));
}

function markChip(rowId: string, min: number): void {
  for (const c of Array.from(settingsPanel.querySelectorAll(`#${rowId} .chip`))) {
    c.classList.toggle('on', Number((c as HTMLElement).dataset.min) === min);
  }
}

function syncSettingsUI(): void {
  const s = curSettings();
  setWaterOn.checked = s.water.enabled;
  setChaiOn.checked = s.chai.enabled;
  setChaiFrom.value = s.chai.from;
  setChaiTo.value = s.chai.to;
  markChip('set-water-every', s.water.everyMin);
  markChip('set-chai-every', s.chai.everyMin);
}

function saveSettings(): void {
  curSettings();
  scheduleSave();
}

settingsBtn.addEventListener('click', () => {
  const wasHidden = settingsPanel.classList.contains('hidden');
  closeAllDrops();
  clipPanel.classList.add('hidden');
  settingsPanel.classList.toggle('hidden', !wasHidden);
  if (wasHidden) syncSettingsUI();
});
settingsDrop.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('pointerdown', (e) => {
  if (!settingsPanel.classList.contains('hidden') && !(e.target as HTMLElement).closest('#settings-drop')) {
    settingsPanel.classList.add('hidden');
  }
});

setWaterOn.addEventListener('change', () => {
  curSettings().water.enabled = setWaterOn.checked;
  saveSettings();
});
setChaiOn.addEventListener('change', () => {
  curSettings().chai.enabled = setChaiOn.checked;
  saveSettings();
});
setChaiFrom.addEventListener('change', () => {
  curSettings().chai.from = setChaiFrom.value || DEFAULT_SETTINGS.chai.from;
  saveSettings();
});
setChaiTo.addEventListener('change', () => {
  curSettings().chai.to = setChaiTo.value || DEFAULT_SETTINGS.chai.to;
  saveSettings();
});
for (const [rowId, kind] of [['set-water-every', 'water'], ['set-chai-every', 'chai']] as const) {
  document.getElementById(rowId)!.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
    if (!chip?.dataset.min) return;
    curSettings()[kind].everyMin = Number(chip.dataset.min);
    markChip(rowId, Number(chip.dataset.min));
    saveSettings();
  });
}

// ---------- clipboard stash ----------

const clipBtn = document.getElementById('tb-clip') as HTMLButtonElement;
const clipDrop = document.getElementById('clip-drop')!;
const clipPanel = document.getElementById('clip-panel')!;
const clipInput = document.getElementById('clip-input') as HTMLTextAreaElement;
const clipSave = document.getElementById('clip-save') as HTMLButtonElement;
const clipList = document.getElementById('clip-list')!;

function clips(): Clip[] {
  const st = getState();
  return (st.clips ??= []);
}

function renderClips(): void {
  clipList.replaceChildren();
  for (const c of clips()) {
    const row = document.createElement('div');
    row.className = 'clip-row';
    const txt = document.createElement('span');
    txt.className = 'clip-text';
    txt.textContent = c.text;
    const acts = document.createElement('span');
    acts.className = 'clip-acts';
    const mk = (label: string, title: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      acts.append(b);
    };
    mk('⧉', 'Copy to clipboard', () => copyText(c.text));
    mk('T', 'Insert as text card', () => {
      const rect = board.getBoundingClientRect();
      spawnAt = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      createItem('text', c.text);
    });
    mk('✕', 'Delete', () => {
      const st = getState();
      st.clips = clips().filter((x) => x.id !== c.id);
      scheduleSave();
      renderClips();
    });
    row.append(txt, acts);
    clipList.append(row);
  }
}

clipBtn.addEventListener('click', () => {
  closeAllDrops();
  settingsPanel.classList.add('hidden');
  const show = clipPanel.classList.contains('hidden');
  clipPanel.classList.toggle('hidden', !show);
  if (!show) return;
  renderClips();
  // Seed the box with whatever is already on the OS clipboard so Save is one click away.
  if (!clipInput.value) void window.canvasApi.readClipboard().then((t) => { if (t && !clipInput.value) clipInput.value = t; });
  clipInput.focus();
});
clipDrop.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('pointerdown', (e) => {
  if (!clipPanel.classList.contains('hidden') && !(e.target as HTMLElement).closest('#clip-drop')) {
    clipPanel.classList.add('hidden');
  }
});

clipSave.addEventListener('click', () => {
  const text = clipInput.value.trim();
  if (!text) return;
  clips().unshift({ id: crypto.randomUUID(), text, createdAt: Date.now() });
  clipInput.value = '';
  scheduleSave();
  renderClips();
});

// ---------- responsive toolbar: ⋯ overflow (canvas.css owns the collapse tiers) ----------

const toolbar = document.getElementById('titlebar')!;
const overflowDrop = document.getElementById('overflow-drop')!;
const overflowBtn = document.getElementById('overflow-btn') as HTMLButtonElement;
const overflowPanel = document.getElementById('overflow-panel')!;

// Format controls in eject order: individual formatting actions first, font/size pills last.
// Ejection moves the REAL nodes, so listeners and dropdown state come along — the ⋯ menu and
// the inline toolbar are always the same controls (never duplicate logic).
const COLLAPSIBLE = ['fmt-clear', 'color-drop', 'fmt-underline', 'fmt-italic', 'fmt-bold', 'size-drop', 'font-drop']
  .map((id) => document.getElementById(id)!)
  .filter((el): el is HTMLElement => !!el);
const toolbarHomes = new Map(COLLAPSIBLE.map((el) => [el, { parent: el.parentElement!, next: el.nextSibling }]));

function relayoutToolbar(): void {
  for (const el of COLLAPSIBLE) {
    const home = toolbarHomes.get(el)!;
    if (el.parentElement !== home.parent) home.parent.insertBefore(el, home.next);
  }
  overflowBtn.classList.add('hidden');
  overflowBtn.setAttribute('aria-expanded', 'false');
  for (const el of COLLAPSIBLE) {
    if (toolbar.scrollWidth <= toolbar.clientWidth) break;
    // display:none (contextual fmt-off) contributes no width — ejecting it wastes a slot
    if (getComputedStyle(el).display === 'none') continue;
    // prepend keeps the menu rows in natural (font, size, B, I, U…) order.
    overflowPanel.prepend(el);
    overflowBtn.classList.remove('hidden');
  }
}

new ResizeObserver(() => relayoutToolbar()).observe(toolbar);
window.addEventListener('resize', relayoutToolbar);
void document.fonts.ready.then(relayoutToolbar);
relayoutToolbar();

overflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const show = overflowPanel.classList.contains('hidden');
  closeAllDrops();
  settingsPanel.classList.add('hidden');
  clipPanel.classList.add('hidden');
  overflowPanel.classList.toggle('hidden', !show);
  overflowBtn.setAttribute('aria-expanded', String(show));
});
// Round-24 lesson: without this, the document-level close-on-pointerdown hides the menu mid-click.
overflowDrop.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('pointerdown', (e) => {
  if (!overflowPanel.classList.contains('hidden') && !(e.target as HTMLElement).closest('#overflow-drop')) {
    overflowPanel.classList.add('hidden');
    overflowBtn.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const editing = isEditable(e.target);
  if (e.key === 'Escape') {
    closeAllDrops();
    overflowPanel.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    clipPanel.classList.add('hidden');
    menu.classList.add('hidden');
    closeCtx();
    if (!editing) setActive(null);
    return;
  }
  // Caret inside input/textarea/contenteditable: native editing always wins
  // (Backspace deletes chars, Ctrl+C copies text, Ctrl+Z is the editor's own undo).
  if (editing) return;
  if (mod && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && k === 'y') {
    e.preventDefault();
    redo();
  } else if (mod && k === 'd') {
    e.preventDefault();
    duplicateSelected();
  } else if ((k === 'delete' || k === 'backspace') && selectedIds.size) {
    e.preventDefault();
    removeNodes([...selectedIds]);
  }
});

// ---------- rich text formatting (B / I / U / color / clear) ----------

const fmtButtons: Record<'bold' | 'italic' | 'underline' | 'clear', HTMLButtonElement> = {
  bold: document.getElementById('fmt-bold') as HTMLButtonElement,
  italic: document.getElementById('fmt-italic') as HTMLButtonElement,
  underline: document.getElementById('fmt-underline') as HTMLButtonElement,
  clear: document.getElementById('fmt-clear') as HTMLButtonElement
};
const colorDropBtn = document.getElementById('color-drop-btn') as HTMLButtonElement;
for (const btn of Object.values(fmtButtons)) btn.disabled = true;
for (const btn of [fmtButtons.bold, fmtButtons.italic, fmtButtons.underline]) btn.setAttribute('aria-pressed', 'false');

const colorDrop: Drop = createDrop(
  colorDropBtn,
  document.getElementById('color-drop-panel')!,
  'A',
  (v) => execFmt('foreColor', v)
);
colorDrop.setItems(TEXT_COLORS.map((c) => ({ value: c, label: 'Aa', color: c })));
colorDrop.setValue(null);

function activeEditor(): HTMLElement | null {
  return active?.el.querySelector<HTMLElement>('.node-text[data-rich]') ?? null;
}

function execFmt(cmd: string, arg?: string): void {
  const editor = activeEditor();
  if (!editor) return;
  txn(() => {
    editor.focus();
    // foreColor defaults to <font> tags, which the sanitizer strips; span+style survives.
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, arg);
  });
  updateFmtState();
}

for (const [cmd, btn] of [
  ['bold', fmtButtons.bold],
  ['italic', fmtButtons.italic],
  ['underline', fmtButtons.underline],
  ['removeFormat', fmtButtons.clear]
] as const) {
  // preventDefault keeps the contenteditable selection alive across the toolbar click.
  btn.addEventListener('pointerdown', (e) => e.preventDefault());
  btn.addEventListener('click', () => execFmt(cmd));
}

function updateFmtState(): void {
  const on = !!activeEditor();
  for (const [cmd, btn] of [
    ['bold', fmtButtons.bold],
    ['italic', fmtButtons.italic],
    ['underline', fmtButtons.underline]
  ] as const) {
    const active = on && document.queryCommandState(cmd);
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-pressed', String(active));
  }
}
document.addEventListener('selectionchange', updateFmtState);

board.addEventListener('paste', (e) => {
  const editor = (e.target as HTMLElement).closest?.<HTMLElement>('.node-text[data-rich]');
  if (!editor) return;
  e.preventDefault();
  const html = e.clipboardData?.getData('text/html');
  if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
  else document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
});

function downloadImage(node: CanvasNode): void {
  const a = document.createElement('a');
  a.href = node.content;
  a.download = `peepdesk-${node.id.slice(0, 8)}.png`;
  a.click();
}

board.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const nodeEl = target.closest<HTMLElement>('[data-node]');
  if (!nodeEl) return;
  const node = findNode(nodeEl.dataset.node!);
  if (!node) return;

  txn(() => {
    if (target.closest('[data-toggle]')) {
      const done = node.status === 'done';
      node.status = done ? 'pending' : 'done';
      nodeEl.classList.toggle('done', !done);
      scheduleSave();
    } else if (target.closest('[data-open-link]')) {
      if (node.url?.trim()) window.canvasApi.openLink(node.url.trim());
    } else if (target.closest('[data-open-video]')) {
      if (node.type === 'video') window.canvasApi.openVideo(node.content);
    } else if (target.closest('[data-copy]')) {
      if (node.type === 'image') {
        void fetch(node.content)
          .then((r) => r.blob())
          .then((blob) => navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]))
          .catch(() => undefined);
      } else {
        copyText(node.type === 'link' ? (node.url ?? '') : [node.title, node.content].filter(Boolean).join('\n'));
      }
    } else if (target.closest('[data-download]')) {
      downloadImage(node);
    } else if (target.closest('[data-color]')) {
      node.color = (target.closest('[data-color]') as HTMLElement).dataset.color!;
      nodeEl.style.setProperty('--card-color', node.color);
      scheduleSave();
    } else if (target.closest('[data-delete]')) {
      removeNodes([node.id]);
    }
  });
});

// ---------- spawn menu (double-click AND empty-canvas right-click) ----------

let spawnAt = { x: 0, y: 0 };

function openSpawnAt(clientX: number, clientY: number): void {
  spawnAt = screenToWorld(clientX, clientY);
  // Menu is board-relative; clamp like the ctx menu so it never spills past the viewport edges.
  const rect = board.getBoundingClientRect();
  menu.style.visibility = 'hidden';
  menu.classList.remove('hidden');
  const x = Math.max(4, Math.min(clientX - rect.left, rect.width - menu.offsetWidth - 4));
  const y = Math.max(4, Math.min(clientY - rect.top, rect.height - menu.offsetHeight - 4));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.visibility = '';
}

board.addEventListener('dblclick', (e) => {
  if ((e.target as HTMLElement).closest('[data-node]')) return;
  openSpawnAt(e.clientX, e.clientY);
});

function createItem(type: 'thought' | 'todo' | 'link' | 'text', content = ''): void {
  const preset = {
    thought: { width: 220, height: 150, color: '#eff6ff' },
    todo: { width: 240, height: 150, color: '#fdf2f8' },
    link: { width: 260, height: 170, color: '#f5f3ff' },
    text: { width: 200, height: 48, color: 'transparent' }
  }[type];
  txn(() => {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      x: spawnAt.x - preset.width / 2,
      y: spawnAt.y - 20,
      width: preset.width,
      height: preset.height,
      content,
      title: '',
      url: type === 'link' ? '' : undefined,
      status: type === 'todo' ? 'pending' : undefined,
      color: preset.color,
      fontFamily: defaults.family,
      fontSize: defaults.size,
      createdAt: Date.now()
    };
    getState().items.push(node);
    menu.classList.add('hidden');
    renderNode(node);
    scheduleSave();
  });
}

document.getElementById('spawn-thought')!.addEventListener('click', () => createItem('thought'));
document.getElementById('spawn-todo')!.addEventListener('click', () => createItem('todo'));
document.getElementById('spawn-link')!.addEventListener('click', () => createItem('link'));
document.getElementById('spawn-video')!.addEventListener('click', () => void pickAndAddVideo(spawnAt));
document.getElementById('spawn-text')!.addEventListener('click', () => createItem('text'));

// Consecutive toolbar spawns cascade so cards never stack exactly (spec: multi-create).
let cascade = 0;

function spawnAtCenter(type: 'thought' | 'todo' | 'link' | 'text'): void {
  const rect = board.getBoundingClientRect();
  const c = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const k = (cascade++ % 8) * 24;
  spawnAt = { x: c.x + k, y: c.y + k };
  createItem(type);
}

menu.addEventListener('pointerdown', (e) => e.stopPropagation());
board.addEventListener('pointerdown', () => menu.classList.add('hidden'));

// ---------- node actions: remove / duplicate / z-order ----------

function removeNodes(ids: string[]): void {
  if (!ids.length) return;
  txn(() => {
    const state = getState();
    for (const id of ids) {
      const n = state.items.find((i) => i.id === id);
      if (n?.type === 'video' && n.content.startsWith('media:')) {
        window.canvasApi.forgetVideo(n.content.slice('media:'.length));
      }
      nodeByIdInWorld(id)?.remove();
      selectedIds.delete(id);
    }
    state.items = state.items.filter((n) => !ids.includes(n.id));
    paintSelection();
    updateEmpty();
    scheduleSave();
  });
}

function duplicateSelected(): void {
  if (!selectedIds.size) return;
  txn(() => {
    const state = getState();
    // New IDs always; +24/+24 keeps overlaps visible and preserves relative spacing for groups.
    const clones = state.items
      .filter((n) => selectedIds.has(n.id))
      .map((n) => ({ ...structuredClone(n), id: crypto.randomUUID(), x: n.x + 24, y: n.y + 24, createdAt: Date.now() }));
    state.items.push(...clones);
    for (const c of clones) {
      const el = buildNode(c);
      world.appendChild(el);
      if (c.type === 'link' && c.url && !c.preview) void fetchPreview(c, el);
    }
    selectedIds.clear();
    for (const c of clones) selectedIds.add(c.id);
    paintSelection();
    updateEmpty();
    scheduleSave();
  });
}

/** DOM order IS stacking order (boot builds in array order) — move the element, mirror into items, persist for free. */
function zOrder(dir: 1 | -1): void {
  if (!active) return;
  const a = active;
  txn(() => {
    const sib = dir === 1 ? a.el.nextElementSibling : a.el.previousElementSibling;
    if (!sib) return;
    if (dir === 1) world.insertBefore(a.el, sib.nextSibling);
    else world.insertBefore(a.el, sib);
    const state = getState();
    const byId = new Map(state.items.map((n) => [n.id, n] as const));
    state.items = Array.from(world.querySelectorAll<HTMLElement>('[data-node]'))
      .map((el) => byId.get(el.dataset.node!))
      .filter((n): n is CanvasNode => !!n);
    scheduleSave();
  });
}

function rebuildBoard(): void {
  world.replaceChildren();
  previewTimers.forEach((t) => window.clearTimeout(t));
  previewTimers.clear();
  for (const node of getState().items) {
    const el = buildNode(node);
    world.appendChild(el);
    if (node.type === 'link' && node.url && !node.preview) void fetchPreview(node, el);
  }
  closeCtx();
  selectedIds.clear();
  paintSelection();
  updateEmpty();
}

// ---------- node context menu ----------

const ctxMenu = document.getElementById('ctx-menu')!;
const ctxExtra = document.getElementById('ctx-extra') as HTMLButtonElement;
const ctxForward = ctxMenu.querySelector<HTMLButtonElement>('[data-act="forward"]')!;
const ctxBackward = ctxMenu.querySelector<HTMLButtonElement>('[data-act="backward"]')!;
let ctxNodeId: string | null = null;

function closeCtx(): void {
  ctxMenu.classList.add('hidden');
  ctxNodeId = null;
}

board.addEventListener('contextmenu', (e) => {
  // Caret inside text/URL keeps the native menu (copy/paste); everything else gets PeepDesk's.
  if (isEditable(e.target)) return;
  e.preventDefault();
  const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
  if (!nodeEl) {
    closeCtx();
    openSpawnAt(e.clientX, e.clientY);
    return;
  }
  const node = findNode(nodeEl.dataset.node!);
  if (!node) return;
  if (!selectedIds.has(node.id)) setActive(nodeEl);
  ctxNodeId = node.id;
  menu.classList.add('hidden');

  const extra: [act: string, label: string] | null =
    node.type === 'link' && node.url?.trim()
      ? ['open-link', 'Open link']
      : node.type === 'image'
        ? ['download', 'Download image']
        : node.type === 'video'
          ? ['open-video', 'Open in player']
          : null;
  ctxExtra.hidden = !extra;
  if (extra) {
    ctxExtra.dataset.act = extra[0];
    ctxExtra.textContent = extra[1];
  }
  ctxForward.disabled = !active || !nodeEl.nextElementSibling;
  ctxBackward.disabled = !active || !nodeEl.previousElementSibling;

  ctxMenu.classList.remove('hidden');
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(e.clientX, window.innerWidth - r.width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(e.clientY, window.innerHeight - r.height - 8))}px`;
  ctxMenu.querySelector<HTMLButtonElement>('button:not([hidden])')?.focus();
});

ctxMenu.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!btn || btn.disabled) return;
  const node = ctxNodeId ? findNode(ctxNodeId) : undefined;
  switch (btn.dataset.act) {
    case 'duplicate':
      duplicateSelected();
      break;
    case 'forward':
      zOrder(1);
      break;
    case 'backward':
      zOrder(-1);
      break;
    case 'delete':
      removeNodes([...selectedIds]);
      break;
    case 'open-link':
      if (node?.url?.trim()) window.canvasApi.openLink(node.url.trim());
      break;
    case 'download':
      if (node) downloadImage(node);
      break;
    case 'open-video':
      if (node?.type === 'video') window.canvasApi.openVideo(node.content);
      break;
  }
  closeCtx();
});

// Round-24 lesson: stop the document close-on-pointerdown from hiding the menu mid-click.
ctxMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('pointerdown', (e) => {
  if (!ctxMenu.classList.contains('hidden') && !(e.target as HTMLElement).closest('#ctx-menu')) closeCtx();
});
ctxMenu.addEventListener('keydown', (e) => {
  const items = Array.from(ctxMenu.querySelectorAll<HTMLButtonElement>('button[data-act]')).filter((b) => !b.hidden && !b.disabled);
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i === -1) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  }
});

// ---------- images: drop & clipboard paste ----------

function addImage(content: string, cx: number, cy: number): void {
  const probe = new Image();
  probe.onload = () => {
    const max = 320;
    let w = probe.naturalWidth || max;
    let h = probe.naturalHeight || max;
    if (w > max) {
      h *= max / w;
      w = max;
    }
    if (h > max) {
      w *= max / h;
      h = max;
    }
    txn(() => {
      const pos = screenToWorld(cx, cy);
      const node: CanvasNode = {
        id: crypto.randomUUID(),
        type: 'image',
        x: pos.x - w / 2,
        y: pos.y - h / 2,
        width: Math.round(w),
        height: Math.round(h),
        content,
        createdAt: Date.now()
      };
      getState().items.push(node);
      renderNode(node);
      scheduleSave();
    });
  };
  probe.src = content;
}

// ---------- videos: picker, drop & clipboard paste ----------

const VIDEO_NAME_EXT = /\.(mp4|webm|m4v|mov)$/i;

function addVideo(content: string, wx: number, wy: number): void {
  const width = 360;
  const height = 280;
  txn(() => {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type: 'video',
      x: wx - width / 2,
      y: wy - height / 2,
      width,
      height,
      content,
      createdAt: Date.now()
    };
    getState().items.push(node);
    renderNode(node);
    scheduleSave();
  });
}

function worldCenter(): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

async function pickAndAddVideo(worldAt?: { x: number; y: number }): Promise<void> {
  const imported = await window.canvasApi.pickVideo();
  if (!imported) return;
  const c = worldAt ?? worldCenter();
  addVideo(`media:${imported.name}`, c.x, c.y);
}

board.addEventListener('dragover', (e) => e.preventDefault());

board.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files ?? []);
  let offset = 0;
  files.forEach((file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      const i = offset++;
      reader.onload = () => addImage(String(reader.result), e.clientX + i * 20, e.clientY + i * 20);
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/') || VIDEO_NAME_EXT.test(file.name)) {
      void window.canvasApi
        .importVideo(window.canvasApi.pathForFile(file))
        .then((imported) => {
          if (!imported) return;
          const pos = screenToWorld(e.clientX + offset * 20, e.clientY + offset * 20);
          addVideo(`media:${imported.name}`, pos.x, pos.y);
        });
    }
  });
});

window.addEventListener('paste', (e) => {
  const items = Array.from(e.clipboardData?.items ?? []);
  const imageItem = items.find((i) => i.type.startsWith('image/'));
  if (imageItem) {
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    reader.onload = () => addImage(String(reader.result), cx, cy);
    reader.readAsDataURL(file);
    return;
  }
  const videoFile = items.find((i) => i.kind === 'file' && i.type.startsWith('video/'));
  const file = videoFile?.getAsFile();
  if (file) {
    void window.canvasApi.importVideo(window.canvasApi.pathForFile(file)).then((imported) => {
      if (imported) {
        const c = worldCenter();
        addVideo(`media:${imported.name}`, c.x, c.y);
      }
    });
    return;
  }
  const text = e.clipboardData?.getData('text/plain') ?? '';
  const id = youtubeId(text);
  if (id) {
    const c = worldCenter();
    addVideo(`yt:${id}`, c.x, c.y);
  }
});

// ---------- boot ----------

initState().then((state) => {
  // One malformed node (hand-edited/corrupt file) must not blank the whole board.
  const KINDS = new Set(['thought', 'todo', 'text', 'image', 'link', 'video']);
  state.items = state.items.filter(
    (n) => !!n && typeof n.id === 'string' && KINDS.has(n.type) && Number.isFinite(n.x) && Number.isFinite(n.y)
  );
  // Start the view centered on existing content (viewport-only; saved coords untouched).
  const items = state.items;
  const rect = board.getBoundingClientRect();
  if (items.length && rect.width > 0) {
    const minX = Math.min(...items.map((n) => n.x));
    const minY = Math.min(...items.map((n) => n.y));
    const maxX = Math.max(...items.map((n) => n.x + n.width));
    const maxY = Math.max(...items.map((n) => n.y + n.height));
    view.tx = (rect.width - (maxX - minX)) / 2 - minX;
    view.ty = (rect.height - (maxY - minY)) / 2 - minY;
  }
  applyTransform();
  updateEmpty();
  items.forEach((node) => {
    const el = buildNode(node);
    world.appendChild(el);
    if (node.type === 'link' && node.url && !node.preview) void fetchPreview(node, el);
  });
});
