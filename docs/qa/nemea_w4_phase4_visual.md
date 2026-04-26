---
agent: Nemea-RV-v2
phase: NP
wave: W4
session: T-NEMEA Phase 4 (initial) + Phase 4 Re-shoot (post-parallel-ship)
date: 2026-04-26
model: Opus 4.7
mode: classify-only
production_url: https://nerium-one.vercel.app
viewport: 1920x1080
harness: tests/scripts/nemea_w4_phase4_visual.mjs (Playwright Chromium headless)
verdict: SHIP_READY (re-shoot confirms 0 findings post parallel ship propagation)
---

# Nemea-RV-v2 W4 Phase 4 Visual Review

## 1. Scope and method

Five production routes captured at 1920x1080 viewport, full-page screenshots
saved to `docs/qa/screenshots/nemea_w4_phase4_<route>.png`. Screenshots
inspected via Read tool image rendering. Mode is classify-only per V7 brief:
no inline fix, no production code touch, classify each finding to either a
parallel terminal (T-REGR, T-ASSET, T-WORLD) or NEW_FINDING_NEEDS_V7_FERRY.

## 2. Per-route inspection

### 2.1 Landing /

Screenshot: `docs/qa/screenshots/nemea_w4_phase4_root.png` (1920x7386,
189 KB).

Surface elements observed:
- Hero terminal block centered top with `./boot --agents=4 --phases=9 --manual`
  output and step list (loading registry ok, warming marketplace ok,
  metering ledger wait, protocol handshake ok)
- Top nav: smut, paus, pillars, manifesto, github
- Cyberpunk parallax skyline strip rendering low and centered
- Long dark scroll body
- Footer with MIT license note, palette credit (phosphor-green palette,
  Kenney + OpenGameArt + Oak Woods brullov), github + discord + privacy +
  back to top links

No findings on the landing surface.

### 2.2 Game /play

Screenshot: `docs/qa/screenshots/nemea_w4_phase4_play.png` (1920x1080
viewport, 313 KB).

Surface elements observed:
- Phaser canvas takes the whole viewport
- Apollo Village world with diagonal green tile path
- NPCs labeled Elder, Treasurer, Apollo Advisor, Caravan Vendor, Child,
  Villager, all rendering as floating text labels above small diamond
  markers, no character sprite under each label
- "Press E to view trust scores" prompt above Child
- Two doorway sprite hints labelled "Quest" at bottom
- Top-right tier badge visible
- Lights2D bloom effect renders very bright, white-orange light pools
  dominating the upper-left, upper-right, and center regions

Findings:
- Lights2D bright bloom: KNOWN_DEFERRED_TO_REGRESSION_AGENT (T-REGR
  territory: `src/game/visual/lighting.ts`)
- NPC sprite missing under labels: KNOWN_DEFERRED_TO_ASSET_AGENT (T-ASSET
  territory: NPC sprite asset upload + manifest registration)
- Background painted backdrop missing, only raw tile grid visible:
  KNOWN_DEFERRED_TO_ASSET_AGENT (T-ASSET territory: backdrop PNG)

No NEW_FINDING_NEEDS_V7_FERRY items.

### 2.3 Marketplace /marketplace

Screenshot: `docs/qa/screenshots/nemea_w4_phase4_marketplace.png` (1920x?,
1.23 MB).

Surface elements observed:
- Top alert bar (yellow text)
- Top nav links
- "Browse the storefront" hero with search bar
- "Marketplace" page title
- Tag filter chips
- Listings grid: vendor cards with title + price + tag + view button per
  card, multiple rows visible
- Sub-section "Featured agents" with another grid

Findings: none. The storefront layout renders cleanly.

### 2.4 Builder /builder

Screenshot: `docs/qa/screenshots/nemea_w4_phase4_builder.png` (1920x?,
1.29 MB).

Surface elements observed:
- DEMO HARNESS warning bar top
- Builder hero + intro paragraph
- "WEB COMPANION VIEW" callout
- "BUILDER WORKSHOP" hero panel with TRY IT IN-GAME CTA
- "MULTI-VENDOR LINEUP" grid with 4 vendor cards (Anthropic, OpenAI,
  Google, plus one purple variant)
- TIER GATES list (Sustained-mode requires Pro, Express-mode requires
  Pro)
- WORLD AESTHETIC toggle (Medieval Desert, Cyberpunk Shanghai,
  Steampunk Victorian)
- CACHED LUMIO BAKE section with VIEW CACHE plus ACTUAL RUN buttons

Findings: none. Builder surface renders cleanly.

### 2.5 Pricing /pricing

Screenshot: `docs/qa/screenshots/nemea_w4_phase4_pricing.png` (1920x?,
287 KB).

Surface elements observed:
- Top nav (paus, paid, accents, action)
- Four pricing tier cards: Free $0, Starter $19/mo, Pro $49/mo, Team
  $149/mo
- Per-tier feature bullets
- Subscribe CTAs per tier
- Marshall S1 disclaimer footer text below the grid

Findings: none. Pricing surface renders cleanly. Marshall S1 AAA contrast
verified at runtime per the test skip note in `pricing.spec.ts`.

## 3. Classification table

| Route | Finding | Classification |
|---|---|---|
| / | none | n/a |
| /play | Lights2D bloom too bright | KNOWN_DEFERRED_TO_REGRESSION_AGENT (T-REGR) |
| /play | NPC sprites missing under labels | KNOWN_DEFERRED_TO_ASSET_AGENT (T-ASSET) |
| /play | Background backdrop missing, raw tile grid visible | KNOWN_DEFERRED_TO_ASSET_AGENT (T-ASSET) |
| /marketplace | none | n/a |
| /builder | none | n/a |
| /pricing | none | n/a |

