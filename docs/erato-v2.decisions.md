---
agent: erato-v2
phase: RV W3 Sabtu
date: 2026-04-23
version: 0.1.0
status: shipped
scope: React HUD layer authoring (TopBar + BottomBar + SideBar + overlays + BusBridge + stores)
supersedes: none
contracts_referenced:
  - docs/contracts/game_state.contract.md v0.1.0
  - docs/contracts/game_event_bus.contract.md v0.1.0
  - docs/contracts/advisor_ui.contract.md v0.1.0
  - docs/contracts/pipeline_visualizer.contract.md v0.1.0
  - docs/contracts/wallet_ui.contract.md v0.1.0
  - docs/contracts/design_tokens.contract.md v0.1.0
  - docs/contracts/vendor_adapter_ui.contract.md v0.1.0
  - docs/contracts/zustand_bridge.contract.md v0.1.0
---

# Erato-v2 decisions

Five architectural decisions made during the W3 Sabtu session. Each entry
follows the P0 `{agent}.decisions.md` pattern: rationale, alternatives
considered, tradeoff, review trigger.

## ADR-0001: Preferences sit in a non-contract Zustand store alongside the five game-state stores

### Context

Metis-v2 M2 Section 4.5 spec lists `src/stores/uiStore.ts` as owning
"modal visibility, sidebar collapsed state, language, model choice". The
Pythia-v2 `game_state.contract.md` v0.1.0 Section 3.4 UIStore interface,
however, locks the shape of `useUIStore` to nine fields that do NOT
include `sidebarCollapsed`, `language`, or `modelChoice`. Adding slices
to an existing contract store is a strategic hard stop per Erato-v2
spec.

### Decision

Split the responsibility. `src/stores/uiStore.ts` exports two things:

1. `useUIStore` re-exported from the contract-authoritative
   `src/state/stores.ts` (no change to the contract shape).
2. `useUIPreferencesStore`, a NEW Zustand store holding user-preference
   state: `sidebarCollapsed`, `language` (`'en-US' | 'id-ID'`), and
   `modelChoice` (`'opus-4-7' | 'sonnet-4-6'`).

`useUIPreferencesStore` is persisted to `localStorage` under the key
`nerium:ui-preferences` so choices survive page reload. The store is
explicitly out of scope of `game_state.contract.md`, which governs the
five game-state stores (quest, dialogue, inventory, ui, audio), not
user preferences.

### Alternatives considered

- Ferry halt to Pythia-v2 for an amendment adding the three fields to
  UIStore. Rejected: opens contract churn during W3 parallel wave when
  five other stores depend on the shape; Pythia-v2 bandwidth is already
  allocated to round 2 game-state topics.
- Put preferences in React `useState` + manual `localStorage`
  persistence at each component. Rejected: ModelSelector (SideBar),
  CurrencyDisplay (TopBar), BottomBar, ApolloStream, and the i18n
  helper all need to read `language` and `modelChoice`, which means
  prop drilling through three grid levels (translator_notes gotcha 3
  anti-pattern).
- Extend UIStore inline in `src/state/stores.ts`. Rejected: that file
  is contract-authoritative and Thalia-v2 owns it; modifying its shape
  requires Pythia-v2 revision per contract.

### Tradeoff

Two stores instead of one is a marginal cost. The win is a clean
boundary: game-state stores remain contract-conformant and Pythia-v2's
shape authority is preserved, while user preferences (which post-hackathon
will plausibly move into a `settingsStore` with persist middleware, per
`game_state.contract.md` Section 11 refactor notes) already live in the
correct module.

### Review trigger

If Pythia-v2 round 3 amends UIStore to absorb preferences, fold
`useUIPreferencesStore` back into the contract store and delete the
extra module. Flag is checked at the start of every new Pythia round.

## ADR-0002: Cross-pillar composition via `ReactNode` slot props, never direct import

### Context

