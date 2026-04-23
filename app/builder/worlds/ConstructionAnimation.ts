//
// ConstructionAnimation.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 (sprite
//              consumption), docs/contracts/world_aesthetic.contract.md
//              v0.1.0 (active world binding), docs/contracts/
//              event_bus.contract.md v0.1.0 (pipeline.step.completed
//              subscription).
// Owner Agent: Thalia (Builder Worker, P3b, 2D pixel worlds).
//
// Builder construction metaphor per NarasiGhaisan Section 8: user sees floors
// going up tile-by-tile as actual specialist agent completions emit events.
// Each pipeline.step.completed event adds a floor at the top of the tower;
// the completed specialist's agent sprite lands on that floor, torches flank
// both edges, and the sigil caps the tower once all specialists finish.
//
// Pixi.js is imported dynamically so the server bundle stays free of the
// WebGL runtime. Consumers call ConstructionAnimation.mount(container) from
// a client component (e.g., within a 'use client' React file) and tear down
// via unmount() on cleanup. World switch is a live update: setWorld(next)
// swaps the atlas texture and rebuilds the scene using the last snapshot so
// the completion history persists across worlds.
//

import type {
  EventBus,
  PipelineEvent,
  StepCompletedPayload,
  Unsubscribe,
} from '../../shared/events/pipeline_event';
import type { SpriteEntry } from './sprite_atlas_types';
import type { WorldId } from './world_aesthetic_types';
import { slotFrame, TILE_PX, ATLAS_PX } from './sprite_slots';
import { spriteAtlasRegistry } from './SpriteAtlasRegistry';
import { worldAestheticRegistry } from './WorldAestheticRegistry';

const TOWER_COLS = 5;
const MAX_FLOORS = 16;
const SCALE = 3;
const SCALED_TILE = TILE_PX * SCALE;
const PADDING = 2 * SCALED_TILE;

interface Floor {
  readonly specialist_id: string;
  readonly agent_sprite_id: 'agent_node_active' | 'agent_node_completed';
}

interface PixiModule {
  Application: new (options: unknown) => {
    init(options: unknown): Promise<void>;
    canvas: HTMLCanvasElement;
    stage: {
      addChild(child: unknown): void;
      removeChildren(): void;
    };
    ticker: { add(fn: (dt: unknown) => void): void };
    destroy(removeView: boolean, options?: unknown): void;
  };
  Container: new () => {
    addChild(child: unknown): void;
    removeChildren(): void;
    x: number;
    y: number;
  };
  Sprite: new (texture: unknown) => {
    x: number;
    y: number;
    width: number;
    height: number;
    alpha: number;
    tint: number;
    anchor: { set(x: number, y?: number): void };
    texture: unknown;
  };
  Texture: {
    from(source: string): unknown;
  };
  Assets: {
    load(source: string): Promise<{ source: unknown }>;
  };
  Rectangle: new (x: number, y: number, w: number, h: number) => unknown;
}

export interface ConstructionAnimationOptions {
  readonly session_id: string;
  readonly bus?: EventBus;
  readonly pipeline_run_id?: string;
  readonly initial_world?: WorldId;
  readonly max_floors?: number;
}

export class ConstructionAnimation {
  private container: HTMLElement | null = null;
  private app: InstanceType<PixiModule['Application']> | null = null;
  private pixi: PixiModule | null = null;
  private sceneRoot: InstanceType<PixiModule['Container']> | null = null;
  private unsubscribes: Unsubscribe[] = [];
  private floors: Floor[] = [];
  private world: WorldId;
  private tickerHandle: ((dt: unknown) => void) | null = null;
  private animElapsed = 0;
  private ambientOnVisible = true;
  private readonly maxFloors: number;

  constructor(private readonly options: ConstructionAnimationOptions) {
    this.world = options.initial_world ?? 'cyberpunk_shanghai';
    this.maxFloors = options.max_floors ?? MAX_FLOORS;
  }

