import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game/game-scene.ts';
import { loadPlayableMap, mapIdFromSearch } from './game/map-source.ts';
import { currentBest } from './game/progress.ts';
import { setActiveMap } from './game/test-map.ts';
import type { CompiledMap } from '@overpass-game/map-schema';
import { showMenu, type MenuChoice } from './ui/menu.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');

function startGame(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
    banner: false,
    backgroundColor: '#111111',
    scale: { mode: Phaser.Scale.RESIZE },
    scene: [GameScene],
  });
}

function failureText(err: unknown): string {
  return err instanceof Error ? err.message : 'The map failed to load.';
}

/** Plays the map named in `?map=`. If it fails, the test map plays and a note says why. */
async function startFromQuery(id: string): Promise<void> {
  try {
    setActiveMap(await loadPlayableMap(id));
  } catch (err) {
    console.error(err);
    const note = document.createElement('div');
    note.textContent = `${failureText(err)} Showing the test map instead.`;
    note.style.cssText =
      'position:fixed;top:0;left:0;right:0;padding:8px;background:#5a1a1a;color:#fff;font:14px sans-serif;z-index:10';
    document.body.append(note);
  }
  startGame();
}

/** Shows the start menu. The chosen map loads, then the game starts in its place. */
function startFromMenu(): void {
  let picked = false;
  const menu = showMenu(currentBest(), (choice: MenuChoice) => {
    if (picked) return;
    picked = true;
    const load: Promise<CompiledMap | null> =
      choice.kind === 'test'
        ? Promise.resolve(null)
        : loadPlayableMap(choice.id);
    load
      .then((map) => {
        setActiveMap(map);
        menu.destroy();
        startGame();
      })
      .catch((err: unknown) => {
        picked = false;
        menu.setError(failureText(err));
      });
  });
}

// `root.dataset.booted` marks the app as up: the menu is on screen, or the game has started.
const queryMap = mapIdFromSearch(window.location.search);
if (queryMap === null) {
  startFromMenu();
  root.dataset.booted = 'true';
} else {
  void startFromQuery(queryMap).then(() => {
    root.dataset.booted = 'true';
  });
}
