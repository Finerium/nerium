---
name: triton.decisions
owner: Triton (Protocol Worker, Translation Demo, P3b)
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Triton Architecture Decisions (ADR Log)

Decisions made during the Triton P3b session. Each entry: context, options considered, decision, rationale, consequences. Following the ADR discipline called out in `CLAUDE.md` Section "Folder structure" and mirroring the format used in `proteus.decisions.md` so the Protocol pillar reads as a single consistent set of decisions.

The Triton scope per `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.20 and `docs/contracts/translation_demo.contract.md` v0.1.0 is the two-panel translation demo that visualizes the same `AgentIntent` rendered by Proteus's `AnthropicAdapter` and `GeminiAdapterMock` side by side. Triton does not own adapter logic and does not own the Multi-vendor choice UI (Morpheus); Triton owns the split-view composition and honest-claim surface in that composition.

---

## ADR-0001: Prebaked-by-default with gated live query mode

**Context.** The Triton prompt lists a `strategic_decision_hard_stop`: "whether Triton demo runs on user query live or shows pre-baked example pair (live more impressive, more fragile)." The contract supports both modes through the `mode: 'prebaked' | 'live_query'` prop. The recommendation carried over from the prompt was "prebaked with 'try your own' live option gated by feature flag."

**Options considered.**
1. Prebaked only. Ship a single canonical scenario rendered through both adapters, no textarea, no edit path.
2. Live query only. Wire the Anthropic Messages API for the left panel in every render, accept the fragility for demo impact.
3. Prebaked default, live query opt-in behind a `liveQueryEnabled` feature flag, with an `onUserEditIntent` hook so embedders can hand back an edited intent.

**Decision.** Option 3.

**Rationale.** The demo video is the primary public surface (see `CLAUDE.md` submission block: 3-min video, Impact 30% + Demo 25% weight). Prebaked guarantees the rendered output matches the voiceover script beat-for-beat and cannot fail on stage from a rate-limit or network hiccup. Live query is still worth exposing for interactive play on the deployed site, so the flag ships in the same file rather than being a post-hackathon refactor. The contract is explicit that `live_query` falls back to prebaked when no API key is present (`translation_demo.contract.md` Section 8), which matches our default no-key shipping posture.

**Consequences.** `TranslationSplit.tsx` always resolves the effective mode by ANDing `mode === 'live_query'` with `liveQueryEnabled` and with a runtime check for `ANTHROPIC_API_KEY`. The fallback renders a `translation-notice` so a viewer sees the degradation is intentional rather than a bug. Embedders (Apollo) can force the demo into prebaked by passing `liveQueryEnabled={false}`; a post-hackathon build that wires a backend proxy can flip it on without schema change.

---

## ADR-0002: Scenario is Lumio chapter summary with XML, cache, tool, multimodal axes

**Context.** The demo must make the Protocol thesis legible in roughly a single frame of video. The chosen scenario determines how many thesis points land.

**Options considered.**
1. Minimal scenario: system + user text only. Easy to read but ignores XML tagging, caching, tools, multimodal; thesis is thin.
2. Lumio chapter summary: system message with `xml_tag_preference='persona'` and `cache_marker=true`, user message with an image multimodal part and `id-ID` locale, one `search_library` tool, generation params set, `vendor_preferences.require_feature=['prompt_caching']`. Touches every axis the Protocol pillar claims matters.
3. Code assistant scenario with 3 tools and a tool_result history. More realistic for developer audiences but visually noisier and harder to caption for judges who are not developers.

**Decision.** Option 2.

**Rationale.** Lumio is the anchored demo app per `CLAUDE.md` V2 Lock 6 and the M2 structure; reusing it keeps the cross-pillar narrative tight. The axes chosen were specifically those that Gemini cannot preserve natively (XML, cache) plus axes both vendors support (tools, multimodal) so the side-by-side shows both "here is the fidelity Claude preserves that Gemini drops" and "here is what translates cleanly across vendors." Indonesian user text in an `id-ID` locale also matches Ghaisan's audience framing. Exercising `tool_choice='auto'` with a single tool keeps the serialized bodies short enough to fit the panel viewport without scroll-masking the reveal.

**Consequences.** `translation_demo_types.ts` ships a `PREBAKED_INTENT` constant plus two prebaked raw response bodies (one genuine Anthropic Messages content array, one mock Gemini candidates body). A Nemea regression can snapshot both panel outputs and flag any adapter drift that changes the serialized shape.

---

## ADR-0003: Hand-rolled syntax highlighter instead of Prism or Shiki

**Context.** The panels render JSON bodies that must be legible, with XML tags visible inside Claude string literals and with `_mock_marker` / `_honest_claim` keys visible inside the Gemini mock envelope.

**Options considered.**
1. Pull Prism or Shiki for generic JSON highlighting.
2. Hand-roll a narrow JSON tokenizer in each panel, with Claude panel flipping XML tags inside strings and Gemini panel flipping the two mock keys.
3. No highlighting, just a plain `<pre>` block.

**Decision.** Option 2.

**Rationale.** Prism pulls a loader plus a language grammar; Shiki pulls a WASM payload plus theme bundles. Both are non-trivial client bundle for a surface that only needs two narrow visual effects. The `CLAUDE.md` tech stack does not include a syntax highlighter, adding one is a cross-cutting decision I would have to ferry. A hand-rolled tokenizer is ~120 lines per panel, handles the two nuances the demo needs (XML-inside-strings for Claude, mock-key color flip for Gemini), and keeps the demo self-contained. Option 3 was rejected because the visual reveal depends on typography differentiation between keys, strings, and markers; a raw `<pre>` makes the thesis harder to parse.

**Consequences.** `ClaudePanel.tsx` and `GeminiMockPanel.tsx` each carry a private tokenizer. The code paths are similar but deliberately not shared because the Claude-side tokenizer flips XML-style tags inside string tokens while the Gemini-side tokenizer flips `_mock_marker` and `_honest_claim` keys. Sharing would have coupled the two panels through an options bag and muddied the intent. Post-hackathon the tokenizer can be extracted to `app/protocol/demo/highlight.ts` once a third panel (OpenAI or Higgsfield) joins and the shared surface stabilizes.

---

## ADR-0004: Honest-claim redundancy across four surfaces

**Context.** `NarasiGhaisan.md` Section 16 is a hard rule: mock adapters must carry an unmissable honest annotation. `translation_demo.contract.md` Section 4 mandates that `<VendorPanel>` honor `adapter.isMock()` and surface the annotation badge. A single badge on the header could be cropped out of a video frame.

**Options considered.**
1. Single badge in the panel header only.
2. Badge in header plus a footer annotation line inside each mock panel.
3. Badge in header, footer annotation inside the panel, a second panel-level notice near the body, and a split-view-level footer annotation. Four surfaces total.

**Decision.** Option 3 for the mock panel, Option 1 symmetric for the Claude panel.

**Rationale.** Demo video frames are cropped aggressively on social platforms and judge re-shares; a single badge can be cut. Four redundant surfaces guarantee that any reasonable crop still carries the claim: header chip, in-body notice, footer annotation, split-view footer. The `_mock_marker` and `_honest_claim` keys inside the highlighted JSON body serve as a fifth independent signal for viewers who read the payload directly. Over-annotating the Claude panel would be noise because the real Anthropic adapter is not a mock; the `isMock()` branch still renders when a future mock Anthropic path is added.

**Consequences.** `GeminiMockPanel.tsx` renders four honest-claim surfaces plus the highlighted `_mock_marker`/`_honest_claim` keys inside the code block. Harmonia Day 4 polish can tune the visual hierarchy across surfaces without removing any of them; Nemea can snapshot that all four are present as a regression check.

---

## ADR-0005: Scoped CSS with `.translation-root` pattern, not Tailwind utility classes

**Context.** The project package.json declares Tailwind v4, but every existing UI-producing Worker (Erato `.advisor-root`, Artemis marketplace styles, Phoebe `registry/card` styles) uses scoped CSS with CSS custom properties keyed to the active world. Design tokens come from `docs/contracts/design_tokens.contract.md` v0.1.0 which specifies the unified `tokens.ts` source but the file does not exist yet in `app/shared/design/`.

**Options considered.**
1. Tailwind utilities across the demo components, bypass the world-switching CSS custom properties.
2. Scoped CSS file `styles.css` at `app/protocol/demo/styles.css` declaring `.translation-root` with the same three world palettes, mirroring the pattern set by Erato.
3. Block on Harmonia Day 4 tokens.ts materializing, ferry halt.

**Decision.** Option 2.

**Rationale.** Consistency with sibling workers is worth more than dogmatic Tailwind adherence; the demo would feel visually detached from the rest of the app if it skipped world-switching. Blocking on tokens.ts (Option 3) is rejected because P3b cannot wait on a P4 deliverable, and the post-hackathon refactor path is already well understood (swap inline token values for `var(--token-name)` references once `tokens.ts` lands). Option 1 would create visual drift against `.advisor-root` and `.marketplace-*` surfaces; a Harmonia sweep would then have to un-Tailwindify this component.

**Consequences.** `styles.css` ships with a cyberpunk_shanghai default palette plus medieval_desert and steampunk_victorian alternates via `data-world` attribute, WCAG AA contrast verified. Post-hackathon refactor (noted inline in the file header) swaps the custom properties for Harmonia's `tokens.ts` exports.

---

## ADR-0006: Flow animation respects prefers-reduced-motion and stays visual-only

**Context.** The prompt soft-guidance suggests a "translation flow animation (arrow pulse from input to Proteus IR box to both panels)." GSAP and Framer Motion are both in the dependency list. A heavy animation could distract from the JSON payload reveal, which is the actual thesis.

**Options considered.**
1. GSAP timeline with a staggered path-draw arrow from intent into IR and then into both panels.
2. Framer Motion spring on each panel title bar, plus a dashed-border pulse on the IR node.
3. Pure CSS keyframe pulse on a small dot inside the IR node, visible but small, automatically disabled under `prefers-reduced-motion: reduce`.

**Decision.** Option 3.

**Rationale.** The thesis the demo delivers is textual, not kinetic: the viewer's eye must land on the serialized bodies and fidelity notes. A large animation would steal that focus. The CSS-only pulse signals "something is flowing here" without demanding attention. Respecting `prefers-reduced-motion` is an accessibility table stake per the `CLAUDE.md` Day 5 polish lane and Nemea's a11y sweep. GSAP and Framer remain available if Harmonia Day 4 decides to layer additional motion on top; the CSS pulse will not collide with layered motion because it targets a dedicated element.

**Consequences.** `styles.css` ships `translation-flow-pulse` with a 2-second ease pulse, disabled via `@media (prefers-reduced-motion: reduce)`. No runtime motion library imported into the demo module. If Harmonia adds layered motion, the pulse can be disabled with a single class flip or kept as a low-amplitude accent.

---

## ADR-0007: Companion `translation_demo_types.ts` file despite strict 4-output spec

**Context.** The M2 Section 5.20 output spec lists four files: `TranslationSplit.tsx`, `ClaudePanel.tsx`, `GeminiMockPanel.tsx`, `docs/triton.decisions.md`. The contract Section 6 separately lists `translation_demo_types.ts` as a canonical file path for shared types. Peer workers (Phoebe `identity_card_types.ts`, Artemis `browse/types.ts`, Rhea `stream_types.ts`) all ship a companion types file alongside their components.

**Options considered.**
1. Inline prop types into each component, accept duplication across `TranslationSplit.tsx`, `ClaudePanel.tsx`, `GeminiMockPanel.tsx`.
2. Define types in `TranslationSplit.tsx` and import them into the panels.
3. Add `translation_demo_types.ts` as a companion file, following peer convention and matching the contract Section 6 canonical path.

**Decision.** Option 3, plus a scoped `styles.css`.

**Rationale.** Peer convention is strong enough that diverging would create cognitive tax on future maintainers. The contract anticipates the file (Section 6). The M2 output list in Section 5.20 is a deliverable floor, not a ceiling; it enumerates the "must ship" artifacts but does not prohibit companion files. A precedent check confirms peers ship companions without listing them in their M2 spec.

**Consequences.** Six artifacts ship this session: three primary components, one ADR log, one types file, one scoped stylesheet. The prebaked intent and raw response bodies live in the types file as exported constants so a future automated test (Nemea) can import them directly without pulling the split view.

---

## Open questions, deferred

- Whether Harmonia's Day 4 design sweep will refactor `styles.css` into `tokens.ts` consumers in-place or fork a parallel implementation. Neutral either way; the CSS custom property names were chosen to map 1:1 to the contract `SemanticColorTokens` shape.
- Whether the live-query path should stream (Anthropic supports SSE) or block-wait. Deferred because the feature flag ships off by default; a post-hackathon backend proxy can decide per UX.
- Whether a third panel (OpenAI or Higgsfield) lands post-hackathon. The contract mentions N-way grid as a refactor note (Section 11); the component structure accepts this by treating the split as two named slots that can be generalized.

---

## Cross-references

- `docs/contracts/translation_demo.contract.md` v0.1.0
- `docs/contracts/protocol_adapter.contract.md` v0.1.0
- `docs/contracts/agent_intent.contract.md` v0.1.0
- `docs/proteus.decisions.md` (ADR-003 text plus image mock depth)
- `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.20 (Triton spec)
- `_meta/NarasiGhaisan.md` Sections 3, 6, 16 (voice anchor)
