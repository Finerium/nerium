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
}

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly npcId: string;
  public readonly displayName: string;
  private readonly interactRadius: number;
  private nameLabel: Phaser.GameObjects.Text;
  private playerNearby = false;
  private interactListener?: (evt: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, options: NpcOptions) {
    super(scene, x, y, options.textureKey, options.frame ?? 'agent_active');
    this.npcId = options.npcId;
    this.displayName = options.displayName;
    this.interactRadius = options.interactRadius ?? 48;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setImmovable(true);
    this.setOrigin(0.5, 0.5);
    this.setName(`npc-${options.npcId}`);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.setSize(28, 28);
    body.setOffset(2, 2);

    // Name label floats above the sprite in world space. This is acceptable
    // inside Phaser per the contract: world-space UI renders in Phaser,
    // screen-space UI (prompts, dialog) renders in React.
    this.nameLabel = scene.add
      .text(x, y - 24, options.displayName, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#00000080',
        padding: { left: 4, right: 4, top: 2, bottom: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(50);
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
    this.nameLabel.setPosition(this.x, this.y - 24);
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
