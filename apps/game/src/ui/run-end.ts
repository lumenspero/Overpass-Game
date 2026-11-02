/**
 * The end-of-run panel over the frozen board. `lines` is the summary (its first line is the
 * title), `notes` are the best and unlock messages, and `actions` are the buttons, the first
 * one primary. Text only, so no run or map text is read as markup.
 */

export interface RunEndAction {
  label: string;
  run: () => void;
}

export interface RunEndPanel {
  destroy(): void;
}

const BUTTON_CSS =
  'display:block;width:100%;min-height:44px;margin:8px 0 0;padding:10px 12px;box-sizing:border-box;' +
  'font:16px sans-serif;text-align:center;background:#16191e;color:#eee;border:1px solid #2e3744;' +
  'border-radius:6px;cursor:pointer';

export function showRunEnd(
  lines: string[],
  notes: string[],
  actions: RunEndAction[],
): RunEndPanel {
  const root = document.createElement('div');
  root.id = 'run-end';
  root.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'padding:16px;box-sizing:border-box;z-index:21';

  const panel = document.createElement('div');
  panel.style.cssText =
    'width:100%;max-width:420px;background:#1d232c;color:#eee;padding:16px;border-radius:8px;' +
    'box-sizing:border-box;font:16px sans-serif;text-align:center';

  const [title, ...rest] = lines;
  const h = document.createElement('h2');
  h.textContent = title ?? 'Game over';
  h.style.cssText = 'font:26px sans-serif;margin:0 0 8px';
  panel.append(h);

  for (const line of rest) {
    const p = document.createElement('p');
    p.textContent = line;
    p.style.margin = '4px 0';
    panel.append(p);
  }
  for (const note of notes) {
    const p = document.createElement('p');
    p.textContent = note;
    p.style.cssText = 'margin:8px 0 0;color:#f2c46d';
    panel.append(p);
  }

  actions.forEach((action, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.style.cssText = BUTTON_CSS;
    if (i === 0) b.style.borderColor = '#f2c46d';
    b.addEventListener('click', () => action.run());
    panel.append(b);
  });

  root.append(panel);
  document.body.append(root);
  return { destroy: () => root.remove() };
}