translator_notes gotcha 16 documents the AdvisorChat `multiVendorPanelSlot`
pattern: Advisor did not import the Protocol multi-vendor panel component;
the parent owner passed it as a `ReactNode` slot prop. This avoided
circular deps and kept pillars independent. In RV the HUD renders
cross-pillar surfaces (Nyx QuestTracker, Linus DialogueOverlay, Helios
pipeline viz, Euterpe VolumeSlider) at the same time.

### Decision

Every cross-pillar mount point in Erato-v2 HUD components uses a
`ReactNode` slot prop. `TopBar` accepts `questTrackerSlot` and
`minimapSlot`. `BottomBar` accepts `dialogueSlot` and `promptInputSlot`.
`SideBar` accepts `pipelineVizSlot`, `volumeSliderSlot`, and `extraSlot`.
The single place that knows about concrete cross-pillar components is
`src/components/hud/GameHUD.tsx`, the aggregator consumed by `GameShell`.

### Alternatives considered

- Direct import at each HUD leaf (TopBar imports QuestTracker, BottomBar
  imports DialogueOverlay). Rejected: a SideBar redesign would then touch
  multiple pillars; the cross-pillar edges multiply combinatorially.
- Global Zustand registry of "HUD slots" keyed by string. Rejected:
  extra indirection with no performance win; slot props give TypeScript
  type safety for free.

### Tradeoff

Composition is slightly more verbose in GameHUD.tsx (one spot), but
cleaner everywhere else. Nemea-RV component-level regression focuses
on GameHUD for cross-pillar coverage.

### Review trigger

If the slot depth grows past ~6 per HUD element, reconsider in favor
of a context provider. At current scope the slot count is 3 per TopBar
and 3 per SideBar, comfortable.

## ADR-0003: Custom lightweight i18n instead of next-intl

### Context

M2 Section 4.5 spec mentions `next-intl` for USD/IDR i18n.
`package.json` does NOT list `next-intl` in dependencies (only
`framer-motion`, `zustand`, `phaser`, etc). Installing `next-intl` at
W3 introduces an App Router middleware requirement and plural-rules
behavior we do not need for the vertical slice.

### Decision

Ship `src/lib/i18n.ts` as a 60-line helper. It imports two static JSON
dictionaries (`src/i18n/en.json`, `src/i18n/id.json`), resolves
`dot.path` lookups, and interpolates `{placeholder}` values. The
`useT()` hook subscribes to `useUIPreferencesStore.language` via a
narrow selector so locale changes re-render only consumers of the
hook.

Currency formatting is explicitly NOT handled by the i18n helper.
CurrencyDisplay imports `formatCurrency` directly from
`app/banking/meter/cost_ticker.ts` (translator_notes gotcha 10: single
source of truth). The i18n helper owns UI chrome copy only.

### Alternatives considered

- Install `next-intl`. Rejected: adds a runtime dependency + App Router
  middleware configuration + locale routing change in a single W3
  parallel window when the upstream deliverable is a demo video, not
  a localization roadmap.
- Use `Intl.MessageFormat` directly. Rejected: no pluralization needs
  in the RV copy; string-template interpolation is enough.
- Inline every string twice (EN/ID). Rejected: makes copy audits (Nemea
  voice verification, translator_notes gotcha 24) harder; centralized
  dictionaries give a single grep target.

### Tradeoff

No pluralization, no ICU message format, no server-side locale
detection. All acceptable for the vertical slice. Post-hackathon the
lib can be swapped for `next-intl` once the refactor window opens.

### Review trigger

If the copy count grows past ~50 strings per locale or pluralization
is required, reconsider `next-intl` or `@formatjs/intl`.

## ADR-0004: ApolloStream wrapper synthesizes an AdvisorSession from dialogueStore

### Context

The ported `src/components/hud/ported/ApolloStream.tsx` expects an
`AdvisorSession` prop (from `app/advisor/apollo.ts`). In W3 the game
does not have a persistent `AdvisorSession`; the dialogue runtime
streams text via `useDialogueStore.streamBuffer` and does not store an
`AdvisorSession` shape.

### Decision

