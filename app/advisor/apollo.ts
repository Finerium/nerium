//
// apollo.ts
//
// Apollo AdvisorAgent implementation. Owner agent: Apollo (Advisor Tier, P2).
//
// Conforms to:
// - docs/contracts/advisor_interaction.contract.md v0.1.0 (schema + interface)
// - docs/contracts/pillar_lead_handoff.contract.md v0.1.0 (dispatch envelope)
// - docs/contracts/prediction_layer_surface.contract.md v0.1.0 (warning render)
//
// Brevity discipline per NarasiGhaisan Section 13 is enforced at the data
// layer in this file via `enforceAdvisorBrevity`. Violations throw
// AdvisorBrevityViolation, which callers catch and handle by rewriting the
// turn to conform. Raw violation never reaches the user surface.
//
// Post-hackathon refactor notes (tracked in docs/apollo.decisions.md):
// 1. Schema types here will move to app/advisor/schema/advisor_interaction.ts
//    per advisor_interaction.contract.md Section 6 file path convention. They
//    are inlined for hackathon scope because Apollo output spec lists exactly
//    four artifacts and does not authorize shipping a separate schema file.
// 2. Session state Map will move to app/advisor/state/session_store.ts and be
//    backed by SQLite so sessions survive page reload.
// 3. PillarHandoffRequest and PillarHandoffResponse types will move to
//    app/shared/orchestration/pillar_handoff.ts per
//    pillar_lead_handoff.contract.md Section 6. Leads import them from this
//    file in the interim.
// 4. AdvisorEventPublisher will merge into the unified EventBus once the
//    namespace extension contract ships (event_bus.contract.md Section 11).
//

// ---------- Schema types (advisor_interaction.contract.md Section 3) ----------

export type Locale = 'en-US' | 'id-ID';

export type ModelStrategy = 'opus_all' | 'collaborative' | 'multi_vendor' | 'auto';

export type AdvisorTurnRole = 'user' | 'advisor' | 'system';

export type WorldAesthetic =
  | 'medieval_desert'
  | 'cyberpunk_shanghai'
  | 'steampunk_victorian';

export type AttachedComponent =
  | { kind: 'prediction_warning'; warning_id: string }
  | { kind: 'pipeline_viz'; pipeline_run_id: string }
  | { kind: 'blueprint_reveal'; moment_id: string };

export interface AdvisorTurn {
  turn_id: string;
  role: AdvisorTurnRole;
  content: string;
  question_count: number;
  rendered_at: string;
  attached_components?: AttachedComponent[];
}

export interface AdvisorSession {
  session_id: string;
  locale: Locale;
  active_model_strategy: ModelStrategy;
  active_world_aesthetic: WorldAesthetic;
  turns: AdvisorTurn[];
  active_pipeline_run_id?: string;
  user_intent_summary?: string;
}

export interface UserIntent {
  raw_text: string;
  extracted: {
    app_type?: string;
    target_locale?: Locale;
    constraints?: string[];
  };
  requires_clarification: boolean;
  clarification_question?: string;
}

// ---------- Pillar handoff types (pillar_lead_handoff.contract.md Section 3) ----------

export type PillarId = 'builder' | 'marketplace' | 'banking' | 'registry' | 'protocol';

export interface PillarHandoffRequest {
  request_id: string;
  pipeline_run_id: string;
  pillar: PillarId;
  user_intent_summary: string;
  structured_params: Record<string, unknown>;
  upstream_context: {
    prior_lead_outputs: Array<{
      pillar: PillarId;
      summary: string;
      artifact_paths: string[];
    }>;
    active_model_strategy: ModelStrategy;
    active_world_aesthetic: WorldAesthetic;
  };
}

export interface PillarHandoffResponse {
  request_id: string;
  pillar: PillarId;
  status: 'accepted' | 'rejected' | 'deferred';
  summary: string;
  artifact_paths: string[];
  delegated_to_specialists: string[];
  rejection_reason?: string;
  defer_until_event?: string;
}

export interface PillarLead {
  readonly pillar: PillarId;
  handle(request: PillarHandoffRequest): Promise<PillarHandoffResponse>;
  capabilities(): { advertised_params: string[]; max_concurrent_requests: number };
}

export interface PillarLeadRegistry {
  get(pillar: PillarId): PillarLead | undefined;
  register(lead: PillarLead): void;
  list(): PillarLead[];
}

