import type { CanvasNode } from '../../../shared/types.js';
import { utilBtn } from './util-btn.js';

export const PASTELS = ['#eff6ff', '#fefce8', '#fdf2f8', '#f5f3ff'] as const;

export const FONTS = [
  { label: 'Default', value: 'system-ui, sans-serif' },
  { label: 'Inter', value: '"Inter", system-ui, sans-serif' },
  { label: 'Roboto', value: '"Roboto", system-ui, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", system-ui, sans-serif' },
  { label: 'Lato', value: '"Lato", system-ui, sans-serif' },
  { label: 'Montserrat', value: '"Montserrat", system-ui, sans-serif' },
  { label: 'Poppins', value: '"Poppins", system-ui, sans-serif' },
  { label: 'Playfair', value: '"Playfair Display", Georgia, serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"Courier New", Consolas, monospace' }
] as const;

export const FONT_SIZES = [8, 10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72] as const;

export const DEFAULT_FONT_SIZE = 14;

export const TEXT_COLORS = [
  '#344054', '#667085', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea', '#ffffff'
] as const;

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'SPAN', 'BR', 'P', 'DIV', 'MARK']);

/** Strip everything except inline formatting + style attrs (execCommand output). */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  root
    .querySelectorAll('script,style,iframe,object,embed,form,input,textarea,select,button,svg,link,meta,base,a')
    .forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((n) => {
    if (!ALLOWED_TAGS.has(n.tagName)) {
      n.replaceWith(...Array.from(n.childNodes));
    } else {
      for (const a of Array.from(n.attributes)) if (a.name.toLowerCase() !== 'style') n.removeAttribute(a.name);
    }
  });
  return root.innerHTML;
}

function setRich(el: HTMLElement, value: string): void {
  if (/<[a-z/!]/i.test(value)) el.innerHTML = sanitizeHtml(value);
  else el.textContent = value;
}

const KIND_LABEL: Record<string, string> = {
  thought: '💡 thought',
  todo: '✓ to-do',
  link: '🔗 link'
};

export function applyFont(el: HTMLElement, node: CanvasNode): void {
  el.style.fontSize = `${node.fontSize ?? DEFAULT_FONT_SIZE}px`;
  el.style.fontFamily = node.fontFamily ?? FONTS[0].value;
}

export function faviconUrl(rawUrl: string): string | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return null;
  }
}

function hostInfo(raw: string | undefined): { host: string; url: string } | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return { host: u.hostname.replace(/^www\./, ''), url: raw.trim() };
  } catch {
    return null;
  }
}

export function renderLinkPreview(box: HTMLElement, node: CanvasNode): void {
  const p = node.preview;
  box.replaceChildren();
  if (!p) {
    // Scraping failed or the site bot-blocks (e.g. LinkedIn 999): show a fallback chip.
    const host = hostInfo(node.url);
    box.classList.toggle('hidden', !host);
    if (!host) return;
    const parts: HTMLElement[] = [];
    const fav = faviconUrl(host.url);
    if (fav) {
      const img = document.createElement('img');
      img.className = 'lp-img';
      img.src = fav;
      img.addEventListener('error', () => img.remove());
      parts.push(img);
    }
    const text = document.createElement('div');
    text.className = 'lp-text';
    const title = document.createElement('div');
    title.className = 'lp-title';
    title.textContent = host.host;
    const desc = document.createElement('div');
    desc.className = 'lp-desc';
    desc.textContent = host.url;
    text.append(title, desc);
    parts.push(text);
    box.append(...parts);
    return;
  }
  box.classList.remove('hidden');

  if (p.image) {
    const img = document.createElement('img');
    img.className = 'lp-img';
    img.src = p.image;
    img.addEventListener('error', () => img.remove());
    box.appendChild(img);
  }
  const text = document.createElement('div');
  text.className = 'lp-text';
  const title = document.createElement('div');
  title.className = 'lp-title';
  title.textContent = p.title ?? p.siteName;
  text.appendChild(title);
  if (p.description) {
    const desc = document.createElement('div');
    desc.className = 'lp-desc';
    desc.textContent = p.description;
    text.appendChild(desc);
  }
  const site = document.createElement('div');
  site.className = 'lp-site';
  site.textContent = p.siteName;
  text.appendChild(site);
  box.appendChild(text);
}

function editable(prop: 'content' | 'title', value: string, placeholder: string, rich = false): HTMLElement {
  const el = document.createElement(prop === 'title' ? 'div' : 'span');
  el.className = prop === 'title' ? 'card-title' : 'node-text';
  el.contentEditable = rich ? 'true' : 'plaintext-only';
  el.dataset.prop = prop;
  el.dataset.ph = placeholder;
  if (rich) {
    el.dataset.rich = '';
    setRich(el, value);
  } else {
    el.textContent = value;
  }
  return el;
}

export function buildCard(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = `node card ${node.type}`;
  el.dataset.node = node.id;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width}px`;
  el.style.height = `${node.height}px`;
  el.style.setProperty('--card-color', node.color ?? PASTELS[0]);
  applyFont(el, node);

  const head = document.createElement('div');
  head.className = 'node-head';
  if (node.type === 'text') {
    // Wide invisible-until-hover drag strip; the body is contenteditable so text itself can't drag the card.
    head.innerHTML = `<span class="text-grip" aria-hidden="true">⋮⋮ drag</span>${utilBtn('trash', 'delete', 'Delete')}`;
  } else {
    const swatches = PASTELS.map(
      (c) => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="Change card color" title="Change card color"></button>`
    ).join('');
    head.innerHTML = `<span class="node-kind">${KIND_LABEL[node.type]}</span>
      <span class="swatches">${swatches}</span>
      ${utilBtn('copy', 'copy', 'Copy to clipboard')}
      ${utilBtn('trash', 'delete', 'Delete')}`;
  }

  const title = node.type === 'text' ? null : editable('title', node.title ?? '', 'Title');

  const body = document.createElement('div');
  body.className = 'node-body';
  if (node.type === 'todo') {
    const done = node.status === 'done';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.dataset.toggle = '';
    check.checked = done;
    body.append(check, editable('content', node.content, 'Task…'));
    el.classList.toggle('done', done);
  } else if (node.type === 'link') {
    const row = document.createElement('div');
    row.className = 'link-row';
    const fav = document.createElement('img');
    fav.className = 'link-favicon';
    const src = node.url ? faviconUrl(node.url) : null;
    if (src) fav.src = src;
    fav.hidden = !src;
    fav.addEventListener('error', () => (fav.hidden = true));
    const url = document.createElement('input');
    url.className = 'node-url';
    url.placeholder = 'https://…';
    url.value = node.url ?? '';
    url.dataset.prop = 'url';
    const open = document.createElement('button');
    open.className = 'link-open';
    open.dataset.openLink = '';
    open.textContent = 'Open ↗';
    row.append(fav, url, open);
    const previewBox = document.createElement('div');
    previewBox.className = 'link-preview';
    previewBox.dataset.openLink = '';
    previewBox.title = 'Open link';
    renderLinkPreview(previewBox, node);
    body.append(row, previewBox);
  } else {
    body.append(editable('content', node.content, node.type === 'text' ? 'Type…' : 'Note…', true));
  }

  const grip = document.createElement('div');
  grip.className = 'node-resize';
  grip.dataset.resize = '';

  el.append(head, ...(title ? [title] : []), body, grip);
  return el;
}
