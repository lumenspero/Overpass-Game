import Phaser from 'phaser';
import './style.css';
import type { SimState } from '@overpass-game/sim';
import { GameScene } from './game/game-scene.ts';
import { loadPlayableMap, mapIdFromSearch } from './game/map-source.ts';
import {
  clearRun,
  currentBest,
  initProgress,
  loadRun,
  savedWeeks,
  storageStatus,
} from './game/progress.ts';
import { setRunActions } from './game/run-actions.ts';
import { saveActiveRun, setPendingResume } from './game/run-resume.ts';
import {
  currentSettings,
  saveSettings,
  type GameSettings,
} from './game/settings.ts';
import { setActiveMap } from './game/test-map.ts';
import { showMenu, type Menu, type MenuChoice } from './ui/menu.ts';
import { showOptions, type OptionsScreen } from './ui/options-screen.ts';
import type { AudioLevels } from './audio/audio-manager.ts';
import { audio } from './audio/shared.ts';
import { MUSIC_TRACKS } from './audio/catalog.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');

let game: Phaser.Game | null = null;
let menu: Menu | null = null;
let optionsScreen: OptionsScreen | null = null;
let loading = false;

function levelsOf(settings: GameSettings): AudioLevels {
  return {
    music: settings.musicVolume,
    effects: settings.effectsVolume,
    ambience: settings.ambienceVolume,
  };
}

/**
 * Removes the overlays a run leaves on the page. The scene tears them down on shutdown, but
 * destroying the game does not promise that, so the app clears them itself.
 */
function clearRunOverlays(): void {
  for (const id of ['top-bar', 'run-end']) {
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
    // Read when the game starts, so a change applies from the next game.
    antialias: currentSettings().antiAliasing,
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

/** Opens Options from the menu. Changes are saved, and kept for the game that starts next. */
function openOptions(): void {
  if (optionsScreen) return;
  optionsScreen = showOptions({
    getSettings: currentSettings,
    onChange: (next) => {
      saveSettings(next);
      audio.setLevels(levelsOf(next));
    },
    onClose: () => {
      optionsScreen?.destroy();
      optionsScreen = null;
    },
    onImported: showMainMenu,
  });
}

/**
 * Loads the chosen map (or the test map), then plays it. A resumed run is checked against the map
 * first: a map that changed since the save cannot resume it. A failed load stays on the menu.
 */
async function playChoice(choice: MenuChoice): Promise<void> {
  if (loading) return;
  if (choice.kind === 'campaign' && !choice.resume) {
    audio.playEffect('menu.level-select');
  }
  loading = true;
  let resume: SimState | null = null;
  try {
    if (choice.kind === 'test') {
      setActiveMap(null);
    } else {
      const map = await loadPlayableMap(choice.id);
      if (choice.resume) {
        const saved = loadRun('campaign', choice.id);
        if (saved === null)
          throw new Error('That saved run is no longer here.');
        if (saved.mapHash !== map.contentHash) {
          clearRun('campaign', choice.id);
          throw new Error(
            'That map has changed since the run was saved, so the saved run was discarded.',
          );
        }
        resume = saved.sim;
      }
      setActiveMap(map);
    }
  } catch (err) {
    console.error(err);
    // A discarded run is gone from the list, so the menu is built again to show that.
    if (choice.kind === 'campaign' && choice.resume) showMainMenu();
    menu?.setError(failureText(err));
    return;
  } finally {
    loading = false;
  }
  setPendingResume(resume);
  menu?.destroy();
  menu = null;
  startGame();
}

/**
 * Shows the start menu, with any game stopped. The running game saves first, so leaving a run
 * from the menu can be resumed later.
 */
function showMainMenu(): void {
  saveActiveRun();
  game?.destroy(true);
  game = null;
  clearRunOverlays();
  menu?.destroy();
  menu = showMenu({
    best: currentBest(),
    savedWeeks: savedWeeks(),
    storage: storageStatus(),
    theme: currentSettings().theme,
    menuTransitions: () => currentSettings().menuTransitions,
    onPick: (choice) => void playChoice(choice),
    onSettings: openOptions,
    sound: (event) => audio.playEffect(event),
  });
  audio.playMusic(MUSIC_TRACKS[0]);
}

// The end-of-run screen goes back to the menu, or plays the next map, through these.
setRunActions({
  menu: showMainMenu,
  play: (choice) => void playChoice(choice),
});

// Progress loads before anything reads it: settings, best scores and saved runs. It never fails;
// if browser storage is unavailable the game starts from memory and the menu says so.
// `root.dataset.booted` marks the app as up: the menu is on screen, or the game has started.
const ready = initProgress();
void ready.then(() => audio.setLevels(levelsOf(currentSettings())));
// Browsers keep audio off until the first tap or key press; the first one unlocks it.
for (const type of ['pointerdown', 'keydown'] as const) {
  document.addEventListener(type, () => audio.unlock());
}
const queryMap = mapIdFromSearch(window.location.search);
if (queryMap === null) {
  void ready.then(() => {
    showMainMenu();
    root.dataset.booted = 'true';
  });
} else {
  void ready
    .then(() => startFromQuery(queryMap))
    .then(() => {
      root.dataset.booted = 'true';
    });
}
