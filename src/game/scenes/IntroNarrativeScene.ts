//
// src/game/scenes/IntroNarrativeScene.ts
//
// Aether-Vercel T6 Phase 1.6: cinematic 5-scene narrative intro that
// plays the first time a visitor lands on /play. Default-on for first
// visit (sessionStorage flag `nerium.intro_seen` gates replay), three
// redundant skip paths (ESC + click + button), then auto-routes to
// ApolloVillageScene.
//
// Sub-scenes
// ----------
// s1_hook (0:00 to 0:06)         single phos-green cursor + headline
//                                "You have already felt this."
// s2_problem (0:06 to 0:14)      paragraph reveal of the agent
//                                ecosystem fragmentation problem.
// s3_brand (0:14 to 0:22)        NERIUM wordmark pixel-build + tagline.
// s4_pillars (0:22 to 0:42)      five cards spotlight each pillar at
//                                ~4s per pillar. BUILDER hero emphasis.
// s5_founder (0:42 to 0:50)      founder credit + keypress prompt.
//
// Transitions: 200ms crossfade default. Glitch frame (~80ms pixel
// scramble) between s2-s3 and s4-s5.
//
// Skip mechanism (3 redundant paths)
// - ESC keypress
// - Click anywhere on canvas (excluding the explicit skip button itself)
// - Top-right "Skip Intro [ESC]" button
//
// sessionStorage contract
// - Read `nerium.intro_seen`. If null AND `?intro=0` is NOT present,
//   the scene plays. Otherwise route directly to ApolloVillageScene.
// - `?intro=1` query param force-replays even if the flag is set.
// - After completion or skip, set the flag.
//
// Visual aesthetic
// - Background base #04060C linear gradient to #0A0E1A
// - Phos green oklch(0.88 0.15 140) for headlines + emphasis
// - Bone oklch(0.95 0.01 85) ~= #F1ECE0 for body
// - Cyan #22E8FF + magenta #FF2E88 + violet #B57EFF on pillar trim
// - CRT scanlines 3% opacity full-screen
// - Vignette corners max 25%
// - Dot grid 32px 10% opacity (s2 + s4 only)
//
// Typography
// - VT323 (Google Fonts) for headlines
// - Space Grotesk (Google Fonts) for body
// - JetBrains Mono for labels
//
// Per V6 text persistence rule: pillar descriptive text never drops
// below 80% opacity once revealed. Inactive pillars dim to 80% but
// stay legible.
//
// No em dash, no emoji.
//

import * as Phaser from 'phaser';

const SCENE_KEY = 'IntroNarrative';
const NEXT_SCENE = 'ApolloVillage';
const NEXT_SCENE_DATA = { worldId: 'medieval_desert' };
const SS_KEY_INTRO_SEEN = 'nerium.intro_seen';

const CRT_SCANLINE_ALPHA = 0.03;
const VIGNETTE_ALPHA = 0.25;
const DOT_GRID_ALPHA = 0.1;
const DOT_GRID_SPACING = 32;

const COLOR_INK_HEX = 0x04060c;
const COLOR_INK_END_HEX = 0x0a0e1a;
const COLOR_PHOS = '#9be565'; // approximation of oklch(0.88 0.15 140)
const COLOR_BONE = '#f1ece0';
const COLOR_CYAN = '#22e8ff';
const COLOR_MAGENTA = '#ff2e88';
const COLOR_VIOLET = '#b57eff';
const COLOR_DIM = '#6e7787';

const GLITCH_DURATION_MS = 80;
const CROSSFADE_DURATION_MS = 200;
const TYPEWRITER_HEADLINE_CHARS_PER_SEC = 32;
const TYPEWRITER_BODY_CHARS_PER_SEC = 56;

interface PillarDef {
  key: string;
  label: string;
  description: string;
  accent: string;
  hero?: boolean;
}

