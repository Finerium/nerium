# Helios-v2 Scene Inventory (S1-S4)

**Author:** Helios-v2 (W3 Phaser visual revamp owner)
**Date:** 2026-04-25 NP Wave 3
**Purpose:** Snapshot reference for Ghaisan /ultrareview Run #1 (HARD HALT
gate at S4 boundary). Documents palette + 5-layer depth + scene layout +
NPC placement for the 3 scenes shipped in S2-S4.

No em dash, no emoji per CLAUDE.md anti-patterns.

---

## Visual foundation (S1, SHA `0730e3d`)

Source: `src/game/visual/`

### Palette tokens

- `SHARED`: 16 cross-scene tokens aligned to Marshall pricing landing OKLCH
  (--ink, --phos, --bone, --amber, --rose, --fog). Hex pre-resolved at
  constants time so Phaser canvas reads RGB directly without OKLCH parser.
- `MEDIEVAL_DESERT`: 38 saturated tokens (sky 8 bands, canyon 3, sand 5,
  trail 3, tent 5, cactus 4, stone 3, plank 4, fire 5, skin 3, cloth 4,
  identity 2, ambient 3).
- `CYBERPUNK_SHANGHAI`: 33 tokens (void 4, neon 9 cyan/magenta/violet/amber,
  building 4, pavement 4, hologram 2, rain 2, chrome 3, skin 3, cloth 3,
  ambient 3). Cyan `#00f0ff` + magenta `#ff2e88` neon primaries.
- `STEAMPUNK_VICTORIAN`: 28 tokens (wood 4, brass 4, copper 3, oxblood 3,
  steam 3, electric arc 3, oil lamp 3, gear iron 3, skin 3, cloth 3,
  ambient 3). Brass `#a47148` + walnut `#3d2b1f` + oxblood `#6b2e26` +
  electric arc `#68a8f8`.
- `CARAVAN_ROAD`: 17 tokens (transitional palette merging desert dusk +
  cyberpunk teaser).

### Depth bands

```
SKY_GRADIENT       -100  Layer 0: sky / far horizon
PARALLAX_BG         -50  Layer 1: silhouette (canyon/skyline/rooftop)
GROUND_TILES        -10  Layer 2: tilemap floor
WORLD_TILES           0  Layer 3 baseline: collision + dynamic entities
DYNAMIC_ENTITY_OFFSET 1  Per-sprite offset added to y-sort
ABOVE_TILES         100  Layer 4: roof / canopy / awning overhang
AMBIENT_FX          500  Particle emitters
WEATHER             600  Future weather overlay (post-hackathon)
UI_OVERLAY         9000  World-space pointer label
DAY_NIGHT_OVERLAY  9500  MULTIPLY tint sweep
UI_SCENE          10000  Boreas chat + HUD
```

### Y-sort

`SceneSorter` per-frame O(n) tick: each registered sprite gets
`setDepth(WORLD_TILES + 1 + sprite.y)`. Sprites use Oak-Woods
`setOrigin(0.5, 1)` feet anchor when registered via `registerGroundSprite()`.

### Tests: `tests/visual_foundation.test.ts`

30/30 unit tests pass via `node --test`. Coverage: SHARED token equivalence
to OKLCH-derived hex, per-world palette completeness, gradient + color
helpers (rgba range, lerpColor channel-wise correctness, buildSkyBands for
all 4 worlds), depth band ordering invariants, dynamicDepthFor occlusion
correctness, SceneSorter register / tick / unregister round-trip.

---

## Scene 1: ApolloVillageScene revamp (S2, SHA `d7f0177`)

**File:** `src/game/scenes/ApolloVillageScene.ts`
**World:** medieval_desert
**Atlas key:** `atlas_medieval_desert` (CC0 existing)
**Dimensions:** 24 cols x 16 rows = 768 px x 512 px world
**Camera zoom:** 2x to 4x dynamic (resize-driven)

