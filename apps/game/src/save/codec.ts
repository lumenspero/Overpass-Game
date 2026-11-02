import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { parseSaveBundle, type SaveBundle } from '@overpass-game/map-schema';

/**
 * Turns a save bundle into the two forms the player can carry between hosts: a JSON file, and a
 * short text code. The code is the bundle, compressed and written in URL-safe base64, so it can be
 * pasted anywhere. itch.io and the player's own domain keep separate storage, so one of these is
 * how a save moves between them (spec: Hosting).
 */

/** Starts every save code. The number is the code's format version, separate from the save's own. */
const CODE_PREFIX = 'OG1.';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked, so a large save never passes too many arguments to one call.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** The text code for a bundle. Whitespace is ignored when it is read back. */
export function encodeSaveCode(bundle: SaveBundle): string {
  const bytes = zlibSync(strToU8(JSON.stringify(bundle)), { level: 9 });
  return CODE_PREFIX + toBase64Url(bytes);
}

/** The JSON file text for a bundle. */
export function saveFileText(bundle: SaveBundle): string {
  return JSON.stringify(bundle);
}

/** Reads a save code back to the JSON it holds. Throws a plain message for a code that is wrong. */
export function decodeSaveCode(code: string): unknown {
  const compact = code.replace(/\s+/g, '');
  if (!compact.startsWith(CODE_PREFIX)) {
    throw new Error('This is not an Overpass_Game save code.');
  }
  try {
    const json = strFromU8(
      unzlibSync(fromBase64Url(compact.slice(CODE_PREFIX.length))),
    );
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error('This save code is damaged or cut short. Copy it again.');
  }
}

/**
 * Reads a save from either form the game writes: the JSON file, or a save code. Throws a message
 * the player can act on when the text is neither, or when it is not a valid save.
 */
export function importSaveText(text: string): SaveBundle {
  const trimmed = text.trim();
  if (trimmed === '')
    throw new Error('Choose a save file or paste a save code first.');
  let raw: unknown;
  if (trimmed.startsWith('{')) {
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error('This file is not valid JSON, so it is not a save.');
    }
  } else {
    raw = decodeSaveCode(trimmed);
  }
  return parseSaveBundle(raw);
}
