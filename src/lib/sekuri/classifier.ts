//
// src/lib/sekuri/classifier.ts
//
// Deterministic complexity classifier. Pure function, no I/O, no async.
// Maps a free-form user prompt string to one of three Sekuri tiers
// {small, medium, large} via regex heuristic + keyword scoring.
//
// Heuristics derived from `public/sekuri/builder_templates/{tier}.json`
// `sample_prompts_matched` arrays plus general capability keyword bands:
//
//   small  : single feature, single page, no auth, no billing, no DB
//            (landing page, todo, calculator, widget, simple form)
//   medium : multi-page, auth, basic billing, single deploy
//            (SaaS dashboard, blog platform, admin panel, team)
//   large  : marketplace, multi-tenant, multi-vendor, real-time, banking
//            (Tokopedia-tier, escrow, AML, multi-vendor, IDE)
//
// Tie-break: when scores tie or no match, default tier is `medium` per
// V6 spec ("Default medium if ambiguous").
//
// No em dash, no emoji.
//

import type { SekuriComplexity } from '../sekuriTemplate';

export interface SekuriClassification {
  tier: SekuriComplexity;
  confidence: number; // 0..1
  matches: {
    small: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
    large: ReadonlyArray<string>;
  };
  rationale: string;
}

interface PatternBundle {
  tier: SekuriComplexity;
  patterns: ReadonlyArray<{
    label: string;
    re: RegExp;
    weight: number;
  }>;
}

const LARGE_PATTERNS: PatternBundle = {
  tier: 'large',
  patterns: [
    { label: 'marketplace', re: /\bmarket\s*place\b/i, weight: 3 },
    { label: 'multi-tenant', re: /\bmulti[\s-]?tenant\b/i, weight: 3 },
    { label: 'multi-vendor', re: /\bmulti[\s-]?vendor\b/i, weight: 3 },
    { label: 'multi-org', re: /\bmulti[\s-]?org(?:s|anization)?\b/i, weight: 2 },
    { label: 'tokopedia-tier', re: /\btokopedia/i, weight: 3 },
    { label: 'real-time', re: /\breal[\s-]?time\b/i, weight: 2 },
    { label: 'collaborative IDE', re: /\bcollaborat\w*\s+ide\b/i, weight: 3 },
    { label: 'banking', re: /\bbank(?:ing)?\b/i, weight: 2 },
    { label: 'aml-compliance', re: /\baml\b/i, weight: 2 },
    { label: 'compliance', re: /\bcompliance\b/i, weight: 1 },
    { label: 'escrow', re: /\bescrow\b/i, weight: 2 },
    { label: 'stripe connect', re: /\bstripe\s+connect\b/i, weight: 2 },
    { label: 'production-grade', re: /\bproduction[\s-]?grade\b/i, weight: 2 },
    { label: 'enterprise', re: /\benterprise\b/i, weight: 2 },
    { label: 'e-commerce platform', re: /\be[\s-]?commerce\b/i, weight: 2 },
    { label: 'agent marketplace', re: /\bagent\s+market\b/i, weight: 3 },
    { label: 'trust score', re: /\btrust\s+score\b/i, weight: 2 },
    { label: 'b2b platform', re: /\bb2b\s+platform\b/i, weight: 2 },
    { label: 'large-scale', re: /\blarge[\s-]?scale\b/i, weight: 2 },
  ],
};

const MEDIUM_PATTERNS: PatternBundle = {
  tier: 'medium',
  patterns: [
    { label: 'saas', re: /\bsaas\b/i, weight: 2 },
    { label: 'dashboard', re: /\bdashboard\b/i, weight: 2 },
    { label: 'auth', re: /\bauth(?:entication)?\b/i, weight: 2 },
    { label: 'login system', re: /\b(login|sign[\s-]?in)\s+(system|flow)\b/i, weight: 2 },
    { label: 'billing', re: /\bbilling\b/i, weight: 2 },
    { label: 'subscription', re: /\bsubscription\b/i, weight: 2 },
    { label: 'admin panel', re: /\badmin\s+(panel|dashboard|page)\b/i, weight: 2 },
    { label: 'cms', re: /\bcms\b/i, weight: 1 },
    { label: 'blog platform', re: /\bblog\s+platform\b/i, weight: 2 },
    { label: 'team collaboration', re: /\bteam\s+collaboration\b/i, weight: 2 },
    { label: 'newsletter platform', re: /\bnewsletter\s+platform\b/i, weight: 2 },
    { label: 'multi-page', re: /\bmulti[\s-]?page\b/i, weight: 2 },
    { label: 'task management app', re: /\btask\s+management\s+app\b/i, weight: 2 },
    { label: 'portfolio with admin', re: /\bportfolio\b.*\badmin\b/i, weight: 2 },
    { label: 'mid-tier', re: /\bmid[\s-]?tier\b/i, weight: 2 },
    { label: 'stripe (basic)', re: /\bstripe\b/i, weight: 1 },
    { label: 'database', re: /\b(database|db|postgres|mysql|sqlite)\b/i, weight: 1 },
    { label: 'email integration', re: /\bemail\s+integration\b/i, weight: 1 },
  ],
};