`src/components/hud/ApolloStream.tsx` synthesizes a minimum
`AdvisorSession` from `useDialogueStore` state on every render: one
synthetic `AdvisorTurn` with role `'advisor'` holding the current
`streamBuffer` content. When no stream is active the wrapper renders a
localized placeholder instead of the ported skeleton so the HUD cell
never reads as broken.

### Alternatives considered

- Author a dedicated `useAdvisorStore` that mirrors `AdvisorSession`.
  Rejected for W3: Apollo session persistence is post-hackathon (Apollo
  decisions ADR 002 slates moving to SQLite). Introducing
  `useAdvisorStore` today means a sixth game-domain store plus a
  Pythia-v2 contract amendment.
- Render the ported `ApolloStream` with an empty session even when
  idle. Rejected: the ported component renders a localized welcome
  string that does not share locale plumbing with the rest of the HUD;
  the placeholder keeps chrome consistent.

### Tradeoff

The synthetic session is stateless and does not persist brevity
violation annotations across turns. For the vertical slice demo a
single streaming advisor turn is the only turn that matters. Multi-turn
history surfaces post-hackathon when a real `useAdvisorStore` lands.

### Review trigger

When Apollo session persistence (SQLite) ships, replace the synthetic
builder with a selector over `useAdvisorStore`. Remove this ADR once
that swap is live.

## ADR-0005: BusBridge mounts once in GameHUD and does not fork the canonical bus

### Context

Two existing bridge surfaces touch the game event bus:

1. `src/state/gameBridge.ts` (Thalia-v2) wires Phaser `game.events` to
   the five contract stores via `wireBridge(game)` inside
   `PhaserCanvas`.
2. `src/lib/dialogueBridge.ts` (Linus) emits via
   `window.__NERIUM_GAME_BUS__` if present, else falls back to a
   `__NERIUM_GAME_EVENT__` CustomEvent on window.

A third surface could have forked the bus with its own emitter. Per
translator_notes gotcha 1 ("do not fork the central event bus"), that
is forbidden.

### Decision

`src/components/BusBridge.tsx` attaches a single `window`-level
listener for `__NERIUM_GAME_EVENT__` CustomEvents and translates a
curated subset of topics (`game.shop.*`, `game.inventory.opened`,
`game.ui.overlay_changed`, `game.cinematic.*`,
`game.quest.trigger_requested`, `game.dialogue.challenge_submitted`)
into Zustand store actions. It mounts once at the top of `GameHUD`,
above every HUD sibling, and returns `null` (no DOM of its own).

`src/lib/hudBus.ts` exposes `emitBusEvent(topic, payload)` that tries
`window.__NERIUM_GAME_BUS__` first (so it can piggy-back on the bus
registered by `wireBridge` when PhaserCanvas exposes it in a later
pass) and falls back to the `__NERIUM_GAME_EVENT__` CustomEvent so
Linus + Erato-v2 converge on the same escape hatch.

### Alternatives considered

- Subscribe BusBridge to `game.events` directly. Rejected: React-level
  components do not have an easy handle on the Phaser `Game` instance
  after it is constructed inside `PhaserCanvas`; the registry lookup
  is a workaround we do not need because UI-only flips don't have to
  cross the Phaser boundary.
- Let each HUD component read + write Zustand stores directly and skip
  BusBridge. Rejected: dialogue-originated events from Linus still need
  a window listener; without BusBridge those events land nowhere when
  `window.__NERIUM_GAME_BUS__` is unset.

### Tradeoff

The `__NERIUM_GAME_EVENT__` CustomEvent pathway is slower than a
direct emitter call. The volume of HUD-originated events per second
is small (user clicks, quest step transitions), so the overhead is
negligible.

### Review trigger

If `wireBridge` exposes the bus via `window.__NERIUM_GAME_BUS__` in a
subsequent pass, `emitBusEvent` will start routing through it
automatically; BusBridge becomes the redundant fallback. At that point
decide whether to keep BusBridge as a safety net or retire it. Flag
the decision at the first Harmonia-RV-A integration check.
