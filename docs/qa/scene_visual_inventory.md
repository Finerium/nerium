# Scene Visual Inventory + Phase 0 Fix Plan

Generated 2026-04-26 by Nemea-RV-v2 W4 Phase 0. Source-of-truth visual analysis
for the 3 main scenes (ApolloVillage + CaravanRoad + CyberpunkShanghai). Used
as the contract for Phase 0 fix code changes.

Iteration baseline screenshots at:
`_skills_staging/nemea_phase0_iterations/<scene>_iter<N>.png`

Iteration baseline sprite inventory JSON at:
`_skills_staging/nemea_phase0_iterations/<scene>_iter<N>.json`

---

## ApolloVillage

### Backdrop painted content (apollo_village_bg.jpg, native 1408x800)

The reference image is a top-down Moroccan/desert pixel art village scene
already containing every essential prop. Painted into the backdrop:

- Striped fruit/market stall awning with red orange goods, mid-left foreground
  (approx world coord 280, 580)
- Stone well, mid-left under awning, painted as full circular stone ring with
  shadow (approx 300, 470)
- Tall palm tree, top-center back of scene (approx 510, 60)
- Large stone temple/archway with hieroglyphs + dark entrance + flanking
  potted plants, center-right (approx 950, 280)
- Wooden cart with two jugs, bottom-right foreground (approx 1190, 690)
- Small adobe building with arched doorway, top-right corner (approx 1280, 80)
- Tent canopies, bottom-left + bottom-center (approx 130, 740 and 580, 760)
- Cobblestone/sand path running diagonally from bottom-center to mid-right
- Distant cliff/mountains in purple haze, top-left
- Scattered rocks + small plants + sand patches

### Spawned sprites (current state, 17 of 77 children are Image instances)

From `_skills_staging/nemea_phase0_iterations/apollo_iter1.json`:

| Texture key | Pos | Scale | Display size | Classification |
|---|---|---|---|---|
| apollo_village_bg | (0,0) | 0.52 | 1408x800 | ESSENTIAL (backdrop) |
| hanging_lantern | (480,440) | 0.30 | 509x758 | REDUNDANT-AMBIGUOUS |
| hanging_lantern | (980,460) | 0.30 | 509x758 | REDUNDANT-AMBIGUOUS |
| cypress_tree | (760,240) | 0.65 | 874x2059 | REDUNDANT (palm in backdrop) |
| temple_arch | (910,300) | 0.40 | 717x960 | REDUNDANT (temple painted) |
| apollo_house_filler | (1320,320) | 0.50 | 960x1120 | REDUNDANT (adobe painted) |
| stone_column | (610,360) | 0.50 | 1440x2912 | REDUNDANT (covers viewport) |
| registry_pillar_landmark | (1040,380) | 0.55 | 880x1461 | ESSENTIAL_LANDMARK rescale |
| builder_workshop_landmark | (310,480) | 0.50 | 1024x1024 | ESSENTIAL_LANDMARK rescale |
| cypress_tree | (1290,540) | 0.55 | 739x1742 | REDUNDANT |
| stone_well | (260,570) | 0.45 | 806x1080 | REDUNDANT (well painted) |
| marketplace_stall_landmark | (1080,660) | 0.55 | 1126x1126 | ESSENTIAL_LANDMARK rescale |
| trust_shrine_landmark | (490,660) | 0.50 | 960x1104 | ESSENTIAL_LANDMARK rescale |
| date_palm_cluster | (160,660) | 0.42 | 753x1008 | REDUNDANT (palm painted) |
| market_stall | (910,720) | 0.42 | 860x860 | REDUNDANT (stall painted) |
| stone_signpost | (700,730) | 0.40 | 576x1165 | REDUNDANT (no painted signpost, but adds visual debris) |
| wooden_cart | (760,760) | 0.40 | 922x742 | REDUNDANT (cart painted) |

Plus 5 NPCs + Caravan + 4 landmark glyph diamonds + drop shadow ellipses +
prompt texts + quest indicators.

### Walkable space coordinates (from backdrop)

