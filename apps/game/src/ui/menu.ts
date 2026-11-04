import type { BestScores } from '@overpass-game/sim';
import type { SoundEvent } from '../audio/catalog.ts';
import type { ThemeMode } from '@overpass-game/render-style';
import { DEV_FLAGS } from '../dev-flags.ts';
import { CAMPAIGN_MAPS } from '../game/campaign-maps.ts';
import { loadPlayableMap } from '../game/map-source.ts';
import type { StorageStatus } from '../game/progress.ts';
import { clampIndex, startIndex, stepIndex } from './carousel-model.ts';
import { campaignRows, type MenuRow } from './menu-model.ts';
import { drawThumbnail, THUMB_SIZE } from './map-thumbnail.ts';

/**
 * The start menu. The main screen has Play and Options. Play opens the map select, a carousel of
 * map cards: each card shows the map's terrain as a round thumbnail, its best score or lock hint.
 * The selected card's Play (or Resume) button sits below the carousel. Built with DOM elements and
 * text nodes, so no map or player text is parsed as markup.
 */

export type MenuChoice =
  { kind: 'campaign'; id: string; resume?: boolean } | { kind: 'test' };

export interface MenuOptions {
  best: BestScores;
  /** The week of each saved campaign run, by map id. */
  savedWeeks: Readonly<Record<string, number>>;
  storage: StorageStatus;
  /** The player's theme, used to colour the map thumbnails. */
  theme: ThemeMode;
  /** Read each time a screen opens, so a change made in Options applies at once. */
  menuTransitions: () => boolean;
  onPick: (choice: MenuChoice) => void;
  onSettings: () => void;
  /** Plays a menu sound. Optional, so the menu works without audio. */
  sound?: (event: SoundEvent) => void;
}

export interface Menu {
  destroy(): void;
  /** Shows a message under the carousel, for a choice that failed. Empty clears it. */
  setError(message: string): void;
}

const CARD_WIDTH = 260;
const TEAL = '#97c3c3';
const INK = '#1d232c';
const PANEL = '#1d232c';
const MUTED = '#b9c2cc';

const BUTTON_CSS =
  'display:block;width:100%;min-height:48px;margin:8px 0;padding:10px 16px;box-sizing:border-box;' +
  `font:600 22px sans-serif;text-align:center;background:${TEAL};color:${INK};border:0;` +
  'border-radius:4px;cursor:pointer';

const SECONDARY_CSS = `background:#3b4654;color:#eee`;

