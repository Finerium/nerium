//
// src/lib/sekuri/index.ts
//
// Sekuri integration entry point. Re-exports the deterministic complexity
// classifier, the existing Sekuri template loader (originally authored at
// src/lib/sekuriTemplate.ts during Wave A), and the Phanes-side skill
// package generator. Co-locates the public surface so callers import from
// a single path: `import { classifyPrompt, loadSekuriTemplate, generateSkillPackage } from '../lib/sekuri'`.
//
// Sekuri is theatrical-only at hackathon scope per V6 directive: no live
// MA invocation, no live Opus call, the classifier is deterministic regex,
// the template is pre-canned, and the skill package is a downloadable
// JSON manifest plus individual SKILL.md/metadata.json file blobs. The
// honest-claim caption "Demo flow uses pre-canned templates. Live runtime
// reactivates post-launch." MUST render anywhere a Sekuri template is
// surfaced to a user.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

export { classifyPrompt, type SekuriClassification } from './classifier';
export {
  generateSkillPackage,
  type SkillPackageInput,
  type SkillPackageOutput,
  type SkillPackageFile,
} from './skillPackageGenerator';
export {
  loadSekuriTemplate,
  totalEstimatedCostUsd,
  clearSekuriTemplateCache,
  type SekuriTemplate,
  type SekuriComplexity,
  type SekuriClaudeExecutionMode,
} from '../sekuriTemplate';

export const SEKURI_HONEST_CLAIM_CAPTION =
  'Demo flow uses pre-canned templates. Live runtime reactivates post-launch.';
