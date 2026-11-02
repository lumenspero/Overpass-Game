import { SPEED_OPTIONS, type Speed } from '@overpass-game/sim';

/**
 * Pause, speed and settings buttons for mouse and touch. The keys do the same: P pauses, and 1 to 4
 * pick a speed. The bar only touches the DOM when its state changes, so it is cheap to sync every frame.
 */

export interface SpeedBarHandlers {
  onPause(): void;
  onSpeed(speed: Speed): void;
  onSettings(): void;
}

export interface SpeedBar {
  /** Shows the pause state and the speed. `enabled` false disables pause and speed (the game is over). */
  sync(paused: boolean, speed: Speed, enabled: boolean): void;
  destroy(): void;
}

const BUTTON_CSS =
  'min-width:44px;min-height:44px;margin:0 3px;font:14px sans-serif;' +
  'background:rgba(20,24,30,0.92);color:#eee;border:1px solid #3a4150;border-radius:6px;cursor:pointer';

const ACTIVE_BORDER = '#f2c46d';
const IDLE_BORDER = '#3a4150';

export function createSpeedBar(handlers: SpeedBarHandlers): SpeedBar {
  const root = document.createElement('div');
  root.id = 'speed-bar';
  root.style.cssText =
    'position:fixed;left:12px;bottom:12px;display:flex;align-items:center;z-index:6';

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.style.cssText = BUTTON_CSS;
  pause.addEventListener('click', () => {
    handlers.onPause();
    // Blur so a later Space press pans the view instead of pressing this button.
    pause.blur();
  });
  root.append(pause);

  const speeds = new Map<Speed, HTMLButtonElement>();
  for (const s of SPEED_OPTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${s}×`;
    b.style.cssText = BUTTON_CSS;
    b.addEventListener('click', () => {
      handlers.onSpeed(s);
      b.blur();
    });
    speeds.set(s, b);
    root.append(b);
  }

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Settings';
  settings.style.cssText = BUTTON_CSS;
  settings.addEventListener('click', () => {
    handlers.onSettings();
    settings.blur();
  });
  root.append(settings);

  document.body.append(root);

  let last = '';
  return {
    sync(paused, speed, enabled) {
      const key = `${paused}|${speed}|${enabled}`;
      if (key === last) return;
      last = key;
      pause.textContent = paused ? 'Play' : 'Pause';
      pause.disabled = !enabled;
      for (const [s, b] of speeds) {
        const active = s === speed;
        b.disabled = !enabled;
        b.setAttribute('aria-pressed', String(active));
        b.style.borderColor = active ? ACTIVE_BORDER : IDLE_BORDER;
      }
    },
    destroy: () => root.remove(),
  };
}
