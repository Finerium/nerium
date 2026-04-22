//
// apollo.prompts.ts
//
// System and turn prompt templates for Apollo (Opus 4.7). Conforms to:
// - docs/contracts/advisor_interaction.contract.md v0.1.0 (turn schema)
// - _meta/NarasiGhaisan.md Section 13 (brevity discipline, reinforced at both
//   prompt layer and data layer in apollo.ts)
// - CLAUDE.md anti-patterns (no em dash, no emoji, honest-claim filter)
//
// Templates here build the string payloads intended for the Anthropic
// Messages API. apollo.ts injects an AdvisorResponseGenerator at
// construction; the concrete generator (Erato integration or test harness)
// is responsible for dispatching these payloads to Opus 4.7 and returning
// the raw text. apollo.ts then runs enforceAdvisorBrevity as a
// belt-and-suspenders check on the generated output.
//

import type {
  AdvisorGenerationContext,
  AdvisorSession,
  AdvisorTurn,
  Locale,
  ModelStrategy,
  PillarHandoffResponse,
} from './apollo';

// ---------- Core Advisor system prompt -----------------------------------

export const APOLLO_SYSTEM_PROMPT = `You are Apollo, the Advisor character for NERIUM. You are the single conversational touchpoint between an end user and five internal pillars: Builder, Marketplace, Banking, Registry, Protocol. You are the conductor, not the orchestra. You do not write code, run simulations, or process payments yourself; you dispatch to a Lead and aggregate the response.

Voice anchor: follow NarasiGhaisan.md Section 13 brevity discipline literally. Every response you produce MUST satisfy ALL of the following:
- Maximum 3 sentences.
- Maximum 2 question marks total across the full response.
- Prefer exactly 1 question per response.
- Match the user's language. Casual Indonesian register is acceptable (gw, lu, oke, sip, roger) and casual English is acceptable (hi, sure, got it).
- Replace text with visual cues where possible: mention the pipeline viz, the world aesthetic, the Blueprint reveal. Do not narrate internal reasoning.

Absolute style rules (enforced downstream by auto-rewrite, but you should not trigger it):
- No em dash (the U+2014 character). Use a comma, period, or parenthesis instead.
- No emoji.
- No wall of text. If you feel yourself listing more than three items, pick the top one and stop.
- No apologies, no filler, no restating the user's question.

Strategy modes you may surface when asked:
- opus_all: premium tier, Opus across every agent.
- collaborative: Opus for strategic agents, Sonnet for execution workers.
- multi_vendor: user picks per-task vendor. Surface with the honest-claim annotation "Demo execution Anthropic only, multi-vendor unlock post-hackathon."
- auto: orchestrator picks per-task.

World aesthetics you may reference: medieval_desert, cyberpunk_shanghai, steampunk_victorian.

Pillars you may route to: builder, marketplace, banking, registry, protocol. When routing, name the pillar so the user knows where their intent went.

Do not invent product features. If the user asks something outside your remit, say so briefly and hand them to the right pillar.`;

// ---------- Honest-claim annotations -------------------------------------

export const MULTI_VENDOR_ANNOTATION_EN =
  'Demo execution Anthropic only, multi-vendor unlock post-hackathon.';

export const MULTI_VENDOR_ANNOTATION_ID =
  'Demo jalan Anthropic only, multi-vendor kebuka post-hackathon.';

export const AUTO_STRATEGY_ANNOTATION_EN =
  'Auto routing ships post-hackathon; current demo uses collaborative Anthropic.';

export const AUTO_STRATEGY_ANNOTATION_ID =
  'Mode auto rilis post-hackathon, demo sekarang pake collaborative Anthropic.';

export function getStrategyAnnotation(
  strategy: ModelStrategy,
  locale: Locale,
): string | null {
  if (strategy === 'multi_vendor') {
    return locale === 'id-ID'
      ? MULTI_VENDOR_ANNOTATION_ID
      : MULTI_VENDOR_ANNOTATION_EN;
  }
  if (strategy === 'auto') {
    return locale === 'id-ID'
      ? AUTO_STRATEGY_ANNOTATION_ID
      : AUTO_STRATEGY_ANNOTATION_EN;
  }
  return null;
}

// ---------- Gamified warning copy variants -------------------------------
// Tone calibration strategic_decision_hard_stop per apollo.md: requires
// Ghaisan voice sign-off on a representative sample. Copy proposals below
// are drafts; final lock tracked in docs/apollo.decisions.md ADR-0003.

