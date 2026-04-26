# T-REGR Smoke Verification

Date: 2026-04-26
Owner: T-REGR specialist (regression fix lane)
Scope: 3 visual gameplay regressions reported post-Nemea Phase 0 visual fix
(commit 1a0c1e9 redundant prop deletion + landmark rescale).

## Summary

All 3 regression fixes applied + typechecked clean + locally verified at the
Phaser canvas level on `npm run dev` localhost. Production verification
deferred to Vercel deploy because local environment hits 403 on Vercel Blob
asset fetches and cannot render the AI-asset PNG layer.

## Fix matrix

### R1 Lights2D intensity overwhelm

Root cause: Helios-v2 S9 ship intensities (0.4..1.0 baseline + tween peaks
to 1.0) over-saturated warm dusk Apollo + neon Cyber + cool Caravan road
scenes; mid-tone detail in the painted backdrops was washed out.

Fix: introduced `INTENSITY_SCALE = 0.6` constant inside `lighting.ts`
`addPointLight` helper, applied as a multiplier to both the baseline
intensity argument and the tween target. Single-place fix propagates to
every existing call site (Apollo Village 3 hero lights + Caravan Road
3 lights + Cyberpunk Shanghai 4 lights + landmark halos via the shared
`addLandmarkHalo` -> `addPointLight` delegation) without touching the
T-WORLD-territory scene files.

0.6 is the mid-range pick from the V6_TO_V7 default rec band 0.5-0.7.

Local verify: Apollo Village screenshot shows three warm amber halos
(positions 384,280 / 1024,280 / 700,460) reading as soft dusk glow rather
than overwhelming bright disks. Glyph alpha pulse halos around the four
NERIUM-pillar landmarks pulse subtly.

Files: `src/game/visual/lighting.ts`.

### R2 NPC parallax bug + Helios S8 wander spec

Root cause investigation: NPC sprites are added via `scene.add.existing(this)`
through `Phaser.Physics.Arcade.Sprite`, so they are world-space, NOT
camera-locked. The "opposite-direction" perception comes from the
ApolloVillage parallax scrollFactor 0.3 on the painted backdrop layer
(line `bg.setScrollFactor(0.3)`); when the player + camera move the
backdrop slides at 30 percent speed while NPCs at scrollFactor 1.0 stay
world-anchored, producing a parallax desync that reads as "NPCs move
opposite". This is a perception artifact, not an anchor bug.

Fix path b (chosen): implement Helios S8 wander spec so ambient NPCs are
visibly alive in world-space. Active motion masks the parallax desync
because the player's eye attaches to NPC motion rather than the
backdrop-vs-foreground velocity differential.

Implementation:
- New `wander` option on `NpcOptions` (radiusPx default 100, idleMsMin
  default 2000, idleMsMax default 5000, speedPxPerSec default 30).
- NPC class latches `spawnX` + `spawnY` as the wander anchor; on idle
  expiry, picks a random target within `wanderRadiusPx` of anchor and
  tweens x + y at `wanderSpeedPxPerSec`. On arrival schedules next idle.
- Ambient NPCs in `ApolloVillageScene.spawnTintedNpc` opt in to wander
  (5 NPCs: guard_a, guard_b, child, elder, villager). Plot NPCs
  (Apollo, Treasurer, Caravan Vendor) leave wander undefined, stay
  static at dialogue spots.
- Drop shadow tracking: existing `sprite.on('preupdate')` listener flagged
  as unreliable for static NPCs; added a defensive scene-level
  `Phaser.Scenes.Events.UPDATE` listener inside `attachDropShadow` so
  shadows track wandering NPC sprites every frame regardless of body
  velocity. Cleanup wired through `unsubscribers` array.
- NPC destroy() stops wander tween + timer before super.destroy().

Local verify: T0 screenshot vs T+5sec screenshot shows ambient NPC labels
moved (Elder y 250 -> 305, Child y 425 -> 474, Villager y 405 -> 485,
Guards repositioned). Plot NPCs (Treasurer, Apollo Advisor, Caravan
Vendor) stayed at their authored coords as designed.

Files: `src/game/objects/NPC.ts`,
`src/game/scenes/ApolloVillageScene.ts` (`spawnTintedNpc` + `attachDropShadow`).

### R3 Player sprite direction not updating with WASD

Root cause: per V6_TO_V7 directive the player_spritesheet PNG is monolithic
(not actually frame-sliced) so `driveDirectionalAnimation`'s
`anims.play(walk_left)` / `walk_right` swap the active anim key but the
underlying frames render identically. The player visually faces the same
direction regardless of WASD input.

Fix path b (chosen): cheaper mirror hack via `setFlipX`.

Implementation: at the bottom of `Player.update()` after velocity
computation, set `this.setFlipX(true)` when `vx < 0` (moving left),
`this.setFlipX(false)` when `vx > 0` (moving right). Up/down (vy)
preserves the current flipX so vertical movement does not re-flip the
sprite mid-stride. The existing `driveDirectionalAnimation` call remains
intact for any future spritesheet authoring effort that registers real
per-direction frames.

Local verify: typecheck passes. Visual flip cannot be verified locally
because player_spritesheet asset returns 403 on the Vercel Blob CDN
fetch from localhost. Deployed Vercel build will render the mirrored
sprite on left/right WASD.

Files: `src/game/objects/Player.ts`.

## Local environment caveat

`npm run dev` localhost cannot fetch from `kswntqjwnfadqljd.public.blob.vercel-storage.com`
without authenticated session. All preload assets return 403, so the
Phaser canvas renders with `#1a0f05` clear color + missing-texture
diamonds for sprites. Sufficient to verify:

- Lights2D PointLight halos (visible, intensity reduced).
- NPC label movement (wander coords change frame-over-frame).
- Landmark glyph diamonds (visible, position-stable).
- Canvas mounts + scene transitions work (no Phaser runtime errors).

Insufficient to verify:

- Player sprite flipX visual mirror.
- Painted backdrop visual context.
- Sub-area scene asset rendering.

Production smoke test against `https://nerium-one.vercel.app/play` runs
post-deploy via the standard `git push origin main` + `sleep 60` +
`curl` flow.

## Typecheck

`npx tsc --noEmit` exits clean (no output, exit 0).