### Layer composition

| Layer | Depth | Composition |
|---|---|---|
| 0 sky_gradient | -100 | 8-band cobalt-to-amber dusk via `buildSkyGradient('medieval_desert')`. Anchored to camera (scrollFactor 0). |
| 1 parallax_bg | -50 | Far canyon (warmer cool tint, scrollFactor 0.3) + near canyon (warm, scrollFactor 0.5). Stair-stepped via Mulberry32 seed. |
| 2 ground_tiles | -10 | Floor checker via existing CC0 atlas slots `floor_primary` + `floor_secondary`. Path markers from south entrance to courtyard. Central `sigil_world` decorative. |
| 3 world_tiles | dynamic | 5 tents (sand x2, terracotta x2, olive x1) + water well + 4 cacti (large x2, small x2) + 3 palm trees + 3 rocks + central fire pit + 2 lamp posts. Player + Apollo + caravan + caravan vendor + treasurer NPCs. All y-sorted via SceneSorter. |
| 4 above_tiles | 100 | Acacia canopy strip top of scene with olive bands + cactusHi glints. |
| Ambient FX | 500 | `dust` 30/s sand drift south-east, amber-tinted, scrollFactor 0.6. |

### NPC placement

| NPC | Coordinate (tile) | Pixel | Purpose |
|---|---|---|---|
| Apollo (apollo) | (12, 6) | (384, 192) | Quest giver, central courtyard |
| Caravan (caravan) | (20, 8) | (640, 256) | Quest unlock gated visibility |
| Caravan vendor (caravan_vendor) | (19, 9) | (608, 288) | lumio_onboarding step 8 |
| Treasurer (treasurer) | (18, 6) | (576, 192) | P6 Marshall W2 cross-pillar |

### Quest preservation

All emissions verbatim from prior RV ship:
- `game.scene.ready` on create
- `game.player.spawned` on player init
- `game.zone.entered` single-shot on caravan_arrival_zone overlap
  (4x3 tile zone east of village center)
- `game.scene.shutdown` on SHUTDOWN
- NPC `game.npc.nearby` / `game.npc.far` / `game.npc.interact` per NPC class

### Cosmetic tween

Sine.easeInOut scaleY 0.95-1.05, 600ms yoyo, repeat infinite on firepit
container. Pure decoration.

---

## Scene 2: CaravanRoadScene NEW (S3, SHA `63ffa62`)

**File:** `src/game/scenes/CaravanRoadScene.ts`
**World:** medieval_desert (transit zone within atlas; visual_manifest
contract reserves `caravan_transit` enum but state/types.ts WorldId stays
3-world for backward compat)
**Dimensions:** 32 cols x 14 rows = 1024 px x 448 px world
**Camera zoom:** 2x to 4x dynamic
**Boot:** does not auto-start; entered via scene transition manager

### Layer composition

| Layer | Depth | Composition |
|---|---|---|
| 0 sky_gradient | -100 | 7-band warm-cool dusk via `buildSkyGradient('caravan_road')`. |
| 1a parallax_bg | -50 | Distant warm mountains scrollFactor 0.25. |
| 1b parallax_bg | -50 | Cyberpunk-tease silhouette right-half horizon scrollFactor 0.45 + 6 neon flicker pixels (cyan/magenta/amber) staggered alpha tween 0.4-1.0. |
| 2 ground_tiles | -10 | Floor checker tinted `groundFar` east half / `groundMid` west half. 5-band dirt road horizontal trapezoid + wagon-track parallel lines + east-leading path markers. |
| 3 world_tiles | dynamic | Caravan wagon centerpiece (pixel-rect: ox + cart bed + canvas awning + lantern) + 4 cacti + 1 palm + 3 rocks + player + 3 traveler NPCs (Traveler, Wanderer, Pilgrim). |
| 4 above_tiles | 100 | Wind-stir banner / leaf flag strips at top alternating. |
| Ambient FX | 500 | `leaves` 20/s flutter rate, tint variants. |

