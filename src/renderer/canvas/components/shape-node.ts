import type { CanvasNode, ShapeType } from '../../../shared/types.js';
import { PEEPJAM_PASTELS, type PastelColor } from './peepjam-constants.js';

export interface ShapeColorOption {
  name: string;
  bg: string;
  border: string;
  text: string;
}

export const SHAPE_PASTEL_COLORS: ShapeColorOption[] = [
  ...PEEPJAM_PASTELS,
  { name: 'Dark', bg: 'rgba(30, 31, 29, 0.92)', border: '#9747FF', text: '#F4F3EE' },
  { name: 'Transparent', bg: 'transparent', border: '#9747FF', text: '#F4F3EE' }
];

export function applyShapeColor(
  el: HTMLElement,
  node: CanvasNode,
  color: ShapeColorOption | PastelColor | { bg: string; border?: string; text?: string } | string
): void {
  if (typeof color === 'string') {
    const match = SHAPE_PASTEL_COLORS.find(
      (c) => c.bg.toLowerCase() === color.toLowerCase() || c.name.toLowerCase() === color.toLowerCase()
    );
    if (match) {
      node.fillColor = match.bg;
      node.strokeColor = match.border;
      node.textColor = match.text;
      node.color = match.bg;
    } else {
      node.fillColor = color;
      node.color = color;
    }
  } else {
    node.fillColor = color.bg;
    if (color.border) node.strokeColor = color.border;
    if (color.text) node.textColor = color.text;
    node.color = color.bg;
  }
  updateShapeSvg(el, node);
}

