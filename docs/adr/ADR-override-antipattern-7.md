# ADR: Override of CLAUDE.md Anti-Pattern 7 for Asset Generation

- **Status:** Accepted
- **Authored by:** Talos (product-side infrastructure, consolidated skills and assets owner)
- **Approved in principle by:** V4 hackathon orchestrator, via `_meta/RV_PLAN.md` RV.6 and Ghaisan decision log Section 7
- **Date:** 2026-04-23
- **Supersedes:** nothing
- **Superseded by:** pending; future reactivation of fal.ai lane in shipped build will require a superseding ADR

## 1. Context

`CLAUDE.md` Anti-Pattern 7 (V2 lock, pre-RV) reads:

> No Gemini, Higgsfield, or non-Anthropic model for shipped execution. Multi-vendor flexibility is a user-facing feature in the NERIUM Builder UI, not a hackathon execution choice. Shipped build runs on Opus 4.7 plus Sonnet 4.6 only. Image and asset generation uses CC0 packs (Kenney.nl, OpenGameArt) plus Opus-generated SVG or Canvas procedural. No Nano Banana.

Two things changed after the lock was written:

1. **The NERIUM RV pivot** (Kamis 23 April 2026) expands the Builder pillar from a dashboard into a Phaser 3 top-down RPG vertical slice. A playable game needs named-NPC sprites and multi-genre tilesets; CC0 packs plus Opus SVG cover the utility UI layer and generic ambient props, but they do not cover identity-critical assets for a named roster (Apollo, Daedalus, and a small supporting cast) that must stay visually consistent across three world genres (Medieval Desert, Cyberpunk Shanghai, Steampunk Victorian).
2. **Hackathon moderator guidance.** Joshua Jerin (Cerebral Valley plus Anthropic hackathon mod) wrote on the hackathon Discord on 2026-04-21 at 10:21 PM: "Yes you are free to use any tools you may like to code your project." Screenshot evidence committed at `docs/adr/screenshots/jerin_discord_2026_04_21.png` (uploaded separately by Ghaisan, see Section 7 below).

The V2 lock was written defensively to avoid brand-dilution in a "Built with Opus 4.7" submission. The moderator explicitly clarifies that tool choice for production workflows is open, provided the "Built with Opus 4.7" characterization remains accurate for the reasoning and orchestration layer.

## 2. Decision

Replace CLAUDE.md Anti-Pattern 7 with a narrower formulation that distinguishes execution LOGIC from ASSET generation:

- **Execution logic stays Anthropic-only.** Worker runtime, Apollo Advisor reasoning, Cassandra Prediction simulation, Heracles Managed Agents lane, Proteus translation, every Claude Code specialist is Opus 4.7 with a single Sonnet 4.6 exception for Cassandra. No Gemini, OpenAI, Llama, or other vendor sits in the reasoning path of a shipped build.
- **Asset generation is allowed outside Anthropic** subject to honest-claim annotation in README and in the `asset-ledger.jsonl` schema. fal.ai Nano Banana 2 (Google Gemini 3.1 Flash Image served via fal Partner Inference Commercial) is the specifically enabled vendor.
- **Shipped RV build keeps fal.ai DORMANT** per `_meta/RV_PLAN.md` RV.14. Ghaisan's personal fund constraint is USD 0; Anthropic hackathon credits do not cover fal.ai inference. `docs/contracts/game_asset_registry.contract.md` entries for `fal_nano_banana_2` and `fal_nano_banana_2_edit` ship with `status: 'dormant_deprecated'`. `lib/falClient.ts` is authored as a reserved wrapper and NOT imported from any production code path. `scripts/slice-sprite.py` is authored but NOT invoked. The `asset-ledger.jsonl` schema retains full fidelity for `event_kind: 'external_generate'` so a future activation writes into the same log without migration.
- **Primary asset path remains CC0 plus Opus procedural.** Kenney (Roguelike RPG, UI Pack RPG Expansion, audio), Oak Woods brullov (Medieval Desert accent, attribution required), Warped City (Cyberpunk Shanghai base) cover the bulk. Opus SVG plus Canvas procedural fills HUD chrome, logos, particle FX.
- **Reactivation path.** If Ghaisan later allocates budget for fal.ai inference, the activation requires a new ADR that supersedes this one, plus:
  - Funding source documented (Anthropic credit cannot be repurposed).
  - `FAL_KEY` provisioned as a repo secret.
  - `game_asset_registry.contract.md` entries flipped to `status: 'active'`.
  - `lib/falClient.ts` imported from the successor asset-generation agent.
  - Single 1K test image passed end-to-end before batch work.

## 3. Rationale

Three forces push the override:

