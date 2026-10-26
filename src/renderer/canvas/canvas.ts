import type { AppState, BoardMeta, BoardsResult, CanvasNode, Clip, ReminderSettings, ShapeType, ConnectorLineStyle, DrawingPoint } from '../../shared/types.js';
import { DEFAULT_SETTINGS } from '../../shared/types.js';
import { getState, initState, scheduleSave, setActiveState, suppressSaves, resumeSaves, flushSaveNow } from './storage.js';
import { buildCard, faviconUrl, renderLinkPreview, sanitizeHtml } from './components/card.js';
import { buildImageNode } from './components/image-node.js';
import { copyText } from './components/util-btn.js';
import { buildVideoNode, youtubeId } from './components/video-node.js';
import { createFluffyStar } from '../pet/fluffy-star.js';
import { PEEPJAM_PASTELS, PEEPJAM_CONNECTOR_COLORS, getHighContrastConnectorColor, PEEPJAM_PEN_COLORS, PEEPJAM_HIGHLIGHTER_COLORS, PEEPJAM_SECTION_COLORS, PEEPJAM_STAMPS, type ActiveTool } from './components/peepjam-constants.js';
import { buildStickyNode, updateStickyTypography } from './components/sticky-node.js';
import { buildShapeNode, updateShapeSvg, buildShapeSvg, applyShapeColor } from './components/shape-node.js';
import { buildSectionNode, applySectionColor } from './components/section-node.js';
import { buildStampNode } from './components/stamp-node.js';
import { renderConnectorsSvg, createConnectorSvgPath } from './components/connector-layer.js';
import { renderDrawingsSvg, pointsToSvgPath } from './components/drawing-layer.js';
import { BOARD_TEMPLATES } from './components/board-templates.js';
import { exportBoardJson, exportBoardPng, renderBoardToCanvas, parseBoardJsonFile, parseBoardJson, downloadFile, type ParsedBoardData } from './components/board-export.js';

// ---------- DOM Elements ----------

const board = document.getElementById('board')!;
const world = document.getElementById('world')!;
const menu = document.getElementById('spawn-menu')!;
const zoomLabel = document.getElementById('zoom-label')!;
const zoomOut = document.getElementById('zoom-out')!;
const zoomIn = document.getElementById('zoom-in')!;
const zoomFit = document.getElementById('zoom-fit')!;
const emptyState = document.getElementById('empty-state')!;
const marqueeEl = document.getElementById('marquee')!;

const connectorsLayer = document.getElementById('connectors-layer') as unknown as SVGSVGElement;
const drawingsLayer = document.getElementById('drawings-layer') as unknown as SVGSVGElement;
const liveLayer = document.getElementById('live-layer') as unknown as SVGSVGElement;

// Top Header Bar Elements (Desktop App Menu & Status)
const boardTitleEl = document.getElementById('board-title') as HTMLElement;
const saveStatusBadge = document.getElementById('save-status-badge') as HTMLElement;
const undoBtn = document.getElementById('tb-undo') as HTMLButtonElement;
const redoBtn = document.getElementById('tb-redo') as HTMLButtonElement;
const gridToggleBtn = document.getElementById('tb-grid-toggle') as HTMLButtonElement;
const gridModeLabel = document.getElementById('grid-mode-label') as HTMLElement;
const menuGridLabel = document.getElementById('menu-grid-label') as HTMLElement;

const headerTemplatesBtn = document.getElementById('header-templates-btn') as HTMLButtonElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const exportPanel = document.getElementById('export-panel') as HTMLElement;
const exportPngBtn = document.getElementById('export-png-btn') as HTMLButtonElement;
const exportJsonBtn = document.getElementById('export-json-btn') as HTMLButtonElement;
const importJsonBtn = document.getElementById('import-json-btn') as HTMLButtonElement | null;
const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;
const shortcutsBtn = document.getElementById('shortcuts-btn') as HTMLButtonElement | null;
const clearBoardBtn = document.getElementById('clear-board-btn') as HTMLButtonElement | null;

// Reminder Settings Elements
const settingsBtn = document.getElementById('tb-settings') as HTMLButtonElement;
const settingsDrop = document.getElementById('settings-drop')!;
const settingsPanel = document.getElementById('settings-panel')!;
const setWaterOn = document.getElementById('set-water-on') as HTMLInputElement;
const setChaiOn = document.getElementById('set-chai-on') as HTMLInputElement;
const setChaiFrom = document.getElementById('set-chai-from') as HTMLInputElement;
const setChaiTo = document.getElementById('set-chai-to') as HTMLInputElement;
const settingsCloseBtn = document.getElementById('settings-close-btn') as HTMLButtonElement | null;

// Clipboard Stash Elements
const clipCloseBtn = document.getElementById('clip-close-btn') as HTMLButtonElement | null;
const clipEmpty = document.getElementById('clip-empty') as HTMLElement | null;
const setThemeSelect = document.getElementById('set-theme') as HTMLSelectElement | null;
const clipBtn = document.getElementById('tb-clip') as HTMLButtonElement;
const clipDrop = document.getElementById('clip-drop')!;
const clipPanel = document.getElementById('clip-panel')!;
const clipInput = document.getElementById('clip-input') as HTMLTextAreaElement;
const clipSave = document.getElementById('clip-save') as HTMLButtonElement;
const clipList = document.getElementById('clip-list')!;

// Modals
const templatesModal = document.getElementById('templates-modal') as HTMLElement;
const templatesList = document.getElementById('templates-list') as HTMLElement;
const templatesCloseBtn = document.getElementById('templates-close-btn') as HTMLButtonElement;
const clearModal = document.getElementById('clear-modal') as HTMLElement;
const clearConfirmBtn = document.getElementById('clear-confirm-btn') as HTMLButtonElement;
const clearCancelBtn = document.getElementById('clear-cancel-btn') as HTMLButtonElement;
const clearCloseBtn = document.getElementById('clear-close-btn') as HTMLButtonElement;
const shortcutsModal = document.getElementById('shortcuts-modal') as HTMLElement;
const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn') as HTMLButtonElement;
const aboutModal = document.getElementById('about-modal') as HTMLElement;
const aboutCloseBtn = document.getElementById('about-close-btn') as HTMLButtonElement;
// QA-G5B A2: Boards / Recent Canvases modal + import confirmation modal
const boardsModal = document.getElementById('boards-modal') as HTMLElement | null;
const boardsCloseBtn = document.getElementById('boards-close-btn') as HTMLButtonElement | null;
const boardsListEl = document.getElementById('boards-list') as HTMLElement | null;
const boardsNewName = document.getElementById('boards-new-name') as HTMLInputElement | null;
const boardsCreateBtn = document.getElementById('boards-create-btn') as HTMLButtonElement | null;
const boardsEmpty = document.getElementById('boards-empty') as HTMLElement | null;
const importConfirmModal = document.getElementById('import-confirm-modal') as HTMLElement | null;
const importConfirmMsg = document.getElementById('import-confirm-msg') as HTMLElement | null;
const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement | null;
const importCancelBtn = document.getElementById('import-cancel-btn') as HTMLButtonElement | null;
const importConfirmClose = document.getElementById('import-confirm-close-btn') as HTMLButtonElement | null;

// Floating Contextual Selection Action Bar
const selectionBar = document.getElementById('selection-bar') as HTMLElement;
const selTextGroup = document.getElementById('sel-text-group') as HTMLElement;
const selTextDivider = document.getElementById('sel-text-divider') as HTMLElement;
const selTypeBtn = document.getElementById('sel-type-btn') as HTMLButtonElement | null;
const selTypeLabel = document.getElementById('sel-type-label') as HTMLElement | null;
const selTypeMenu = document.getElementById('sel-type-menu') as HTMLElement | null;
const selFontBtn = document.getElementById('sel-font-btn') as HTMLButtonElement;
const selFontLabel = document.getElementById('sel-font-label') as HTMLElement;
const selFontMenu = document.getElementById('sel-font-menu') as HTMLElement;
const selSizeDec = document.getElementById('sel-size-dec') as HTMLButtonElement;
const selSizeInc = document.getElementById('sel-size-inc') as HTMLButtonElement;
const selSizeLabel = document.getElementById('sel-size-label') as HTMLElement;
const selBoldBtn = document.getElementById('sel-bold-btn') as HTMLButtonElement;
const selItalicBtn = document.getElementById('sel-italic-btn') as HTMLButtonElement | null;

const selTargetToggle = document.getElementById('sel-target-toggle') as HTMLElement | null;
const selTargetTitleBtn = document.getElementById('sel-target-title') as HTMLButtonElement | null;
const selTargetBodyBtn = document.getElementById('sel-target-body') as HTMLButtonElement | null;
const selFlipPosBtn = document.getElementById('sel-flip-pos-btn') as HTMLButtonElement | null;

let selBarPosition: 'bottom' | 'top' = (localStorage.getItem('peepdesk_selbar_pos') as any) || 'bottom';
let activeTextTarget: 'title' | 'body' = 'title';

const selColorToggleBtn = document.getElementById('sel-color-toggle-btn') as HTMLButtonElement;
const selBarPalette = document.getElementById('sel-bar-palette') as HTMLElement;
const selRotateGroup = document.getElementById('sel-rotate-group') as HTMLElement | null;
const selRotateDivider = document.getElementById('sel-rotate-divider') as HTMLElement | null;
const selRotateBtn = document.getElementById('sel-rotate-btn') as HTMLButtonElement | null;
const selRotateVal = document.getElementById('sel-rotate-val') as HTMLElement | null;
const selRotateMenuBtn = document.getElementById('sel-rotate-menu-btn') as HTMLButtonElement | null;
const selRotateMenu = document.getElementById('sel-rotate-menu') as HTMLElement | null;
const selRotateInput = document.getElementById('sel-rotate-input') as HTMLInputElement | null;
const selConnGroup = document.getElementById('sel-conn-group') as HTMLElement | null;
const selConnColorBtn = document.getElementById('sel-conn-color-btn') as HTMLButtonElement | null;
const selConnColorIndicator = document.getElementById('sel-conn-color-indicator') as HTMLElement | null;
const selConnPalette = document.getElementById('sel-conn-palette') as HTMLElement | null;
const selConnWidthBtn = document.getElementById('sel-conn-width-btn') as HTMLButtonElement | null;
const selConnWidthLabel = document.getElementById('sel-conn-width-label') as HTMLElement | null;
const selConnWidthMenu = document.getElementById('sel-conn-width-menu') as HTMLElement | null;
const selConnArrowBtn = document.getElementById('sel-conn-arrow-btn') as HTMLButtonElement | null;
const selConnArrowLabel = document.getElementById('sel-conn-arrow-label') as HTMLElement | null;
const selConnArrowMenu = document.getElementById('sel-conn-arrow-menu') as HTMLElement | null;
const selConnSizeBtn = document.getElementById('sel-conn-size-btn') as HTMLButtonElement | null;
const selConnSizeLabel = document.getElementById('sel-conn-size-label') as HTMLElement | null;
const selConnSizeMenu = document.getElementById('sel-conn-size-menu') as HTMLElement | null;
const selConnStraightenBtn = document.getElementById('sel-conn-straighten-btn') as HTMLButtonElement | null;
const selConnStyleBtn = document.getElementById('sel-conn-style-btn') as HTMLButtonElement | null;
const selConnFlipBtn = document.getElementById('sel-conn-flip-btn') as HTMLButtonElement | null;
const importN8nInput = document.getElementById('import-n8n-input') as HTMLInputElement | null;
const templatesViewBoardsBtn = document.getElementById('templates-view-boards-btn') as HTMLButtonElement | null;
const selDupBtn = document.getElementById('sel-dup-btn') as HTMLButtonElement;
const selForwardBtn = document.getElementById('sel-forward-btn') as HTMLButtonElement;
const selBackwardBtn = document.getElementById('sel-backward-btn') as HTMLButtonElement;
const selDelBtn = document.getElementById('sel-del-btn') as HTMLButtonElement;

// Dock Toolbar Elements
const toolMove = document.getElementById('tool-move') as HTMLButtonElement | null;
const toolSelect = document.getElementById('tool-select') as HTMLButtonElement;
const toolHand = document.getElementById('tool-hand') as HTMLButtonElement;
const toolPen = document.getElementById('tool-pen') as HTMLButtonElement;
const penPopover = document.getElementById('pen-popover') as HTMLElement;
const modePen = document.getElementById('mode-pen') as HTMLButtonElement;
const modeHighlighter = document.getElementById('mode-highlighter') as HTMLButtonElement;
const modeEraser = document.getElementById('mode-eraser') as HTMLButtonElement;
const penColorsContainer = document.getElementById('pen-colors') as HTMLElement;
const penColorSection = document.getElementById('pen-color-section') as HTMLElement;
const penColorsLabel = document.getElementById('pen-colors-label') as HTMLElement;
const brushSizeDisplay = document.getElementById('brush-size-display') as HTMLElement;
const strokePreviewWave = document.getElementById('stroke-preview-wave') as SVGPathElement | null;
const brushSizeSlider = document.getElementById('brush-size-slider') as HTMLInputElement;

const toolSticky = document.getElementById('tool-sticky') as HTMLButtonElement;
const stickyPopover = document.getElementById('sticky-popover') as HTMLElement;
const stickyColorsContainer = document.getElementById('sticky-colors') as HTMLElement;

const toolShape = document.getElementById('tool-shape') as HTMLButtonElement;
const shapesPopover = document.getElementById('shapes-popover') as HTMLElement;

const toolConnector = document.getElementById('tool-connector') as HTMLButtonElement;
const toolLine = document.getElementById('tool-line') as HTMLButtonElement | null;
const toolText = document.getElementById('tool-text') as HTMLButtonElement;
const toolTodo = document.getElementById('tool-todo') as HTMLButtonElement | null;
const toolThought = document.getElementById('tool-thought') as HTMLButtonElement | null;
const toolSection = document.getElementById('tool-section') as HTMLButtonElement;
const toolStamp = document.getElementById('tool-stamp') as HTMLButtonElement;
const stampPopover = document.getElementById('stamp-popover') as HTMLElement;
const stampGrid = document.getElementById('stamp-grid') as HTMLElement;
const toolTemplates = document.getElementById('tool-templates') as HTMLButtonElement | null;
const toolMedia = document.getElementById('tool-media') as HTMLButtonElement | null;
const mediaPopover = document.getElementById('media-popover') as HTMLElement | null;
const mediaInsertImage = document.getElementById('media-insert-image') as HTMLButtonElement | null;
const mediaInsertVideo = document.getElementById('media-insert-video') as HTMLButtonElement | null;

document.getElementById('empty-star')?.appendChild(createFluffyStar({ size: 'hero', state: 'idle' }));

function updateEmpty(): void {
  emptyState.classList.toggle('hidden', getState().items.length > 0);
}

// ---------- Canvas Engine & Coordinate Transformation Matrix ----------

const view = { tx: 80, ty: 60, scale: 1 };
const MIN_SCALE = 0.2;
const MAX_SCALE = 3.0;

let viewSaveTimer: number | undefined;
function debouncedSaveViewport(): void {
  if (viewSaveTimer) window.clearTimeout(viewSaveTimer);
  viewSaveTimer = window.setTimeout(() => {
    const s = getState();
    s.pan = { x: Math.round(view.tx), y: Math.round(view.ty) };
    s.zoom = Number(view.scale.toFixed(3));
    scheduleSave();
  }, 600);
}

function applyTransform(): void {
  world.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  const inv = 1 / Math.max(0.1, view.scale);
  const clampedInv = Math.max(0.7, Math.min(2.2, inv));
  world.style.setProperty('--zoom-inv', String(inv));
  world.style.setProperty('--zoom-inv-clamped', String(clampedInv));
  board.style.backgroundSize = `${24 * view.scale}px ${24 * view.scale}px`;
  board.style.backgroundPosition = `${view.tx}px ${view.ty}px`;
  zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
  if (selectedConnectorId) renderConnectors();
  updateSelectionBar();
  debouncedSaveViewport();
}

function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.tx) / view.scale,
    y: (clientY - rect.top - view.ty) / view.scale
  };
}

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

function zoomFitContent(): void {
  const items = getState().items;
  if (!items.length) {
    view.tx = 80;
    view.ty = 60;
    view.scale = 1;
    applyTransform();
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of items) {
    if (n.type === 'drawing' && n.points) {
      for (const p of n.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    } else if (n.type === 'connector') {
      const sx = n.startX ?? n.x;
      const sy = n.startY ?? n.y;
      const ex = n.endX ?? n.x + (n.width || 0);
      const ey = n.endY ?? n.y + (n.height || 0);
      minX = Math.min(minX, sx, ex);
      minY = Math.min(minY, sy, ey);
      maxX = Math.max(maxX, sx, ex);
      maxY = Math.max(maxY, sy, ey);
    } else {
      const w = n.width || 240;
      const h = n.height || 240;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    }
  }

  const rect = board.getBoundingClientRect();
  const padX = 64;
  const padTop = 64;
  const padBottom = 96;
  const usableW = Math.max(100, rect.width - padX * 2);
  const usableH = Math.max(100, rect.height - padTop - padBottom);
  const contentW = Math.max(100, maxX - minX);
  const contentH = Math.max(100, maxY - minY);
  const scaleX = usableW / contentW;
  const scaleY = usableH / contentH;
  const targetScale = Math.min(scaleX, scaleY);
  const nextScale = Math.min(1.2, Math.max(MIN_SCALE, targetScale));

  view.scale = nextScale;
  view.tx = rect.width / 2 - (minX + contentW / 2) * nextScale;
  view.ty = padTop + usableH / 2 - (minY + contentH / 2) * nextScale;
  applyTransform();
}

function findNode(id: string): CanvasNode | undefined {
  return getState().items.find((n) => n.id === id);
}

function findNodeAt(wx: number, wy: number, excludeTypes: string[] = ['connector', 'drawing', 'section']): CanvasNode | undefined {
  const items = getState().items;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (excludeTypes.includes(item.type)) continue;
    const w = item.width || 180;
    const h = item.height || 180;
    if (wx >= item.x && wx <= item.x + w && wy >= item.y && wy <= item.y + h) {
      return item;
    }
  }
  return undefined;
}

const SNAP_THRESHOLD = 24;

export function closestPointOnNode(wx: number, wy: number, node: CanvasNode): { x: number; y: number } {
  const w = node.width || 160;
  const h = node.height || 100;
  const hw = w / 2;
  const hh = h / 2;
  const cx = node.x + hw;
  const cy = node.y + hh;
  const rot = typeof node.rotation === 'number' ? node.rotation : 0;

  // Transform world query point into node's local coordinate frame relative to center
  let lx = wx - cx;
  let ly = wy - cy;
  if (rot) {
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rlx = lx * cos + ly * sin;
    const rly = -lx * sin + ly * cos;
    lx = rlx;
    ly = rly;
  }

  const shapeType = node.type === 'shape' ? (node.shapeType || 'rounded-rect') : 'rounded-rect';
  let px = 0;
  let py = 0;

  // Predictable cardinal anchors (magnetic snap when hovering near cardinal points)
  const CARDINAL_DIST = 14;
  let cardinalSnapped = false;

  if (shapeType === 'triangle') {
    // Triangle cardinal anchors: Top apex, Bottom-Left, Bottom-Right, Bottom center, and Mid-sides
    const anchors = [
      { x: 0, y: -hh },
      { x: -hw, y: hh },
      { x: hw, y: hh },
      { x: 0, y: hh },
      { x: -hw / 2, y: 0 },
      { x: hw / 2, y: 0 }
    ];
    for (const a of anchors) {
      if (Math.hypot(lx - a.x, ly - a.y) <= CARDINAL_DIST) {
        px = a.x;
        py = a.y;
        cardinalSnapped = true;
        break;
      }
    }
  } else {
    // Standard cardinal anchors: Top, Right, Bottom, Left
    const anchors = [
      { x: 0, y: -hh },
      { x: hw, y: 0 },
      { x: 0, y: hh },
      { x: -hw, y: 0 }
    ];
    for (const a of anchors) {
      if (Math.hypot(lx - a.x, ly - a.y) <= CARDINAL_DIST) {
        px = a.x;
        py = a.y;
        cardinalSnapped = true;
        break;
      }
    }
  }

  if (!cardinalSnapped) {
    if (shapeType === 'circle') {
      // Continuous contour on ellipse
      const phi = Math.atan2(ly, lx);
      px = hw * Math.cos(phi);
      py = hh * Math.sin(phi);
    } else if (shapeType === 'diamond') {
      // Continuous contour on diamond: |x|/hw + |y|/hh = 1
      const denom = (Math.abs(lx) / (hw || 1)) + (Math.abs(ly) / (hh || 1));
      if (denom > 0.0001) {
        const scale = 1 / denom;
        px = lx * scale;
        py = ly * scale;
      } else {
        px = 0;
        py = -hh;
      }
    } else if (shapeType === 'triangle') {
      // Continuous contour on triangle: orthogonal projection onto the 3 boundary segments
      const segs = [
        { p1: { x: 0, y: -hh }, p2: { x: hw, y: hh } },
        { p1: { x: hw, y: hh }, p2: { x: -hw, y: hh } },
        { p1: { x: -hw, y: hh }, p2: { x: 0, y: -hh } }
      ];
      let bestDistSq = Infinity;
      for (const seg of segs) {
        const dx = seg.p2.x - seg.p1.x;
        const dy = seg.p2.y - seg.p1.y;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((lx - seg.p1.x) * dx + (ly - seg.p1.y) * dy) / lenSq)) : 0;
        const projX = seg.p1.x + t * dx;
        const projY = seg.p1.y + t * dy;
        const distSq = (lx - projX) ** 2 + (ly - projY) ** 2;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          px = projX;
          py = projY;
        }
      }
    } else if (shapeType === 'rounded-rect') {
      const r = Math.min(14, hw, hh);
      const innerW = hw - r;
      const innerH = hh - r;
      if (Math.abs(lx) > innerW && Math.abs(ly) > innerH) {
        // Corner quadrant: project to corner circle
        const ccx = Math.sign(lx) * innerW;
        const ccy = Math.sign(ly) * innerH;
        const phi = Math.atan2(ly - ccy, lx - ccx);
        px = ccx + r * Math.cos(phi);
        py = ccy + r * Math.sin(phi);
      } else {
        const clx = Math.max(-hw, Math.min(hw, lx));
        const cly = Math.max(-hh, Math.min(hh, ly));
        if (clx > -hw && clx < hw && cly > -hh && cly < hh) {
          const dLeft = clx - (-hw);
          const dRight = hw - clx;
          const dTop = cly - (-hh);
          const dBottom = hh - cly;
          const minDist = Math.min(dLeft, dRight, dTop, dBottom);
          if (minDist === dLeft) { px = -hw; py = cly; }
          else if (minDist === dRight) { px = hw; py = cly; }
          else if (minDist === dTop) { px = clx; py = -hh; }
          else { px = clx; py = hh; }
        } else {
          px = clx;
          py = cly;
        }
      }
    } else {
      // Rectangle / generic
      const clx = Math.max(-hw, Math.min(hw, lx));
      const cly = Math.max(-hh, Math.min(hh, ly));
      if (clx > -hw && clx < hw && cly > -hh && cly < hh) {
        const dLeft = clx - (-hw);
        const dRight = hw - clx;
        const dTop = cly - (-hh);
        const dBottom = hh - cly;
        const minDist = Math.min(dLeft, dRight, dTop, dBottom);
        if (minDist === dLeft) { px = -hw; py = cly; }
        else if (minDist === dRight) { px = hw; py = cly; }
        else if (minDist === dTop) { px = clx; py = -hh; }
        else { px = clx; py = hh; }
      } else {
        px = clx;
        py = cly;
      }
    }
  }

  // Transform local point back to world coordinates
  if (rot) {
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: Math.round(cx + px * cos - py * sin),
      y: Math.round(cy + px * sin + py * cos)
    };
  }

  return {
    x: Math.round(cx + px),
    y: Math.round(cy + py)
  };
}

function closestPointOnRect(wx: number, wy: number, node: CanvasNode): { x: number; y: number } {
  return closestPointOnNode(wx, wy, node);
}