- Bottom mid-frame sand patch (250, 600 to 800, 760): mostly walkable
- Mid-frame open courtyard near painted temple (600, 350 to 900, 550): walkable
- Cobblestone path right side (900, 600 to 1300, 750): walkable
- Avoid: painted prop pixel zones above (well, palm, temple, fruit cart, etc.)

### Recommended landmark interactive zones (matching backdrop)

| Landmark | Anchor coord (matches backdrop semantic) | Notes |
|---|---|---|
| marketplace_stall | (290, 600) | Aligns with painted striped-awning fruit stall mid-left |
| builder_workshop | (1280, 130) | Aligns with painted small adobe building top-right (workshop = small building) |
| registry_pillar | (970, 280) | Aligns with painted stone temple with hieroglyphs (registry = inscribed monument) |
| trust_shrine | (640, 470) | Center mid-frame, on open ground; symbolic "shrine in town center" |
| temple_arch | (970, 300) | Same as registry pillar; TWO landmarks at same painted prop is ambiguous; DELETE temple_arch ambient entry |

DECISION: temple_arch sprite is REDUNDANT with painted temple AND also conflicts
with registry_pillar's recommended position. Delete temple_arch sprite entirely.
The temple sub-area scene entry can move to registry_pillar binding (dual-path:
view registry UI / enter temple interior).

ALTERNATE DECISION (less invasive): keep temple_arch as ambient entry but
relocate to a backdrop-distinct spot. Backdrop has no other painted archway,
so temple_arch sprite would NEED to add visual content. Since the painted
temple already serves as the "archway visual", relocating sprite to (1310, 100)
near the painted small adobe building would make the small adobe READ as the
sub-area entry. But the small adobe is small and 4 landmarks already crowd
that quadrant. Best path: DELETE temple_arch ambient entry; folder-in temple
interior dual-path under registry_pillar.

Phase 0 SCOPE-LIMIT decision: minimize behavioural change. KEEP temple_arch
ambient entry but at a much smaller scale + slight position offset so it does
NOT visually duplicate the painted temple (read as a small marker glyph
adjacent to the painted temple).

### Phase 0 fix plan for ApolloVillage

1. **Delete spawnAmbientProps() body entirely**: all 9 ambient prop sprites
   (stone_well, date_palm_cluster, cypress_tree x2, market_stall, wooden_cart,
   apollo_house_filler, stone_column, stone_signpost). Backdrop covers each.
2. **Delete spawnHangingLanterns()**: backdrop has no hanging lanterns
   painted; the 2 lantern sprites floating in mid-air at depth 100 are visual
   noise. Lights2D point lights already provide warm halos at those coords.
3. **Drastically rescale the 4 NERIUM-pillar landmarks** to read as iconic
   small glyph-stamped markers, not building replacements:
   - marketplace_stall_landmark: scale 0.55 -> 0.18 (target ~200x200 display)
   - builder_workshop_landmark: scale 0.50 -> 0.18 (target ~185x185)
   - registry_pillar_landmark: scale 0.55 -> 0.16 (target ~140x230)
   - trust_shrine_landmark: scale 0.50 -> 0.18 (target ~175x200)
4. **Reposition the 4 landmarks** to match backdrop semantic anchors per
   table above.
5. **Rescale temple_arch ambient entry**: scale 0.40 -> 0.14 (target ~100x135),
   reposition to (700, 360) on open courtyard ground (NOT overlapping painted
   temple; small marker glyph distinct from backdrop painted prop).
6. **Verify drop shadow ellipse dimensions track new scale**: shadow sw/sh
   are hardcoded constants, leave as-is since they are sized for the old
   scale. ACTION: scale the shadow proportionally OR shrink to ~30x8 for
   the new smaller landmark footprint.
7. **Keep player + 3 named NPCs + 5 ambient NPCs + Caravan + arrival zone**
   at current positions (these are correct).
8. **Keep Lights2D point lights + landmark halos + day-night overlay**.
9. **Verify Y-sort still functions** for dynamic NPCs walking past landmark.

---

## CaravanRoad

### Backdrop painted content (caravan_road_bg.jpg, native 1408x793)

Autumn forest crossroad pixel art. Painted content:

