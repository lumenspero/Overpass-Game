import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game/game-scene.ts';
import { loadPlayableMap, mapIdFromSearch } from './game/map-source.ts';
import { currentBest } from './game/progress.ts';
import { setRunActions } from './game/run-actions.ts';
import { currentSettings, saveSettings } from './game/settings.ts';
import { setActiveMap } from './game/test-map.ts';
import { showMenu, type Menu, type MenuChoice } from './ui/menu.ts';
import { showSettings, type SettingsScreen } from './ui/settings-screen.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');

let game: Phaser.Game | null = null;
let menu: Menu | null = null;
let settingsScreen: SettingsScreen | null = null;
let loading = false;

/**
 * Removes the overlays a run leaves on the page. The scene tears them down on shutdown, but
 * destroying the game does not promise that, so the app clears them itself.
 */
function clearRunOverlays(): void {
  for (const id of ['speed-bar', 'settings', 'run-end']) {
    document.getElementById(id)?.remove();
  }
}

/** Starts the game with the map set in `setActiveMap`. Any game already running is stopped first. */
function startGame(): void {
  game?.destroy(true);
  clearRunOverlays();
  game = new Phaser.Game({
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

/** Opens the settings from the menu. Changes are kept for the game that starts next. */
function openMenuSettings(): void {
  if (settingsScreen) return;
  settingsScreen = showSettings(currentSettings, saveSettings, () => {
    settingsScreen?.destroy();
    settingsScreen = null;
  });
}

/** Loads the chosen map (or the test map), then plays it. A failed load stays on the menu with a message. */
async function playChoice(choice: MenuChoice): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    setActiveMap(
      choice.kind === 'test' ? null : await loadPlayableMap(choice.id),
    );
  } catch (err) {
    console.error(err);
    menu?.setError(failureText(err));
    return;
  } finally {
    loading = false;
  }
  menu?.destroy();
  menu = null;
  startGame();
}

/** Shows the start menu, with any game stopped. */
function showMainMenu(): void {
  game?.destroy(true);
  game = null;
  clearRunOverlays();
  menu?.destroy();
  menu = showMenu(
    currentBest(),
    (choice) => void playChoice(choice),
    openMenuSettings,
  );
}

// The end-of-run screen goes back to the menu, or plays the next map, through these.
setRunActions({
  menu: showMainMenu,
  play: (choice) => void playChoice(choice),
});

// `root.dataset.booted` marks the app as up: the menu is on screen, or the game has started.
const queryMap = mapIdFromSearch(window.location.search);
if (queryMap === null) {
  showMainMenu();
  root.dataset.booted = 'true';
} else {
  void startFromQuery(queryMap).then(() => {
    root.dataset.booted = 'true';
  });
}
