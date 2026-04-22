# Advisor UI

**Contract Version:** 0.1.0
**Owner Agent(s):** Erato (UI component author)
**Consumer Agent(s):** Apollo (mounts UI, feeds turns), Helios (embeds pipeline viz plug-point), Morpheus (extends the Multi-vendor strategy panel), Harmonia (applies design tokens across Advisor surfaces)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the Advisor chat-surface component contract (props, slots, accessibility, locale toggle, model strategy selector, prediction warning banner, pipeline viz plug-point) so the UI layer can be built independently from Apollo's interaction logic while enforcing NarasiGhaisan Section 13 brevity discipline at render time.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 13 Communication Style central)
- `CLAUDE.md` (root)
- `docs/contracts/advisor_interaction.contract.md` (source of turn/session schemas consumed by this UI)
- `docs/contracts/design_tokens.contract.md` (Harmonia-owned tokens this UI renders with)
- `docs/contracts/prediction_layer_surface.contract.md` (warnings embedded as child components)

## 3. Schema Definition

```typescript
// app/advisor/ui/types.ts

import type { AdvisorSession, AdvisorTurn, Locale, ModelStrategy } from '@/advisor/schema/advisor_interaction';

export interface AdvisorChatProps {
  session: AdvisorSession;
  onUserTurnSubmit: (content: string) => Promise<void>;
  onLocaleToggle: (next: Locale) => Promise<void>;
  onStrategyChange: (next: ModelStrategy) => Promise<void>;
  onWorldAestheticChange: (next: 'medieval_desert' | 'cyberpunk_shanghai' | 'steampunk_victorian') => Promise<void>;
  pipelineVizSlot?: React.ReactNode;     // Helios plugs in here
  multiVendorPanelSlot?: React.ReactNode; // Morpheus plugs in here
  isAwaitingAdvisorTurn: boolean;
}

export interface ModelStrategySelectorProps {
  current: ModelStrategy;
  onChange: (next: ModelStrategy) => Promise<void>;
  disabled?: boolean;
  multiVendorPanel?: React.ReactNode;
}

export interface PredictionWarningProps {
  warning_id: string;
  gamified_message: string;
  severity: 'advisory' | 'review_recommended' | 'halt_recommended';
  onAcknowledge: () => void;
  onRevise: () => void;
}

export interface LocaleToggleProps {
  current: Locale;
  onChange: (next: Locale) => Promise<void>;
  supported: Locale[];               // default ['en-US', 'id-ID']
}
```

## 4. Interface / API Contract

- All top-level components are React functional components consumed as default exports matching the file basename.
- Component props are typed via interfaces above; no `any` leakage.
- `AdvisorChat` must render turns with `AdvisorTurn.role === 'advisor'` in a visually distinct bubble from user turns; max 3 sentences enforced at data layer (see `advisor_interaction.contract.md`) not at UI.
- The locale toggle triggers currency re-render across all attached Banking UI components (Dike, Rhea); implementers coordinate via React context or Zustand slice.
- Framework: Next.js 15 App Router with React Server Components is the target runtime; Advisor components are client components (`'use client'` directive).

## 5. Event Signatures

Advisor UI is a consumer of Apollo's events (see `advisor_interaction.contract.md` Section 5). It does not publish new events on the pipeline event bus; user-initiated actions call the `on*` callback props which Apollo translates into event-bus events.

## 6. File Path Convention

- Root component: `app/advisor/ui/AdvisorChat.tsx`
- Model selector: `app/advisor/ui/ModelStrategySelector.tsx`
- Warning: `app/advisor/ui/PredictionWarning.tsx`
- Locale toggle: `app/advisor/ui/LocaleToggle.tsx`
- World aesthetic picker: `app/advisor/ui/WorldAestheticPicker.tsx`
- Styles: `app/advisor/ui/styles.css` (scoped) or Tailwind classes inline
- Types: `app/advisor/ui/types.ts`

## 7. Naming Convention

- Component files: `PascalCase.tsx`.
- Props interfaces: `{Component}Props`.
- Callback props: `on{Event}` camelCase (`onUserTurnSubmit`, `onLocaleToggle`).
- CSS classes: kebab-case prefixed `advisor-` when not using Tailwind.

## 8. Error Handling

- If a callback prop throws, the UI catches, renders a non-blocking toast ("Something went wrong; please retry") and logs to console. Never crashes the chat surface.
- If `AdvisorSession.turns` is empty, render a welcome state with a single clarifying prompt (no spinner).
- If `isAwaitingAdvisorTurn` remains true past 15 seconds, render a subdued progress indicator and a cancel affordance.

## 9. Testing Surface

- Render test: `<AdvisorChat session={...} />` with 5 mixed turns, assert 5 bubbles appear with correct role visual treatment.
- Brevity visual: supply an Advisor turn containing 3 sentences, assert the bubble renders without truncation or wrap-break artifacts.
- Locale toggle: click the toggle, assert `onLocaleToggle('id-ID')` called exactly once with the expected argument.
- Strategy selector: select `multi_vendor`, assert `onStrategyChange('multi_vendor')` called and, if `multiVendorPanelSlot` is provided, the slot becomes visible.
- Accessibility: run axe-core against the mounted component, assert no violations of level WCAG AA for contrast and keyboard navigation.

## 10. Open Questions

- None at contract draft. Voice input support deferred to post-hackathon per Erato strategic_decision.

## 11. Post-Hackathon Refactor Notes

- Add voice input (mic) and speech-to-text round trip.
- Support richer attached-component kinds: inline code preview, artifact gallery, live deployment preview iframe.
- Introduce theming beyond the three-world aesthetic: user custom themes editable per session.
- Replace callback-prop surface with a `useAdvisor()` hook that binds to a Zustand store for fewer prop-drilling layers when Apollo becomes the orchestrator of many nested surfaces.
- Formalize accessibility requirements with explicit WCAG AAA targets for Builder use cases where non-technical users include users with disabilities.