function findSnapTarget(wx: number, wy: number, connId: string, handle: 'start' | 'end'): CanvasNode | null {
  const conn = findNode(connId);
  if (!conn || conn.type !== 'connector') return null;
  const otherId = handle === 'start' ? conn.endElementId : conn.startElementId;
  let best: CanvasNode | null = null;
  let bestDist = Infinity;
  for (const item of getState().items) {
    if (item.type === 'connector' || item.type === 'drawing') continue;
    if (item.id === otherId) continue; // prevent self-attachment
    const pt = closestPointOnNode(wx, wy, item);
    const d = Math.hypot(pt.x - wx, pt.y - wy);
    if (d <= SNAP_THRESHOLD && d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

// ---------- Node Builders & SVG Renderers ----------

function buildNode(node: CanvasNode): HTMLElement | null {
  let el: HTMLElement | null = null;
  if (node.type === 'image') el = buildImageNode(node);
  else if (node.type === 'video') el = buildVideoNode(node);
  else if (node.type === 'sticky') el = buildStickyNode(node);
  else if (node.type === 'shape') el = buildShapeNode(node);
  else if (node.type === 'section') el = buildSectionNode(node);
  else if (node.type === 'stamp') el = buildStampNode(node);
  else if (node.type === 'connector' || node.type === 'drawing') return null;
  else el = buildCard(node);

  if (el) {
    const rot = typeof node.rotation === 'number' ? node.rotation : 0;
    el.style.transform = `rotate(${rot}deg)`;

    // Attach rotate handle if rotatable (all except section and connector)
    if (node.type !== 'section' && !el.querySelector('.node-rotate')) {
      const rotHandle = document.createElement('div');
      rotHandle.className = 'node-rotate';
      rotHandle.dataset.rotate = 'true';
      rotHandle.title = 'Drag to rotate (Hold Shift to snap to 15°)';
      el.appendChild(rotHandle);
    }
  }
  return el;
}

function distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function distanceToConnector(px: number, py: number, conn: CanvasNode): number {
  const sx = typeof conn.startX === 'number' ? conn.startX : conn.x;
  const sy = typeof conn.startY === 'number' ? conn.startY : conn.y;
  const ex = typeof conn.endX === 'number' ? conn.endX : conn.x + (conn.width || 100);
  const ey = typeof conn.endY === 'number' ? conn.endY : conn.y + (conn.height || 100);
  const style = conn.lineStyle || 'straight';
  const hasControl = typeof conn.controlX === 'number' && typeof conn.controlY === 'number';

  if (style !== 'curved' && !hasControl) {
    return distancePointToSegment(px, py, sx, sy, ex, ey);
  }

  let cx: number;
  let cy: number;
  if (hasControl) {
    cx = conn.controlX!;
    cy = conn.controlY!;
  } else {
    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.hypot(dx, dy);
    const curvature = Math.min(60, dist * 0.2);
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
    cx = midX + nx * curvature;
    cy = midY + ny * curvature;
  }

  let minDist = Infinity;
  let prevX = sx;
  let prevY = sy;
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const curX = mt * mt * sx + 2 * mt * t * cx + t * t * ex;
    const curY = mt * mt * sy + 2 * mt * t * cy + t * t * ey;
    const d = distancePointToSegment(px, py, prevX, prevY, curX, curY);
    if (d < minDist) minDist = d;
    prevX = curX;
    prevY = curY;
  }
  return minDist;
}

function findConnectorAt(wx: number, wy: number, threshold = 16): CanvasNode | undefined {
  let closest: CanvasNode | undefined;
  let closestDist = threshold;
  const items = getState().items;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== 'connector') continue;
    const dist = distanceToConnector(wx, wy, item);
    if (dist < closestDist) {
      closestDist = dist;
      closest = item;
    }
  }
  return closest;
}

let selectedConnectorId: string | null = null;

function renderConnectors(): void {
  // QA-G5B-B: lift the SVG layer only while editing a connector so its endpoint
  // handles remain clickable when they sit inside an attached node's rect.
  connectorsLayer.classList.toggle('is-editing', selectedConnectorId !== null);
  renderConnectorsSvg(
    connectorsLayer,
    getState().items,
    selectedConnectorId,
    (id) => {
      selectedConnectorId = id;
      selectedIds.clear();
      active = null;
      paintSelection();
      renderConnectors();
      updateSelectionBar();
    },
    (id) => {
      removeNodes([id]);
    },
    (id, label) => {
      const conn = findNode(id);
      if (conn) {
        conn.label = label;
        scheduleSave();
        renderConnectors();
      }
    },
    (id) => {
      flipConnector(id);
    },
    view.scale
  );
}

function renderDrawings(): void {
  renderDrawingsSvg(
    drawingsLayer,
    getState().items,
    (id) => {
      removeNodes([id]);
    },
    drawingMode === 'eraser'
  );
}

function renderNode(node: CanvasNode): void {
  if (node.type === 'connector') {
    renderConnectors();
  } else if (node.type === 'drawing') {
    renderDrawings();
  } else {
    const el = buildNode(node);
    if (el) {
      world.appendChild(el);
      el.querySelector<HTMLElement>('.card-title, .node-text, .sticky-textarea, .shape-text, .section-title-input')?.focus();
      if (node.type === 'link' && node.url && !node.preview) void fetchPreview(node, el);
    }
  }
  updateEmpty();
}

// ---------- Undo / Redo History (35-step stack, PER BOARD in QA-G5B A2) ----------
// History stacks are keyed by board id in memory so switching canvases keeps
// each board's session history intact. Not persisted across restarts.

const historyByBoard = new Map<string, { undo: string[]; redo: string[] }>();
let currentBoardId: string | null = null;
let hist: { undo: string[]; redo: string[] } = { undo: [], redo: [] };
const HISTORY_CAP = 35;

function historyFor(boardId: string | null): { undo: string[]; redo: string[] } {
  const key = boardId ?? '__boot__';
  let entry = historyByBoard.get(key);
  if (!entry) {
    entry = { undo: [], redo: [] };
    historyByBoard.set(key, entry);
  }
  return entry;
}

function adoptBoardHistory(boardId: string | null): void {
  if (currentBoardId === null && hist.undo.length) {
    // Boot transactions raced ahead of the boards list reply: they belong to
    // the board being adopted (the boot board), keep them attributed there.
    const target = historyFor(boardId);
    if (target.undo.length === 0) target.undo = hist.undo;
    if (target.redo.length === 0) target.redo = hist.redo;
  } else if (currentBoardId && currentBoardId !== boardId) {
    historyByBoard.set(currentBoardId, hist);
  }
  currentBoardId = boardId;
  hist = historyFor(boardId);
  updateUndoRedoUI();
}

function pushHistory(json: string): void {
  if (hist.undo[hist.undo.length - 1] === json) return;
  hist.undo.push(json);
  if (hist.undo.length > HISTORY_CAP) hist.undo.shift();
  hist.redo.length = 0;
  updateUndoRedoUI();
}

let editPre: string | null = null;

function flushEditTxn(): void {
  if (editPre === null) return;
  if (JSON.stringify(getState().items) !== editPre) pushHistory(editPre);
  editPre = null;
}

function txn(fn: () => void): void {
  flushEditTxn();
  const pre = JSON.stringify(getState().items);
  try {
    fn();
    if (JSON.stringify(getState().items) !== pre) pushHistory(pre);
  } catch (err) {
    getState().items = JSON.parse(pre) as CanvasNode[];
    rebuildBoard();
    throw err;
  }
}

function applyItems(json: string): void {
  flushEditTxn();
  getState().items = JSON.parse(json) as CanvasNode[];
  rebuildBoard();
  scheduleSave();
  updateUndoRedoUI();
}

function undo(): void {
  const cur = JSON.stringify(getState().items);
  while (hist.undo.length && hist.undo[hist.undo.length - 1] === cur) hist.undo.pop();
  const prev = hist.undo.pop();
  if (prev === undefined) return;
  hist.redo.push(cur);
  applyItems(prev);
}

function redo(): void {
  const cur = JSON.stringify(getState().items);
  while (hist.redo.length && hist.redo[hist.redo.length - 1] === cur) hist.redo.pop();
  const next = hist.redo.pop();
  if (next === undefined) return;
  hist.undo.push(cur);
  applyItems(next);
}

function updateUndoRedoUI(): void {
  const canUndo = hist.undo.length > 0;
  const canRedo = hist.redo.length > 0;
  if (undoBtn) {
    undoBtn.style.opacity = canUndo ? '1' : '0.4';
    undoBtn.disabled = !canUndo;
  }
  if (redoBtn) {
    redoBtn.style.opacity = canRedo ? '1' : '0.4';
    redoBtn.disabled = !canRedo;
  }
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]');
}

// ---------- Tool Modes & State Management ----------

let activeTool: ActiveTool = 'move';
let drawingMode: 'pen' | 'highlighter' | 'eraser' = 'pen';
let currentPenColor = '#EF4444'; // Snipping tool red default
let currentPenSize = 3;
let currentHighlighterColor = PEEPJAM_HIGHLIGHTER_COLORS[0]; // '#FFE600' Neon Yellow
let currentHighlighterSize = 18;
let currentEraserSize = 24;
let currentPastel = PEEPJAM_PASTELS[0];
let currentShape: ShapeType = 'rounded-rect';
let currentConnectorStyle: ConnectorLineStyle = 'straight';
let spacebarHeld = false;
let prevToolBeforeSpace: ActiveTool = 'move';
let currentStamp: string = PEEPJAM_STAMPS[0].emoji;

// ---------- Grid Style Engine ----------

type GridStyle = 'dots' | 'lines' | 'blank';
let currentGridStyle: GridStyle = 'dots';

function applyGridStyle(style: GridStyle, save = false): void {
  currentGridStyle = style;
  board.classList.remove('grid-dots', 'grid-lines', 'grid-blank');
  board.classList.add(`grid-${style}`);
  const label = style === 'dots' ? 'Dots' : style === 'lines' ? 'Lines' : 'Blank';
  if (gridModeLabel) gridModeLabel.textContent = label;
  if (menuGridLabel) menuGridLabel.textContent = `? Grid: ${label}`;
  if (save) {
    getState().gridStyle = style;
    scheduleSave();
  }
}

function cycleGridStyle(): void {
  const next: GridStyle = currentGridStyle === 'dots' ? 'lines' : currentGridStyle === 'lines' ? 'blank' : 'dots';
  applyGridStyle(next, true);
}

gridToggleBtn?.addEventListener('click', () => cycleGridStyle());

