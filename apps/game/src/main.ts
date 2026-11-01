import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game/game-scene.ts';
import { loadPlayableMap, mapIdFromSearch } from './game/map-source.ts';
import { setActiveMap } from './game/test-map.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');

/** Plays the map named in `?map=`, if there is one. Otherwise, or if it fails, the test map plays. */
async function chooseMap(): Promise<void> {
  const id = mapIdFromSearch(window.location.search);
  if (id === null) return;
  try {
    setActiveMap(await loadPlayableMap(id));
  } catch (err) {
    console.error(err);
    const note = document.createElement('div');
    note.textContent = `${err instanceof Error ? err.message : 'The map failed to load.'} Showing the test map instead.`;
    note.style.cssText =
      'position:fixed;top:0;left:0;right:0;padding:8px;background:#5a1a1a;color:#fff;font:14px sans-serif;z-index:10';
    document.body.append(note);
  }
}

void chooseMap().then(() => {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
    banner: false,
    backgroundColor: '#111111',
    scale: { mode: Phaser.Scale.RESIZE },
    scene: [GameScene],
  });
  root.dataset.booted = 'true';
});