export function buildShapeSvg(type: ShapeType, w: number, h: number, fill: string, stroke: string, strokeWidth: number): string {
  const pad = strokeWidth;
  const pw = Math.max(10, w - pad * 2);
  const ph = Math.max(10, h - pad * 2);

  switch (type) {
    case 'circle': {
      const cx = w / 2;
      const cy = h / 2;
      const rx = pw / 2;
      const ry = ph / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    case 'diamond': {
      const p1 = `${w / 2},${pad}`;
      const p2 = `${w - pad},${h / 2}`;
      const p3 = `${w / 2},${h - pad}`;
      const p4 = `${pad},${h / 2}`;
      return `<polygon points="${p1} ${p2} ${p3} ${p4}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
    }
    case 'triangle': {
      const p1 = `${w / 2},${pad}`;
      const p2 = `${w - pad},${h - pad}`;
      const p3 = `${pad},${h - pad}`;
      return `<polygon points="${p1} ${p2} ${p3}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
    }
    case 'rectangle': {
      return `<rect x="${pad}" y="${pad}" width="${pw}" height="${ph}" rx="0" ry="0" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    case 'rounded-rect':
    default: {
      return `<rect x="${pad}" y="${pad}" width="${pw}" height="${ph}" rx="14" ry="14" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
  }
}

export function buildShapeNode(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'board-node peepjam-shape';
  el.dataset.node = node.id;
  el.dataset.type = 'shape';
  const shapeType: ShapeType = node.shapeType || 'rounded-rect';
  el.dataset.shape = shapeType;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  const w = node.width || 160;
  const h = node.height || 100;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  if (node.zIndex) el.style.zIndex = String(node.zIndex);

  const rot = typeof node.rotation === 'number' ? node.rotation : 0;
  el.style.transform = `rotate(${rot}deg)`;

  const fillColor = node.fillColor || (node.color ? node.color : 'rgba(30, 31, 29, 0.90)');
  const strokeColor = node.strokeColor || '#9747FF';
  const strokeWidth = node.strokeWidth || 2;
  const isLightFill = fillColor !== 'transparent' && !fillColor.startsWith('rgba(30') && !fillColor.startsWith('#18');
  const textColor = node.textColor || (isLightFill ? '#181917' : '#F4F3EE');

  // SVG representation
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'shape-svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.innerHTML = buildShapeSvg(shapeType, w, h, fillColor, strokeColor, strokeWidth);
  el.appendChild(svg);

  // Centered label editor
  const textDiv = document.createElement('div');
  textDiv.className = 'shape-text';
  textDiv.contentEditable = 'true';
  textDiv.spellcheck = false;
  textDiv.style.color = textColor;
  textDiv.innerText = node.content || '';
  if (node.fontSize) textDiv.style.fontSize = `${node.fontSize}px`;
  el.appendChild(textDiv);

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'node-resize';
  resizeHandle.title = 'Drag to resize';
  el.appendChild(resizeHandle);

  // Rotate handle
  const rotateHandle = document.createElement('div');
  rotateHandle.className = 'node-rotate';
  rotateHandle.dataset.rotate = 'true';
  rotateHandle.title = 'Drag to rotate (Hold Shift to snap to 15°)';
  el.appendChild(rotateHandle);

  // Floating hover bar
  const hoverBar = document.createElement('div');
  hoverBar.className = 'shape-hover-bar';

  // Color picker toggle
  const colorBtn = document.createElement('button');
  colorBtn.className = 'shape-btn';
  colorBtn.title = 'Fill & border color';
  colorBtn.innerHTML = '🎨';
  hoverBar.appendChild(colorBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'shape-btn';
  delBtn.title = 'Delete shape';
  delBtn.innerHTML = '✕';
  hoverBar.appendChild(delBtn);

  el.appendChild(hoverBar);

  // Color picker popover with pastel fill colors
  const picker = document.createElement('div');
  picker.className = 'shape-color-picker hidden';
  SHAPE_PASTEL_COLORS.forEach((c) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.style.backgroundColor = c.bg === 'transparent' ? '#27272A' : c.bg;
    dot.style.borderColor = c.border;
    dot.title = `${c.name} fill`;
    if (c.bg === 'transparent') {
      dot.innerHTML = '<span style="font-size:10px;line-height:1;color:#A1A1AA">∅</span>';
      dot.style.display = 'inline-flex';
      dot.style.alignItems = 'center';
      dot.style.justifyContent = 'center';
    }
    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      applyShapeColor(el, node, c);
      picker.classList.add('hidden');
      el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
    });
    picker.appendChild(dot);
  });
  el.appendChild(picker);

  colorBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    picker.classList.toggle('hidden');
  });

  delBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    el.dispatchEvent(new CustomEvent('node-delete', { bubbles: true, detail: { id: node.id } }));
  });

  textDiv.addEventListener('input', () => {
    node.content = textDiv.innerText;
    el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
  });

  return el;
}

export function updateShapeSvg(el: HTMLElement, node: CanvasNode): void {
  const rot = typeof node.rotation === 'number' ? node.rotation : 0;
  el.style.transform = `rotate(${rot}deg)`;

  const svg = el.querySelector<SVGSVGElement>('.shape-svg');
  if (!svg) return;
  const w = parseFloat(el.style.width) || node.width || 160;
  const h = parseFloat(el.style.height) || node.height || 100;
  const shapeType: ShapeType = node.shapeType || 'rounded-rect';
  const fillColor = node.fillColor || (node.color ? node.color : 'rgba(30, 31, 29, 0.90)');
  const strokeColor = node.strokeColor || '#9747FF';
  const strokeWidth = node.strokeWidth || 2;
  svg.innerHTML = buildShapeSvg(shapeType, w, h, fillColor, strokeColor, strokeWidth);

  const textDiv = el.querySelector<HTMLElement>('.shape-text');
  if (textDiv) {
    if (node.textColor) {
      textDiv.style.color = node.textColor;
    } else if (fillColor !== 'transparent' && !fillColor.startsWith('rgba(30') && !fillColor.startsWith('#18')) {
      textDiv.style.color = '#181917';
    } else {
      textDiv.style.color = '#F4F3EE';
    }
  }
}