const NOTE_CSS =
  'margin:12px 0;padding:8px;background:#3a3420;color:#f2e6b8;border-radius:6px;font:14px sans-serif';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
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
  const b = el('button', `${BUTTON_CSS};${css}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function cardSubtitle(row: MenuRow): string {
  if (!row.open) return row.hint ?? 'Locked';
  return row.best === null ? 'Not played yet' : `Best: ${row.best}`;
}

interface CardView {
  card: HTMLElement;
  canvas: HTMLCanvasElement;
  row: MenuRow;
}

export function showMenu(options: MenuOptions): Menu {
  const { best, savedWeeks, storage, theme, onPick, onSettings } = options;
  const rows = campaignRows(CAMPAIGN_MAPS, best, savedWeeks, {
    showAll: DEV_FLAGS.showAllMaps,
  });

  const root = el(
    'div',
    'position:fixed;inset:0;overflow:hidden;background:#111;color:#eee;font:16px sans-serif;z-index:5',
  );
  root.id = 'menu';

  // Main screen: the wordmark, Play and Options.
  const main = el(
    'div',
    'position:absolute;inset:0;overflow:auto;padding:16px;box-sizing:border-box',
  );
  const mainInner = el('div', 'max-width:420px;margin:0 auto;padding-top:10vh');
  const wordmark = el(
    'h1',
    'font:700 40px sans-serif;margin:0 0 32px;letter-spacing:0.5px',
    'Overpass_Game',
  );
  mainInner.append(wordmark);
  if (storage.problem !== null) {
    mainInner.append(el('div', NOTE_CSS, storage.problem));
  }
  const playMain = button('Play', '', () => {
    options.sound?.('menu.enter');
    showSelect();
  });
  const optionsMain = button('Options', SECONDARY_CSS, () => {
    options.sound?.('menu.enter');
    onSettings();
  });
  mainInner.append(playMain, optionsMain);
  main.append(mainInner);

  // Select screen: back arrow, the carousel, and the actions for the selected card.
  const select = el(
    'div',
    'position:absolute;inset:0;display:none;flex-direction:column;padding:16px;box-sizing:border-box',
  );
  const topBar = el('div', 'display:flex;align-items:center;min-height:48px');
  const back = el(
    'button',
    'background:none;border:0;color:#eee;font:32px sans-serif;padding:4px 12px;cursor:pointer',
    '←',
  );
  back.type = 'button';
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => {
    options.sound?.('menu.back');
    showMain();
  });
  topBar.append(back);

  const track = el(
    'div',
    'display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;flex:0 0 auto;' +
      `padding:24px calc(50% - ${CARD_WIDTH / 2}px);box-sizing:border-box;` +
      `scroll-padding:0 calc(50% - ${CARD_WIDTH / 2}px);scrollbar-width:none`,
  );

  const cards: CardView[] = rows.map((row, index) => {
    const card = el(
      'div',
      `flex:0 0 ${CARD_WIDTH}px;width:${CARD_WIDTH}px;box-sizing:border-box;scroll-snap-align:center;` +
        `background:${PANEL};border-radius:14px;padding:16px;text-align:center;cursor:pointer;` +
        'transition:opacity .2s,transform .2s;opacity:0.5;transform:scale(0.92)',
    );
    const canvas = el(
      'canvas',
      `display:block;width:${THUMB_SIZE}px;height:${THUMB_SIZE}px;margin:0 auto 12px;border-radius:50%;` +
        `background:#2a313b;${row.open ? '' : 'filter:grayscale(1) brightness(0.6)'}`,
    );
    const name = el('h2', 'font:700 24px sans-serif;margin:0 0 6px', row.name);
    const sub = el(
      'p',
      `margin:0;color:${MUTED};font-size:15px`,
      cardSubtitle(row),
    );
    card.append(canvas, name, sub);
    card.addEventListener('click', () => {
      if (index !== selected) {
        options.sound?.(index > selected ? 'map.next' : 'map.previous');
      }
      choose(index, 'smooth');
    });
    track.append(card);
    return { card, canvas, row };
  });

  const actions = el('div', 'max-width:420px;width:100%;margin:12px auto 0');
  const resume = button('', SECONDARY_CSS, () => {
    const row = rows[selected];
    if (row?.open) onPick({ kind: 'campaign', id: row.id, resume: true });
  });
  resume.style.display = 'none';
  const play = button('Play', '', () => {
    const row = rows[selected];
    if (row?.open) onPick({ kind: 'campaign', id: row.id });
  });
  const locked = el('p', `margin:8px 0;text-align:center;color:${MUTED}`);
  const error = el(
    'div',
    'display:none;margin:12px 0;padding:8px;background:#5a1a1a;color:#fff;border-radius:6px',
  );
  actions.append(resume, play, locked, error);

  select.append(topBar, track, actions);
  main.style.display = 'block';
  root.append(main, select);
  document.body.append(root);

  let selected = clampIndex(startIndex(rows), rows.length);
  let frame = 0;
  // While a programmatic scroll runs, the track's scroll events are ignored: otherwise the card
  // nearest the middle mid-scroll (the one being left) would take the selection back.
  let scrolling = false;
  let scrollTimer = 0;

  // Thumbnails are drawn once the map files load. A map that fails keeps its plain disc.
  for (const { canvas, row } of cards) {
    loadPlayableMap(row.id)
      .then((map) => drawThumbnail(canvas, map, theme))
      .catch(() => undefined);
  }

  function render(): void {
    cards.forEach((c, i) => {
      const on = i === selected;
      c.card.style.opacity = on ? '1' : '0.5';
      c.card.style.transform = on ? 'scale(1)' : 'scale(0.92)';
      c.card.setAttribute('aria-current', on ? 'true' : 'false');
    });
    const row = rows[selected];
    if (!row) return;
    play.disabled = !row.open;
    play.style.opacity = row.open ? '1' : '0.4';
    play.textContent = row.open ? 'Play' : 'Locked';
    locked.textContent = row.open ? '' : (row.hint ?? '');
    if (row.open && row.savedWeek !== null) {
      resume.textContent = `Resume · week ${row.savedWeek}`;
      resume.style.display = 'block';
    } else {
      resume.style.display = 'none';
    }
  }

  /** Selects a card by index, without scrolling. */
  function setSelected(index: number): void {
    selected = clampIndex(index, rows.length);
    render();
  }

  /** Selects a card and scrolls it to the centre of the track. */
  function choose(index: number, behavior: ScrollBehavior): void {
    setSelected(index);
    const card = cards[selected]?.card;
    if (!card) return;
    scrolling = true;
    window.clearTimeout(scrollTimer);
    // Cleared by scrollend; the timer covers a scroll that never starts.
    scrollTimer = window.setTimeout(() => (scrolling = false), 700);
    card.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
  }

  track.addEventListener('scrollend', () => {
    scrolling = false;
    window.clearTimeout(scrollTimer);
  });

  // Swiping or scrolling the track selects the card nearest the middle of it.
  track.addEventListener('scroll', () => {
    if (scrolling) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (scrolling) return;
      const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
      let nearest = selected;
      let distance = Infinity;
      cards.forEach((c, i) => {
        const r = c.card.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < distance) {
          distance = d;
          nearest = i;
        }
      });
      if (nearest !== selected) setSelected(nearest);
    });
  });

  /** Fades a screen in when it opens, if menu transitions are on. */
  function fadeIn(screen: HTMLElement): void {
    if (!options.menuTransitions()) return;
    screen.style.transition = 'none';
    screen.style.opacity = '0';
    requestAnimationFrame(() => {
      screen.style.transition = 'opacity 0.2s';
      screen.style.opacity = '1';
    });
  }

  function showMain(): void {
    select.style.display = 'none';
    main.style.display = 'block';
    fadeIn(main);
  }

  function showSelect(): void {
    main.style.display = 'none';
    select.style.display = 'flex';
    fadeIn(select);
    choose(selected, 'auto');
  }

  /** Moves the selection one card from a key press, with the matching menu sound. */
  function move(delta: number): void {
    const next = stepIndex(selected, delta, rows.length);
    if (next === selected) return;
    options.sound?.(delta > 0 ? 'map.next' : 'map.previous');
    choose(next, 'smooth');
  }

  const onKey = (e: KeyboardEvent): void => {
    if (select.style.display === 'none') return;
    if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'Escape') {
      options.sound?.('menu.back');
      showMain();
    }
  };
  document.addEventListener('keydown', onKey);

  render();

  return {
    destroy() {
      cancelAnimationFrame(frame);
      window.clearTimeout(scrollTimer);
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
    setError(message: string) {
      if (message) options.sound?.('notice.error');
      error.textContent = message;
      error.style.display = message ? 'block' : 'none';
    },
  };
}
