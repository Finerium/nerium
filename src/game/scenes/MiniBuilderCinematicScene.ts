//
// src/game/scenes/MiniBuilderCinematicScene.ts
//
// Thalia-v2 Session B (W3) deliverable. The "Builder scaffold reveal"
// cinematic that plays after the player submits the Lumio brief in the
// Apollo Village dialogue. Scripted Phaser tween sequence over pre-
// generated tiles. No fal.ai frame generation anywhere (M1 Gate 1 Q5 lock
// plus RV.6 override, ADR-override-antipattern-7). The interface is stable
// so a post-hackathon swap to generated frames is a renderer swap, not a
// contract change.
//
// Conforms to:
//   - docs/contracts/game_event_bus.contract.md v0.1.0 (topics `game.cinematic.*`)
//   - docs/contracts/game_state.contract.md v0.1.0 (no direct store mutation;
//     bridge converts `game.cinematic.complete` to `fireTrigger` + `endCinematic`)
//   - docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md Section 3.6 step 6
//     (`cinematic:start`, `cinematic:complete`, `ui.cinematicPlaying` flips,
//     tileset reveal tween, music sting)
//
// Timeline (12,000 ms total, within the 10-15s hard bound):
//
//   phase 0  letterbox + fade in      0000 .. 0600 ms
//   phase 1  tile grid stagger        0600 .. 2400 ms
//   phase 2  22 agent sprite spawn    2400 .. 7200 ms
//   phase 3  connector fan-in         5200 .. 8400 ms  (overlaps phase 2 tail)
//   phase 4  MA highlight pulse       7800 .. 10000 ms
//   phase 5  camera pullback          8800 .. 11200 ms (easeOutCubic)
//   phase 6  narration beats          0600 .. 11200 ms (3 text fades)
//   phase 7  fade out + complete      11200 .. 12000 ms
//
// Fixture choice per gotcha 9: HISTORICAL 22-node (advisor 1 + leads 5 +
// ma_lane 1 + workers 15), inherited from the V3 Urania Blueprint Moment
// snapshot at app/builder/moment/BlueprintReveal.tsx. Rationale: the
// vertical slice demo narrates "NERIUM built itself" and the 22-agent team
// IS the actual hackathon pipeline. Mixing with the current-state 16-node
// RV roster would dilute the meta-narrative.
//
// Launch pattern: invoked by gameBridge in response to the quest effect
// `play_cinematic` emitted by the `prompt_submitted` step. Pairs a
// `this.scene.pause('ApolloVillage')` at start with `this.scene.resume`
// and `this.scene.stop('MiniBuilder')` on complete. ApolloVillageScene
// stays mounted behind the cinematic layer so no Phaser reload happens on
// return.
//
// React HUD boundary preserved: the cinematic renders only inside the
// Phaser canvas. HUD elements (DialogueOverlay, QuestTracker, etc.) stay
// mounted and may dim when Erato-v2's HUD reads `ui.cinematicPlaying=true`
// set by the bridge during launch. This scene NEVER renders HUD chrome.
//
// Owner: Thalia-v2 per M2 Section 4.4 output `src/game/scenes/MiniBuilderCinematicScene.ts`.
//

import * as Phaser from 'phaser';
import type { GameEventBus } from '../../state/GameEventBus';

// ---------- Scene configuration ----------

interface MiniBuilderSceneData {
  /** Cinematic key, expected value `mini_builder` per quest JSON. */
  key?: string;
  /** Optional parent scene to resume on completion. */
  returnToScene?: string;
}

const SCENE_KEY = 'MiniBuilder';
const DEFAULT_KEY = 'mini_builder';
const DEFAULT_RETURN_SCENE = 'ApolloVillage';

// Timing bucket in ms. Tune here, not in the choreography code below.
const T_FADE_IN_END = 600;
const T_GRID_START = 600;
const T_GRID_END = 2400;
const T_NODE_SPAWN_START = 2400;
const T_NODE_SPAWN_END = 7200;
const T_CONNECTOR_START = 5200;
const T_CONNECTOR_END = 8400;
const T_MA_PULSE_START = 7800;
const T_MA_PULSE_END = 10000;
const T_CAMERA_START = 8800;
const T_CAMERA_END = 11200;
const T_FADE_OUT_START = 11200;
const T_FADE_OUT_END = 12000;
const T_TOTAL_MS = 12000;