function closeAllDockPopovers(): void {
  penPopover?.classList.add('hidden');
  stickyPopover?.classList.add('hidden');
  shapesPopover?.classList.add('hidden');
  stampPopover?.classList.add('hidden');
  mediaPopover?.classList.add('hidden');
  closeAllMenuDropdowns();
  exportPanel?.classList.add('hidden');
  // QA-G5 P3-1: the settings/clip panels honor the shared close semantics
  // (restore focus to the invoking control when focus is still inside them).
  if (settingsPanel && !settingsPanel.classList.contains('hidden')) closeSurface(settingsPanel);
  if (clipPanel && !clipPanel.classList.contains('hidden')) closeSurface(clipPanel);
  selBarPalette?.classList.add('hidden');
  selFontMenu?.classList.add('hidden');
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

function getPenCursorSvg(color: string): string {
  // 32x32 pixel-perfect Windows Ink style pen pointing to bottom-left (2, 28)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <filter id="p-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000000" flood-opacity="0.65"/>
    </filter>
  </defs>
  <g filter="url(#p-shadow)">
    <!-- Pen Barrel -->
    <path d="M 11 15 L 23 3 C 24.5 1.5 27.5 1.5 29 3 C 30.5 4.5 30.5 7.5 29 9 L 17 21 Z" fill="#18181B" stroke="#000000" stroke-width="1" stroke-linejoin="round"/>
    <!-- Pen Barrel Colored Accent Band -->
    <path d="M 16 10 L 25 1 C 26 2 27.5 3.5 28.5 4.5 L 19.5 13.5 Z" fill="${color}"/>
    <!-- Metallic Collar -->
    <polygon points="11,15 7,19 13,25 17,21" fill="#E4E4E7" stroke="#3F3F46" stroke-width="0.8"/>
    <!-- Nib Base -->
    <polygon points="2,28 7,19 13,25" fill="${color}" stroke="#000000" stroke-width="0.8"/>
    <!-- Ink Slit -->
    <line x1="2" y1="28" x2="8" y2="22" stroke="#FFFFFF" stroke-width="0.8" stroke-linecap="round"/>
    <!-- Fine Tip Contact Dot -->
    <circle cx="2" cy="28" r="1.1" fill="#FFFFFF"/>
  </g>
</svg>`;
  return svgToDataUri(svg);
}

function getHighlighterCursorSvg(color: string): string {
  // 32x32 Chisel-tip Neon Marker pointing to chisel edge (3, 27)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <filter id="h-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000000" flood-opacity="0.65"/>
    </filter>
  </defs>
  <g filter="url(#h-shadow)">
    <!-- Thick Marker Body -->
    <path d="M 11 17 L 22 6 C 23.5 4.5 26.5 4.5 28 6 C 29.5 7.5 29.5 10.5 28 12 L 17 23 Z" fill="#27272A" stroke="#09090B" stroke-width="1.2" stroke-linejoin="round"/>
    <!-- Colored Body Glow Ribbon -->
    <path d="M 14 14 L 24 4 C 25.2 5.2 26.8 6.8 28 8 L 18 18 Z" fill="${color}" opacity="0.85"/>
    <!-- Black Collar Wedge -->
    <polygon points="8,20 11,17 17,23 14,26" fill="#09090B" stroke="#000000" stroke-width="0.8"/>
    <!-- Chisel Tip (45-degree flat blade edge at 3,27 to 7,23) -->
    <polygon points="3,27 7,23 11,27 7,31" fill="${color}" stroke="#000000" stroke-width="0.9"/>
    <!-- Chisel Edge Highlight Line -->
    <line x1="3" y1="27" x2="7" y2="23" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
  </g>
</svg>`;
  return svgToDataUri(svg);
}

function getEraserCursorSvg(): string {
  // 32x32 Isometric Bevel Eraser block with pink body and blue wrap collar pointing to (3, 25)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <filter id="e-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000000" flood-opacity="0.65"/>
    </filter>
  </defs>
  <g filter="url(#e-shadow)">
    <!-- Pink Eraser Body Bevel Left -->
    <polygon points="3,25 11,17 15,21 7,29" fill="#FB7185" stroke="#000000" stroke-width="1"/>
    <!-- Pink Eraser Top Face -->
    <polygon points="11,17 21,7 25,11 15,21" fill="#FDA4AF" stroke="#000000" stroke-width="1"/>
    <!-- Blue Paper Sleeve / Collar -->
    <polygon points="9,19 17,11 21,15 13,23" fill="#38BDF8" stroke="#000000" stroke-width="0.8"/>
    <!-- Sleeve Accent Stripe -->
    <line x1="12" y1="16" x2="16" y2="20" stroke="#FFFFFF" stroke-width="1.2"/>
    <!-- Bottom Wiping Edge (at contact point 3, 25) -->
    <line x1="3" y1="25" x2="7" y2="29" stroke="#E11D48" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="3" cy="25" r="1.2" fill="#FFFFFF"/>
  </g>
</svg>`;
  return svgToDataUri(svg);
}

function updateCanvasCursor(): void {
  board.classList.remove('tool-pen', 'tool-highlighter', 'tool-eraser', 'tool-hand');

  if (activeTool === 'pen') {
    board.classList.add('tool-pen');
    board.style.cursor = `url("${getPenCursorSvg(currentPenColor)}") 2 28, crosshair`;
  } else if (activeTool === 'highlighter') {
    board.classList.add('tool-highlighter');
    board.style.cursor = `url("${getHighlighterCursorSvg(currentHighlighterColor)}") 3 27, crosshair`;
  } else if (activeTool === 'eraser') {
    board.classList.add('tool-eraser');
    board.style.cursor = `url("${getEraserCursorSvg()}") 3 25, crosshair`;
  } else if (activeTool === 'hand') {
    board.classList.add('tool-hand');
    board.style.cursor = 'grab';
  } else if (activeTool === 'stamp') {
    board.style.cursor = 'copy';
  } else if (activeTool === 'move' || activeTool === 'select') {
    board.style.cursor = 'default';
  } else {
    board.style.cursor = 'default';
  }
}

function updateStrokePreview(): void {
  if (!brushSizeSlider || !brushSizeDisplay || !strokePreviewWave) return;

  if (drawingMode === 'pen') {
    brushSizeDisplay.textContent = `${currentPenSize} px`;
    brushSizeSlider.min = '1';
    brushSizeSlider.max = '36';
    brushSizeSlider.value = String(currentPenSize);
    strokePreviewWave.setAttribute('stroke', currentPenColor);
    strokePreviewWave.setAttribute('stroke-width', String(currentPenSize));
    strokePreviewWave.setAttribute('opacity', '1');
    strokePreviewWave.removeAttribute('stroke-dasharray');
  } else if (drawingMode === 'highlighter') {
    brushSizeDisplay.textContent = `${currentHighlighterSize} px`;
    brushSizeSlider.min = '6';
    brushSizeSlider.max = '48';
    brushSizeSlider.value = String(currentHighlighterSize);
    strokePreviewWave.setAttribute('stroke', currentHighlighterColor);
    strokePreviewWave.setAttribute('stroke-width', String(currentHighlighterSize));
    strokePreviewWave.setAttribute('opacity', '0.55');
    strokePreviewWave.removeAttribute('stroke-dasharray');
  } else if (drawingMode === 'eraser') {
    brushSizeDisplay.textContent = `${currentEraserSize} px`;
    brushSizeSlider.min = '8';
    brushSizeSlider.max = '64';
    brushSizeSlider.value = String(currentEraserSize);
    strokePreviewWave.setAttribute('stroke', '#9CA3AF');
    strokePreviewWave.setAttribute('stroke-width', String(Math.min(24, currentEraserSize)));
    strokePreviewWave.setAttribute('opacity', '0.75');
    strokePreviewWave.setAttribute('stroke-dasharray', '6 4');
  }
}

brushSizeSlider?.addEventListener('input', () => {
  const val = parseInt(brushSizeSlider.value, 10) || 3;
  if (drawingMode === 'pen') {
    currentPenSize = val;
  } else if (drawingMode === 'highlighter') {
    currentHighlighterSize = val;
  } else if (drawingMode === 'eraser') {
    currentEraserSize = val;
  }
  updateStrokePreview();
});

function renderPenPalette(): void {
  if (!penColorsContainer) return;
  penColorsContainer.replaceChildren();

  const colors = drawingMode === 'highlighter' ? PEEPJAM_HIGHLIGHTER_COLORS : PEEPJAM_PEN_COLORS;
  const activeColor = drawingMode === 'highlighter' ? currentHighlighterColor : currentPenColor;

  colors.forEach((c) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.style.backgroundColor = c;
    if (c.toLowerCase() === activeColor.toLowerCase()) {
      dot.classList.add('is-active');
    }
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (drawingMode === 'highlighter') {
        currentHighlighterColor = c;
      } else {
        currentPenColor = c;
      }
      penColorsContainer.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('is-active'));
      dot.classList.add('is-active');
      updateStrokePreview();
      updateCanvasCursor();
    });
    penColorsContainer.appendChild(dot);
  });
}

function setActiveTool(tool: ActiveTool): void {
  spacebarHeld = false;
  if (tool !== 'hand') {
    panning = null;
    board.classList.remove('panning', 'tool-hand');
  } else {
    board.classList.add('tool-hand');
  }
  activeTool = tool;

  document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('is-active'));
  if (tool === 'move' || tool === 'select') (toolSelect || toolMove)?.classList.add('is-active');
  else if (tool === 'hand') toolHand?.classList.add('is-active');
  else if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
    toolPen?.classList.add('is-active');
    if (tool === 'pen') toolPen.title = 'Pen (P)';
    else if (tool === 'highlighter') toolPen.title = 'Highlighter (P)';
    else if (tool === 'eraser') toolPen.title = 'Eraser (P)';
  }
  else if (tool === 'sticky') toolSticky?.classList.add('is-active');
  else if (tool === 'shape') toolShape?.classList.add('is-active');
  else if (tool === 'connector') toolConnector?.classList.add('is-active');
  else if (tool === 'line') toolLine?.classList.add('is-active');
  else if (tool === 'text') toolText?.classList.add('is-active');
  else if (tool === 'todo') toolTodo?.classList.add('is-active');
  else if (tool === 'thought') toolThought?.classList.add('is-active');
  else if (tool === 'section') toolSection?.classList.add('is-active');
  else if (tool === 'stamp') toolStamp?.classList.add('is-active');

  updateCanvasCursor();
  renderDrawings();
}

function initPalettes(): void {
  renderPenPalette();

  stickyColorsContainer.replaceChildren();
  PEEPJAM_PASTELS.forEach((p) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.style.backgroundColor = p.bg;
    dot.title = p.name;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPastel = p;
      setActiveTool('sticky');
      closeAllDockPopovers();
    });
    stickyColorsContainer.appendChild(dot);
  });

  // Stamps palette
  if (stampGrid) {
    stampGrid.replaceChildren();
    PEEPJAM_STAMPS.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'stamp-pick-btn';
      btn.textContent = s.emoji;
      btn.title = s.name;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentStamp = s.emoji;
        setActiveTool('stamp');
        closeAllDockPopovers();
      });
      stampGrid.appendChild(btn);
    });
  }

  updateStrokePreview();
}
initPalettes();

function setDrawingMode(mode: 'pen' | 'highlighter' | 'eraser'): void {
  drawingMode = mode;
  modePen.classList.toggle('is-active', mode === 'pen');
  modeHighlighter.classList.toggle('is-active', mode === 'highlighter');
  modeEraser.classList.toggle('is-active', mode === 'eraser');

  if (mode === 'eraser') {
    if (penColorSection) penColorSection.style.display = 'none';
  } else {
    if (penColorSection) penColorSection.style.display = 'flex';
    if (penColorsLabel) {
      penColorsLabel.textContent = mode === 'highlighter' ? 'Highlighter Colors' : 'Colors';
    }
    renderPenPalette();
  }

  updateStrokePreview();
  setActiveTool(mode);
}

modePen.addEventListener('click', (e) => {
  e.stopPropagation();
  setDrawingMode('pen');
});
modeHighlighter.addEventListener('click', (e) => {
  e.stopPropagation();
  setDrawingMode('highlighter');
});
modeEraser.addEventListener('click', (e) => {
  e.stopPropagation();
  setDrawingMode('eraser');
});

toolMove?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('move');
});

toolSelect.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('select');
});

toolHand.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('hand');
});

toolPen.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = penPopover.classList.contains('hidden');
  closeAllDockPopovers();
  penPopover.classList.toggle('hidden', !wasHidden);
  if (wasHidden) {
    updateStrokePreview();
    renderPenPalette();
  }
  setActiveTool(drawingMode);
});

toolSticky.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = stickyPopover.classList.contains('hidden');
  closeAllDockPopovers();
  stickyPopover.classList.toggle('hidden', !wasHidden);
  setActiveTool('sticky');
});

toolShape.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = shapesPopover.classList.contains('hidden');
  closeAllDockPopovers();
  shapesPopover.classList.toggle('hidden', !wasHidden);
  setActiveTool('shape');
});

shapesPopover.querySelectorAll<HTMLButtonElement>('.shape-pick-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentShape = (btn.dataset.shape as ShapeType) || 'rounded-rect';
    setActiveTool('shape');
    closeAllDockPopovers();
  });
});

toolConnector.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('connector');
});

toolLine?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('line');
});

toolText.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('text');
});

toolTodo?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('todo');
});

toolThought?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('thought');
});

toolSection.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  setActiveTool('section');
});

toolStamp?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = stampPopover.classList.contains('hidden');
  closeAllDockPopovers();
  stampPopover.classList.toggle('hidden', !wasHidden);
  setActiveTool('stamp');
});

// Prevent any pointerdown/dblclick/contextmenu events inside floating docks or UI controls from reaching the canvas engine
const uiGuardElements = [
  document.getElementById('peepjam-dock'),
  document.getElementById('figjam-dock'),
  document.getElementById('zoom-pill'),
  selectionBar,
  document.getElementById('titlebar'),
  document.getElementById('templates-modal')
];

for (const el of uiGuardElements) {
  if (!el) continue;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('dblclick', (e) => e.stopPropagation());
  el.addEventListener('contextmenu', (e) => e.stopPropagation());
}

// ---------- Floating Selection Action Bar Wiring ----------

function applyNodeTypography(node: CanvasNode): void {
  const el = nodeByIdInWorld(node.id);
  if (!el) return;

  const font = node.fontFamily || 'Inter, system-ui, sans-serif';
  const size = node.fontSize || (node.type === 'sticky' ? 14 : 14);
  const isBold = node.fontWeight === 'bold' || !!node.isBold;
  const isItalic = node.fontStyle === 'italic' || !!node.isItalic;

  if (node.type === 'sticky') {
    updateStickyTypography(el, node);
  } else if (node.type === 'shape') {
    const textDiv = el.querySelector<HTMLElement>('.shape-text');
    if (textDiv) {
      textDiv.style.fontFamily = font;
      textDiv.style.fontSize = `${size}px`;
      textDiv.style.fontWeight = isBold ? '700' : 'normal';
      textDiv.style.fontStyle = isItalic ? 'italic' : 'normal';
    }
  } else if (node.type === 'text') {
    const textEl = el.querySelector<HTMLElement>('.node-text') || el;
    textEl.style.fontFamily = font;
    textEl.style.fontSize = `${size}px`;
    textEl.style.fontWeight = isBold ? '700' : 'normal';
    textEl.style.fontStyle = isItalic ? 'italic' : 'normal';
  } else if (node.type === 'thought' || node.type === 'todo' || node.type === 'link') {
    const body = el.querySelector<HTMLElement>('.node-text');
    if (body) {
      body.style.fontFamily = font;
      body.style.fontSize = `${size}px`;
      body.style.fontWeight = isBold ? '700' : 'normal';
      body.style.fontStyle = isItalic ? 'italic' : 'normal';
    }
  }
}

function toggleBoldSelection(): void {
  if (selectedIds.size === 0) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
    const activeEl = document.activeElement as HTMLElement | null;
    const richEl = activeEl?.closest<HTMLElement>('[data-rich]');
    if (richEl) {
      document.execCommand('bold', false);
      richEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }
  const isCurrentlyBold = selBoldBtn?.classList.contains('is-active') ?? false;
  const nextBold = !isCurrentlyBold;
  txn(() => {
    for (const id of selectedIds) {
      const n = findNode(id);
      if (!n) continue;
      if (n.type === 'sticky') {
        if (activeTextTarget === 'title') {
          n.titleFontWeight = nextBold ? 'bold' : 'normal';
          n.titleIsBold = nextBold;
        } else {
          n.fontWeight = nextBold ? 'bold' : 'normal';
          n.isBold = nextBold;
        }
      } else {
        n.fontWeight = nextBold ? 'bold' : 'normal';
        n.isBold = nextBold;
      }
      applyNodeTypography(n);
    }
    scheduleSave();
    updateSelectionBar();
  });
}

function toggleItalicSelection(): void {
  if (selectedIds.size === 0) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
    const activeEl = document.activeElement as HTMLElement | null;
    const richEl = activeEl?.closest<HTMLElement>('[data-rich]');
    if (richEl) {
      document.execCommand('italic', false);
      richEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }
  const isCurrentlyItalic = selItalicBtn?.classList.contains('is-active') ?? false;
  const nextItalic = !isCurrentlyItalic;
  txn(() => {
    for (const id of selectedIds) {
      const n = findNode(id);
      if (!n) continue;
      if (n.type === 'sticky') {
        if (activeTextTarget === 'title') {
          n.titleFontStyle = nextItalic ? 'italic' : 'normal';
          n.titleIsItalic = nextItalic;
        } else {
          n.fontStyle = nextItalic ? 'italic' : 'normal';
          n.isItalic = nextItalic;
        }
      } else {
        n.fontStyle = nextItalic ? 'italic' : 'normal';
        n.isItalic = nextItalic;
      }
      applyNodeTypography(n);
    }
    scheduleSave();
    updateSelectionBar();
  });
}

function setTextTypeSelection(type: 'h1' | 'h2' | 'h3' | 'h4' | 'p'): void {
  if (selectedIds.size === 0) return;
  const titleSizes: Record<string, number> = { h1: 28, h2: 24, h3: 20, h4: 18, p: 16 };
  txn(() => {
    for (const id of selectedIds) {
      const n = findNode(id);
      if (!n) continue;
      if (n.type === 'sticky') {
        if (activeTextTarget === 'title') {
          n.titleLevel = type;
          n.titleFontSize = titleSizes[type] || 24;
        } else {
          n.textType = type;
          n.fontSize = type === 'p' ? 16 : (titleSizes[type] || 16);
        }
      } else {
        n.textType = type;
        n.fontSize = type === 'p' ? 16 : (titleSizes[type] || 16);
      }
      applyNodeTypography(n);
    }
    scheduleSave();
    updateSelectionBar();
  });
  if (selTypeLabel) selTypeLabel.textContent = type.toUpperCase();
  selTypeMenu?.classList.add('hidden');
}

function stepFontSizeSelection(delta: number): void {
  if (selectedIds.size === 0) return;
  const curVal = parseInt(selSizeLabel?.textContent || '16', 10) || 16;
  const nextVal = Math.max(10, Math.min(72, curVal + delta));
  txn(() => {
    for (const id of selectedIds) {
      const n = findNode(id);
      if (!n) continue;
      if (n.type === 'sticky') {
        if (activeTextTarget === 'title') {
          n.titleFontSize = nextVal;
        } else {
          n.fontSize = nextVal;
        }
      } else {
        n.fontSize = nextVal;
      }
      applyNodeTypography(n);
    }
    scheduleSave();
    updateSelectionBar();
  });
}

function setFontFamilySelection(font: string, label: string): void {
  if (selectedIds.size === 0) return;
  txn(() => {
    for (const id of selectedIds) {
      const n = findNode(id);
      if (!n) continue;
      if (n.type === 'sticky') {
        if (activeTextTarget === 'title') {
          n.titleFontFamily = font;
        } else {
          n.fontFamily = font;
        }
      } else {
        n.fontFamily = font;
      }
      applyNodeTypography(n);
    }
    scheduleSave();
    updateSelectionBar();
  });
  selFontMenu?.classList.add('hidden');
}

function bindToolbarBtn(btn: HTMLElement | null, fn: (e: Event) => void): void {
  if (!btn) return;
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    fn(e);
  });
}

function renderPaletteContent(): void {
  if (!selBarPalette) return;
  selBarPalette.replaceChildren();

  const hasSelectedCards = selectedIds.size > 0;
  const hasSelectedConnectorOnly = !hasSelectedCards && selectedConnectorId !== null;

  if (hasSelectedConnectorOnly) {
    PEEPJAM_CONNECTOR_COLORS.forEach((c) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot';
      dot.style.backgroundColor = c.color;
      dot.title = c.name;
      bindToolbarBtn(dot, () => {
        txn(() => {
          if (selectedConnectorId) {
            const conn = findNode(selectedConnectorId);
            if (conn) {
              conn.color = c.color;
              renderConnectors();
              scheduleSave();
              updateSelectionBar();
            }
          }
        });
        selBarPalette.classList.add('hidden');
      });
      selBarPalette.appendChild(dot);
    });
  } else {
    PEEPJAM_PASTELS.forEach((p) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot';
      dot.style.backgroundColor = p.bg;
      dot.title = p.name;
      bindToolbarBtn(dot, () => {
        txn(() => {
          const idsToUpdate = new Set(selectedIds);
          if (selectedConnectorId) idsToUpdate.add(selectedConnectorId);
          for (const id of idsToUpdate) {
            const n = findNode(id);
            if (!n) continue;
            const el = nodeByIdInWorld(id);
            if (n.type === 'connector') {
              n.color = getHighContrastConnectorColor(p.bg);
            } else if (n.type === 'sticky') {
              n.color = p.bg;
              n.textColor = p.text;
              if (el) {
                el.style.backgroundColor = p.bg;
                el.style.color = p.text;
                const ta = el.querySelector<HTMLTextAreaElement>('.sticky-textarea');
                if (ta) ta.style.color = p.text;
                const ti = el.querySelector<HTMLInputElement>('.sticky-title-input');
                if (ti) ti.style.color = p.text;
                el.querySelectorAll<HTMLInputElement>('.sticky-check-input').forEach((inp) => (inp.style.color = p.text));
              }
            } else if (n.type === 'shape') {
              if (el) applyShapeColor(el, n, p);
            } else if (n.type === 'section') {
              if (el) applySectionColor(el, n, p.bg);
            } else if (n.type === 'thought' || n.type === 'todo' || n.type === 'link') {
              n.color = p.bg;
              if (el) el.style.setProperty('--card-color', p.bg);
            }
          }
          renderConnectors();
          scheduleSave();
          updateSelectionBar();
        });
        selBarPalette.classList.add('hidden');
      });
      selBarPalette.appendChild(dot);
    });
  }
}

let selectionBarInitialized = false;

function initSelectionBar(): void {
  if (selectionBarInitialized) return;
  if (!selBarPalette) return;
  selectionBarInitialized = true;

  renderPaletteContent();

  // Text Type / Heading Level dropdown toggle button
  bindToolbarBtn(selTypeBtn, () => {
    selBarPalette?.classList.add('hidden');
    selFontMenu?.classList.add('hidden');
    selRotateMenu?.classList.add('hidden');
    selTypeMenu?.classList.toggle('hidden');
  });

  // Text Type choices (H1, H2, H3, H4, P)
  selTypeMenu?.querySelectorAll<HTMLButtonElement>('.sel-drop-item').forEach((item) => {
    bindToolbarBtn(item, () => {
      const type = (item.dataset.type || 'h2') as 'h1' | 'h2' | 'h3' | 'h4' | 'p';
      setTextTypeSelection(type);
    });
  });

  // Color picker toggle button
  bindToolbarBtn(selColorToggleBtn, () => {
    selFontMenu?.classList.add('hidden');
    selTypeMenu?.classList.add('hidden');
    selRotateMenu?.classList.add('hidden');
    renderPaletteContent();
    selBarPalette?.classList.toggle('hidden');
  });

  // Font family dropdown toggle button
  bindToolbarBtn(selFontBtn, () => {
    selBarPalette?.classList.add('hidden');
    selTypeMenu?.classList.add('hidden');
    selFontMenu?.classList.toggle('hidden');
  });

  // Font family choices
  selFontMenu?.querySelectorAll<HTMLButtonElement>('.sel-drop-item').forEach((item) => {
    bindToolbarBtn(item, () => {
      const font = item.dataset.font || 'Inter';
      const label = item.textContent?.trim() || font;
      setFontFamilySelection(font, label);
    });
  });

  // Font size decrease
  bindToolbarBtn(selSizeDec, () => {
    stepFontSizeSelection(-2);
  });

  // Font size increase
  bindToolbarBtn(selSizeInc, () => {
    stepFontSizeSelection(2);
  });

  // Bold toggle button
  bindToolbarBtn(selBoldBtn, () => {
    toggleBoldSelection();
  });

  // Italic toggle button
  bindToolbarBtn(selItalicBtn, () => {
    toggleItalicSelection();
  });

  // Rotation button (click: +15°, Shift+click: +45°, right-click: reset 0°)
  if (selRotateBtn) {
    bindToolbarBtn(selRotateBtn, (e?: Event) => {
      const mouseEv = e as MouseEvent | undefined;
      const step = mouseEv?.shiftKey ? 45 : 15;
      rotateSelection(step);
    });
    selRotateBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      setSelectionRotation(0);
    });
  }

  // Rotation presets menu toggle
  if (selRotateMenuBtn) {
    bindToolbarBtn(selRotateMenuBtn, () => {
      selBarPalette?.classList.add('hidden');
      selFontMenu?.classList.add('hidden');
      selTypeMenu?.classList.add('hidden');
      selRotateMenu?.classList.toggle('hidden');
    });
  }

  // Rotation presets menu items
  selRotateMenu?.querySelectorAll<HTMLButtonElement>('.sel-drop-item').forEach((item) => {
    bindToolbarBtn(item, () => {
      if (item.dataset.rotateStep !== undefined) {
        const step = parseInt(item.dataset.rotateStep, 10) || 15;
        rotateSelection(step);
      } else if (item.dataset.rotateSet !== undefined) {
        const angle = parseInt(item.dataset.rotateSet, 10) || 0;
        setSelectionRotation(angle);
      }
      selRotateMenu?.classList.add('hidden');
    });
  });

  // Editable numeric rotation angle input (-180° to 180°)
  if (selRotateInput) {
    const commitInputAngle = () => {
      const raw = selRotateInput.value.trim();
      const val = parseFloat(raw);
      if (!Number.isNaN(val)) {
        let clamped = Math.max(-180, Math.min(180, Math.round(val)));
        setSelectionRotation(clamped);
        selRotateInput.value = String(clamped);
      } else {
        updateSelectionBar();
      }
    };

    selRotateInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInputAngle();
        selRotateInput.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        updateSelectionBar();
        selRotateInput.blur();
      }
    });

    selRotateInput.addEventListener('change', () => {
      commitInputAngle();
    });

    selRotateInput.addEventListener('focus', () => {
      selRotateInput.select();
    });
  }

  bindToolbarBtn(selDupBtn, () => {
    duplicateSelected();
  });

  bindToolbarBtn(selForwardBtn, () => {
    zOrder(1);
    updateSelectionBar();
  });

  bindToolbarBtn(selBackwardBtn, () => {
    zOrder(-1);
    updateSelectionBar();
  });

  bindToolbarBtn(selTargetTitleBtn, () => {
    activeTextTarget = 'title';
    updateSelectionBar();
  });

  bindToolbarBtn(selTargetBodyBtn, () => {
    activeTextTarget = 'body';
    updateSelectionBar();
  });

  bindToolbarBtn(selFlipPosBtn, () => {
    selBarPosition = selBarPosition === 'bottom' ? 'top' : 'bottom';
    try {
      localStorage.setItem('peepdesk_selbar_pos', selBarPosition);
    } catch {}
    updateSelectionBar();
  });

  if (selConnColorBtn) {
    bindToolbarBtn(selConnColorBtn, () => {
      selConnWidthMenu?.classList.add('hidden');
      selConnArrowMenu?.classList.add('hidden');
      selConnSizeMenu?.classList.add('hidden');
      renderConnPaletteContent();
      selConnPalette?.classList.toggle('hidden');
    });
  }

  if (selConnWidthBtn) {
    bindToolbarBtn(selConnWidthBtn, () => {
      selConnPalette?.classList.add('hidden');
      selConnArrowMenu?.classList.add('hidden');
      selConnSizeMenu?.classList.add('hidden');
      selConnWidthMenu?.classList.toggle('hidden');
    });
  }

  selConnWidthMenu?.querySelectorAll<HTMLButtonElement>('.sel-drop-item').forEach((item) => {
    bindToolbarBtn(item, () => {
      const w = Number(item.dataset.connWidth || '3');
      if (selectedConnectorId) {
        setConnectorWidth(selectedConnectorId, w);
      }
      selConnWidthMenu?.classList.add('hidden');
    });
  });

  if (selConnArrowBtn) {
    bindToolbarBtn(selConnArrowBtn, () => {
      selConnPalette?.classList.add('hidden');
      selConnWidthMenu?.classList.add('hidden');
      selConnSizeMenu?.classList.add('hidden');
      selConnArrowMenu?.classList.toggle('hidden');
    });
  }

  selConnArrowMenu?.querySelectorAll<HTMLButtonElement>('.sel-drop-item').forEach((item) => {
    bindToolbarBtn(item, () => {
      const s = item.dataset.arrowStyle as 'end' | 'both' | 'start' | 'none';
      if (selectedConnectorId && s) {
        setConnectorArrowStyle(selectedConnectorId, s);
      }
      selConnArrowMenu?.classList.add('hidden');
    });
  });

  if (selConnSizeBtn) {
    bindToolbarBtn(selConnSizeBtn, () => {
      selConnPalette?.classList.add('hidden');
      selConnWidthMenu?.classList.add('hidden');
      selConnArrowMenu?.classList.add('hidden');
      selConnSizeMenu?.classList.toggle('hidden');
    });
  }

  selConnSizeMenu?.querySelectorAll<HTMLButtonElement>('.sel-drop-item').forEach((item) => {
    bindToolbarBtn(item, () => {
      const sz = Number(item.dataset.arrowSize || '12');
      if (selectedConnectorId) {
        setConnectorArrowSize(selectedConnectorId, sz);
      }
      selConnSizeMenu?.classList.add('hidden');
    });
  });

  if (selConnStyleBtn) {
    bindToolbarBtn(selConnStyleBtn, () => {
      if (selectedConnectorId) {
        toggleConnectorStyle(selectedConnectorId);
      }
    });
  }

  // QA-G5B-B: Straighten / Reset Bend action for the selected connector.
  if (selConnStraightenBtn) {
    bindToolbarBtn(selConnStraightenBtn, () => {
      if (selectedConnectorId) {
        straightenConnector(selectedConnectorId);
      }
    });
  }

  if (selConnFlipBtn) {
    bindToolbarBtn(selConnFlipBtn, () => {
      if (selectedConnectorId) {
        flipConnector(selectedConnectorId);
      }
    });
  }

  bindToolbarBtn(selDelBtn, () => {
    deleteSelection();
  });
}

function renderConnPaletteContent(): void {
  if (!selConnPalette) return;
  selConnPalette.replaceChildren();
  PEEPJAM_CONNECTOR_COLORS.forEach((c) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.style.backgroundColor = c.color;
    dot.title = c.name;
    bindToolbarBtn(dot, () => {
      if (selectedConnectorId) {
        setConnectorColor(selectedConnectorId, c.color);
      }
      selConnPalette?.classList.add('hidden');
    });
    selConnPalette?.appendChild(dot);
  });
}

function setConnectorColor(id: string, color: string): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  txn(() => {
    conn.color = color;
    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

function setConnectorWidth(id: string, width: number): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  txn(() => {
    conn.strokeWidth = width;
    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

function setConnectorArrowStyle(id: string, style: 'end' | 'both' | 'start' | 'none'): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  txn(() => {
    conn.arrowEnd = style === 'end' || style === 'both';
    conn.arrowStart = style === 'start' || style === 'both';
    conn.arrowheadStyle = style;
    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

function setConnectorArrowSize(id: string, size: number): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  txn(() => {
    conn.arrowheadSize = size;
    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

function toggleConnectorStyle(id: string): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  txn(() => {
    const nextStyle: ConnectorLineStyle = (conn.lineStyle || 'straight') === 'straight' ? 'curved' : 'straight';
    conn.lineStyle = nextStyle;
    currentConnectorStyle = nextStyle;
    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

// QA-G5B-B: clear the persistent bend (controlX/controlY) and force straight style.
// Preserves endpoints, labels, attachment ids, direction and all other metadata.
function straightenConnector(id: string): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  const hasBend = typeof conn.controlX === 'number' && typeof conn.controlY === 'number';
  if (!hasBend && conn.lineStyle === 'straight') return;
  txn(() => {
    if (typeof conn!.controlX === 'number') delete conn!.controlX;
    if (typeof conn!.controlY === 'number') delete conn!.controlY;
    conn!.lineStyle = 'straight';
    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

function flipConnector(id: string): void {
  const conn = findNode(id);
  if (!conn || conn.type !== 'connector') return;
  txn(() => {
    const tmpX = conn.startX ?? conn.x;
    const tmpY = conn.startY ?? conn.y;
    conn.startX = conn.endX ?? conn.x + conn.width;
    conn.startY = conn.endY ?? conn.y + conn.height;
    conn.endX = tmpX;
    conn.endY = tmpY;

    const tmpEl = conn.startElementId;
    conn.startElementId = conn.endElementId;
    conn.endElementId = tmpEl;

    const tmpArrowEnd = conn.arrowEnd !== false;
    const tmpArrowStart = conn.arrowStart === true;
    conn.arrowEnd = tmpArrowStart;
    conn.arrowStart = tmpArrowEnd;

    // Mirror persistent bend control point across the midpoint.
    if (typeof conn.controlX === 'number' && typeof conn.controlY === 'number') {
      const sx = conn.startX ?? conn.x;
      const sy = conn.startY ?? conn.y;
      const ex = conn.endX ?? conn.x + conn.width;
      const ey = conn.endY ?? conn.y + conn.height;
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      conn.controlX = 2 * mx - conn.controlX;
      conn.controlY = 2 * my - conn.controlY;
    }

    conn.x = Math.min(conn.startX, conn.endX);
    conn.y = Math.min(conn.startY, conn.endY);
    conn.width = Math.abs(conn.endX - conn.startX);
    conn.height = Math.abs(conn.endY - conn.startY);

    scheduleSave();
    renderConnectors();
    updateSelectionBar();
  });
}

function rotateSelection(deltaDegrees: number): void {
  if (!selectedIds.size) return;
  txn(() => {
    const isGroup = selectedIds.size > 1;
    let gcx = 0;
    let gcy = 0;
    if (isGroup) {
      let sumX = 0;
      let sumY = 0;
      for (const id of selectedIds) {
        const n = findNode(id);
        if (n) {
          sumX += n.x + (n.width || 180) / 2;
          sumY += n.y + (n.height || 180) / 2;
        }
      }
      gcx = sumX / selectedIds.size;
      gcy = sumY / selectedIds.size;
    }

    const rad = deltaDegrees * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (const id of selectedIds) {
      const n = findNode(id);
      if (!n) continue;
      let angle = Math.round((n.rotation || 0) + deltaDegrees);
      let norm = ((angle % 360) + 360) % 360;
      if (norm > 180) norm -= 360;
      n.rotation = norm;

      if (isGroup) {
        const nw = typeof n.width === 'number' ? n.width : 180;
        const nh = typeof n.height === 'number' ? n.height : 180;
        const cx = n.x + nw / 2;
        const cy = n.y + nh / 2;
        const ox = cx - gcx;
        const oy = cy - gcy;
        const ncx = gcx + ox * cos - oy * sin;
        const ncy = gcy + ox * sin + oy * cos;
        n.x = Math.round((ncx - nw / 2) * 10) / 10;
        n.y = Math.round((ncy - nh / 2) * 10) / 10;
      }

      const el = nodeByIdInWorld(id);
      if (el) {
        el.style.transform = `rotate(${norm}deg)`;
        if (isGroup) {
          el.style.left = `${n.x}px`;
          el.style.top = `${n.y}px`;
        }
      }
    }

    // Update attached connector endpoints so they follow rotating nodes without detaching
    for (const item of getState().items) {
      if (item.type !== 'connector') continue;
      let connModified = false;
      if (item.startElementId && selectedIds.has(item.startElementId)) {
        const sNode = findNode(item.startElementId);
        if (sNode) {
          const nw = sNode.width || 180;
          const nh = sNode.height || 180;
          const ncx = sNode.x + nw / 2;
          const ncy = sNode.y + nh / 2;
          const pivotX = isGroup ? gcx : ncx;
          const pivotY = isGroup ? gcy : ncy;
          const curSx = typeof item.startX === 'number' ? item.startX : item.x;
          const curSy = typeof item.startY === 'number' ? item.startY : item.y;
          const ox = curSx - pivotX;
          const oy = curSy - pivotY;
          const rotSx = pivotX + ox * cos - oy * sin;
          const rotSy = pivotY + ox * sin + oy * cos;
          const snapped = closestPointOnNode(rotSx, rotSy, sNode);
          item.startX = snapped.x;
          item.startY = snapped.y;
          connModified = true;
        }
      }
      if (item.endElementId && selectedIds.has(item.endElementId)) {
        const eNode = findNode(item.endElementId);
        if (eNode) {
          const nw = eNode.width || 180;
          const nh = eNode.height || 180;
          const ncx = eNode.x + nw / 2;
          const ncy = eNode.y + nh / 2;
          const pivotX = isGroup ? gcx : ncx;
          const pivotY = isGroup ? gcy : ncy;
          const curEx = typeof item.endX === 'number' ? item.endX : item.x + (item.width || 0);
          const curEy = typeof item.endY === 'number' ? item.endY : item.y + (item.height || 0);
          const ox = curEx - pivotX;
          const oy = curEy - pivotY;
          const rotEx = pivotX + ox * cos - oy * sin;
          const rotEy = pivotY + ox * sin + oy * cos;
          const snapped = closestPointOnNode(rotEx, rotEy, eNode);
          item.endX = snapped.x;
          item.endY = snapped.y;
          connModified = true;
        }
      }
      if (connModified) {
        const sx = item.startX ?? item.x;
        const sy = item.startY ?? item.y;
        const ex = item.endX ?? item.x;
        const ey = item.endY ?? item.y;
        item.x = Math.min(sx, ex);
        item.y = Math.min(sy, ey);
        item.width = Math.abs(ex - sx);
        item.height = Math.abs(ey - sy);
      }
    }

    scheduleSave();
    updateSelectionBar();
    renderConnectors();
  });
}

function setSelectionRotation(exactDegrees: number): void {
  if (!selectedIds.size) return;
  let norm = ((exactDegrees % 360) + 360) % 360;
  if (norm > 180) norm -= 360;

  let primary: CanvasNode | undefined;
  for (const id of selectedIds) {
    primary = findNode(id);
    if (primary) break;
  }
  const currentRot = primary ? (primary.rotation || 0) : 0;
  const delta = norm - currentRot;
  rotateSelection(delta);
}

function updateSelectionBar(): void {
  if (!selectionBar) return;
  const hasSelectedCards = selectedIds.size > 0;
  const hasSelectedConnector = selectedConnectorId !== null && !!findNode(selectedConnectorId);

  if (!hasSelectedCards && !hasSelectedConnector) {
    selectionBar.classList.add('hidden');
    selBarPalette?.classList.add('hidden');
    selConnPalette?.classList.add('hidden');
    selConnWidthMenu?.classList.add('hidden');
    selConnArrowMenu?.classList.add('hidden');
    selConnSizeMenu?.classList.add('hidden');
    selFontMenu?.classList.add('hidden');
    selTypeMenu?.classList.add('hidden');
    selRotateMenu?.classList.add('hidden');
    return;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  if (hasSelectedCards) {
    for (const id of selectedIds) {
      const el = nodeByIdInWorld(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      maxX = Math.max(maxX, r.right);
      minY = Math.min(minY, r.top);
      maxY = Math.max(maxY, r.bottom);
    }
  }

  if (hasSelectedConnector) {
    const connSvg = connectorsLayer.querySelector<SVGGraphicsElement>(`[data-node="${CSS.escape(selectedConnectorId!)}"]`);
    if (connSvg) {
      const r = connSvg.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      maxX = Math.max(maxX, r.right);
      minY = Math.min(minY, r.top);
      maxY = Math.max(maxY, r.bottom);
    } else {
      const conn = findNode(selectedConnectorId!);
      if (conn) {
        const sx = conn.startX ?? conn.x;
        const sy = conn.startY ?? conn.y;
        const ex = conn.endX ?? conn.x + conn.width;
        const ey = conn.endY ?? conn.y + conn.height;
        const boardRect = board.getBoundingClientRect();
        const cminX = Math.min(sx, ex) * view.scale + view.tx + boardRect.left;
        const cmaxX = Math.max(sx, ex) * view.scale + view.tx + boardRect.left;
        const cminY = Math.min(sy, ey) * view.scale + view.ty + boardRect.top;
        const cmaxY = Math.max(sy, ey) * view.scale + view.ty + boardRect.top;
        minX = Math.min(minX, cminX);
        maxX = Math.max(maxX, cmaxX);
        minY = Math.min(minY, cminY);
        maxY = Math.max(maxY, cmaxY);
      }
    }
  }

  if (!Number.isFinite(minX)) {
    selectionBar.classList.add('hidden');
    selBarPalette?.classList.add('hidden');
    selConnPalette?.classList.add('hidden');
    selConnWidthMenu?.classList.add('hidden');
    selConnArrowMenu?.classList.add('hidden');
    selConnSizeMenu?.classList.add('hidden');
    selFontMenu?.classList.add('hidden');
    selTypeMenu?.classList.add('hidden');
    selRotateMenu?.classList.add('hidden');
    return;
  }

  // Connector controls group
  if (selConnGroup) {
    selConnGroup.classList.toggle('hidden', !hasSelectedConnector);
    if (hasSelectedConnector) {
      const conn = findNode(selectedConnectorId!);
      if (conn) {
        if (selConnColorIndicator) {
          selConnColorIndicator.style.background = conn.color || '#9747FF';
        }
        if (selConnWidthLabel) {
          selConnWidthLabel.textContent = `${conn.strokeWidth || 3}px`;
        }
        if (selConnArrowLabel) {
          const hasEnd = conn.arrowEnd !== false;
          const hasStart = conn.arrowStart === true;
          if (hasEnd && hasStart) selConnArrowLabel.textContent = '⇄';
          else if (hasStart) selConnArrowLabel.textContent = '←';
          else if (hasEnd) selConnArrowLabel.textContent = '→';
          else selConnArrowLabel.textContent = '⎯';
        }
        if (selConnSizeLabel) {
          const sz = conn.arrowheadSize || 12;
          selConnSizeLabel.textContent = sz <= 8 ? 'S' : sz >= 16 ? 'L' : 'M';
        }
      }
      if (selConnStyleBtn) {
        const isCurved = conn?.lineStyle === 'curved';
        selConnStyleBtn.textContent = isCurved ? '〜' : '⎯';
        selConnStyleBtn.title = isCurved ? 'Switch to Straight line' : 'Switch to Curved line';
        selConnStyleBtn.classList.toggle('is-active', isCurved);
      }
      // QA-G5B-B: Straighten only applies when a persistent bend exists.
      if (selConnStraightenBtn) {
        const hasBend = !!(conn && typeof conn.controlX === 'number' && typeof conn.controlY === 'number');
        selConnStraightenBtn.disabled = !hasBend;
        selConnStraightenBtn.style.opacity = hasBend ? '1' : '0.4';
        selConnStraightenBtn.title = hasBend ? 'Straighten / Reset Bend' : 'Straighten / Reset Bend (no bend present)';
      }
    }
  }

  // Hide general card color picker when only connector is selected
  const selColorGroup = document.getElementById('sel-color-group');
  if (selColorGroup) {
    selColorGroup.style.display = hasSelectedConnector && !hasSelectedCards ? 'none' : 'flex';
  }

  // Check if text typography formatting applies to selected node(s)
  let textApplicable = false;
  let primaryNode: CanvasNode | undefined;

  for (const id of selectedIds) {
    const n = findNode(id);
    if (n && ['sticky', 'shape', 'text', 'thought', 'todo', 'link'].includes(n.type)) {
      textApplicable = true;
      if (!primaryNode) primaryNode = n;
    }
  }

  if (selTextGroup && selTextDivider) {
    selTextGroup.style.display = textApplicable ? 'flex' : 'none';
    selTextDivider.style.display = textApplicable ? 'block' : 'none';
  }

  // Sticky notes: show Title vs Paragraph Text target switch
  const hasSticky = Array.from(selectedIds).some((id) => findNode(id)?.type === 'sticky');
  if (selTargetToggle) {
    selTargetToggle.classList.toggle('hidden', !hasSticky);
    if (hasSticky) {
      selTargetTitleBtn?.classList.toggle('is-active', activeTextTarget === 'title');
      selTargetBodyBtn?.classList.toggle('is-active', activeTextTarget === 'body');
    }
  }

  if (textApplicable && primaryNode) {
    let currentType = 'h2';
    let currentSize = 16;
    let currentFont = 'Inter';
    let isBold = false;
    let isItalic = false;

    if (primaryNode.type === 'sticky') {
      if (activeTextTarget === 'title') {
        const titleSizes: Record<string, number> = { h1: 28, h2: 24, h3: 20, h4: 18, p: 16 };
        currentType = primaryNode.titleLevel || primaryNode.textType || 'h2';
        currentSize = primaryNode.titleFontSize || titleSizes[currentType] || 24;
        currentFont = primaryNode.titleFontFamily || primaryNode.fontFamily || 'Inter';
        isBold = (primaryNode.titleFontWeight === 'bold' || primaryNode.titleIsBold) ? true : (primaryNode.titleFontWeight === 'normal' ? false : true);
        isItalic = primaryNode.titleFontStyle === 'italic' || !!primaryNode.titleIsItalic;
      } else {
        currentType = primaryNode.textType || 'p';
        currentSize = primaryNode.fontSize || 16;
        currentFont = primaryNode.fontFamily || 'Inter';
        isBold = primaryNode.fontWeight === 'bold' || !!primaryNode.isBold;
        isItalic = primaryNode.fontStyle === 'italic' || !!primaryNode.isItalic;
      }
    } else {
      currentType = primaryNode.textType || 'p';
      currentSize = primaryNode.fontSize || 16;
      currentFont = primaryNode.fontFamily || 'Inter';
      isBold = primaryNode.fontWeight === 'bold' || !!primaryNode.isBold;
      isItalic = primaryNode.fontStyle === 'italic' || !!primaryNode.isItalic;
    }

    if (selTypeLabel) selTypeLabel.textContent = currentType.toUpperCase();
    if (selSizeLabel) selSizeLabel.textContent = String(currentSize);

    let label = 'Inter';
    if (currentFont.includes('Roboto')) label = 'Roboto';
    else if (currentFont.includes('Poppins')) label = 'Poppins';
    else if (currentFont.includes('Playfair')) label = 'Playfair';
    else if (currentFont.includes('Courier') || currentFont.includes('mono')) label = 'Mono';
    else if (currentFont.includes('Inter')) label = 'Inter';
    else label = currentFont.split(',')[0].replace(/['"]/g, '').trim() || 'Inter';
    if (selFontLabel) selFontLabel.textContent = label;

    selBoldBtn?.classList.toggle('is-active', isBold);
    selItalicBtn?.classList.toggle('is-active', isItalic);
  }

  // Rotation readout and visibility
  let rotatableNode: CanvasNode | undefined;
  for (const id of selectedIds) {
    const n = findNode(id);
    if (n && n.type !== 'connector' && n.type !== 'section') {
      rotatableNode = n;
      break;
    }
  }

  if (selRotateGroup && selRotateDivider) {
    const showRotate = !!rotatableNode;
    selRotateGroup.style.display = showRotate ? 'flex' : 'none';
    selRotateDivider.style.display = showRotate ? 'block' : 'none';
  }

  if (selRotateVal && rotatableNode) {
    const currentRot = Math.round(rotatableNode.rotation || 0);
    selRotateVal.textContent = `${currentRot}°`;
  }

  if (selRotateInput && rotatableNode) {
    if (document.activeElement !== selRotateInput) {
      const currentRot = Math.round(rotatableNode.rotation || 0);
      selRotateInput.value = String(currentRot);
    }
  }

  if (selBarPalette && !selBarPalette.classList.contains('hidden')) {
    renderPaletteContent();
  }

  const midX = (minX + maxX) / 2;
  const boardRect = board.getBoundingClientRect();
  let screenX = midX - boardRect.left;
  const barWidth = selectionBar.offsetWidth || 500;
  const halfBar = barWidth / 2;
  screenX = Math.max(halfBar + 12, Math.min(boardRect.width - halfBar - 12, screenX));

  // Position: default is below (is-below), unless flipped or pushed offscreen
  let screenY: number;
  if (selBarPosition === 'top') {
    screenY = Math.max(10, minY - boardRect.top);
    selectionBar.classList.add('is-above');
    selectionBar.classList.remove('is-below');
  } else {
    screenY = maxY - boardRect.top;
    // Check if bottom would hit dock / screen bottom edge (within 84px of window bottom)
    if (screenY + 54 > boardRect.height - 84) {
      screenY = Math.max(10, minY - boardRect.top);
      selectionBar.classList.add('is-above');
      selectionBar.classList.remove('is-below');
    } else {
      selectionBar.classList.add('is-below');
      selectionBar.classList.remove('is-above');
    }
  }

  selectionBar.style.left = `${screenX}px`;
  selectionBar.style.top = `${screenY}px`;
  selectionBar.classList.remove('hidden');
}

// ---------- Spawning Helpers ----------

let spawnAt = { x: 0, y: 0 };

function worldCenter(): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function createStamp(x: number, y: number, emoji = currentStamp): void {
  txn(() => {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type: 'stamp',
      x: x - 26,
      y: y - 26,
      width: 52,
      height: 52,
      content: emoji,
      author: 'You',
      createdAt: Date.now()
    };
    getState().items.push(node);
    renderNode(node);
    scheduleSave();
  });
}

function createSticky(x: number, y: number, pastel = currentPastel, customW?: number, customH?: number, initialContent = ''): CanvasNode {
  let createdNode: CanvasNode;
  txn(() => {
    const rotation = Number(((Math.random() - 0.5) * 3).toFixed(1));
    createdNode = {
      id: crypto.randomUUID(),
      type: 'sticky',
      x,
      y,
      width: customW ? Math.max(80, Math.round(customW)) : 240,
      height: customH ? Math.max(80, Math.round(customH)) : 240,
      content: initialContent,
      color: pastel.bg,
      textColor: pastel.text,
      fontSize: 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      titleLevel: 'h2',
      titleFontSize: 24,
      titleFontWeight: 'bold',
      titleFontFamily: 'Inter, system-ui, sans-serif',
      rotation,
      author: 'You',
      createdAt: Date.now()
    };
    getState().items.push(createdNode);
    renderNode(createdNode);
    scheduleSave();
  });
  return createdNode!;
}

function createShape(x: number, y: number, shapeType: ShapeType = currentShape, customW?: number, customH?: number): CanvasNode {
  let createdNode: CanvasNode;
  txn(() => {
    const isDiamond = shapeType === 'diamond';
    const isTriangle = shapeType === 'triangle';
    const defaultW = isDiamond ? 140 : isTriangle ? 140 : 160;
    const defaultH = isDiamond ? 140 : isTriangle ? 120 : 100;
    const w = customW ? Math.max(40, Math.round(customW)) : defaultW;
    const h = customH ? Math.max(40, Math.round(customH)) : defaultH;

    createdNode = {
      id: crypto.randomUUID(),
      type: 'shape',
      shapeType,
      x,
      y,
      width: w,
      height: h,
      content: '', // Clean vector shape without placeholder text
      fillColor: 'rgba(30, 31, 29, 0.90)',
      strokeColor: '#9747FF',
      strokeWidth: 2,
      textColor: '#F4F3EE',
      fontSize: 14,
      createdAt: Date.now()
    };
    getState().items.push(createdNode);
    renderNode(createdNode);
    scheduleSave();
  });
  return createdNode!;
}

function createSection(x: number, y: number, customW?: number, customH?: number): CanvasNode {
  let createdNode: CanvasNode;
  txn(() => {
    const colorObj = PEEPJAM_SECTION_COLORS[0];
    createdNode = {
      id: crypto.randomUUID(),
      type: 'section',
      title: 'New Section',
      x,
      y,
      width: customW ? Math.max(160, Math.round(customW)) : 520,
      height: customH ? Math.max(120, Math.round(customH)) : 380,
      content: '',
      color: colorObj.bg,
      createdAt: Date.now()
    };
    getState().items.push(createdNode);
    renderNode(createdNode);
    scheduleSave();
  });
  return createdNode!;
}

function createText(x: number, y: number, customW?: number, customH?: number, content = ''): CanvasNode {
  let createdNode: CanvasNode;
  txn(() => {
    createdNode = {
      id: crypto.randomUUID(),
      type: 'text',
      x,
      y,
      width: customW ? Math.max(80, Math.round(customW)) : 220,
      height: customH ? Math.max(36, Math.round(customH)) : 48,
      content,
      title: '',
      color: 'transparent',
      createdAt: Date.now()
    };
    getState().items.push(createdNode);
    menu.classList.add('hidden');
    renderNode(createdNode);
    scheduleSave();
  });
  return createdNode!;
}

function createTodoNode(x: number, y: number, customW?: number, customH?: number, content = ''): CanvasNode {
  let createdNode: CanvasNode;
  txn(() => {
    createdNode = {
      id: crypto.randomUUID(),
      type: 'todo',
      x,
      y,
      width: customW ? Math.max(140, Math.round(customW)) : 240,
      height: customH ? Math.max(80, Math.round(customH)) : 140,
      content,
      title: 'To-Do',
      status: 'pending',
      color: '#fdf2f8',
      createdAt: Date.now()
    };
    getState().items.push(createdNode);
    renderNode(createdNode);
    scheduleSave();
  });
  return createdNode!;
}

function createThoughtNode(x: number, y: number, customW?: number, customH?: number, content = ''): CanvasNode {
  let createdNode: CanvasNode;
  txn(() => {
    createdNode = {
      id: crypto.randomUUID(),
      type: 'thought',
      x,
      y,
      width: customW ? Math.max(140, Math.round(customW)) : 220,
      height: customH ? Math.max(80, Math.round(customH)) : 140,
      content,
      title: 'Idea',
      color: '#eff6ff',
      createdAt: Date.now()
    };
    getState().items.push(createdNode);
    renderNode(createdNode);
    scheduleSave();
  });
  return createdNode!;
}

function createItem(type: 'thought' | 'todo' | 'link' | 'text', content = ''): void {
  if (type === 'text') {
    createText(spawnAt.x - 110, spawnAt.y - 20, 220, 48, content);
    return;
  }
  const preset = {
    thought: { width: 220, height: 150, color: '#eff6ff' },
    todo: { width: 240, height: 150, color: '#fdf2f8' },
    link: { width: 260, height: 170, color: '#f5f3ff' }
  }[type];
  txn(() => {
    const isUrl = type === 'link' || content.startsWith('http://') || content.startsWith('https://');
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      x: spawnAt.x - preset.width / 2,
      y: spawnAt.y - 20,
      width: preset.width,
      height: preset.height,
      content: type === 'link' ? '' : content,
      title: '',
      url: isUrl ? content : undefined,
      status: type === 'todo' ? 'pending' : undefined,
      color: preset.color,
      createdAt: Date.now()
    };
    getState().items.push(node);
    menu.classList.add('hidden');
    renderNode(node);
    scheduleSave();
  });
}

board.addEventListener('dblclick', (e) => {
  if (
    (e.target as HTMLElement).closest(
      '[data-node], #peepjam-dock, .peepjam-dock, #figjam-dock, .figjam-dock, #zoom-pill, .zoom-ctl, #selection-bar, .selection-bar, #titlebar, .toolbar, .modal-backdrop, .tb-panel, .dock-popover'
    )
  ) {
    return;
  }
  const wPos = screenToWorld(e.clientX, e.clientY);
  createSticky(wPos.x - 90, wPos.y - 90);
});

// ---------- Interactive Drawing, Gestures & Connectors State ----------

let isDrawing = false;
let isErasing = false;
let currentStroke: DrawingPoint[] = [];
let isConnecting = false;
let isConnectingLine = false; // QA-G5B-B: drag started from the Straight Line (decorative) tool
let connStartPoint: { x: number; y: number } | null = null;
let connHandleDrag: {
  connId: string;
  handle: 'start' | 'end' | 'mid';
  origStartX: number;
  origStartY: number;
  origEndX: number;
  origEndY: number;
  origControlX: number;
  origControlY: number;
  startWorld: { x: number; y: number };
  pre: string;
} | null = null;
let creationGesture: {
  tool: 'sticky' | 'shape' | 'section' | 'text' | 'todo' | 'thought';
  start: { x: number; y: number };
  shapeType?: ShapeType;
} | null = null;
let rotateFeedbackEl: HTMLDivElement | null = null;
let panning: { x: number; y: number } | null = null;
let marquee: { x: number; y: number } | null = null;

function eraseAt(wx: number, wy: number): void {
  const threshold = (currentEraserSize || 24) / view.scale;
  const thresholdSq = threshold * threshold;
  const items = getState().items;
  const toDelete: string[] = [];

  for (const item of items) {
    if (item.type === 'drawing' && item.points) {
      for (const p of item.points) {
        const dx = p.x - wx;
        const dy = p.y - wy;
        if (dx * dx + dy * dy <= thresholdSq) {
          toDelete.push(item.id);
          break;
        }
      }
    }
  }

  if (toDelete.length > 0) {
    removeNodes(toDelete);
  }
}

const selectedIds = new Set<string>();
let active: { el: HTMLElement; node: CanvasNode } | null = null;

function paintSelection(): void {
  for (const el of Array.from(world.querySelectorAll<HTMLElement>('[data-node]'))) {
    const isSel = selectedIds.has(el.dataset.node!);
    el.classList.toggle('is-selected', isSel);
    el.classList.toggle('selected', isSel);
    el.classList.toggle('active', isSel);
  }
  updateSelectionBar();
}

function setActive(nodeEl: HTMLElement | null): void {
  if (!nodeEl) {
    active = null;
    selectedIds.clear();
    selectedConnectorId = null;
    paintSelection();
    renderConnectors();
    return;
  }
  const node = findNode(nodeEl.dataset.node!);
  if (!node) return;
  active = { el: nodeEl, node };
  selectedIds.clear();
  selectedIds.add(node.id);
  selectedConnectorId = null;
  paintSelection();
  renderConnectors();
}

function toggleSelect(nodeEl: HTMLElement): void {
  const id = nodeEl.dataset.node!;
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  paintSelection();
}

function nodeByIdInWorld(id: string): HTMLElement | null {
  return world.querySelector<HTMLElement>(`:scope > [data-node="${CSS.escape(id)}"]`);
}

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
  const dx = r - l;
  const dy = b - t;
  marquee = null;
  marqueeEl.classList.add('hidden');

  if (dx > 4 || dy > 4) {
    selectedIds.clear();
    selectedConnectorId = null;
    for (const el of Array.from(world.querySelectorAll<HTMLElement>('[data-node]'))) {
      const nr = el.getBoundingClientRect();
      if (nr.left < r && nr.right > l && nr.top < b && nr.bottom > t) {
        selectedIds.add(el.dataset.node!);
      }
    }
    if (selectedIds.size === 0) {
      const boardRect = board.getBoundingClientRect();
      const lW = (l - boardRect.left - view.tx) / view.scale;
      const tW = (t - boardRect.top - view.ty) / view.scale;
      const rW = (r - boardRect.left - view.tx) / view.scale;
      const bW = (b - boardRect.top - view.ty) / view.scale;
      for (const item of getState().items) {
        if (item.type !== 'connector') continue;
        const sx = typeof item.startX === 'number' ? item.startX : item.x;
        const sy = typeof item.startY === 'number' ? item.startY : item.y;
        const ex = typeof item.endX === 'number' ? item.endX : item.x + (item.width || 100);
        const ey = typeof item.endY === 'number' ? item.endY : item.y + (item.height || 100);
        if (
          (sx >= lW && sx <= rW && sy >= tW && sy <= bW) ||
          (ex >= lW && ex <= rW && ey >= tW && ey <= bW)
        ) {
          selectedConnectorId = item.id;
          break;
        }
      }
    }
    const firstId = selectedIds.values().next().value;
    if (firstId) {
      const el = nodeByIdInWorld(firstId);
      const node = findNode(firstId);
      if (el && node) active = { el, node };
    } else {
      active = null;
    }
    paintSelection();
    renderConnectors();
    updateSelectionBar();
  }
}

// ---------- Pointer Events on Board (Canvas Orchestration) ----------

type ConnectorEndpointSnapshot = {
  connId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  moveStart: boolean;
  moveEnd: boolean;
};

type GestureTarget = { node: CanvasNode; el: HTMLElement; x: number; y: number; w: number; h: number; rot?: number };
type Gesture = {
  mode: 'drag' | 'resize' | 'rotate';
  resizeHandle?: string;
  x: number;
  y: number;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
  pre: string;
  moved: boolean;
  pendingFocusTarget?: HTMLElement | null;
  targets: GestureTarget[];
  connectors?: ConnectorEndpointSnapshot[];
};
let gesture: Gesture | null = null;

function safeSetPointerCapture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {}
}

function safeReleasePointerCapture(el: Element, pointerId: number): void {
  try {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  } catch {}
}

board.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('#peepjam-dock, .peepjam-dock, #figjam-dock, .figjam-dock, #zoom-pill, .zoom-ctl, #selection-bar, .selection-bar, #titlebar, .toolbar, .modal-backdrop')) {
    return;
  }

  const wasHeaderOpen =
    (clipPanel && !clipPanel.classList.contains('hidden')) ||
    (settingsPanel && !settingsPanel.classList.contains('hidden')) ||
    (exportPanel && !exportPanel.classList.contains('hidden')) ||
    isMenuBarActive;

  const wasDockPopoverOpen =
    (penPopover && !penPopover.classList.contains('hidden')) ||
    (stickyPopover && !stickyPopover.classList.contains('hidden')) ||
    (shapesPopover && !shapesPopover.classList.contains('hidden')) ||
    (stampPopover && !stampPopover.classList.contains('hidden'));

  closeAllDockPopovers();
  closeAllMenuDropdowns();
  menu.classList.add('hidden');
  closeCtx();

  const isCreationOrDrawTool =
    activeTool === 'sticky' ||
    activeTool === 'shape' ||
    activeTool === 'stamp' ||
    activeTool === 'pen' ||
    activeTool === 'highlighter' ||
    activeTool === 'eraser' ||
    activeTool === 'text' ||
    activeTool === 'section' ||
    activeTool === 'connector' ||
    activeTool === 'line';

  // If clicking canvas background dismissed an open header panel/menu, OR if in select/hand mode with a dock popover open, swallow the event
  if ((wasHeaderOpen || (!isCreationOrDrawTool && wasDockPopoverOpen)) && !(e.target as HTMLElement).closest('[data-node]')) {
    return;
  }

  if (e.button === 1 || activeTool === 'hand' || spacebarHeld) {
    panning = { x: e.clientX, y: e.clientY };
    board.classList.add('panning');
    safeSetPointerCapture(board, e.pointerId);
    return;
  }

  if (e.button !== 0) return;

  const wPos = screenToWorld(e.clientX, e.clientY);

  // Check if dragging connector start/end/mid handle
  const connHandleEl = (e.target as HTMLElement).closest<SVGElement>('[data-conn-handle]');
  if (connHandleEl) {
    const connId = connHandleEl.getAttribute('data-conn-id');
    const handle = connHandleEl.getAttribute('data-conn-handle') as 'start' | 'end' | 'mid';
    const conn = connId ? findNode(connId) : undefined;
    if (connId && handle && conn && conn.type === 'connector') {
      const sx = typeof conn.startX === 'number' ? conn.startX : conn.x;
      const sy = typeof conn.startY === 'number' ? conn.startY : conn.y;
      const ex = typeof conn.endX === 'number' ? conn.endX : conn.x + (conn.width || 100);
      const ey = typeof conn.endY === 'number' ? conn.endY : conn.y + (conn.height || 100);
      // Initialize persistent bend control point from current geometry when absent.
      let ocx: number;
      let ocy: number;
      if (typeof conn.controlX === 'number' && typeof conn.controlY === 'number') {
        ocx = conn.controlX;
        ocy = conn.controlY;
      } else if ((conn.lineStyle || 'straight') === 'curved') {
        const midX = (sx + ex) / 2;
        const midY = (sy + ey) / 2;
        const dx = ex - sx;
        const dy = ey - sy;
        const dist = Math.hypot(dx, dy);
        const curvature = Math.min(60, dist * 0.2);
        const nx = -dy / (dist || 1);
        const ny = dx / (dist || 1);
        ocx = midX + nx * curvature;
        ocy = midY + ny * curvature;
      } else {
        ocx = (sx + ex) / 2;
        ocy = (sy + ey) / 2;
      }
      connHandleDrag = {
        connId,
        handle,
        origStartX: sx,
        origStartY: sy,
        origEndX: ex,
        origEndY: ey,
        origControlX: ocx,
        origControlY: ocy,
        startWorld: { x: wPos.x, y: wPos.y },
        pre: JSON.stringify(getState().items)
      };
      safeSetPointerCapture(board, e.pointerId);
      return;
    }
  }

  if (activeTool === 'pen' || activeTool === 'highlighter') {
    isDrawing = true;
    currentStroke = [wPos];
    safeSetPointerCapture(board, e.pointerId);
    return;
  }

  if (activeTool === 'eraser') {
    isErasing = true;
    eraseAt(wPos.x, wPos.y);
    safeSetPointerCapture(board, e.pointerId);
    return;
  }

  if (activeTool === 'connector' || activeTool === 'line') {
    isConnecting = true;
    isConnectingLine = activeTool === 'line';
    connStartPoint = wPos;
    safeSetPointerCapture(board, e.pointerId);
    return;
  }

  if (activeTool === 'stamp') {
    createStamp(wPos.x, wPos.y);
    return;
  }

  // Drag-to-create or click-to-drop for Sticky, Shape, Section, Text, To-Do, Thought
  if (
    activeTool === 'sticky' ||
    activeTool === 'shape' ||
    activeTool === 'section' ||
    activeTool === 'text' ||
    activeTool === 'todo' ||
    activeTool === 'thought'
  ) {
    creationGesture = {
      tool: activeTool,
      start: wPos,
      shapeType: currentShape
    };
    safeSetPointerCapture(board, e.pointerId);
    return;
  }

  const targetNodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
  const isResize = !!(e.target as HTMLElement).closest('[data-resize], .node-resize');
  const isRotate = !!(e.target as HTMLElement).closest('[data-rotate], .node-rotate');

  if (!targetNodeEl) {
    if ((e.target as HTMLElement).closest('[data-conn-handle], .connector-group, .canvas-svg-layer path, .connector-path')) {
      return;
    }
    // Reliable connector selection: check if a connector was clicked near its path
    if (activeTool === 'select' || activeTool === 'move') {
      const hitConn = findConnectorAt(wPos.x, wPos.y, Math.max(16, 24 / view.scale));
      if (hitConn) {
        selectedConnectorId = hitConn.id;
        selectedIds.clear();
        active = null;
        paintSelection();
        renderConnectors();
        updateSelectionBar();
        return;
      }
    }
    setActive(null);
    // In Select or Move mode: Dragging empty canvas space draws marquee selection box!
    marquee = { x: e.clientX, y: e.clientY };
    marqueeEl.classList.remove('hidden');
    paintMarquee(e.clientX, e.clientY);
    safeSetPointerCapture(board, e.pointerId);
    return;
  }

  const node = findNode(targetNodeEl.dataset.node!);
  if (!node) return;

  if (e.ctrlKey || e.metaKey) {
    toggleSelect(targetNodeEl);
    return;
  }
  if (!(selectedIds.size > 1 && selectedIds.has(node.id))) setActive(targetNodeEl);

  // Action buttons (delete, change color, checklist check box, etc.)
  const isActionBtn = !!(e.target as HTMLElement).closest('button, .sticky-btn, .shape-btn, .util-btn, [data-conn-handle], input[type="checkbox"]');
  if (isActionBtn) return;

  // If already actively typing/editing text inside input/textarea, let them highlight text inside unless clicking top bar/border
  const isEditingText = (e.target as HTMLElement).matches('input, textarea, [contenteditable]') && document.activeElement === e.target;
  if (isEditingText && !isResize && !isRotate) {
    if (!(e.target as HTMLElement).closest('.sticky-bar, .node-head, .shape-hover-bar')) {
      return;
    }
  }

  const clickedTextTarget = (e.target as HTMLElement).closest<HTMLElement>('input, textarea, [contenteditable]');

  const inGroup = (!isResize && !isRotate)
    ? (selectedIds.size > 1 && selectedIds.has(node.id))
    : (selectedIds.size > 1 && selectedIds.has(node.id));

  const els = inGroup
    ? [...selectedIds].map(nodeByIdInWorld).filter((el): el is HTMLElement => !!el)
    : [targetNodeEl];

  // If dragging a section, automatically grab all nodes enclosed within it!
  if (!isResize && !isRotate && node.type === 'section') {
    const secL = node.x;
    const secT = node.y;
    const secR = node.x + (node.width || 520);
    const secB = node.y + (node.height || 380);
    for (const item of getState().items) {
      if (item.id === node.id || item.type === 'connector' || item.type === 'drawing') continue;
      const cx = item.x + (item.width || 0) / 2;
      const cy = item.y + (item.height || 0) / 2;
      if (cx >= secL && cx <= secR && cy >= secT && cy <= secB) {
        const itemEl = nodeByIdInWorld(item.id);
        if (itemEl && !els.includes(itemEl)) {
          els.push(itemEl);
        }
      }
    }
  }

  // Calculate centroid for rotation
  let rotCenterX = node.x + (node.width || 180) / 2;
  let rotCenterY = node.y + (node.height || 180) / 2;
  let startAngle = 0;
  if (isRotate) {
    let sumX = 0;
    let sumY = 0;
    for (const el of els) {
      const n = findNode(el.dataset.node!)!;
      const nw = typeof n.width === 'number' ? n.width : 180;
      const nh = typeof n.height === 'number' ? n.height : 180;
      sumX += n.x + nw / 2;
      sumY += n.y + nh / 2;
    }
    rotCenterX = sumX / els.length;
    rotCenterY = sumY / els.length;
    const pWorld = screenToWorld(e.clientX, e.clientY);
    startAngle = Math.atan2(pWorld.y - rotCenterY, pWorld.x - rotCenterX) * (180 / Math.PI);
  }

  const targetNodeIds = new Set(els.map((el) => el.dataset.node!));
  const attachedConnectors: ConnectorEndpointSnapshot[] = [];
  for (const item of getState().items) {
    if (item.type === 'connector') {
      const moveStart = !!(item.startElementId && targetNodeIds.has(item.startElementId));
      const moveEnd = !!(item.endElementId && targetNodeIds.has(item.endElementId));
      if (moveStart || moveEnd) {
        attachedConnectors.push({
          connId: item.id,
          startX: typeof item.startX === 'number' ? item.startX : item.x,
          startY: typeof item.startY === 'number' ? item.startY : item.y,
          endX: typeof item.endX === 'number' ? item.endX : item.x + (item.width || 0),
          endY: typeof item.endY === 'number' ? item.endY : item.y + (item.height || 0),
          moveStart,
          moveEnd
        });
      }
    }
  }

  const resizeHandleEl = (e.target as HTMLElement).closest<HTMLElement>('[data-resize], .node-resize');
  const resizeHandle = isResize
    ? (resizeHandleEl?.getAttribute('data-resize') || resizeHandleEl?.dataset.resize || 'se')
    : undefined;

  gesture = {
    mode: isRotate ? 'rotate' : isResize ? 'resize' : 'drag',
    resizeHandle,
    x: e.clientX,
    y: e.clientY,
    centerX: rotCenterX,
    centerY: rotCenterY,
    startAngle,
    pre: JSON.stringify(getState().items),
    moved: false,
    pendingFocusTarget: clickedTextTarget,
    targets: els.map((el) => {
      const n = findNode(el.dataset.node!)!;
      const nw = typeof n.width === 'number' ? n.width : 180;
      const nh = typeof n.height === 'number' ? n.height : 180;
      return { node: n, el, x: n.x, y: n.y, w: nw, h: nh, rot: n.rotation || 0 };
    }),
    connectors: attachedConnectors
  };

  for (const el of els) el.classList.add('dragging');
  if (!clickedTextTarget || isResize || isRotate) {
    try {
      targetNodeEl.setPointerCapture(e.pointerId);
    } catch {}
  }
});

board.addEventListener('pointermove', (e) => {
  if (isErasing) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    eraseAt(wPos.x, wPos.y);
    return;
  }

  if (isDrawing) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    currentStroke.push(wPos);
    const d = pointsToSvgPath(currentStroke);
    const isHigh = activeTool === 'highlighter';
    const color = isHigh ? currentHighlighterColor : currentPenColor;
    const strokeWidth = isHigh ? currentHighlighterSize : currentPenSize;
    liveLayer.innerHTML = `<path class="drawing-path live-path" d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${isHigh ? '0.55' : '1'}" />`;
    return;
  }

  if (connHandleDrag) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    const conn = findNode(connHandleDrag.connId);
    if (conn && conn.type === 'connector') {
      const dx = Math.round(wPos.x - connHandleDrag.startWorld.x);
      const dy = Math.round(wPos.y - connHandleDrag.startWorld.y);
      if (connHandleDrag.handle === 'mid') {
        // Bend: to move the displayed on-curve midpoint B(0.5) by (dx, dy),
        // the quadratic control point must move by 2 * (dx, dy) because B(0.5) = (sx + 2*control + ex) / 4.
        conn.controlX = Math.round(connHandleDrag.origControlX + 2 * dx);
        conn.controlY = Math.round(connHandleDrag.origControlY + 2 * dy);
      } else if (connHandleDrag.handle === 'start') {
        // QA-G5B-B: decorative lines (arrowEnd: false) never snap-attach to nodes.
        const snap = conn.arrowEnd === false ? null : findSnapTarget(wPos.x, wPos.y, connHandleDrag.connId, 'start');
        if (snap) {
          const pt = closestPointOnRect(wPos.x, wPos.y, snap);
          const snapDist = Math.hypot(pt.x - wPos.x, pt.y - wPos.y);
          if (snapDist <= 14) {
            conn.startX = Math.round(pt.x);
            conn.startY = Math.round(pt.y);
          } else {
            conn.startX = Math.round(wPos.x);
            conn.startY = Math.round(wPos.y);
          }
          conn.startElementId = snap.id;
        } else {
          conn.startX = Math.round(wPos.x);
          conn.startY = Math.round(wPos.y);
          conn.startElementId = undefined;
        }
      } else {
        // QA-G5B-B: decorative lines (arrowEnd: false) never snap-attach to nodes.
        const snap = conn.arrowEnd === false ? null : findSnapTarget(wPos.x, wPos.y, connHandleDrag.connId, 'end');
        if (snap) {
          const pt = closestPointOnRect(wPos.x, wPos.y, snap);
          const snapDist = Math.hypot(pt.x - wPos.x, pt.y - wPos.y);
          if (snapDist <= 14) {
            conn.endX = Math.round(pt.x);
            conn.endY = Math.round(pt.y);
          } else {
            conn.endX = Math.round(wPos.x);
            conn.endY = Math.round(wPos.y);
          }
          conn.endElementId = snap.id;
        } else {
          conn.endX = Math.round(wPos.x);
          conn.endY = Math.round(wPos.y);
          conn.endElementId = undefined;
        }
      }
      const sx = conn.startX ?? conn.x;
      const sy = conn.startY ?? conn.y;
      const ex = conn.endX ?? conn.x;
      const ey = conn.endY ?? conn.y;
      conn.x = Math.min(sx, ex);
      conn.y = Math.min(sy, ey);
      conn.width = Math.abs(ex - sx);
      conn.height = Math.abs(ey - sy);
      renderConnectors();
    }
    return;
  }

  if (creationGesture) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    const x = Math.min(creationGesture.start.x, wPos.x);
    const y = Math.min(creationGesture.start.y, wPos.y);
    const w = Math.max(10, Math.abs(wPos.x - creationGesture.start.x));
    const h = Math.max(10, Math.abs(wPos.y - creationGesture.start.y));

    if (creationGesture.tool === 'sticky') {
      liveLayer.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"
          fill="${currentPastel.bg}" fill-opacity="0.35"
          stroke="${currentPastel.border}" stroke-width="2" stroke-dasharray="6 4" />
      `;
    } else if (creationGesture.tool === 'shape') {
      const shapeType = creationGesture.shapeType || currentShape;
      const shapeSvg = buildShapeSvg(shapeType, w, h, 'rgba(151, 71, 255, 0.15)', '#9747FF', 2);
      liveLayer.innerHTML = `
        <g transform="translate(${x}, ${y})" stroke-dasharray="6 4">
          ${shapeSvg}
        </g>
      `;
    } else if (creationGesture.tool === 'section') {
      liveLayer.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"
          fill="rgba(255, 255, 255, 0.05)"
          stroke="#8B5CF6" stroke-width="2" stroke-dasharray="8 4" />
        <rect x="${x}" y="${y}" width="${w}" height="${Math.min(36, h)}" rx="12 12 0 0"
          fill="rgba(139, 92, 246, 0.2)" />
        <text x="${x + 12}" y="${y + 22}" fill="#C4B5FD" font-size="12" font-family="Inter, sans-serif" font-weight="600">New Section</text>
      `;
    } else if (creationGesture.tool === 'text') {
      liveLayer.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"
          fill="rgba(255, 255, 255, 0.08)"
          stroke="#C8F560" stroke-width="1.5" stroke-dasharray="4 3" />
      `;
    } else if (creationGesture.tool === 'todo') {
      liveLayer.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"
          fill="rgba(253, 242, 248, 0.4)"
          stroke="#EC4899" stroke-width="2" stroke-dasharray="6 4" />
        <text x="${x + 14}" y="${y + 24}" fill="#DB2777" font-size="12" font-family="Inter, sans-serif" font-weight="600">? To-Do Task</text>
      `;
    } else if (creationGesture.tool === 'thought') {
      liveLayer.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"
          fill="rgba(239, 246, 255, 0.4)"
          stroke="#3B82F6" stroke-width="2" stroke-dasharray="6 4" />
        <text x="${x + 14}" y="${y + 24}" fill="#2563EB" font-size="12" font-family="Inter, sans-serif" font-weight="600">?? Idea Note</text>
      `;
    }
    return;
  }

  if (isConnecting && connStartPoint) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    // QA-G5B-B: decorative lines always preview straight and arrowless.
    const previewStyle: ConnectorLineStyle = isConnectingLine ? 'straight' : currentConnectorStyle;
    const { d } = createConnectorSvgPath(connStartPoint.x, connStartPoint.y, wPos.x, wPos.y, previewStyle);
    const arrowAttr = isConnectingLine ? '' : ' marker-end="url(#live-arrow)"';
    const previewColor = isConnectingLine ? '#6B7280' : '#9747FF';
    liveLayer.innerHTML = `
      <defs>
        <marker id="live-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#9747FF" />
        </marker>
      </defs>
      <path d="${d}" fill="none" stroke="${previewColor}" stroke-width="2.5" stroke-dasharray="6 6"${arrowAttr} />
    `;
    return;
  }

  if (marquee) {
    paintMarquee(e.clientX, e.clientY);
    return;
  }

  if (panning) {
    view.tx += e.clientX - panning.x;
    view.ty += e.clientY - panning.y;
    panning = { x: e.clientX, y: e.clientY };
    applyTransform();
    return;
  }

  if (!gesture) return;

  if (gesture.mode === 'rotate') {
    const pWorld = screenToWorld(e.clientX, e.clientY);
    const gcx = gesture.centerX ?? 0;
    const gcy = gesture.centerY ?? 0;
    const curAngle = Math.atan2(pWorld.y - gcy, pWorld.x - gcx) * (180 / Math.PI);
    let delta = curAngle - (gesture.startAngle ?? 0);
    // Normalize delta to [-180, 180] to avoid jumping across the +-180 boundary
    delta = ((delta % 360) + 540) % 360 - 180;
    if (Math.abs(delta) > 0.5) gesture.moved = true;

    let effectiveDelta = delta;
    if (e.shiftKey) {
      effectiveDelta = Math.round(effectiveDelta / 15) * 15;
    } else {
      effectiveDelta = Math.round(effectiveDelta * 10) / 10;
    }

    const isGroup = gesture.targets.length > 1;
    const rad = effectiveDelta * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let primaryNorm = 0;
    for (const t of gesture.targets) {
      let angle = (t.rot || 0) + effectiveDelta;
      let norm = ((angle % 360) + 360) % 360;
      if (norm > 180) norm -= 360;
      t.node.rotation = norm;
      t.el.style.transform = `rotate(${norm}deg)`;
      primaryNorm = norm;

      if (isGroup) {
        const initCx = t.x + t.w / 2;
        const initCy = t.y + t.h / 2;
        const ox = initCx - gcx;
        const oy = initCy - gcy;
        const newCx = gcx + ox * cos - oy * sin;
        const newCy = gcy + ox * sin + oy * cos;
        t.node.x = Math.round((newCx - t.w / 2) * 10) / 10;
        t.node.y = Math.round((newCy - t.h / 2) * 10) / 10;
        t.el.style.left = `${t.node.x}px`;
        t.el.style.top = `${t.node.y}px`;
      }
    }

    // Rotate attached connectors around group centroid
    if (gesture.connectors && gesture.connectors.length > 0) {
      for (const cSnap of gesture.connectors) {
        const conn = findNode(cSnap.connId);
        if (!conn || conn.type !== 'connector') continue;
        if (cSnap.moveStart) {
          const sox = cSnap.startX - gcx;
          const soy = cSnap.startY - gcy;
          conn.startX = Math.round(gcx + sox * cos - soy * sin);
          conn.startY = Math.round(gcy + sox * sin + soy * cos);
        }
        if (cSnap.moveEnd) {
          const eox = cSnap.endX - gcx;
          const eoy = cSnap.endY - gcy;
          conn.endX = Math.round(gcx + eox * cos - eoy * sin);
          conn.endY = Math.round(gcy + eox * sin + eoy * cos);
        }
        const sx = conn.startX ?? conn.x;
        const sy = conn.startY ?? conn.y;
        const ex = conn.endX ?? conn.x;
        const ey = conn.endY ?? conn.y;
        conn.x = Math.min(sx, ex);
        conn.y = Math.min(sy, ey);
        conn.width = Math.abs(ex - sx);
        conn.height = Math.abs(ey - sy);
      }
    }

    // Live rotation feedback label
    if (!rotateFeedbackEl) {
      rotateFeedbackEl = document.createElement('div');
      rotateFeedbackEl.className = 'rotate-feedback';
      rotateFeedbackEl.style.position = 'absolute';
      rotateFeedbackEl.style.pointerEvents = 'none';
      rotateFeedbackEl.style.zIndex = '200';
      rotateFeedbackEl.style.padding = '2px 6px';
      rotateFeedbackEl.style.borderRadius = '4px';
      rotateFeedbackEl.style.background = 'rgba(20,21,19,0.9)';
      rotateFeedbackEl.style.color = '#C8F560';
      rotateFeedbackEl.style.font = 'bold 11px Inter, system-ui, sans-serif';
      rotateFeedbackEl.style.border = '1px solid #C8F560';
      world.appendChild(rotateFeedbackEl);
    }
    rotateFeedbackEl.textContent = `${Math.round(primaryNorm)}°`;
    rotateFeedbackEl.style.left = `${gcx - 16}px`;
    rotateFeedbackEl.style.top = `${gcy - 60}px`;
    renderConnectors();
    updateSelectionBar();
    return;
  }

  const dx = (e.clientX - gesture.x) / view.scale;
  const dy = (e.clientY - gesture.y) / view.scale;
  if (Math.hypot(dx, dy) > 2) {
    gesture.moved = true;
    window.getSelection()?.removeAllRanges();
  }

  const hDir = gesture.resizeHandle || 'se';
  const signX = hDir.includes('w') ? -1 : (hDir.includes('e') || hDir === 'se' ? 1 : 0);
  const signY = hDir.includes('n') ? -1 : (hDir.includes('s') || hDir === 'se' ? 1 : 0);

  for (const t of gesture.targets) {
    if (gesture.mode === 'drag') {
      t.node.x = t.x + dx;
      t.node.y = t.y + dy;
      t.el.style.left = `${t.node.x}px`;
      t.el.style.top = `${t.node.y}px`;
    } else {
      let minW = 60;
      let minH = 40;
      if (t.node.type === 'sticky') { minW = 140; minH = 120; }
      else if (t.node.type === 'shape') { minW = 60; minH = 60; }
      else if (t.node.type === 'section') { minW = 200; minH = 150; }

      const rotDeg = t.rot || 0;
      if (!rotDeg) {
        const deltaW = signX !== 0 ? signX * dx : 0;
        const deltaH = signY !== 0 ? signY * dy : 0;
        const newW = Math.max(minW, Math.round(t.w + deltaW));
        const newH = Math.max(minH, Math.round(t.h + deltaH));
        if (signX < 0) t.node.x = t.x + (t.w - newW);
        if (signY < 0) t.node.y = t.y + (t.h - newH);
        t.node.width = newW;
        t.node.height = newH;
      } else {
        const rotRad = (rotDeg * Math.PI) / 180;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);

        const du = dx * cos + dy * sin;
        const dv = -dx * sin + dy * cos;

        const deltaW = signX !== 0 ? signX * du : 0;
        const deltaH = signY !== 0 ? signY * dv : 0;

        const newW = Math.max(minW, Math.round(t.w + deltaW));
        const newH = Math.max(minH, Math.round(t.h + deltaH));

        const c0x = t.x + t.w / 2;
        const c0y = t.y + t.h / 2;
        const cnewX = c0x + signX * ((newW - t.w) / 2) * cos - signY * ((newH - t.h) / 2) * sin;
        const cnewY = c0y + signX * ((newW - t.w) / 2) * sin + signY * ((newH - t.h) / 2) * cos;

        t.node.x = Math.round((cnewX - newW / 2) * 10) / 10;
        t.node.y = Math.round((cnewY - newH / 2) * 10) / 10;
        t.node.width = newW;
        t.node.height = newH;
      }

      t.el.style.left = `${t.node.x}px`;
      t.el.style.top = `${t.node.y}px`;
      t.el.style.width = `${t.node.width}px`;
      t.el.style.height = `${t.node.height}px`;
      if (t.node.type === 'shape') {
        updateShapeSvg(t.el, t.node);
      }
    }
  }

  if ((gesture.mode === 'drag' || gesture.mode === 'resize') && gesture.connectors) {
    for (const cSnap of gesture.connectors) {
      const conn = findNode(cSnap.connId);
      if (!conn || conn.type !== 'connector') continue;
      if (gesture.mode === 'drag') {
        if (cSnap.moveStart) {
          conn.startX = Math.round(cSnap.startX + dx);
          conn.startY = Math.round(cSnap.startY + dy);
        }
        if (cSnap.moveEnd) {
          conn.endX = Math.round(cSnap.endX + dx);
          conn.endY = Math.round(cSnap.endY + dy);
        }
      } else if (gesture.mode === 'resize') {
        for (const t of gesture.targets) {
          if (cSnap.moveStart && conn.startElementId === t.node.id) {
            const pt = closestPointOnRect(conn.startX ?? t.node.x, conn.startY ?? t.node.y, t.node);
            conn.startX = pt.x;
            conn.startY = pt.y;
          }
          if (cSnap.moveEnd && conn.endElementId === t.node.id) {
            const pt = closestPointOnRect(conn.endX ?? t.node.x, conn.endY ?? t.node.y, t.node);
            conn.endX = pt.x;
            conn.endY = pt.y;
          }
        }
      }
      const sx = conn.startX ?? conn.x;
      const sy = conn.startY ?? conn.y;
      const ex = conn.endX ?? conn.x;
      const ey = conn.endY ?? conn.y;
      conn.x = Math.min(sx, ex);
      conn.y = Math.min(sy, ey);
      conn.width = Math.abs(ex - sx);
      conn.height = Math.abs(ey - sy);
    }
  }
  renderConnectors();
  updateSelectionBar();
});

board.addEventListener('pointerup', (e) => {
  safeReleasePointerCapture(board, e.pointerId);
  if (isErasing) {
    isErasing = false;
    return;
  }

  if (isDrawing) {
    isDrawing = false;
    liveLayer.innerHTML = '';
    if (currentStroke.length >= 1) {
      if (currentStroke.length === 1) {
        currentStroke.push({ x: currentStroke[0].x + 0.5, y: currentStroke[0].y + 0.5 });
      }
      txn(() => {
        const isHigh = activeTool === 'highlighter';
        const color = isHigh ? currentHighlighterColor : currentPenColor;
        const strokeWidth = isHigh ? currentHighlighterSize : currentPenSize;
        const node: CanvasNode = {
          id: crypto.randomUUID(),
          type: 'drawing',
          points: [...currentStroke],
          color,
          strokeWidth,
          isHighlighter: isHigh,
          x: currentStroke[0].x,
          y: currentStroke[0].y,
          width: 0,
          height: 0,
          content: '',
          createdAt: Date.now()
        };
        getState().items.push(node);
        renderDrawings();
        scheduleSave();
      });
    }
    currentStroke = [];
    return;
  }

  if (connHandleDrag) {
    if (JSON.stringify(getState().items) !== connHandleDrag.pre) {
      pushHistory(connHandleDrag.pre);
    }
    connHandleDrag = null;
    scheduleSave();
    updateSelectionBar();
    return;
  }

  if (creationGesture) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    const x = Math.min(creationGesture.start.x, wPos.x);
    const y = Math.min(creationGesture.start.y, wPos.y);
    const w = Math.abs(wPos.x - creationGesture.start.x);
    const h = Math.abs(wPos.y - creationGesture.start.y);
    liveLayer.innerHTML = '';

    const isClickOnly = w < 20 && h < 20;
    let newNode: CanvasNode | null = null;

    if (creationGesture.tool === 'sticky') {
      if (isClickOnly) {
        newNode = createSticky(creationGesture.start.x - 90, creationGesture.start.y - 90);
      } else {
        newNode = createSticky(x, y, currentPastel, Math.max(80, w), Math.max(80, h));
      }
    } else if (creationGesture.tool === 'shape') {
      if (isClickOnly) {
        newNode = createShape(creationGesture.start.x - 80, creationGesture.start.y - 50, creationGesture.shapeType);
      } else {
        newNode = createShape(x, y, creationGesture.shapeType, Math.max(40, w), Math.max(40, h));
      }
    } else if (creationGesture.tool === 'section') {
      if (isClickOnly) {
        newNode = createSection(creationGesture.start.x - 260, creationGesture.start.y - 190);
      } else {
        newNode = createSection(x, y, Math.max(160, w), Math.max(120, h));
      }
    } else if (creationGesture.tool === 'text') {
      if (isClickOnly) {
        newNode = createText(creationGesture.start.x - 110, creationGesture.start.y - 20, 220, 48);
      } else {
        newNode = createText(x, y, Math.max(80, w), Math.max(36, h));
      }
    } else if (creationGesture.tool === 'todo') {
      if (isClickOnly) {
        newNode = createTodoNode(creationGesture.start.x - 120, creationGesture.start.y - 70, 240, 140);
      } else {
        newNode = createTodoNode(x, y, Math.max(140, w), Math.max(80, h));
      }
    } else if (creationGesture.tool === 'thought') {
      if (isClickOnly) {
        newNode = createThoughtNode(creationGesture.start.x - 110, creationGesture.start.y - 70, 220, 140);
      } else {
        newNode = createThoughtNode(x, y, Math.max(140, w), Math.max(80, h));
      }
    }

    creationGesture = null;
    setActiveTool('select');
    if (newNode) {
      const el = nodeByIdInWorld(newNode.id);
      if (el) {
        setActive(el);
        const ta = el.querySelector<HTMLElement>(
          '.sticky-textarea, .sticky-check-input, .shape-text, .node-text, .card-title, .section-title-input'
        );
        ta?.focus();
      }
    }
    return;
  }

  if (isConnecting && connStartPoint) {
    isConnecting = false;
    liveLayer.innerHTML = '';
    const endPoint = screenToWorld(e.clientX, e.clientY);
    const dist = Math.hypot(endPoint.x - connStartPoint.x, endPoint.y - connStartPoint.y);
    if (dist > 15) {
      txn(() => {
        // QA-G5B-B: decorative lines never auto-attach to nodes and render arrowless.
        const isDecorLine = isConnectingLine;
        isConnectingLine = false;
        const startNode = isDecorLine ? undefined : findNodeAt(connStartPoint!.x, connStartPoint!.y);
        const endNode = isDecorLine ? undefined : findNodeAt(endPoint.x, endPoint.y);
        const node: CanvasNode = {
          id: crypto.randomUUID(),
          type: 'connector',
          startX: connStartPoint!.x,
          startY: connStartPoint!.y,
          endX: endPoint.x,
          endY: endPoint.y,
          startElementId: startNode?.id,
          endElementId: endNode?.id,
          x: Math.min(connStartPoint!.x, endPoint.x),
          y: Math.min(connStartPoint!.y, endPoint.y),
          width: Math.abs(endPoint.x - connStartPoint!.x),
          height: Math.abs(endPoint.y - connStartPoint!.y),
          content: '',
          color: isDecorLine ? '#6B7280' : '#9747FF',
          strokeWidth: 3,
          lineStyle: isDecorLine ? 'straight' : currentConnectorStyle,
          arrowEnd: !isDecorLine,
          createdAt: Date.now()
        };
        getState().items.push(node);
        renderConnectors();
        scheduleSave();
      });
    }
    isConnectingLine = false;
    connStartPoint = null;
    setActiveTool('select');
    return;
  }

  if (marquee) finishMarquee(e.clientX, e.clientY);
  if (panning) {
    panning = null;
    board.classList.remove('panning');
    updateCanvasCursor();
  }

  if (gesture) {
    for (const t of gesture.targets) t.el.classList.remove('dragging');
    if (gesture.connectors && (gesture.mode === 'rotate' || gesture.mode === 'resize')) {
      for (const cSnap of gesture.connectors) {
        const conn = findNode(cSnap.connId);
        if (!conn || conn.type !== 'connector') continue;
        if (cSnap.moveStart && conn.startElementId) {
          const sNode = findNode(conn.startElementId);
          if (sNode) {
            const pt = closestPointOnNode(conn.startX ?? sNode.x, conn.startY ?? sNode.y, sNode);
            conn.startX = pt.x;
            conn.startY = pt.y;
          }
        }
        if (cSnap.moveEnd && conn.endElementId) {
          const eNode = findNode(conn.endElementId);
          if (eNode) {
            const pt = closestPointOnNode(conn.endX ?? eNode.x, conn.endY ?? eNode.y, eNode);
            conn.endX = pt.x;
            conn.endY = pt.y;
          }
        }
        const sx = conn.startX ?? conn.x;
        const sy = conn.startY ?? conn.y;
        const ex = conn.endX ?? conn.x;
        const ey = conn.endY ?? conn.y;
        conn.x = Math.min(sx, ex);
        conn.y = Math.min(sy, ey);
        conn.width = Math.abs(ex - sx);
        conn.height = Math.abs(ey - sy);
      }
      renderConnectors();
    }
    if (gesture.moved) {
      pushHistory(gesture.pre);
      scheduleSave();
    } else if (gesture.pendingFocusTarget) {
      gesture.pendingFocusTarget.focus();
    }
    gesture = null;
  }
  if (rotateFeedbackEl) {
    rotateFeedbackEl.remove();
    rotateFeedbackEl = null;
  }
});

board.addEventListener('pointercancel', (e) => {
  safeReleasePointerCapture(board, e.pointerId);
  isDrawing = false;
  isErasing = false;
  currentStroke = [];
  isConnecting = false;
  isConnectingLine = false;
  connStartPoint = null;
  connHandleDrag = null;
  creationGesture = null;
  if (rotateFeedbackEl) { rotateFeedbackEl.remove(); rotateFeedbackEl = null; }
  panning = null;
  marquee = null;
  gesture = null;
  marqueeEl.classList.add('hidden');
  liveLayer.innerHTML = '';
  board.classList.remove('panning');
});

// ---------- Mouse Wheel Zooming centered around cursor ----------

board.addEventListener(
  'wheel',
  (e) => {
    if ((e.target as HTMLElement).closest('#ctx-menu, #spawn-menu, .dock-popover, .modal-window')) return;
    e.preventDefault();
    closeCtx();
    closeAllDockPopovers();
    const rect = board.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  },
  { passive: false }
);

zoomIn.addEventListener('click', () => zoomAtCenter(1.2));
zoomOut.addEventListener('click', () => zoomAtCenter(1 / 1.2));
zoomLabel.addEventListener('click', () => zoomAtCenter(1 / view.scale));
zoomFit.addEventListener('click', zoomFitContent);

// ---------- Node Actions: remove / duplicate / z-order ----------

function removeNodes(ids: string[]): void {
  if (!ids.length) return;
  txn(() => {
    const state = getState();
    const idSet = new Set(ids);
    for (const id of ids) {
      if (selectedConnectorId === id) selectedConnectorId = null;
      if (active?.node?.id === id) active = null;
      nodeByIdInWorld(id)?.remove();
      selectedIds.delete(id);
    }
    for (const item of state.items) {
      if (item.type === 'connector') {
        if (item.startElementId && idSet.has(item.startElementId)) {
          item.startElementId = undefined;
        }
        if (item.endElementId && idSet.has(item.endElementId)) {
          item.endElementId = undefined;
        }
      }
    }
    state.items = state.items.filter((n) => !idSet.has(n.id));
    paintSelection();
    updateSelectionBar();
    renderConnectors();
    renderDrawings();
    updateEmpty();
    scheduleSave();
  });
}

function deleteSelection(): void {
  const ids: string[] = [];
  if (selectedConnectorId) {
    ids.push(selectedConnectorId);
    selectedConnectorId = null;
  }
  if (selectedIds.size) {
    ids.push(...selectedIds);
  }
  if (ids.length) {
    removeNodes(ids);
  }
}

function duplicateSelected(): void {
  if (!selectedIds.size && !selectedConnectorId) return;
  txn(() => {
    const state = getState();
    const idsToClone = new Set(selectedIds);
    if (selectedConnectorId) idsToClone.add(selectedConnectorId);

    const idMap = new Map<string, string>();
    for (const id of idsToClone) {
      idMap.set(id, crypto.randomUUID());
    }

    const clones = state.items
      .filter((n) => idsToClone.has(n.id))
      .map((n) => {
        const newId = idMap.get(n.id)!;
        const c = { ...structuredClone(n), id: newId, x: n.x + 24, y: n.y + 24, createdAt: Date.now() };
        if (c.type === 'connector') {
          if (typeof c.startX === 'number') c.startX += 24;
          if (typeof c.startY === 'number') c.startY += 24;
          if (typeof c.endX === 'number') c.endX += 24;
          if (typeof c.endY === 'number') c.endY += 24;
          if (typeof c.controlX === 'number') c.controlX += 24;
          if (typeof c.controlY === 'number') c.controlY += 24;
          if (c.startElementId) {
            c.startElementId = idMap.get(c.startElementId);
          }
          if (c.endElementId) {
            c.endElementId = idMap.get(c.endElementId);
          }
        }
        return c;
      });
    state.items.push(...clones);
    for (const c of clones) {
      const el = buildNode(c);
      if (el) world.appendChild(el);
    }
    selectedIds.clear();
    let newConnectorId: string | null = null;
    for (const c of clones) {
      if (c.type === 'connector') {
        newConnectorId = c.id;
      } else {
        selectedIds.add(c.id);
      }
    }
    selectedConnectorId = newConnectorId;
    const firstClone = clones.find((c) => c.type !== 'connector' && c.type !== 'drawing');
    if (firstClone) {
      const el = nodeByIdInWorld(firstClone.id);
      if (el) active = { el, node: firstClone };
      else active = null;
    } else {
      active = null;
    }
    paintSelection();
    updateSelectionBar();
    renderConnectors();
    renderDrawings();
    updateEmpty();
    scheduleSave();
  });
}

let copiedNodesBuffer: CanvasNode[] = [];

function copySelection(): void {
  const ids = new Set(selectedIds);
  if (selectedConnectorId) ids.add(selectedConnectorId);
  if (!ids.size) return;
  const state = getState();
  const nodes = state.items.filter((n) => ids.has(n.id));
  if (!nodes.length) return;
  copiedNodesBuffer = structuredClone(nodes);

  const textContent = nodes
    .map((n) => {
      if (n.type === 'link') return n.url || '';
      return [n.title, n.content].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join('\n\n');

  if (textContent && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(textContent).catch(() => {});
  }
}

function pasteSelection(targetPoint?: { x: number; y: number }): void {
  if (copiedNodesBuffer.length > 0) {
    txn(() => {
      const state = getState();
      let minX = Infinity;
      let minY = Infinity;
      for (const n of copiedNodesBuffer) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
      }
      const dx = targetPoint ? Math.round(targetPoint.x - minX) : 24;
      const dy = targetPoint ? Math.round(targetPoint.y - minY) : 24;

      const idMap = new Map<string, string>();
      for (const n of copiedNodesBuffer) {
        idMap.set(n.id, crypto.randomUUID());
      }

      const clones = copiedNodesBuffer.map((n) => {
        const newId = idMap.get(n.id)!;
        const c = { ...structuredClone(n), id: newId, x: n.x + dx, y: n.y + dy, createdAt: Date.now() };
        if (c.type === 'connector') {
          if (typeof c.startX === 'number') c.startX += dx;
          if (typeof c.startY === 'number') c.startY += dy;
          if (typeof c.endX === 'number') c.endX += dx;
          if (typeof c.endY === 'number') c.endY += dy;
          if (typeof c.controlX === 'number') c.controlX += dx;
          if (typeof c.controlY === 'number') c.controlY += dy;
          if (c.startElementId) {
            c.startElementId = idMap.get(c.startElementId);
          }
          if (c.endElementId) {
            c.endElementId = idMap.get(c.endElementId);
          }
        }
        return c;
      });

      state.items.push(...clones);
      for (const c of clones) {
        const el = buildNode(c);
        if (el) world.appendChild(el);
      }
      selectedIds.clear();
      let newConnectorId: string | null = null;
      for (const c of clones) {
        if (c.type === 'connector') newConnectorId = c.id;
        else selectedIds.add(c.id);
      }
      selectedConnectorId = newConnectorId;
      const firstClone = clones.find((c) => c.type !== 'connector' && c.type !== 'drawing');
      if (firstClone) {
        const el = nodeByIdInWorld(firstClone.id);
        if (el) active = { el, node: firstClone };
        else active = null;
      } else {
        active = null;
      }
      paintSelection();
      updateSelectionBar();
      renderConnectors();
      renderDrawings();
      updateEmpty();
      scheduleSave();
    });
    return;
  }

  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText().then((clipText) => {
      const text = clipText?.trim();
      if (!text) return;
      const pos = targetPoint || worldCenter();
      const ytId = youtubeId(text);
      if (ytId) {
        addVideo(`yt:${ytId}`, pos.x, pos.y);
      } else if (text.startsWith('http://') || text.startsWith('https://')) {
        spawnAt = pos;
        createItem('link', text);
      } else {
        createSticky(pos.x - 90, pos.y - 90, currentPastel, 180, 180, text);
      }
    }).catch(() => {});
  }
}

function zOrder(dir: 1 | -1 | 'front' | 'back'): void {
  const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : (active?.node ? [active.node.id] : []);
  if (selectedConnectorId && !targetIds.includes(selectedConnectorId)) {
    targetIds.push(selectedConnectorId);
  }
  if (targetIds.length === 0) return;

  const targetSet = new Set(targetIds);
  const allNodes = Array.from(world.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-node')
  );
  const selectedEls = allNodes.filter((el) => targetSet.has(el.dataset.node!));

  txn(() => {
    if (selectedEls.length > 0) {
      if (dir === 'front') {
        for (const el of selectedEls) {
          world.appendChild(el);
        }
      } else if (dir === 'back') {
        const firstHtmlNode = Array.from(world.children).find(
          (child) => child.hasAttribute('data-node') && !targetSet.has(child.getAttribute('data-node') || '')
        );
        for (const el of selectedEls) {
          if (firstHtmlNode) {
            world.insertBefore(el, firstHtmlNode);
          } else {
            world.insertBefore(el, liveLayer.nextSibling);
          }
        }
      } else if (dir === 1) {
        for (let i = selectedEls.length - 1; i >= 0; i--) {
          const el = selectedEls[i];
          let next = el.nextElementSibling;
          while (next && next.hasAttribute('data-node') && targetSet.has(next.getAttribute('data-node') || '')) {
            next = next.nextElementSibling;
          }
          if (next) {
            world.insertBefore(el, next.nextSibling);
          }
        }
      } else if (dir === -1) {
        for (let i = 0; i < selectedEls.length; i++) {
          const el = selectedEls[i];
          let prev = el.previousElementSibling;
          while (prev && prev.hasAttribute('data-node') && targetSet.has(prev.getAttribute('data-node') || '')) {
            prev = prev.previousElementSibling;
          }
          if (prev && prev !== liveLayer && prev !== drawingsLayer && prev !== connectorsLayer) {
            world.insertBefore(el, prev);
          }
        }
      }
    }

    const state = getState();
    const byId = new Map(state.items.map((n) => [n.id, n] as const));
    const reorderedHtmlNodes = Array.from(world.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-node'))
      .map((el) => byId.get(el.dataset.node!))
      .filter((n): n is CanvasNode => !!n);

    // If connectors were selected for z-ordering, reorder connectors among connectors
    const connectorTargets = state.items.filter((n) => n.type === 'connector' && targetSet.has(n.id));
    if (connectorTargets.length > 0) {
      const allConns = state.items.filter((n) => n.type === 'connector');
      const connTargetSet = new Set(connectorTargets.map((c) => c.id));
      if (dir === 'front') {
        const unselected = allConns.filter((c) => !connTargetSet.has(c.id));
        const selected = allConns.filter((c) => connTargetSet.has(c.id));
        const newConns = [...unselected, ...selected];
        let cIdx = 0;
        state.items = state.items.map((it) => (it.type === 'connector' ? newConns[cIdx++] : it));
      } else if (dir === 'back') {
        const unselected = allConns.filter((c) => !connTargetSet.has(c.id));
        const selected = allConns.filter((c) => connTargetSet.has(c.id));
        const newConns = [...selected, ...unselected];
        let cIdx = 0;
        state.items = state.items.map((it) => (it.type === 'connector' ? newConns[cIdx++] : it));
      } else if (dir === 1) {
        for (let i = allConns.length - 2; i >= 0; i--) {
          if (connTargetSet.has(allConns[i].id) && !connTargetSet.has(allConns[i + 1].id)) {
            const tmp = allConns[i];
            allConns[i] = allConns[i + 1];
            allConns[i + 1] = tmp;
          }
        }
        let cIdx = 0;
        state.items = state.items.map((it) => (it.type === 'connector' ? allConns[cIdx++] : it));
      } else if (dir === -1) {
        for (let i = 1; i < allConns.length; i++) {
          if (connTargetSet.has(allConns[i].id) && !connTargetSet.has(allConns[i - 1].id)) {
            const tmp = allConns[i];
            allConns[i] = allConns[i - 1];
            allConns[i - 1] = tmp;
          }
        }
        let cIdx = 0;
        state.items = state.items.map((it) => (it.type === 'connector' ? allConns[cIdx++] : it));
      }
    }

    // Preserve non-HTML items (drawings, connectors) in their relative slots while updating HTML nodes
    if (reorderedHtmlNodes.length > 0) {
      let htmlIdx = 0;
      state.items = state.items.map((item) => {
        if (item.type === 'connector' || item.type === 'drawing') {
          return item;
        }
        return reorderedHtmlNodes[htmlIdx++];
      });
      while (htmlIdx < reorderedHtmlNodes.length) {
        state.items.push(reorderedHtmlNodes[htmlIdx++]);
      }
    }

    const firstEl = selectedEls[0];
    if (firstEl) {
      const node = findNode(firstEl.dataset.node!);
      if (node) active = { el: firstEl, node };
      else active = null;
    } else {
      active = null;
    }
    renderConnectors();
    renderDrawings();
    scheduleSave();
    updateSelectionBar();
  });
}

function rebuildBoard(): void {
  world.replaceChildren();
  world.appendChild(connectorsLayer);
  world.appendChild(drawingsLayer);
  world.appendChild(liveLayer);

  for (const node of getState().items) {
    const el = buildNode(node);
    if (el) world.appendChild(el);
  }
  renderConnectors();
  renderDrawings();
  closeCtx();
  selectedIds.clear();
  selectedConnectorId = null;
  active = null;
  paintSelection();
  updateSelectionBar();
  updateEmpty();
}

// ---------- Modal / panel focus management (QA-G5 P3-1) ----------
// Focus moves into a surface on open, returns to the invoking control on
// close, and stays inside TRUE modal dialogs (backdrop + confirm/cancel
// semantics) while they are open. Side panels (settings/clipboard/export)
// intentionally stay uncontained: they are reference panels, not blocking
// dialogs. Focus restoration only steals focus back when focus is still
// inside the closing surface (or stranded on body).

const surfaceOpeners = new Map<HTMLElement, HTMLElement | null>();

function focusablesIn(surface: HTMLElement): HTMLElement[] {
  const nodes = surface.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter((el) => el.getClientRects().length > 0);
}

function openSurface(surface: HTMLElement, explicitInvoker?: HTMLElement | null): void {
  const detected = document.activeElement;
  // Chromium does not reliably focus toolbar buttons on mousedown in this
  // window configuration, so direct listeners pass their invoker explicitly.
  const invoker = explicitInvoker
    ?? (detected instanceof HTMLElement && !surface.contains(detected) && detected !== document.body ? detected : null);
  surfaceOpeners.set(surface, invoker);
  surface.classList.remove('hidden');
  (focusablesIn(surface)[0] ?? surface).focus();
}

function closeSurface(surface: HTMLElement): void {
  const wasOpen = !surface.classList.contains('hidden');
  surface.classList.add('hidden');
  if (!wasOpen) return;
  const opener = surfaceOpeners.get(surface) ?? null;
  surfaceOpeners.delete(surface);
  const focused = document.activeElement;
  const focusInside = focused instanceof HTMLElement && (surface.contains(focused) || focused === document.body);
  if (focusInside && opener) opener.focus();
}

/** True modal dialogs: keyboard focus is contained while open. */
const modalSurfaces: readonly HTMLElement[] = [
  templatesModal,
  clearModal,
  shortcutsModal,
  aboutModal,
  ...(boardsModal ? [boardsModal] : []),
  ...(importConfirmModal ? [importConfirmModal] : [])
];

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const openModal = modalSurfaces.find((m) => !m.classList.contains('hidden'));
  if (!openModal) return;
  const focusables = focusablesIn(openModal);
  if (focusables.length === 0) return;
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !openModal.contains(focused)) {
    // focus left the dialog without it closing (e.g. click on the backdrop
    // canvas area): bring it back in instead of tabbing the page behind.
    e.preventDefault();
    (e.shiftKey ? focusables[focusables.length - 1] : focusables[0]).focus();
    return;
  }
  if (!e.shiftKey && focused === focusables[focusables.length - 1]) {
    e.preventDefault();
    focusables[0].focus();
  } else if (e.shiftKey && focused === focusables[0]) {
    e.preventDefault();
    focusables[focusables.length - 1].focus();
  }
});

// ---------- Keyboard Shortcuts ----------

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const editing = isEditable(e.target);
  const isCardEditor = !!(e.target as HTMLElement)?.closest?.('[data-node]');

  if (e.key === 'Escape') {
    closeAllDockPopovers();
    closeAllMenuDropdowns();
    exportPanel.classList.add('hidden');
    closeSurface(settingsPanel);
    closeSurface(clipPanel);
    closeSurface(templatesModal);
    closeSurface(clearModal);
    closeSurface(shortcutsModal);
    closeSurface(aboutModal);
    if (boardsModal) closeSurface(boardsModal);
    if (importConfirmModal) { pendingImportDoc = null; closeSurface(importConfirmModal); }
    menu.classList.add('hidden');
    selRotateMenu?.classList.add('hidden');
    closeCtx();
    liveLayer.innerHTML = '';
    isDrawing = false;
    isErasing = false;
    currentStroke = [];
    isConnecting = false;
    connStartPoint = null;
    connHandleDrag = null;
    creationGesture = null;
    panning = null;
    marquee = null;
    gesture = null;
    marqueeEl.classList.add('hidden');
    board.classList.remove('panning');
    setActiveTool('select');
    if (!editing) setActive(null);
    return;
  }

  if (e.code === 'Space' && !editing && !spacebarHeld) {
    e.preventDefault();
    prevToolBeforeSpace = activeTool;
    spacebarHeld = true;
    setActiveTool('hand');
    return;
  }

  if (mod && k === 'c' && !editing) {
    e.preventDefault();
    copySelection();
    return;
  }

  if (mod && k === 'v' && !editing) {
    e.preventDefault();
    pasteSelection();
    return;
  }

  if (mod && e.shiftKey && k === 'b') {
    e.preventDefault();
    openBoardsModal();
    return;
  }

  if (mod && k === 'b' && !e.shiftKey && (!editing || isCardEditor)) {
    e.preventDefault();
    toggleBoldSelection();
    return;
  }

  if (mod && k === 'n' && !editing) {
    e.preventDefault();
    openBoardsModal();
    if (boardsNewName) boardsNewName.focus();
    return;
  }

  if (mod && k === 'i' && (!editing || isCardEditor)) {
    e.preventDefault();
    toggleItalicSelection();
    return;
  }

  if (editing) return;

  if (mod && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  } else if (mod && k === 'd') {
    e.preventDefault();
    duplicateSelected();
  } else if (mod && k === 'a') {
    e.preventDefault();
    selectedIds.clear();
    getState().items.forEach((n) => selectedIds.add(n.id));
    paintSelection();
  } else if (mod && k === 't') {
    e.preventDefault();
    closeAllDockPopovers();
    renderTemplatesModal();
    openSurface(templatesModal);
  } else if (mod && (k === '+' || k === '=')) {
    e.preventDefault();
    zoomAt(board.clientWidth / 2, board.clientHeight / 2, 1.25);
  } else if (mod && (k === '-' || k === '_')) {
    e.preventDefault();
    zoomAt(board.clientWidth / 2, board.clientHeight / 2, 0.8);
  } else if (mod && k === '0') {
    e.preventDefault();
    view.scale = 1;
    applyTransform();
  } else if (e.shiftKey && k === '1') {
    e.preventDefault();
    zoomFitContent();
  } else if ((e.shiftKey && k === 'e') || (mod && e.shiftKey && k === 'e')) {
    e.preventDefault();
    void exportBoardPng(getState().items);
  } else if (mod && k === 'o') {
    e.preventDefault();
    importFileInput.click();
  } else if (mod && k === 's') {
    e.preventDefault();
    scheduleSave();
    const textSpan = saveStatusBadge.querySelector('.status-text') || saveStatusBadge;
    textSpan.textContent = 'Saved to disk ✓';
    saveStatusBadge.classList.add('saving');
    setTimeout(() => {
      textSpan.textContent = 'Saved locally.';
      saveStatusBadge.classList.remove('saving');
    }, 1000);
  } else if ((k === 'delete' || k === 'backspace') && (selectedIds.size || selectedConnectorId)) {
    e.preventDefault();
    deleteSelection();
  } else if (!editing && (k === ']' || (mod && k === ']'))) {
    e.preventDefault();
    zOrder(e.shiftKey ? 'front' : 1);
  } else if (!editing && (k === '[' || (mod && k === '['))) {
    e.preventDefault();
    zOrder(e.shiftKey ? 'back' : -1);
  } else if (!editing && mod && (e.key === '}' || (e.shiftKey && e.code === 'BracketRight'))) {
    e.preventDefault();
    zOrder('front');
  } else if (!editing && mod && (e.key === '{' || (e.shiftKey && e.code === 'BracketLeft'))) {
    e.preventDefault();
    zOrder('back');
  } else if (k === 'g') {
    cycleGridStyle();
  } else if (k === '?') {
    openSurface(shortcutsModal);
  } else if (e.altKey && k === 'r' && selectedIds.size > 0) {
    e.preventDefault();
    rotateSelection(e.shiftKey ? -15 : 15);
  } else if (e.altKey && k === '0' && selectedIds.size > 0) {
    e.preventDefault();
    setSelectionRotation(0);
  } else if (!mod) {
    if (k === 'v' || k === 'm') setActiveTool('select');
    else if (k === 'h') setActiveTool('hand');
    else if (k === 'p') setActiveTool('pen');
    else if (k === 's') setActiveTool('sticky');
    else if (k === 'r') setActiveTool('shape');
    else if (k === 'c') setActiveTool('connector');
    else if (k === 'l') setActiveTool('line');
    else if (k === 't') setActiveTool('text');
    else if (k === 'f') setActiveTool('section');
    else if (k === 'e') setActiveTool('stamp');
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spacebarHeld) {
    spacebarHeld = false;
    setActiveTool(prevToolBeforeSpace);
  }
});

window.addEventListener('blur', () => {
  if (spacebarHeld) {
    spacebarHeld = false;
    board.classList.remove('panning');
    panning = null;
    setActiveTool(prevToolBeforeSpace || 'select');
  }
});

// ---------- Desktop App Menu Bar (File / Edit / Insert / View / Help) Wiring ----------

let statusBadgeTimer: NodeJS.Timeout | null = null;
function flashStatus(text: string, isError = false): void {
  if (!saveStatusBadge) return;
  const textSpan = saveStatusBadge.querySelector('.status-text') || saveStatusBadge;
  textSpan.textContent = text;
  saveStatusBadge.classList.add('saving');
  if (isError) saveStatusBadge.classList.add('error');
  else saveStatusBadge.classList.remove('error');
  if (statusBadgeTimer) clearTimeout(statusBadgeTimer);
  statusBadgeTimer = setTimeout(() => {
    textSpan.textContent = 'Saved locally.';
    saveStatusBadge.classList.remove('saving', 'error');
  }, isError ? 3000 : 1500);
}

const menuBarItems = [
  { btn: document.getElementById('btn-menu-hamburger'), drop: document.getElementById('dropdown-app') }
];

let isMenuBarActive = false;

function closeAllMenuDropdowns(): void {
  for (const { btn, drop } of menuBarItems) {
    drop?.classList.add('hidden');
    btn?.classList.remove('is-active');
  }
  isMenuBarActive = false;
}

function syncMenuDropdownStates(target: number | HTMLElement | null): void {
  const dropEl = typeof target === 'number' ? menuBarItems[target]?.drop : target;
  if (!dropEl) return;
  const items = getState().items;
  const hasItems = items.length > 0;
  const hasSelection = selectedIds.size > 0 || selectedConnectorId !== null;

  if (dropEl.id === 'dropdown-app' || dropEl.id === 'dropdown-file') {
    const expPng = dropEl.querySelector<HTMLButtonElement>('[data-menu="export-png"]');
    const expJson = dropEl.querySelector<HTMLButtonElement>('[data-menu="export-json"]');
    const clearBtn = dropEl.querySelector<HTMLButtonElement>('[data-menu="clear"]');
    if (expPng) expPng.disabled = !hasItems;
    if (expJson) expJson.disabled = !hasItems;
    if (clearBtn) clearBtn.disabled = !hasItems;
  }
  if (dropEl.id === 'dropdown-edit') {
    const undoItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="undo"]');
    const redoItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="redo"]');
    const copyItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="copy"]');
    const pasteItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="paste"]');
    const dupItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="duplicate"]');
    const selAllItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="select-all"]');
    const delItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="delete"]');
    if (undoItem) undoItem.disabled = hist.undo.length === 0;
    if (redoItem) redoItem.disabled = hist.redo.length === 0;
    if (copyItem) copyItem.disabled = !hasSelection;
    if (pasteItem) pasteItem.disabled = false;
    if (dupItem) dupItem.disabled = !hasSelection;
    if (selAllItem) selAllItem.disabled = !hasItems;
    if (delItem) delItem.disabled = !hasSelection;
  }
  if (dropEl.id === 'dropdown-view') {
    const zoomFitItem = dropEl.querySelector<HTMLButtonElement>('[data-menu="zoom-fit"]');
    if (zoomFitItem) zoomFitItem.disabled = !hasItems;
  }
}

function focusFirstMenuItem(drop: HTMLElement | null): void {
  if (!drop) return;
  const first = drop.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)');
  first?.focus();
}

function getVisibleMenuBarIndices(): number[] {
  const indices: number[] = [];
  menuBarItems.forEach((item, i) => {
    if (item.btn && (item.btn.offsetParent !== null || item.btn.getBoundingClientRect().width > 0)) {
      indices.push(i);
    }
  });
  return indices.length ? indices : [0];
}

function openMenuDropdown(index: number): void {
  closeAllMenuDropdowns();
  closeAllDockPopovers();
  const item = menuBarItems[index];
  if (!item?.drop || !item.btn) return;
  syncMenuDropdownStates(item.drop);
  item.drop.classList.remove('hidden');
  item.btn.classList.add('is-active');
  isMenuBarActive = true;
}

menuBarItems.forEach(({ btn, drop }, idx) => {
  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (drop && !drop.classList.contains('hidden')) {
      closeAllMenuDropdowns();
    } else {
      openMenuDropdown(idx);
    }
  });

  btn?.addEventListener('mouseenter', () => {
    if (isMenuBarActive) {
      openMenuDropdown(idx);
    }
  });

  btn?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenuDropdown(idx);
      focusFirstMenuItem(drop);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const visible = getVisibleMenuBarIndices();
      const pos = visible.indexOf(idx);
      const nextIdx = pos !== -1 ? visible[(pos + 1) % visible.length] : visible[0];
      menuBarItems[nextIdx].btn?.focus();
      if (isMenuBarActive) openMenuDropdown(nextIdx);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const visible = getVisibleMenuBarIndices();
      const pos = visible.indexOf(idx);
      const prevIdx = pos !== -1 ? visible[(pos - 1 + visible.length) % visible.length] : visible[0];
      menuBarItems[prevIdx].btn?.focus();
      if (isMenuBarActive) openMenuDropdown(prevIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAllMenuDropdowns();
    }
  });

  drop?.addEventListener('keydown', (e) => {
    const items = Array.from(drop.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)'));
    const activeEl = document.activeElement as HTMLButtonElement | null;
    const curIdx = items.indexOf(activeEl!);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextItem = items[(curIdx + 1) % items.length];
      nextItem?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevItem = items[(curIdx - 1 + items.length) % items.length];
      prevItem?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAllMenuDropdowns();
      btn?.focus();
    } else if (e.key === 'Tab') {
      closeAllMenuDropdowns();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const visible = getVisibleMenuBarIndices();
      const pos = visible.indexOf(idx);
      const nextIdx = pos !== -1 ? visible[(pos + 1) % visible.length] : visible[0];
      openMenuDropdown(nextIdx);
      focusFirstMenuItem(menuBarItems[nextIdx].drop);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const visible = getVisibleMenuBarIndices();
      const pos = visible.indexOf(idx);
      const prevIdx = pos !== -1 ? visible[(pos - 1 + visible.length) % visible.length] : visible[0];
      openMenuDropdown(prevIdx);
      focusFirstMenuItem(menuBarItems[prevIdx].drop);
    }
  });

  drop?.addEventListener('pointerdown', (e) => e.stopPropagation());

  drop?.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-menu]');
    if (!item || item.disabled) return;
    closeAllMenuDropdowns();
    const act = item.dataset.menu;
    switch (act) {
      case 'save':
        scheduleSave();
        flashStatus('Saved to disk ✓');
        break;
      case 'templates':
      case 'insert-templates':
        renderTemplatesModal();
        openSurface(templatesModal);
        break;
      case 'export-png':
        void exportBoardPng(getState().items);
        break;
      case 'export-json':
        void exportBoardDocument();
        break;
      case 'import-json':
        importFileInput.click();
        break;
      case 'import-n8n':
        importN8nInput?.click();
        break;
      case 'boards':
        openBoardsModal();
        break;
      case 'new-board':
        openBoardsModal();
        if (boardsNewName) boardsNewName.focus();
        break;
      case 'settings':
        closeAllDockPopovers();
        closeAllMenuDropdowns();
        openSurface(settingsPanel);
        syncSettingsUI();
        break;
      case 'clear':
        openSurface(clearModal);
        break;
      case 'insert-sticky': {
        const c = worldCenter();
        const node = createSticky(Math.round(c.x - 120), Math.round(c.y - 120));
        if (node) {
          const el = nodeByIdInWorld(node.id);
          if (el) {
            setActive(el);
            el.querySelector<HTMLElement>('.sticky-textarea')?.focus();
          }
        }
        break;
      }
      case 'insert-text': {
        const c = worldCenter();
        const node = createText(Math.round(c.x - 110), Math.round(c.y - 24), 220, 48);
        if (node) {
          const el = nodeByIdInWorld(node.id);
          if (el) {
            setActive(el);
            el.querySelector<HTMLElement>('.node-text')?.focus();
          }
        }
        break;
      }
      case 'insert-shape-rounded-rect':
      case 'insert-shape-rect':
      case 'insert-shape-circle':
      case 'insert-shape-diamond':
      case 'insert-shape-triangle': {
        const shapeMap: Record<string, ShapeType> = {
          'insert-shape-rounded-rect': 'rounded-rect',
          'insert-shape-rect': 'rectangle',
          'insert-shape-circle': 'circle',
          'insert-shape-diamond': 'diamond',
          'insert-shape-triangle': 'triangle'
        };
        const shapeType = shapeMap[act] || 'rounded-rect';
        const c = worldCenter();
        const node = createShape(Math.round(c.x - 80), Math.round(c.y - 50), shapeType);
        if (node) {
          const el = nodeByIdInWorld(node.id);
          if (el) {
            setActive(el);
            el.querySelector<HTMLElement>('.shape-text')?.focus();
          }
        }
        break;
      }
      case 'insert-section': {
        const c = worldCenter();
        const node = createSection(Math.round(c.x - 260), Math.round(c.y - 190));
        if (node) {
          const el = nodeByIdInWorld(node.id);
          if (el) {
            setActive(el);
            el.querySelector<HTMLElement>('.section-title-input')?.focus();
          }
        }
        break;
      }
      case 'insert-line': {
        setActiveTool('line');
        flashStatus('Click and drag on canvas to draw a straight line');
        break;
      }
      case 'insert-connector': {
        setActiveTool('connector');
        flashStatus('Click and drag across canvas to connect elements');
        break;
      }
      case 'insert-image': {
        if (!window.canvasApi?.pickImage) {
          flashStatus('Image picker unavailable in this environment', true);
          break;
        }
        flashStatus('Selecting image file…');
        const imported = await window.canvasApi.pickImage();
        if (imported) {
          const rect = board.getBoundingClientRect();
          await addImage(`media:${imported.name}`, rect.left + rect.width / 2, rect.top + rect.height / 2);
          flashStatus('Image inserted ✓');
        } else {
          flashStatus('Pick cancelled');
        }
        break;
      }
      case 'insert-video': {
        if (!window.canvasApi?.pickVideo) {
          flashStatus('Video picker unavailable in this environment', true);
          break;
        }
        flashStatus('Selecting video file…');
        const imported = await window.canvasApi.pickVideo();
        if (imported) {
          const c = worldCenter();
          addVideo(`media:${imported.name}`, c.x, c.y);
          flashStatus('Video inserted ✓');
        } else {
          flashStatus('Pick cancelled');
        }
        break;
      }
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'copy':
        copySelection();
        break;
      case 'paste':
        pasteSelection();
        break;
      case 'duplicate':
        duplicateSelected();
        break;
      case 'select-all':
        selectedIds.clear();
        getState().items.forEach((n) => selectedIds.add(n.id));
        const firstItem = getState().items[0];
        if (firstItem) {
          const el = nodeByIdInWorld(firstItem.id);
          if (el) active = { el, node: firstItem };
        }
        paintSelection();
        break;
      case 'delete':
        deleteSelection();
        break;
      case 'zoom-in':
        zoomAt(board.clientWidth / 2, board.clientHeight / 2, 1.25);
        break;
      case 'zoom-out':
        zoomAt(board.clientWidth / 2, board.clientHeight / 2, 0.8);
        break;
      case 'zoom-100':
        view.scale = 1;
        applyTransform();
        break;
      case 'zoom-fit':
        zoomFitContent();
        break;
      case 'grid-toggle':
        cycleGridStyle();
        break;
      case 'toggle-theme': {
        const current = curSettings().theme || 'dark';
        const next: 'dark' | 'light' | 'system' =
          current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
        curSettings().theme = next;
        applyTheme(next);
        saveSettings();
        flashStatus(next === 'system' ? 'System theme applied' : next === 'light' ? 'Light theme applied' : 'Dark theme applied');
        break;
      }
      case 'shortcuts':
        openSurface(shortcutsModal);
        break;
      case 'about':
        openSurface(aboutModal);
        break;
    }
  });
});

undoBtn?.addEventListener('click', undo);
redoBtn?.addEventListener('click', redo);

shortcutsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  openSurface(shortcutsModal);
});

shortcutsCloseBtn?.addEventListener('click', () => {
  closeSurface(shortcutsModal);
});

aboutCloseBtn?.addEventListener('click', () => {
  closeSurface(aboutModal);
});

headerTemplatesBtn?.addEventListener('click', () => {
  closeAllDockPopovers();
  closeAllMenuDropdowns();
  renderTemplatesModal();
  openSurface(templatesModal);
});

const titleEditHint = document.querySelector('.title-edit-hint') as HTMLElement | null;
titleEditHint?.addEventListener('click', () => {
  boardTitleEl.focus();
  const range = document.createRange();
  range.selectNodeContents(boardTitleEl);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
});

boardTitleEl.addEventListener('blur', () => {
  const nextTitle = boardTitleEl.innerText.trim() || 'My Board';
  getState().title = nextTitle;
  boardTitleEl.innerText = nextTitle;
  scheduleSave();
});

boardTitleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    boardTitleEl.blur();
  }
});

window.addEventListener('board-save-status', (e: Event) => {
  const custom = e as CustomEvent<{ status: 'saving' | 'saved' }>;
  const textSpan = saveStatusBadge.querySelector('.status-text') || saveStatusBadge;
  if (custom.detail?.status === 'saving') {
    textSpan.textContent = 'Saving to disk…';
    saveStatusBadge.classList.add('saving');
  } else {
    textSpan.textContent = 'Saved locally.';
    saveStatusBadge.classList.remove('saving');
  }
});

// ---------- QA-G5B A2: Boards / Recent Canvases ----------

let currentBoardsCache: BoardMeta[] = [];
let pendingImportDoc: unknown = null;
let boardsInteractionPending = false;

/**
 * Guard around board-list mutations that change activeBoardId (create /
 * archive with auto-switch / import): deliver any renderer-pending edits for
 * the OLD board to main first (they merge under the current active record),
 * then suppress the debounce so a stale timer cannot merge old content into
 * the NEW record after the wrapper changes.
 */
async function runBoardMutation<T>(op: () => Promise<T>): Promise<T | null> {
  flushSaveNow();
  suppressSaves();
  try {
    return await op();
  } finally {
    resumeSaves();
  }
}

async function fetchBoards(): Promise<BoardsResult | null> {
  if (!window.canvasApi?.boardsList) return null;
  try {
    return await window.canvasApi.boardsList();
  } catch {
    return null;
  }
}

function formatBoardTimestamp(ts: number): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function boardErrorText(error: unknown): string {
  switch (error) {
    case 'last-board': return 'at least one canvas must stay open';
    case 'save-failed': return 'the current canvas could not be saved, so the action was cancelled';
    case 'not-found': return 'that canvas no longer exists';
    case 'already-archived': return 'unexpected archive state';
    case 'invalid-name': return 'enter a name first';
    case 'not-ready': return 'boards are not loaded yet';
    default: return 'unknown error';
  }
}

function renderBoards(res: BoardsResult): void {
  if (!boardsListEl) return;
  const metas = res.boards ?? [];
  currentBoardsCache = metas;
  boardsListEl.innerHTML = '';
  if (boardsEmpty) {
    if (metas.length === 0) {
      boardsEmpty.classList.remove('hidden');
    } else {
      boardsEmpty.classList.add('hidden');
    }
  }
  for (const meta of metas) {
    const row = document.createElement('div');
    row.className = 'board-row' + (meta.active ? ' board-row-active' : '') + (meta.archived ? ' board-row-archived' : '');
    row.dataset.boardId = meta.id;

    const main = document.createElement('div');
    main.className = 'board-row-main';
    const name = document.createElement('div');
    name.className = 'board-row-name';
    name.textContent = meta.name;
    if (meta.active) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'board-active-badge';
      activeBadge.textContent = 'Active';
      name.appendChild(activeBadge);
    }
    main.appendChild(name);
    const sub = document.createElement('div');
    sub.className = 'board-row-meta';
    sub.textContent = meta.archived
      ? `Archived · ${formatBoardTimestamp(meta.updatedAt)}`
      : `${formatBoardTimestamp(meta.updatedAt)} · ${meta.itemCount} item${meta.itemCount === 1 ? '' : 's'}`;
    main.appendChild(sub);
    row.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'board-row-actions';

    const mkBtn = (label: string, cls: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      actions.appendChild(b);
      return b;
    };

    if (!meta.archived && !meta.active) {
      row.style.cursor = 'pointer';
      row.title = `Switch to "${meta.name}"`;
      row.addEventListener('click', async (e) => {
        if ((e.target as HTMLElement).closest('button, input')) return;
        if (boardsInteractionPending) return;
        boardsInteractionPending = true;
        try { await switchToBoard(meta.id); } finally { boardsInteractionPending = false; }
      });

      mkBtn('Open', 'modal-btn secondary board-open-btn').addEventListener('click', async () => {
        if (boardsInteractionPending) return;
        boardsInteractionPending = true;
        try { await switchToBoard(meta.id); } finally { boardsInteractionPending = false; }
      });
    }
    if (!meta.archived) {
      mkBtn('Rename', 'modal-btn secondary board-rename-btn').addEventListener('click', () => {
        beginBoardRename(meta.id);
      });
      mkBtn('Archive', 'modal-btn secondary board-archive-btn').addEventListener('click', async () => {
        if (boardsInteractionPending) return;
        boardsInteractionPending = true;
        try {
          flushSaveNow();
          const result: BoardsResult | null | undefined = await runBoardMutation(() =>
            window.canvasApi!.boardArchive!(meta.id)
          );
          if (result?.ok) {
            if (result.state && result.activeBoardId) applyBoardState(result.state, result.activeBoardId);
            flashStatus(`Canvas "${meta.name}" archived.`);
            await refreshBoards();
          } else {
            flashStatus(`Could not archive: ${boardErrorText(result?.error)}`, true);
          }
        } finally { boardsInteractionPending = false; }
      });
    } else {
      mkBtn('Restore', 'modal-btn secondary board-restore-btn').addEventListener('click', async () => {
        if (boardsInteractionPending) return;
        boardsInteractionPending = true;
        try {
          const result = await window.canvasApi?.boardRestore?.(meta.id);
          if (result?.ok) {
            flashStatus(`Canvas "${meta.name}" restored.`);
            await refreshBoards();
          } else {
            flashStatus(`Could not restore: ${boardErrorText(result?.error)}`, true);
          }
        } finally { boardsInteractionPending = false; }
      });
    }
    row.appendChild(actions);
    boardsListEl.appendChild(row);
  }
}

async function refreshBoards(): Promise<BoardsResult | null> {
  const res = await fetchBoards();
  if (res) renderBoards(res);
  return res;
}

function beginBoardRename(id: string): void {
  if (!boardsListEl) return;
  const row = boardsListEl.querySelector<HTMLElement>(`.board-row[data-board-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const nameEl = row.querySelector<HTMLElement>('.board-row-name');
  if (!nameEl) return;
  const current = currentBoardsCache.find((b) => b.id === id);
  if (!current) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'board-rename-input';
  input.value = current.name;
  input.setAttribute('aria-label', 'Rename canvas');
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (!value || value === current.name) {
      input.replaceWith(nameEl);
      return;
    }
    const result = await window.canvasApi?.boardRename?.(id, value);
    if (result?.ok) {
      flashStatus(`Canvas renamed to "${value}".`);
      if (result.state && result.activeBoardId === id) {
        applyBoardState(result.state, id);
      } else {
        const isCurrentActive = currentBoardsCache.find((b) => b.id === id)?.active;
        if (isCurrentActive && boardTitleEl) {
          boardTitleEl.innerText = value;
          getState().title = value;
        }
      }
      await refreshBoards();
    } else {
      flashStatus(`Could not rename: ${boardErrorText(result?.error)}`, true);
      input.replaceWith(nameEl);
    }
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void commit();
    } else if (ev.key === 'Escape') {
      ev.stopPropagation();
      done = true;
      input.replaceWith(nameEl);
    }
  });
  input.addEventListener('blur', () => void commit());
}