export const GAMIFIED_WARNING_COPY_VARIANTS = {
  building_floor: {
    'id-ID': (floor: string | number, score: string) =>
      `Blueprint scan alert, Floor ${floor} confidence ${score}, revisi dulu?`,
    'en-US': (floor: string | number, score: string) =>
      `Blueprint scan alert, Floor ${floor} confidence ${score}, want a revise?`,
  },
  save_point: {
    'id-ID': (floor: string | number, score: string) =>
      `Save point risk, step ${floor} drop ke ${score}, rollback aman?`,
    'en-US': (floor: string | number, score: string) =>
      `Save point risk, step ${floor} confidence ${score}, roll back?`,
  },
  neutral: {
    'id-ID': (floor: string | number, score: string) =>
      `Heads up, step ${floor} confidence ${score}. Mau revisi?`,
    'en-US': (floor: string | number, score: string) =>
      `Heads up, step ${floor} confidence ${score}. Revise?`,
  },
} as const;

// ---------- Session summary helpers --------------------------------------

function summarizeTurns(turns: AdvisorTurn[], cap = 6): string {
  const tail = turns.slice(-cap);
  return tail
    .map((t) => {
      const safe = t.content.replace(/\n+/g, ' ').slice(0, 180);
      return `[${t.role}] ${safe}`;
    })
    .join('\n');
}

function summarizeLeadResponses(responses: PillarHandoffResponse[]): string {
  if (responses.length === 0) return 'no_leads_dispatched';
  return responses
    .map(
      (r) =>
        `- ${r.pillar}: ${r.status} (artifacts=${r.artifact_paths.length}, delegated=${r.delegated_to_specialists.length})`,
    )
    .join('\n');
}

function sessionHeader(session: AdvisorSession): string {
  return [
    `session_id: ${session.session_id}`,
    `locale: ${session.locale}`,
    `strategy: ${session.active_model_strategy}`,
    `world: ${session.active_world_aesthetic}`,
    `turn_count: ${session.turns.length}`,
  ].join(' | ');
}

// ---------- Message builder per variant ----------------------------------

export interface MessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export function buildMessagesForVariant(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  switch (ctx.variant) {
    case 'user_reply':
      return buildUserReplyMessages(ctx);
    case 'clarification_question':
      return buildClarificationMessages(ctx);
    case 'prediction_warning_render':
      return buildPredictionWarningMessages(ctx);
    case 'blueprint_present':
      return buildBlueprintPresentMessages(ctx);
    case 'lead_reject_summary':
      return buildLeadRejectMessages(ctx);
    case 'dispatch_confirm':
      return buildDispatchConfirmMessages(ctx);
    default:
      return [
        {
          role: 'user',
          content: 'Respond briefly acknowledging the user in their locale.',
        },
      ];
  }
}

function buildUserReplyMessages(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  const { session, user_content, intent, lead_responses } = ctx;
  const annotation = getStrategyAnnotation(
    session.active_model_strategy,
    session.locale,
  );
  const leadSummary = summarizeLeadResponses(lead_responses ?? []);
  const extracted = intent?.extracted ?? {};
  const recentTurns = summarizeTurns(session.turns);

  const lines = [
    `Context: ${sessionHeader(session)}`,
    annotation
      ? `Honest-claim annotation to include if user asks about strategy: ${annotation}`
      : '',
    `User latest turn: ${user_content ?? ''}`,
    `Parsed intent extracted fields: ${JSON.stringify(extracted)}`,
    `Lead dispatch summary:\n${leadSummary}`,
    `Recent turns:\n${recentTurns}`,
    '',
    'Task: produce an Advisor response to the user. Match locale. Mention the pillar(s) you dispatched to if any were accepted. If any lead deferred or rejected, acknowledge in one clause without apology. Maximum 3 sentences. Maximum 2 questions total, prefer exactly 1.',
  ].filter(Boolean) as string[];

  return [{ role: 'user', content: lines.join('\n') }];
}

function buildClarificationMessages(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  const { session, user_content, intent } = ctx;
  const lines = [
    `Context: ${sessionHeader(session)}`,
    `User turn: ${user_content ?? ''}`,
    `Suggested clarifier: ${intent?.clarification_question ?? '(none)'}`,
    '',
    'Task: ask exactly ONE clarifying question so you can route to the right pillar. Prefer a single sentence. Maximum 2 sentences. Exactly 1 question mark. Match locale.',
  ];
  return [{ role: 'user', content: lines.join('\n') }];
}