// ---------- Advisor event publisher (namespace outside PipelineEventTopic) ----------

export type AdvisorEventTopic =
  | 'advisor.session.started'
  | 'advisor.turn.appended'
  | 'advisor.intent.parsed'
  | 'advisor.locale.changed'
  | 'advisor.strategy.changed'
  | 'advisor.moment.presented';

export interface AdvisorEvent<TPayload = unknown> {
  readonly event_id: string;
  readonly topic: AdvisorEventTopic;
  readonly session_id: string;
  readonly occurred_at: string;
  readonly source_agent: 'apollo';
  readonly payload: TPayload;
}

export interface AdvisorEventPublisher {
  publish<T>(event: AdvisorEvent<T>): Promise<void>;
}

// ---------- Pipeline handoff publisher (pillar_lead_handoff events) ----------
// Pillar_lead_handoff.contract.md Section 5 says pipeline.handoff fires
// through the event bus. We do not depend on the concrete EventBus here;
// callers inject a thin publisher so Apollo stays decoupled.

export interface PipelineHandoffPublisher {
  publishHandoff(input: {
    pipeline_run_id: string;
    from_specialist: string;
    to_specialist: string;
    artifact_paths: string[];
    request_id: string;
    status: 'dispatching' | 'accepted' | 'rejected' | 'deferred';
  }): Promise<void>;
}

// ---------- Opus turn generator injection surface ------------------------
// Apollo uses Opus 4.7 for response generation but does NOT bind to the
// Anthropic SDK directly. The integration layer (Erato mount or Lumio
// runner) injects a concrete generator that maps the prompt variant to a
// real Anthropic call. See apollo.prompts.ts for the template strings.

export type PromptVariant =
  | 'user_reply'
  | 'clarification_question'
  | 'prediction_warning_render'
  | 'blueprint_present'
  | 'lead_reject_summary'
  | 'dispatch_confirm';

export interface AdvisorGenerationContext {
  session: AdvisorSession;
  variant: PromptVariant;
  user_content?: string;
  intent?: UserIntent;
  lead_responses?: PillarHandoffResponse[];
  rejection_summary?: string;
  warning_gamified_message?: string;
  moment_id?: string;
}

export type AdvisorResponseGenerator = (
  ctx: AdvisorGenerationContext,
) => Promise<string>;

export type UserIntentParser = (
  text: string,
  session: AdvisorSession,
) => Promise<UserIntent>;

// ---------- Config shape (mirrors apollo.config.json) --------------------

export interface ApolloConfig {
  brevity: {
    max_sentences_per_advisor_turn: number;
    max_questions_per_advisor_turn: number;
    auto_rewrite_on_violation: boolean;
  };
  turn_budget: {
    max_output_tokens_per_turn: number;
    lead_dispatch_timeout_seconds: number;
    intent_parse_timeout_seconds: number;
  };
  routing_keywords: Record<PillarId, string[]>;
  routing_rules: {
    default_pillar: PillarId;
    allow_fanout: boolean;
    fanout_max_pillars: number;
    fallback_on_reject: 'surface_system_turn_no_retry';
  };
  model_strategy: {
    default_for_new_session: ModelStrategy;
    demo_override: ModelStrategy;
    modes: Record<
      ModelStrategy,
      {
        label_en: string;
        label_id: string;
        real_execution_on_hackathon: boolean;
        honest_claim_annotation: string | null;
      }
    >;
  };
  prediction_warning: {
    confidence_threshold: number;
    gamified_copy_variant: string;
  };
  world_aesthetic: {
    default: WorldAesthetic;
    supported: WorldAesthetic[];
  };
  locale: {
    default: Locale;
    supported: Locale[];
  };
}

// ---------- Error classes (contract Section 8) ---------------------------

export class AdvisorBrevityViolation extends Error {
  constructor(
    public readonly original: string,
    public readonly trimmed: string,
    public readonly reason: 'too_many_sentences' | 'too_many_questions' | 'both',
  ) {
    super(
      `Advisor brevity violation (${reason}). Original length ${original.length}, trimmed length ${trimmed.length}.`,
    );
    this.name = 'AdvisorBrevityViolation';
  }
}

export class UnknownPillarError extends Error {
  constructor(public readonly pillar: string) {
    super(`Unknown pillar: ${pillar}`);
    this.name = 'UnknownPillarError';
  }
}