function openBoardsModal(): void {
  closeAllDockPopovers();
  closeAllMenuDropdowns();
  if (boardsModal && boardsModal.classList.contains('hidden')) {
    openSurface(boardsModal);
    if (boardsNewName) boardsNewName.value = '';
    void refreshBoards();
  }
}

/**
 * Replace the renderer board contents with the flat state of another board
 * (mirrors the boot application sequence). Previous board-specific state
 * (selection, viewport, tool, per-board history) is reset/swapped here.
 */
function applyBoardState(next: AppState, boardId: string): void {
  // Commit any half-open edit transaction to the OLD board's history first.
  flushEditTxn();
  adoptBoardHistory(boardId);
  setActiveState(next);

  selectedIds.clear();
  selectedConnectorId = null;
  setActive(null);
  paintSelection();

  applyGridStyle((next.gridStyle ?? 'dots') as GridStyle);
  if (boardTitleEl) boardTitleEl.innerText = next.title || 'Untitled Canvas';

  rebuildBoard();
  updateSelectionBar();
  updateEmpty();

  if (next.pan && typeof next.zoom === 'number' && next.zoom >= 0.2) {
    view.tx = next.pan.x;
    view.ty = next.pan.y;
    view.scale = next.zoom;
    applyTransform();
  } else if (next.items.length > 0) {
    zoomFitContent();
  } else {
    view.tx = 80;
    view.ty = 60;
    view.scale = 1;
    applyTransform();
  }
  setActiveTool('select');
}

