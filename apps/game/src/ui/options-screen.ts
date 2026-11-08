import {
  toggleGuide,
  toggleSymbols,
  toggleTheme,
  toggleAntiAliasing,
  toggleDrawMode,
  toggleHoldToErase,
  toggleTouchAutoZoom,
  setZoomLevel,
  ZOOM_LEVELS,
  type ZoomLevel,
  toggleMenuTransitions,
  type GameSettings,
  setVolume,
} from '../game/settings.ts';
import { MAX_LEVEL } from '../audio/levels.ts';
import { audio } from '../audio/shared.ts';
import { buildSavePanel } from './save-panel.ts';
import { soundCreditLines } from '../audio/catalog.ts';
import { showTutorial, type TutorialScreen } from './tutorial.ts';

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
  | 'about'
  | 'tutorial';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'game', label: 'Game' },
  { id: 'audio', label: 'Audio & Video' },
  { id: 'display', label: 'Display' },
  { id: 'language', label: 'Language' },
  { id: 'controls', label: 'Controls' },
  { id: 'privacy', label: 'Save Data' },
  { id: 'credits', label: 'Credits' },
  { id: 'about', label: 'About' },
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
  const press = (): void => {
    audio.playEffect(on ? 'toggle.off' : 'toggle.on');
    onClick();
  };
  return button(
    on ? 'On' : 'Off',
    `width:auto;min-width:72px;min-height:40px;font:600 16px sans-serif;border:0;border-radius:4px;` +
      `background:${on ? TEAL : OFF};color:${on ? INK : '#eee'}`,
    press,
  );
}

/** A setting that a later step adds: shown, but disabled. */
const STEP_CSS =
  'width:44px;height:44px;padding:0;border:0;border-radius:4px;font:600 20px sans-serif;cursor:pointer;background:#3b4654;color:#eee;';

/** A row with minus and plus buttons for a level from 0 to MAX_LEVEL. */
function levelRow(
  label: string,
  level: number,
  change: (next: number) => void,
  note?: string,
): HTMLElement {
  const minus = button('−', STEP_CSS, () => {
    change(level - 1);
    audio.playEffect('toggle.off');
  });
  const plus = button('+', STEP_CSS, () => {
    change(level + 1);
    audio.playEffect('toggle.on');
  });
  minus.disabled = level <= 0;
  plus.disabled = level >= MAX_LEVEL;
  minus.setAttribute('aria-label', `Lower ${label}`);
  plus.setAttribute('aria-label', `Raise ${label}`);
  const value = el('span', 'min-width:2.5ch;text-align:center', String(level));
  const group = el('div', 'display:flex;gap:8px;align-items:center');
  group.append(minus, value, plus);
  return row(label, group, note);
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

/** The official Mini Motorways page, for players who want to support the original. */
const OFFICIAL_RELEASE_URL = 'https://dinopoloclub.com/games/mini-motorways/';

/** A link that opens in a new tab, so the game stays open behind it. */
function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', `color:${TEAL};text-decoration:underline`, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function controlLines(title: string, lines: readonly string[]): HTMLElement {
  const section = el('div');
  section.append(heading(title));
  for (const line of lines) section.append(paragraph(line));
  return section;
}

