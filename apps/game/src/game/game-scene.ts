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
  setSpeed,
  type Speed,
  type SimState,
  step,
  summaryOf,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';
import { type CurvePoint, motorwayCurve } from '@overpass-game/sim';
import {
  BUILDING_COLORS,
  DEBUG_PALETTE,
  PALETTE,
  ROAD_WIDTH_TILES,
  TILE_SIZE,
} from '@overpass-game/render-style';
import {
  createIntentMapper,
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
  carShapes,
  entranceStubShapes,
  roadShapes,
  terrainTiles,
  ENTRANCE_WIDTH,
} from '../view/geometry.ts';
import { createTuningPanel, type TuningPanel } from '../debug/tuning-panel.ts';
import { createOfferPanel, type OfferPanel } from '../ui/offer-panel.ts';
import { previewRoads } from '../view/crossing-preview.ts';
import { motorwayPreview, motorwayParts } from '../view/motorway-view.ts';
import { guideWorldLines } from '../view/guide.ts';
import { GUIDE_STYLE } from '@overpass-game/render-style';
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  toggleGuide,
} from './settings.ts';
import { lockedTileRects } from '../view/districts.ts';
import { endLines, hudLine, OVERFLOW_RING_COLOR } from '../view/hud.ts';
import {
  CROSSING_MESSAGE_MS,
  controlMessage,
  crossingHint,
  crossingMessage,
  motorwayMessage,
} from '../view/crossing-message.ts';
import { overflowRings } from '../view/overflow.ts';
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
/** Speed of arrow-key panning, in screen pixels per second. */
const PAN_KEY_PX_PER_SEC = 600;
const LIGHT_GREEN_COLOUR = 0x5cb85c;
const LIGHT_RED_COLOUR = 0xd9534f;