async function switchToBoard(id: string): Promise<boolean> {
  if (!window.canvasApi?.boardSwitch) return false;
  const res = await runBoardMutation(() => window.canvasApi!.boardSwitch!(id));
  if (!res || !res.ok || !res.state) {
    flashStatus(`Switch cancelled: ${boardErrorText(res?.error ?? 'unknown error')}`, true);
    void refreshBoards();
    return false;
  }
  applyBoardState(res.state, res.activeBoardId || id);
  const name = res.boards?.find((b) => b.id === id)?.name ?? 'canvas';
  flashStatus(`Switched to "${name}".`);
  if (boardsModal) {
    closeSurface(boardsModal);
  }
  return true;
}

boardsModal?.addEventListener('click', (e) => {
  if (e.target === boardsModal) closeSurface(boardsModal);
});
boardsCloseBtn?.addEventListener('click', () => {
  if (boardsModal) closeSurface(boardsModal);
});
document.getElementById('btn-header-boards')?.addEventListener('click', () => {
  openBoardsModal();
});

boardsCreateBtn?.addEventListener('click', async () => {
  if (boardsInteractionPending) return;
  const name = boardsNewName?.value.trim() ?? '';
  if (!name) {
    flashStatus('Enter a name for the new canvas first.', true);
    boardsNewName?.focus();
    return;
  }
  boardsInteractionPending = true;
  try {
    const result: BoardsResult | null | undefined = await runBoardMutation(() =>
      window.canvasApi!.boardCreate!(name)
    );
    if (result?.ok && result.state && result.activeBoardId) {
      applyBoardState(result.state, result.activeBoardId);
      flashStatus(`Canvas "${name}" created.`);
      if (boardsModal) closeSurface(boardsModal);
      if (boardsNewName) boardsNewName.value = '';
    } else {
      flashStatus(`Could not create canvas: ${boardErrorText(result?.error)}`, true);
    }
  } finally {
    boardsInteractionPending = false;
  }
});

