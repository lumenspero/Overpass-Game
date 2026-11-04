import type { Speed } from '@overpass-game/sim';
import { audio } from '../audio/shared.ts';
import { clockAngle, dayName, isPm } from '../view/calendar.ts';
import { choiceOf, type PlayChoice } from './top-bar-model.ts';

/**
 * The game's top bar, in the original's minimal style. Top left: back to the main menu. Top right:
 * trips completed with a pin, the day of the week, and a clock. The clock turns twice a day and
 * inverts in the afternoon; pressing it opens a small transparent menu with play, pause and 2×.
 * The bar covers only its own controls, so the map under it still takes touch and mouse input.
 */

export interface TopBarState {
  paused: boolean;
  speed: Speed;
  /** False once the game is over: the play buttons are disabled, the rest still works. */
  enabled: boolean;
  tick: number;
  trips: number;
}

export interface TopBarHandlers {
  onMenu(): void;
  onChoice(choice: PlayChoice): void;
}

export interface TopBar {
  /** Shows the state. Only the parts that changed are written to the page. */
  sync(state: TopBarState): void;
  destroy(): void;
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  pin: '<path d="M12 2.5a6.8 6.8 0 0 0-6.8 6.8c0 4.9 6.8 12.2 6.8 12.2s6.8-7.3 6.8-12.2A6.8 6.8 0 0 0 12 2.5z" fill="currentColor"/><circle cx="12" cy="9.3" r="2.5" fill="#fff"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause:
    '<rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/>',
  fast: '<path d="M3.5 6v12l8-6zM12.5 6v12l8-6z" fill="currentColor"/>',
};

const LIGHT_FACE = '#f2f2f2';
const DARK_FACE = '#1b1f26';

const BUTTON_CSS =
  'width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;' +
  'border:1px solid rgba(70,78,92,0.7);border-radius:8px;cursor:pointer;color:#eee;' +
  'background:rgba(20,24,30,0.6)';

/** An icon from constant markup. The markup is written here, never taken from the player. */
function icon(markup: string, size = 22): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none">${markup}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

function iconButton(
  label: string,
  markup: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.style.cssText = BUTTON_CSS;
  b.append(icon(markup));
  b.addEventListener('click', () => {
    onClick();
    // Blur so a later Space press pans the view instead of pressing this button.
    b.blur();
  });
  return b;
}

export function createTopBar(handlers: TopBarHandlers): TopBar {
  const root = document.createElement('div');
  root.id = 'top-bar';
  root.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:6;font:14px sans-serif;color:#eee';

  const back = iconButton('Back to the main menu', ICONS.back, () => {
    audio.playEffect('menu.back');
    handlers.onMenu();
  });
  back.style.position = 'absolute';
  back.style.left = '12px';
  back.style.top = '12px';
  back.style.pointerEvents = 'auto';

  const trips = document.createElement('span');
  trips.style.cssText =
    'font:16px sans-serif;font-weight:700;color:#eee;min-width:1.5em;text-align:right';
  const tripsGroup = document.createElement('span');
  tripsGroup.style.cssText = 'display:flex;align-items:center;gap:4px';
  tripsGroup.title = 'Trips completed';
  tripsGroup.append(icon(ICONS.pin, 20), trips);

  const day = document.createElement('span');
  day.style.cssText =
    'font:14px sans-serif;font-weight:700;letter-spacing:1px;min-width:3em;text-align:center';

  const hand = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  hand.setAttribute('stroke', 'currentColor');
  hand.setAttribute('stroke-width', '2');
  hand.setAttribute('stroke-linecap', 'round');
  hand.innerHTML = '<line x1="12" y1="12" x2="12" y2="5.5"/>';
  const clockIcon = icon(
    '<circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.6"/>',
    30,
  );
  clockIcon.querySelector('circle')?.insertAdjacentElement('afterend', hand);
  const clock = document.createElement('button');
  clock.type = 'button';
  clock.setAttribute('aria-label', 'Clock and play controls');
  clock.setAttribute('aria-expanded', 'false');
  clock.title = 'Clock and play controls';
  clock.style.cssText = BUTTON_CSS;
  clock.append(clockIcon);

  // Three transparent buttons, shown when the clock is pressed.
  const menu = document.createElement('div');
  menu.style.cssText =
    'position:absolute;top:58px;right:12px;display:none;gap:6px;padding:4px;' +
    'border-radius:10px;background:rgba(20,24,30,0.22);pointer-events:auto';
  const buttons = new Map<PlayChoice, HTMLButtonElement>();
  const choose = (label: string, markup: string, choice: PlayChoice): void => {
    const b = iconButton(label, markup, () => {
      audio.playEffect('clock.select');
      handlers.onChoice(choice);
    });
    b.style.background = 'transparent';
    b.style.border = '1px solid transparent';
    buttons.set(choice, b);
    menu.append(b);
  };
  choose('Play', ICONS.play, 'play');
  choose('Pause', ICONS.pause, 'pause');
  choose('Fast forward 2×', ICONS.fast, 'fast');

  let open = false;
  const setOpen = (next: boolean): void => {
    open = next;
    menu.style.display = open ? 'flex' : 'none';
    clock.setAttribute('aria-expanded', String(open));
  };
  clock.addEventListener('click', () => {
    setOpen(!open);
    clock.blur();
  });
  // Pressing anywhere else closes the menu. Pressing the clock or its buttons does not.
  const onOutside = (e: Event): void => {
    const target = e.target as Node | null;
    if (open && target && !menu.contains(target) && !clock.contains(target)) {
      setOpen(false);
    }
  };
  document.addEventListener('pointerdown', onOutside);

  const right = document.createElement('div');
  right.style.cssText =
    'position:absolute;top:12px;right:12px;display:flex;align-items:center;gap:10px;pointer-events:auto';
  right.append(tripsGroup, day, clock);

  root.append(back, right, menu);
  document.body.append(root);

  let last = '';
  return {
    sync(state) {
      const angle = Math.round(clockAngle(state.tick));
      const pm = isPm(state.tick);
      const label = dayName(state.tick);
      const choice = choiceOf(state.paused, state.speed);
      const key = [state.trips, label, angle, pm, choice, state.enabled].join(
        '|',
      );
      if (key === last) return;
      last = key;

      trips.textContent = String(state.trips);
      day.textContent = label;
      hand.setAttribute('transform', `rotate(${angle} 12 12)`);
      clock.style.background = pm ? DARK_FACE : LIGHT_FACE;
      clock.style.color = pm ? '#f2f2f2' : DARK_FACE;
      for (const [c, b] of buttons) {
        const lit = c === choice;
        b.disabled = !state.enabled;
        b.setAttribute('aria-pressed', String(lit));
        b.style.background = lit ? 'rgba(255,255,255,0.22)' : 'transparent';
        b.style.color = '#f2f2f2';
      }
    },
    destroy() {
      document.removeEventListener('pointerdown', onOutside);
      root.remove();
    },
  };
}
