import {
  toggleGuide,
  toggleSymbols,
  toggleTheme,
  toggleAntiAliasing,
  toggleMenuTransitions,
  type GameSettings,
} from '../game/settings.ts';
import { buildSavePanel } from './save-panel.ts';

/**
 * The Options screen: a strip of tabs and the chosen tab's settings beneath it. Settings the game
 * already has are real controls. Settings that need a later step are shown disabled, with a note,
 * so the layout can be checked now. Built with DOM elements and text nodes.
 */

export interface OptionsDeps {
  getSettings: () => GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
  /** Called after an import replaces the progress, so the menu is built again to show it. */
  onImported: () => void;
}

export interface OptionsScreen {
  refresh(): void;
  destroy(): void;
}

type TabId =
  | 'game'
  | 'audio'
  | 'display'
  | 'language'
  | 'controls'
  | 'privacy'
  | 'credits'
  | 'tutorial';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'game', label: 'Game' },
  { id: 'audio', label: 'Audio & Video' },
  { id: 'display', label: 'Display' },
  { id: 'language', label: 'Language' },
  { id: 'controls', label: 'Controls' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'credits', label: 'Credits' },
  { id: 'tutorial', label: 'Tutorial' },
];

const TEAL = '#97c3c3';
const INK = '#1d232c';
const MUTED = '#b9c2cc';
const OFF = '#3b4654';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(
  label: string,
  css: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = el('button', `cursor:pointer;${css}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function tabCss(on: boolean): string {
  return (
    'flex:0 0 auto;min-height:40px;padding:8px 14px;border:0;border-radius:4px;' +
    `font:600 16px sans-serif;cursor:pointer;background:${on ? TEAL : OFF};color:${on ? INK : '#eee'}`
  );
}

/** A label on the left and its control on the right, with an optional note under it. */
function row(label: string, control: HTMLElement, note?: string): HTMLElement {
  const wrap = el('div', 'padding:12px 0;border-bottom:1px solid #2e3744');
  const line = el(
    'div',
    'display:flex;align-items:center;justify-content:space-between;gap:16px',
  );
  line.append(el('span', 'font-size:18px', label), control);
  wrap.append(line);
  if (note)
    wrap.append(el('p', `margin:6px 0 0;color:${MUTED};font-size:14px`, note));
  return wrap;
}

function switchButton(on: boolean, onClick: () => void): HTMLButtonElement {
  return button(
    on ? 'On' : 'Off',
    `width:auto;min-width:72px;min-height:40px;font:600 16px sans-serif;border:0;border-radius:4px;` +
      `background:${on ? TEAL : OFF};color:${on ? INK : '#eee'}`,
    onClick,
  );
}

/** A setting that a later step adds: shown, but disabled. */
function pendingRow(label: string, note: string): HTMLElement {
  const b = button(
    'Soon',
    `width:auto;min-width:72px;min-height:40px;font:16px sans-serif;border:0;border-radius:4px;background:${OFF};color:#eee;opacity:0.4`,
    () => undefined,
  );
  b.disabled = true;
  return row(label, b, note);
}

function heading(text: string): HTMLElement {
  return el(
    'h2',
    'font:600 18px sans-serif;margin:20px 0 4px;color:#cfd6de',
    text,
  );
}

function paragraph(text: string): HTMLElement {
  return el('p', `margin:8px 0;color:${MUTED};line-height:1.4`, text);
}

function controlLines(title: string, lines: readonly string[]): HTMLElement {
  const section = el('div');
  section.append(heading(title));
  for (const line of lines) section.append(paragraph(line));
  return section;
}

function toggleFullscreen(): void {
  // Needs a user gesture, and a host that allows it. A refusal leaves the setting as it was.
  const change: Promise<void> = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  change.catch(() => undefined);
}