export class UnsupportedLocaleError extends Error {
  constructor(public readonly locale: string) {
    super(`Unsupported locale: ${locale}`);
    this.name = 'UnsupportedLocaleError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly session_id: string) {
    super(`Advisor session not found: ${session_id}`);
    this.name = 'SessionNotFoundError';
  }
}

// ---------- Brevity enforcement helpers (NarasiGhaisan Section 13) -------

const SENTENCE_PATTERN = /[^.!?]+[.!?]+/g;

export function countSentences(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  const matches = trimmed.match(SENTENCE_PATTERN);
  if (!matches) return 1;
  return matches.length;
}

export function countQuestionMarks(s: string): number {
  const matches = s.match(/\?/g);
  return matches ? matches.length : 0;
}

export interface BrevityResult {
  content: string;
  violated: boolean;
  reason: 'too_many_sentences' | 'too_many_questions' | 'both' | null;
  question_count: number;
  sentence_count: number;
}

export function enforceAdvisorBrevity(
  raw: string,
  maxSentences: number,
  maxQuestions: number,
): BrevityResult {
  let next = raw.trim();
  let tooManySentences = false;
  let tooManyQuestions = false;

  const sCount = countSentences(next);
  if (sCount > maxSentences) {
    const sentences = next.match(SENTENCE_PATTERN);
    if (sentences && sentences.length > 0) {
      next = sentences
        .slice(0, maxSentences)
        .map((s) => s.trim())
        .join(' ')
        .trim();
    }
    tooManySentences = true;
  }

  let qCount = countQuestionMarks(next);
  if (qCount > maxQuestions) {
    let found = 0;
    let endIdx = next.length;
    for (let i = 0; i < next.length; i++) {
      if (next[i] === '?') {
        found += 1;
        if (found === maxQuestions) {
          endIdx = i + 1;
          break;
        }
      }
    }
    next = next.slice(0, endIdx).trim();
    tooManyQuestions = true;
    qCount = countQuestionMarks(next);
  }

  const violated = tooManySentences || tooManyQuestions;
  const reason: BrevityResult['reason'] = !violated
    ? null
    : tooManySentences && tooManyQuestions
      ? 'both'
      : tooManySentences
        ? 'too_many_sentences'
        : 'too_many_questions';

  return {
    content: next,
    violated,
    reason,
    question_count: qCount,
    sentence_count: countSentences(next),
  };
}

// ---------- In-memory SessionStore ---------------------------------------

export interface SessionStore {
  create(session: AdvisorSession): void;
  get(session_id: string): AdvisorSession | undefined;
  appendTurn(session_id: string, turn: AdvisorTurn): AdvisorSession;
  patch(session_id: string, patch: Partial<AdvisorSession>): AdvisorSession;
}

export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, AdvisorSession>();

  create(session: AdvisorSession): void {
    this.map.set(session.session_id, session);
  }

  get(session_id: string): AdvisorSession | undefined {
    return this.map.get(session_id);
  }

  appendTurn(session_id: string, turn: AdvisorTurn): AdvisorSession {
    const session = this.map.get(session_id);
    if (!session) throw new SessionNotFoundError(session_id);
    const next: AdvisorSession = {
      ...session,
      turns: [...session.turns, turn],
    };
    this.map.set(session_id, next);
    return next;
  }

  patch(session_id: string, patch: Partial<AdvisorSession>): AdvisorSession {
    const session = this.map.get(session_id);
    if (!session) throw new SessionNotFoundError(session_id);
    const next: AdvisorSession = { ...session, ...patch };
    this.map.set(session_id, next);
    return next;
  }
}

// ---------- Default keyword intent parser --------------------------------
// Cost-sensitive per NarasiGhaisan Section 4 (Tokopedia-tier awareness): we
// skip an extra Opus call per turn by using a keyword heuristic for
// pillar routing. Opus remains in the loop for the reply generation itself.
// Post-hackathon, a richer parser can be injected without touching callers.