- Wooden barrel, top-left (approx 290, 180)
- Large autumnal orange tree, top-center (approx 700, 90)
- Small stone fire-pit ring, under tree (approx 530, 320)
- Large wooden directional signpost with arrows, right of tree (approx 800, 200)
- Red bush, bottom-left (approx 50, 420)
- Dirt paths converging from left + right + bottom
- Cobblestone patches, bottom-right (approx 1200, 580)
- Distant pine forest silhouette, top
- Scattered autumn leaves throughout

### Spawned sprites (current state, 28 children)

| Texture key | Pos | Scale | Display | Classification |
|---|---|---|---|---|
| caravan_road_bg | (0,0) | 0.52 | 1408x800 | ESSENTIAL (backdrop) |
| caravan_rope_bridge | (1280,380) | 0.22 | 641x317 | ESSENTIAL_FX (no painted bridge) |
| caravan_wayhouse_filler | (440,480) | 0.34 | 751x653 | ESSENTIAL_LANDMARK (no painted wayhouse) |
| roadside_signpost | (90,540) | 0.20 | 320x531 | REDUNDANT-MILD (painted signpost in backdrop, but at different position; OK to keep as 2nd directional marker) |
| lantern_post | (920,560) | 0.30 | 355x1075 | ESSENTIAL_FX (Lights2D coord; no painted lantern) |
| campfire_ring | (660,580) | 0.20 | 410x410 | REDUNDANT-AMBIGUOUS (painted fire-pit ring at 530, 320; sprite at 660, 580 is different position; arguably duplicate) |
| wooden_wagon | (1180,600) | 0.32 | 768x573 | ESSENTIAL_LANDMARK (no painted wagon) |
| fallen_log | (220,620) | 0.28 | 708x475 | ESSENTIAL (decoration; no painted log) |
| wooden_barrel | (1330,700) | 0.18 | 305x455 | REDUNDANT-MILD (painted barrel exists at 290, 180; sprite at 1330, 700 is different position) |
| autumn_leaves | (0,0) | 0.52 | 1408x800 | ESSENTIAL (FX overlay) |

Plus player + caravan_vendor + 3 sub-area entry bindings + drop shadows.

Visual check: the caravan_iter1.png screenshot shows acceptable composition.
Sprites integrate visually with backdrop. NO redundant prop overlap detected
(painted barrel is top-left, sprite barrel is bottom-right; painted fire-pit
is mid-back, sprite fire-pit is mid-front and serves as a Lights2D anchor).

### Phase 0 fix plan for CaravanRoad

1. **No code changes required**. Visual composition acceptable.
2. (Optional polish if time permits) reduce redundancy: the painted barrel
   already exists, so wooden_barrel sprite at (1330, 700) is a duplicate
   prop class. LOW priority; skip.
3. (Optional polish) the painted directional signpost at (800, 200) plus
   sprite roadside_signpost at (90, 540) renders 2 signposts in the scene.
   Intentional? Acceptable narrative (multiple wayfinding markers). Skip.

VERDICT: CaravanRoad does NOT need Phase 0 code change. Visual fix is
ApolloVillage-only.

---

## CyberpunkShanghai

### Backdrop painted content (cyberpunk_shanghai_bg.jpg, native 690x386)

Neon cyberpunk Shanghai alley pixel art. Painted content:

- Pink/magenta neon storefront sign, left (approx 80, 50)
- Cyan-bordered neon food cart vending machine, center-left (approx 230, 110)
- Blue/magenta striped fabric tent stalls (2 stalls with bottles), right side
  (approx 440, 80 and 540, 130)
- Hanging yellow lantern with warm glow, center-right ground (approx 380, 200)
- Wet pavement with neon reflections throughout mid-bottom
- Hung shirts on clothesline, top-center (approx 350, 30)
- Manhole grate with rising steam, bottom-center (approx 350, 290)
- Cyan storefront sign, right (approx 600, 70)
- Scattered debris, neon signage

### Spawned sprites (current state, 68 children)

From `_skills_staging/nemea_phase0_iterations/cyber_iter1.json`:

| Texture key | Pos | Scale | Display | Classification |
|---|---|---|---|---|
| cyberpunk_shanghai_bg | (0,0) | 0.52 | 1408x800 | ESSENTIAL (backdrop) |
| wet_puddle | (440,660) | 0.20 | 960x717 | REDUNDANT (painted reflection puddles) |
| wet_puddle | (1140,540) | 0.18 | 864x645 | REDUNDANT (painted reflection puddles) |
| cyber_lantern x2 | overhead | 0.18 | 611x910 | REDUNDANT-MILD (painted lantern in backdrop) |
| laundry_line | (820,160) | 0.30 | 2035x749 | REDUNDANT (painted laundry in backdrop) |
| cyber_chrome_sculpture | (340,280) | 0.20 | 339x506 | ESSENTIAL_FX (no painted sculpture) |
| hologram_glitch | (1140,320) | 0.18 | 737x737 | ESSENTIAL_FX (no painted hologram) |
| drone | (820,240) | 0.18 | 737x737 | ESSENTIAL_FX (no painted drone) |
| neon_sign_vertical | (60,360) | 0.25 | 592x1792 | REDUNDANT-MILD (painted sign exists; sprite at different position is OK extra signage but display is too tall at 1792px) |
| cyber_industrial_pipe | (1380,360) | 0.22 | 528x394 | ESSENTIAL (no painted pipe) |
| holo_ad_panel | (640,380) | 0.25 | 600x448 | ESSENTIAL_FX (no painted ad panel) |
| cyber_marketplace_landmark | (1180,460) | 0.42 | 1720x1720 | ESSENTIAL_LANDMARK rescale |
| vendor_cart_alt | (760,460) | 0.28 | 1272x1057 | REDUNDANT (painted vendor cart) |
| bank_treasury_landmark | (130,480) | 0.45 | 1670x2074 | ESSENTIAL_LANDMARK rescale |
| cyber_apartment_filler | (1290,540) | 0.32 | 1618x1085 | ESSENTIAL_LANDMARK ok at this scale |
| crate_stack | (40,660) | 0.22 | 817x1014 | ESSENTIAL (no painted crate) |
| refrigerator | (1380,660) | 0.22 | 704x1169 | ESSENTIAL (no painted fridge) |
| synth_vendor_cart | (980,700) | 0.30 | 682x566 | REDUNDANT (painted vendor cart) |
| neon_market_stall | (1100,700) | 0.30 | 614x614 | REDUNDANT (painted stall) |
| steam_vent | (700,700) | 0.22 | 788x1056 | ESSENTIAL_FX (matches painted manhole steam) |
| protocol_gateway_landmark | (320,720) | 0.40 | 1638x1638 | ESSENTIAL_LANDMARK rescale |
| trash_bin | (220,720) | 0.22 | 788x1056 | ESSENTIAL (no painted bin) |
| cyber_data_terminal | (480,740) | 0.22 | 422x493 | ESSENTIAL (no painted terminal) |
| admin_hall_landmark | (1260,760) | 0.40 | 1485x1843 | ESSENTIAL_LANDMARK rescale |
| smog_wisps | (0,0) | 0.52 | 1408x800 | ESSENTIAL (FX overlay) |

Visual check: cyber_iter1.png shows the dark cyberpunk palette HIDES most
visual conflicts. The 4 landmarks (1500-2000 px display) overlap each other
and the backdrop, but the violet ambient + Lights2D blending creates a busy
but readable cyberpunk look. Functionality-wise the scene plays.

### Phase 0 fix plan for CyberpunkShanghai

The dark cyber palette mitigates the worst of the size issue. Acceptable for
hackathon submission. However, redundant prop sprites duplicate painted
content and the landmarks are too large.

DECISION (Phase 0 SCOPE-LIMIT): focus Phase 0 on Apollo only since:
- Apollo is the FIRST scene player sees (boot chain default)
- Apollo regression is most visually obvious in the 320x180 thumbnail check
- Cyber + Caravan are post-Apollo transitions, lower risk for first impression

Cyber + Caravan polish queued for V6 follow-up if Apollo fix lands cleanly.

VERDICT: SCOPE LIMIT to ApolloVillage only for Phase 0. Caravan is acceptable
as-is. Cyber is acceptable in dark palette but optional polish queue.