// Palette anchors mirror the Cyberpunk Shanghai reference in
// app/builder/moment/types.ts BLUEPRINT_PALETTE so the reveal feels like
// the same universe as the Urania Blueprint Moment.
const PALETTE = {
  bg_0: 0x06060c,
  bg_1: 0x0b0b18,
  cyan: 0x00f0ff,
  magenta: 0xff2e88,
  purple: 0x8b5cf6,
  gold: 0xffd166,
  ink: 0xe8ecff,
  ink_dim: 0x8888a8,
} as const;

// ---------- Historical 22-agent roster ----------

type Tier = 'advisor' | 'lead' | 'ma_lane' | 'worker';

interface RosterEntry {
  id: string;
  label: string;
  tier: Tier;
  pillar?: string;
}

// Snapshot verbatim from the V3 `NERIUM_TEAM_NODES` at
// app/builder/moment/BlueprintReveal.tsx. DO NOT silently merge with the
// RV-era roster; gotcha 9 compliance.
const ROSTER: ReadonlyArray<RosterEntry> = [
  { id: 'apollo', label: 'Apollo', tier: 'advisor' },
  { id: 'athena', label: 'Athena', tier: 'lead', pillar: 'builder' },
  { id: 'demeter', label: 'Demeter', tier: 'lead', pillar: 'marketplace' },
  { id: 'tyche', label: 'Tyche', tier: 'lead', pillar: 'banking' },
  { id: 'hecate', label: 'Hecate', tier: 'lead', pillar: 'registry' },
  { id: 'proteus', label: 'Proteus', tier: 'lead', pillar: 'protocol' },
  { id: 'heracles', label: 'Heracles', tier: 'ma_lane', pillar: 'builder' },
  { id: 'cassandra', label: 'Cassandra', tier: 'worker', pillar: 'builder' },
  { id: 'erato', label: 'Erato', tier: 'worker', pillar: 'builder' },
  { id: 'helios', label: 'Helios', tier: 'worker', pillar: 'builder' },
  { id: 'urania', label: 'Urania', tier: 'worker', pillar: 'builder' },
  { id: 'dionysus', label: 'Dionysus', tier: 'worker', pillar: 'builder' },
  { id: 'thalia', label: 'Thalia', tier: 'worker', pillar: 'builder' },
  { id: 'eos', label: 'Eos', tier: 'worker', pillar: 'marketplace' },
  { id: 'artemis', label: 'Artemis', tier: 'worker', pillar: 'marketplace' },
  { id: 'coeus', label: 'Coeus', tier: 'worker', pillar: 'marketplace' },
  { id: 'dike', label: 'Dike', tier: 'worker', pillar: 'banking' },
  { id: 'rhea', label: 'Rhea', tier: 'worker', pillar: 'banking' },
  { id: 'phoebe', label: 'Phoebe', tier: 'worker', pillar: 'registry' },
  { id: 'triton', label: 'Triton', tier: 'worker', pillar: 'protocol' },
  { id: 'morpheus', label: 'Morpheus', tier: 'worker', pillar: 'protocol' },
  { id: 'harmonia', label: 'Harmonia', tier: 'worker' },
];

// ---------- Narration beats ----------
// Three beats synced to the reveal phases. Strings inherit from the V3
// Urania Blueprint Moment narration voice (docs/demo_video_script.md
// Blueprint Moment section). Kept under 2 visual lines each per
// `narration_overlay.ts` cap.

interface NarrationBeat {
  startMs: number;
  endMs: number;
  text: string;
}

const NARRATION: ReadonlyArray<NarrationBeat> = [
  { startMs: 700, endMs: 3400, text: 'Apollo reads your brief.' },
  { startMs: 3600, endMs: 7400, text: 'Twenty two specialists wake. One pipeline forms.' },
  { startMs: 7600, endMs: 11000, text: 'Built with Opus 4.7. Heracles runs in Managed Agents.' },
];

// ---------- Scene ----------

/**
 * MiniBuilderCinematicScene: scripted "scaffold reveal" cinematic. Expected
 * to be launched via `this.scene.launch('MiniBuilder', { key: 'mini_builder' })`
 * from the gameBridge in response to the quest effect `play_cinematic`.
 * Pair with `this.scene.pause('ApolloVillage')` in the launch call so the
 * lobby pauses while this scene plays.
 */