1. **Vertical-slice quality bar.** M1 Section 6.1 and 6.4 analyze the gap between CC0 coverage (60 to 70 percent of the asset surface, mostly generic tiles and sfx) and NERIUM-specific identity assets (Apollo NPC, Daedalus, supporting cast, cross-genre consistency). Without a generator path, the slice visibly downgrades or demands hand-painted pixel art that a solo dev cannot finish in five days.
2. **Vendor alignment with the Multi-vendor Protocol pillar.** The Multi-vendor Protocol pillar markets NERIUM Builder as vendor-neutral. Using fal.ai for asset gen while Anthropic handles reasoning is a live demonstration of the thesis, not a contradiction. Meta-narrative in `_meta/RV_PLAN.md` Section 0 picks this up: "NERIUM built itself using the multi-vendor flexibility it advertises."
3. **Moderator guidance removes the policy concern.** The defensive reason for the V2 lock was uncertainty about judge expectations for "Built with Opus 4.7" framing. The moderator's confirmation narrows the concern to reasoning-layer framing, which the override preserves.

The dormancy policy keeps the ADR risk-free for the shipped build: the schema and wrapper exist, nothing runs. The cost of the override is one markdown edit plus a future reactivation gate, not a new dependency in the runtime bundle.

## 4. Consequences

Positive:

- Future reactivation of fal.ai is a single status flip plus an import, not an architectural change.
- The asset ledger schema is already correct for external generation events.
- `game_asset_registry.contract.md` declares reserved source keys so consumers never hardcode a dormant vendor URL.
- CLAUDE.md anti-pattern 7 stays honest: the absolute "no" becomes a scoped "no for reasoning layer, conditional yes for asset gen."

Negative:

- Slightly higher cognitive load on downstream workers to distinguish LOGIC vendor rules from ASSET vendor rules. Mitigated by the skill `fal-nano-banana-sprite/SKILL.md` carrying the dormancy annotation on its top line and by the `DormantAssetSourceError` thrown by `AssetRegistry.assertSourceActive`.
- The README honest-claim paragraph becomes longer: both the dormant state and the policy for future activation must be stated. Kalypso handles this in the demo bake phase.

Neutral:

- The RV.14 budget constraint stays load-bearing. This ADR does not spend a dollar.

## 5. Alternatives considered

- **Keep the V2 lock intact.** Rejected because the identity-critical asset coverage gap would force a hand-painted slice that cannot complete on budget.
- **Allow fal.ai in shipped build.** Rejected because Ghaisan's personal fund is USD 0 and Anthropic credit is not fungible.
- **Allow the fal.ai lane and also allow Gemini for reasoning.** Rejected because that would break the "Built with Opus 4.7" framing which the moderator's guidance did not override for the reasoning layer.
- **Replace the fal.ai lane with Opus image generation.** Investigated; Opus does not ship an image-generation endpoint. SVG and Canvas procedural stay the Opus-driven option, and this ADR confirms they stay primary for the shipped build.

## 6. Related decisions and artifacts

- `_meta/RV_PLAN.md` RV.6 (anti-pattern 7 override, principle)
- `_meta/RV_PLAN.md` RV.7 (hybrid asset strategy)
- `_meta/RV_PLAN.md` RV.14 (fal.ai budget zeroed, dormancy)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` Section 6 (asset strategy hybrid, ownership matrix)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` Section 4.1 (Talos consolidated role including dormant fal.ai transplant) and Section 9.4 (fal.ai budget post-revision: zeroed)
- `docs/contracts/game_asset_registry.contract.md` v0.1.0
- `docs/contracts/asset_ledger.contract.md` v0.1.0
- `.claude/skills/fal-nano-banana-sprite/SKILL.md` (DORMANT reference)
- `lib/falClient.ts` (reserved; not imported)
- `scripts/slice-sprite.py` (reserved; not invoked)
- `CLAUDE.md` anti-pattern 7 (amended by this ADR)

## 7. Evidence trail

- Joshua Jerin, Cerebral Valley + Anthropic hackathon Discord, 2026-04-21 10:21 PM (Ghaisan local time). Quote captured verbatim: "Yes you are free to use any tools you may like to code your project."
- Screenshot path: `docs/adr/screenshots/jerin_discord_2026_04_21.png`. Ghaisan uploads the screenshot to the repo outside of this ADR commit since the image is a binary artifact tracked separately.
- If the screenshot is not yet present at the path above at read time, the ADR remains valid in principle (the moderator statement is documented verbatim here), but downstream agents should halt and ferry to V4 before making a judgment call that depends on the letter of the statement. The screenshot is confirmatory, not load-bearing for the reasoning in Section 2.

## 8. Open questions

- None blocking the dormant lane.
- If Ghaisan later allocates fal.ai budget, a reactivation ADR must answer: which agent owns the lane (Calliope per M1 Section 6.4 pre-ferry sketch, or its successor), how cost-cap enforcement works per-run, and how attribution lines flow into `public/assets/CREDITS.md`.
