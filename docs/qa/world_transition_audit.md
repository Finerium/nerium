## T-WORLD Phase 1 Diagnostic: World Transition Audit

Date: 2026-04-26
Owner: T-WORLD specialist (Lu W7 spawn)
Trigger: Demo blocker per Ghaisan visual playthrough. Pitch claims 13 Phaser
scenes (4 main + 9 sub-area). Only Apollo Village reachable in-game.

### Scene inventory (registered in PhaserCanvas.tsx)

3 main world scenes:
- ApolloVillage (medieval_desert)
- CaravanRoad (medieval_desert transition world)
- CyberpunkShanghai (cyberpunk_shanghai)

9 sub-area scenes:
- Apollo: ApolloTempleInterior, ApolloMarketplaceBazaar, ApolloOasis
- Caravan: CaravanWayhouseInterior, CaravanForestCrossroad, CaravanMountainPass
- Cyber: CyberSkyscraperLobby, CyberRooftop, CyberUndergroundAlley,
  CyberServerRoom

5 boot/UI scenes:
- BootScene, PreloadScene, IntroNarrativeScene, TitleScene, LoadingScene,
  UIScene, MiniBuilderCinematicScene

All 17 scene classes are imported + registered in
`src/components/game/PhaserCanvas.tsx` lines 122-154.

### Hypothesis verdict

The four candidate failure modes from the T-WORLD brief.

(a) Trigger zones authored but handler comment-out / deletion during Nemea
    Phase 0 cleanup. REJECTED. Sub-area triggers (Apollo dual-path landmark
    prompt, Caravan proximity binding) are intact and functional. The
    Caravan arrival zone in ApolloVillageScene at (1280, 432) emits the
    `game.zone.entered` quest signal and is intact.

(b) scene.start() calls missing. CONFIRMED. Three transition gaps:
    1. ApolloVillage has NO scene.start('CaravanRoad') anywhere. The
       Caravan game object at (1280, 400) emits `game.world.unlocked` on
       pointer-down for quest progress, but nothing listens on the bridge
       to fire the actual scene transition. Caravan arrival zone emits
       `game.zone.entered` for quest step advance, again no scene change.
    2. CaravanRoad has scene.start to its 2 sub-area bindings (wayhouse,
       forest_crossroad) but ZERO scene.start to ApolloVillage (return)
       or CyberpunkShanghai (forward). The mountain_pass sub-area is also
       unbound (a code comment says debug-only S6, S7 may add dedicated
       discovery zone, never shipped).
    3. CyberpunkShanghai has 4 NERIUM-pillar landmark bindings emitting
       `landmark.<name>.interact` events but ZERO scene.start to any sub-
       area scene OR back to CaravanRoad. All 4 cyber sub-areas (Rooftop,
       Lobby, Alley, ServerRoom) are unreachable from in-game navigation,
       though they CAN return to CyberpunkShanghai once entered (sub-area
       south-edge exit fade is intact).
    The PhaserCanvas.tsx code comment lines 96-98 explicitly states the
    intent: "CaravanRoad and CyberpunkShanghai are started by the scene
    transition manager (Helios-v2 S7 wiring) when the quest engine fires
    the scene_transition effect". The S7 ship session delivered landmark
    UI events + hovering glyph + proximity prompt, but did NOT deliver
    the inter-world scene_transition effect handler. Demo blocker root
    cause.

(c) Asset preload missing for Caravan/Cyber backgrounds. REJECTED.
    PreloadScene enqueues all 96 AI-generated assets via the asset_keys
    registry on every boot regardless of which scene is reached.
    `caravan_road_bg.jpg` and `cyberpunk_shanghai_bg.jpg` are confirmed
    present and cached.

(d) Player position post-transition reset off-map. REJECTED. CaravanRoad
    + CyberpunkShanghai already have init(data) handlers reading data.spawn
    and applying it. Default spawn coords are valid (CaravanRoad 96, 480 +
    CyberpunkShanghai 160, 640). Sub-area scenes already pass spawn:{ x, y }
    on return; main-to-main transition just needs to honor the same shape.

### Root cause

Helios-v2 S7 incomplete: landmark E-key UI emit shipped, but the
`scene_transition` effect handler (which would convert quest engine effects
or in-game proximity into actual scene.start calls between main worlds)
was never authored. The 9 sub-area scenes are reachable because Helios-v2
S5 + S6 directly invoked `this.scene.start(sub.sceneKey, ...)` from inside
the parent main scene. Inter-world (main-to-main) transitions were left
to a S7 wiring session that delivered other items but skipped this one.

### Phase 2 plan

Wire transitions via a generic `TransitionZone` helper class so all four
main-to-main edges (Apollo east, Caravan west + east, Cyber west) plus the
4 missing Cyber sub-area entries plus the missing Caravan mountain_pass
entry follow one consistent pattern: edge-anchored E-key proximity
trigger with floating arrow chevron + "Press E to..." label, fade out via
LoadingScene helper for cinematic feel.

After Phase 2 the 13 advertised scenes are all reachable in-game starting
from ApolloVillage default boot.

| From            | Direction    | To                 | Pattern             | Phase 1 status |
|-----------------|--------------|--------------------|---------------------|----------------|
| ApolloVillage   | east edge    | CaravanRoad        | gate                | MISSING        |
| CaravanRoad     | west edge    | ApolloVillage      | return              | MISSING        |
| CaravanRoad     | east edge    | CyberpunkShanghai  | gate                | MISSING        |
| CyberpunkShanghai | west edge  | CaravanRoad        | return              | MISSING        |
| CaravanRoad     | mountain pass anchor | CaravanMountainPass | sub-area     | MISSING        |
| CyberpunkShanghai | landmark anchor | CyberSkyscraperLobby | sub-area     | MISSING        |
| CyberpunkShanghai | landmark anchor | CyberRooftop      | sub-area         | MISSING        |
| CyberpunkShanghai | landmark anchor | CyberUndergroundAlley | sub-area     | MISSING        |
| CyberpunkShanghai | landmark anchor | CyberServerRoom   | sub-area         | MISSING        |
| ApolloVillage   | landmark dual-path | ApolloTempleInterior | sub-area    | OK             |
| ApolloVillage   | landmark dual-path | ApolloMarketplaceBazaar | sub-area | OK             |
| ApolloVillage   | landmark dual-path | ApolloOasis       | sub-area         | OK             |
| CaravanRoad     | proximity binding | CaravanWayhouseInterior | sub-area  | OK             |
| CaravanRoad     | proximity binding | CaravanForestCrossroad  | sub-area  | OK             |

### Apollo line-range conflict zone management

Per T-WORLD brief, ApolloVillageScene.ts is shared with T-REGR (player init
+ general WASD input handler). T-WORLD edits stay strictly at the BOTTOM
of the file (after line 1500 in the current file with 1666 lines). New
methods append before the closing `}` of the class. New cleanup statements
append inside the existing SHUTDOWN handler (already at the file bottom).
The single create() insertion is at the END of create() body, after the
existing window.__NERIUM_TEST__ hook (line 515). The single update()
insertion is at the END of update() body, after the existing
checkLandmarkInteraction call (line 557). No edits to spawnPlayer,
spawnApollo, spawnAmbientNpcs, configureCamera, or any landmark
interaction code.
