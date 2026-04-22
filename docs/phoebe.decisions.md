---
owner: Phoebe
pillar: Registry
phase: P3a
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Phoebe Architectural Decision Record

Decisions are numbered monotonically. Each decision names the trigger, options considered, the pick, and the reversal trigger. Strategic decisions flagged `hard_stop` wait for V3 or Harmonia sign-off before lock. Phoebe owns identity card visualization; Hecate owns schema plus formula; Harmonia owns the global aesthetic sweep.

---

## ADR 0001. Band Taxonomy Verbatim From Hecate

**Status:** locked.

**Context.** The Phoebe prompt `soft_guidance` suggests a Bronze / Silver / Gold / Diamond tier scheme under 40, 40 to 70, 70 to 90, above 90, with creative latitude to pick another scheme. Hecate's `trust_types.ts` and contract `trust_score.contract.md` v0.1.0 lock five bands: `unverified`, `emerging`, `established`, `trusted`, `elite`. Consumer search ranking, filter pills, and the formula's `deriveBand` read the Hecate taxonomy.

**Options.**

- A. Adopt Bronze / Silver / Gold / Diamond for the UI and map Hecate bands onto the 4 tiers.
- B. Adopt Hecate's five bands verbatim, title-cased for rendering.
- C. Introduce a Phoebe-specific label layer with a translation table, keeping Hecate names internally.

**Decision.** Option B.

**Reasoning.** The prompt's hard-constraint references "Trust score range 0 to 100 per Hecate lock", and the contract prop `TrustScoreBadgeProps.format` already exposes `band_label`, which the contract test (Section 9) verifies consumers can render consistently. Introducing a parallel tier scheme creates a silent split across surfaces (search filter shows "Trusted", card shows "Gold") and forces a 5-to-4 mapping that loses the `unverified` distinction. Verbatim adoption maximizes cross-surface consistency and respects Hecate's single source of truth. The prompt explicitly flags this as `Creative Latitude (Narrow Zones)`, and verbatim reuse is within the narrow zone.

**Reversal trigger.** Harmonia ships a world-themed label set (Medieval Desert uses "Guild Master" tier name, Cyberpunk Shanghai uses "Tier S", etc.) that is a cosmetic overlay rather than a taxonomy change. At that point the labels live in the theme tokens and the underlying band enum is unchanged.

---

## ADR 0002. Trust Badge Format Default `band_label`, All Four Surfaces Shipped

**Status:** locked at contract layer, confirmed here.

**Context.** The Phoebe prompt names this as `strategic_decision_hard_stop`: trust score visual format among numeric 0 to 100, star rating, gauge, tier label. The prompt recommends a gauge plus tier label combination. The contract `identity_card.contract.md` v0.1.0 Section 3 already exposes `TrustScoreBadgeProps.format` as a prop taking any of the four, with default `band_label` declared in Section 4. Pythia ferried the decision into the contract prop surface, leaving Phoebe to implement all four and pick a default.

**Options.**

- A. Ship only one format (band_label) and drop the other three from the component.
- B. Ship two (band_label plus gauge) and omit numeric plus star.
- C. Ship all four, default `band_label`, consumer chooses per surface.

**Decision.** Option C.

**Reasoning.** The contract prop surface is already multi-format; narrowing it post-contract would require a version bump through Pythia. Ship-all is cheaper, since each format is ~30 LOC inside a single switch. Different consumer surfaces want different densities: Coeus search result list wants compact `band_label` chips, Apollo's Advisor expand drawer benefits from `gauge` for visual hero, Artemis browse grid can use `numeric` for a dense table, and a reviews-heavy post-hackathon view would want `star`. Default `band_label` matches the contract Section 4 spec.

**Reversal trigger.** Harmonia aesthetic sweep picks a single unified format across all surfaces and narrows the prop; handled via contract v0.2.0 through Pythia.

---

## ADR 0003. Provisional Stability Rendered As Dashed Border Plus Tag

**Status:** locked.

**Context.** Phoebe prompt `hard_constraint`: "trust score visual MUST indicate whether based on mock data or real signal, label visible on hover or ADR documented". Hecate ADR 0004 defines the hybrid mock + real policy and names `TrustScore.stability` as the honest-claim signal (`provisional` until usage thresholds met, `stable` after). The card must surface this without overloading the layout.

**Options.**