export function showOptions(deps: OptionsDeps): OptionsScreen {
  const root = el(
    'div',
    'position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;box-sizing:border-box;' +
      'padding:12px 16px 16px;background:#111;color:#eee;font:16px sans-serif',
  );
  root.id = 'options';

  let current: TabId = 'game';

  const top = el(
    'div',
    'display:flex;align-items:center;gap:12px;min-height:48px',
  );
  const back = el(
    'button',
    'background:none;border:0;color:#eee;font:32px sans-serif;padding:4px 12px;cursor:pointer',
    '←',
  );
  back.type = 'button';
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => deps.onClose());
  top.append(back, el('h1', 'font:600 24px sans-serif;margin:0', 'Options'));

  const strip = el(
    'div',
    'display:flex;gap:8px;overflow-x:auto;padding:8px 0 12px;scrollbar-width:none',
  );
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const tab of TABS) {
    const b = el('button', tabCss(false), tab.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      current = tab.id;
      render();
    });
    tabButtons.set(tab.id, b);
    strip.append(b);
  }

  const content = el(
    'div',
    'flex:1;overflow:auto;width:100%;max-width:640px;margin:0 auto',
  );
  root.append(top, strip, content);
  document.body.append(root);

  /** Applies a change, then redraws the tab so the new state shows. */
  const change = (next: GameSettings): void => {
    deps.onChange(next);
    render();
  };

  function tabContent(id: TabId): HTMLElement {
    const s = deps.getSettings();
    const page = el('div');
    switch (id) {
      case 'game':
        page.append(
          row(
            'Motorway guide',
            switchButton(s.motorwayGuide, () =>
              change(toggleGuide(deps.getSettings())),
            ),
            'Faint outline of real motorways. Also on the G key.',
          ),
          pendingRow(
            'Draw mode toggle',
            'Click to draw, alongside hold to draw. Needs a setting.',
          ),
          pendingRow('Hold to draw and delete', 'Needs a setting.'),
          pendingRow('Touch screen auto-zoom', 'Needs a setting.'),
          pendingRow('Zoom level', 'Needs a setting.'),
        );
        break;
      case 'audio':
        page.append(
          pendingRow('Volume', 'Needs the audio manager (M12).'),
          pendingRow('Soundscape', 'Needs the audio manager (M12).'),
          row(
            'Menu transitions',
            switchButton(s.menuTransitions, () =>
              change(toggleMenuTransitions(deps.getSettings())),
            ),
            'Fades the menu screens in and out.',
          ),
          row(
            'Night mode',
            switchButton(s.theme === 'dark', () =>
              change(toggleTheme(deps.getSettings())),
            ),
          ),
          row(
            'Colorblind mode',
            switchButton(s.buildingSymbols, () =>
              change(toggleSymbols(deps.getSettings())),
            ),
            'Shows a symbol on each building, so colours can be told apart.',
          ),
        );
        break;
      case 'display':
        page.append(
          row(
            'Fullscreen',
            switchButton(document.fullscreenElement !== null, () => {
              toggleFullscreen();
            }),
          ),
          pendingRow(
            'Render scale',
            "Phaser 4's game config has no render-resolution option. Needs a renderer change.",
          ),
          row(
            'Anti-aliasing',
            switchButton(s.antiAliasing, () =>
              change(toggleAntiAliasing(deps.getSettings())),
            ),
            'Smooths the edges of roads and water. Applies from the next game.',
          ),
        );
        break;
      case 'language':
        page.append(
          row('Language', el('span', '', 'English')),
          paragraph('More languages will be added later.'),
        );
        break;
      case 'controls':
        page.append(
          controlLines('Mouse', [
            'Left button: draw roads. Right button: erase.',
            'Middle button drag, or Space and a left drag: pan.',
            'Wheel: zoom.',
          ]),
          controlLines('Touch', [
            'One finger: draw. Two fingers: pan, and pinch to zoom.',
          ]),
          controlLines('Pen', [
            'Tip: draw. Barrel button or eraser end: erase.',
          ]),
          controlLines('Keyboard', [
            'E: switch the eraser. Arrow keys: pan.',
            '1 to 4: game speed. P: pause. G: motorway guide. N: night mode. R: restart a finished game.',
            'B: bridge tool. T: tunnel tool.',
          ]),
        );
        break;
      case 'privacy':
        page.append(buildSavePanel(deps.onImported));
        break;
      case 'credits':
        page.append(
          heading('Overpass_Game'),
          paragraph(
            'Code is MIT licensed. Art and audio are CC BY 4.0. Map data is ODbL 1.0, derived from OpenStreetMap.',
          ),
          paragraph('© OpenStreetMap contributors. '),
          heading('Team'),
          paragraph('Team credits to be added.'),
          heading('Sounds'),
          paragraph(
            'Sound credits will be listed here once audio is added (M12).',
          ),
        );
        break;
      case 'tutorial':
        page.append(
          paragraph(
            'A short overlay in the game will explain drawing, erasing, panning and zoom.',
          ),
          pendingRow('Show tutorial', 'Arrives in a later step.'),
        );
        break;
    }
    return page;
  }

  function render(): void {
    for (const tab of TABS) {
      tabButtons.get(tab.id)?.setAttribute('style', tabCss(tab.id === current));
    }
    content.replaceChildren(tabContent(current));
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') deps.onClose();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', render);

  render();

  return {
    refresh: render,
    destroy() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', render);
      root.remove();
    },
  };
}