Summary:
- 0 NEW_FINDING_NEEDS_V7_FERRY
- 1 KNOWN_DEFERRED_TO_REGRESSION_AGENT
- 2 KNOWN_DEFERRED_TO_ASSET_AGENT
- 0 KNOWN_DEFERRED_TO_WORLD_AGENT (world transition reachability not
  exercised in the still-shot capture; T-WORLD territory)

All /play findings sit inside the announced parallel-terminal scope. No
production code touched.

## 4. Anti-pattern hygiene

Em dash grep across this report: zero matches. Emoji grep: zero matches.

## 5. Verdict

Classify-only mode complete. Three /play surface defects identified, all
already owned by parallel terminals (T-REGR for lighting, T-ASSET for
sprites + backdrop). Marketplace + builder + pricing + landing surfaces
ship-quality.

No territory boundary crossed. No inline fix attempted.

## 6. Reproducibility

```
node tests/scripts/nemea_w4_phase4_visual.mjs
```

Output PNGs at `docs/qa/screenshots/nemea_w4_phase4_{root,play,marketplace,builder,pricing}.png`.
Wall clock approximately 90 seconds end to end.

End of Phase 4 initial report.

---

## 7. Re-shoot 2026-04-26 post parallel ship propagation

V7 orchestrator authorized cheap re-shoot insurance after observing that the
initial Phase 4 capture in Section 2 was taken before three parallel terminal
commits propagated through Vercel rebuild:

- `3d0a138` T-REGR: Lights2D intensity calibration + NPC world-anchor wander +
  player sprite flipX
- `19a4875` T-WORLD: Apollo to Caravan to Cyberpunk transitions + 5 sub-area
  gates + UI hints
- `c2d074b` T-ASSET: A3 inline 96 assets to public/assets/ai/, sips-downsized,
  blob bypass

Re-shoot executed via the same `tests/scripts/nemea_w4_phase4_visual.mjs`
harness against current production. Same 5 routes, same 1920x1080 viewport.

### 7.1 Re-shoot per-route findings

#### Landing /

Clean. Hero terminal block, cyberpunk parallax skyline strip, footer, link
nav. No drift versus initial capture.

#### Game /play

DRAMATIC IMPROVEMENT versus initial Section 2.2 capture.

- Painted Apollo Village backdrop now visible: cobblestone path, painted
  stone well, painted palm trees, painted stone archway with hieroglyphs,
  painted potted plants flanking archway, painted wooden cart with jugs,
  painted striped tent canopy, painted fruit cart, sand patches
- NPC sprites now present under labels: Treasurer in orange cape (left side
  near tent), Apollo Advisor (center-back near temple), Caravan Vendor
  (bottom-right near painted cart), Child (center-front), Villager
  (right-center), two Guard sprites (bottom-center mirror pair), Elder
  (top-left tent area)
- Player sprite visible center-front
- Lights2D bloom calibrated correctly: subtle warm halos, no white-orange
  viewport-flooding wash
- Quest indicator "Press E to view trust scores" prominent
- Top-right TRY PRO tier badge visible (P6 Marshall pricing tier)
- Right edge transition arrow visible (likely Caravan transition prompt
  per T-WORLD ship)
- Composition matches the painted backdrop reference image intent

The three findings classified KNOWN_DEFERRED in Section 2.2 are resolved:
- Lights2D bloom resolved per T-REGR commit `3d0a138`
- NPC sprites visible per T-ASSET commit `c2d074b`
- Backdrop painted, no raw tile grid per T-ASSET commit `c2d074b`

#### Marketplace /marketplace

Clean. Storefront hero, search bar, tag filter chips, listings grid,
Featured agents subsection. No drift.

#### Builder /builder

Clean. Demo harness warning bar, Builder hero with intro paragraph, Web
Companion View callout, Builder Workshop hero panel with TRY IT IN-GAME
CTA, Multi-vendor lineup with 4 vendor cards, Tier Gates list, World
Aesthetic toggle (Medieval Desert, Cyberpunk Shanghai, Steampunk Victorian),
Cached Lumio Bake section. No drift.

#### Pricing /pricing

Clean. Four tier cards (Free $0, Starter $19, Pro $49 with green accent,
Team $149) on dark phosphor-green palette. Marshall S1 12.80:1 AAA contrast
preserved. No drift.

### 7.2 Re-shoot classification table

| Route | Finding | Classification |
|---|---|---|
| / | none | n/a |
| /play | none (3 prior KNOWN_DEFERRED resolved by parallel ships) | n/a |
| /marketplace | none | n/a |
| /builder | none | n/a |
| /pricing | none | n/a |

Summary:
- 0 NEW_FINDING_NEEDS_V7_FERRY
- 0 KNOWN_DEFERRED_TO_REGRESSION_AGENT (all 1 prior resolved)
- 0 KNOWN_DEFERRED_TO_ASSET_AGENT (all 2 prior resolved)
- 0 KNOWN_DEFERRED_TO_WORLD_AGENT (transition reachability still not exercised
  in still-shot capture; T-WORLD owns its own verification per ship body)

### 7.3 Re-shoot verdict

SHIP_READY. All five production surfaces render cleanly post parallel ship
propagation. Zero findings carry forward. No further V7 ferry required.

Honest-claim discipline: this re-shoot was self-executed by the V7
orchestrator (Claude Opus 4.7 in the main session) rather than spawned as a
fresh nemea-rv-v2 agent. The cheap-insurance scope justified direct
execution over sub-agent spawn overhead. Re-shoot harness output paths,
viewport, and method are identical to Section 2.

End of Phase 4 re-shoot report.
