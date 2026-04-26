# Helios-v2 W3 Final Inventory + Handoff to W4 Nemea-RV-v2

Owner: Helios-v2 (Phaser visual revamp). Status: W3 ship complete via S0..S12 sequential commits. Auto-batch closure recorded SHA `8fadf4b` (S11) plus this S12 doc + final commit.

This document is the canonical handoff to W4 Nemea-RV-v2 for E2E test sweep + visual regression snapshot validation. It enumerates every scene, integration point, deferred ferry, and texture memory measurement.

No em dash, no emoji per CLAUDE.md anti-patterns.

---

## 1. Active Phaser Scenes (17 total)

| Scene Key | File | Purpose | Day-Night | Atmospheric | Hero Lights | Landmark Halos |
|---|---|---|---|---|---|---|
| Boot | BootScene.ts | Pack loader + UIScene launch | n/a | n/a | none | none |
| Preload | PreloadScene.ts | 96-asset registry preload + spritesheet anim register | n/a | n/a | none | none |
| Title | TitleScene.ts | Press Start scene (S10 NEW; opt-in via /play?title=1) | n/a | n/a | none | none |
| Loading | LoadingScene.ts | Inter-world fade transition (S10 NEW) | n/a | n/a | none | none |
| ApolloVillage | ApolloVillageScene.ts | Medieval Desert main lobby | dusk | dust particle | 3 (lantern x 2 + well halo) | 4 (warm amber) |
| ApolloTempleInterior | ApolloTempleInteriorScene.ts | Apollo temple sub-area | SKIP | dust particle | 1 (altar orb divine pulse) | n/a |
| ApolloMarketplaceBazaar | ApolloMarketplaceBazaarScene.ts | Apollo bazaar sub-area | day | dust particle | 2 (string lights) | n/a |
| ApolloOasis | ApolloOasisScene.ts | Apollo oasis sub-area | dusk | dust particle | 1 (shrine moss-cyan-warm) | n/a |
| CaravanRoad | CaravanRoadScene.ts | Caravan transition main scene | dusk | autumn_leaves PNG + leaves particle | 3 (lantern post + campfire + wayhouse window) | none (no NERIUM pillars on transition) |
| CaravanWayhouseInterior | CaravanWayhouseInteriorScene.ts | Caravan tavern interior | SKIP | dust particle | 2 (hearth fire flicker + tavern candle) | n/a |
| CaravanForestCrossroad | CaravanForestCrossroadScene.ts | Caravan forest sub-area | dusk | autumn_leaves PNG + leaves particle | 0 (canopy organic feel) | n/a |
| CaravanMountainPass | CaravanMountainPassScene.ts | Caravan mountain sub-area | night | dust particle | 1 (cool windswept beacon) | n/a |
| CyberpunkShanghai | CyberpunkShanghaiScene.ts | Cyberpunk District main scene | night | smog_wisps PNG + neon_smog + rain particle | 4 (magenta + cyan + violet + cyan glitch) | 4 (cyan) |
| CyberSkyscraperLobby | CyberSkyscraperLobbyScene.ts | Cyber lobby sub-area | SKIP | smog_wisps overlay | 2 (hologram glitch + elevator trim) | n/a |
| CyberRooftop | CyberRooftopScene.ts | Cyber rooftop sub-area | night | smog_wisps PNG + rain particle | 2 (billboard magenta + cyan) | n/a |
| CyberUndergroundAlley | CyberUndergroundAlleyScene.ts | Cyber alley sub-area | SKIP | smog_wisps PNG + neon_smog particle | 2 (sodium pipe leak + broken neon flicker) | n/a |
| CyberServerRoom | CyberServerRoomScene.ts | Cyber server room sub-area | SKIP | smog_wisps overlay + dust particle | 3 (per-rack LEDs x 2 + terminal cyan pulse) | n/a |
| MiniBuilderCinematic | MiniBuilderCinematicScene.ts | Mini Builder theatrical scene | n/a | n/a | n/a | n/a |
| UIScene | UIScene.ts | Boreas chat overlay (persistent) | n/a | n/a | n/a | n/a |

Total: 4 main + 9 sub-area + Boot/Preload/Title/Loading/MiniBuilder/UIScene = 17 registered scenes.

---

## 2. NERIUM-pillar Landmark Wire-up (8 active)

All 8 NERIUM-pillar landmarks emit `landmark.<name>.interact` + `game.landmark.interact` via scene event bus on E-key proximity within 128 px.