const SMALL_PATTERNS: PatternBundle = {
  tier: 'small',
  patterns: [
    { label: 'landing page', re: /\blanding\s+page\b/i, weight: 3 },
    { label: 'signup form', re: /\bsignup\s+form\b/i, weight: 2 },
    { label: 'todo app', re: /\btodo\s+app\b/i, weight: 3 },
    { label: 'calculator', re: /\bcalculator\b/i, weight: 2 },
    { label: 'weather widget', re: /\bweather\s+widget\b/i, weight: 3 },
    { label: 'contact form', re: /\bcontact\s+form\b/i, weight: 2 },
    { label: 'simple form', re: /\bsimple\s+(form|page|widget)\b/i, weight: 2 },
    { label: 'single-page', re: /\bsingle[\s-]?page\b/i, weight: 2 },
    { label: 'single feature', re: /\bsingle\s+feature\b/i, weight: 2 },
    { label: 'static site', re: /\bstatic\s+site\b/i, weight: 2 },
    { label: 'widget', re: /\bwidget\b/i, weight: 1 },
    { label: 'local storage', re: /\blocal\s*storage\b/i, weight: 1 },
    { label: 'simple', re: /\bsimple\b/i, weight: 1 },
    { label: 'one-page', re: /\bone[\s-]?page\b/i, weight: 2 },
  ],
};

const BUNDLES: ReadonlyArray<PatternBundle> = [
  LARGE_PATTERNS,
  MEDIUM_PATTERNS,
  SMALL_PATTERNS,
];

export function classifyPrompt(promptText: string): SekuriClassification {
  const text = (promptText ?? '').toString().trim();
  if (text.length === 0) {
    return {
      tier: 'medium',
      confidence: 0,
      matches: { small: [], medium: [], large: [] },
      rationale: 'empty prompt; defaulted to medium tier',
    };
  }

  const matches = {
    small: [] as string[],
    medium: [] as string[],
    large: [] as string[],
  };
  const scores: Record<SekuriComplexity, number> = {
    small: 0,
    medium: 0,
    large: 0,
  };

  for (const bundle of BUNDLES) {
    for (const p of bundle.patterns) {
      if (p.re.test(text)) {
        matches[bundle.tier].push(p.label);
        scores[bundle.tier] += p.weight;
      }
    }
  }

  const totalScore = scores.small + scores.medium + scores.large;
  if (totalScore === 0) {
    return {
      tier: 'medium',
      confidence: 0,
      matches,
      rationale:
        'no heuristic patterns matched; defaulted to medium tier per Sekuri spec',
    };
  }

  // Resolve tier with priority: large beats medium beats small when scores tie.
  // This mirrors V6 spec safety bias: if a prompt mentions "marketplace" plus
  // "auth" plus "form", we route to large because large includes the medium
  // and small surface area as a strict superset.
  let chosen: SekuriComplexity = 'medium';
  let chosenScore = scores.medium;
  if (scores.large > 0 && scores.large >= scores.medium && scores.large >= scores.small) {
    chosen = 'large';
    chosenScore = scores.large;
  } else if (scores.medium >= scores.small && scores.medium > 0) {
    chosen = 'medium';
    chosenScore = scores.medium;
  } else if (scores.small > 0) {
    chosen = 'small';
    chosenScore = scores.small;
  }

  const confidence = totalScore > 0 ? chosenScore / totalScore : 0;
  const matchedLabels = matches[chosen];
  const rationale =
    matchedLabels.length > 0
      ? `matched ${matchedLabels.length} ${chosen}-tier signal(s): ${matchedLabels.slice(0, 3).join(', ')}`
      : `defaulted to ${chosen} tier`;

  return {
    tier: chosen,
    confidence,
    matches,
    rationale,
  };
}

// Re-exported for unit tests so individual pattern bundles are auditable.
export const __SEKURI_PATTERN_BUNDLES__ = BUNDLES;
