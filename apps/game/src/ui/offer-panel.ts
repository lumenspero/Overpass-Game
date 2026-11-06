import { chooseOffer, tuning, type SimState } from '@overpass-game/sim';
import { offerView, type OfferView } from '../view/offer.ts';
import { audio } from '../audio/shared.ts';
import {
  choiceName,
  tilesText,
  upgradeCount,
  waitingText,
  weekNumber,
} from './offer-model.ts';
import {
  CARD_ICON,
  EYE_ICON,
  OFFER_ICONS,
  svgIcon,
  TILE_ICON,
} from './offer-icons.ts';

/**
 * The weekly choice (spec: Upgrades). When a week ends, a centred popup dims the map and asks
 * which option to take. The clock is paused while it waits (sim step), so the popup stays until
 * the player chooses. The eye button hides the popup so the map beneath can be seen, and the
 * same button brings it back. The panel only redraws when the offer or its visibility changes.
 */

export interface OfferPanel {
  sync(): void;
  destroy(): void;
}

const CREAM = '#f2efe8';
const INK = '#1d222a';
const SOFT = '#d8d4cb';

function el(tag: string, css: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

const BLOCK_STYLE_ID = 'offer-block-style';

/**
 * While a choice is pending, the controls on the play screen (top bar and dock) ignore the pointer,
 * so the back button and the others can't be used behind the popup. The rule is set by a flag on
 * the page, and lifts when the choice is made.
 */
function ensureBlockStyle(): void {
  if (document.getElementById(BLOCK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BLOCK_STYLE_ID;
  style.textContent =
    'html[data-offer-pending] #top-bar, html[data-offer-pending] #top-bar *,' +
    'html[data-offer-pending] #inventory-dock, html[data-offer-pending] #inventory-dock *' +
    '{pointer-events:none !important;}';
  document.head.append(style);
}

function setBlocked(on: boolean): void {
  if (on) document.documentElement.setAttribute('data-offer-pending', '');
  else document.documentElement.removeAttribute('data-offer-pending');
}

export function createOfferPanel(getSim: () => SimState): OfferPanel {
  ensureBlockStyle();
  const root = el(
    'div',
    'position:fixed;inset:0;z-index:30;display:none;pointer-events:none;' +
      'font-family:Helvetica,Arial,sans-serif;color:' +
      CREAM +
      ';',
  );
  root.id = 'offer-panel';
  document.body.append(root);

  let hidden = false;
  let shownKey: string | null = null;

  const choose = (id: OfferView['choices'][number]['id']): void => {
    audio.playEffect('upgrade.pick');
    chooseOffer(getSim(), id);
    shownKey = null;
    sync();
  };

  const choiceButton = (c: OfferView['choices'][number]): HTMLElement => {
    const button = el(
      'button',
      'background:none;border:0;color:inherit;font:inherit;cursor:pointer;' +
        'display:flex;flex-direction:column;align-items:center;width:150px;padding:8px 4px;' +
        'border-radius:12px;pointer-events:auto;touch-action:manipulation;',
    );
    button.setAttribute('type', 'button');
    button.setAttribute(
      'aria-label',
      `${choiceName(c.id, c.label)}, ${tilesText(c.option.tiles)}`,
    );

    const group = el('div', 'position:relative;width:132px;height:104px;');
    const body = c.id === 'tiles' ? TILE_ICON : OFFER_ICONS[c.id];
    const disc = el(
      'div',
      `position:absolute;left:0;top:0;width:104px;height:104px;border-radius:50%;` +
        `background:${CREAM};color:${INK};display:flex;align-items:center;justify-content:center;`,
    );
    disc.innerHTML = svgIcon(body, 52);

    const diamond = el(
      'div',
      `position:absolute;left:92px;top:32px;width:40px;height:40px;background:${CREAM};` +
        'transform:rotate(45deg);border-radius:7px;',
    );
    const tileGlyph = el(
      'div',
      `position:absolute;left:92px;top:32px;width:40px;height:40px;color:${INK};` +
        'display:flex;align-items:center;justify-content:center;',
    );
    tileGlyph.innerHTML = svgIcon(TILE_ICON, 22);
    const tiles = el(
      'div',
      `position:absolute;left:112px;top:44px;min-width:34px;height:34px;box-sizing:border-box;` +
        `border-radius:17px;background:${INK};color:${CREAM};font-weight:700;font-size:15px;` +
        'display:flex;align-items:center;justify-content:center;padding:0 8px;',
      String(c.option.tiles),
    );
    group.append(disc, diamond, tileGlyph, tiles);

    const count = upgradeCount(c.option);
    if (c.id !== 'tiles' && count > 1) {
      group.append(
        el(
          'div',
          `position:absolute;left:0;top:70px;width:34px;height:34px;border-radius:17px;` +
            `background:${INK};color:${CREAM};font-weight:700;font-size:15px;` +
            'display:flex;align-items:center;justify-content:center;',
          String(count),
        ),
      );
    }

    const name = el(
      'div',
      'margin-top:14px;font-size:20px;font-weight:700;line-height:1.15;text-align:center;',
      choiceName(c.id, c.label),
    );
    const sub = el(
      'div',
      `margin-top:4px;font-size:16px;color:${SOFT};text-align:center;`,
      tilesText(c.option.tiles),
    );
    button.append(group, name, sub);
    button.addEventListener('click', () => choose(c.id));
    return button;
  };

  const build = (view: OfferView, week: number): void => {
    root.replaceChildren();
    root.style.display = 'block';

    const veil = el(
      'div',
      'position:absolute;inset:0;background:rgba(17,20,26,0.74);' +
        `pointer-events:none;display:${hidden ? 'none' : 'block'};`,
    );

    const content = el(
      'div',
      'position:absolute;inset:0;display:' +
        (hidden ? 'none' : 'flex') +
        ';' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'padding:24px 16px;box-sizing:border-box;pointer-events:none;',
    );
    const title = el(
      'div',
      'font-size:40px;font-weight:700;letter-spacing:-0.5px;',
      `Week ${week}`,
    );
    const sub = el(
      'div',
      `margin-top:6px;font-size:18px;color:${SOFT};text-align:center;`,
      'Which upgrade would you like for your network?',
    );
    const waiting = el(
      'div',
      `margin-top:6px;font-size:14px;color:${SOFT};`,
      waitingText(view.pending),
    );
    const row = el(
      'div',
      'display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-top:36px;',
    );
    for (const c of view.choices) row.append(choiceButton(c));
    content.append(title, sub, waiting, row);

    const toggle = el(
      'button',
      `position:absolute;right:calc(16px + env(safe-area-inset-right, 0px));` +
        `bottom:calc(16px + env(safe-area-inset-bottom, 0px));width:56px;height:56px;` +
        `box-sizing:border-box;border:0;border-radius:50%;background:${CREAM};color:${INK};` +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;' +
        'pointer-events:auto;touch-action:manipulation;',
    );
    toggle.setAttribute('type', 'button');
    toggle.innerHTML = svgIcon(hidden ? CARD_ICON : EYE_ICON, 30);
    toggle.setAttribute(
      'aria-label',
      hidden
        ? 'Return to the upgrade choice'
        : 'View the map beneath the choice',
    );
    toggle.addEventListener('click', () => {
      hidden = !hidden;
      shownKey = null;
      sync();
    });

    root.append(veil, content, toggle);
  };

  function sync(): void {
    const sim = getSim();
    const view = offerView(sim);
    setBlocked(view !== null);
    const key = view
      ? `${view.pending}:${hidden}:${view.choices.map((c) => c.id).join(',')}:${weekNumber(sim.tick, tuning.WEEK_TICKS)}`
      : '';
    if (key === shownKey) return;
    shownKey = key;
    if (!view) {
      root.replaceChildren();
      root.style.display = 'none';
      return;
    }
    build(view, weekNumber(sim.tick, tuning.WEEK_TICKS));
  }

  return {
    sync,
    destroy: () => {
      setBlocked(false);
      root.remove();
    },
  };
}