/** A row of choices, with the current one highlighted. */
function choiceRow(
  label: string,
  choices: readonly { value: number; text: string }[],
  current: number,
  onPick: (value: number) => void,
  note?: string,
): HTMLElement {
  const group = el('div', 'display:flex;gap:6px');
  for (const choice of choices) {
    const on = choice.value === current;
    group.append(
      button(
        choice.text,
        `width:auto;min-height:40px;padding:6px 10px;font:600 15px sans-serif;border:0;border-radius:4px;` +
          `background:${on ? TEAL : OFF};color:${on ? INK : '#eee'}`,
        () => {
          if (!on) audio.playEffect('toggle.on');
          onPick(choice.value);
        },
      ),
    );
  }
  return row(label, group, note);
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
  back.addEventListener('click', () => {
    audio.playEffect('menu.back');
    deps.onClose();
  });
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
      if (current !== tab.id) audio.playEffect('options.tab');
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
          row(
            'Click to draw waypoints',
            switchButton(s.drawMode === 'waypoints', () =>
              change(toggleDrawMode(deps.getSettings())),
            ),
            'Click points in turn and the road runs through them. Right-click or Esc finishes. Dragging still draws.',
          ),
          row(
            'Hold to draw/delete',
            switchButton(s.holdToErase, () =>
              change(toggleHoldToErase(deps.getSettings())),
            ),
            'On: holding a touch still erases. Off: it places a tile.',
          ),
          row(
            'Touch screen auto-zoom',
            switchButton(s.touchAutoZoom, () =>
              change(toggleTouchAutoZoom(deps.getSettings())),
            ),
            'After a touch stroke, zoom so the whole stroke is in view.',
          ),
          choiceRow(
            'Zoom level',
            ZOOM_LEVELS.map((v) => ({ value: v, text: `${v}x` })),
            s.zoomLevel,
            (v) => change(setZoomLevel(deps.getSettings(), v as ZoomLevel)),
            'The zoom each game opens at, as a multiple of fit-to-screen. Applies from the next game.',
          ),
        );
        break;
      case 'audio':
        page.append(
          levelRow('Music', s.musicVolume, (level) =>
            change(setVolume(deps.getSettings(), 'music', level)),
          ),
          levelRow('Effects', s.effectsVolume, (level) =>
            change(setVolume(deps.getSettings(), 'effects', level)),
          ),
          levelRow(
            'Soundscape',
            s.ambienceVolume,
            (level) => change(setVolume(deps.getSettings(), 'ambience', level)),
            'Ambience sounds arrive with the soundscape stems.',
          ),
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
            'With click to draw waypoints on: click points in turn. Right-click or Esc finishes.',
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
          heading('Official Release'),
          paragraph(
            'Overpass_Game is a free fan recreation of Mini Motorways. If you enjoy it, please support the official release by Dinosaur Polo Club.',
          ),
          (() => {
            const p = paragraph('');
            p.append(
              link(
                'Mini Motorways by Dinosaur Polo Club',
                OFFICIAL_RELEASE_URL,
              ),
            );
            return p;
          })(),
          heading('Licenses'),
          paragraph(
            'Code is MIT licensed. Our art and sound effects are CC BY 4.0. The music is third-party and keeps its own licence, listed below. Map data is ODbL 1.0, derived from OpenStreetMap.',
          ),
          paragraph('© OpenStreetMap contributors. '),
          heading('Sounds'),
          ...soundCreditLines().map((line) => paragraph(line)),
        );
        break;
      case 'about':
        page.append(heading('Team'), paragraph('Team credits to be added.'));
        break;
      case 'tutorial':
        page.append(
          paragraph(
            'A short overlay in the game will explain drawing, erasing, panning and zoom.',
          ),
          row(
            'How to play',
            button(
              'Open',
              `width:auto;min-height:40px;padding:6px 16px;font:600 16px sans-serif;border:0;border-radius:4px;background:${TEAL};color:${INK}`,
              () => openTutorial(),
            ),
            'The same four steps shown during play, with H.',
          ),
        );
        break;
    }
    return page;
  }

  let tutorial: TutorialScreen | null = null;
  /** Opens the tutorial over Options. Closing it returns to Options. */
  function openTutorial(): void {
    if (tutorial) return;
    tutorial = showTutorial(() => {
      tutorial = null;
    });
  }

  function render(): void {
    for (const tab of TABS) {
      tabButtons.get(tab.id)?.setAttribute('style', tabCss(tab.id === current));
    }
    content.replaceChildren(tabContent(current));
  }

  const onKey = (e: KeyboardEvent): void => {
    // The tutorial handles its own Escape while it is open over Options.
    if (tutorial) return;
    if (e.key === 'Escape') {
      audio.playEffect('menu.back');
      deps.onClose();
    }
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
