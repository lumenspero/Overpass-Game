import {
  toggleGuide,
  toggleSymbols,
  toggleTheme,
  type GameSettings,
} from '../game/settings.ts';

/**
 * The settings screen: motorway guide, dark mode and building symbols. It reads the settings
 * through `getSettings`, so a change made by a key during play shows once `refresh` is called.
 * Escape and Done both call `onClose`; the owner decides what closing does.
 */

export interface SettingsScreen {
  /** Redraws the labels from the current settings. Call after a change made elsewhere. */
  refresh(): void;
  destroy(): void;
}

interface Row {
  label: (s: GameSettings) => string;
  toggle: (s: GameSettings) => GameSettings;
  button: HTMLButtonElement;
}

const BUTTON_CSS =
  'display:block;width:100%;min-height:44px;margin:6px 0;padding:10px 12px;box-sizing:border-box;' +
  'font:16px sans-serif;text-align:left;background:#16191e;color:#eee;border:1px solid #2e3744;' +
  'border-radius:6px;cursor:pointer';

const onOff = (on: boolean): string => (on ? 'On' : 'Off');

export function showSettings(
  getSettings: () => GameSettings,
  onChange: (next: GameSettings) => void,
  onClose: () => void,
): SettingsScreen {
  const root = document.createElement('div');
  root.id = 'settings';
  root.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;' +
    'justify-content:center;padding:16px;box-sizing:border-box;z-index:20';

  const panel = document.createElement('div');
  panel.style.cssText =
    'width:100%;max-width:420px;background:#1d232c;color:#eee;padding:16px;border-radius:8px;' +
    'box-sizing:border-box;font:16px sans-serif';

  const title = document.createElement('h2');
  title.textContent = 'Settings';
  title.style.cssText = 'font:20px sans-serif;margin:0 0 8px';

  const rows: Row[] = [
    {
      label: (s) => `Motorway guide: ${onOff(s.motorwayGuide)}`,
      toggle: toggleGuide,
      button: document.createElement('button'),
    },
    {
      label: (s) => `Dark mode: ${onOff(s.theme === 'dark')}`,
      toggle: toggleTheme,
      button: document.createElement('button'),
    },
    {
      label: (s) => `Building symbols: ${onOff(s.buildingSymbols)}`,
      toggle: toggleSymbols,
      button: document.createElement('button'),
    },
  ];

  const render = (): void => {
    const s = getSettings();
    for (const row of rows) row.button.textContent = row.label(s);
  };

  for (const row of rows) {
    row.button.type = 'button';
    row.button.style.cssText = BUTTON_CSS;
    row.button.addEventListener('click', () => {
      onChange(row.toggle(getSettings()));
      render();
    });
  }

  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = 'Done';
  done.style.cssText = BUTTON_CSS;
  done.addEventListener('click', () => onClose());

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', onKey);

  panel.append(title, ...rows.map((r) => r.button), done);
  root.append(panel);
  document.body.append(root);
  render();

  return {
    refresh: render,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
