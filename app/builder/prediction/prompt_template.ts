//
// prompt_template.ts
//
// Conforms to: docs/contracts/prediction_layer_surface.contract.md v0.1.0
// Author agent: Cassandra (Sonnet 4.6 runtime, Opus 4.7 authoring session)
//
// Sonnet 4.6 prompt templates for a single simulation pass. Designed to stay
// under 500 input tokens per pass and 100 output tokens per pass to hit the
// Prediction Layer runtime budget target of approximately USD 0.15 per
// 100-pass pre-execution scan on the Lumio topology.
//
// Budget math (cross-check with docs/cassandra.decisions.md ADR-002):
// System prompt is prompt-cached and amortizes; per-pass marginal cost is
// mostly the short user turn. At Sonnet 4.6 list price (3 USD per M input,
// 15 USD per M output):
//   100 passes * 300 input tokens = 30K input tokens = 0.09 USD
//   100 passes * 60 output tokens  =  6K output tokens = 0.09 USD
// Total approximately 0.18 USD per 100-pass scan, within 0.20 USD ceiling.
//
// Per NarasiGhaisan Section 13 (brevity discipline), prompt avoids narrative
// framing and drives the model to return JSON only.
//

// ---------- Perspective rotation ----------
//
// To produce variance across 100 passes without stochastic temperature, each
// pass adopts one of 5 perspectives. 20 passes per perspective gives the
// aggregation a stable population mean with a realistic stddev.

export type SimulationPerspective =
  | 'input_quality'
  | 'role_competence'
  | 'budget_tension'
  | 'downstream_coupling'
  | 'context_completeness';

export const SIMULATION_PERSPECTIVES: ReadonlyArray<SimulationPerspective> = [
  'input_quality',
  'role_competence',
  'budget_tension',
  'downstream_coupling',
  'context_completeness',
];

const PERSPECTIVE_GUIDANCE: Record<SimulationPerspective, string> = {
  input_quality:
    'Judge whether upstream artifacts are sufficient and well-formed for this specialist to produce consistent output.',
  role_competence:
    'Judge whether the preferred model and role complexity match; flag mismatch between role difficulty and model tier.',
  budget_tension:
    'Judge whether the token and wallclock budget is adequate for the declared output artifact count at this role.',
  downstream_coupling:
    'Judge whether tight downstream dependencies raise the cost of any output drift from expected shape.',
  context_completeness:
    'Judge whether the context window will carry all relevant upstream decisions to this specialist without loss.',
};

// ---------- System prompt (prompt-cached) ----------

export const CASSANDRA_SYSTEM_PROMPT = `You are the NERIUM Builder Prediction Layer confidence estimator. Given a specialist role, its topology context, and a perspective angle, estimate the probability (0.0 to 1.0) that this specialist's output will satisfy all downstream expectations without revision.

Rules:
1. Respond with valid JSON only. No prose, no markdown, no commentary.
2. JSON shape: {"confidence": number, "reasoning": string}
3. "confidence" is a float in [0.0, 1.0], two decimals.
4. "reasoning" is one sentence under 20 words.
5. Use the supplied perspective angle to scope your judgment.
6. High confidence (>=0.8) is reserved for unambiguous topology fit. Default new specialists to medium (0.6 to 0.8) absent strong evidence.`;

// ---------- User turn builder ----------

export interface SimulationPassPromptInput {
  readonly pass_number: number;
  readonly total_passes: number;
  readonly perspective: SimulationPerspective;
  readonly specialist_id: string;
  readonly role: string;
  readonly step_index: number;
  readonly preferred_model: string;
  readonly preferred_lane: string;
  readonly budget_tokens: number;
  readonly budget_wallclock_seconds: number;
  readonly input_artifact_count: number;
  readonly output_artifact_count: number;
  readonly downstream_consumer_count: number;
  readonly upstream_actual_output_summary?: string; // set on re-simulation
}

export function buildSimulationPassUserPrompt(
  input: SimulationPassPromptInput,
): string {
  const lines: string[] = [];
  lines.push('<specialist>');
  lines.push(`  <id>${escapeXml(input.specialist_id)}</id>`);
  lines.push(`  <role>${escapeXml(input.role)}</role>`);
  lines.push(`  <step_index>${input.step_index}</step_index>`);
  lines.push(`  <preferred_model>${escapeXml(input.preferred_model)}</preferred_model>`);
  lines.push(`  <preferred_lane>${escapeXml(input.preferred_lane)}</preferred_lane>`);
  lines.push(`  <budget_tokens>${input.budget_tokens}</budget_tokens>`);
  lines.push(
    `  <budget_wallclock_seconds>${input.budget_wallclock_seconds}</budget_wallclock_seconds>`,
  );
  lines.push(`  <input_artifact_count>${input.input_artifact_count}</input_artifact_count>`);
  lines.push(`  <output_artifact_count>${input.output_artifact_count}</output_artifact_count>`);
  lines.push(
    `  <downstream_consumer_count>${input.downstream_consumer_count}</downstream_consumer_count>`,
  );
  lines.push('</specialist>');

  lines.push('<pass_context>');
  lines.push(`  <pass_number>${input.pass_number}</pass_number>`);
  lines.push(`  <total_passes>${input.total_passes}</total_passes>`);
  lines.push(`  <perspective>${input.perspective}</perspective>`);
  lines.push(
    `  <perspective_guidance>${escapeXml(PERSPECTIVE_GUIDANCE[input.perspective])}</perspective_guidance>`,
  );
  lines.push('</pass_context>');

  if (input.upstream_actual_output_summary) {
    lines.push('<upstream_actual>');
    lines.push(
      `  <summary>${escapeXml(input.upstream_actual_output_summary.slice(0, 400))}</summary>`,
    );
    lines.push('</upstream_actual>');
  }

  lines.push('');
  lines.push('Respond with JSON only.');
  return lines.join('\n');
}

// ---------- XML escaping ----------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------- Response parser ----------

export interface SimulationPassResponse {
  readonly confidence: number; // 0.0 to 1.0
  readonly reasoning: string;
}

export class SimulationResponseParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'SimulationResponseParseError';
  }
}

export function parseSimulationPassResponse(raw: string): SimulationPassResponse {
  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      throw new SimulationResponseParseError('Response is not JSON', raw);
    }
    try {
      parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      throw new SimulationResponseParseError('Response JSON slice invalid', raw);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new SimulationResponseParseError('Response not a JSON object', raw);
  }
  const obj = parsed as Record<string, unknown>;
  const confidence_raw = obj.confidence;
  const reasoning_raw = obj.reasoning;
  if (typeof confidence_raw !== 'number' || !Number.isFinite(confidence_raw)) {
    throw new SimulationResponseParseError('confidence is not a finite number', raw);
  }
  if (typeof reasoning_raw !== 'string') {
    throw new SimulationResponseParseError('reasoning is not a string', raw);
  }
  const clamped = confidence_raw < 0 ? 0 : confidence_raw > 1 ? 1 : confidence_raw;
  return {
    confidence: clamped,
    reasoning: reasoning_raw,
  };
}