  async mount(container: HTMLElement): Promise<void> {
    if (typeof window === 'undefined') return;
    this.container = container;
    this.pixi = (await import('pixi.js')) as unknown as PixiModule;
    const { Application, Container } = this.pixi;
    const app = new Application({});
    await app.init({
      width: TOWER_COLS * SCALED_TILE + PADDING * 2,
      height: this.maxFloors * SCALED_TILE + PADDING * 2,
      background: this.canvasBackground(),
      antialias: false,
      roundPixels: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.app = app;
    container.appendChild(app.canvas);
    this.sceneRoot = new Container();
    app.stage.addChild(this.sceneRoot);
    this.tickerHandle = (dt: unknown) => this.tick(dt);
    app.ticker.add(this.tickerHandle);
    await this.rebuildScene();
    this.subscribeToBus();
  }

  unmount(): void {
    for (const u of this.unsubscribes) {
      try {
        u();
      } catch {
        // idempotent per contract.
      }
    }
    this.unsubscribes = [];
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.sceneRoot = null;
    this.container = null;
    this.pixi = null;
  }

  async setWorld(next: WorldId): Promise<void> {
    if (this.world === next) return;
    this.world = next;
    await worldAestheticRegistry.setActiveForSession(
      this.options.session_id,
      next,
    );
    await this.rebuildScene();
  }

  getFloors(): ReadonlyArray<Floor> {
    return this.floors;
  }

  /** Externally add a floor without an event bus (Storybook or demo scripts). */
  async addFloor(specialist_id: string): Promise<void> {
    this.floors.push({ specialist_id, agent_sprite_id: 'agent_node_completed' });
    await this.rebuildScene();
  }

  private canvasBackground(): number {
    // Approximate background per world in sRGB hex for Pixi clear color.
    switch (this.world) {
      case 'medieval_desert':
        return 0xe8c57d;
      case 'cyberpunk_shanghai':
        return 0x06060c;
      case 'steampunk_victorian':
        return 0xe5d6b8;
      default:
        return 0x06060c;
    }
  }

  private async rebuildScene(): Promise<void> {
    if (!this.pixi || !this.app || !this.sceneRoot) return;
    const { Sprite, Texture, Rectangle, Assets } = this.pixi;
    this.sceneRoot.removeChildren();

    // Update canvas clear tint to match world palette.
    const app = this.app as unknown as { renderer?: { background?: { color: number } } };
    if (app.renderer?.background) {
      app.renderer.background.color = this.canvasBackground();
    }

    const descriptor = worldAestheticRegistry.get(this.world);
    const atlas = await spriteAtlasRegistry.loadAtlas(descriptor.sprite_atlas_id);

    const baseTexture = await Assets.load(atlas.image_path);
    const baseSource = (baseTexture as { source?: unknown }).source ?? baseTexture;

    const makeSprite = (sprite: SpriteEntry): InstanceType<PixiModule['Sprite']> => {
      const frame = sprite.frame ?? slotFrame('agent_idle');
      const rect = new Rectangle(frame.x, frame.y, frame.w, frame.h);
      const texture = new (Texture as unknown as { new (opts: unknown): unknown })({
        source: baseSource,
        frame: rect,
      });
      const s = new Sprite(texture);
      s.width = frame.w * SCALE;
      s.height = frame.h * SCALE;
      return s;
    };

    const resolveSprite = (spriteId: string): SpriteEntry => {
      const found = atlas.sprites.find((e) => e.sprite_id === spriteId);
      if (!found) throw new Error(`missing sprite ${spriteId}`);
      return found;
    };

    // Draw tiled ground at tower base (3 rows of floor_secondary tiles).
    const towerX = PADDING;
    const totalHeight = this.maxFloors * SCALED_TILE + PADDING * 2;
    const groundY = totalHeight - PADDING;
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = -1; gx <= TOWER_COLS; gx++) {
        const sprite = makeSprite(resolveSprite('builder_floor_secondary'));
        sprite.x = towerX + gx * SCALED_TILE;
        sprite.y = groundY + gy * SCALED_TILE;
        this.sceneRoot.addChild(sprite);
      }
    }

    // Render floors from bottom up. floor index 0 is the lowest completed floor.
    const floors = this.floors.slice(0, this.maxFloors);
    for (let i = 0; i < floors.length; i++) {
      const floor = floors[i];
      const yTop = groundY - (i + 1) * SCALED_TILE;
      const rowSprites = this.wallRow();
      for (let col = 0; col < TOWER_COLS; col++) {
        const sprite = makeSprite(resolveSprite(rowSprites[col]));
        sprite.x = towerX + col * SCALED_TILE;
        sprite.y = yTop;
        this.sceneRoot.addChild(sprite);
      }
      // Agent sprite sits centered above the arch.
      const agentSprite = makeSprite(resolveSprite(floor.agent_sprite_id));
      agentSprite.x = towerX + Math.floor(TOWER_COLS / 2) * SCALED_TILE;
      agentSprite.y = yTop - SCALED_TILE;
      this.sceneRoot.addChild(agentSprite);
    }

    // Top crown: place sigil above the last floor when the tower is complete.
    if (floors.length >= this.maxFloors) {
      const sigil = makeSprite(resolveSprite('ui_sigil_world'));
      sigil.x = towerX + Math.floor(TOWER_COLS / 2) * SCALED_TILE;
      sigil.y = groundY - (floors.length + 1) * SCALED_TILE;
      this.sceneRoot.addChild(sigil);
    }

    // Ambient lamps flanking the tower base.
    for (const side of [-1, TOWER_COLS]) {
      const lamp = makeSprite(resolveSprite('ambient_on'));
      lamp.x = towerX + side * SCALED_TILE;
      lamp.y = groundY - SCALED_TILE;
      this.sceneRoot.addChild(lamp);
    }
  }