const TERRAIN_COLOR: Partial<Record<TerrainKind, number>> = {
  [Terrain.Water]: PALETTE.water,
  [Terrain.Mountain]: PALETTE.mountain,
  [Terrain.Park]: PALETTE.park,
};

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
  private controller!: Controller;
  private view!: CameraState;
  private mapSize!: Size;
  private layer!: Phaser.GameObjects.Container;
  private roadGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private buildingGfx!: Phaser.GameObjects.Graphics;
  private motorwayGfx!: Phaser.GameObjects.Graphics;
  private guideGfx!: Phaser.GameObjects.Graphics;
  private settings: GameSettings = DEFAULT_SETTINGS;
  private controlGfx!: Phaser.GameObjects.Graphics;
  private carGfx!: Phaser.GameObjects.Graphics;
  private ringGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private crossingText!: Phaser.GameObjects.Text;
  /** Which crossing report is on screen, and when its message stops showing (ms). */
  private crossingSeq = 0;
  private crossingUntil = 0;
  private crossingLine = '';
  private endGfx!: Phaser.GameObjects.Graphics;
  private endTexts: Phaser.GameObjects.Text[] = [];
  private ended = false;
  private roadsDirty = true;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  /** Tile grid for building. Shown while a tool is picked, so placement lines up with tiles. */
  private gridGfx!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private offerPanel!: OfferPanel;
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
    const demo = activeDemo();
    if (demo) {
      this.sim = buildDemo(demo);
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
    this.controller = createController(this.sim);
    this.offerPanel = createOfferPanel(() => this.sim);
    this.mapSize = worldSize(grid.cols, grid.rows);
    this.view = createFittedCamera(this.mapSize, this.viewport());
    this.openCount = -1;
    this.debugOn = false;

    this.layer = this.add.container(0, 0);
    const terrainGfx = this.add.graphics();
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
    this.drawTerrain(terrainGfx, grid, demo ? null : playedMap().outlines);
    this.drawGuide(demo ? null : testMapGuide());
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

    // The HUD and end screen are screen-space too, drawn over the map.
    this.hudText = this.add
      .text(this.scale.width / 2, 8, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cfd6de',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);
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
    this.endTexts = [];
    this.ended = false;

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
    this.input.keyboard?.on('keydown-G', this.onGuideKey);
    this.input.keyboard?.on('keydown', this.onKey);
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    // Holding Space and dragging with the left button pans. Capture stops the page from scrolling.
    this.input.keyboard?.addCapture('SPACE');
    this.input.keyboard?.on('keydown-SPACE', this.onSpaceDown);
    this.input.keyboard?.on('keyup-SPACE', this.onSpaceUp);
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', this.teardown);
    this.applyTransform();
  }

  update(time: number, delta: number): void {
    const ticks = advanceClock(this.clock, delta);
    for (let i = 0; i < ticks; i++) step(this.sim);

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
    this.hudText.setText(hudLine(this.sim));
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
    const sample = this.sample(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Some trackpad pointers can't be captured. Input still works without capture.
    }
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
  private onGuideKey = (): void => {
    this.settings = toggleGuide(this.settings);
    this.guideGfx.setVisible(this.settings.motorwayGuide);
  };

  private onRoadKey = (): void => {
    setTool(this.mapper, this.mapper.tool === 'draw' ? 'select' : 'draw');
  };

  private pickCrossing(
    kind: 'bridge' | 'tunnel' | 'motorway' | 'roundabout' | 'light',
  ): void {
    setTool(this.mapper, this.mapper.tool === kind ? 'select' : kind);
  }

  private toggleTool = (): void => {
    setTool(this.mapper, this.mapper.tool === 'erase' ? 'select' : 'erase');
  };

  private onResize = (): void => {
    this.view = resizeCamera(this.view, this.mapSize, this.viewport());
    this.hudText.setX(this.scale.width / 2);
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

  private dispatch(intents: Intent[]): void {
    for (const intent of intents) {
      // Once the game is over the board is frozen. Only the view can still move.
      if (this.sim.over && intent.type !== 'pan' && intent.type !== 'zoom') {
        continue;
      }
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
      } else if (applyIntent(this.controller, intent, this.toTile)) {
        this.roadsDirty = true;
        this.overlayDirty = true;
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
      PALETTE.motorway,
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
   */
  private drawTerrain(
    gfx: Phaser.GameObjects.Graphics,
    grid: Grid,
    outlines: CompiledMap['outlines'] | null,
  ): void {
    gfx.fillStyle(PALETTE.land, 1);
    gfx.fillRect(0, 0, this.mapSize.width, this.mapSize.height);
    if (outlines === null) {
      for (const t of terrainTiles(grid)) {
        gfx.fillStyle(TERRAIN_COLOR[t.kind] ?? PALETTE.land, 1);
        gfx.fillRect(t.x, t.y, TILE_SIZE, TILE_SIZE);
      }
      return;
    }
    // The compiler paints parks, then mountains, then water on top. Draw in the same order.
    this.drawOutlines(gfx, outlines.parks, PALETTE.park);
    this.drawOutlines(gfx, outlines.mountains, PALETTE.mountain);
    this.drawOutlines(gfx, outlines.water, PALETTE.water);
  }

  /** Closed outlines are filled; open ones are strokes as wide as the outline says, in grid units. */
  private drawOutlines(
    gfx: Phaser.GameObjects.Graphics,
    paths: OutlinePath[],
    colour: number,
  ): void {
    for (const path of paths) {
      gfx.beginPath();
      path.points.forEach((p, i) => {
        if (i === 0) gfx.moveTo(p.x * TILE_SIZE, p.y * TILE_SIZE);
        else gfx.lineTo(p.x * TILE_SIZE, p.y * TILE_SIZE);
      });
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
    for (const s of buildingShapes(visible, this.sim.grid, BUILDING_COLORS)) {
      if (s.kind === 'square') {
        gfx.fillStyle(s.color, 1);
        gfx.fillRect(s.x, s.y, s.size, s.size);
      } else if (s.kind === 'circle') {
        gfx.fillStyle(s.color, 1);
        gfx.fillCircle(s.x, s.y, s.r);
      } else {
        gfx.lineStyle(ENTRANCE_WIDTH, PALETTE.road, 1);
        gfx.lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
    }
  }

  private drawRoads(): void {
    const gfx = this.roadGfx;
    gfx.clear();
    gfx.fillStyle(PALETTE.road, 1);
    const visible = this.sim.buildings.filter((b) =>
      isOpenTile(this.sim, b.tile),
    );
    const shapes = [
      ...roadShapes(this.sim.grid, this.sim.roads, this.sim.links),
      ...entranceStubShapes(visible, this.sim.grid, this.sim.roads),
    ];
    for (const s of shapes) {
      if (s.kind === 'circle') gfx.fillCircle(s.x, s.y, s.r);
      else if (s.kind === 'rect') gfx.fillRect(s.x, s.y, s.w, s.h);
      else {
        gfx.lineStyle(s.w, PALETTE.road, 1);
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
    for (const m of this.sim.motorways) {
      const parts = motorwayParts(motorwayCurve(this.sim.grid, m));
      // The shadow is only under the raised middle, so it does not show at the ramps.
      line(
        px(parts.middle).map((p) => ({ x: p.x + 3, y: p.y + 4 })),
        width,
        0x000000,
        0.2,
      );
      line(px(parts.start), width, PALETTE.road, 1);
      line(px(parts.end), width, PALETTE.road, 1);
      line(px(parts.middle), width, PALETTE.motorway, 1);
      if (this.controller.selected === m.id) {
        gfx.fillStyle(0xffffff, 1);
        for (const h of m.handles)
          gfx.fillCircle(h.x * TILE_SIZE, h.y * TILE_SIZE, 5);
      }
    }
    const s = this.controller.stroke;
    if (s && s.mode === 'motorway') {
      const preview = motorwayPreview(this.sim.grid, s.drag);
      if (preview) line(px(preview), width, PALETTE.motorway, 0.4);
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
    gfx.fillStyle(PALETTE.road, 1);
    for (const sh of roadShapes(this.sim.grid, preview.roads, preview.links)) {
      if (sh.kind === 'circle') gfx.fillCircle(sh.x, sh.y, sh.r);
      else if (sh.kind === 'rect') gfx.fillRect(sh.x, sh.y, sh.w, sh.h);
      else {
        gfx.lineStyle(sh.w, PALETTE.road, 1);
        gfx.lineBetween(sh.x1, sh.y1, sh.x2, sh.y2);
      }
    }
  }

  private drawCars(): void {
    const gfx = this.carGfx;
    gfx.clear();
    for (const c of carShapes(
      this.sim.cars,
      this.sim.buildings,
      this.sim.grid,
      BUILDING_COLORS,
      this.sim.motorways,
      this.sim.controls,
    )) {
      gfx.fillStyle(c.color, 1);
      gfx.fillCircle(c.x, c.y, c.r);
    }
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
        gfx.lineStyle(band, PALETTE.road, 1);
        gfx.strokeCircle(cx, cy, mid);
        // Hollow centre: the tile's own ground shows through, so the roads under it don't.
        const ground =
          TERRAIN_COLOR[this.sim.grid.terrain[tile] as TerrainKind] ??
          PALETTE.land;
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

  /** Shows the end screen over the frozen board, with the run's summary. */
  private showEnd(): void {
    this.ended = true;
    const w = this.scale.width;
    const h = this.scale.height;
    this.endGfx.setVisible(true).clear();
    this.endGfx.fillStyle(0x000000, 0.7);
    this.endGfx.fillRect(0, 0, w, h);
    for (const t of this.endTexts) t.destroy();
    const lines = endLines(summaryOf(this.sim));
    this.endTexts = lines.map((line, i) =>
      this.add
        .text(w / 2, h / 2 + (i - (lines.length - 1) / 2) * 36, line, {
          fontFamily: 'monospace',
          fontSize: i === 0 ? '28px' : '18px',
          color: '#f0f3f6',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(21),
    );
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

  /** Redraws the dimmed land and the buildings when a district opens. */
  private syncDistricts(): void {
    const open = openDistricts(this.sim.tick);
    if (open === this.openCount) return;
    this.openCount = open;
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
      });
      this.panel.setSpeed(this.clock.speed);
    } else {
      this.panel?.destroy();
      this.panel = null;
    }
  };

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
    this.input.keyboard?.off('keydown-F', this.onRoadKey);
    this.offerPanel.destroy();
    this.input.keyboard?.off('keydown', this.onKey);
    this.input.keyboard?.off('keydown-SPACE', this.onSpaceDown);
    this.input.keyboard?.off('keyup-SPACE', this.onSpaceUp);
    this.panel?.destroy();
    this.panel = null;
    this.scale.off('resize', this.onResize);
  };
}
