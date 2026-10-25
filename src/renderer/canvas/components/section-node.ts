import type { CanvasNode } from '../../../shared/types.js';
import { PEEPJAM_SECTION_COLORS } from './peepjam-constants.js';

export function applySectionColor(el: HTMLElement, node: CanvasNode, colorValue: string): void {
  const pastelMap: Record<string, string> = {
    '#FFF385': 'Yellow',
    '#85E0A3': 'Green',
    '#8CE8FF': 'Blue',
    '#FFC7C7': 'Coral',
    '#D3B5FF': 'Purple',
    '#FFD29D': 'Coral',
    '#F6F6F4': 'Slate'
  };

  const name = pastelMap[colorValue] || colorValue;
  const match = PEEPJAM_SECTION_COLORS.find(
    (c) => c.bg === colorValue || c.name.toLowerCase() === name.toLowerCase()
  ) || PEEPJAM_SECTION_COLORS[0];

  node.color = match.bg;
  el.style.backgroundColor = match.bg;
  el.style.borderColor = match.border;

  const header = el.querySelector<HTMLElement>('.section-header');
  if (header) header.style.borderBottomColor = match.border;

  const titleInput = el.querySelector<HTMLInputElement>('.section-title-input');
  if (titleInput) titleInput.style.color = match.title;
}

export function buildSectionNode(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'board-node peepjam-section';
  el.dataset.node = node.id;
  el.dataset.type = 'section';
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  const w = node.width || 420;
  const h = node.height || 320;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  if (node.zIndex) el.style.zIndex = String(node.zIndex);

  const matched = PEEPJAM_SECTION_COLORS.find((c) => c.bg === node.color) || PEEPJAM_SECTION_COLORS[0];
  const bg = node.color || matched.bg;
  const border = matched.border;
  const titleColor = matched.title;

  el.style.backgroundColor = bg;
  el.style.borderColor = border;

  // Header bar
  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.borderBottomColor = border;

  const titleInput = document.createElement('input');
  titleInput.className = 'section-title-input';
  titleInput.type = 'text';
  titleInput.value = node.title || 'Untitled Section';
  titleInput.style.color = titleColor;
  header.appendChild(titleInput);

  const actions = document.createElement('div');
  actions.className = 'section-actions';

  const paletteBtn = document.createElement('button');
  paletteBtn.className = 'section-btn';
  paletteBtn.title = 'Change section color';
  paletteBtn.innerHTML = '🎨';
  actions.appendChild(paletteBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'section-btn';
  delBtn.title = 'Delete section';
  delBtn.innerHTML = '✕';
  actions.appendChild(delBtn);

  header.appendChild(actions);
  el.appendChild(header);

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'node-resize';
  resizeHandle.title = 'Drag to resize section';
  el.appendChild(resizeHandle);

  // Color picker popover
  const picker = document.createElement('div');
  picker.className = 'section-color-picker hidden';
  PEEPJAM_SECTION_COLORS.forEach((c) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.style.backgroundColor = c.title;
    dot.style.borderColor = c.border;
    dot.title = c.name;
    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      applySectionColor(el, node, c.bg);
      picker.classList.add('hidden');
      el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
    });
    picker.appendChild(dot);
  });
  el.appendChild(picker);

  paletteBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    picker.classList.toggle('hidden');
  });

  delBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    el.dispatchEvent(new CustomEvent('node-delete', { bubbles: true, detail: { id: node.id } }));
  });

  titleInput.addEventListener('input', () => {
    node.title = titleInput.value;
    el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
  });

  return el;
}