export function makeKeywordIntentParser(
  config: ApolloConfig,
): UserIntentParser {
  return async (text, session) => {
    const lower = text.toLowerCase();
    const extracted: UserIntent['extracted'] = {};
    const sessionLocale = session.locale;
    if (lower.includes('indonesia') || lower.includes('bahasa')) {
      extracted.target_locale = 'id-ID';
    } else if (lower.includes('english')) {
      extracted.target_locale = 'en-US';
    } else {
      extracted.target_locale = sessionLocale;
    }

    const constraints: string[] = [];
    if (lower.includes('cheap') || lower.includes('murah')) {
      constraints.push('budget_cheap_tier');
    }
    if (lower.includes('premium') || lower.includes('opus')) {
      constraints.push('budget_premium_tier');
    }
    if (lower.includes('stripe')) {
      constraints.push('stripe_mock_only');
    }
    if (lower.includes('mobile')) {
      constraints.push('mobile_target');
    }
    if (constraints.length > 0) extracted.constraints = constraints;

    if (lower.includes('reading') || lower.includes('baca')) {
      extracted.app_type = 'smart_reading_saas';
    } else if (lower.includes('restaurant') || lower.includes('resto')) {
      extracted.app_type = 'restaurant_automation';
    } else if (lower.includes('landing')) {
      extracted.app_type = 'landing_page';
    }

    const looksAmbiguous =
      text.trim().length < 8 ||
      (text.split(/\s+/).length < 3 && !extracted.app_type);

    return {
      raw_text: text,
      extracted,
      requires_clarification: looksAmbiguous,
      clarification_question: looksAmbiguous
        ? 'Lu mau aplikasi tipe apa?'
        : undefined,
    };
  };
}

function matchPillar(
  text: string,
  config: ApolloConfig,
): { primary: PillarId; secondaries: PillarId[] } {
  const lower = text.toLowerCase();
  const scores: Array<{ pillar: PillarId; score: number }> = [];
  for (const key of Object.keys(config.routing_keywords) as PillarId[]) {
    const kws = config.routing_keywords[key];
    let score = 0;
    for (const kw of kws) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    scores.push({ pillar: key, score });
  }
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const primary =
    top && top.score > 0 ? top.pillar : config.routing_rules.default_pillar;
  const secondaries: PillarId[] = [];
  if (config.routing_rules.allow_fanout) {
    for (let i = 1; i < scores.length; i += 1) {
      const entry = scores[i];
      if (!entry || entry.score === 0) break;
      if (secondaries.length >= config.routing_rules.fanout_max_pillars - 1) {
        break;
      }
      if (entry.pillar !== primary) secondaries.push(entry.pillar);
    }
  }
  return { primary, secondaries };
}

// ---------- ID helpers ----------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

// ---------- Public AdvisorAgent interface --------------------------------
// Contract Section 4. Method signatures match exactly.

export interface IAdvisorAgent {
  startSession(init: {
    locale: Locale;
    default_strategy?: ModelStrategy;
  }): Promise<AdvisorSession>;
  receiveUserTurn(session_id: string, content: string): Promise<AdvisorTurn>;
  dispatchToLead(
    session_id: string,
    pillar: PillarId,
    structured_params: Record<string, unknown>,
  ): Promise<void>;
  renderPredictionMap(
    session_id: string,
    confidence_map: Record<string, number>,
  ): Promise<AdvisorTurn>;
  presentBlueprintMoment(
    session_id: string,
    moment_id: string,
  ): Promise<AdvisorTurn>;
  toggleLocale(session_id: string, next_locale: Locale): Promise<void>;
  toggleModelStrategy(
    session_id: string,
    next_strategy: ModelStrategy,
  ): Promise<void>;
}

// ---------- AdvisorAgent implementation ----------------------------------

export interface AdvisorAgentDeps {
  config: ApolloConfig;
  store: SessionStore;
  leadRegistry: PillarLeadRegistry;
  generator: AdvisorResponseGenerator;
  intentParser?: UserIntentParser;
  eventPublisher: AdvisorEventPublisher;
  handoffPublisher: PipelineHandoffPublisher;
  logger?: {
    warn: (msg: string, meta?: unknown) => void;
    info: (msg: string, meta?: unknown) => void;
  };
  clock?: () => string;
}

export class AdvisorAgent implements IAdvisorAgent {
  private readonly deps: Required<Omit<AdvisorAgentDeps, 'intentParser'>> & {
    intentParser: UserIntentParser;
  };

  constructor(deps: AdvisorAgentDeps) {
    this.deps = {
      config: deps.config,
      store: deps.store,
      leadRegistry: deps.leadRegistry,
      generator: deps.generator,
      intentParser:
        deps.intentParser ?? makeKeywordIntentParser(deps.config),
      eventPublisher: deps.eventPublisher,
      handoffPublisher: deps.handoffPublisher,
      logger: deps.logger ?? {
        warn: (m, meta) => console.warn(`[apollo] ${m}`, meta ?? ''),
        info: (m, meta) => console.info(`[apollo] ${m}`, meta ?? ''),
      },
      clock: deps.clock ?? nowIso,
    };
  }

