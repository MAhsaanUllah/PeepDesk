import type { CanvasNode } from '../../../shared/types.js';

export function buildStampNode(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'board-node peepjam-stamp';
  el.dataset.node = node.id;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  const w = node.width || 52;
  const h = node.height || 52;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  if (node.zIndex) el.style.zIndex = String(node.zIndex);

  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'stamp-emoji';
  emojiSpan.textContent = node.content || '⭐';
  el.appendChild(emojiSpan);

  const authorTag = document.createElement('span');
  authorTag.className = 'stamp-author';
  authorTag.textContent = node.author || 'You';
  el.appendChild(authorTag);

  const delBtn = document.createElement('button');
  delBtn.className = 'stamp-del-btn';
  delBtn.title = 'Delete stamp';
  delBtn.innerHTML = '✕';
  delBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    el.dispatchEvent(new CustomEvent('node-delete', { bubbles: true, detail: { id: node.id } }));
  });
  el.appendChild(delBtn);

  return el;
}
