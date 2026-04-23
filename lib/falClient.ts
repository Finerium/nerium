//
// lib/falClient.ts
//
// DORMANT fal.ai Nano Banana 2 client wrapper.
//
// Authored by: Talos (RV W1 Sub-Phase 1 carry-over completed in W2 Sub-Phase 2).
// Status: NOT IMPORTED ANYWHERE in production code paths. See `docs/adr/ADR-override-antipattern-7.md`
//         and `_meta/RV_PLAN.md` RV.14 for the full rationale.
//
// This module is committed as reserved infrastructure for post-hackathon fal.ai reactivation.
// The NERIUM RV shipped build ships with CC0 (Kenney plus OpenGameArt Warped City plus Oak Woods
// brullov) plus Opus procedural SVG and Canvas gap-fill only. Zero fal.ai invocations are made
// in any code path that reaches the shipped Phaser 3 runtime, the React HUD, the landing page,
// or the leaderboard. Ghaisan personal fund USD 0 constraint makes this non-negotiable per RV.14.
//
// Activation gate (POST-HACKATHON ONLY):
//   1. Superseding ADR that rescinds ADR-override-antipattern-7 via a fresh CLAUDE.md entry.
//   2. `FAL_KEY` environment variable set.
//   3. Explicit import of this module from at least one production call site.
//   4. Budget allocation documented in the superseding ADR.
//
// No test covers this module. That is intentional: we do not validate infrastructure that we
// are committing not to run. If tests appear here in the future, the activation gate above
// should also have fired.
//
// Contract surface (matches `_skills_staging/vibe-isometric-sprites` reference pipeline):
//   - `generate`: single text-to-image via fal-ai/nano-banana-2
//   - `edit`: image-to-image via fal-ai/nano-banana-2/edit (up to 14 reference images)
//   - `queueSubmit`: fire-and-forget queue with optional webhook
//
// Consumers (dormant, not instantiated):
//   - `.claude/skills/fal-nano-banana-sprite/SKILL.md` agent-side workflow
//   - Future `Calliope` prompt-authoring specialist if the fal lane ever re-opens
//

export type NanoBananaResolution = '0.5K' | '1K' | '2K' | '4K';
export type NanoBananaThinking = 'low' | 'medium' | 'high';
export type NanoBananaAspect = '1:1' | '3:4' | '4:3' | '16:9' | '9:16' | '4:1' | '1:4' | '8:1' | '1:8';
export type NanoBananaOutputFormat = 'jpeg' | 'png' | 'webp';

export interface GenerateInput {
  prompt: string;
  num_images?: number;
  seed?: number;
  aspect_ratio?: NanoBananaAspect;
  output_format?: NanoBananaOutputFormat;
  resolution?: NanoBananaResolution;
  enable_web_search?: boolean;
  thinking_level?: NanoBananaThinking;
  limit_generations?: boolean;
  safety_tolerance?: 'strict' | 'medium' | 'permissive';
}

export interface EditInput extends GenerateInput {
  image_urls: string[];
}

export interface GenerateOutput {
  images: Array<{ url: string; content_type: string; width: number; height: number }>;
  seed: number;
  request_id: string;
}

export interface FalClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const DORMANT_ERROR =
  'lib/falClient is dormant in the RV shipped build. See docs/adr/ADR-override-antipattern-7.md and _meta/RV_PLAN.md RV.14 before invoking. Activation requires a superseding ADR.';

export class FalClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: FalClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY;
    this.baseUrl = opts.baseUrl ?? 'https://fal.run';
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async generate(_input: GenerateInput): Promise<GenerateOutput> {
    throw new Error(DORMANT_ERROR);
  }

  async edit(_input: EditInput): Promise<GenerateOutput> {
    throw new Error(DORMANT_ERROR);
  }

  async queueSubmit(_input: GenerateInput, _webhookUrl?: string): Promise<{ request_id: string }> {
    throw new Error(DORMANT_ERROR);
  }
}

export function createFalClient(opts: FalClientOptions = {}): FalClient {
  return new FalClient(opts);
}
