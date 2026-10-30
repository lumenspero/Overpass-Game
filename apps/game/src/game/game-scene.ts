import Phaser from 'phaser';
import {
  advanceClock,
  type Clock,
  createClock,
  createSim,
  placeBuilding,
  type Grid,
  type SimState,
  step,
  summaryOf,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';
import {
  BUILDING_COLORS,
  DEBUG_PALETTE,
  PALETTE,
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
  roadShapes,
  terrainTiles,
  ENTRANCE_WIDTH,
} from '../view/geometry.ts';
import { endLines, hudLine, OVERFLOW_RING_COLOR } from '../view/hud.ts';
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
import { buildTestGrid, TEST_BUILDINGS } from './test-map.ts';

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
  private buildingGfx!: Phaser.GameObjects.Graphics;
  private carGfx!: Phaser.GameObjects.Graphics;
  private ringGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private endGfx!: Phaser.GameObjects.Graphics;
  private endTexts: Phaser.GameObjects.Text[] = [];
  private ended = false;
  private roadsDirty = true;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private debugOn = false;
  private overlayDirty = true;
  private meter!: TickMeter;
  private canvas!: HTMLCanvasElement;
  /** Diagnostic: how many presses reached the canvas, and the last one. Shown with D. */
  private pressCount = 0;
  private lastPress = 'none yet';

  constructor() {
    super('game');
  }

  create(): void {
    const grid: Grid = buildTestGrid();
    this.sim = createSim({ seed: 1, grid });
    this.clock = createClock();
    this.mapper = createIntentMapper();
    this.controller = createController(this.sim);
    this.mapSize = worldSize(grid.cols, grid.rows);
    this.view = createFittedCamera(this.mapSize, this.viewport());

    this.layer = this.add.container(0, 0);
    const terrainGfx = this.add.graphics();
    this.buildingGfx = this.add.graphics();
    this.roadGfx = this.add.graphics();
    this.carGfx = this.add.graphics();
    this.ringGfx = this.add.graphics();
    this.overlayGfx = this.add.graphics().setVisible(false);
    this.layer.add([
      terrainGfx,
      this.buildingGfx,
      this.roadGfx,
      this.carGfx,
      this.ringGfx,
      this.overlayGfx,
    ]);
    this.drawTerrain(terrainGfx, grid);
    this.placeTestBuildings();
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
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', this.teardown);
    this.applyTransform();
  }

  update(time: number, delta: number): void {
    const ticks = advanceClock(this.clock, delta);
    for (let i = 0; i < ticks; i++) step(this.sim);

    // Timers fire here, not in an event, so a held finger can start an erase stroke.
    this.dispatch(updateTimers(this.mapper, time));

    if (this.roadsDirty) {
      this.drawRoads();
      this.roadsDirty = false;
    }
    this.drawCars(); // cars move every tick, so they are redrawn every frame
    this.drawRings();
    this.hudText.setText(hudLine(this.sim));
    if (this.sim.over && !this.ended) this.showEnd();
    if (this.debugOn) {
      if (this.overlayDirty) {
        this.drawOverlay();
        this.overlayDirty = false;
      }
      const rate = sampleTickRate(this.meter, time, this.sim.tick);
      this.debugText.setText(
        `ticks/s ${rate.toFixed(1)}  tick ${this.sim.tick}  budget ${this.sim.budget}\n` +
          `presses ${this.pressCount}  last: ${this.lastPress}`,
      );
    }
    this.applyTransform();
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
    this.pressCount += 1;
    this.lastPress = `${sample.kind} button ${sample.button} at ${Math.round(sample.x)},${Math.round(sample.y)}`;
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

  private toggleTool = (): void => {
    setTool(this.mapper, this.mapper.tool === 'draw' ? 'erase' : 'draw');
  };

  private onResize = (): void => {
    this.view = resizeCamera(this.view, this.mapSize, this.viewport());
    this.hudText.setX(this.scale.width / 2);
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

  private drawTerrain(gfx: Phaser.GameObjects.Graphics, grid: Grid): void {
    gfx.fillStyle(PALETTE.land, 1);
    gfx.fillRect(0, 0, this.mapSize.width, this.mapSize.height);
    for (const t of terrainTiles(grid)) {
      gfx.fillStyle(TERRAIN_COLOR[t.kind] ?? PALETTE.land, 1);
      gfx.fillRect(t.x, t.y, TILE_SIZE, TILE_SIZE);
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
    for (const s of buildingShapes(
      this.sim.buildings,
      this.sim.grid,
      BUILDING_COLORS,
    )) {
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
    for (const s of roadShapes(this.sim.grid, this.sim.roads)) {
      if (s.kind === 'circle') gfx.fillCircle(s.x, s.y, s.r);
      else if (s.kind === 'rect') gfx.fillRect(s.x, s.y, s.w, s.h);
      else {
        gfx.lineStyle(s.w, PALETTE.road, 1);
        gfx.lineBetween(s.x1, s.y1, s.x2, s.y2);
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
    )) {
      gfx.fillStyle(c.color, 1);
      gfx.fillCircle(c.x, c.y, c.r);
    }
  }

  /** Draws each overflowing destination's countdown ring. Redrawn every frame, as the countdown moves. */
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

  private toggleDebug = (): void => {
    this.debugOn = !this.debugOn;
    this.overlayGfx.setVisible(this.debugOn);
    this.debugText.setVisible(this.debugOn);
    this.overlayDirty = true;
  };

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
    this.scale.off('resize', this.onResize);
  };
}