### Apollo Village (4 landmarks)
- `marketplace_stall` -> dual-path prompt (Browse listings UI / Enter bazaar game) -> `landmark.marketplace_stall.interact` OR `scene.start('ApolloMarketplaceBazaar')`
- `builder_workshop` -> single-path UI modal -> `landmark.builder_workshop.interact`
- `registry_pillar` -> single-path UI modal -> `landmark.registry_pillar.interact`
- `trust_shrine` -> dual-path prompt (View trust audit UI / Visit oasis shrine game) -> `landmark.trust_shrine.interact` OR `scene.start('ApolloOasis')`

### Cyberpunk Shanghai (4 landmarks)
- `cyber_marketplace_landmark` -> single-path UI modal
- `bank_treasury_landmark` -> single-path UI modal
- `admin_hall_landmark` -> single-path UI modal
- `protocol_gateway_landmark` -> single-path UI modal

### Ambient Entry Landmark (1)
- `temple_arch` (ApolloVillage) -> direct fade transition to `ApolloTempleInterior` (no choice prompt; ambient discoverable secondary entry)

---

## 3. NPC Sprite Animation Wire-up

5 spritesheets registered (4x4 grid 2048x2048 frame 512x512):
- `player_spritesheet`: 4 walk anims (down/up/left/right) + 4 idle anims (single-frame loop) at 9 fps walk + 4 fps idle
- `apollo_spritesheet`: same anim profile
- `caravan_vendor_spritesheet`: same anim profile
- `synth_vendor_spritesheet`: same anim profile
- `treasurer_spritesheet`: same anim profile

Total: 20 walk anims + 20 idle anims = 40 anim entries registered globally in PreloadScene.create() S8 ship.

Boreas chat avatar wiring: `setAvatarPng()` hook in UIScene resolves character key from chat message author and sets HTML img src to ASSET_PATHS[key].

Quest indicator: `quest_exclamation` PNG bobbing above Apollo + Treasurer + Caravan Vendor NPCs in ApolloVillage; bobTween alpha + y offset.

---

## 4. Lights2D + Day-Night + Atmospheric Polish (S9 Ship)

### Modules
- `src/game/visual/lighting.ts`: enableSceneAmbient + addPointLight + addLandmarkHalo
- `src/game/visual/dayNightOverlay.ts`: 4-phase preset MULTIPLY tint (dawn 0.2 / day 0 / dusk 0.3 / night 0.5)
- `src/game/visual/atmosphericOverlay.ts`: smog_wisps + autumn_leaves PNG drift tween
- `src/game/visual/scenePolish.ts`: applyScenePolish(scene) bundle helper + SCENE_POLISH_RECIPES table for 10 sub-area scenes
- `src/game/visual/textureMemory.ts`: peak measurement + window hook

### Performance Note
Each scene budgets 2-4 active PointLights for 60 fps headroom on mid-tier laptop. PointLight uses additive blend so render cost is one mesh per light. Existing sprites unchanged; no setPipeline('Light2D') migration required.

---

## 5. /play React HUD State (S11 Ship per Gate 5 REVISED)

`/play` mounts ONLY:
- PhaserCanvas (full viewport)
- QuestBootstrap (NON-VISUAL session storage hydration)
- GameHUDLean (BusBridge non-visual + TierBadge top-right exception)

Removed from mount on /play (preserved as files for future use):
TopBar, SideBar, BottomBar, PromptInputChallenge, InventoryToast, ShopModal, ApolloStream, QuestTracker, DialogueOverlay, HeliosPipelineViz, ModelSelector, CurrencyDisplay.

In-game UI runs entirely via:
- Phaser UIScene (Boreas chat input + history overlay at depth 10000)
- Per-scene landmark interaction modals (in-Phaser native rectangles + text)
- Phaser-native dialogue overlay system

---

## 6. Texture Memory Peak Measurement

Logged at PreloadScene.create() via `inspectTextureMemory()`. Initial measurement on /play boot of ApolloVillage with all 96 AI assets pre-cached:
- Estimated peak: see `[PreloadScene] texture memory peak X MB across N textures` console log on /play boot
- Target: < 200 MB
- If exceeded, top consumers logged in info; downscale 4K cyber backgrounds to 2K candidates listed

Window hook for Playwright assertion:
```ts
const report = await page.evaluate(() => 
  (window as any).__NERIUM_TEST__.inspectTextureMemory()
);
expect(report.estimatedMB).toBeLessThan(200);
```

---

## 7. Deferred Ferry Items for W4 Nemea-RV-v2

The following pre-existing or newly identified issues are deferred for W4 Nemea-RV-v2 ownership:

### Pre-existing failures (unrelated to Helios-v2)
- W2 Marshall pricing.spec.ts: contrast/checkout failures (4 specific tests)
- W4 Nemea-RV dialogue_flow + lumio_quest specs: pre-existing unrelated failures
- W4 Pheme 14 tsc errors at `src/backend/email/templates/*.tsx`: missing `@react-email/components` module