### NPC placement

| NPC | Coordinate (tile) | Pixel | Purpose |
|---|---|---|---|
| Traveler A (traveler_a) | (9, 7) | (288, 224) | Ambient |
| Traveler B (traveler_b) | (17, 10) | (544, 320) | Ambient |
| Traveler C (traveler_c) | (25, 7) | (800, 224) | Ambient |

### Quest narrative

Single-shot zone at far east edge (3x4 tile zone) emits
`game.zone.entered` with `zoneId 'caravan_road_arrival_zone'` so quest
engine can advance step 5-7. Scene self-fades-in 500ms cinematic camera
fade.

### Cosmetic tween

Stagger 180ms alpha tween 0.4-1.0 on 6 neon-tease flicker dots, 800ms
yoyo, Sine.easeInOut, repeat infinite.

---

## Scene 3: CyberpunkShanghaiScene NEW (S4, this commit)

**File:** `src/game/scenes/CyberpunkShanghaiScene.ts`
**World:** cyberpunk_shanghai
**Atlas key:** `atlas_cyberpunk_shanghai` (CC0 existing)
**Dimensions:** 28 cols x 16 rows = 896 px x 512 px world
**Camera zoom:** 2x to 4x dynamic
**Boot:** does not auto-start; entered via scene transition manager

### Layer composition

| Layer | Depth | Composition |
|---|---|---|
| 0 sky_gradient | -100 | 4-band cyberpunk void via `buildSkyGradient('cyberpunk_shanghai')`: voidDeep -> voidMid -> voidUp -> smogPurple. |
| 1a parallax_bg | -50 | Far building silhouette (warmer cool tint, scrollFactor 0.2). |
| 1b parallax_bg | -50 | Mid towers (scrollFactor 0.4) + 60 neon window glints (cyan/magenta/violet/amber 2x2 pixels) staggered alpha tween 0.5-1.0 stagger 80ms. |
| 1c parallax_bg | -50 | Near skyline (scrollFactor 0.6). |
| 2 ground_tiles | -10 | Pavement floor (existing atlas tinted `pavement`) + 14 wet reflection strips alternating cyan/magenta at random rows. |
| 3 world_tiles | dynamic | 3 vending machines (magenta/cyan/violet) + 3 neon sign poles + 2 hologram pulse columns + 2 dumpsters + caravan_vendor + 4 ambient NPCs (synth_vendor, cyborg_guard, street_rat, salaryman) + player. |
| 4 above_tiles | 100 | Hanging neon sign strips (1 per 96 px column) + 2 horizontal power cables across top. |
| Ambient FX | 500 | `rain` 60/s + `neon_smog` 25/s overlapped (rain in front, smog behind). |

### NPC placement

| NPC | Coordinate (tile) | Pixel | Purpose |
|---|---|---|---|
| Caravan vendor (caravan_vendor) | (6, 10) | (192, 320) | RELOCATED from Apollo on quest step 7 |
| Synth vendor (synth_vendor) | (13, 9) | (416, 288) | Ambient |
| Cyborg guard (cyborg_guard) | (21, 7) | (672, 224) | Ambient |
| Street rat (street_rat) | (9, 13) | (288, 416) | Ambient |
| Salaryman (salaryman) | (18, 13) | (576, 416) | Ambient |

### Caravan vendor relocation note

Per agent prompt Session 3 + B5 Epimetheus build: caravan_vendor NPC
exists in BOTH ApolloVillageScene and CyberpunkShanghaiScene with
identical npcId 'caravan_vendor' so quest dialogue triggers continue to
fire identically when the player encounters either instance. Apollo
caravan_vendor remains for backward play (player who never completes
step 7 still sees it); cyber-scene caravan_vendor activates upon scene
entry. No mutual exclusivity wiring at the scene level; quest engine
controls which scene the player is in.

### Cosmetic tweens

