import { createGrid, createSim, type SimState } from '@overpass-game/sim';
import {
  MapFormatError,
  SAVE_FORMAT,
  SAVE_SCHEMA_VERSION,
  type SaveBundle,
} from '@overpass-game/map-schema';
import { describe, expect, it } from 'vitest';
import {
  decodeSaveCode,
  encodeSaveCode,
  importSaveText,
  saveFileText,
} from './codec.ts';

const KEY = 'campaign/tulsa-oklahoma-united-states';

function sampleBundle(): SaveBundle {
  const sim = JSON.parse(
    JSON.stringify(createSim({ seed: 3, grid: createGrid(6, 6) })),
  ) as SimState;
  return {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: {
      motorwayGuide: false,
      theme: 'dark',
      buildingSymbols: true,
      antiAliasing: true,
      menuTransitions: true,
      drawMode: 'drag',
      holdToErase: true,
      touchAutoZoom: false,
      zoomLevel: 1,
      musicVolume: 7,
      effectsVolume: 8,
      ambienceVolume: 5,
    },
    best: { [KEY]: 12 },
    runs: {
      [KEY]: {
        mode: 'campaign',
        mapId: 'tulsa-oklahoma-united-states',
        mapHash: 'a1b2c3d4',
        savedAt: '2026-11-02T12:00:00.000Z',
        sim: sim as unknown as SaveBundle['runs'][string]['sim'],
      },
    },
  };
}

describe('save codes', () => {
  it('round trips a bundle through a code', () => {
    const bundle = sampleBundle();
    expect(importSaveText(encodeSaveCode(bundle))).toEqual(bundle);
  });

  it('writes a code of URL-safe text under the format prefix', () => {
    expect(encodeSaveCode(sampleBundle())).toMatch(/^OG1\.[A-Za-z0-9_-]+$/);
  });

  it('ignores line breaks and spaces in a code pasted in', () => {
    const bundle = sampleBundle();
    const code = encodeSaveCode(bundle);
    const mid = Math.floor(code.length / 2);
    const pasted = `  ${code.slice(0, mid)}\n  ${code.slice(mid)}  \n`;
    expect(importSaveText(pasted)).toEqual(bundle);
  });

  it('refuses text that is not a save code', () => {
    expect(() => decodeSaveCode('hello')).toThrow(/not an Overpass save code/);
  });

  it('says so when a code has been cut short', () => {
    const code = encodeSaveCode(sampleBundle());
    expect(() => importSaveText(code.slice(0, code.length - 12))).toThrow(
      /damaged or cut short/,
    );
  });
});

describe('save files', () => {
  it('round trips a bundle through the JSON file text', () => {
    const bundle = sampleBundle();
    expect(importSaveText(saveFileText(bundle))).toEqual(bundle);
  });

  it('refuses empty input', () => {
    expect(() => importSaveText('  \n ')).toThrow(
      /Choose a save file or paste/,
    );
  });

  it('refuses a file that is not JSON', () => {
    expect(() => importSaveText('{not json')).toThrow(/not valid JSON/);
  });

  it('names the bad field of a JSON file that is not a save', () => {
    expect(() =>
      importSaveText('{"format":"something-else","schemaVersion":1}'),
    ).toThrow(MapFormatError);
    expect(() =>
      importSaveText('{"format":"something-else","schemaVersion":1}'),
    ).toThrow(/format/);
  });
});