  async startSession(init: {
    locale: Locale;
    default_strategy?: ModelStrategy;
  }): Promise<AdvisorSession> {
    this.assertLocaleSupported(init.locale);
    const session: AdvisorSession = {
      session_id: makeId('sess'),
      locale: init.locale,
      active_model_strategy:
        init.default_strategy ??
        this.deps.config.model_strategy.default_for_new_session,
      active_world_aesthetic: this.deps.config.world_aesthetic.default,
      turns: [],
    };
    this.deps.store.create(session);
    await this.publishAdvisorEvent(session.session_id, 'advisor.session.started', {
      session_id: session.session_id,
      locale: session.locale,
      active_model_strategy: session.active_model_strategy,
    });
    return session;
  }

  async receiveUserTurn(session_id: string, content: string): Promise<AdvisorTurn> {
    const session = this.requireSession(session_id);

    const userTurn: AdvisorTurn = {
      turn_id: makeId('turn'),
      role: 'user',
      content,
      question_count: countQuestionMarks(content),
      rendered_at: this.deps.clock(),
    };
    const afterUser = this.deps.store.appendTurn(session_id, userTurn);
    await this.publishAdvisorEvent(session_id, 'advisor.turn.appended', {
      session_id,
      turn: userTurn,
    });

    const intent = await this.deps.intentParser(content, afterUser);
    await this.publishAdvisorEvent(session_id, 'advisor.intent.parsed', {
      session_id,
      intent,
    });

    if (intent.requires_clarification) {
      return this.emitAdvisorTurn(session_id, 'clarification_question', {
        session: afterUser,
        variant: 'clarification_question',
        user_content: content,
        intent,
      });
    }

    const routing = matchPillar(content, this.deps.config);
    const pillars: PillarId[] = [routing.primary, ...routing.secondaries];
    const structuredSummary = this.buildIntentSummary(intent, content);
    const sessionWithSummary = this.deps.store.patch(session_id, {
      user_intent_summary: structuredSummary,
    });

    const dispatches = await Promise.all(
      pillars.map((pillar) =>
        this.dispatchInternal(sessionWithSummary, pillar, {
          intent,
          structured_params: this.paramsForPillar(pillar, intent),
        }).catch((err) => this.wrapDispatchError(pillar, err)),
      ),
    );

    return this.emitAdvisorTurn(session_id, 'user_reply', {
      session: this.deps.store.get(session_id) ?? sessionWithSummary,
      variant: 'user_reply',
      user_content: content,
      intent,
      lead_responses: dispatches,
    });
  }

  async dispatchToLead(
    session_id: string,
    pillar: PillarId,
    structured_params: Record<string, unknown>,
  ): Promise<void> {
    const session = this.requireSession(session_id);
    await this.dispatchInternal(session, pillar, {
      structured_params,
      intent: {
        raw_text: session.user_intent_summary ?? '',
        extracted: {},
        requires_clarification: false,
      },
    }).catch(async (err) => {
      this.deps.logger.warn('dispatchToLead failed', { pillar, err });
      await this.emitSystemRejectTurn(session_id, pillar, this.errorToSummary(err));
    });
  }

  async renderPredictionMap(
    session_id: string,
    confidence_map: Record<string, number>,
  ): Promise<AdvisorTurn> {
    const session = this.requireSession(session_id);
    const threshold = this.deps.config.prediction_warning.confidence_threshold;
    const lowEntries = Object.entries(confidence_map)
      .filter(([, score]) => Number.isFinite(score) && score < threshold)
      .sort(([, a], [, b]) => a - b);

    if (lowEntries.length === 0) {
      return this.emitAdvisorTurn(session_id, 'prediction_warning_render', {
        session,
        variant: 'prediction_warning_render',
        warning_gamified_message: 'Semua lantai aman so far.',
      });
    }

    const [specialistId, lowestScore] = lowEntries[0]!;
    const floorNumber = extractFloorNumber(specialistId);
    const gamifiedMessage = this.deps.config.prediction_warning
      .gamified_copy_variant === 'building_floor'
      ? `Blueprint scan alert, Floor ${floorNumber} ${lowestScore.toFixed(2)} confidence, revisi dulu?`
      : `Low confidence on ${specialistId} (${lowestScore.toFixed(2)}), want to revise?`;

    const warningId = makeId(`warn_${session_id}`);
    const turn = await this.emitAdvisorTurn(session_id, 'prediction_warning_render', {
      session,
      variant: 'prediction_warning_render',
      warning_gamified_message: gamifiedMessage,
    });
    const enriched: AdvisorTurn = {
      ...turn,
      attached_components: [
        ...(turn.attached_components ?? []),
        { kind: 'prediction_warning', warning_id: warningId },
      ],
    };
    this.deps.store.patch(session_id, {
      turns: [
        ...(this.deps.store.get(session_id)?.turns.slice(0, -1) ?? []),
        enriched,
      ],
    });
    return enriched;
  }

