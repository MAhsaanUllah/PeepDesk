import type { AlertKind, TimerAction } from '../../shared/types';
import { createFluffyStar, setStarState } from './fluffy-star.js';

declare global {
  interface Window {
    petApi: {
      toggleCanvas: () => void;
      movePet: (dx: number, dy: number) => void;
      onTimerAlert: (cb: (kind: AlertKind) => void) => void;
      timerAction: (kind: AlertKind, action: TimerAction) => void;
    };
  }
}

const pet = document.getElementById('pet')!;
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

// Manual drag (window:move-pet) so plain left-click still toggles the canvas.
// -webkit-app-region: drag would swallow click events.
pet.addEventListener('pointerdown', (e) => {
  dragOrigin = { x: e.screenX, y: e.screenY };
  moved = false;
  pet.setPointerCapture(e.pointerId);
});

pet.addEventListener('pointermove', (e) => {
  if (!dragOrigin) return;
  const dx = e.screenX - dragOrigin.x;
  const dy = e.screenY - dragOrigin.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    moved = true;
    window.petApi.movePet(dx, dy);
    dragOrigin = { x: e.screenX, y: e.screenY };
  }
});

pet.addEventListener('pointerup', () => {
  const wasClick = dragOrigin !== null && !moved;
  dragOrigin = null;
  if (wasClick && !isBubbleShowing()) window.petApi.toggleCanvas();
});

function isBubbleShowing(): boolean {
  return !bubble.classList.contains('hidden');
}

function showAlert(kind: AlertKind): void {
  activeAlert = kind;
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
  sprite.classList.remove('alert', 'state-water', 'state-break');
  setStarState(star, 'success');
  window.setTimeout(() => {
    if (!sprite.classList.contains('alert')) setStarState(star, 'idle');
  }, 900);
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

// Startup greeting; auto-hides unless a real alert replaced it in the meantime.
bubbleIcon.innerHTML = '';
bubbleText.textContent = "Hi! I'm PeepDesk 👋";
bubbleActions.style.display = 'none';
bubble.classList.remove('hidden');
window.setTimeout(() => {
  if (!activeAlert && bubbleText.textContent.startsWith('Hi!')) bubble.classList.add('hidden');
}, 6000);