const PILLAR_DEFS: PillarDef[] = [
  {
    key: 'marketplace',
    label: 'MARKETPLACE',
    description:
      'A real home for your agents,\nprompts, skills, MCP servers.\nDiscoverable. Rated. Monetized.',
    accent: COLOR_CYAN,
  },
  {
    key: 'builder',
    label: 'BUILDER',
    description:
      'Type one sentence.\nA team of specialist agents\nbuilds your project end to end.',
    accent: COLOR_PHOS,
    hero: true,
  },
  {
    key: 'banking',
    label: 'BANKING',
    description:
      'Agents bill like electricity.\nCreators earn revenue\nper execution.',
    accent: COLOR_MAGENTA,
  },
  {
    key: 'registry',
    label: 'REGISTRY',
    description:
      'Cryptographic identity\nfor every agent.\nVerified, audited, trust scored.',
    accent: COLOR_CYAN,
  },
  {
    key: 'protocol',
    label: 'PROTOCOL',
    description:
      'Multi vendor adapter dispatch.\nClaude, Gemini, OpenAI, custom.\nAll routed.',
    accent: COLOR_VIOLET,
  },
];

export class IntroNarrativeScene extends Phaser.Scene {
  private skipBtn?: Phaser.GameObjects.Text;
  private dismissed = false;
  private timeouts: Array<ReturnType<typeof setTimeout>> = [];
  // NOTE: cannot use the field name `tweens` because Phaser.Scene
  // already exposes a TweenManager under `this.tweens`. Use a
  // namespaced field instead to avoid TS structural type clash.
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private gameObjects: Phaser.GameObjects.GameObject[] = [];
  private bgGradient?: Phaser.GameObjects.Graphics;
  private scanlines?: Phaser.GameObjects.TileSprite;
  private vignette?: Phaser.GameObjects.Graphics;
  private dotGrid?: Phaser.GameObjects.Graphics;
  private currentSubScene: string = 'init';
  private escKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private waitingForKeypress = false;

  constructor() {
    super({ key: SCENE_KEY } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  /**
   * Static helper used by BootScene/PreloadScene to decide whether to
   * start IntroNarrativeScene or skip directly to ApolloVillageScene.
   * Returns true when the intro should play.
   *
   * Gating policy
   * -------------
   * Per the V6-anticipated fallback path documented in the Phase 1.6
   * halt trigger ("if TitleScene chain modification breaks existing
   * Playwright specs the gate flips to opt-in via ?intro=1"), the
   * scene is OPT-IN at hackathon scope. Existing 22 Playwright specs
   * navigate to `/play` without a query param so the intro is
   * skipped, preserving regression. Demo + README link to
   * `/play?intro=1` to surface the cinematic.
   *
   * Force-replay policy
   * -------------------
   * - `?intro=1` always plays the intro regardless of sessionStorage.
   * - `?intro=auto` plays on first visit (sessionStorage gate
   *   prevents replay in the same tab).
   * - No param OR `?intro=0` skips entirely.
   *
   * sessionStorage flag is set after completion or skip so an
   * `?intro=auto` second visit sees the world directly.
   */
  static shouldPlayIntro(): boolean {
    if (typeof window === 'undefined') return false;
    let search = '';
    try {
      search = window.location?.search ?? '';
    } catch {
      return false;
    }
    if (search.includes('intro=1')) return true;
    if (search.includes('intro=0')) return false;
    if (search.includes('intro=auto')) {
      let seen: string | null = null;
      try {
        seen = window.sessionStorage.getItem(SS_KEY_INTRO_SEEN);
      } catch {
        return false;
      }
      return seen === null;
    }
    // Default: skip. Opt-in via `?intro=1` or `?intro=auto`.
    return false;
  }

  create() {
    this.dismissed = false;
    this.timeouts = [];
    this.activeTweens = [];
    this.gameObjects = [];

    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.fadeIn(CROSSFADE_DURATION_MS, 0, 0, 0);

    this.drawBackgroundLayers();
    this.drawScanlinesAndVignette();
    this.drawSkipButton();
    this.bindSkipInputs();

    // Start s1 immediately.
    this.runScene1Hook();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupAll();
    });
  }

