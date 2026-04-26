# Scene Placement Rationale: Nemea-RV-v2 W4 Phase 0

Generated 2026-04-26. Per-sprite placement decision rationale for the 4
NERIUM-pillar landmarks plus temple_arch ambient entry in ApolloVillageScene
after Phase 0 visual regression fix.

---

## ApolloVillage NERIUM-pillar landmarks (4 + 1 ambient)

| Sprite | Coord | Scale | Rationale |
|---|---|---|---|
| marketplace_stall_landmark | (1010, 600) | 0.06 | Cobblestone path mid-right, distinct from the painted striped-awning fruit stall on the left half of the backdrop. Two separate market structures (painted ambient stall + interactive marketplace marker) read as a populated village commerce zone. Original placement at (1080, 660) was on the painted wooden cart with jugs, causing sprite-on-painted-prop collision. |
| builder_workshop_landmark | (330, 560) | 0.06 | Bottom-left open courtyard ground, between the painted striped fruit stall (top-left mid) and the painted tent canopy (bottom-left). The workshop sprite reads as a separate guild building with no backdrop collision. Slight Y-offset from original (310, 480) keeps the 0.06-scale workshop on the cobblestone-edge sand patch. |
| registry_pillar_landmark | (1180, 460) | 0.05 | Mid-right ground east of the painted stone temple. Slight horizontal offset from the painted temple at approximately (950, 280) so the inscribed-monument silhouette reads as a separate civic record-keeping artefact. Original placement at (1040, 380) was directly on the painted temple. |
| trust_shrine_landmark | (640, 540) | 0.06 | Open courtyard center, on bare sand patch between the painted stone well (left) and the painted temple (right). Symbolic shrine-in-town-center placement keeps the trust marker visible on backdrop-distinct ground. Original placement at (490, 660) was on the bottom-left tent canopy, partially occluded by foreground tent sprite. |
| temple_arch (ambient entry) | (820, 400) | 0.05 | Open ground south of the painted temple at approximately (950, 280), so the marker glyph anchors the sub-area entry without sprite-on-painted-prop collision. Original placement at (910, 300) was directly on top of the painted temple, producing duplicated archway visuals. The 0.05 scale renders the temple_arch sprite as a small marker glyph (90x120 px), distinct from the backdrop painted temple. |

## Apollo NPC scale rationale

NPC_SCALE_NAMED 0.18 was the prior Helios-v2 S2 constant intended for
spritesheet-frame consumers (player_spritesheet has 512x512 frames, scale 0.18
gives 92x92 px). Applied to monolithic AI-generated NPC PNGs (apollo,
treasurer, caravan_vendor at native 2048x2048), it produced 370x370 px
sprites: 4x larger than the player. Phase 0 fix scales named NPCs to 0.05,
producing player-parity 102x102 px sprites.

The previously-working `treasurer` was rendering at scale 1.0 = 2048x2048 px
(viewport-covering) because TreasurerNPC.ts dropped spriteScale on the floor
when forwarding to its NPC superclass constructor. Phase 0 also forwards
spriteScale + groundAnchor through TreasurerNPC.

Player + ambient NPCs (guard_a, guard_b, child_a, elder_a, villager_olive)
unchanged: they consume player_spritesheet 512x512 frames where 0.18 is
the correct ~92x92 px scale.

## Hanging lantern + ambient prop deletion rationale

| Deleted sprite | Rationale |
|---|---|
| stone_well (260, 570) | Backdrop paints a stone well at approximately (300, 470). Sprite duplicated. |
| date_palm_cluster (160, 660) | Backdrop paints a tall palm tree at approximately (510, 60). Sprite added a second redundant palm, occluding the bottom-left tent. |
| cypress_tree x2 ((760, 240), (1290, 540)) | Backdrop's only painted foliage is the central palm; cypress sprites at displayHeight 1742-2059 px were vertical bars covering large portions of the right half viewport. |
| market_stall (910, 720) | Backdrop paints a striped-awning fruit stall left-of-center. Sprite at displayWidth 860 covered the bottom-mid foreground. |
| wooden_cart (760, 760) | Backdrop paints a wooden cart with jugs at approximately (1190, 690). Sprite added a second redundant cart. |
| apollo_house_filler (1320, 320) | Backdrop paints a small adobe building at approximately (1280, 80). Sprite duplicated the structural feature with displayWidth 960. |
| stone_column (610, 360) | DisplayHeight 2912 px exceeded the 800 px viewport, rendering as a vertical sprite-curtain occluding everything behind it. |
| stone_signpost (700, 730) | Backdrop has no painted signpost, but the sprite at displayHeight 1165 produced a vertical stripe over the bottom-mid path. |
| hanging_lantern x2 ((480, 440), (980, 460)) | DisplayHeight 758 px each, rendering as overhead pillars occluding the painted scene. Lights2D point lights at the same positions already provide warm halos for atmospheric feedback; lantern sprite visual not necessary. |

---

## CaravanRoad

No code change required: visual composition acceptable as shipped by
Helios-v2 S3. Sprites integrate with the painted forest-crossroad backdrop
without redundant prop overlap.

## CyberpunkShanghai

Phase 0 SCOPE-LIMIT: Cyber landmarks are oversized but the dark cyberpunk
palette plus Lights2D blending mitigates visual conflict. ACCEPTABLE for
hackathon submission. Optional polish queued for V6 follow-up if Apollo fix
lands cleanly.
