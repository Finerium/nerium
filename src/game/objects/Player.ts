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

  // Helios-v2 W3 S8: track the last facing direction so idle frame matches
  // the walking direction the player just stopped from. Defaults to 'down'.
  private lastFacing: 'down' | 'up' | 'left' | 'right' = 'down';
  // Helios-v2 W3 S8: cache the active spritesheet key for animation play.
  // Empty string when the texture is not a registered character spritesheet
  // (e.g. legacy atlas frame); animations are skipped in that case.
  private animSheetKey = '';

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

    // Helios-v2 W3 S8: if the texture is one of the registered character
    // spritesheets, cache the key so update() can play the correct
    // directional animation. The PreloadScene S8 anim registration ensures
    // the spritesheet anims exist by the time any world scene starts.
    const HELIOS_V2_S8_SPRITESHEETS = new Set([
      'player_spritesheet',
      'apollo_spritesheet',
      'caravan_vendor_spritesheet',
      'synth_vendor_spritesheet',
      'treasurer_spritesheet',
    ]);
    if (HELIOS_V2_S8_SPRITESHEETS.has(options.textureKey)) {
      this.animSheetKey = options.textureKey;
      // Play the down-facing idle on spawn so frame 0 reads as a static
      // pose rather than the raw spritesheet frame index.
      try {
        this.anims.play(`${this.animSheetKey}_idle_down`, true);
      } catch (err) {
        console.warn('[Player] anims.play idle_down threw on spawn', err);
      }
    }
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

    // Helios-v2 W3 S8: drive the directional walk + idle animation from
    // the velocity vector. Diagonal movement biases toward whichever axis
    // has the larger absolute velocity. Stop -> idle in the last facing
    // direction so the sprite does not snap back to default down-stance
    // mid-stride. Skip animation entirely when the texture is not one of
    // the 5 registered character spritesheets (legacy atlas case).
    if (this.animSheetKey) {
      this.driveDirectionalAnimation(vx, vy);
    }

    // T-REGR R3 Path b: visible left/right facing via horizontal flipX even
    // when the underlying spritesheet anim system fails silently (frame
    // index update never lands because the source PNG is monolithic / lacks
    // per-direction frames). Cheap mirror hack acceptable per V6_TO_V7
    // default rec; up/down keeps current flipX so vertical movement does
    // not re-flip mid-stride.
    if (vx < 0) {
      this.setFlipX(true);
    } else if (vx > 0) {
      this.setFlipX(false);
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

  /**
   * Helios-v2 W3 S8 directional animation driver. Plays the matching
   * walk anim while moving, idle anim while still. Selects the dominant
   * axis when moving diagonally.
   */
  private driveDirectionalAnimation(vx: number, vy: number): void {
    if (vx === 0 && vy === 0) {
      // Stopped: play idle in the last known facing direction.
      const idleKey = `${this.animSheetKey}_idle_${this.lastFacing}`;
      const current = this.anims.currentAnim?.key;
      if (current !== idleKey) {
        try {
          this.anims.play(idleKey, true);
        } catch (err) {
          console.warn('[Player] idle anim play threw', err);
        }
      }
      return;
    }
    // Moving: pick dominant axis. Vertical axis ties default to down.
    let dir: 'down' | 'up' | 'left' | 'right';
    if (Math.abs(vy) >= Math.abs(vx)) {
      dir = vy > 0 ? 'down' : 'up';
    } else {
      dir = vx > 0 ? 'right' : 'left';
    }
    this.lastFacing = dir;
    const walkKey = `${this.animSheetKey}_walk_${dir}`;
    const current = this.anims.currentAnim?.key;
    if (current !== walkKey) {
      try {
        this.anims.play(walkKey, true);
      } catch (err) {
        console.warn('[Player] walk anim play threw', err);
      }
    }
  }
}
