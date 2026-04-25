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
}

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly npcId: string;
  public readonly displayName: string;
  private readonly interactRadius: number;
  private nameLabel: Phaser.GameObjects.Text;
  private playerNearby = false;
  private interactListener?: (evt: KeyboardEvent) => void;
  private labelOffsetY: number = 24;

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
    this.unbindInteractKey();
    this.nameLabel.destroy();
    super.destroy(fromScene);
  }
}