- A. Never render stability; rely on tooltip hover only (accessibility weak for touch, and hover-only is a known pattern failure for trust indicators).
- B. Render a distinct "MOCK" vs "LIVE" badge (dishonest framing: mock data can still be stable after 10 simulated invocations; the distinction is provisional vs stable, not mock vs real).
- C. Render a dashed outline plus `PROVISIONAL` tag on default + expanded variants; on compact variant a dashed outline plus `aria-label` tooltip.
- D. Hide all provisional scores behind a "data insufficient" empty state.

**Decision.** Option C.

**Reasoning.** The honest-claim label from Hecate is `stability`, not `mock_vs_real`. Option B encodes an incorrect binary. Option A fails touch users. Option D overcorrects and removes the signal the card is supposed to provide. Option C surfaces the correct taxonomy visibly without shouting; the dashed border pairs with the TrustScoreBadge provisional marker so the visual vocabulary is consistent whether the badge renders at card-header size or inline in prose. Tooltip text `Provisional: limited signal, score may shift as usage grows` explains the state without jargon.

**Reversal trigger.** Nemea a11y audit flags the dashed outline as insufficient contrast; switch to a solid muted color with an explicit "provisional" icon. Contract prop surface does not change.

---

## ADR 0004. Advisory Hashes Hidden By Default, Revealed In Expanded Variant Only

**Status:** locked (picks up Hecate ADR 0005 deferred decision).

**Context.** Hecate ADR 0005 defers the UI treatment of `prompt_hash` and `contract_hash` to Phoebe plus Harmonia. Exposing SHA-256 hex adds technical credibility (viewers see a real hash, feel the Registry is grounded) but can clutter the card and confuse non-technical users, which contradicts NarasiGhaisan Section 13 brevity plus Section 8 visual-first demo philosophy.

**Options.**

- A. Render hashes on every variant as small monospace text.
- B. Hide hashes on every variant; expose only via the audit trail drawer.
- C. Render hashes only on `expanded` variant inside a collapsible `details` block.

**Decision.** Option C.

**Reasoning.** NarasiGhaisan Section 8 frames demo as "visual and business first, logic second". A SHA-256 string on every Marketplace browse card harms density and does not convey shipping value to the target viewer (non-technical creators and buyers). Option B loses the technical credibility entirely. Option C preserves credibility for technically-inclined viewers who hit the expanded detail drawer while keeping the default browse grid readable. The `details` element is native-HTML accessible, needs no custom state, and labels itself as "Advisory" so viewers understand the shallow-by-design Registry posture per NarasiGhaisan Section 6.

**Reversal trigger.** Heracles integration lands real attestation chains post-hackathon; hashes become cryptographically meaningful and warrant default exposure. At that point Pythia bumps `identity_card.contract.md` to v0.2.0 with a `showAdvisoryHashes` prop.

---

## ADR 0005. Audit Virtualization Via CSS Overflow, Not A Library

**Status:** locked.

**Context.** Phoebe prompt `soft_guidance`: "AuditTrailExpand shows last 5 audit entries, virtualize if > 20". The contract default `max_entries` is 5. Real virtualization libraries (react-window, virtuoso) add a dependency for a scenario that is rare in the hackathon demo dataset (seed set is ~12 identities, each with fewer than 10 audit entries in steady state).

**Options.**

- A. Install react-window, implement windowed rendering.
- B. Cap at `max_entries` via the fetcher, render all returned rows unconditionally.
- C. Cap at `max_entries` plus CSS `max-height` + `overflow-y` scroll container when `entries.length > virtualize_threshold` (default 20).

**Decision.** Option C.

**Reasoning.** The contract mandates lazy fetch via `IdentityRegistry.getAuditForIdentity(identity_id, limit)`. Callers apply the `max_entries` cap before rows reach the renderer, so the common case is 5 rows and no scroll needed. The CSS overflow path gives the component correct behaviour when a consumer passes `max_entries: 50` for a large-identity detail view without a library pulled into the bundle. This is directionally what "virtualize" means in the prompt without dependency weight that a hackathon demo does not need. Post-hackathon the threshold flips when real audit logs grow past hundreds of rows per identity.

**Reversal trigger.** Measurable scroll jank on the demo day dataset, or a consumer requires maintained focus during virtualized scroll for accessibility compliance; install react-window then.

---

## ADR 0006. Vendor Origin Shown As Text Chip, Not Icon Chip

**Status:** locked (Creative Latitude narrow zone per prompt).