function buildPredictionWarningMessages(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  const { session, warning_gamified_message } = ctx;
  const lines = [
    `Context: ${sessionHeader(session)}`,
    `Gamified warning copy from config: ${warning_gamified_message ?? '(none)'}`,
    '',
    'Task: relay the gamified warning to the user in their locale. Keep the construction metaphor if the copy variant uses it. Maximum 2 sentences. 1 question maximum (the revise prompt).',
  ];
  return [{ role: 'user', content: lines.join('\n') }];
}

function buildBlueprintPresentMessages(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  const { session, moment_id } = ctx;
  const lines = [
    `Context: ${sessionHeader(session)}`,
    `Blueprint moment id: ${moment_id ?? '(unspecified)'}`,
    '',
    'Task: cue the camera pullback reveal. Tell the user the 22-agent map is about to show and invite them to look. Maximum 2 sentences. 1 question maximum.',
  ];
  return [{ role: 'user', content: lines.join('\n') }];
}

function buildLeadRejectMessages(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  const { session, rejection_summary } = ctx;
  const lines = [
    `Context: ${sessionHeader(session)}`,
    `Lead rejection reason: ${rejection_summary ?? 'unknown'}`,
    '',
    'Task: produce a system-role note summarizing the rejection. Maximum 2 sentences. Zero questions. Neutral tone, no apology spiral.',
  ];
  return [{ role: 'user', content: lines.join('\n') }];
}

function buildDispatchConfirmMessages(
  ctx: AdvisorGenerationContext,
): MessageInput[] {
  const { session, lead_responses } = ctx;
  const accepted = (lead_responses ?? []).filter(
    (r) => r.status === 'accepted',
  );
  const pillars = accepted.map((r) => r.pillar).join(', ');
  const lines = [
    `Context: ${sessionHeader(session)}`,
    `Accepted pillars: ${pillars || '(none)'}`,
    '',
    'Task: confirm dispatch briefly. Maximum 2 sentences. Zero or one question.',
  ];
  return [{ role: 'user', content: lines.join('\n') }];
}

// ---------- Intent parser prompt (optional Opus assist) ------------------
// apollo.ts defaults to a keyword heuristic for cost reasons
// (NarasiGhaisan Section 4). Callers who want richer NLP extraction can
// wire this template into a secondary Opus call before the user-reply
// message pair. Pair with a constrained JSON response at call site.

export const APOLLO_INTENT_PARSE_SYSTEM = `You are Apollo's intent parser. Input is a single user utterance. Output MUST be strict JSON conforming to:
{
  "raw_text": string,
  "extracted": {
    "app_type": string | null,
    "target_locale": "en-US" | "id-ID" | null,
    "constraints": string[] | null
  },
  "requires_clarification": boolean,
  "clarification_question": string | null
}

Rules:
- raw_text echoes the user input verbatim.
- requires_clarification is true when the utterance is under 8 characters or under 3 words and app_type cannot be determined.
- clarification_question MUST be 1 sentence and contain exactly one question mark when present.
- No prose outside the JSON.
- No em dash.
- No emoji.`;

export function buildIntentParseMessages(text: string): MessageInput[] {
  return [{ role: 'user', content: text }];
}

// ---------- Safety validators on prompt payloads -------------------------
// These are not the runtime brevity enforcement (that lives in apollo.ts);
// they are pre-send sanity checks on the templates themselves so the module
// fails fast on load if a future edit introduces a forbidden character.

const EM_DASH_REGEX = /\u2014/;
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}]/u;

export function assertNoEmDash(payload: string): void {
  if (EM_DASH_REGEX.test(payload)) {
    throw new Error(
      'Prompt payload contains em dash (U+2014), forbidden by CLAUDE.md anti-pattern 1.',
    );
  }
}

export function assertNoEmoji(payload: string): void {
  if (EMOJI_REGEX.test(payload)) {
    throw new Error(
      'Prompt payload contains emoji, forbidden by CLAUDE.md anti-pattern 2.',
    );
  }
}

// Fail-fast at module load so any future edit that smuggles in a forbidden
// character surfaces before the prompt reaches a real Opus call.
assertNoEmDash(APOLLO_SYSTEM_PROMPT);
assertNoEmoji(APOLLO_SYSTEM_PROMPT);
assertNoEmDash(MULTI_VENDOR_ANNOTATION_EN);
assertNoEmDash(MULTI_VENDOR_ANNOTATION_ID);
assertNoEmDash(AUTO_STRATEGY_ANNOTATION_EN);
assertNoEmDash(AUTO_STRATEGY_ANNOTATION_ID);
assertNoEmDash(APOLLO_INTENT_PARSE_SYSTEM);
assertNoEmoji(APOLLO_INTENT_PARSE_SYSTEM);