  async presentBlueprintMoment(
    session_id: string,
    moment_id: string,
  ): Promise<AdvisorTurn> {
    const session = this.requireSession(session_id);
    const turn = await this.emitAdvisorTurn(session_id, 'blueprint_present', {
      session,
      variant: 'blueprint_present',
      moment_id,
    });
    const enriched: AdvisorTurn = {
      ...turn,
      attached_components: [
        ...(turn.attached_components ?? []),
        { kind: 'blueprint_reveal', moment_id },
      ],
    };
    this.deps.store.patch(session_id, {
      turns: [
        ...(this.deps.store.get(session_id)?.turns.slice(0, -1) ?? []),
        enriched,
      ],
    });
    await this.publishAdvisorEvent(session_id, 'advisor.moment.presented', {
      session_id,
      moment_id,
    });
    return enriched;
  }

  async toggleLocale(session_id: string, next_locale: Locale): Promise<void> {
    this.assertLocaleSupported(next_locale);
    const session = this.requireSession(session_id);
    const previous = session.locale;
    if (previous === next_locale) return;
    this.deps.store.patch(session_id, { locale: next_locale });
    await this.publishAdvisorEvent(session_id, 'advisor.locale.changed', {
      session_id,
      previous,
      next: next_locale,
    });
  }

  async toggleModelStrategy(
    session_id: string,
    next_strategy: ModelStrategy,
  ): Promise<void> {
    const session = this.requireSession(session_id);
    const previous = session.active_model_strategy;
    if (previous === next_strategy) return;
    this.deps.store.patch(session_id, { active_model_strategy: next_strategy });
    await this.publishAdvisorEvent(session_id, 'advisor.strategy.changed', {
      session_id,
      previous,
      next: next_strategy,
    });
  }

  // -------- internals --------

  private requireSession(session_id: string): AdvisorSession {
    const session = this.deps.store.get(session_id);
    if (!session) throw new SessionNotFoundError(session_id);
    return session;
  }

  private assertLocaleSupported(locale: Locale): void {
    if (!this.deps.config.locale.supported.includes(locale)) {
      throw new UnsupportedLocaleError(locale);
    }
  }

  private async publishAdvisorEvent<T>(
    session_id: string,
    topic: AdvisorEventTopic,
    payload: T,
  ): Promise<void> {
    const event: AdvisorEvent<T> = {
      event_id: makeId('ev'),
      topic,
      session_id,
      occurred_at: this.deps.clock(),
      source_agent: 'apollo',
      payload,
    };
    await this.deps.eventPublisher.publish(event);
  }

  private async emitAdvisorTurn(
    session_id: string,
    _trace: PromptVariant,
    ctx: AdvisorGenerationContext,
  ): Promise<AdvisorTurn> {
    const raw = await this.deps.generator(ctx);
    const result = enforceAdvisorBrevity(
      raw,
      this.deps.config.brevity.max_sentences_per_advisor_turn,
      this.deps.config.brevity.max_questions_per_advisor_turn,
    );
    if (result.violated && this.deps.config.brevity.auto_rewrite_on_violation) {
      const violation = new AdvisorBrevityViolation(
        raw,
        result.content,
        result.reason!,
      );
      this.deps.logger.warn('advisor brevity rewrite', {
        session_id,
        reason: violation.reason,
      });
    }
    const turn: AdvisorTurn = {
      turn_id: makeId('turn'),
      role: 'advisor',
      content: result.content,
      question_count: result.question_count,
      rendered_at: this.deps.clock(),
    };
    this.deps.store.appendTurn(session_id, turn);
    await this.publishAdvisorEvent(session_id, 'advisor.turn.appended', {
      session_id,
      turn,
    });
    return turn;
  }

