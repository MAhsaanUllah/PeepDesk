import type { CanvasNode } from '../../../shared/types.js';
import { utilBtn } from './util-btn.js';

export function youtubeId(raw: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(raw);
  return m?.[1] ?? null;
}

function showVideoFallback(holder: HTMLElement, el: HTMLElement, msg: string): void {
  el.classList.add('media-missing');
  holder.replaceChildren();
  const banner = document.createElement('div');
  banner.className = 'media-fallback-banner';
  banner.innerHTML = `<span class="fallback-icon">⚠️</span><span class="fallback-msg">${msg}</span>`;
  holder.appendChild(banner);
}

function resolveMediaSrc(node: CanvasNode, holder: HTMLElement, media: HTMLVideoElement, el: HTMLElement): void {
  const name = node.content.slice('media:'.length);
  media.dataset.media = name;
  if (window.canvasApi?.videoUrl) {
    void window.canvasApi
      .videoUrl(name)
      .then((url) => {
        if (url) {
          media.src = url;
        } else {
          showVideoFallback(holder, el, 'Video not found on disk');
        }
      })
      .catch(() => {
        showVideoFallback(holder, el, 'Failed to resolve video');
      });
  } else {
    showVideoFallback(holder, el, 'Video API unavailable');
  }
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
    video.onerror = () => {
      el.classList.add('media-error');
      showVideoFallback(holder, el, 'Corrupt or unplayable video');
    };
    resolveMediaSrc(node, holder, video, el);
    holder.appendChild(video);
  } else {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.onerror = () => {
      el.classList.add('media-error');
      showVideoFallback(holder, el, 'Corrupt or unplayable video');
    };
    video.src = node.content;
    holder.appendChild(video);
  }

  const grip = document.createElement('div');
  grip.className = 'node-resize light';
  grip.dataset.resize = '';

  el.append(head, holder, grip);
  return el;
}
