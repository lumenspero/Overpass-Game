/**
 * The tutorial: a short overlay of four steps. It opens from Options and, during a game, from the
 * H key (the scene pauses the clock while it is open). Built with DOM elements and text nodes.
 */

import { audio } from '../audio/shared.ts';

export interface TutorialScreen {
  /** Removes the overlay without calling `onClose`. */
  destroy(): void;
}

const STEPS: readonly { title: string; body: string }[] = [
  {
    title: 'Draw roads',
    body:
      'Drag from a road or a building entrance to lay road. The right button, or E, erases. ' +
      'With click to draw waypoints on (Options, Game), each click adds a point and the road runs through them.',
  },
  {
    title: 'Connect buildings',
    body:
      'Every house and destination needs a road to its entrance. Cars drive along the roads to reach ' +
      'the destinations that have demand.',
  },
  {
    title: 'Pan and zoom',
    body:
      'Middle-drag, or hold Space and drag, to pan. The arrow keys also pan, and the wheel zooms. ' +
      'On touch, one finger draws, and two fingers pan and pinch to zoom.',
  },
  {
    title: 'Weeks and overflow',
    body:
      'Each week you get road tiles and choose an upgrade. Each pin on a business is a trip it wants. ' +
      'Past nine, a large red pin fills up; each trip you serve empties a ninth. If it fills, the game ends.',
  },
];

const BUTTON_CSS =
  'min-height:44px;padding:8px 16px;border:0;border-radius:4px;font:600 16px sans-serif;cursor:pointer;';

function button(
  label: string,
  css: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText = BUTTON_CSS + css;
  b.addEventListener('click', onClick);
  return b;
}

export function showTutorial(onClose: () => void): TutorialScreen {
  audio.playEffect('menu.enter');
  const root = document.createElement('div');
  root.id = 'tutorial';
  root.style.cssText =
    'position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;' +
    'padding:16px;box-sizing:border-box;background:rgba(0,0,0,0.6);font:16px sans-serif';

  const card = document.createElement('div');
  card.style.cssText =
    'width:100%;max-width:440px;box-sizing:border-box;padding:20px;border-radius:8px;' +
    'background:#1d232c;color:#eee';

  const counter = document.createElement('p');
  counter.style.cssText = 'margin:0 0 6px;color:#b9c2cc;font-size:14px';
  const title = document.createElement('h2');
  title.style.cssText = 'font:600 24px sans-serif;margin:0 0 10px';
  const body = document.createElement('p');
  body.style.cssText = 'margin:0 0 20px;line-height:1.45';

  const actions = document.createElement('div');
  actions.style.cssText =
    'display:flex;gap:8px;justify-content:space-between;align-items:center';
  const skip = button('Skip', 'background:none;color:#b9c2cc', () => close());
  const navigation = document.createElement('div');
  navigation.style.cssText = 'display:flex;gap:8px';
  const previous = button('Back', 'background:#3b4654;color:#eee', () =>
    move(-1),
  );
  const next = button('Next', 'background:#97c3c3;color:#1d232c', () =>
    move(1),
  );
  navigation.append(previous, next);
  actions.append(skip, navigation);

  card.append(counter, title, body, actions);
  root.append(card);
  document.body.append(root);

  let step = 0;
  function show(): void {
    const current = STEPS[step];
    if (!current) return;
    counter.textContent = `${step + 1} of ${STEPS.length}`;
    title.textContent = current.title;
    body.textContent = current.body;
    previous.disabled = step === 0;
    previous.style.opacity = step === 0 ? '0.4' : '1';
    next.textContent = step === STEPS.length - 1 ? 'Done' : 'Next';
  }

  function move(delta: number): void {
    if (step + delta >= STEPS.length) {
      close();
      return;
    }
    const next = Math.min(STEPS.length - 1, Math.max(0, step + delta));
    if (next !== step) audio.playEffect('options.tab');
    step = next;
    show();
  }

  function close(): void {
    audio.playEffect('menu.back');
    destroy();
    onClose();
  }

  function destroy(): void {
    document.removeEventListener('keydown', onKey);
    root.remove();
  }

  // Keys the overlay uses stop here, so the map behind it does not pan or pause.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else return;
    e.stopPropagation();
  };
  document.addEventListener('keydown', onKey);

  show();
  return { destroy };
}