  private async emitSystemRejectTurn(
    session_id: string,
    pillar: PillarId,
    summary: string,
  ): Promise<AdvisorTurn> {
    const raw = await this.deps.generator({
      session: this.requireSession(session_id),
      variant: 'lead_reject_summary',
      rejection_summary: summary,
    });
    const result = enforceAdvisorBrevity(
      raw,
      2,
      this.deps.config.brevity.max_questions_per_advisor_turn,
    );
    const turn: AdvisorTurn = {
      turn_id: makeId('turn'),
      role: 'system',
      content: result.content,
      question_count: result.question_count,
      rendered_at: this.deps.clock(),
    };
    this.deps.store.appendTurn(session_id, turn);
    await this.publishAdvisorEvent(session_id, 'advisor.turn.appended', {
      session_id,
      turn,
    });
    this.deps.logger.info('lead rejected, surfaced system turn', {
      pillar,
      summary,
    });
    return turn;
  }

  private async dispatchInternal(
    session: AdvisorSession,
    pillar: PillarId,
    input: {
      intent: UserIntent;
      structured_params: Record<string, unknown>;
    },
  ): Promise<PillarHandoffResponse> {
    const lead = this.deps.leadRegistry.get(pillar);
    if (!lead) {
      throw new UnknownPillarError(pillar);
    }
    const request_id = makeId('req');
    const pipeline_run_id =
      session.active_pipeline_run_id ?? makeId(`run_${pillar}`);
    const request: PillarHandoffRequest = {
      request_id,
      pipeline_run_id,
      pillar,
      user_intent_summary:
        session.user_intent_summary ?? input.intent.raw_text.slice(0, 500),
      structured_params: input.structured_params,
      upstream_context: {
        prior_lead_outputs: [],
        active_model_strategy: session.active_model_strategy,
        active_world_aesthetic: session.active_world_aesthetic,
      },
    };
    await this.deps.handoffPublisher.publishHandoff({
      pipeline_run_id,
      from_specialist: 'apollo',
      to_specialist: pillar,
      artifact_paths: [],
      request_id,
      status: 'dispatching',
    });
    const response = await this.withTimeout(
      lead.handle(request),
      this.deps.config.turn_budget.lead_dispatch_timeout_seconds * 1000,
      pillar,
    );
    await this.deps.handoffPublisher.publishHandoff({
      pipeline_run_id,
      from_specialist: 'apollo',
      to_specialist: pillar,
      artifact_paths: response.artifact_paths,
      request_id,
      status: response.status,
    });
    if (response.status === 'rejected') {
      const reason =
        response.rejection_reason ?? 'lead_rejected_without_reason';
      await this.emitSystemRejectTurn(session.session_id, pillar, reason);
    }
    return response;
  }

  private paramsForPillar(
    pillar: PillarId,
    intent: UserIntent,
  ): Record<string, unknown> {
    const common: Record<string, unknown> = {
      raw_text: intent.raw_text,
      extracted: intent.extracted,
    };
    switch (pillar) {
      case 'builder':
        return {
          ...common,
          app_type: intent.extracted.app_type ?? 'unspecified',
          target_locale:
            intent.extracted.target_locale ?? this.deps.config.locale.default,
          pricing_tier_hint: this.deriveTierHint(intent),
        };
      case 'marketplace':
        return {
          ...common,
          action: this.deriveMarketplaceAction(intent.raw_text),
        };
      case 'banking':
        return { ...common, tier_hint: this.deriveTierHint(intent) };
      case 'registry':
        return { ...common };
      case 'protocol':
        return { ...common };
      default:
        return common;
    }
  }

  private deriveTierHint(intent: UserIntent): string | undefined {
    const constraints = intent.extracted.constraints ?? [];
    if (constraints.includes('budget_premium_tier')) return 'premium';
    if (constraints.includes('budget_cheap_tier')) return 'cheap';
    return undefined;
  }

  private deriveMarketplaceAction(text: string): 'browse' | 'list' | 'submit' {
    const lower = text.toLowerCase();
    if (lower.includes('jual') || lower.includes('submit') || lower.includes('sell')) {
      return 'submit';
    }
    if (lower.includes('listing') || lower.includes('list')) return 'list';
    return 'browse';
  }

