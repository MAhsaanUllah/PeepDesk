import type { CanvasNode } from '../../../shared/types.js';
import { utilBtn } from './util-btn.js';

export function youtubeId(raw: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(raw);
  return m?.[1] ?? null;
}

function resolveMediaSrc(node: CanvasNode, media: HTMLVideoElement): void {
  const name = node.content.slice('media:'.length);
  media.dataset.media = name;
  void window.canvasApi.videoUrl(name).then((url) => {
    if (url) media.src = url;
  });
}

export function buildVideoNode(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'node video';
  el.dataset.node = node.id;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width}px`;
  el.style.height = `${node.height}px`;

  const head = document.createElement('div');
  head.className = 'node-head';
  head.innerHTML = `<span class="node-kind">🎥 video</span>
    ${utilBtn('open', 'open-video', 'Open in default player')}
    ${utilBtn('trash', 'delete', 'Delete')}`;

  const holder = document.createElement('div');
  holder.className = 'video-media';

  if (node.content.startsWith('yt:')) {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube.com/embed/${encodeURIComponent(node.content.slice(3))}?rel=0`;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.setAttribute('allowfullscreen', '');
    holder.appendChild(frame);
  } else if (node.content.startsWith('media:')) {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    resolveMediaSrc(node, video);
    holder.appendChild(video);
  } else {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.src = node.content;
    holder.appendChild(video);
  }

  const grip = document.createElement('div');
  grip.className = 'node-resize light';
  grip.dataset.resize = '';

  el.append(head, holder, grip);
  return el;
}
