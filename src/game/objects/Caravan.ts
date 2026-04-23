//
// src/game/objects/Caravan.ts
//
// Gated-spawn caravan sprite. Subscribes via the bridge to questStore state;
// becomes visible only after the quest step 7 caravan-spawned trigger fires
// (which marks the first non-Medieval world as unlocked).
//
// Pointer-down on a spawned caravan emits game.world.unlocked for the next
// world, wiring the multi-world expansion hook.
//
// Owner: Thalia-v2.
//

import * as Phaser from 'phaser';
import type { WorldId } from '../../state/types';
import { useQuestStore } from '../../state/stores';

export interface CaravanOptions {
  textureKey: string;
  frame?: string | number;
  targetWorld: WorldId;
  displayLabel?: string;
}

export class Caravan extends Phaser.Physics.Arcade.Sprite {
  private spawned = false;
  private readonly targetWorld: WorldId;
  private readonly displayLabel: string;
  private unsubscribeQuest?: () => void;
  private fadeTween?: Phaser.Tweens.Tween;
  private glyph?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, options: CaravanOptions) {
    super(scene, x, y, options.textureKey, options.frame ?? 'sigil_world');
    this.targetWorld = options.targetWorld;
    this.displayLabel = options.displayLabel ?? `Caravan to ${options.targetWorld}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setImmovable(true);
    this.setOrigin(0.5, 0.5);
    this.setName(`caravan-${options.targetWorld}`);
    this.setAlpha(0);
    this.setVisible(false);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);

    this.setInteractive({ cursor: 'pointer' });
    this.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    // Subscribe to questStore; the fireImmediately flag is set true so this
    // caravan correctly reflects a quest state that was already unlocked
    // before this scene mounted (e.g., hot-reload, scene restart).
    this.unsubscribeQuest = useQuestStore.subscribe(
      (s) => s.unlockedWorlds,
      (worlds) => {
        if (worlds.includes(this.targetWorld)) {
          this.spawn();
        }
      },
      // fireImmediately: on scene mount, reflect existing unlock state
      { fireImmediately: true },
    );
  }

  private onPointerDown() {
    if (!this.spawned) return;
    this.scene.game.events.emit('game.world.unlocked', {
      worldId: this.targetWorld,
    });
  }

  private spawn() {
    if (this.spawned) return;
    this.spawned = true;
    this.setVisible(true);

    // Label floats above the caravan so the player can see the destination.
    this.glyph = this.scene.add
      .text(this.x, this.y - 28, this.displayLabel, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#1a0f05cc',
        padding: { left: 4, right: 4, top: 2, bottom: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setAlpha(0);

    this.fadeTween = this.scene.tweens.add({
      targets: [this, this.glyph],
      alpha: 1,
      duration: 800,
      ease: 'Quad.easeOut',
    });
  }

  destroy(fromScene?: boolean): void {
    this.fadeTween?.stop();
    this.glyph?.destroy();
    if (this.unsubscribeQuest) {
      this.unsubscribeQuest();
      this.unsubscribeQuest = undefined;
    }
    super.destroy(fromScene);
  }
}
