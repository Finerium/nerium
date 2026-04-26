//
// src/game/objects/NPC.ts
//
// Non-player character object with proximity detection and E-key interact.
// Emits game.npc.nearby plus game.npc.far for HUD prompt state and
// game.npc.interact when the player is inside the zone and presses E.
//
// Owner: Thalia-v2 per phaser-scene-authoring skill section "NPC Interaction
// Zone Pattern".
//
// React HUD owns the actual "Press E" indicator rendering (Erato-v2
// interactPromptVisible in uiStore). This class only emits.
//

import * as Phaser from 'phaser';

export interface NpcOptions {
  npcId: string;
  displayName: string;
  textureKey: string;
  frame?: string | number;
  interactRadius?: number;
  /** Helios-v2 W3 correction: render scale multiplier for sprite texture. */
  spriteScale?: number;
  /** Helios-v2 W3 correction: ground-anchor origin for y-sort. */
  groundAnchor?: boolean;
  /**
   * T-REGR R2 wander spec (Helios-v2 S8 wander intent). When set, the NPC
   * idles 2-5 sec then walks to a random target within `radiusPx` of its
   * spawn anchor; on arrival idles again, repeating indefinitely. Wander
   * stays anchored to spawn world-space coords (NOT camera viewport) so
   * the apparent "opposite-direction parallax" perception when the player
   * moves is replaced by visible NPC life motion. Plot NPCs (Apollo,
   * Treasurer, Caravan Vendor) leave wander undefined to remain static
   * at their dialogue spots.
   */
  wander?: {
    /** Random walk radius around spawn point (world px). Default 100. */
    radiusPx?: number;
    /** Idle ms minimum between walks. Default 2000. */
    idleMsMin?: number;
    /** Idle ms maximum between walks. Default 5000. */
    idleMsMax?: number;
    /** Walk speed (px/sec). Default 30 (slow ambient stroll). */
    speedPxPerSec?: number;
  };
}

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly npcId: string;
  public readonly displayName: string;
  private readonly interactRadius: number;
  private nameLabel: Phaser.GameObjects.Text;
  private playerNearby = false;
  private interactListener?: (evt: KeyboardEvent) => void;
  private labelOffsetY: number = 24;

  // T-REGR R2 wander state. spawnX/spawnY are the world-space anchor used as
  // the recentering coordinate for the random walk; never overwritten so the
  // NPC always wanders inside a stable circle. wanderTween + wanderTimer are
  // exclusive (one active at a time): tween while walking, timer while idle.
  private spawnX = 0;
  private spawnY = 0;
  private wanderEnabled = false;
  private wanderRadiusPx = 100;
  private wanderIdleMsMin = 2000;
  private wanderIdleMsMax = 5000;
  private wanderSpeedPxPerSec = 30;
  private wanderTween?: Phaser.Tweens.Tween;
  private wanderTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number, options: NpcOptions) {
    super(scene, x, y, options.textureKey, options.frame ?? 'agent_active');
    this.npcId = options.npcId;
    this.displayName = options.displayName;
    this.interactRadius = options.interactRadius ?? 48;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setImmovable(true);
    if (options.groundAnchor) {
      this.setOrigin(0.5, 1);
    } else {
      this.setOrigin(0.5, 0.5);
    }
    this.setName(`npc-${options.npcId}`);
    if (options.spriteScale && options.spriteScale !== 1) {
      this.setScale(options.spriteScale);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    // Hitbox sized to the visible display area; if the sprite was scaled the
    // displayWidth / displayHeight reflect the rendered size already.
    const hbW = Math.min(28, Math.max(8, Math.round(this.displayWidth * 0.7)));
    const hbH = Math.min(28, Math.max(8, Math.round(this.displayHeight * 0.7)));
    body.setSize(hbW, hbH);
    if (options.groundAnchor) {
      body.setOffset(
        Math.max(0, (this.displayWidth - hbW) / 2),
        Math.max(0, this.displayHeight - hbH - 2),
      );
    } else {
      body.setOffset(
        Math.max(0, (this.displayWidth - hbW) / 2),
        Math.max(0, (this.displayHeight - hbH) / 2),
      );
    }

    // Name label floats above the sprite in world space. This is acceptable
    // inside Phaser per the contract: world-space UI renders in Phaser,
    // screen-space UI (prompts, dialog) renders in React.
    const labelOffsetY = options.groundAnchor ? this.displayHeight + 4 : this.displayHeight / 2 + 8;
    this.nameLabel = scene.add
      .text(x, y - labelOffsetY, options.displayName, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#00000080',
        padding: { left: 4, right: 4, top: 2, bottom: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(50);
    this.labelOffsetY = labelOffsetY;

    // T-REGR R2 wander init. Latch the spawn coord as the wander anchor and
    // schedule the first idle-then-walk cycle. Plot NPCs leave wander undef
    // and skip this whole branch.
    this.spawnX = x;
    this.spawnY = y;
    if (options.wander) {
      this.wanderEnabled = true;
      this.wanderRadiusPx = options.wander.radiusPx ?? 100;
      this.wanderIdleMsMin = options.wander.idleMsMin ?? 2000;
      this.wanderIdleMsMax = options.wander.idleMsMax ?? 5000;
      this.wanderSpeedPxPerSec = options.wander.speedPxPerSec ?? 30;
      this.scheduleNextWander();
    }
  }

  /**
   * T-REGR R2: schedule the next idle interval, after which the NPC will
   * pick a random target within wanderRadiusPx of spawn anchor and walk
   * there. Idempotent + no-op if wander disabled or NPC destroyed.
   */
  private scheduleNextWander(): void {
    if (!this.wanderEnabled) return;
    if (!this.scene) return;
    const idleMs =
      this.wanderIdleMsMin +
      Math.random() * (this.wanderIdleMsMax - this.wanderIdleMsMin);
    this.wanderTimer = this.scene.time.delayedCall(idleMs, () => {
      this.startWander();
    });
  }

  /**
   * T-REGR R2: begin a single random walk to a target within wanderRadiusPx
   * of spawn anchor. Walk duration scales with distance + speed so the NPC
   * appears to amble at a consistent pace. On arrival, schedules next idle.
   */
  private startWander(): void {
    if (!this.wanderEnabled) return;
    if (!this.scene) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * this.wanderRadiusPx;
    const targetX = this.spawnX + Math.cos(angle) * dist;
    const targetY = this.spawnY + Math.sin(angle) * dist;
    const walkDist = Math.hypot(targetX - this.x, targetY - this.y);
    const durationMs = Math.max(
      400,
      (walkDist / this.wanderSpeedPxPerSec) * 1000,
    );
    this.wanderTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: durationMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.scheduleNextWander();
      },
    });
  }

  /**
   * Called by the scene every update tick. Scene passes the player so NPCs
   * can measure distance without coupling to a specific player instance.
   */
  updateProximity(player: Phaser.Physics.Arcade.Sprite) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inRange = dist <= this.interactRadius;

    if (inRange && !this.playerNearby) {
      this.playerNearby = true;
      this.scene.game.events.emit('game.npc.nearby', {
        npcId: this.npcId,
        distancePx: dist,
      });
      this.bindInteractKey();
    } else if (!inRange && this.playerNearby) {
      this.playerNearby = false;
      this.scene.game.events.emit('game.npc.far', { npcId: this.npcId });
      this.unbindInteractKey();
    }

    // Keep the label synced to sprite position.
    this.nameLabel.setPosition(this.x, this.y - this.labelOffsetY);
  }

  private bindInteractKey() {
    if (this.interactListener) return;
    this.interactListener = (evt: KeyboardEvent) => {
      if (evt.key.toLowerCase() === 'e' && this.playerNearby) {
        this.scene.game.events.emit('game.npc.interact', {
          npcId: this.npcId,
          x: this.x,
          y: this.y,
        });
      }
    };
    window.addEventListener('keydown', this.interactListener);
  }

  private unbindInteractKey() {
    if (!this.interactListener) return;
    window.removeEventListener('keydown', this.interactListener);
    this.interactListener = undefined;
  }

  destroy(fromScene?: boolean): void {
    // T-REGR R2: stop wander tween + timer before super so the active scene
    // does not retain references to a destroyed sprite.
    this.wanderTimer?.remove();
    this.wanderTimer = undefined;
    this.wanderTween?.stop();
    this.wanderTween = undefined;
    this.wanderEnabled = false;
    this.unbindInteractKey();
    this.nameLabel.destroy();
    super.destroy(fromScene);
  }
}
