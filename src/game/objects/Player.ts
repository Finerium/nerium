//
// src/game/objects/Player.ts
//
// 8-direction Arcade physics player controller for the top-down overworld.
// Keyboard input via this.input.keyboard.createCursorKeys(). No gravity.
//
// Owner: Thalia-v2 per phaser-scene-authoring skill section "Top-Down
// 8-Direction Player Controller".
//
// The sprite texture draws from the active world atlas spritesheet frame
// index configured by slotFrame('agent_idle'). The existing NERIUM V3 atlas
// reserves slot 12 for agent_idle (app/builder/worlds/sprite_slots.ts).
//

import * as Phaser from 'phaser';

export interface PlayerOptions {
  textureKey: string;
  frame?: string | number;
  speed?: number;
  hitboxSize?: number;
  /**
   * Render scale multiplier for the sprite texture. Used by Helios-v2 W3
   * correction where character sprites are generated at 8-14 px and need
   * 2-3x scale to read at 32 px world tile. Defaults to 1 for back-compat
   * with atlas-frame paths.
   */
  spriteScale?: number;
  /**
   * If true, sprite uses Oak-Woods feet anchor (origin 0.5, 1) so y-sort
   * compares feet-y. Defaults to false to preserve existing center-anchor
   * RV behavior. Helios-v2 correction sets true for new sprite textures.
   */
  groundAnchor?: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private speed: number;
  private lastEmitX = 0;
  private lastEmitY = 0;
  private moveEmitCooldownMs = 120;
  private lastMoveEmitAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: PlayerOptions) {
    super(scene, x, y, options.textureKey, options.frame ?? 'agent_idle');
    this.speed = options.speed ?? 160;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    if (options.groundAnchor) {
      // Oak-Woods feet anchor for y-sort correctness
      this.setOrigin(0.5, 1);
    } else {
      this.setOrigin(0.5, 0.5);
    }
    this.setName('player');

    // Helios-v2 correction: render scale for tiny pixel-rect textures so
    // an 8x14 sprite reads at proper world-tile size.
    if (options.spriteScale && options.spriteScale !== 1) {
      this.setScale(options.spriteScale);
    }

    // Hitbox slightly smaller than the tile so wall collisions feel softer.
    const hitbox = options.hitboxSize ?? 24;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(hitbox, hitbox);
    // Center the hitbox on the visible sprite regardless of origin.
    if (options.groundAnchor) {
      body.setOffset(
        Math.max(0, (this.displayWidth - hitbox) / 2),
        Math.max(0, this.displayHeight - hitbox - 2),
      );
    } else {
      body.setOffset((this.displayWidth - hitbox) / 2, (this.displayHeight - hitbox) / 2);
    }

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('[Player] Keyboard plugin unavailable');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasdKeys = keyboard.addKeys('W,A,S,D') as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;

    this.lastEmitX = x;
    this.lastEmitY = y;
  }

  update(time: number, _delta: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const leftDown = this.cursors.left?.isDown || this.wasdKeys?.A.isDown;
    const rightDown = this.cursors.right?.isDown || this.wasdKeys?.D.isDown;
    const upDown = this.cursors.up?.isDown || this.wasdKeys?.W.isDown;
    const downDown = this.cursors.down?.isDown || this.wasdKeys?.S.isDown;

    const vx = (leftDown ? -1 : 0) + (rightDown ? 1 : 0);
    const vy = (upDown ? -1 : 0) + (downDown ? 1 : 0);

    // Normalize diagonal so 8-directional speed is uniform.
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      body.setVelocity(vx * this.speed * inv, vy * this.speed * inv);
    } else {
      body.setVelocity(vx * this.speed, vy * this.speed);
    }

    // Emit throttled player.moved events for bridge consumers.
    if (
      (vx !== 0 || vy !== 0) &&
      time - this.lastMoveEmitAt >= this.moveEmitCooldownMs
    ) {
      const dx = this.x - this.lastEmitX;
      const dy = this.y - this.lastEmitY;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
        this.scene.game.events.emit('game.player.moved', {
          x: this.x,
          y: this.y,
          dx,
          dy,
        });
        this.lastEmitX = this.x;
        this.lastEmitY = this.y;
        this.lastMoveEmitAt = time;
      }
    }
  }
}