  /**
   * Draw the gradient ink background that persists across all sub-scenes.
   */
  private drawBackgroundLayers() {
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.add.graphics();
    // Linear ink gradient via stacked horizontal bars (Phaser Graphics
    // does not have native gradient fill on rectangles; this approximates
    // a 64-step gradient cheaply).
    const steps = 64;
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      const r = Math.round(((COLOR_INK_HEX >> 16) & 0xff) * (1 - t) + ((COLOR_INK_END_HEX >> 16) & 0xff) * t);
      const g = Math.round(((COLOR_INK_HEX >> 8) & 0xff) * (1 - t) + ((COLOR_INK_END_HEX >> 8) & 0xff) * t);
      const b = Math.round((COLOR_INK_HEX & 0xff) * (1 - t) + (COLOR_INK_END_HEX & 0xff) * t);
      const color = (r << 16) | (g << 8) | b;
      bg.fillStyle(color, 1);
      bg.fillRect(0, (h * i) / steps, w, h / steps + 1);
    }
    bg.setDepth(-100);
    this.bgGradient = bg;
    this.gameObjects.push(bg);
  }

  /**
   * CRT scanlines + soft vignette, present across all sub-scenes.
   */
  private drawScanlinesAndVignette() {
    const w = this.scale.width;
    const h = this.scale.height;

    // CRT scanlines: 2px-tall horizontal bars every 4px at 3% opacity.
    const scanGfx = this.add.graphics();
    scanGfx.fillStyle(0x000000, CRT_SCANLINE_ALPHA);
    for (let y = 0; y < h; y += 4) {
      scanGfx.fillRect(0, y, w, 2);
    }
    scanGfx.setDepth(100);
    this.gameObjects.push(scanGfx);

    // Vignette: four corner gradients via radial-ish overlay.
    const vGfx = this.add.graphics();
    vGfx.fillStyle(0x000000, VIGNETTE_ALPHA);
    const v = Math.min(w, h) * 0.4;
    // Top-left corner
    vGfx.fillRect(0, 0, v, v);
    // Top-right
    vGfx.fillRect(w - v, 0, v, v);
    // Bottom-left
    vGfx.fillRect(0, h - v, v, v);
    // Bottom-right
    vGfx.fillRect(w - v, h - v, v, v);
    vGfx.setAlpha(0.35);
    vGfx.setDepth(99);
    this.vignette = vGfx;
    this.gameObjects.push(vGfx);
  }

  /**
   * Dot grid is conditional on s2_problem and s4_pillars only. Drawn
   * via a graphics overlay we toggle alpha on.
   */
  private drawDotGrid() {
    if (this.dotGrid) {
      this.dotGrid.setAlpha(DOT_GRID_ALPHA);
      return;
    }
    const w = this.scale.width;
    const h = this.scale.height;
    const dGfx = this.add.graphics();
    dGfx.fillStyle(0xffffff, 1);
    for (let x = DOT_GRID_SPACING; x < w; x += DOT_GRID_SPACING) {
      for (let y = DOT_GRID_SPACING; y < h; y += DOT_GRID_SPACING) {
        dGfx.fillRect(x, y, 1, 1);
      }
    }
    dGfx.setAlpha(DOT_GRID_ALPHA);
    dGfx.setDepth(-50);
    this.dotGrid = dGfx;
    this.gameObjects.push(dGfx);
  }

  private hideDotGrid() {
    if (this.dotGrid) {
      this.dotGrid.setAlpha(0);
    }
  }

  /**
   * Top-right skip button visible at all times (path 1 of 3).
   */
  private drawSkipButton() {
    const x = this.scale.width - 24;
    const y = 24;
    const btn = this.add.text(x, y, 'Skip Intro [ESC]', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: COLOR_PHOS,
      stroke: '#0a0d12',
      strokeThickness: 3,
    });
    btn.setOrigin(1, 0);
    btn.setDepth(200);
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, evt: Phaser.Types.Input.EventData) => {
      evt.stopPropagation?.();
      this.skipNow();
    });
    this.skipBtn = btn;
    this.gameObjects.push(btn);
  }

  /**
   * Path 2 + 3 of 3: ESC keybind, click anywhere on canvas.
   */
  private bindSkipInputs() {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.enterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    }
    // Click on the canvas (anywhere except the skip button itself, which
    // already calls stopPropagation() above) advances through the skip.
    this.input.on('pointerdown', () => {
      if (this.waitingForKeypress) {
        // s5_founder waits for keypress to enter the world; treat the
        // pointer click as confirmation and proceed to the next scene.
        this.skipNow();
        return;
      }
      this.skipNow();
    });
  }

  update() {
    if (this.dismissed) return;
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.skipNow();
      return;
    }
    if (this.waitingForKeypress) {
      if (
        (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
        (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey))
      ) {
        this.skipNow();
      }
    }
  }

  // -------------------------------------------------------------------------
  // s1_hook: 0:00 to 0:06
  // -------------------------------------------------------------------------
  private runScene1Hook() {
    if (this.dismissed) return;
    this.currentSubScene = 's1_hook';
    this.hideDotGrid();
    const w = this.scale.width;
    const h = this.scale.height;

    const headline = 'You have already felt this.';
    const text = this.add.text(w / 2, h / 2, '', {
      fontFamily: '"VT323", monospace',
      fontSize: '56px',
      color: COLOR_PHOS,
      stroke: '#0a0d12',
      strokeThickness: 4,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(10);
    this.gameObjects.push(text);

    // Cursor blink left of where the text appears.
    const cursor = this.add.text(w / 2, h / 2, '_', {
      fontFamily: '"VT323", monospace',
      fontSize: '56px',
      color: COLOR_PHOS,
    });
    cursor.setOrigin(0, 0.5);
    cursor.setX(text.x - text.displayWidth / 2 - 12);
    cursor.setDepth(10);
    this.gameObjects.push(cursor);
    const cursorTween = this.tweens.add({
      targets: cursor,
      alpha: { from: 1, to: 0 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });
    this.activeTweens.push(cursorTween);

    this.typewriterReveal(text, headline, TYPEWRITER_HEADLINE_CHARS_PER_SEC, () => {
      // After typewriter, hold 2s + phos pulse alpha 0.9 to 1.0 over 200ms.
      const pulseTween = this.tweens.add({
        targets: text,
        alpha: { from: 1, to: 0.9 },
        duration: 200,
        yoyo: true,
        repeat: 0,
      });
      this.activeTweens.push(pulseTween);
      this.scheduleNext(2000, () => this.crossfadeAndStart(() => this.runScene2Problem(), false));
    });
  }

  // -------------------------------------------------------------------------
  // s2_problem: 0:06 to 0:14
  // -------------------------------------------------------------------------
  private runScene2Problem() {
    if (this.dismissed) return;
    this.currentSubScene = 's2_problem';
    this.drawDotGrid();
    const w = this.scale.width;
    const h = this.scale.height;

    const lines = [
      'The agent ecosystem is scattered.',
      '',
      'Skills sit forgotten on Twitter feeds.',
      'MCP servers buried in GitHub repos no one finds.',
      'Brilliant prompts lost in Discord channels by Monday.',
      '',
      'Creators ship into a void.',
      'Buyers hunt for tools through random DMs.',
    ];

    const startY = h * 0.22;
    const lineHeight = 38;
    const allLines: Phaser.GameObjects.Text[] = [];
    let cumulativeDelay = 0;

    lines.forEach((line, idx) => {
      const txt = this.add.text(w / 2, startY + idx * lineHeight, '', {
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize: '32px',
        color: COLOR_BONE,
        align: 'center',
        stroke: '#0a0d12',
        strokeThickness: 2,
      });
      txt.setOrigin(0.5, 0.5);
      txt.setDepth(10);
      txt.setAlpha(0);
      allLines.push(txt);
      this.gameObjects.push(txt);
      // Stagger entry: wait for cumulativeDelay, fade in, typewriter.
      this.scheduleNext(cumulativeDelay, () => {
        if (this.dismissed) return;
        // Dim already-revealed lines to 50% opacity (V6 text persistence
        // rule says NEVER below 50%).
        for (let i = 0; i < idx; i += 1) {
          const prev = allLines[i];
          if (!prev) continue;
          const dimTween = this.tweens.add({
            targets: prev,
            alpha: 0.5,
            duration: 300,
          });
          this.activeTweens.push(dimTween);
        }
        txt.setAlpha(1);
        if (line.length === 0) {
          // Blank line (paragraph break); no typewriter.
          return;
        }
        this.typewriterReveal(txt, line, TYPEWRITER_BODY_CHARS_PER_SEC, () => {
          // No-op; the next line scheduling handles continuation.
        });
      });
      // Body line typewriter duration ~ line.length / 50 chars/sec.
      const typeMs = (line.length / TYPEWRITER_BODY_CHARS_PER_SEC) * 1000;
      cumulativeDelay += typeMs + 250;
    });

    this.scheduleNext(cumulativeDelay + 2000, () => {
      this.glitchFrame(() => {
        this.crossfadeAndStart(() => this.runScene3Brand(), true);
      });
    });
  }

  // -------------------------------------------------------------------------
  // s3_brand: 0:14 to 0:22
  // -------------------------------------------------------------------------
  private runScene3Brand() {
    if (this.dismissed) return;
    this.currentSubScene = 's3_brand';
    this.hideDotGrid();
    const w = this.scale.width;
    const h = this.scale.height;

    // Hard cut to pure black handled by crossfade. Now build wordmark.
    const wordmark = this.add.text(w / 2, h * 0.4, '', {
      fontFamily: '"VT323", monospace',
      fontSize: '96px',
      color: COLOR_PHOS,
      stroke: '#0a0d12',
      strokeThickness: 6,
    });
    wordmark.setOrigin(0.5, 0.5);
    wordmark.setDepth(10);
    wordmark.setAlpha(0);
    this.gameObjects.push(wordmark);

    // Pixel-build animation: stack character bricks bottom-up over 1s.
    // Approximate by stepping through the wordmark string char by char
    // with a tiny y-offset that animates to 0.
    const target = 'NERIUM';
    let i = 0;
    const stepMs = 900 / target.length;
    const stepHandle = setInterval(() => {
      if (this.dismissed) {
        clearInterval(stepHandle);
        return;
      }
      i += 1;
      wordmark.setText(target.slice(0, i));
      wordmark.setAlpha(1);
      if (i >= target.length) {
        clearInterval(stepHandle);
      }
    }, stepMs);
    this.timeouts.push(stepHandle as unknown as ReturnType<typeof setTimeout>);

    // After ~1s, pulse the wordmark glow.
    this.scheduleNext(1100, () => {
      const pulseTween = this.tweens.add({
        targets: wordmark,
        alpha: { from: 1, to: 0.9 },
        duration: 1000,
        yoyo: true,
      });
      this.activeTweens.push(pulseTween);
    });

    // Tagline below the wordmark.
    const tag = this.add.text(
      w / 2,
      h * 0.58,
      '',
      {
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize: '28px',
        color: COLOR_BONE,
        align: 'center',
        stroke: '#0a0d12',
        strokeThickness: 2,
      },
    );
    tag.setOrigin(0.5, 0.5);
    tag.setDepth(10);
    this.gameObjects.push(tag);

    this.scheduleNext(1200, () => {
      const taglineLines =
        'Infrastructure for the AI agent economy.\nOne platform. Five pillars. Built for creators.';
      this.typewriterReveal(tag, taglineLines, TYPEWRITER_BODY_CHARS_PER_SEC, () => {});
    });

    // Hold 2s after tagline finish, then crossfade to s4.
    this.scheduleNext(1200 + 2200 + 2000, () => {
      this.crossfadeAndStart(() => this.runScene4Pillars(), false);
    });
  }

  // -------------------------------------------------------------------------
  // s4_pillars: 0:22 to 0:42
  // -------------------------------------------------------------------------
  private runScene4Pillars() {
    if (this.dismissed) return;
    this.currentSubScene = 's4_pillars';
    this.drawDotGrid();
    const w = this.scale.width;
    const h = this.scale.height;

    const slotW = w / 5.5;
    const slotH = h * 0.55;
    const slotY = h * 0.3;
    const slotXBase = (w - slotW * 5 - 16 * 4) / 2;

    const pillarNodes: Array<{
      box: Phaser.GameObjects.Rectangle;
      label: Phaser.GameObjects.Text;
      desc: Phaser.GameObjects.Text;
      iconBox: Phaser.GameObjects.Graphics;
      def: PillarDef;
      x: number;
      y: number;
    }> = [];

    PILLAR_DEFS.forEach((def, idx) => {
      const slotX = slotXBase + idx * (slotW + 16);
      // Slot border (cyberpunk panel).
      const box = this.add.rectangle(
        slotX + slotW / 2,
        slotY + slotH / 2,
        slotW,
        slotH,
        0x0a0e1a,
        0.85,
      );
      box.setStrokeStyle(2, parseColorHex(def.accent), 0.6);
      box.setDepth(5);
      box.setAlpha(0);
      this.gameObjects.push(box);

      // Pixel-art icon placeholder: small graphics rectangle in accent
      // color. Real pixel-art assets ship in the asset registry; if a
      // pillar icon is not yet registered we render a stylized box.
      const iconBox = this.add.graphics();
      iconBox.fillStyle(parseColorHex(def.accent), 1);
      iconBox.fillRect(slotX + slotW / 2 - 24, slotY + 32, 48, 48);
      iconBox.lineStyle(2, 0xffffff, 0.6);
      iconBox.strokeRect(slotX + slotW / 2 - 24, slotY + 32, 48, 48);
      iconBox.setDepth(6);
      iconBox.setAlpha(0);
      this.gameObjects.push(iconBox);

      const label = this.add.text(
        slotX + slotW / 2,
        slotY + 100,
        def.label,
        {
          fontFamily: '"VT323", monospace',
          fontSize: def.hero ? '48px' : '40px',
          color: def.accent,
          stroke: '#0a0d12',
          strokeThickness: 3,
        },
      );
      label.setOrigin(0.5, 0.5);
      label.setDepth(10);
      label.setAlpha(0);
      this.gameObjects.push(label);

      const desc = this.add.text(
        slotX + slotW / 2,
        slotY + 180,
        def.description,
        {
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontSize: '22px',
          color: COLOR_BONE,
          align: 'center',
          stroke: '#0a0d12',
          strokeThickness: 2,
          wordWrap: { width: slotW - 16 },
        },
      );
      desc.setOrigin(0.5, 0);
      desc.setDepth(10);
      desc.setAlpha(0);
      this.gameObjects.push(desc);

      pillarNodes.push({
        box,
        label,
        desc,
        iconBox,
        def,
        x: slotX + slotW / 2,
        y: slotY + slotH / 2,
      });
    });

    // Initial fade-in of all 5 slots empty (boxes only) over 600ms.
    pillarNodes.forEach((node, idx) => {
      this.scheduleNext(idx * 80, () => {
        const t = this.tweens.add({
          targets: node.box,
          alpha: 0.85,
          duration: 300,
        });
        this.activeTweens.push(t);
      });
    });

    // Sequential spotlight 4s each. Active: scale 1.15 (BUILDER 1.25),
    // glow 1.5x (BUILDER 1.8x), description 100% opacity. Inactive
    // post-spotlight: scale 1.0, description 80% opacity.
    const SPOTLIGHT_DURATION = 4000;
    const startDelay = 600;
    pillarNodes.forEach((node, idx) => {
      const at = startDelay + idx * SPOTLIGHT_DURATION;
      this.scheduleNext(at, () => {
        if (this.dismissed) return;
        // Reveal the icon + label + description, animate spotlight.
        const iconTween = this.tweens.add({
          targets: node.iconBox,
          alpha: 1,
          duration: 250,
        });
        const labelTween = this.tweens.add({
          targets: node.label,
          alpha: 1,
          duration: 250,
        });
        const descTween = this.tweens.add({
          targets: node.desc,
          alpha: 1,
          duration: 250,
        });
        this.activeTweens.push(iconTween, labelTween, descTween);

        const spotScale = node.def.hero ? 1.25 : 1.15;
        const sBoxTween = this.tweens.add({
          targets: node.box,
          scaleX: spotScale,
          scaleY: spotScale,
          alpha: 1,
          duration: 250,
        });
        const sLabelTween = this.tweens.add({
          targets: node.label,
          scaleX: spotScale,
          scaleY: spotScale,
          duration: 250,
        });
        this.activeTweens.push(sBoxTween, sLabelTween);
      });
      // Spotlight end: dim back to neutral baseline.
      this.scheduleNext(at + SPOTLIGHT_DURATION - 200, () => {
        if (this.dismissed) return;
        const dBoxTween = this.tweens.add({
          targets: node.box,
          scaleX: 1.0,
          scaleY: 1.0,
          alpha: 0.85,
          duration: 200,
        });
        const dLabelTween = this.tweens.add({
          targets: node.label,
          scaleX: 1.0,
          scaleY: 1.0,
          duration: 200,
        });
        // Description settles at 80% opacity per V6 text-persistence rule.
        const dDescTween = this.tweens.add({
          targets: node.desc,
          alpha: 0.8,
          duration: 200,
        });
        this.activeTweens.push(dBoxTween, dLabelTween, dDescTween);
      });
    });

    // After all 5 spotlights, hold 2s then crossfade with glitch frame.
    const totalDuration = startDelay + pillarNodes.length * SPOTLIGHT_DURATION + 2000;
    this.scheduleNext(totalDuration, () => {
      this.glitchFrame(() => {
        this.crossfadeAndStart(() => this.runScene5Founder(), false);
      });
    });
  }

  // -------------------------------------------------------------------------
  // s5_founder: 0:42 to 0:50
  // -------------------------------------------------------------------------
  private runScene5Founder() {
    if (this.dismissed) return;
    this.currentSubScene = 's5_founder';
    this.hideDotGrid();
    const w = this.scale.width;
    const h = this.scale.height;

    const wordmark = this.add.text(w / 2, h * 0.32, 'NERIUM', {
      fontFamily: '"VT323", monospace',
      fontSize: '56px',
      color: COLOR_PHOS,
      stroke: '#0a0d12',
      strokeThickness: 4,
    });
    wordmark.setOrigin(0.5, 0.5);
    wordmark.setDepth(10);
    this.gameObjects.push(wordmark);

    const credit = this.add.text(w / 2, h * 0.48, '', {
      fontFamily: '"Space Grotesk", system-ui, sans-serif',
      fontSize: '26px',
      color: COLOR_BONE,
      align: 'center',
      stroke: '#0a0d12',
      strokeThickness: 2,
    });
    credit.setOrigin(0.5, 0.5);
    credit.setDepth(10);
    this.gameObjects.push(credit);

    const creditText =
      'Built by 54 specialist Claude Code agents.\nOrchestrated by one solo founder in Indonesia.\nThe product literally built itself.\n\nPress any key to enter the world.';

    this.typewriterReveal(credit, creditText, TYPEWRITER_BODY_CHARS_PER_SEC, () => {
      // Cursor blink at the end of the last line.
      const cursor = this.add.text(
        credit.x + credit.displayWidth / 2 + 4,
        credit.y + credit.displayHeight / 2 - 16,
        '_',
        {
          fontFamily: '"VT323", monospace',
          fontSize: '26px',
          color: COLOR_PHOS,
        },
      );
      cursor.setOrigin(0, 0);
      cursor.setDepth(10);
      this.gameObjects.push(cursor);
      const ctween = this.tweens.add({
        targets: cursor,
        alpha: { from: 1, to: 0 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
      this.activeTweens.push(ctween);
      this.waitingForKeypress = true;
    });
  }

  // -------------------------------------------------------------------------
  // Glitch frame: ~80ms pixel scramble overlay between scenes.
  // -------------------------------------------------------------------------
  private glitchFrame(after: () => void) {
    if (this.dismissed) {
      after();
      return;
    }
    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.graphics();
    overlay.setDepth(150);
    const stripeCount = 24;
    for (let i = 0; i < stripeCount; i += 1) {
      const y = Math.floor(Math.random() * h);
      const stripeH = 2 + Math.floor(Math.random() * 6);
      const colors = [COLOR_PHOS, COLOR_CYAN, COLOR_MAGENTA, COLOR_VIOLET];
      const c = colors[Math.floor(Math.random() * colors.length)];
      overlay.fillStyle(parseColorHex(c), 0.6);
      overlay.fillRect(0, y, w, stripeH);
    }
    this.gameObjects.push(overlay);
    this.scheduleNext(GLITCH_DURATION_MS, () => {
      overlay.destroy();
      after();
    });
  }

  /**
   * Crossfade out then run the provided start function. If `hardCutBlack`
   * is true, fade to fully black before showing the next sub-scene.
   */
  private crossfadeAndStart(after: () => void, hardCutBlack: boolean) {
    if (this.dismissed) return;
    this.cameras.main.fadeOut(CROSSFADE_DURATION_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.dismissed) return;
      this.cameras.main.fadeIn(CROSSFADE_DURATION_MS, 0, 0, 0);
      after();
    });
  }

  /**
   * Typewriter reveal: progressively populate the text object's content
   * at the requested chars-per-second rate. Calls `onDone` when fully
   * revealed.
   */
  private typewriterReveal(
    target: Phaser.GameObjects.Text,
    fullText: string,
    charsPerSec: number,
    onDone: () => void,
  ) {
    let cursor = 0;
    const intervalMs = Math.max(8, 1000 / charsPerSec);
    const handle = setInterval(() => {
      if (this.dismissed) {
        clearInterval(handle);
        return;
      }
      cursor += 1;
      target.setText(fullText.slice(0, cursor));
      if (cursor >= fullText.length) {
        clearInterval(handle);
        onDone();
      }
    }, intervalMs);
    this.timeouts.push(handle as unknown as ReturnType<typeof setTimeout>);
  }

  /**
   * Convenience setTimeout wrapper that records the handle for cleanup.
   */
  private scheduleNext(ms: number, fn: () => void) {
    const handle = setTimeout(fn, ms);
    this.timeouts.push(handle);
  }

  /**
   * Honor the skip path. Sets sessionStorage flag, fades out, transitions.
   */
  private skipNow() {
    if (this.dismissed) return;
    this.dismissed = true;
    this.markIntroSeen();
    this.cleanupAll();
    this.cameras.main.fadeOut(CROSSFADE_DURATION_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(NEXT_SCENE, NEXT_SCENE_DATA);
    });
  }

  private markIntroSeen() {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(SS_KEY_INTRO_SEEN, '1');
    } catch {
      // sessionStorage may be disabled. Ignore.
    }
  }

  /**
   * Clean up timers + tweens. Tweens auto-clean on scene shutdown; we
   * still call .stop() to be defensive against the rapid-skip case.
   */
  private cleanupAll() {
    this.timeouts.forEach((h) => clearTimeout(h));
    this.timeouts = [];
    this.activeTweens.forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    this.activeTweens = [];
    this.gameObjects.forEach((obj) => {
      try {
        obj.destroy();
      } catch {
        /* ignore */
      }
    });
    this.gameObjects = [];
  }
}

function parseColorHex(hex: string): number {
  if (hex.startsWith('#')) {
    return parseInt(hex.slice(1), 16);
  }
  return parseInt(hex, 16);
}