  private buildIntentSummary(intent: UserIntent, raw: string): string {
    const parts = [intent.extracted.app_type, intent.extracted.target_locale]
      .filter(Boolean)
      .join(' | ');
    const truncated = raw.length > 400 ? `${raw.slice(0, 400)}...` : raw;
    return parts.length > 0 ? `${parts} :: ${truncated}` : truncated;
  }

  private async withTimeout<T>(
    p: Promise<T>,
    ms: number,
    pillar: PillarId,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Lead dispatch timeout: ${pillar} did not respond within ${ms}ms`,
          ),
        );
      }, ms);
    });
    try {
      const result = await Promise.race([p, timeoutPromise]);
      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private wrapDispatchError(
    pillar: PillarId,
    err: unknown,
  ): PillarHandoffResponse {
    this.deps.logger.warn('lead handle threw, wrapping as rejected', {
      pillar,
      err,
    });
    return {
      request_id: makeId('req_err'),
      pillar,
      status: 'rejected',
      summary: this.errorToSummary(err),
      artifact_paths: [],
      delegated_to_specialists: [],
      rejection_reason:
        err instanceof Error ? err.message : 'internal_error',
    };
  }

  private errorToSummary(err: unknown): string {
    if (err instanceof Error) return err.message.slice(0, 200);
    return String(err).slice(0, 200);
  }
}

// ---------- Helper: extract floor number from specialist id -------------
// Used by the default gamified warning copy variant. Example mapping:
//   lumio_ui_builder           -> floor 3 (ui_builder is step index 3)
//   lumio_integration_engineer -> floor 8
// If the id does not match a known mapping, returns the id as-is in "Floor X"
// position; upstream callers may swap in a different copy variant.

const LUMIO_ROLE_TO_FLOOR: Record<string, number> = {
  strategist: 0,
  architect: 1,
  db_schema_builder: 2,
  ui_builder: 3,
  api_builder: 4,
  copywriter: 5,
  asset_designer: 6,
  qa_reviewer: 7,
  integration_engineer: 8,
  deployer: 9,
};

function extractFloorNumber(specialistId: string): string | number {
  for (const role of Object.keys(LUMIO_ROLE_TO_FLOOR)) {
    if (specialistId.includes(role)) return LUMIO_ROLE_TO_FLOOR[role]!;
  }
  const match = specialistId.match(/(\d+)/);
  if (match) return match[1]!;
  return specialistId;
}

// ---------- Simple registry implementation for convenience --------------
// Post-hackathon this moves to app/shared/orchestration/PillarLeadRegistry.ts.

export class InMemoryPillarLeadRegistry implements PillarLeadRegistry {
  private readonly map = new Map<PillarId, PillarLead>();

  register(lead: PillarLead): void {
    this.map.set(lead.pillar, lead);
  }

  get(pillar: PillarId): PillarLead | undefined {
    return this.map.get(pillar);
  }

  list(): PillarLead[] {
    return Array.from(this.map.values());
  }
}

// ---------- Default config loader helper --------------------------------
// Reads the companion apollo.config.json at runtime. Kept as a thin factory
// so callers can inject their own config (for tests or overrides) without
// file IO.

export function buildDefaultGenerator(
  fallback: string = 'Roger, gw forward ke pillar yang relevan.',
): AdvisorResponseGenerator {
  return async (ctx) => {
    switch (ctx.variant) {
      case 'user_reply': {
        const hitPillars = (ctx.lead_responses ?? [])
          .filter((r) => r.status === 'accepted')
          .map((r) => r.pillar)
          .join(', ');
        if (hitPillars.length > 0) {
          return `Gw dispatch ke ${hitPillars}. Artifacts muncul bentar, sambil nunggu lu mau ubah scope ga?`;
        }
        return fallback;
      }
      case 'clarification_question':
        return ctx.intent?.clarification_question ?? 'Lu mau aplikasi tipe apa?';
      case 'prediction_warning_render':
        return ctx.warning_gamified_message ?? fallback;
      case 'blueprint_present':
        return 'Zoom out bentar, ini peta 22-agent yang barusan bangun aplikasi lu. Siap?';
      case 'lead_reject_summary':
        return `Pillar lagi sibuk: ${ctx.rejection_summary ?? 'no detail'}. Gw hold dulu.`;
      case 'dispatch_confirm':
        return 'Ok, forward ke pillar pilihan. Tunggu bentar.';
      default:
        return fallback;
    }
  };
}
