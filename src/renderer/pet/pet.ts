import type { AlertKind, TimerAction } from '../../shared/types';
import { createFluffyStar, setStarState } from './fluffy-star.js';

declare global {
  interface Window {
    petApi: {
      toggleCanvas: () => void;
      movePet: (dx: number, dy: number) => void;
      setIgnoreMouse: (ignore: boolean) => void;
      setBubbleMode: (show: boolean) => void;
      onTimerAlert: (cb: (kind: AlertKind) => void) => void;
      timerAction: (kind: AlertKind, action: TimerAction) => void;
    };
  }
}

const sprite = document.getElementById('sprite')!;
const bubble = document.getElementById('bubble')!;
const bubbleIcon = document.getElementById('bubble-icon')!;
const bubbleText = document.getElementById('bubble-text')!;
const bubbleActions = document.querySelector<HTMLElement>('.bubble-actions')!;
const btnSnooze = document.getElementById('btn-snooze')!;
const btnDismiss = document.getElementById('btn-dismiss')!;

const star = createFluffyStar({ size: 'large' });
sprite.prepend(star);

const ALERT_TEXT: Record<AlertKind, string> = {
  water: 'Time to hydrate!',
  break: 'Chai break time!'
};

// Tiny inline icons (not the mascot) — water glass & chai cup with steam.
const ALERT_ICON: Record<AlertKind, string> = {
  water: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 3h11l-1.4 18h-8.2L6.5 3z" fill="#dbeafe" stroke="#2563eb" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.6 11h8.8l-1 10h-6.8l-1-10z" fill="#60a5fa"/></svg>',
  break: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 10h13v5.5A4.5 4.5 0 0 1 12.5 20h-4A4.5 4.5 0 0 1 4 15.5V10z" fill="#fde68a" stroke="#b45309" stroke-width="1.6"/><path d="M17 11.5h1.8a2.4 2.4 0 0 1 0 4.8H17" fill="none" stroke="#b45309" stroke-width="1.6"/><path d="M8.5 7.5c0-1.6 1-1.6 1-3.2M12.5 7.5c0-1.6 1-1.6 1-3.2" fill="none" stroke="#92400e" stroke-width="1.4" stroke-linecap="round"/></svg>'
};

let activeAlert: AlertKind | null = null;
let dragOrigin: { x: number; y: number } | null = null;
let moved = false;
let currentIgnoreState: boolean | null = null;

function updateIgnoreMouse(ignore: boolean): void {
  // Never ignore while actively dragging the pet
  if (dragOrigin !== null && ignore) return;
  if (currentIgnoreState === ignore) return;
  currentIgnoreState = ignore;
  window.petApi.setIgnoreMouse(ignore);
}

function isInteractivePoint(e: MouseEvent | PointerEvent): boolean {
  if (isBubbleShowing()) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('#bubble:not(.hidden)')) return true;
  }

  // Tight organic contour around the star mascot (42px radius from center of star)
  const spriteRect = sprite.getBoundingClientRect();
  const centerX = spriteRect.left + spriteRect.width / 2;
  const centerY = spriteRect.top + spriteRect.height / 2;
  const radius = spriteRect.width / 2;
  const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

  return dist <= radius;
}

// OS mouse event forwarding: pass through clicks on transparent empty areas
window.addEventListener('pointermove', (e) => {
  const isInteractive = isInteractivePoint(e);
  updateIgnoreMouse(!isInteractive);
});

window.addEventListener('pointerleave', () => {
  if (dragOrigin === null) {
    updateIgnoreMouse(true);
  }
});

// Manual drag and click attached ONLY to the star mascot contour
sprite.addEventListener('pointerdown', (e) => {
  if (!isInteractivePoint(e) && !isBubbleShowing()) {
    updateIgnoreMouse(true);
    return;
  }
  updateIgnoreMouse(false);
  dragOrigin = { x: e.screenX, y: e.screenY };
  moved = false;
  sprite.setPointerCapture(e.pointerId);
});

sprite.addEventListener('pointermove', (e) => {
  if (!dragOrigin) return;
  const dx = e.screenX - dragOrigin.x;
  const dy = e.screenY - dragOrigin.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    moved = true;
    window.petApi.movePet(dx, dy);
    dragOrigin = { x: e.screenX, y: e.screenY };
  }
});

sprite.addEventListener('pointerup', (e) => {
  try {
    sprite.releasePointerCapture(e.pointerId);
  } catch {
    // ignore
  }
  const wasClick = dragOrigin !== null && !moved;
  dragOrigin = null;
  if (wasClick && !isBubbleShowing()) {
    window.petApi.toggleCanvas();
  }
  updateIgnoreMouse(!isInteractivePoint(e));
});

sprite.addEventListener('pointercancel', () => {
  dragOrigin = null;
  moved = false;
  updateIgnoreMouse(true);
});

function isBubbleShowing(): boolean {
  return !bubble.classList.contains('hidden');
}

function showAlert(kind: AlertKind): void {
  activeAlert = kind;
  window.petApi.setBubbleMode(true);
  bubbleIcon.innerHTML = ALERT_ICON[kind];
  bubbleText.textContent = ALERT_TEXT[kind];
  bubbleActions.style.display = '';
  bubble.classList.remove('hidden');
  sprite.classList.add('alert', kind === 'water' ? 'state-water' : 'state-break');
  setStarState(star, kind === 'water' ? 'focus' : 'sleepy');
}

function hideAlert(): void {
  activeAlert = null;
  bubbleIcon.innerHTML = '';
  bubble.classList.add('hidden');
  window.petApi.setBubbleMode(false);
  sprite.classList.remove('alert', 'state-water', 'state-break');
  setStarState(star, 'success');
  window.setTimeout(() => {
    if (!sprite.classList.contains('alert')) setStarState(star, 'idle');
  }, 900);
  updateIgnoreMouse(true);
}

btnSnooze.addEventListener('click', () => {
  if (activeAlert) window.petApi.timerAction(activeAlert, 'snooze');
  hideAlert();
});

btnDismiss.addEventListener('click', () => {
  if (activeAlert) window.petApi.timerAction(activeAlert, 'dismiss');
  hideAlert();
});

window.petApi.onTimerAlert(showAlert);

// Startup greeting: compact 96x96 idle mode by default, greeting auto-hides and shrinks window
bubbleIcon.innerHTML = '';
bubbleText.textContent = "Hi! I'm PeepJam! 👋";
bubbleActions.style.display = 'none';
window.petApi.setBubbleMode(true);
bubble.classList.remove('hidden');
window.setTimeout(() => {
  if (!activeAlert && bubbleText.textContent.startsWith('Hi!')) {
    bubble.classList.add('hidden');
    window.petApi.setBubbleMode(false);
    updateIgnoreMouse(true);
  }
}, 3500);
