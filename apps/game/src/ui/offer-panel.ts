import { chooseUpgrade, type SimState } from '@overpass-game/sim';
import { offerView } from '../view/offer.ts';
import { audio } from '../audio/shared.ts';

/**
 * The weekly choice (spec: Upgrades). A small panel at the bottom of the screen offers the
 * oldest upgrade offer's choices as buttons. Choosing one puts it in stock. The panel only
 * redraws when the offer changes, so it is cheap to call every frame.
 */

export interface OfferPanel {
  sync(): void;
  destroy(): void;
}

export function createOfferPanel(getSim: () => SimState): OfferPanel {
  const root = document.createElement('div');
  root.id = 'offer-panel';
  root.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);' +
    'font:14px sans-serif;background:rgba(20,24,30,0.92);color:#eee;' +
    'padding:10px 14px;border-radius:8px;text-align:center;display:none;';
  document.body.append(root);

  // null until the first draw, so an empty first state still hides the panel.
  let shown: string | null = null;
  const sync = (): void => {
    const sim = getSim();
    const view = offerView(sim);
    const key = view
      ? `${view.pending}:${view.choices.map((c) => c.kind).join(',')}`
      : '';
    if (key === shown) return;
    shown = key;
    root.replaceChildren();
    if (!view) {
      root.style.display = 'none';
      return;
    }
    root.style.display = 'block';

    const title = document.createElement('div');
    title.textContent =
      view.pending > 1
        ? `Weekly reward: choose an upgrade (${view.pending} waiting)`
        : 'Weekly reward: choose an upgrade';
    const row = document.createElement('div');
    row.style.marginTop = '6px';
    for (const c of view.choices) {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.style.cssText =
        'margin:4px;font:14px sans-serif;padding:6px 12px;cursor:pointer';
      b.addEventListener('click', () => {
        audio.playEffect('upgrade.pick');
        chooseUpgrade(getSim(), c.kind);
        shown = null;
        sync();
      });
      row.append(b);
    }
    root.append(title, row);
  };

  return { sync, destroy: () => root.remove() };
}
