import Phaser from 'phaser';
import {
  advanceClock,
  type Clock,
  createClock,
  createSim,
  type Grid,
  type SimState,
  step,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';
import { DEBUG_PALETTE, PALETTE, TILE_SIZE } from '@overpass-game/render-style';
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
  worldToTile,
  zoomCamera,
} from '../view/camera.ts';
import { debugShapes } from '../view/debug-geometry.ts';
import { roadShapes, terrainTiles } from '../view/geometry.ts';
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
import { buildTestGrid } from './test-map.ts';

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
  private roadsDirty = true;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private debugOn = false;
  private overlayDirty = true;
  private meter!: TickMeter;
  private canvas!: HTMLCanvasElement;

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
    this.roadGfx = this.add.graphics();
    this.overlayGfx = this.add.graphics().setVisible(false);
    this.layer.add([terrainGfx, this.roadGfx, this.overlayGfx]);
    this.drawTerrain(terrainGfx, grid);

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
    if (this.debugOn) {
      if (this.overlayDirty) {
        this.drawOverlay();
        this.overlayDirty = false;
      }
      const rate = sampleTickRate(this.meter, time, this.sim.tick);
      this.debugText.setText(
        `ticks/s ${rate.toFixed(1)}  tick ${this.sim.tick}  budget ${this.sim.budget}`,
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
    this.canvas.setPointerCapture(e.pointerId);
    this.dispatch(pointerDown(this.mapper, this.sample(e)));
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
    this.applyTransform();
  };

  private toTile = (screen: Vec2): TileXY =>
    worldToTile(screenToWorld(this.view, this.viewport(), screen));

  private dispatch(intents: Intent[]): void {
    for (const intent of intents) {
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

  private drawRoads(): void {
    const gfx = this.roadGfx;
    gfx.clear();
    gfx.fillStyle(PALETTE.road, 1);
    for (const s of roadShapes(this.sim.grid, this.sim.roads)) {
      if (s.kind === 'circle') gfx.fillCircle(s.x, s.y, s.r);
      else gfx.fillRect(s.x, s.y, s.w, s.h);
    }
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
    this.scale.off('resize', this.onResize);
  };
}
