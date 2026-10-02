export type IconName = 'copy' | 'download' | 'open' | 'trash';

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS: Record<IconName, string> = {
  copy: `<svg viewBox="0 0 16 16" ${STROKE}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5v4A1.5 1.5 0 0 0 5 9"/></svg>`,
  download: `<svg viewBox="0 0 16 16" ${STROKE}><path d="M8 2v8m0 0 3-3m-3 3L5 7"/><path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11"/></svg>`,
  open: `<svg viewBox="0 0 16 16" ${STROKE}><path d="M9.5 2.5h4v4M13.5 2.5 7 9"/><path d="M12 9.5v3A1.5 1.5 0 0 1 10.5 14h-7A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4h3"/></svg>`,
  trash: `<svg viewBox="0 0 16 16" ${STROKE}><path d="M2.5 4h11M6.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4"/><path d="M4 4l.7 9.1a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L12 4"/><path d="M6.5 7.5v4M9.5 7.5v4"/></svg>`
};

/** Utility icon button; `action` becomes the data-* attribute canvas.ts routes on. */
export function utilBtn(icon: IconName, action: 'delete' | 'copy' | 'download' | 'open-link' | 'open-video', tooltip: string): string {
  return `<button class="util-btn" data-${action} title="${tooltip}">${ICONS[icon]}</button>`;
}

export function copyText(text: string): void {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => legacyCopy(text));
}

function legacyCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.append(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // clipboard unavailable — fail-silent
  }
  ta.remove();
}