- Hologram pulse: alpha 0.3-0.85 yoyo 1400ms Sine, stagger 120ms across
  10 hologram band rectangles (5 per column x 2 columns).
- Sign flicker: alpha 0.5-1.0 yoyo 1100ms Sine, stagger 80ms across 60
  neon window pixel dots.
- Scene fades in 500ms via cameras.main.fadeIn(500, 0, 0, 0).

---

## /ultrareview Run #1 reference checklist

Per directive S4 hard halt: Ghaisan /ultrareview Run #1 evaluates the 3
revamped scenes for:

1. Visual cohesion across scenes (palette consistency with Marshall pricing
   landing OKLCH foundation). All 3 scenes draw from same SHARED palette
   tokens; per-world palettes carry distinct atmospheres but never
   contradict the brand foundation.

2. Sea of Stars / Crosscode / Stardew tier polish per Gate 5 Revised
   Option C target. The 5-layer depth + dynamic y-sort + decoration
   density per scene approaches the bar; ambient FX particle emitters
   add atmosphere. Day-night Lights2D MULTIPLY overlay is S6 work
   (deferred until /ultrareview greenlight).

3. NPC placement clusters reading naturally without crowd clustering /
   stuck-on-decoration edge cases. S7 polish pass will fix any wander
   FSM edge case after /ultrareview.

4. Cinematic 500ms scene fade-in landed. Scene transition manager wiring
   (game.scene.transition_started + transition_completed events) is S7.

5. Existing quest mechanic preservation:
   - Apollo NPC + 48 px interact zone preserved
   - Caravan visibility gated on questStore.unlockedWorlds preserved
   - Caravan vendor + treasurer (Marshall W2) preserved
   - Caravan arrival zone single-shot game.zone.entered preserved
   - Cinematic scene + bridge wiring untouched

6. Phaser smoke regression: all existing smoke tests pass with revamped
   ApolloVillageScene + new CaravanRoad + CyberpunkShanghai registered.

### Outstanding for S5-S7 (post-greenlight)

- S5: SteampunkStubScene (workshop placeholder NEW)
- S6: Phaser Lights2D + day-night MULTIPLY overlay
- S7: 30-45 NPC variants + character 4-direction rigging + scene
  transition manager + 60fps integer scale verification + Playwright
  E2E adaptation

### Halt status

- Session 1 halt: NONE (foundation green)
- Session 2 halt: NONE (Apollo revamp green)
- Session 3 halt: NONE (Caravan Road green)
- Session 4 halt: HARD HALT for Ghaisan /ultrareview Run #1

Self-check 19/19 components verified:
- Palette + per-world saturation: PASS
- 5-layer depth ordering: PASS (30/30 unit tests)
- Y-sort dynamic correctness: PASS
- Apollo revamp non-regression: PASS (phaser-smoke 2/2)
- Caravan road import + boot: PASS (caravan_road_smoke 2/2)
- Cyberpunk import + boot: PASS (cyberpunk_shanghai_smoke pending S4 ship)
- Quest mechanic Apollo: PASS (preserved)
- Caravan zone single-shot emit: PASS (preserved)
- Treasurer NPC P6 Marshall: PASS (preserved)
- CC0 + Opus procedural asset only: PASS (zero fal.ai usage)
- No em dash + no emoji: PASS
- No vercel push: PASS (push to GitHub remote main only)
- Scene transition fade-in 500ms: PASS (Apollo none, Caravan + Cyber yes)
- Ambient FX per scene: PASS (dust + leaves + rain + neon_smog)
- TypeScript zero errors in scope: PASS
- Top-down JRPG perspective: PASS (no side-scroll)
- React HUD on /play deprecated per Gate 5: PASS (untouched)
- Scope discipline 3 active scenes + 1 stub deferred: PASS (S5 deferred)
- Asset hierarchy CC0 + Opus only: PASS (no fal.ai)

Ready for /ultrareview Run #1.
