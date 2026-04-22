# Advisor Interaction

**Contract Version:** 0.1.0
**Owner Agent(s):** Apollo (implements interaction logic)
**Consumer Agent(s):** Erato (renders UI surface), Helios (embeds pipeline viz plug-point), Urania (Blueprint Moment synchronization)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the user-facing Advisor chat turn structure, model strategy selection, locale/language toggle, and user-intent parsing flow, enforcing NarasiGhaisan Section 13 brevity discipline (max 3-sentence Advisor turns, max 1 to 2 questions per turn) at the contract layer so UI and logic implementations cannot regress.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Sections 2, 3, 13 central)
- `CLAUDE.md` (root)
- `docs/contracts/pillar_lead_handoff.contract.md` (downstream dispatch target)
- `docs/contracts/prediction_layer_surface.contract.md` (Advisor surfaces prediction warnings)
- `docs/contracts/advisor_ui.contract.md` (UI rendering contract)

## 3. Schema Definition

```typescript
// app/advisor/schema/advisor_interaction.ts

export type Locale = 'en-US' | 'id-ID';

export type ModelStrategy = 'opus_all' | 'collaborative' | 'multi_vendor' | 'auto';

export type AdvisorTurnRole = 'user' | 'advisor' | 'system';

export interface AdvisorTurn {
  turn_id: string;
  role: AdvisorTurnRole;
  content: string;                 // max 3 sentences when role === 'advisor'
  question_count: number;          // max 2 when role === 'advisor'
  rendered_at: string;             // ISO-8601 UTC
  attached_components?: Array<
    | { kind: 'prediction_warning'; warning_id: string }
    | { kind: 'pipeline_viz'; pipeline_run_id: string }
    | { kind: 'blueprint_reveal'; moment_id: string }
  >;
}

export interface AdvisorSession {
  session_id: string;
  locale: Locale;                  // drives currency render (en-US ~ USD, id-ID ~ IDR), see wallet_ui.contract.md
  active_model_strategy: ModelStrategy;
  active_world_aesthetic: 'medieval_desert' | 'cyberpunk_shanghai' | 'steampunk_victorian';
  turns: AdvisorTurn[];
  active_pipeline_run_id?: string;
  user_intent_summary?: string;    // aggregated from turns
}

export interface UserIntent {
  raw_text: string;                // verbatim user input
  extracted: {
    app_type?: string;             // e.g., 'smart_reading_saas'
    target_locale?: Locale;
    constraints?: string[];        // e.g., ['budget_cheap_tier', 'stripe_mock_only']
  };
  requires_clarification: boolean;
  clarification_question?: string; // authored by Apollo if requires_clarification
}
```

## 4. Interface / API Contract

```typescript
export interface AdvisorAgent {
  startSession(init: { locale: Locale; default_strategy?: ModelStrategy }): Promise<AdvisorSession>;
  receiveUserTurn(session_id: string, content: string): Promise<AdvisorTurn>;
  dispatchToLead(session_id: string, pillar: 'builder' | 'marketplace' | 'banking' | 'registry' | 'protocol', structured_params: Record<string, unknown>): Promise<void>;
  renderPredictionMap(session_id: string, confidence_map: Record<string, number>): Promise<AdvisorTurn>;
  presentBlueprintMoment(session_id: string, moment_id: string): Promise<AdvisorTurn>;
  toggleLocale(session_id: string, next_locale: Locale): Promise<void>;
  toggleModelStrategy(session_id: string, next_strategy: ModelStrategy): Promise<void>;
}
```

- All methods are async and emit events through the event bus per `event_bus.contract.md`.
- Advisor turn content field is constrained by the implementation to at most 3 sentences and at most 2 question marks; exceeding either constraint throws at publish time to protect the brevity discipline.

## 5. Event Signatures

- `advisor.session.started` payload: `{ session_id, locale, active_model_strategy }`
- `advisor.turn.appended` payload: `{ session_id, turn: AdvisorTurn }`
- `advisor.intent.parsed` payload: `{ session_id, intent: UserIntent }`
- `advisor.locale.changed` payload: `{ session_id, previous: Locale, next: Locale }` (Erato re-renders currency surfaces)
- `advisor.strategy.changed` payload: `{ session_id, previous: ModelStrategy, next: ModelStrategy }`
- `advisor.moment.presented` payload: `{ session_id, moment_id }` (Urania consumes)

## 6. File Path Convention

- Schema: `app/advisor/schema/advisor_interaction.ts`
- Agent logic: `app/advisor/apollo.ts`
- Prompt templates: `app/advisor/apollo.prompts.ts`
- Config: `app/advisor/apollo.config.json`
- Session state store: `app/advisor/state/session_store.ts`

## 7. Naming Convention

- Locale codes follow BCP-47 (`en-US`, `id-ID`), no aliases.
- Model strategy enum members: lowercase `snake_case` string literals.
- Advisor method names: `verbNoun` camelCase.
- Event topics: `advisor.{subject}.{action}`.

## 8. Error Handling

- Violation of turn brevity (>3 sentences or >2 questions): throws `AdvisorBrevityViolation`, caught by `receiveUserTurn` or `renderPredictionMap`, rewrites the turn to conform and logs a warning. Never surfaces raw violation to user.
- Unknown `pillar` in `dispatchToLead`: throws `UnknownPillarError`.
- Locale not in the supported set `{ 'en-US', 'id-ID' }`: throws `UnsupportedLocaleError`. Other locales are post-hackathon.
- Lead rejection (from `pillar_lead_handoff.contract.md`): Advisor appends a system turn with brief summary (max 2 sentences) and continues the session; never fails hard.

## 9. Testing Surface

- Brevity enforcement: feed the Advisor a prompt scenario that would naturally generate a long response, assert the emitted `AdvisorTurn.content` is at most 3 sentences and at most 2 question marks.
- Locale toggle: start session `en-US`, toggle to `id-ID`, assert `advisor.locale.changed` event fires with correct previous/next.
- Prediction map rendering: supply a confidence map with one entry below threshold, assert a `prediction_warning` attached_component appears in the resulting turn.
- Model strategy persistence: set strategy `multi_vendor`, append 5 turns, assert `session.active_model_strategy` unchanged.

## 10. Open Questions

- None at contract draft. Voice/tone sign-off for Advisor responses is a strategic_decision_hard_stop per Apollo spec (requires Ghaisan sample review), tracked in `docs/apollo.decisions.md` not here.

## 11. Post-Hackathon Refactor Notes

- Support broader locale set; currency mapping must generalize beyond the en-US and id-ID pair (JP-JP to JPY, etc.). Introduce a `LocaleToCurrency` map in Banking contracts.
- Voice input support (speech-to-text turn entry) is post-hackathon scope per Erato strategic_decision.
- Long-form user intent (10-page spec) currently triggers halt per Apollo halt trigger; post-hackathon introduce intent-segmentation and multi-turn clarification flow.
- Session persistence is in-memory for hackathon; post-hackathon back it with SQLite for resume-on-reload.