/** Full-document JSON backup: v2 wrapper with every board + app-level data. */
async function exportBoardDocument(): Promise<void> {
  flushSaveNow();
  try {
    const doc = await window.canvasApi?.boardDocumentExport?.();
    if (doc) {
      downloadFile(
        `peepdesk-boards-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(doc, null, 2),
        'application/json'
      );
      return;
    }
  } catch {
    // fall through to the flat legacy export
  }
  exportBoardJson(getState());
}

function requestDocumentImport(doc: unknown): void {
  pendingImportDoc = doc;
  if (importConfirmMsg) {
    importConfirmMsg.textContent =
      'Importing this backup replaces ALL canvases and reminder settings with the file contents. Continue?';
  }
  if (importConfirmModal) openSurface(importConfirmModal);
}

async function confirmDocumentImport(): Promise<void> {
  const doc = pendingImportDoc;
  pendingImportDoc = null;
  if (importConfirmModal) closeSurface(importConfirmModal);
  if (!doc || !window.canvasApi?.boardDocumentImport) return;
  const res: BoardsResult | null | undefined = await runBoardMutation(() =>
    window.canvasApi!.boardDocumentImport!(doc)
  );
  if (res?.ok && res.state && res.activeBoardId) {
    applyBoardState(res.state, res.activeBoardId);
    flashStatus('Backup imported: boards replaced.');
    await refreshBoards();
  } else {
    flashStatus(`Import failed: ${boardErrorText(res?.error ?? 'unexpected error')}`, true);
    void refreshBoards();
  }
}

importConfirmBtn?.addEventListener('click', () => void confirmDocumentImport());
importCancelBtn?.addEventListener('click', () => {
  pendingImportDoc = null;
  if (importConfirmModal) closeSurface(importConfirmModal);
});
importConfirmClose?.addEventListener('click', () => {
  pendingImportDoc = null;
  if (importConfirmModal) closeSurface(importConfirmModal);
});
importConfirmModal?.addEventListener('click', (e) => {
  if (e.target === importConfirmModal) {
    pendingImportDoc = null;
    closeSurface(importConfirmModal);
  }
});

exportBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  closeAllMenuDropdowns();
  exportPanel.classList.toggle('hidden');
});

exportPngBtn?.addEventListener('click', () => {
  exportPanel.classList.add('hidden');
  void exportBoardPng(getState().items);
});

exportJsonBtn?.addEventListener('click', () => {
  exportPanel.classList.add('hidden');
  void exportBoardDocument();
});

importJsonBtn?.addEventListener('click', () => {
  importFileInput.click();
});

function applyImportedBoard(data: ParsedBoardData): void {
  txn(() => {
    // 1. Items
    getState().items = data.items;
    selectedIds.clear();
    selectedConnectorId = null;

    // 2. Title
    if (data.title !== undefined) {
      getState().title = data.title;
      if (boardTitleEl) {
        boardTitleEl.innerText = data.title;
      }
    }

    // 3. Grid style
    if (data.gridStyle !== undefined) {
      applyGridStyle(data.gridStyle, true);
    }

    // 4. Rebuild DOM nodes & SVG layers
    rebuildBoard();
    updateSelectionBar();
    updateEmpty();

    // 5. Pan & Zoom Viewport
    if (data.pan && typeof data.zoom === 'number') {
      view.tx = data.pan.x;
      view.ty = data.pan.y;
      view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, data.zoom));
      applyTransform();
      getState().pan = { x: Math.round(view.tx), y: Math.round(view.ty) };
      getState().zoom = Number(view.scale.toFixed(3));
    } else if (data.items.length > 0) {
      zoomFitContent();
    } else {
      view.tx = 80;
      view.ty = 60;
      view.scale = 1;
      applyTransform();
    }

    // 6. Persist to disk
    scheduleSave();
  });
}

importFileInput?.addEventListener('change', async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    // QA-G5B A2: full-document backups (v2 wrapper with a boards array) are
    // imported through a replace-all confirmation; flat/legacy v1 files keep
    // the established replace-current-board path.
    let pre: unknown;
    try { pre = JSON.parse(text); } catch { pre = null; }
    if (
      pre &&
      typeof pre === 'object' &&
      Array.isArray((pre as { boards?: unknown }).boards)
    ) {
      requestDocumentImport(pre);
      return;
    }
    const data = parseBoardJson(text);
    applyImportedBoard(data);
  } catch (err: unknown) {
    alert('Failed to parse board JSON: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    importFileInput.value = '';
  }
});

importN8nInput?.addEventListener('change', async () => {
  const file = importN8nInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = parseBoardJson(text);
    applyImportedBoard(data);
    flashStatus(`Imported n8n workflow "${data.title || file.name}".`);
  } catch (err: unknown) {
    alert('Failed to import n8n workflow: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    importN8nInput.value = '';
  }
});

clearBoardBtn?.addEventListener('click', () => {
  openSurface(clearModal);
});
clearConfirmBtn?.addEventListener('click', () => {
  txn(() => {
    getState().items = [];
    selectedIds.clear();
    selectedConnectorId = null;
    rebuildBoard();
    scheduleSave();
  });
  closeSurface(clearModal);
  flashStatus('Canvas cleared. Press Ctrl+Z to undo.');
});
clearCancelBtn?.addEventListener('click', () => closeSurface(clearModal));
clearCloseBtn?.addEventListener('click', () => closeSurface(clearModal));

// Modal Backdrop Click to Dismiss
[templatesModal, clearModal, shortcutsModal, aboutModal, settingsPanel].forEach((m) => {
  m?.addEventListener('click', (e) => {
    if (e.target === m) {
      closeSurface(m);
    }
  });
});

// ---------- Reminder Settings Panel Wiring ----------

function curSettings(): ReminderSettings {
  const st = getState();
  return (st.settings ??= structuredClone(DEFAULT_SETTINGS));
}

const tbThemeToggle = document.getElementById('tb-theme-toggle') as HTMLButtonElement | null;
const menuThemeLabel = document.getElementById('menu-theme-label');
const viewMenuThemeLabel = document.getElementById('view-menu-theme-label');

function getSystemPreference(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

if (typeof window !== 'undefined' && window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (curSettings().theme === 'system') {
        applyTheme('system');
      }
    });
  } catch {}
}

function syncThemeControls(theme: string | undefined): void {
  const pref = theme === 'system' ? 'system' : (theme === 'light' ? 'light' : 'dark');
  const effective = pref === 'system' ? getSystemPreference() : pref;
  if (tbThemeToggle) {
    if (pref === 'system') {
      tbThemeToggle.title = `Theme: System (${effective}) - Click to toggle`;
      tbThemeToggle.setAttribute('aria-label', `Theme: System (${effective})`);
      const ico = tbThemeToggle.querySelector('.theme-icon-indicator');
      if (ico) ico.textContent = '💻';
    } else {
      const isLight = pref === 'light';
      tbThemeToggle.title = isLight ? 'Switch to Dark theme' : 'Switch to System/Light theme';
      tbThemeToggle.setAttribute('aria-label', isLight ? 'Switch to Dark theme' : 'Switch to System/Light theme');
      const ico = tbThemeToggle.querySelector('.theme-icon-indicator');
      if (ico) ico.textContent = isLight ? '🌙' : '☀️';
    }
  }
  const label = pref === 'system' ? '💻 Theme: System' : (effective === 'light' ? '🌙 Dark Canvas Theme' : '☀️ Light Canvas Theme');
  if (menuThemeLabel) menuThemeLabel.textContent = label;
  if (viewMenuThemeLabel) viewMenuThemeLabel.textContent = label;
}

/** Apply the stored UI theme. Light, Dark, and System are fully supported. */
function applyTheme(theme: string | undefined): void {
  const pref = theme === 'system' ? 'system' : (theme === 'light' ? 'light' : 'dark');
  const effective = pref === 'system' ? getSystemPreference() : pref;
  document.body.classList.toggle('light-theme', effective === 'light');
  document.body.classList.toggle('dark-theme', effective === 'dark');
  document.body.classList.toggle('system-theme', pref === 'system');
  if (setThemeSelect && setThemeSelect.value !== pref) setThemeSelect.value = pref;
  syncThemeControls(pref);
  if (window.canvasApi?.setTheme) {
    window.canvasApi.setTheme(effective);
  }
}

function markChip(rowId: string, min: number): void {
  document.querySelectorAll(`#${rowId} .chip`).forEach((c) => {
    c.classList.toggle('on', Number((c as HTMLElement).dataset.min) === min);
  });
}

function syncSettingsUI(): void {
  const s = curSettings();
  setWaterOn.checked = s.water.enabled;
  setChaiOn.checked = s.chai.enabled;
  setChaiFrom.value = s.chai.from;
  setChaiTo.value = s.chai.to;
  markChip('set-water-every', s.water.everyMin);
  markChip('set-chai-every', s.chai.everyMin);
  if (setThemeSelect) setThemeSelect.value = s.theme || 'dark';
  document.getElementById('set-water-every')?.classList.toggle('is-disabled', !s.water.enabled);
  document.getElementById('set-chai-every')?.classList.toggle('is-disabled', !s.chai.enabled);
  setChaiFrom.closest('.set-row')?.classList.toggle('is-disabled', !s.chai.enabled);
  document.getElementById('water-card-body')?.classList.toggle('is-disabled', !s.water.enabled);
  document.getElementById('chai-card-body')?.classList.toggle('is-disabled', !s.chai.enabled);
}

function saveSettings(): void {
  curSettings();
  scheduleSave();
}

settingsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = settingsPanel.classList.contains('hidden');
  closeAllDockPopovers();
  closeAllMenuDropdowns();
  if (wasHidden) {
    openSurface(settingsPanel, settingsBtn);
    syncSettingsUI();
  } else {
    closeSurface(settingsPanel);
  }
});
settingsCloseBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeSurface(settingsPanel);
});
settingsDrop?.addEventListener('pointerdown', (e) => e.stopPropagation());