  private wallRow(): string[] {
    return [
      'builder_corner_outer',
      'builder_wall_solid',
      'builder_arch_opening',
      'builder_wall_accent',
      'builder_corner_outer',
    ];
  }

  private tick(dt: unknown): void {
    const delta = typeof dt === 'number' ? dt : 1;
    this.animElapsed += delta;
    // Ambient flicker cadence tracker. Full texture-swap implementation is
    // ADR-09 follow-up; this hook exists so Harmonia P4 can attach the swap
    // without rewiring the ticker.
    if (this.animElapsed > 15) {
      this.animElapsed = 0;
      this.ambientOnVisible = !this.ambientOnVisible;
    }
  }

  private subscribeToBus(): void {
    const { bus, pipeline_run_id } = this.options;
    if (!bus) return;
    this.unsubscribes.push(
      bus.subscribe<StepCompletedPayload>(
        'pipeline.step.completed',
        (event: PipelineEvent<StepCompletedPayload>) => {
          if (
            pipeline_run_id !== undefined &&
            event.pipeline_run_id !== pipeline_run_id
          ) {
            return;
          }
          this.floors.push({
            specialist_id: event.payload.specialist_id,
            agent_sprite_id: 'agent_node_completed',
          });
          void this.rebuildScene();
        },
      ),
    );
    this.unsubscribes.push(
      bus.subscribe<{ specialist_id: string }>(
        'pipeline.step.started',
        (event) => {
          if (
            pipeline_run_id !== undefined &&
            event.pipeline_run_id !== pipeline_run_id
          ) {
            return;
          }
          // Decorate the current floor-under-construction as active; simplest
          // form: re-render with the upcoming slot marked agent_node_active.
          this.floors.push({
            specialist_id: event.payload.specialist_id,
            agent_sprite_id: 'agent_node_active',
          });
          void this.rebuildScene();
        },
      ),
    );
  }
}

/** Convenience factory matching the older call sites (Builder demo wiring). */
export function createConstructionAnimation(
  options: ConstructionAnimationOptions,
): ConstructionAnimation {
  return new ConstructionAnimation(options);
}

export { TOWER_COLS, MAX_FLOORS, SCALE, ATLAS_PX };
