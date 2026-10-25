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
  img.alt = '';
  img.draggable = false;

  if (node.content.startsWith('media:')) {
    const name = node.content.slice('media:'.length);
    img.dataset.media = name;
    const resolvePromise = window.canvasApi?.imageUrl
      ? window.canvasApi.imageUrl(name)
      : window.canvasApi?.videoUrl
        ? window.canvasApi.videoUrl(name)
        : Promise.resolve(null);
    void resolvePromise.then((url) => {
      if (url) {
        img.src = url;
      } else {
        img.alt = 'Media not found on disk';
        el.classList.add('media-missing');
      }
    });
  } else {
    img.src = node.content; // data URL or web/file path
  }

  img.onerror = () => {
    img.alt = 'Image load failed';
    el.classList.add('media-error');
  };

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