const onThemeSelectChange = () => {
  const value = (setThemeSelect?.value as 'dark' | 'light' | 'system') || 'dark';
  curSettings().theme = value;
  applyTheme(value);
  saveSettings();
  flashStatus(value === 'system' ? 'System theme applied' : value === 'light' ? 'Light theme applied' : 'Dark theme applied');
};
setThemeSelect?.addEventListener('change', onThemeSelectChange);
setThemeSelect?.addEventListener('input', onThemeSelectChange);

tbThemeToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllMenuDropdowns();
  closeAllDockPopovers();
  const current = curSettings().theme || 'dark';
  const next: 'dark' | 'light' | 'system' =
    current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
  curSettings().theme = next;
  applyTheme(next);
  saveSettings();
  flashStatus(next === 'system' ? 'System theme applied' : next === 'light' ? 'Light theme applied' : 'Dark theme applied');
});

setWaterOn?.addEventListener('change', () => {
  curSettings().water.enabled = setWaterOn.checked;
  document.getElementById('set-water-every')?.classList.toggle('is-disabled', !setWaterOn.checked);
  document.getElementById('water-card-body')?.classList.toggle('is-disabled', !setWaterOn.checked);
  saveSettings();
});
setChaiOn?.addEventListener('change', () => {
  curSettings().chai.enabled = setChaiOn.checked;
  document.getElementById('set-chai-every')?.classList.toggle('is-disabled', !setChaiOn.checked);
  setChaiFrom.closest('.set-row')?.classList.toggle('is-disabled', !setChaiOn.checked);
  document.getElementById('chai-card-body')?.classList.toggle('is-disabled', !setChaiOn.checked);
  saveSettings();
});
setChaiFrom?.addEventListener('change', () => {
  curSettings().chai.from = setChaiFrom.value || DEFAULT_SETTINGS.chai.from;
  saveSettings();
});
setChaiTo?.addEventListener('change', () => {
  curSettings().chai.to = setChaiTo.value || DEFAULT_SETTINGS.chai.to;
  saveSettings();
});
for (const [rowId, kind] of [['set-water-every', 'water'], ['set-chai-every', 'chai']] as const) {
  document.getElementById(rowId)?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
    if (!chip?.dataset.min) return;
    curSettings()[kind].everyMin = Number(chip.dataset.min);
    markChip(rowId, Number(chip.dataset.min));
    saveSettings();
  });
}

