import type { CanvasNode } from '../../../shared/types.js';
import { utilBtn } from './util-btn.js';

export function buildImageNode(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'node image';
  el.dataset.node = node.id;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width}px`;
  el.style.height = `${node.height}px`;

  const img = document.createElement('img');
  img.src = node.content; // data URL or file path
  img.alt = '';
  img.draggable = false;

  const controls = document.createElement('div');
  controls.className = 'img-controls';
  controls.innerHTML =
    utilBtn('download', 'download', 'Save image') +
    utilBtn('copy', 'copy', 'Copy image') +
    utilBtn('trash', 'delete', 'Delete');

  const grip = document.createElement('div');
  grip.className = 'node-resize light';
  grip.dataset.resize = '';

  el.append(img, controls, grip);
  return el;
}