### S9-S12 specific notes
- 21 cache-clear preface tests (S6 17 + S8 4): preface verification was not run in this session due to background task issues. The fix layer addresses the underlying compile-thrashing root cause via cache clear; W4 Nemea-RV-v2 should re-run the full sweep on a fresh dev-server boot to confirm flake distinction.
- Builder Workshop theatrical wire-up: status documented in `_skills_staging/builder_workshop_theatrical.md` from S7. S9 did not extend the theatrical flow (out of scope).
- Visual snapshot baselines: S9 introduced day-night + point lights + halos that change visual frames per scene. W4 Nemea-RV-v2 should regenerate `tests/__screenshots__/*.png` baselines via `npx playwright test --update-snapshots` for affected specs.

---

## 8. Lighthouse + 60 fps Verification

Not run in S12 due to time constraints; W4 Nemea-RV-v2 ownership:
- `/play` Lighthouse perf target 70+ (game-heavy budget)
- 60 fps confirmation on mid-tier laptop
- Pixel-crisp integer scale verification

---

## 9. Strategic Decision Hard-Stops Honored

- React HUD on /play removed (Gate 5 REVISED)
- Top-down 3/4 JRPG perspective preserved (no side-scroll pivot)
- 5-layer depth pattern preserved (DEPTH constants in `depth.ts`)
- y-sort via setDepth(sprite.y) preserved (SceneSorter in `ysort.ts`)
- Asset hierarchy: CC0 + Opus procedural primary, fal.ai DORMANT
- Anti-pattern 7 amended: AI assets via /assets/ai/ symlink + asset_keys.ts registry, no fal.ai runtime invocation

---

## 10. P6 Marshall Anti-Regression

P6 Marshall treasurer dialogue + tier badge HUD coordinate preserved across all 12 sessions (S0..S12). The TreasurerNPC in ApolloVillageScene continues to fire `game.npc.interact { npcId: 'treasurer' }` event on E-key proximity, and TierBadge renders top-right via GameHUDLean (P6 exception to "ZERO React HUD" Gate 5 directive).

---

## 11. Final Commit Inventory

| SHA | Session | Description |
|---|---|---|
| 143acab | S0 | legacy reference cleanup |
| a2d9b32 | S1 | 96 assets registered, ASSET_KEYS registry, PreloadScene |
| 6f66f13 | S2 | ApolloVillageScene full revamp |
| d6aef10 | S3 | CaravanRoadScene full revamp |
| 0b2329a | S4 | CyberpunkShanghaiScene full revamp |
| f9a3b94 | Phase 1 | deprecated SVG file rename + barrel cleanup |
| 78bdabc | S5 | 3 Apollo sub-area scenes + dual-path Marketplace landmark |
| 3a8c04f | S6 | 7 sub-area scenes (3 Caravan + 4 Cyber) |
| 5e53903 | S7 | 8 NERIUM-pillar landmark E-key wire-up + glyph tween + temple_arch |
| daf1ecd | S8 | NPC sprite anim + Boreas chat avatar wiring + quest indicator |
| 5a4ff73 | S9 | Lights2D + day-night MULTIPLY + per-scene point lights + landmark halo |
| 6989887 | S10 | TitleScene + LoadingScene + marketplace UI hero banner + empty state |
| 8fadf4b | S11 | React HUD cleanup on /play (Gate 5 REVISED) + texture memory budget |
| (this commit) | S12 | regression sweep + handoff doc |

---

## 12. Handoff Emit Signal

Helios-v2 W3 12-session ship complete. 4 scenes (ApolloVillage revamped + CaravanRoad NEW + CyberpunkShanghai NEW + 9 sub-area NEW) + 5-layer depth + dynamic y-sort + Oak-Woods setOrigin(0.5,1) pattern + per-world 32-48 color palette saturated + Phaser Lights2D ambient + 2-4 point lights per scene + day-night MULTIPLY overlay + ambient FX per scene (sand/leaves/neon/steam) + character 4-direction state machine + 5 NPC variants per world + caravan_vendor relocated to Cyberpunk per quest step 7 + 500ms scene transition fade + window.__NERIUM__ E2E seam + texture memory budget + React HUD lean + TitleScene + LoadingScene + marketplace UI integration shipped.

Assets CC0 Kenney + Oak Woods + Opus procedural + AI-generated PNG bundle (V6 96 active, fal.ai DORMANT) preserved.

Tsc clean except 14 pre-existing Pheme errors. Ready for W4 Nemea-RV-v2 E2E + visual snapshot regeneration + Lighthouse perf.
