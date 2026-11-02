import { CAMPAIGN_MAPS } from '../game/campaign-maps.ts';
import type { BestScores } from '@overpass-game/sim';
import { campaignRows } from './menu-model.ts';

/**
 * The start menu: the campaign's unlock path, the (still empty) challenge list, and the test map.
 * Built with DOM elements and text nodes, so no map or player text is parsed as markup.
 */

export type MenuChoice = { kind: 'campaign'; id: string } | { kind: 'test' };

export interface Menu {
  destroy(): void;
  /** Shows a message above the list, for a choice that failed. Empty clears it. */
  setError(message: string): void;
}

const BUTTON_CSS =
  'display:block;width:100%;min-height:44px;margin:6px 0;padding:10px 12px;box-sizing:border-box;' +
  'font:16px sans-serif;text-align:left;background:#1d232c;color:#eee;border:1px solid #2e3744;' +
  'border-radius:6px;cursor:pointer';

const LOCKED_CSS =
  'margin:6px 0;padding:10px 12px;box-sizing:border-box;font:16px sans-serif;' +
  'background:#16191e;color:#7d8794;border:1px solid #242a33;border-radius:6px';

function heading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = text;
  h.style.cssText = 'font:18px sans-serif;margin:24px 0 4px;color:#cfd6de';
  return h;
}

export function showMenu(
  best: BestScores,
  onPick: (choice: MenuChoice) => void,
): Menu {
  const root = document.createElement('div');
  root.id = 'menu';
  root.style.cssText =
    'position:fixed;inset:0;overflow:auto;background:#111;color:#eee;padding:16px;' +
    'box-sizing:border-box;z-index:5';

  const inner = document.createElement('div');
  inner.style.cssText = 'max-width:480px;margin:0 auto';

  const title = document.createElement('h1');
  title.textContent = 'Overpass_Game';
  title.style.cssText = 'font:28px sans-serif;margin:16px 0 0';

  const error = document.createElement('div');
  error.style.cssText =
    'display:none;margin:12px 0;padding:8px;background:#5a1a1a;color:#fff;border-radius:6px';

  const campaign = document.createElement('div');
  campaign.append(heading('Campaign'));
  for (const row of campaignRows(CAMPAIGN_MAPS, best)) {
    if (row.open) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = row.name;
      b.style.cssText = BUTTON_CSS;
      b.addEventListener('click', () =>
        onPick({ kind: 'campaign', id: row.id }),
      );
      campaign.append(b);
    } else {
      const d = document.createElement('div');
      d.style.cssText = LOCKED_CSS;
      d.textContent = row.hint ? `${row.name} · ${row.hint}` : row.name;
      campaign.append(d);
    }
  }

  const challenges = document.createElement('div');
  challenges.append(heading('Challenges'));
  const none = document.createElement('p');
  none.textContent = 'No challenges yet.';
  none.style.color = '#7d8794';
  challenges.append(none);

  const other = document.createElement('div');
  other.append(heading('Other'));
  const test = document.createElement('button');
  test.type = 'button';
  test.textContent = 'Test map';
  test.style.cssText = BUTTON_CSS;
  test.addEventListener('click', () => onPick({ kind: 'test' }));
  other.append(test);

  inner.append(title, error, campaign, challenges, other);
  root.append(inner);
  document.body.append(root);

  return {
    destroy: () => root.remove(),
    setError(message: string) {
      error.textContent = message;
      error.style.display = message ? 'block' : 'none';
    },
  };
}
