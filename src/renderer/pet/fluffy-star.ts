export type StarState =
  | 'idle'
  | 'focus'
  | 'happy'
  | 'success'
  | 'thinking'
  | 'sleepy'
  | 'sad'
  | 'break';

export type StarSize = 'tiny' | 'small' | 'medium' | 'large' | 'hero';

const SIZE_PX: Record<StarSize, number> = { tiny: 24, small: 40, medium: 64, large: 88, hero: 128 };

// Asset base is relative to the renderer HTML documents (src/renderer/pet|canvas/),
// both at the same depth.
const ASSET_BASE = '../../../assets/mascot/fluffy-star/';
const STATE_ASSET: Partial<Record<StarState, string>> = {
  focus: 'focus',
  happy: 'happy',
  success: 'success',
  sleepy: 'sleepy'
};

function srcFor(state: StarState): string {
  return `${ASSET_BASE}${STATE_ASSET[state] ?? 'idle'}.webp`;
}

export type FluffyStarOptions = {
  state?: StarState;
  size?: StarSize;
  animated?: boolean;
  className?: string;
};

export function createFluffyStar(opts: FluffyStarOptions = {}): HTMLElement {
  const state = opts.state ?? 'idle';
  const size = opts.size ?? 'medium';
  const el = document.createElement('div');
  el.className = 'fluffy-star' + (opts.className ? ` ${opts.className}` : '');
  el.dataset.state = state;
  el.dataset.size = size;
  if (opts.animated === false) el.dataset.animated = 'false';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Fluffy Star plush mascot');
  el.style.setProperty('--fs-px', `${SIZE_PX[size]}px`);
  el.innerHTML = `<div class="fs-anim"><img class="fs-img" src="${srcFor(state)}" alt="" draggable="false" /></div>`;
  el.addEventListener('pointerdown', () => setStarAnim(el, 'fs-tap'));
  el.querySelector('.fs-anim')!.addEventListener('animationend', () => {
    const anim = el.querySelector('.fs-anim')!;
    if (anim.classList.contains('fs-tap') || anim.classList.contains('fs-bounce')) {
      anim.classList.remove('fs-tap', 'fs-bounce');
    }
  });
  return el;
}

export function setStarState(el: HTMLElement, state: StarState): void {
  el.dataset.state = state;
  const img = el.querySelector<HTMLImageElement>('.fs-img')!;
  const src = srcFor(state);
  if (img.getAttribute('src') !== src) img.src = src;
  if (state === 'success') setStarAnim(el, 'fs-bounce');
}

function setStarAnim(el: HTMLElement, cls: string): void {
  if (el.dataset.animated === 'false') return;
  const anim = el.querySelector<HTMLElement>('.fs-anim')!;
  anim.classList.remove('fs-tap', 'fs-bounce');
  void anim.offsetWidth; // restart the one-shot animation
  anim.classList.add(cls);
}
