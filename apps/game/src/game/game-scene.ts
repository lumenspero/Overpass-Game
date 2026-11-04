import { lotAt, stripLayout, weekOf } from '@overpass-game/sim';
import { showTutorial, type TutorialScreen } from '../ui/tutorial.ts';
import { greenIsHorizontal, ROUNDABOUT_RING_TILES } from '@overpass-game/sim';
import type { CompiledMap, OutlinePath } from '@overpass-game/map-schema';
import { activeDemo, buildDemo, DEMOS, setActiveDemo } from './demos.ts';
import Phaser from 'phaser';
import {
  advanceClock,
  type Clock,
  createClock,
  createSim,
  isOpenTile,
  openDistricts,
  placeBuilding,
  type Grid,
  SPEED_OPTIONS,
  setPaused,
  setSpeed,
  type Speed,
  type SimState,
  step,
  summaryOf,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';
import {
  type Car,
  type CurvePoint,
  motorwayCurve,
  pointAtDistance,
} from '@overpass-game/sim';
import { carOutline, headingBetween } from '../view/car-shape.ts';
import {
  BUILDING_COLORS,
  DEBUG_PALETTE,
  STANDARD_BUILDING_PALETTE,
  labelColour,
  resolvePalette,
  type MapPalette,
  ROAD_WIDTH_TILES,
  TILE_SIZE,
} from '@overpass-game/render-style';
import {
  createIntentMapper,
  finishChain,
  setInputOptions,
  type Intent,
  type IntentMapper,
  type PointerKind,
  type PointerSample,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  setTool,
  updateTimers,
  type Vec2,
  wheel,
} from '../input/intents.ts';
import type { TileXY } from '../input/path.ts';
import {
  createFittedCamera,
  fitBox,
  type CameraState,
  panCamera,
  resizeCamera,
  screenToWorld,
  type Size,
  worldSize,
  zoomCamera,
} from '../view/camera.ts';
import { debugShapes } from '../view/debug-geometry.ts';
import {
  buildingShapes,
  lotShapes,
  carShapes,
  entranceStubShapes,
  roadShapes,
  terrainTiles,
  ENTRANCE_WIDTH,
} from '../view/geometry.ts';
import {
  createTuningPanel,
  type HotkeyAction,
  type TuningPanel,
} from '../debug/tuning-panel.ts';
import { createOfferPanel, type OfferPanel } from '../ui/offer-panel.ts';
import { createTopBar, type TopBar } from '../ui/top-bar.ts';
import { clockFor, type PlayChoice } from '../ui/top-bar-model.ts';
import { previewRoads } from '../view/crossing-preview.ts';
import {
  BADGE_H,
  BADGE_STROKE_TILES,
  BADGE_TEXT_SCALE_X,
  BADGE_TEXT_TILES,
  badgeAnchor,
  motorwayPreview,
  motorwayParts,
  shieldOutline,
} from '../view/motorway-view.ts';
import { guideWorldLines } from '../view/guide.ts';
import {
  buildingSymbol,
  type BuildingSymbol,
  GUIDE_STYLE,
  symbolInk,
} from '@overpass-game/render-style';
import {
  currentSettings,
  DEFAULT_SETTINGS,
  type GameSettings,
  saveSettings,
  toggleGuide,
  toggleTheme,
} from './settings.ts';
import { lockedTileRects } from '../view/districts.ts';
import { endLines, OVERFLOW_RING_COLOR } from '../view/hud.ts';
import {
  showRunEnd,
  type RunEndAction,
  type RunEndPanel,
} from '../ui/run-end.ts';
import { runEndModel } from '../ui/run-end-model.ts';
import { CAMPAIGN_MAPS } from './campaign-maps.ts';
import { currentBest, recordFinishedRun, saveRun } from './progress.ts';
import { setRunSaver, takePendingResume } from './run-resume.ts';
import { runActions } from './run-actions.ts';
import { bestKey } from '@overpass-game/sim';
import {
  CROSSING_MESSAGE_MS,
  controlMessage,
  crossingHint,
  crossingMessage,
  motorwayMessage,
} from '../view/crossing-message.ts';
import { overflowRings } from '../view/overflow.ts';
import { audio } from '../audio/shared.ts';
import { soundForSimEvent } from '../audio/sim-sounds.ts';
import { weekEndSound, hourOfWeek } from '../audio/week-tick.ts';
import { stemLevels } from '../audio/music-stems.ts';
import {
  actionSounds,
  EMPTY_TALLY,
  placementReport,
} from '../audio/action-sounds.ts';
import { strokeTally } from './controller.ts';
import { ensureHouseStubs, tuning } from '@overpass-game/sim';
import {
  createTickMeter,
  sampleTickRate,
  type TickMeter,
} from '../view/tick-meter.ts';
import {
  applyIntent,
  type Controller,
  createController,
} from './controller.ts';
import {
  buildTestDistricts,
  buildTestGrid,
  testMapGuide,
  testMapRules,
  TEST_BUILDINGS,
  isTestMap,
  playedMap,
} from './test-map.ts';

/** Roundabout ring and the two light colours. */
const CONTROL_OUTLINE_COLOUR = 0x3a4150;
/** A touch stroke shorter than this, in screen pixels, is a tap, and does not auto-zoom. */
const STROKE_FIT_MIN_PX = 24;

/** Speed of arrow-key panning, in screen pixels per second. */
const PAN_KEY_PX_PER_SEC = 600;
const LIGHT_GREEN_COLOUR = 0x5cb85c;
const LIGHT_RED_COLOUR = 0xd9534f;

/** Stroke width of thin region and pavement borders, in pixels. */
const BORDER_PX = 2;

/** Radius of a building's symbol, as a share of the building's width. */
const SYMBOL_RADIUS = 0.3;

/** Draws one colour-blind symbol centred on (cx, cy), with radius r. */
function drawSymbol(
  gfx: Phaser.GameObjects.Graphics,
  symbol: BuildingSymbol,
  cx: number,
  cy: number,
  r: number,
  ink: number,
): void {
  gfx.fillStyle(ink, 1);
  if (symbol === 'circle') {
    gfx.fillCircle(cx, cy, r);
  } else if (symbol === 'square') {
    gfx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  } else if (symbol === 'triangle') {
    gfx.fillTriangle(cx, cy - r, cx + r, cy + r, cx - r, cy + r);
  } else {
    gfx.fillTriangle(cx, cy - r, cx + r, cy, cx, cy + r);
    gfx.fillTriangle(cx, cy - r, cx, cy + r, cx - r, cy);
  }
}

/** A 24-bit colour as the `#rrggbb` text Phaser's text objects take. */
function hexString(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}
/** Motorway contrast stroke, wider than the motorway itself, in pixels. */
const MOTORWAY_CONTRAST_PX = 4;
/*
 * Large buildings (destinations) have a lip on their bottom and right edges and rounded corners,
 * as fractions of their size. Houses keep the flat lip below.
 */
const LIP_FRAC = 0.08;
const CORNER_FRAC = 0.14;
/** Building depth: how far the shaded side shows below the face, in pixels. */
const BUILDING_DEPTH_PX = 4;
/** Cast shadow offset and opacity under buildings. */
const SHADOW_DX = 4;
const SHADOW_DY = 5;
const SHADOW_ALPHA = 0.55;
/** Width of a parking space's outline, in world units. */
const SPACE_LINE_PX = 2;
/** Shaded side colour for each standard building face colour. */
const SIDE_BY_FACE = new Map(
  STANDARD_BUILDING_PALETTE.map((style) => [style.face, style.side]),
);

/**
 * The M2 view. It draws sim state and forwards input. It holds no game rules:
 * roads and budget changes go through the controller into the sim.
 *
 * The map is drawn in world units inside one container. The container's scale
 * and position are set from the camera model, so the screen mapping is exactly
 * the one camera.ts tests.
 */
export class GameScene extends Phaser.Scene {
  private sim!: SimState;
  private clock!: Clock;
  private mapper!: IntentMapper;
  /** Whether the pointer now down is a touch, and the screen extent of the stroke in progress. */
  private downIsTouch = false;
  private strokeFromTouch = false;
  /** The tutorial overlay during play, and whether closing it should un-pause the clock. */
  private tutorial: TutorialScreen | null = null;
  private tutorialResumes = false;
  private strokeBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null = null;
  private controller!: Controller;
  private view!: CameraState;
  private mapSize!: Size;
  private layer!: Phaser.GameObjects.Container;
  private roadGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private buildingGfx!: Phaser.GameObjects.Graphics;
  private motorwayGfx!: Phaser.GameObjects.Graphics;
  private guideGfx!: Phaser.GameObjects.Graphics;
  private terrainGfx!: Phaser.GameObjects.Graphics;
  /** The palette for this map in the current mode. */
  private pal!: MapPalette;
  private paletteId = 'default';
  private waterId = 'shared';
  private terrainOutlines: CompiledMap['outlines'] | null = null;
  /** The map's named labels, and the text objects drawn for them. */
  private mapLabels: CompiledMap['labels'] = [];
  private labelTexts: Phaser.GameObjects.Text[] = [];
  /** The number on each motorway's shield. Kept and reused, as the motorways are drawn every frame. */
  private badgeTexts: Phaser.GameObjects.Text[] = [];
  private guideLines: { x: number; y: number }[][] | null = null;
  private settings: GameSettings = DEFAULT_SETTINGS;
  private controlGfx!: Phaser.GameObjects.Graphics;
  private carGfx!: Phaser.GameObjects.Graphics;
  /** Each car's heading when last drawn, by car id, so a stopped car keeps facing the way it was going. */
  private carHeadings = new Map<number, number>();
  private ringGfx!: Phaser.GameObjects.Graphics;
  private crossingText!: Phaser.GameObjects.Text;
  /** Which crossing report is on screen, and when its message stops showing (ms). */
  private crossingSeq = 0;
  private crossingUntil = 0;
  private crossingLine = '';
  private endGfx!: Phaser.GameObjects.Graphics;
  private endPanel: RunEndPanel | null = null;
  /** The campaign map being played, or null for a demo or the test map, which keep no best. */
  private campaignId: string | null = null;
  /** The week of the last save, so a campaign run is saved once each week. */
  private lastSavedWeek = 0;
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.saveNow();
  };
  private ended = false;
  private roadsDirty = true;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  /** Tile grid for building. Shown while a tool is picked, so placement lines up with tiles. */
  private gridGfx!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private offerPanel!: OfferPanel;
  private topBar!: TopBar;
  private debugOn = false;
  private overlayDirty = true;
  private meter!: TickMeter;
  private canvas!: HTMLCanvasElement;
  private lockGfx!: Phaser.GameObjects.Graphics;
  /** How many districts were open when the map was last drawn. -1 forces a first draw. */
  private openCount = -1;
  private panel: TuningPanel | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  constructor() {
    super('game');
  }

  create(): void {
    this.settings = currentSettings();
    const demo = activeDemo();
    // A saved run from the menu replaces the new board. It is taken once, so a restart begins fresh.
    const resumed = takePendingResume();
    if (demo) {
      this.sim = buildDemo(demo);
    } else if (resumed) {
      this.sim = resumed;
      // A run saved before houses had stubs gets them now.
      ensureHouseStubs(this.sim);
    } else {
      const testGrid: Grid = buildTestGrid();
      this.sim = createSim({
        seed: 1,
        grid: testGrid,
        districts: buildTestDistricts(),
        rules: testMapRules(),
      });
    }
    const grid: Grid = this.sim.grid;
    this.clock = createClock();
    this.mapper = createIntentMapper('select');
    setInputOptions(this.mapper, {
      drawMode: this.settings.drawMode,
      holdToErase: this.settings.holdToErase,
    });
    this.controller = createController(this.sim);
    this.offerPanel = createOfferPanel(() => this.sim);
    this.topBar = createTopBar({
      onMenu: () => runActions()?.menu(),
      onChoice: this.onPlayChoice,
    });
    this.mapSize = worldSize(grid.cols, grid.rows);
    this.view = createFittedCamera(
      this.mapSize,
      this.viewport(),
      this.settings.zoomLevel,
    );
    this.openCount = -1;
    this.debugOn = false;

    this.layer = this.add.container(0, 0);
    const terrainGfx = this.add.graphics();
    this.terrainGfx = terrainGfx;
    this.guideGfx = this.add.graphics();
    this.lockGfx = this.add.graphics();
    // Roads sit under buildings, so a road that meets a building tucks in beneath its body.
    this.roadGfx = this.add.graphics();
    this.buildingGfx = this.add.graphics();
    this.motorwayGfx = this.add.graphics();
    this.controlGfx = this.add.graphics();
    this.carGfx = this.add.graphics();
    this.previewGfx = this.add.graphics();
    this.previewGfx.setAlpha(0.4);
    this.ringGfx = this.add.graphics();
    this.overlayGfx = this.add.graphics().setVisible(false);
    this.gridGfx = this.add.graphics();
    this.drawBuildGrid(this.gridGfx, grid);
    this.gridGfx.setVisible(false);
    this.layer.add([
      terrainGfx,
      this.gridGfx,
      this.guideGfx,
      this.lockGfx,
      this.roadGfx,
      this.buildingGfx,
      this.motorwayGfx,
      this.controlGfx,
      this.carGfx,
      this.previewGfx,
      this.ringGfx,
      this.overlayGfx,
    ]);
    this.paletteId = demo ? 'default' : playedMap().palette;
    this.waterId = demo ? 'shared' : playedMap().waterPalette;
    this.pal = resolvePalette(
      this.paletteId,
      this.settings.theme,
      this.waterId,
    );
    this.cameras.main.setBackgroundColor(this.pal.background);
    this.terrainOutlines = demo ? null : playedMap().outlines;
    this.mapLabels = demo ? [] : playedMap().labels;
    this.guideLines = demo ? null : testMapGuide();
    this.drawTerrain(terrainGfx, grid, this.terrainOutlines);
    this.drawLabels();
    this.drawGuide(this.guideLines);
    this.guideGfx.setVisible(this.settings.motorwayGuide);
    // Demo maps bring their own buildings. Only the test map places the hand-listed ones;
    // Studio maps have none until the spawn field (M14).
    if (!demo && isTestMap()) this.placeTestBuildings();
    this.drawBuildings();

    // Screen-space text, not in the scaled layer, so it stays readable at any zoom.
    this.debugText = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cfd6de',
      })
      .setScrollFactor(0)
      .setDepth(10)
      .setVisible(false);
    this.meter = createTickMeter(this.time.now, this.sim.tick);

    // The end screen and crossing messages are screen-space too, drawn over the map.
    this.crossingText = this.add
      .text(this.scale.width / 2, 30, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f2c46d',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10)
      .setVisible(false);
    this.endGfx = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(20)
      .setVisible(false);
    this.endPanel = null;
    this.campaignId = demo || isTestMap() ? null : playedMap().id;
    this.ended = false;
    this.lastSavedWeek = weekOf(this.sim.tick);
    setRunSaver(this.saveNow);
    window.addEventListener('pagehide', this.saveNow);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.canvas = this.game.canvas;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    this.input.keyboard?.on('keydown-E', this.toggleTool);
    this.input.keyboard?.on('keydown-D', this.toggleDebug);
    this.input.keyboard?.on('keydown-R', this.restartIfOver);
    this.input.keyboard?.on('keydown-B', this.onBridgeKey);
    this.input.keyboard?.on('keydown-T', this.onTunnelKey);
    this.input.keyboard?.on('keydown-M', this.onMotorwayKey);
    this.input.keyboard?.on('keydown-O', this.onRoundaboutKey);
    this.input.keyboard?.on('keydown-L', this.onLightKey);
    this.input.keyboard?.on('keydown-F', this.onRoadKey);
    this.input.keyboard?.on('keydown-P', this.togglePause);
    this.input.keyboard?.on('keydown-H', this.onTutorialKey);
    this.input.keyboard?.on('keydown-G', this.onGuideKey);
    this.input.keyboard?.on('keydown-N', this.onThemeKey);
    this.input.keyboard?.on('keydown', this.onKey);
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    // Holding Space and dragging with the left button pans. Capture stops the page from scrolling.
    this.input.keyboard?.addCapture('SPACE');
    this.input.keyboard?.on('keydown-SPACE', this.onSpaceDown);
    this.input.keyboard?.on('keydown-ESC', this.onEscKey);
    this.input.keyboard?.on('keyup-SPACE', this.onSpaceUp);
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', this.teardown);
    this.applyTransform();
  }

  update(time: number, delta: number): void {
    const ticks = advanceClock(this.clock, delta);
    for (let i = 0; i < ticks; i++) {
      const before = this.sim.tick;
      for (const event of step(this.sim)) {
        const sound = soundForSimEvent(event);
        if (sound) audio.playEffect(sound);
      }
      // The clock ticks through the last hours of Sunday, before the week ends.
      const tock = weekEndSound(before, this.sim.tick, tuning.WEEK_TICKS);
      if (tock) audio.playEffect(tock);
    }
    // The music's stems follow traffic, pin pressure and the week.
    const demands = Object.values(this.sim.demand);
    audio.setStems(
      stemLevels({
        cars: this.sim.cars.length,
        pins: demands.reduce((sum, d) => sum + d.pins, 0),
        overflowing: demands.some((d) => d.overflow > 0),
        weekHour: hourOfWeek(this.sim.tick, tuning.WEEK_TICKS),
      }),
    );
    // Once each week the run is saved, so a reload resumes from the start of that week.
    if (ticks > 0 && weekOf(this.sim.tick) > this.lastSavedWeek) this.saveNow();

    // Timers fire here, not in an event, so a held finger can start an erase stroke.
    this.dispatch(updateTimers(this.mapper, time));
    this.panWithArrows(delta);
    // Debug mode draws its own grid, so this one hides then.
    this.gridGfx.setVisible(!this.debugOn && this.mapper.tool !== 'select');

    if (this.roadsDirty) {
      this.drawRoads();
      this.roadsDirty = false;
    }
    this.syncDistricts();
    this.drawCars(); // cars move every tick, so they are redrawn every frame
    this.drawCrossingPreview();
    this.drawMotorways();
    this.drawControls();
    this.drawRings();
    this.topBar.sync({
      paused: this.clock.paused || this.sim.offers.length > 0,
      speed: this.clock.speed,
      enabled: !this.sim.over,
      tick: this.sim.tick,
      trips: this.sim.tripsCompleted,
    });
    this.showCrossingLine(time);
    this.offerPanel.sync();
    if (this.sim.over && !this.ended) this.showEnd();
    if (this.debugOn) {
      if (this.overlayDirty) {
        this.drawOverlay();
        this.overlayDirty = false;
      }
      const rate = sampleTickRate(this.meter, time, this.sim.tick);
      this.debugText.setText(
        `ticks/s ${rate.toFixed(1)}  tick ${this.sim.tick}  budget ${this.sim.budget}  bridges ${this.sim.stock.bridge}  tunnels ${this.sim.stock.tunnel}${this.controller.note ? `  last: ${this.controller.note}` : ''}`,
      );
    }
    this.applyTransform();
  }

  /**
   * Shows the result of the last bridge or tunnel release for a few seconds, then the stock
   * while a crossing tool is picked, so an empty stock is visible before the drag.
   */
  private showCrossingLine(now: number): void {
    const report = this.controller.crossing;
    if (report && report.seq !== this.crossingSeq) {
      this.crossingSeq = report.seq;
      this.crossingUntil = now + CROSSING_MESSAGE_MS;
      this.setCrossingLine(
        report.kind === 'motorway'
          ? motorwayMessage(report.result)
          : report.kind === 'control'
            ? controlMessage(report.control, report.result)
            : crossingMessage(report.kind, report.result),
      );
    }
    if (now >= this.crossingUntil) {
      const tool = this.mapper.tool;
      const demo = DEMOS.find((d) => d.id === activeDemo());
      if (
        tool === 'bridge' ||
        tool === 'tunnel' ||
        tool === 'motorway' ||
        tool === 'roundabout' ||
        tool === 'light'
      ) {
        this.setCrossingLine(crossingHint(tool, this.sim.stock[tool]));
      } else if (tool === 'draw') {
        this.setCrossingLine('Road tool');
      } else if (demo) {
        this.setCrossingLine(demo.hint);
      } else {
        this.setCrossingLine('');
      }
    }
  }

  private setCrossingLine(line: string): void {
    if (line === this.crossingLine) return;
    this.crossingLine = line;
    this.crossingText.setText(line).setVisible(line !== '');
  }

  private viewport(): Size {
    return { width: this.scale.width, height: this.scale.height };
  }

  /** Canvas-relative position of a DOM event, in game pixels. */
  private canvasPoint(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private sample(e: PointerEvent): PointerSample {
    const kind: PointerKind =
      e.pointerType === 'touch' || e.pointerType === 'pen'
        ? e.pointerType
        : 'mouse';
    return {
      id: e.pointerId,
      kind,
      ...this.canvasPoint(e),
      button: e.button,
      time: this.time.now,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault(); // stops middle-click autoscroll
    if (this.sim.over) {
      this.scene.restart();
      return;
    }
    if (this.sim.offers.length > 0) return; // the choice popup waits; the clock is paused
    const sample = this.sample(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Some trackpad pointers can't be captured. Input still works without capture.
    }
    this.downIsTouch = e.pointerType === 'touch';
    this.dispatch(pointerDown(this.mapper, sample));
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.dispatch(pointerMove(this.mapper, this.sample(e)));
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.dispatch(pointerUp(this.mapper, this.sample(e)));
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.dispatch(pointerCancel(this.mapper, this.sample(e)));
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const lineScale = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    // A wheel zoom or pan moves the view, so an open waypoint chain no longer lines up.
    finishChain(this.mapper);
    this.dispatch(wheel(e.deltaY * lineScale, this.canvasPoint(e)));
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault(); // right button erases; the menu would get in the way
  };

  /** B and T pick the bridge and tunnel tools. Pressing the same key again returns to drawing. */
  private onBridgeKey = (): void => this.pickCrossing('bridge');
  private onTunnelKey = (): void => this.pickCrossing('tunnel');
  private onMotorwayKey = (): void => this.pickCrossing('motorway');
  private onRoundaboutKey = (): void => this.pickCrossing('roundabout');
  private onLightKey = (): void => this.pickCrossing('light');
  /** G shows or hides the motorway guide. */
  private onGuideKey = (): void =>
    this.applySettings(toggleGuide(this.settings));

  /** N switches light and dark mode. The ground, guide and buildings redraw in place. */
  private onThemeKey = (): void =>
    this.applySettings(toggleTheme(this.settings));

  /**
   * Applies a change from a key or the main menu: keeps it for later screens and games,
   * and redraws whatever it changes.
   */
  private applySettings(next: GameSettings): void {
    this.settings = next;
    saveSettings(next);
    this.guideGfx.setVisible(next.motorwayGuide);
    this.pal = resolvePalette(this.paletteId, next.theme, this.waterId);
    this.cameras.main.setBackgroundColor(this.pal.background);
    this.drawTerrain(this.terrainGfx, this.sim.grid, this.terrainOutlines);
    this.drawLabels();
    this.drawGuide(this.guideLines);
    this.drawBuildings();
    this.roadsDirty = true;
  }

  /**
   * The map's park, mountain and water names. Each sits over the ground and under the roads, in
   * the label colour for its kind in the current mode. Redrawn on a theme change, for the colour.
   */
  private drawLabels(): void {
    for (const text of this.labelTexts) text.destroy();
    this.labelTexts = [];
    for (const label of this.mapLabels) {
      const text = this.add
        .text(label.x * TILE_SIZE, label.y * TILE_SIZE, label.text, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${label.size * TILE_SIZE}px`,
          color: hexString(labelColour(this.pal, label.kind)),
        })
        .setOrigin(0.5)
        .setResolution(2);
      this.layer.addAt(text, this.layer.getIndex(this.roadGfx));
      this.labelTexts.push(text);
    }
  }

  private onRoadKey = (): void => {
    if (this.sim.offers.length > 0) return;
    setTool(this.mapper, this.mapper.tool === 'draw' ? 'select' : 'draw');
  };

  private pickCrossing(
    kind: 'bridge' | 'tunnel' | 'motorway' | 'roundabout' | 'light',
  ): void {
    if (this.sim.offers.length > 0) return;
    setTool(this.mapper, this.mapper.tool === kind ? 'select' : kind);
  }

  private toggleTool = (): void => {
    if (this.sim.offers.length > 0) return;
    setTool(this.mapper, this.mapper.tool === 'erase' ? 'select' : 'erase');
  };

  private onResize = (): void => {
    this.view = resizeCamera(
      this.view,
      this.mapSize,
      this.viewport(),
      this.settings.zoomLevel,
    );
    this.crossingText.setX(this.scale.width / 2);
    if (this.ended) this.showEnd();
    this.applyTransform();
  };

  /** Restarts the run, but only once it is over. R and taps during play do nothing. */
  private restartIfOver = (): void => {
    if (this.sim.over) this.scene.restart();
  };

  /** Fractional tile position, so the stroke can tell where the pointer sits within a tile. */
  private toTile = (screen: Vec2): TileXY => {
    const w = screenToWorld(this.view, this.viewport(), screen);
    return { x: w.x / TILE_SIZE, y: w.y / TILE_SIZE };
  };

  /** Follows the screen extent of a stroke, so a finished touch stroke can auto-zoom to it. */
  private trackStroke(intent: Intent): void {
    if (intent.type === 'stroke-begin') {
      this.strokeFromTouch = this.downIsTouch;
      this.strokeBox = null;
      this.extendStroke(intent.at);
    } else if (intent.type === 'stroke-move') {
      this.extendStroke(intent.at);
    } else if (intent.type === 'stroke-end') {
      if (intent.at) this.extendStroke(intent.at);
      const box = this.strokeBox;
      this.strokeBox = null;
      if (this.settings.touchAutoZoom && this.strokeFromTouch && box) {
        this.fitStroke(box);
      }
    } else if (intent.type === 'stroke-cancel') {
      this.strokeBox = null;
    }
  }

  private extendStroke(at: Vec2): void {
    const b = this.strokeBox;
    this.strokeBox = b
      ? {
          minX: Math.min(b.minX, at.x),
          minY: Math.min(b.minY, at.y),
          maxX: Math.max(b.maxX, at.x),
          maxY: Math.max(b.maxY, at.y),
        }
      : { minX: at.x, minY: at.y, maxX: at.x, maxY: at.y };
  }

  /** Zooms so a stroke's screen extent fills the view. A tap is too short to zoom to. */
  private fitStroke(screenBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): void {
    const span = Math.hypot(
      screenBox.maxX - screenBox.minX,
      screenBox.maxY - screenBox.minY,
    );
    if (span < STROKE_FIT_MIN_PX) return;
    const a = screenToWorld(this.view, this.viewport(), {
      x: screenBox.minX,
      y: screenBox.minY,
    });
    const b = screenToWorld(this.view, this.viewport(), {
      x: screenBox.maxX,
      y: screenBox.maxY,
    });
    this.view = fitBox(this.view, this.mapSize, this.viewport(), {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    });
    this.applyTransform();
  }

  private dispatch(intents: Intent[]): void {
    for (const intent of intents) {
      // Once the game is over the board is frozen. Only the view can still move.
      if (this.sim.over && intent.type !== 'pan' && intent.type !== 'zoom') {
        continue;
      }
      this.trackStroke(intent);
      if (intent.type === 'pan') {
        panCamera(this.view, this.mapSize, intent.dx, intent.dy);
      } else if (intent.type === 'zoom') {
        zoomCamera(
          this.view,
          this.mapSize,
          this.viewport(),
          intent.factor,
          intent.center,
        );
      } else {
        // The stroke and the last placement report, before and after, give the action's sounds.
        const stroke = this.controller.stroke;
        const tallyBefore = strokeTally(stroke);
        const reportBefore = placementReport(this.controller.crossing);
        if (applyIntent(this.controller, intent, this.toTile)) {
          this.roadsDirty = true;
          this.overlayDirty = true;
        }
        const after = this.controller.stroke ?? stroke;
        const sounds = actionSounds(
          after === stroke ? tallyBefore : EMPTY_TALLY,
          strokeTally(after),
          reportBefore,
          placementReport(this.controller.crossing),
        );
        for (const sound of sounds) audio.playEffect(sound);
      }
    }
  }

  /** Makes the layer's screen mapping match camera.ts: screen = (world - centre) * zoom + viewport / 2. */
  private applyTransform(): void {
    const v = this.viewport();
    const z = this.view.zoom;
    this.layer.setScale(z);
    this.layer.setPosition(
      v.width / 2 - this.view.center.x * z,
      v.height / 2 - this.view.center.y * z,
    );
  }

  /** Draws the motorway guide under the roads. A demo map has no guide, so it draws nothing. */
  private drawGuide(lines: { x: number; y: number }[][] | null): void {
    const gfx = this.guideGfx;
    gfx.clear();
    if (!lines) return;
    gfx.lineStyle(
      TILE_SIZE * GUIDE_STYLE.widthTiles,
      this.pal.guide,
      GUIDE_STYLE.alpha,
    );
    for (const line of guideWorldLines(lines)) {
      gfx.beginPath();
      line.forEach((p, k) => {
        if (k === 0) gfx.moveTo(p.x, p.y);
        else gfx.lineTo(p.x, p.y);
      });
      gfx.strokePath();
    }
  }

  /**
   * Draws the ground. Parks, mountains and water come from their smooth outlines, so they
   * look like the Studio. The tiles still decide play. Demo maps have no outlines and use tiles.
   * Each region has its primary colour and a thin border in the opposite mode's colour.
   */
  private drawTerrain(
    gfx: Phaser.GameObjects.Graphics,
    grid: Grid,
    outlines: CompiledMap['outlines'] | null,
  ): void {
    gfx.clear();
    gfx.fillStyle(this.pal.land, 1);
    gfx.fillRect(0, 0, this.mapSize.width, this.mapSize.height);
    if (outlines === null) {
      for (const t of terrainTiles(grid)) {
        gfx.fillStyle(this.terrainColour(t.kind), 1);
        gfx.fillRect(t.x, t.y, TILE_SIZE, TILE_SIZE);
      }
      return;
    }
    // The compiler paints parks, then mountains, then water on top. Draw in the same order.
    this.drawOutlines(gfx, outlines.parks, this.pal.park, this.pal.parkEdge);
    this.drawOutlines(
      gfx,
      outlines.mountains,
      this.pal.mountain,
      this.pal.mountainEdge,
    );
    this.drawOutlines(gfx, outlines.water, this.pal.water, this.pal.waterEdge);
  }

  /** The colour a tile of this terrain kind draws in the current palette. */
  private terrainColour(kind: TerrainKind): number {
    if (kind === Terrain.Water) return this.pal.water;
    if (kind === Terrain.Mountain) return this.pal.mountain;
    if (kind === Terrain.Park) return this.pal.park;
    return this.pal.land;
  }

  /**
   * Closed outlines are filled with a thin border; open ones are strokes as wide as the
   * outline says, in grid units, with the same border on each side.
   */
  private drawOutlines(
    gfx: Phaser.GameObjects.Graphics,
    paths: OutlinePath[],
    colour: number,
    edge: number,
  ): void {
    const trace = (path: OutlinePath): void => {
      gfx.beginPath();
      path.points.forEach((p, i) => {
        if (i === 0) gfx.moveTo(p.x * TILE_SIZE, p.y * TILE_SIZE);
        else gfx.lineTo(p.x * TILE_SIZE, p.y * TILE_SIZE);
      });
    };
    // Borders first, for every piece, then the fills on top. Overlapping pieces (a river and its
    // riverbank, say) then read as one body: only the outer edge of the union shows a border.
    for (const path of paths) {
      trace(path);
      if (path.closed) {
        gfx.closePath();
        gfx.lineStyle(BORDER_PX, edge, 1);
      } else {
        gfx.lineStyle((path.width ?? 0) * TILE_SIZE + BORDER_PX * 2, edge, 1);
      }
      gfx.strokePath();
    }
    for (const path of paths) {
      trace(path);
      if (path.closed) {
        gfx.closePath();
        gfx.fillStyle(colour, 1);
        gfx.fillPath();
      } else {
        gfx.lineStyle((path.width ?? 0) * TILE_SIZE, colour, 1);
        gfx.strokePath();
      }
    }
  }

  private placeTestBuildings(): void {
    for (const b of TEST_BUILDINGS) {
      const tile = b.row * this.sim.grid.cols + b.col;
      const result = placeBuilding(this.sim, {
        kind: b.kind,
        color: b.color,
        tile,
        entrance: b.entrance,
      });
      if (!result.ok)
        throw new Error(`test building refused: ${result.reason}`);
    }
  }

  private drawBuildings(): void {
    const gfx = this.buildingGfx;
    gfx.clear();
    // Buildings in a locked district are hidden until it opens.
    const visible = this.sim.buildings.filter((b) =>
      isOpenTile(this.sim, b.tile),
    );
    const shapes = buildingShapes(visible, this.sim.grid, BUILDING_COLORS);
    this.drawRoads();
    // Shadows first, so every building's shadow falls under its neighbours.
    gfx.fillStyle(this.pal.shadow, SHADOW_ALPHA);
    for (const s of shapes) {
      if (s.kind === 'square') {
        gfx.fillRect(s.x + SHADOW_DX, s.y + SHADOW_DY, s.size, s.size);
      } else if (s.kind === 'circle') {
        gfx.fillCircle(s.x + SHADOW_DX, s.y + SHADOW_DY, s.r);
      }
    }
    for (const s of shapes) {
      if (s.kind === 'square' && s.large) {
        const lip = LIP_FRAC * s.size;
        const corner = CORNER_FRAC * s.size;
        gfx.fillStyle(SIDE_BY_FACE.get(s.color) ?? s.color, 1);
        gfx.fillRoundedRect(s.x + lip, s.y + lip, s.size, s.size, corner);
        gfx.fillStyle(s.color, 1);
        gfx.fillRoundedRect(s.x, s.y, s.size, s.size, corner);
      } else if (s.kind === 'square') {
        gfx.fillStyle(SIDE_BY_FACE.get(s.color) ?? s.color, 1);
        gfx.fillRect(s.x, s.y + BUILDING_DEPTH_PX, s.size, s.size);
        gfx.fillStyle(s.color, 1);
        gfx.fillRect(s.x, s.y, s.size, s.size);
      } else if (s.kind === 'circle') {
        const lip = LIP_FRAC * s.r * 2;
        gfx.fillStyle(SIDE_BY_FACE.get(s.color) ?? s.color, 1);
        gfx.fillCircle(s.x + lip, s.y + lip, s.r);
        gfx.fillStyle(s.color, 1);
        gfx.fillCircle(s.x, s.y, s.r);
      } else {
        gfx.lineStyle(ENTRANCE_WIDTH, this.pal.road, 1);
        gfx.lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
    }
    if (this.settings.buildingSymbols) this.drawBuildingSymbols(shapes);
  }

  /**
   * Draws one symbol on each building, for the colour-blind option. A colour keeps its place in
   * the building palette, so it keeps its symbol wherever it appears.
   */
  private drawBuildingSymbols(shapes: ReturnType<typeof buildingShapes>): void {
    for (const s of shapes) {
      if (s.kind !== 'square' && s.kind !== 'circle') continue;
      const index = BUILDING_COLORS.indexOf(s.color);
      if (index < 0) continue;
      const symbol = buildingSymbol(index);
      const ink = symbolInk(s.color);
      if (s.kind === 'square') {
        drawSymbol(
          this.buildingGfx,
          symbol,
          s.x + s.size / 2,
          s.y + s.size / 2,
          SYMBOL_RADIUS * s.size,
          ink,
        );
      } else if (s.kind === 'circle') {
        drawSymbol(
          this.buildingGfx,
          symbol,
          s.x,
          s.y,
          SYMBOL_RADIUS * 2 * s.r,
          ink,
        );
      }
    }
  }

  private drawRoads(): void {
    const gfx = this.roadGfx;
    gfx.clear();
    const visible = this.sim.buildings.filter((b) =>
      isOpenTile(this.sim, b.tile),
    );
    // A road on land not yet open is a hidden house's stub, so it stays hidden with its house.
    const roads = Array.from(this.sim.roads, (r, i) =>
      r === 1 && !isOpenTile(this.sim, i) ? 0 : r,
    );
    const shapes = [
      ...roadShapes(this.sim.grid, roads, this.sim.links),
      ...entranceStubShapes(visible, this.sim.grid, roads),
      ...lotShapes(visible, this.sim.grid),
    ];
    // Kerb first, a little wider, then the pavement on top, so each road has a thin outline.
    this.paintRoadShapes(gfx, shapes, this.pal.kerb, BORDER_PX);
    this.paintRoadShapes(gfx, shapes, this.pal.road, 0);
    // A double lot's empty far half is an outline until its second building arrives.
    gfx.lineStyle(SPACE_LINE_PX, this.pal.kerb, 1);
    for (const b of visible) {
      if (
        b.kind !== 'destination' ||
        b.lot !== 'double' ||
        b.lotOwner !== undefined
      )
        continue;
      if (this.sim.buildings.some((o) => o.lotOwner === b.id)) continue;
      const far = lotAt(this.sim.grid, b.tile, b.entrance, 'double', 'far');
      if (!far) continue;
      const cols = far.footprint.map((t) => t % this.sim.grid.cols);
      const rows = far.footprint.map((t) => Math.floor(t / this.sim.grid.cols));
      gfx.strokeRect(
        Math.min(...cols) * TILE_SIZE,
        Math.min(...rows) * TILE_SIZE,
        (Math.max(...cols) - Math.min(...cols) + 1) * TILE_SIZE,
        (Math.max(...rows) - Math.min(...rows) + 1) * TILE_SIZE,
      );
    }
    // Parking spaces: outlined in the kerb colour, on each destination's pavement.
    for (const b of visible) {
      // A double lot's spaces are drawn once, from its near building.
      if (b.kind !== 'destination' || b.lotOwner !== undefined) continue;
      const layout = stripLayout(
        this.sim.grid,
        b.tile,
        b.entrance,
        b.lot ?? 'single',
      );
      if (!layout) continue;
      for (const space of layout.spaces) {
        gfx.strokePoints(
          space.map(
            (p) => new Phaser.Math.Vector2(p.x * TILE_SIZE, p.y * TILE_SIZE),
          ),
          true,
        );
      }
    }
  }

  /** Paints road shapes in one colour, each grown outwards by `grow` pixels. */
  private paintRoadShapes(
    gfx: Phaser.GameObjects.Graphics,
    shapes: ReturnType<typeof roadShapes>,
    colour: number,
    grow: number,
  ): void {
    gfx.fillStyle(colour, 1);
    for (const s of shapes) {
      if (s.kind === 'circle') gfx.fillCircle(s.x, s.y, s.r + grow);
      else if (s.kind === 'roundrect')
        gfx.fillRoundedRect(
          s.x - grow,
          s.y - grow,
          s.w + grow * 2,
          s.h + grow * 2,
          s.r + grow,
        );
      else if (s.kind === 'rect')
        gfx.fillRect(s.x - grow, s.y - grow, s.w + grow * 2, s.h + grow * 2);
      else {
        gfx.lineStyle(s.w + grow * 2, colour, 1);
        gfx.lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
    }
  }

  /** A bridge or tunnel being dragged shows its path, translucent, before it is built. */
  /**
   * Draws each motorway: its ramps in road colour where they meet the ground, and the raised
   * middle in motorway colour with a shadow. Handles show on the selected one, and a drag still
   * going shows as a translucent curve.
   */
  private drawMotorways(): void {
    const gfx = this.motorwayGfx;
    gfx.clear();
    const line = (
      points: CurvePoint[],
      width: number,
      colour: number,
      alpha: number,
    ): void => {
      gfx.lineStyle(width, colour, alpha);
      gfx.beginPath();
      points.forEach((p, k) => {
        if (k === 0) gfx.moveTo(p.x, p.y);
        else gfx.lineTo(p.x, p.y);
      });
      gfx.strokePath();
    };
    const px = (points: CurvePoint[]): CurvePoint[] =>
      points.map((p) => ({ x: p.x * TILE_SIZE, y: p.y * TILE_SIZE }));
    const width = TILE_SIZE * ROAD_WIDTH_TILES;
    // Shields are drawn after every motorway, so no road covers one. Numbers count up in the order placed.
    const badges: { at: CurvePoint; n: number }[] = [];
    let n = 0;
    for (const m of this.sim.motorways) {
      n += 1;
      const curve = motorwayCurve(this.sim.grid, m);
      badges.push({ at: badgeAnchor(curve), n });
      const parts = motorwayParts(curve);
      // The shadow is only under the raised middle, so it does not show at the ramps.
      line(
        px(parts.middle).map((p) => ({ x: p.x + 3, y: p.y + 4 })),
        width,
        0x000000,
        0.2,
      );
      line(px(parts.start), width, this.pal.road, 1);
      line(px(parts.end), width, this.pal.road, 1);
      line(
        px(parts.middle),
        width + MOTORWAY_CONTRAST_PX,
        this.pal.motorwayContrast,
        1,
      );
      line(px(parts.middle), width, this.pal.motorway, 1);
      if (this.controller.selected === m.id) {
        gfx.fillStyle(0xffffff, 1);
        for (const h of m.handles)
          gfx.fillCircle(h.x * TILE_SIZE, h.y * TILE_SIZE, 5);
      }
    }
    this.drawBadges(gfx, badges);
    const s = this.controller.stroke;
    if (s && s.mode === 'motorway') {
      const preview = motorwayPreview(this.sim.grid, s.drag);
      if (preview) line(px(preview), width, this.pal.motorway, 0.4);
    }
  }

  /** Draws each motorway's shield, with its number. The shields are drawn in the palette's badge colour on the paper colour. */
  private drawBadges(
    gfx: Phaser.GameObjects.Graphics,
    badges: { at: CurvePoint; n: number }[],
  ): void {
    const colour = this.pal.motorwayBadge;
    const hex = hexString(colour);
    badges.forEach(({ at, n }, k) => {
      const shield = shieldOutline(at).map(
        (p) => new Phaser.Math.Vector2(p.x * TILE_SIZE, p.y * TILE_SIZE),
      );
      gfx.fillStyle(this.pal.background, 1);
      gfx.lineStyle(BADGE_STROKE_TILES * TILE_SIZE, colour, 1);
      gfx.fillPoints(shield, true);
      gfx.strokePoints(shield, true);

      let text = this.badgeTexts[k];
      if (!text) {
        text = this.add
          .text(0, 0, '', {
            fontFamily: 'system-ui, sans-serif',
            fontStyle: 'bold',
            fontSize: `${BADGE_TEXT_TILES * TILE_SIZE}px`,
            color: hex,
          })
          .setOrigin(0.5)
          .setResolution(2)
          .setScale(BADGE_TEXT_SCALE_X, 1);
        this.layer.addAt(text, this.layer.getIndex(this.controlGfx));
        this.badgeTexts.push(text);
      }
      const label = String(n);
      if (text.text !== label) text.setText(label);
      if (text.style.color !== hex) text.setColor(hex);
      // Two digits sit a little low, as on the reference shields. A single digit is centred.
      const dy = label.length > 1 ? BADGE_H * 0.06 : 0;
      text
        .setPosition(at.x * TILE_SIZE, (at.y + dy) * TILE_SIZE)
        .setVisible(true);
    });
    for (let k = badges.length; k < this.badgeTexts.length; k++) {
      this.badgeTexts[k]!.setVisible(false);
    }
  }

  private drawCrossingPreview(): void {
    const gfx = this.previewGfx;
    gfx.clear();
    const s = this.controller.stroke;
    if (
      !s ||
      (s.mode !== 'bridge' && s.mode !== 'tunnel') ||
      s.path.length === 0
    )
      return;
    const preview = previewRoads(this.sim.grid, s.path);
    gfx.fillStyle(this.pal.road, 1);
    for (const sh of roadShapes(this.sim.grid, preview.roads, preview.links)) {
      if (sh.kind === 'circle') gfx.fillCircle(sh.x, sh.y, sh.r);
      else if (sh.kind === 'rect') gfx.fillRect(sh.x, sh.y, sh.w, sh.h);
      else if (sh.kind === 'line') {
        gfx.lineStyle(sh.w, this.pal.road, 1);
        gfx.lineBetween(sh.x1, sh.y1, sh.x2, sh.y2);
      }
    }
  }

  /**
   * Draws each car as a small rounded rectangle facing its direction of travel. carShapes gives one
   * shape per car, in the same order, so shapes[i] belongs to cars[i].
   */
  private drawCars(): void {
    const gfx = this.carGfx;
    gfx.clear();
    const shapes = carShapes(
      this.sim.cars,
      this.sim.buildings,
      this.sim.grid,
      BUILDING_COLORS,
      this.sim.motorways,
      this.sim.controls,
    );
    const headings = new Map<number, number>();
    this.sim.cars.forEach((car, i) => {
      const shape = shapes[i];
      if (!shape) return;
      const heading = this.carHeading(car) ?? this.carHeadings.get(car.id) ?? 0;
      headings.set(car.id, heading);
      const outline = carOutline(
        { x: shape.x, y: shape.y },
        heading,
        2 * shape.r,
      );
      gfx.fillStyle(shape.color, 1);
      gfx.fillPoints(
        outline.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
        true,
      );
    });
    this.carHeadings = headings;
  }

  /**
   * The way a car faces, from where it is a little before and a little after its current point.
   * Null when it is not moving (a parked car), so the caller keeps its last heading.
   */
  private carHeading(car: Car): number | null {
    const eps = 0.05;
    if (car.lot) {
      // A car in its lot faces along the lane, so it follows the lane's path rather than its road.
      const { path, s, length, phase } = car.lot;
      if (phase === 'parked' || length <= 0) return null;
      const lo = Math.max(0, s - eps);
      const hi = Math.min(length, s + eps);
      if (hi - lo < 1e-9) return null;
      return headingBetween(
        pointAtDistance(path, lo),
        pointAtDistance(path, hi),
      );
    }
    const lo = Math.max(0, car.along - eps);
    const hi = Math.min(1, car.along + eps);
    if (hi - lo < 1e-9) return null;
    const at = (along: number) =>
      carShapes(
        [{ ...car, along }],
        this.sim.buildings,
        this.sim.grid,
        BUILDING_COLORS,
        this.sim.motorways,
        this.sim.controls,
      )[0];
    const before = at(lo);
    const after = at(hi);
    if (!before || !after) return null;
    return headingBetween(before, after);
  }

  /** Draws each overflowing destination's countdown ring. Redrawn every frame, as the countdown moves. */
  /** Roundabouts as rings, and lights as a red or green dot on each axis, the green one on the axis that has it. */
  private drawControls(): void {
    const gfx = this.controlGfx;
    gfx.clear();
    const { cols } = this.sim.grid;
    const horizontal = greenIsHorizontal(this.sim);
    for (const [key, kind] of Object.entries(this.sim.controls)) {
      const tile = Number(key);
      const cx = ((tile % cols) + 0.5) * TILE_SIZE;
      const cy = (Math.floor(tile / cols) + 0.5) * TILE_SIZE;
      if (kind === 'roundabout') {
        // A donut: a road-coloured band with a dark outline, the tile's centre left open.
        const mid = TILE_SIZE * ROUNDABOUT_RING_TILES;
        const band = TILE_SIZE * 0.28;
        gfx.lineStyle(band + 3, CONTROL_OUTLINE_COLOUR, 1);
        gfx.strokeCircle(cx, cy, mid);
        gfx.lineStyle(band, this.pal.road, 1);
        gfx.strokeCircle(cx, cy, mid);
        // Hollow centre: the tile's own ground shows through, so the roads under it don't.
        const ground = this.terrainColour(
          this.sim.grid.terrain[tile] as TerrainKind,
        );
        gfx.fillStyle(ground, 1);
        gfx.fillCircle(cx, cy, mid - band / 2);
        continue;
      }
      const dot = TILE_SIZE * 0.22;
      const east: [number, number] = [cx + dot, cy];
      const north: [number, number] = [cx, cy - dot];
      const colourFor = (green: boolean) =>
        green ? LIGHT_GREEN_COLOUR : LIGHT_RED_COLOUR;
      gfx.fillStyle(colourFor(horizontal), 1);
      gfx.fillCircle(east[0], east[1], 3);
      gfx.fillStyle(colourFor(!horizontal), 1);
      gfx.fillCircle(north[0], north[1], 3);
    }
  }

  private drawRings(): void {
    const gfx = this.ringGfx;
    gfx.clear();
    gfx.lineStyle(3, OVERFLOW_RING_COLOR, 1);
    const rings = overflowRings(
      this.sim.buildings,
      this.sim.demand,
      this.sim.grid,
    );
    for (const ring of rings) {
      // Starts at the top and runs clockwise; the arc shrinks as the countdown runs out.
      const start = -Math.PI / 2;
      gfx.beginPath();
      gfx.arc(
        ring.x,
        ring.y,
        ring.r,
        start,
        start + 2 * Math.PI * ring.fraction,
        false,
      );
      gfx.strokePath();
    }
  }

  /**
   * Saves the run in progress. Only a campaign run that has not ended is saved: the test map and
   * demos keep nothing. Once the canvas has left the page, the game was destroyed and saves nothing.
   */
  private saveNow = (): void => {
    const id = this.campaignId;
    if (id === null || this.sim.over || !this.game.canvas.isConnected) return;
    saveRun('campaign', id, playedMap().contentHash, this.sim);
    this.lastSavedWeek = weekOf(this.sim.tick);
  };

  /**
   * Shows the end screen over the frozen board. The first call records the run and builds the
   * panel; a resize only redraws the dimming.
   */
  private showEnd(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.endGfx.setVisible(true).clear();
    this.endGfx.fillStyle(0x000000, 0.7);
    this.endGfx.fillRect(0, 0, w, h);
    if (this.endPanel) return;

    this.ended = true;
    const summary = summaryOf(this.sim);
    const id = this.campaignId;
    const previousBest =
      id === null ? null : (currentBest()[bestKey('campaign', id)] ?? null);
    if (id !== null) recordFinishedRun('campaign', id, summary.trips);
    const model = runEndModel({
      mapId: id,
      trips: summary.trips,
      previousBest,
      best: currentBest(),
      maps: CAMPAIGN_MAPS,
    });
    // One celebration, after the game-over sound has rung: a newly opened map, else a new best.
    const celebration = model.next?.unlockedNow
      ? 'map.unlocked'
      : model.newBest
        ? 'new.best'
        : null;
    if (celebration) {
      window.setTimeout(() => audio.playEffect(celebration), 1300);
    }

    const notes: string[] = [];
    if (model.best !== null) {
      notes.push(
        model.newBest
          ? `New best: ${model.best} trips`
          : `Best on this map: ${model.best} trips`,
      );
    }
    if (model.next?.open) notes.push(`Next map open: ${model.next.name}`);
    if (model.next && model.next.hint) notes.push(model.next.hint);

    const actions: RunEndAction[] = [
      { label: 'Play again', run: () => this.scene.restart() },
    ];
    if (model.next?.open) {
      const next = model.next;
      actions.push({
        label: `Play ${next.name}`,
        run: () => runActions()?.play({ kind: 'campaign', id: next.id }),
      });
    }
    actions.push({ label: 'Menu', run: () => runActions()?.menu() });

    this.endPanel = showRunEnd(endLines(summary), notes, actions);
  }

  /** Keys 1 to 4 pick a speed, when the key matches one of the speed options. */
  /** Arrow keys pan the view while they are held. */
  private panWithArrows(delta: number): void {
    const c = this.cursors;
    if (!c) return;
    const step = (PAN_KEY_PX_PER_SEC * delta) / 1000;
    const dx = (c.left.isDown ? 1 : 0) - (c.right.isDown ? 1 : 0);
    const dy = (c.up.isDown ? 1 : 0) - (c.down.isDown ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      panCamera(this.view, this.mapSize, dx * step, dy * step);
    }
  }

  /** Esc ends an open waypoint chain. */
  private onEscKey = (): void => finishChain(this.mapper);

  private onSpaceDown = (): void => {
    this.mapper.panHeld = true;
  };

  private onSpaceUp = (): void => {
    this.mapper.panHeld = false;
  };

  private onKey = (e: KeyboardEvent): void => {
    const speed = SPEED_OPTIONS.find((s) => String(s) === e.key);
    if (speed !== undefined) this.setGameSpeed(speed);
  };

  private setGameSpeed(speed: Speed): void {
    setSpeed(this.clock, speed);
    this.panel?.setSpeed(speed);
  }

  /** P stops and restarts the clock. A speed change leaves the pause as it is. */
  /** H opens the tutorial, pausing the clock if it was running. Closing it restores the clock. */
  private onTutorialKey = (): void => {
    if (this.tutorial) return;
    this.tutorialResumes = !this.clock.paused;
    setPaused(this.clock, true);
    this.tutorial = showTutorial(() => {
      this.tutorial = null;
      if (this.tutorialResumes) setPaused(this.clock, false);
    });
  };

  private togglePause = (): void => {
    setPaused(this.clock, !this.clock.paused);
  };

  /** The clock menu's play, pause or fast-forward button. */
  private onPlayChoice = (choice: PlayChoice): void => {
    const next = clockFor(choice, this.clock.speed);
    setPaused(this.clock, next.paused);
    this.setGameSpeed(next.speed);
  };

  /** Redraws the dimmed land and the buildings when a district opens. */
  private syncDistricts(): void {
    const open = openDistricts(this.sim.tick);
    if (open === this.openCount) return;
    // The first sync sets the count when the game starts; only a later rise is a district opening.
    if (this.openCount >= 0 && open > this.openCount) {
      audio.playEffect('district.opened');
    }
    this.openCount = open;
    // Stubs on the newly opened land appear with their houses.
    this.roadsDirty = true;
    this.drawLocks();
    this.drawBuildings();
  }

  private drawLocks(): void {
    const gfx = this.lockGfx;
    gfx.clear();
    gfx.fillStyle(0x000000, 0.45);
    for (const r of lockedTileRects(
      this.sim.grid,
      this.sim.districtOf,
      this.sim.tick,
    )) {
      gfx.fillRect(r.x, r.y, r.w, r.h);
    }
  }

  /** The debug panel and the overlays it goes with. D toggles all of them. */
  private toggleDebug = (): void => {
    this.debugOn = !this.debugOn;
    this.overlayGfx.setVisible(this.debugOn);
    this.debugText.setVisible(this.debugOn);
    this.overlayDirty = true;
    if (this.debugOn) {
      this.panel = createTuningPanel({
        onSpeed: (s) => this.setGameSpeed(s),
        onRestart: () => this.scene.restart(),
        onDemo: (id) => {
          setActiveDemo(id);
          this.scene.restart();
        },
        onGrant: (kind) => {
          this.sim.stock[kind] += 1;
        },
        onHotkey: (action) => this.runHotkey(action),
      });
      this.panel.setSpeed(this.clock.speed);
    } else {
      this.panel?.destroy();
      this.panel = null;
    }
  };

  /** Runs the same handler as the hotkey for an action, so the panel's buttons match the keys. */
  private runHotkey(action: HotkeyAction): void {
    switch (action) {
      case 'erase':
        this.toggleTool();
        return;
      case 'road':
        this.onRoadKey();
        return;
      case 'bridge':
        this.onBridgeKey();
        return;
      case 'tunnel':
        this.onTunnelKey();
        return;
      case 'motorway':
        this.onMotorwayKey();
        return;
      case 'roundabout':
        this.onRoundaboutKey();
        return;
      case 'light':
        this.onLightKey();
        return;
      case 'guide':
        this.onGuideKey();
        return;
      case 'theme':
        this.onThemeKey();
        return;
      case 'restart':
        this.restartIfOver();
        return;
    }
  }

  /** Tile grid lines, drawn once. */
  private drawBuildGrid(gfx: Phaser.GameObjects.Graphics, grid: Grid): void {
    gfx.lineStyle(1, DEBUG_PALETTE.grid, 0.6);
    for (let c = 0; c <= grid.cols; c++) {
      gfx.lineBetween(c * TILE_SIZE, 0, c * TILE_SIZE, grid.rows * TILE_SIZE);
    }
    for (let r = 0; r <= grid.rows; r++) {
      gfx.lineBetween(0, r * TILE_SIZE, grid.cols * TILE_SIZE, r * TILE_SIZE);
    }
  }

  /** Grid, graph edges and nodes, all read from the sim's own road graph. */
  private drawOverlay(): void {
    const gfx = this.overlayGfx;
    const shapes = debugShapes(this.sim.grid, this.sim.graph);
    gfx.clear();
    gfx.lineStyle(1, DEBUG_PALETTE.grid, 1);
    for (const l of shapes.grid) gfx.lineBetween(l.x1, l.y1, l.x2, l.y2);
    gfx.lineStyle(3, DEBUG_PALETTE.edge, 1);
    for (const e of shapes.edges) gfx.lineBetween(e.x1, e.y1, e.x2, e.y2);
    gfx.fillStyle(DEBUG_PALETTE.node, 1);
    for (const n of shapes.nodes) gfx.fillCircle(n.x, n.y, 5);
  }

  private teardown = (): void => {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.input.keyboard?.off('keydown-E', this.toggleTool);
    this.input.keyboard?.off('keydown-D', this.toggleDebug);
    this.input.keyboard?.off('keydown-R', this.restartIfOver);
    this.input.keyboard?.off('keydown-B', this.onBridgeKey);
    this.input.keyboard?.off('keydown-T', this.onTunnelKey);
    this.input.keyboard?.off('keydown-M', this.onMotorwayKey);
    this.input.keyboard?.off('keydown-O', this.onRoundaboutKey);
    this.input.keyboard?.off('keydown-L', this.onLightKey);
    this.input.keyboard?.off('keydown-G', this.onGuideKey);
    this.input.keyboard?.off('keydown-N', this.onThemeKey);
    this.input.keyboard?.off('keydown-F', this.onRoadKey);
    this.input.keyboard?.off('keydown-P', this.togglePause);
    this.input.keyboard?.off('keydown-H', this.onTutorialKey);
    this.tutorial?.destroy();
    this.tutorial = null;
    this.offerPanel.destroy();
    this.topBar.destroy();
    this.endPanel?.destroy();
    this.endPanel = null;
    this.input.keyboard?.off('keydown', this.onKey);
    this.input.keyboard?.off('keydown-SPACE', this.onSpaceDown);
    this.input.keyboard?.off('keydown-ESC', this.onEscKey);
    this.input.keyboard?.off('keyup-SPACE', this.onSpaceUp);
    this.panel?.destroy();
    this.panel = null;
    this.scale.off('resize', this.onResize);
    window.removeEventListener('pagehide', this.saveNow);
    document.removeEventListener('visibilitychange', this.onVisibility);
    setRunSaver(null);
  };
}