**Context.** The Phoebe prompt lists vendor origin badge icon style as creative latitude (text chip versus icon chip). NarasiGhaisan Section 5 emphasizes that cross-vendor transparency is the differentiator vs the 8 vendor-locked storefronts. The viewer must grasp the vendor in under a second.

**Options.**

- A. Text chip only: "origin Claude Code" style label.
- B. Icon chip only: vendor logo glyph.
- C. Hybrid chip: icon plus text.
- D. Colour-code by vendor family (Anthropic ecosystem blue, OpenAI green, etc.).

**Decision.** Option A.

**Reasoning.** Icons for 14 distinct vendor origins would require 14 SVG files (no copyright-safe set exists for all 14) and fail graceful fallback for `other`. Colour coding risks overlapping with the trust band colour vocabulary and would clash with NarasiGhaisan Section 7 world palette rotation. The text chip scales to any future vendor and is honest about the registry being an opaque label lookup rather than a verified logo mark. Combined with the version tag `vX.Y.Z` and the `PROVISIONAL` tag when applicable, the row reads as a metadata line that is instantly scannable.

**Reversal trigger.** Harmonia ships a sanctioned icon set and Ghaisan approves a hybrid label per world aesthetic.

---

## ADR 0007. Consume `toDisplayPercent`, Do Not Reimplement

**Status:** locked.

**Context.** Hecate exports `toDisplayPercent(score: number): number` from `app/registry/trust/trust_formula.ts`. The Phoebe prompt hard-constraint is "Trust score storage [0,1] float, UI display 0-100 via `toDisplayPercent` helper from Hecate. Consume helper, do NOT re-implement."

**Decision.** All four badge formats plus the card header consume `toDisplayPercent`. No local copy of the formula exists in `app/registry/card/*`.

**Reasoning.** Single source of truth, plus round-trip safety. If Hecate tunes the rounding (for example, future decision to show one decimal on the detail drawer), the change propagates without a Phoebe refactor. Inverse effect also guaranteed: if Phoebe ever shipped a rounding copy, contract v0.2.0 changes would silently skip the card surface.

**Reversal trigger.** Never. Any display-helper change flows through Hecate.

---

## ADR 0008. Reusable Across Surfaces Via Pure Props Plus Emitter Injection

**Status:** locked.

**Context.** Contract Section 1 lists five consumers: Eos, Artemis, Coeus, Apollo, Harmonia. Each has a different host state container and a different event bus wiring pattern. The component must stay presentation-only and testable without a wiring layer.

**Decision.** `IdentityCard` and `AuditTrailExpand` accept an optional `emitter` prop conforming to `CardInstrumentationEmitter`. When absent, event emission is no-op. Parent surfaces own the wiring to the actual event bus.

**Reasoning.** Matches the Erato pattern in `AdvisorChat.tsx` (pure presentation, callbacks-out). Prevents import-time circular dependency with `app/shared/events/pipeline_event.ts` when the event bus itself imports from card-related schemas post-hackathon. Testing in isolation requires only props, no bus mocking.

**Reversal trigger.** Post-hackathon move to a context-provider pattern if more than five consumers require the emitter and explicit prop threading becomes noisy.

---

## Open Questions Deferred

- None at session end. The strategic_decision_hard_stop (trust visual format) was pre-resolved at contract layer by Pythia and documented in ADR 0002 above. Harmonia aesthetic sweep may revise any of these visual decisions; the underlying component API is stable against such revisions because all color values are local constants that can be swapped for design token references without signature changes.

---

## References

- `_meta/NarasiGhaisan.md` Section 6 Registry shallow-by-design, Section 8 visual-first demo, Section 13 brevity.
- `CLAUDE.md` root context.
- `docs/contracts/identity_card.contract.md` v0.1.0.
- `docs/contracts/agent_identity.contract.md` v0.1.0.
- `docs/contracts/trust_score.contract.md` v0.1.0.
- `docs/hecate.decisions.md` ADR 0002 score storage, ADR 0004 hybrid signal, ADR 0005 hash UI deferral.
- `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.19 Phoebe role.
- `app/registry/schema/identity.schema.ts` Hecate schema.
- `app/registry/trust/trust_formula.ts` Hecate formula plus `toDisplayPercent`.
- `app/builder/viz/AgentNode.tsx` convention reference (tier color halos reused).
- `app/advisor/ui/AdvisorChat.tsx` convention reference (props-in, callbacks-out).