export class MiniBuilderCinematicScene extends Phaser.Scene {
  private cinematicKey: string = DEFAULT_KEY;
  private returnToScene: string = DEFAULT_RETURN_SCENE;
  private startedAt: number = 0;
  private completed: boolean = false;
  private tweens_: Phaser.Tweens.Tween[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: SCENE_KEY } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: MiniBuilderSceneData = {}) {
    this.cinematicKey = data.key ?? DEFAULT_KEY;
    this.returnToScene = data.returnToScene ?? DEFAULT_RETURN_SCENE;
    this.startedAt = 0;
    this.completed = false;
    this.tweens_ = [];
    this.timers = [];
  }

  create() {
    this.startedAt = this.time.now;
    const bus = this.getBus();
    const worldWidth = this.scale.width;
    const worldHeight = this.scale.height;

    // Dedicated camera at zoom 1 so the cinematic coordinates are in
    // screen-space pixels, independent of ApolloVillage zoom state.
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.setScroll(0, 0);
    cam.setBackgroundColor(PALETTE.bg_0);

    // ---- Emit cinematic.start and sfx cue ----
    bus?.emit('game.cinematic.start', { key: this.cinematicKey });
    // Euterpe maps this to the `cinematic-sting.mp3` via the Kenney audio
    // pack staged by Talos W2. No-op today if audioStore not yet wired by
    // Euterpe; the emit is still observable for devtools.
    bus?.emit('game.audio.sfx_play', { sfxKey: 'cinematic-sting' });

    // ---- Phase 0: letterbox + fade-in dim layer ----
    this.buildLetterboxAndDim(worldWidth, worldHeight);

    // ---- Phase 1: grid stagger reveal ----
    const gridSprites = this.buildGridStagger(worldWidth, worldHeight);

    // ---- Phase 2: 22 node sprite spawn ----
    const nodePositions = this.buildNodeSpawns(worldWidth, worldHeight);

    // ---- Phase 3: connector fan-in graphics ----
    this.buildConnectors(nodePositions);

    // ---- Phase 4: MA highlight pulse on heracles ----
    const heracles = nodePositions.get('heracles');
    if (heracles) {
      this.buildMaHighlight(heracles.x, heracles.y);
    }

    // ---- Phase 5: camera pullback ----
    this.buildCameraPullback(cam);

    // ---- Phase 6: narration overlays ----
    this.buildNarration(worldWidth, worldHeight);

    // ---- Phase 7: final fade-out + completion signal ----
    this.scheduleCompletion(worldWidth, worldHeight);

    // Expose minimal state to Playwright smoke test per gotcha 5.
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        cinematicPlaying: true,
        cinematicKey: this.cinematicKey,
      };
    }

    // Clean teardown of tweens and timers on shutdown (also handles the
    // case where a new cinematic is launched mid-run or the player closes
    // the tab).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownTimeline());
  }

  // ---------- Phase builders ----------

  private buildLetterboxAndDim(width: number, height: number) {
    const topBar = this.add
      .rectangle(width / 2, -32, width, 64, 0x000000)
      .setDepth(200);
    const bottomBar = this.add
      .rectangle(width / 2, height + 32, width, 64, 0x000000)
      .setDepth(200);

    this.pushTween(
      this.tweens.add({
        targets: topBar,
        y: 32,
        duration: T_FADE_IN_END,
        ease: 'Cubic.easeOut',
      }),
    );
    this.pushTween(
      this.tweens.add({
        targets: bottomBar,
        y: height - 32,
        duration: T_FADE_IN_END,
        ease: 'Cubic.easeOut',
      }),
    );

    // Background dim rectangle so the cyan grid reads against the
    // Medieval Desert lobby sitting beneath the cinematic scene.
    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, PALETTE.bg_0, 0)
      .setDepth(5);
    this.pushTween(
      this.tweens.add({
        targets: dim,
        fillAlpha: 0.88,
        duration: T_FADE_IN_END,
        ease: 'Sine.easeIn',
      }),
    );
  }

  private buildGridStagger(width: number, height: number): Phaser.GameObjects.Rectangle[] {
    // Procedural tile grid drawn as Rectangles so the cinematic does not
    // depend on a Cyberpunk atlas frame being present. Each cell pulses
    // from the dim background into a faint cyan, cascading diagonally.
    const cols = 14;
    const rows = 9;
    const cell = Math.min(width / (cols + 2), height / (rows + 2));
    const gridOriginX = (width - cols * cell) / 2 + cell / 2;
    const gridOriginY = (height - rows * cell) / 2 + cell / 2;
    const sprites: Phaser.GameObjects.Rectangle[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = gridOriginX + col * cell;
        const y = gridOriginY + row * cell;
        const rect = this.add
          .rectangle(x, y, cell - 2, cell - 2, PALETTE.bg_1, 0)
          .setStrokeStyle(1, PALETTE.cyan, 0)
          .setDepth(10);
        const cascadeDelay = T_GRID_START + (col + row) * 30;
        this.pushTween(
          this.tweens.add({
            targets: rect,
            fillAlpha: 0.18,
            strokeAlpha: 0.45,
            delay: Math.max(0, cascadeDelay - T_GRID_START),
            duration: Math.max(1, T_GRID_END - cascadeDelay),
            ease: 'Sine.easeInOut',
          }),
        );
        sprites.push(rect);
      }
    }
    return sprites;
  }

  private buildNodeSpawns(
    width: number,
    height: number,
  ): Map<string, { x: number; y: number; label: string; tier: Tier }> {
    // Tier rows laid out vertically so the camera pullback later reads as
    // a hierarchy reveal (advisor at top, leads under, workers wide at
    // bottom). Coordinates are scene-space pixels at camera zoom 1.

    const map = new Map<string, { x: number; y: number; label: string; tier: Tier }>();

    const rowY = {
      advisor: height * 0.22,
      lead: height * 0.36,
      ma_lane: height * 0.5,
      worker: height * 0.66,
    };

    const advisors = ROSTER.filter((r) => r.tier === 'advisor');
    const leads = ROSTER.filter((r) => r.tier === 'lead');
    const maLane = ROSTER.filter((r) => r.tier === 'ma_lane');
    const workers = ROSTER.filter((r) => r.tier === 'worker');

    const layRow = (entries: ReadonlyArray<RosterEntry>, y: number) => {
      const count = entries.length;
      if (count === 0) return;
      const span = Math.min(width * 0.82, count * 64);
      const startX = (width - span) / 2;
      const stride = count > 1 ? span / (count - 1) : 0;
      entries.forEach((entry, idx) => {
        const x = count > 1 ? startX + idx * stride : width / 2;
        map.set(entry.id, { x, y, label: entry.label, tier: entry.tier });
      });
    };

    layRow(advisors, rowY.advisor);
    layRow(leads, rowY.lead);
    layRow(maLane, rowY.ma_lane);
    layRow(workers, rowY.worker);

    // Spawn cascade order mirrors the Blueprint Moment pullback cadence:
    // advisor first, leads, ma_lane, workers last. Stagger so 22 spawns
    // complete within T_NODE_SPAWN_START .. T_NODE_SPAWN_END.
    const spawnOrder: RosterEntry[] = [...advisors, ...leads, ...maLane, ...workers];
    const spawnWindow = T_NODE_SPAWN_END - T_NODE_SPAWN_START;
    const stepMs = spawnWindow / Math.max(1, spawnOrder.length);

    spawnOrder.forEach((entry, idx) => {
      const pos = map.get(entry.id);
      if (!pos) return;
      const nodeDelay = T_NODE_SPAWN_START + idx * stepMs;
      this.spawnNode(pos.x, pos.y, entry, nodeDelay);
    });

    return map;
  }

  private spawnNode(x: number, y: number, entry: RosterEntry, delayMs: number) {
    const tierColor = this.tierAccent(entry);
    const radius = entry.tier === 'advisor' ? 22 : entry.tier === 'lead' ? 18 : 14;

    // Outer glow circle: scales up from 0 plus fades in. Uses Graphics so
    // the ring color reads distinctly against the cyan grid.
    const glow = this.add.circle(x, y, radius + 10, tierColor, 0).setDepth(30);
    this.pushTween(
      this.tweens.add({
        targets: glow,
        delay: Math.max(0, delayMs - this.startedAt),
        fillAlpha: 0.25,
        scale: { from: 0.4, to: 1 },
        duration: 420,
        ease: 'Back.easeOut',
      }),
    );

    // Core dot.
    const core = this.add
      .circle(x, y, radius * 0.55, tierColor, 0)
      .setStrokeStyle(2, tierColor, 0)
      .setDepth(31);
    this.pushTween(
      this.tweens.add({
        targets: core,
        delay: Math.max(0, delayMs - this.startedAt),
        fillAlpha: 0.9,
        strokeAlpha: 1,
        scale: { from: 0.3, to: 1 },
        duration: 420,
        ease: 'Quad.easeOut',
      }),
    );

    // Gold flash pulse at spawn instant. Non-looping sting.
    const flash = this.add.circle(x, y, radius + 18, PALETTE.gold, 0).setDepth(29);
    this.pushTween(
      this.tweens.add({
        targets: flash,
        delay: Math.max(0, delayMs - this.startedAt),
        fillAlpha: { from: 0.55, to: 0 },
        scale: { from: 0.8, to: 1.6 },
        duration: 550,
        ease: 'Sine.easeOut',
      }),
    );

    // Label text. Uses 10px bitmap-style font via Phaser text for a
    // readable SNES feel without depending on an external font file.
    const label = this.add
      .text(x, y + radius + 12, entry.label, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8ecff',
      })
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(32);
    this.pushTween(
      this.tweens.add({
        targets: label,
        delay: Math.max(0, delayMs - this.startedAt) + 240,
        alpha: 0.85,
        duration: 360,
        ease: 'Sine.easeOut',
      }),
    );
  }

  private tierAccent(entry: RosterEntry): number {
    // Mirrors the accentColorForNode() logic in
    // app/builder/moment/BlueprintReveal.tsx so the cinematic stays
    // visually consistent with the Urania reveal component.
    if (entry.id === 'apollo') return PALETTE.gold;
    if (entry.tier === 'lead') return PALETTE.cyan;
    if (entry.tier === 'ma_lane') return PALETTE.magenta;
    if (entry.id === 'cassandra') return PALETTE.gold;
    return PALETTE.purple;
  }

  private buildConnectors(
    positions: Map<string, { x: number; y: number; label: string; tier: Tier }>,
  ) {
    // Fan-in lines from each lead toward apollo, plus a handful of
    // athena -> builder workers edges to evoke the pipeline shape. Lines
    // draw by tweening a `progress` scalar that a per-tick update rebuilds
    // the Graphics path against, so the stroke appears to extend.

    const apollo = positions.get('apollo');
    if (!apollo) return;

    const leadEdges: Array<[string, string]> = [
      ['athena', 'apollo'],
      ['demeter', 'apollo'],
      ['tyche', 'apollo'],
      ['hecate', 'apollo'],
      ['proteus', 'apollo'],
    ];

    const builderEdges: Array<[string, string]> = [
      ['athena', 'erato'],
      ['athena', 'helios'],
      ['athena', 'cassandra'],
      ['athena', 'heracles'],
      ['athena', 'dionysus'],
      ['apollo', 'urania'],
      ['helios', 'urania'],
    ];

    const marketplaceEdges: Array<[string, string]> = [
      ['demeter', 'eos'],
      ['demeter', 'artemis'],
      ['demeter', 'coeus'],
    ];

    const bankingEdges: Array<[string, string]> = [
      ['tyche', 'dike'],
      ['tyche', 'rhea'],
    ];

    const registryEdges: Array<[string, string]> = [
      ['hecate', 'phoebe'],
    ];

    const protocolEdges: Array<[string, string]> = [
      ['proteus', 'triton'],
      ['proteus', 'morpheus'],
    ];

    const drawEdge = (
      fromId: string,
      toId: string,
      color: number,
      delayMs: number,
      durationMs: number,
    ) => {
      const from = positions.get(fromId);
      const to = positions.get(toId);
      if (!from || !to) return;
      const g = this.add.graphics({ lineStyle: { width: 1.2, color, alpha: 0 } });
      g.setDepth(20);
      const state = { progress: 0, alpha: 0 };
      const redraw = () => {
        g.clear();
        g.lineStyle(1.2, color, state.alpha);
        g.beginPath();
        g.moveTo(from.x, from.y);
        const curX = from.x + (to.x - from.x) * state.progress;
        const curY = from.y + (to.y - from.y) * state.progress;
        g.lineTo(curX, curY);
        g.strokePath();
      };
      this.pushTween(
        this.tweens.add({
          targets: state,
          delay: Math.max(0, delayMs),
          progress: 1,
          alpha: 0.55,
          duration: durationMs,
          ease: 'Cubic.easeInOut',
          onUpdate: redraw,
          onComplete: redraw,
        }),
      );
    };

    // Lead to Apollo fan-in runs first (converges).
    leadEdges.forEach(([from, to], idx) => {
      const delay = T_CONNECTOR_START - this.startedAt + idx * 120;
      drawEdge(from, to, PALETTE.cyan, delay, 720);
    });

    // Pillar-specific edges pour in alongside.
    const remainderEdges = [
      ...builderEdges,
      ...marketplaceEdges,
      ...bankingEdges,
      ...registryEdges,
      ...protocolEdges,
    ];
    remainderEdges.forEach(([from, to], idx) => {
      const delay = T_CONNECTOR_START - this.startedAt + 300 + idx * 90;
      const color =
        from === 'athena' && to === 'heracles'
          ? PALETTE.magenta
          : PALETTE.purple;
      drawEdge(from, to, color, delay, 640);
    });
  }

  private buildMaHighlight(x: number, y: number) {
    // Reimplementation of the ma_highlight.tsx treatment for the Phaser
    // layer: magenta ring pulses, rotating dashed outer ring, and a
    // "MA CONSOLE TRACE LIVE" chip above the node. No Framer Motion here;
    // everything is Phaser Graphics plus this.tweens.
    const dashedRing = this.add
      .circle(x, y, 36, 0x000000, 0)
      .setStrokeStyle(1, PALETTE.magenta, 0)
      .setDepth(40);
    this.pushTween(
      this.tweens.add({
        targets: dashedRing,
        delay: Math.max(0, T_MA_PULSE_START - this.startedAt),
        strokeAlpha: 0.65,
        scale: { from: 0.9, to: 1.15 },
        duration: T_MA_PULSE_END - T_MA_PULSE_START,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: 1,
      }),
    );

    // Inner magenta halo pulse.
    const halo = this.add.circle(x, y, 28, PALETTE.magenta, 0).setDepth(39);
    this.pushTween(
      this.tweens.add({
        targets: halo,
        delay: Math.max(0, T_MA_PULSE_START - this.startedAt),
        fillAlpha: { from: 0.15, to: 0.48 },
        scale: { from: 0.85, to: 1.25 },
        duration: 900,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: 1,
      }),
    );

    // Console trace chip floats above the node.
    const chipY = y - 48;
    const chipBg = this.add
      .rectangle(x, chipY, 148, 18, PALETTE.magenta, 0.14)
      .setStrokeStyle(1, PALETTE.magenta, 0)
      .setDepth(41);
    const chipText = this.add
      .text(x, chipY, 'MA . CONSOLE TRACE LIVE', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ff2e88',
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0)
      .setDepth(42);

    this.pushTween(
      this.tweens.add({
        targets: [chipBg, chipText],
        delay: Math.max(0, T_MA_PULSE_START - this.startedAt + 200),
        alpha: 1,
        strokeAlpha: 0.8,
        duration: 360,
        ease: 'Cubic.easeOut',
      }),
    );
  }

  private buildCameraPullback(cam: Phaser.Cameras.Scene2D.Camera) {
    // Reuse the easeOutCubic feel from app/builder/moment/camera_pullback.ts
    // ("cubic" in the contract is the stronger pullback ease). Phaser's
    // built-in ease name 'Cubic.easeOut' matches that curve numerically.
    //
    // Camera begins at zoom 1.15 so the initial reveal feels a touch
    // "inside" the scene, then pulls back to 0.7 so the full 22-node
    // hierarchy fits comfortably. Values intentionally modest so the
    // cinematic does not feel like it crashes outward.
    cam.setZoom(1.15);
    const zoomState = { zoom: 1.15 };
    this.pushTween(
      this.tweens.add({
        targets: zoomState,
        delay: Math.max(0, T_CAMERA_START - this.startedAt),
        zoom: 0.7,
        duration: T_CAMERA_END - T_CAMERA_START,
        ease: 'Cubic.easeOut',
        onUpdate: () => cam.setZoom(zoomState.zoom),
        onComplete: () => cam.setZoom(0.7),
      }),
    );
  }

  private buildNarration(width: number, height: number) {
    // Three beats, each a centered bottom-third text block. A single
    // reusable text object updates its content as each beat transitions,
    // fading between strings so the overlay never double-stacks.
    const narrationText = this.add
      .text(width / 2, height * 0.86, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e8ecff',
        align: 'center',
        wordWrap: { width: Math.min(720, width * 0.72) },
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0)
      .setDepth(100);

    const chipBg = this.add
      .rectangle(width / 2, height * 0.86, Math.min(720, width * 0.78), 52, PALETTE.bg_0, 0)
      .setStrokeStyle(1, PALETTE.cyan, 0)
      .setDepth(99);

    NARRATION.forEach((beat, idx) => {
      const fadeInDelay = Math.max(0, beat.startMs - this.startedAt);
      const fadeOutDelay = Math.max(0, beat.endMs - this.startedAt);

      // Fade in.
      this.timers.push(
        this.time.delayedCall(fadeInDelay, () => {
          narrationText.setText(beat.text);
          this.pushTween(
            this.tweens.add({
              targets: narrationText,
              alpha: 1,
              duration: 320,
              ease: 'Sine.easeOut',
            }),
          );
          this.pushTween(
            this.tweens.add({
              targets: chipBg,
              fillAlpha: 0.72,
              strokeAlpha: 0.38,
              duration: 320,
              ease: 'Sine.easeOut',
            }),
          );
        }),
      );

      // Fade out (except last; the final fade-out rides the scene fade).
      if (idx < NARRATION.length - 1) {
        this.timers.push(
          this.time.delayedCall(fadeOutDelay, () => {
            this.pushTween(
              this.tweens.add({
                targets: narrationText,
                alpha: 0,
                duration: 240,
                ease: 'Sine.easeIn',
              }),
            );
          }),
        );
      }
    });
  }

  private scheduleCompletion(width: number, height: number) {
    // Fade-out overlay. A black rectangle above everything (depth 500)
    // rises to full opacity in the last 800 ms, then the scene emits
    // cinematic.complete and stops itself.
    const fadeOut = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setDepth(500);

    this.pushTween(
      this.tweens.add({
        targets: fadeOut,
        delay: Math.max(0, T_FADE_OUT_START - this.startedAt),
        fillAlpha: 1,
        duration: T_FADE_OUT_END - T_FADE_OUT_START,
        ease: 'Sine.easeIn',
        onComplete: () => this.finishCinematic(),
      }),
    );

    // Defensive: fallback timer in case the fade tween is cancelled or
    // dropped by a scene shutdown. Fires slightly after T_TOTAL_MS so the
    // onComplete path wins in the happy case but we still emit complete
    // if something goes sideways.
    this.timers.push(
      this.time.delayedCall(T_TOTAL_MS + 120, () => {
        if (!this.completed) this.finishCinematic();
      }),
    );
  }

  private finishCinematic() {
    if (this.completed) return;
    this.completed = true;

    const bus = this.getBus();
    const durationMs = Math.max(0, this.time.now - this.startedAt);

    bus?.emit('game.cinematic.complete', {
      key: this.cinematicKey,
      durationMs,
    });

    // Resume the lobby scene and stop this one. Using scene.stop here
    // rather than scene.sleep so the cinematic re-inits cleanly if it is
    // ever replayed (post-hackathon feature placeholder).
    const manager = this.scene;
    const target = this.returnToScene;
    if (manager && target && manager.manager.getScene(target)) {
      manager.resume(target);
    }

    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        cinematicPlaying: false,
        cinematicLastCompletedKey: this.cinematicKey,
        cinematicLastDurationMs: Math.round(durationMs),
      };
    }

    manager?.stop();
  }

  // ---------- Utilities ----------

  private getBus(): GameEventBus | undefined {
    return this.game.registry.get('gameEventBus') as GameEventBus | undefined;
  }

  private pushTween(tween: Phaser.Tweens.Tween) {
    this.tweens_.push(tween);
  }

  private teardownTimeline() {
    for (const tween of this.tweens_) {
      try {
        tween.remove();
      } catch (err) {
        console.error('[MiniBuilderCinematicScene] tween.remove threw', err);
      }
    }
    this.tweens_ = [];
    for (const timer of this.timers) {
      try {
        timer.remove(false);
      } catch (err) {
        console.error('[MiniBuilderCinematicScene] timer.remove threw', err);
      }
    }
    this.timers = [];
  }
}

// Re-export the scene key so callers (gameBridge, PhaserCanvas, tests)
// share the literal without stringly-typed drift.
export const MINI_BUILDER_SCENE_KEY = SCENE_KEY;
export const MINI_BUILDER_TOTAL_MS = T_TOTAL_MS;