// ---------- Clipboard Stash Panel Wiring ----------

function clips(): Clip[] {
  const st = getState();
  return (st.clips ??= []);
}

function renderClips(): void {
  clipList.replaceChildren();
  clipEmpty?.classList.toggle('hidden', clips().length > 0);
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
    mk('📝', 'Insert as text card', () => {
      const cPos = worldCenter();
      spawnAt = cPos;
      createItem('text', c.text);
      closeSurface(clipPanel);
    });
    mk('🗑️', 'Delete', () => {
      const st = getState();
      st.clips = clips().filter((x) => x.id !== c.id);
      scheduleSave();
      renderClips();
    });
    row.append(txt, acts);
    clipList.append(row);
  }
}

clipBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  closeAllMenuDropdowns();
  const show = clipPanel.classList.contains('hidden');
  if (show) {
    openSurface(clipPanel, clipBtn);
  } else {
    closeSurface(clipPanel);
    return;
  }
  renderClips();
  if (!clipInput.value) void window.canvasApi.readClipboard().then((t) => { if (t && !clipInput.value) clipInput.value = t; });
  clipInput.focus();
});
clipDrop?.addEventListener('pointerdown', (e) => e.stopPropagation());
clipCloseBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeSurface(clipPanel);
});

clipSave?.addEventListener('click', () => {
  const text = clipInput.value.trim();
  if (!text) return;
  clips().unshift({ id: crypto.randomUUID(), text, createdAt: Date.now() });
  clipInput.value = '';
  scheduleSave();
  renderClips();
});

clipInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
    e.preventDefault();
    clipSave?.click();
  }
});

// ---------- Templates Modal Wiring ----------

toolTemplates?.addEventListener('click', () => {
  closeAllDockPopovers();
  renderTemplatesModal();
  openSurface(templatesModal, toolTemplates);
});

toolMedia?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = mediaPopover?.classList.contains('hidden') ?? true;
  closeAllDockPopovers();
  mediaPopover?.classList.toggle('hidden', !wasHidden);
});

mediaInsertImage?.addEventListener('click', async (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  if (!window.canvasApi?.pickImage) {
    flashStatus('Image picker unavailable in this environment', true);
    return;
  }
  flashStatus('Selecting image file…');
  const imported = await window.canvasApi.pickImage();
  if (imported) {
    const rect = board.getBoundingClientRect();
    await addImage(`media:${imported.name}`, rect.left + rect.width / 2, rect.top + rect.height / 2);
    flashStatus('Image inserted ✓');
  } else {
    flashStatus('Pick cancelled');
  }
});

mediaInsertVideo?.addEventListener('click', async (e) => {
  e.stopPropagation();
  closeAllDockPopovers();
  if (!window.canvasApi?.pickVideo) {
    flashStatus('Video picker unavailable in this environment', true);
    return;
  }
  flashStatus('Selecting video file…');
  const imported = await window.canvasApi.pickVideo();
  if (imported) {
    const c = worldCenter();
    addVideo(`media:${imported.name}`, c.x, c.y);
    flashStatus('Video inserted ✓');
  } else {
    flashStatus('Pick cancelled');
  }
});

templatesCloseBtn?.addEventListener('click', () => {
  closeSurface(templatesModal);
});

templatesViewBoardsBtn?.addEventListener('click', () => {
  closeSurface(templatesModal);
  openBoardsModal();
});

function renderTemplatesModal(): void {
  templatesList.replaceChildren();
  BOARD_TEMPLATES.forEach((tpl) => {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <div class="icon">${tpl.icon}</div>
      <div class="info">
        <div class="name">${tpl.name}</div>
        <div class="desc">${tpl.description}</div>
      </div>
      ${tpl.badge ? `<div class="badge">${tpl.badge}</div>` : ''}
    `;
    card.addEventListener('click', async () => {
      closeSurface(templatesModal);
      const curItems = getState().items;
      if (curItems.length > 0 && window.canvasApi?.boardCreate) {
        // Active board has items! Create a new board so current board is preserved.
        const res = await runBoardMutation(() => window.canvasApi!.boardCreate!(tpl.name));
        if (res?.ok && res.state && res.activeBoardId) {
          applyBoardState(res.state, res.activeBoardId);
        }
      }
      txn(() => {
        getState().items = structuredClone(tpl.items);
        rebuildBoard();
        scheduleSave();
        zoomFitContent();
      });
      flashStatus(`Template "${tpl.name}" loaded into canvas.`);
    });
    templatesList.appendChild(card);
  });
}

// ---------- Link Previews & Media Import ----------

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

async function downloadImage(node: CanvasNode): Promise<void> {
  let href = node.content;
  if (node.content.startsWith('media:')) {
    const name = node.content.slice('media:'.length);
    const resolved = window.canvasApi?.imageUrl
      ? await window.canvasApi.imageUrl(name)
      : window.canvasApi?.videoUrl
        ? await window.canvasApi.videoUrl(name)
        : null;
    if (resolved) href = resolved;
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = `peepdesk-${node.id.slice(0, 8)}.png`;
  a.click();
}

const VIDEO_NAME_EXT = /\.(mp4|webm|m4v|mov)$/i;

async function addImage(content: string, cx: number, cy: number): Promise<void> {
  let probeSrc = content;
  if (content.startsWith('media:')) {
    const name = content.slice('media:'.length);
    const resolved = window.canvasApi?.imageUrl
      ? await window.canvasApi.imageUrl(name)
      : window.canvasApi?.videoUrl
        ? await window.canvasApi.videoUrl(name)
        : null;
    if (!resolved) {
      flashStatus('Image not found on disk', true);
      return;
    }
    probeSrc = resolved;
  }
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
        x: Math.round(pos.x - w / 2),
        y: Math.round(pos.y - h / 2),
        width: Math.round(w),
        height: Math.round(h),
        content,
        createdAt: Date.now()
      };
      getState().items.push(node);
      renderNode(node);
      const el = nodeByIdInWorld(node.id);
      if (el) setActive(el);
      updateEmpty();
      scheduleSave();
    });
  };
  probe.onerror = () => {
    flashStatus('Failed to load image format', true);
  };
  probe.src = probeSrc;
}

function addVideo(content: string, wx: number, wy: number): void {
  const width = 360;
  const height = 280;
  txn(() => {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type: 'video',
      x: Math.round(wx - width / 2),
      y: Math.round(wy - height / 2),
      width,
      height,
      content,
      createdAt: Date.now()
    };
    getState().items.push(node);
    renderNode(node);
    const el = nodeByIdInWorld(node.id);
    if (el) setActive(el);
    updateEmpty();
    scheduleSave();
  });
}

board.addEventListener('dragover', (e) => e.preventDefault());

board.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files ?? []);
  let offset = 0;
  files.forEach((file) => {
    if (file.type.startsWith('image/')) {
      const filePath = window.canvasApi?.pathForFile ? window.canvasApi.pathForFile(file) : '';
      if (filePath && window.canvasApi?.importImage) {
        void window.canvasApi.importImage(filePath).then((imported) => {
          if (imported) {
            void addImage(`media:${imported.name}`, e.clientX + offset * 20, e.clientY + offset * 20);
            offset++;
          }
        });
      } else {
        const reader = new FileReader();
        const i = offset++;
        reader.onload = () => void addImage(String(reader.result), e.clientX + i * 20, e.clientY + i * 20);
        reader.readAsDataURL(file);
      }
    } else if (file.type.startsWith('video/') || VIDEO_NAME_EXT.test(file.name)) {
      void window.canvasApi
        .importVideo(window.canvasApi.pathForFile(file))
        .then((imported) => {
          if (!imported) return;
          const pos = screenToWorld(e.clientX + offset * 20, e.clientY + offset * 20);
          addVideo(`media:${imported.name}`, pos.x, pos.y);
          offset++;
        });
    }
  });
});

window.addEventListener('paste', (e) => {
  if (isEditable(e.target)) return;
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
  if (text) {
    const id = youtubeId(text);
    if (id) {
      const c = worldCenter();
      addVideo(`yt:${id}`, c.x, c.y);
      return;
    }
  }
  pasteSelection();
});

// Card inputs and actions
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
        const resolveSrc = async () => {
          if (node.content.startsWith('media:')) {
            const name = node.content.slice('media:'.length);
            return window.canvasApi?.imageUrl
              ? await window.canvasApi.imageUrl(name)
              : window.canvasApi?.videoUrl
                ? await window.canvasApi.videoUrl(name)
                : null;
          }
          return node.content;
        };
        void resolveSrc().then((src) => {
          if (src) {
            void fetch(src)
              .then((r) => r.blob())
              .then((blob) => navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]))
              .catch(() => undefined);
          }
        });
      } else {
        copyText(node.type === 'link' ? (node.url ?? '') : [node.title, node.content].filter(Boolean).join('\n'));
      }
    } else if (target.closest('[data-download]')) {
      void downloadImage(node);
    } else if (target.closest('[data-color]')) {
      node.color = (target.closest('[data-color]') as HTMLElement).dataset.color!;
      nodeEl.style.setProperty('--card-color', node.color);
      scheduleSave();
    } else if (target.closest('[data-delete]')) {
      removeNodes([node.id]);
    }
  });
});

// ---------- Node Custom Events (updates & delete) ----------

board.addEventListener('node-updated', () => scheduleSave());
board.addEventListener('node-delete', (e: Event) => {
  const custom = e as CustomEvent<{ id: string }>;
  if (custom.detail?.id) removeNodes([custom.detail.id]);
});
board.addEventListener('sticky-focus-target', (e: Event) => {
  const custom = e as CustomEvent<{ id: string; target: 'title' | 'body' }>;
  if (custom.detail?.target) {
    activeTextTarget = custom.detail.target;
    updateSelectionBar();
  }
});

// Context Menu Wiring
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
  if (isEditable(e.target)) return;
  if (
    (e.target as HTMLElement).closest(
      '#peepjam-dock, .peepjam-dock, #figjam-dock, .figjam-dock, #zoom-pill, .zoom-ctl, #selection-bar, .selection-bar, #titlebar, .toolbar, .modal-backdrop, .dock-popover, .tb-panel'
    )
  ) {
    return;
  }
  e.preventDefault();
  const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
  if (!nodeEl) {
    closeCtx();
    menu.classList.add('hidden');
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
});

ctxMenu.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!btn || btn.disabled) return;
  const node = ctxNodeId ? findNode(ctxNodeId) : undefined;
  switch (btn.dataset.act) {
    case 'duplicate':
      duplicateSelected();
      break;
    case 'front':
      zOrder('front');
      break;
    case 'forward':
      zOrder(1);
      break;
    case 'backward':
      zOrder(-1);
      break;
    case 'back':
      zOrder('back');
      break;
    case 'delete':
      deleteSelection();
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

document.addEventListener('pointerdown', (e) => {
  const target = (e.target instanceof Element ? e.target : (e.target as Node)?.parentElement || document.body) as HTMLElement;
  if (!target) return;
  if (!ctxMenu.classList.contains('hidden') && !target.closest('#ctx-menu')) closeCtx();
  if (!exportPanel.classList.contains('hidden') && !target.closest('#export-drop')) {
    exportPanel.classList.add('hidden');
  }
  if (
    !settingsPanel.classList.contains('hidden') &&
    !target.closest('#settings-panel') &&
    !target.closest('#settings-drop') &&
    !target.closest('[data-menu="settings"]')
  ) {
    closeSurface(settingsPanel);
  }
  if (!clipPanel.classList.contains('hidden') && !target.closest('#clip-drop')) {
    closeSurface(clipPanel);
  }
  if (!target.closest('#desktop-menu-bar, #menu-bar-app')) {
    closeAllMenuDropdowns();
  }
  if (!selBarPalette.classList.contains('hidden') && !target.closest('#sel-color-group')) {
    selBarPalette.classList.add('hidden');
  }
  if (!selFontMenu.classList.contains('hidden') && !target.closest('#sel-font-drop')) {
    selFontMenu.classList.add('hidden');
  }
  if (selTypeMenu && !selTypeMenu.classList.contains('hidden') && !target.closest('#sel-type-drop')) {
    selTypeMenu.classList.add('hidden');
  }
  if (selRotateMenu && !selRotateMenu.classList.contains('hidden') && !target.closest('#sel-rotate-drop')) {
    selRotateMenu.classList.add('hidden');
  }
  if (!target.closest('.section-color-picker, .section-btn')) {
    document.querySelectorAll('.section-color-picker:not(.hidden)').forEach((p) => p.classList.add('hidden'));
  }
  if (!target.closest('.sticky-color-picker, .sticky-btn')) {
    document.querySelectorAll('.sticky-color-picker:not(.hidden)').forEach((p) => p.classList.add('hidden'));
  }
  if (!target.closest('.shape-color-picker, .shape-btn')) {
    document.querySelectorAll('.shape-color-picker:not(.hidden)').forEach((p) => p.classList.add('hidden'));
  }
  if (!target.closest('.peepjam-dock, .figjam-dock, .modal-backdrop, .modal-window, #settings-panel, .tb-panel')) {
    closeAllDockPopovers();
  }
});

// ---------- Boot Initialization ----------

initState().then((state) => {
  initSelectionBar();
  applyTheme(state.settings?.theme);

  const KINDS = new Set([
    'thought',
    'todo',
    'text',
    'image',
    'link',
    'video',
    'sticky',
    'shape',
    'connector',
    'drawing',
    'section',
    'stamp'
  ]);

  state.items = state.items.filter(
    (n) => !!n && typeof n.id === 'string' && KINDS.has(n.type) && Number.isFinite(n.x) && Number.isFinite(n.y)
  );

  if (state.gridStyle) {
    applyGridStyle(state.gridStyle);
  } else {
    applyGridStyle('dots');
  }

  if (state.title && boardTitleEl) {
    boardTitleEl.innerText = state.title;
  }

  world.appendChild(connectorsLayer);
  world.appendChild(drawingsLayer);
  world.appendChild(liveLayer);

  rebuildBoard();
  updateSelectionBar();

  if (state.pan && typeof state.zoom === 'number' && state.zoom >= 0.2) {
    view.tx = state.pan.x;
    view.ty = state.pan.y;
    view.scale = state.zoom;
    applyTransform();
  } else if (state.items.length > 0) {
    zoomFitContent();
  } else {
    view.tx = 80;
    view.ty = 60;
    view.scale = 1;
    applyTransform();
  }

  updateEmpty();
  updateUndoRedoUI();
  setActiveTool('select');

  // QA-G5B A2: learn the active board id for per-board history keying.
  // Boot transactions that raced ahead of the list reply stay attributed to
  // the actual boot board when the reply lands.
  void (async () => {
    const res = await fetchBoards();
    adoptBoardHistory(res?.activeBoardId ?? null);
    currentBoardsCache = res?.boards ?? [];
  })();
});

(window as any).__peepdeskTestApi = {
  getState,
  zOrder,
  duplicateSelected,
  deleteSelection,
  copySelection,
  pasteSelection,
  undo,
  redo,
  txn,
  rebuildBoard,
  scheduleSave,
  getSelectedIds: () => selectedIds,
  getSelectedConnectorId: () => selectedConnectorId,
  setSelectedConnectorId: (id: string | null) => {
    selectedConnectorId = id;
    renderConnectors();
    updateSelectionBar();
  },
  getActive: () => active,
  setActive: (val: any) => { active = val; },
  selectNode: (id: string | null) => {
    if (!id) {
      setActive(null);
    } else {
      const el = nodeByIdInWorld(id);
      setActive(el);
    }
  },
  flipConnector,
  toggleConnectorStyle,
  straightenConnector,
  setActiveTool,
  renderBoardToCanvas,
  exportBoardPng,
  parseBoardJson,
  parseBoardJsonFile,
  applyImportedBoard,
  exportBoardJson,
  getView: () => ({ ...view }),
  setView: (tx: number, ty: number, scale: number) => {
    view.tx = tx;
    view.ty = ty;
    view.scale = scale;
    applyTransform();
  },
  getCurrentGridStyle: () => currentGridStyle,
  getBoardTitle: () => (boardTitleEl ? boardTitleEl.innerText.trim() : (getState().title || '')),
  // QA-G5B A2 board hooks (suite use only)
  getActiveBoardId: (): string | null => currentBoardId,
  getBoardsCache: () => currentBoardsCache,
  switchToBoard: (id: string) => switchToBoard(id),
  applyBoardState,
  refreshBoards,
  exportBoardDocument,
  requestDocumentImport
};
