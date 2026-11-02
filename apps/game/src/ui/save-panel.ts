import { MapFormatError } from '@overpass-game/map-schema';
import {
  exportBundle,
  replaceProgress,
  storageStatus,
} from '../game/progress.ts';
import { encodeSaveCode, importSaveText, saveFileText } from '../save/codec.ts';

/**
 * The menu's save section: export the progress as a file or a code, and import one. An import
 * replaces the progress on this browser, so it asks first. Built with DOM elements, as the menu is.
 */

const BUTTON_CSS =
  'display:block;width:100%;min-height:44px;margin:6px 0;padding:10px 12px;box-sizing:border-box;' +
  'font:16px sans-serif;text-align:left;background:#1d232c;color:#eee;border:1px solid #2e3744;' +
  'border-radius:6px;cursor:pointer';

const AREA_CSS =
  'display:block;width:100%;min-height:80px;margin:6px 0;padding:8px;box-sizing:border-box;' +
  'font:13px monospace;background:#16191e;color:#eee;border:1px solid #2e3744;border-radius:6px';

const FILE_NAME = 'overpass-game-save.json';

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.style.cssText = BUTTON_CSS;
  b.addEventListener('click', onClick);
  return b;
}

/** Starts a download of `text` as a JSON file. The object URL is freed once the click has run. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function explain(err: unknown): string {
  if (err instanceof MapFormatError) {
    return `That save is not valid: ${err.issues.slice(0, 3).join('; ')}`;
  }
  return err instanceof Error ? err.message : 'That save could not be read.';
}

export function buildSavePanel(onImported: () => void): HTMLElement {
  const section = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = 'Save data';
  h.style.cssText = 'font:18px sans-serif;margin:24px 0 4px;color:#cfd6de';

  const intro = document.createElement('p');
  intro.style.cssText = 'font:14px sans-serif;color:#9aa4b0;margin:6px 0';
  intro.textContent = storageStatus().durable
    ? 'Progress is saved in this browser. Export a save to keep a copy or move it to another host.'
    : 'Progress lasts only until this page is closed. Export a save to keep it.';

  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.style.cssText =
    'font:14px sans-serif;color:#cfd6de;margin:6px 0;min-height:1em';
  const show = (text: string): void => {
    message.textContent = text;
  };

  // Export: the file, or the code shown to copy.
  const code = document.createElement('textarea');
  code.readOnly = true;
  code.style.cssText = AREA_CSS;
  code.style.display = 'none';
  const copy = button('Copy save code', () => {
    void navigator.clipboard
      .writeText(code.value)
      .then(() => show('Save code copied.'))
      .catch(() => {
        code.select();
        show('Select the code and copy it.');
      });
  });
  copy.style.display = 'none';
  const showCode = button('Show save code', () => {
    code.value = encodeSaveCode(exportBundle());
    code.style.display = 'block';
    copy.style.display = 'block';
    show('');
  });
  const downloadFile = button('Download save file', () => {
    download(FILE_NAME, saveFileText(exportBundle()));
    show('Save file downloaded.');
  });

  // Import: a file, or a code pasted in.
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json,text/plain';
  file.style.cssText = 'display:block;margin:12px 0 6px;color:#cfd6de';
  const paste = document.createElement('textarea');
  paste.placeholder = 'Or paste a save code here';
  paste.style.cssText = AREA_CSS;

  const importNow = async (): Promise<void> => {
    let bundle;
    try {
      const chosen = file.files?.[0];
      const text = chosen ? await chosen.text() : paste.value;
      bundle = importSaveText(text);
    } catch (err) {
      show(explain(err));
      return;
    }
    const ok = window.confirm(
      'Replace the progress saved on this browser with this save? Your best scores, settings and saved runs here will be lost.',
    );
    if (!ok) return;
    replaceProgress(bundle);
    onImported();
  };

  section.append(
    h,
    intro,
    downloadFile,
    showCode,
    code,
    copy,
    file,
    paste,
    button('Import save', () => void importNow()),
    message,
  );
  return section;
}
