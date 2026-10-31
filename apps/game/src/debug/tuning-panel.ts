import {
  DEFAULT_TUNING,
  resetTuning,
  SPEED_OPTIONS,
  tuning,
  type Speed,
  type TuningKey,
} from '@overpass-game/sim';
import { TUNING_RANGES } from './tuning-ranges.ts';

/**
 * The debug panel (spec: none; a playtesting aid, not a player feature). Sliders write
 * straight into the sim's live `tuning`, so a change takes effect on the next tick. Speed
 * buttons set the clock's speed. Starting values such as the road budget, cars per house,
 * and colours apply to a new run, so use Restart after changing them.
 */

export interface TuningPanelOptions {
  /** Called when a speed button is pressed. */
  onSpeed: (speed: Speed) => void;
  /** Called when Restart is pressed. */
  onRestart: () => void;
  /** Called when a +1 button for a crossing is pressed (playtest aid). */
  onGrant: (
    kind: 'bridge' | 'tunnel' | 'motorway' | 'roundabout' | 'light',
  ) => void;
}

export interface TuningPanel {
  /** Highlights the speed in use. */
  setSpeed(speed: Speed): void;
  /** Re-reads every slider from the live tuning. Call after a reset. */
  refresh(): void;
  /** Removes the panel from the page. */
  destroy(): void;
}

const PANEL_STYLE = [
  'position:fixed',
  'top:8px',
  'right:8px',
  'width:280px',
  'max-height:calc(100vh - 16px)',
  'overflow:auto',
  'padding:8px',
  'background:rgba(17,17,17,0.92)',
  'color:#cfd6de',
  'font:12px monospace',
  'z-index:30',
].join(';');

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'margin:2px;font:12px monospace;cursor:pointer';
  b.addEventListener('click', onClick);
  return b;
}

function grantRow(
  onGrant: (
    kind: 'bridge' | 'tunnel' | 'motorway' | 'roundabout' | 'light',
  ) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.append(
    button('+1 bridge', () => onGrant('bridge')),
    button('+1 tunnel', () => onGrant('tunnel')),
    button('+1 motorway', () => onGrant('motorway')),
    button('+1 roundabout', () => onGrant('roundabout')),
    button('+1 light', () => onGrant('light')),
  );
  return row;
}

export function createTuningPanel(options: TuningPanelOptions): TuningPanel {
  const root = document.createElement('div');
  root.id = 'tuning-panel';
  root.style.cssText = PANEL_STYLE;

  const title = document.createElement('div');
  title.textContent = 'Debug  (D hides · 1–4 speed)';
  title.style.marginBottom = '6px';
  root.appendChild(title);

  // Speed buttons.
  const speedRow = document.createElement('div');
  const speedButtons = new Map<Speed, HTMLButtonElement>();
  for (const s of SPEED_OPTIONS) {
    const b = button(`${s}×`, () => options.onSpeed(s));
    speedButtons.set(s, b);
    speedRow.appendChild(b);
  }
  root.appendChild(speedRow);

  // Run and value controls.
  const controls = document.createElement('div');
  controls.style.margin = '6px 0';
  controls.appendChild(button('Restart run', () => options.onRestart()));
  controls.appendChild(
    button('Reset values', () => {
      resetTuning();
      refresh();
    }),
  );
  root.appendChild(controls);

  // One slider per tunable value. Each value is read live, so a change applies at once.
  const sliders = new Map<
    TuningKey,
    { input: HTMLInputElement; label: HTMLSpanElement }
  >();
  for (const key of Object.keys(TUNING_RANGES) as TuningKey[]) {
    const range = TUNING_RANGES[key];
    const row = document.createElement('div');
    row.style.margin = '4px 0';

    const name = document.createElement('div');
    name.textContent = `${key} (default ${DEFAULT_TUNING[key]})`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.style.width = '180px';
    input.style.verticalAlign = 'middle';

    const label = document.createElement('span');
    label.style.marginLeft = '6px';

    input.addEventListener('input', () => {
      tuning[key] = Number(input.value);
      label.textContent = String(tuning[key]);
    });

    row.appendChild(name);
    row.appendChild(input);
    row.appendChild(label);
    root.appendChild(row);
    sliders.set(key, { input, label });
  }

  function refresh(): void {
    for (const [key, { input, label }] of sliders) {
      input.value = String(tuning[key]);
      label.textContent = String(tuning[key]);
    }
  }

  function setSpeed(speed: Speed): void {
    for (const [s, b] of speedButtons) {
      b.style.fontWeight = s === speed ? 'bold' : 'normal';
      b.style.background = s === speed ? '#2b3a4a' : '';
    }
  }

  refresh();
  setSpeed(1);
  document.body.appendChild(root);

  root.append(grantRow(options.onGrant));
  return {
    setSpeed,
    refresh,
    destroy: () => root.remove(),
  };
}
