// app/marketplace/browse/mock_catalog.ts
//
// NERIUM Marketplace browse surface: demo-seed catalog data.
// Authoring agent: Artemis (P3a Marketplace Worker, Browse).
//
// Honest-claim filter per NarasiGhaisan Section 20 and Artemis hard_constraints:
// every listing below is a demo seed authored by Artemis for the hackathon
// prototype. No real usage counts, no real user testimonials, no real
// payment rails. Trust scores are fixture values in [0, 1] attached to a
// parallel mock map because the TrustScore artifact lives in Registry and
// is resolved by Phoebe via trust_score_pointer in the shipped product.
//
// The `MarketplaceCatalog` interface contract is defined in
// ../schema/listing.schema.ts. This file ships a read-only in-memory mock
// suitable for Day 1 browse rendering.

import type {
  AgentListing,
  MarketplaceCatalog,
} from '../schema/listing.schema';

const SEED_ISO = '2026-04-18T09:00:00.000Z';

const listings: AgentListing[] = [
  {
    listing_id: 'lst_001_restaurant_shift_scheduler',
    slug: 'restaurant-shift-scheduler',
    display_name: 'Restaurant Shift Scheduler',
    short_description:
      'Automates weekly shift rosters for small restaurants using sales forecasts and staff availability.',
    long_description_markdown:
      'Demo seed listing. Drafts a weekly schedule from a sales forecast and a roster of available staff, respects local labor rules, exports to common POS systems. Customize via living-template parameters such as shift length and region.',
    creator_identity_id: 'id_coffee_pipeline_co',
    vendor_origin: 'claude_code',
    capability_tags: ['domain_automation', 'customer_support'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.02, high_usd: 0.08 },
    },
    living_template_params: [
      {
        key: 'region',
        label: 'Region',
        kind: 'enum',
        enum_values: ['ID', 'SG', 'MY', 'TH'],
        default_value: 'ID',
        description: 'Applies local labor regulations.',
      },
    ],
    trust_score_pointer: '/registry/trust/id_coffee_pipeline_co',
    audit_summary: 'First seen 2026-02-14, active, zero reported incidents.',
    created_at: '2026-02-14T10:00:00.000Z',
    updated_at: '2026-04-12T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_002_chili_yield_planner',
    slug: 'chili-yield-planner',
    display_name: 'Chili Yield Planner',
    short_description:
      'Crop monitoring and yield forecast agent tuned for smallholder chili farms; remixable to other crops via living template.',
    long_description_markdown:
      'Demo seed listing. Ingests weather and soil samples, outputs a planting and harvest plan. Living-template parameter swaps crop type, so a buyer can remix it from chili to grape as described in NarasiGhaisan Section 5.',
    creator_identity_id: 'id_tani_digital',
    vendor_origin: 'hand_coded',
    capability_tags: ['domain_automation', 'analysis'],
    pricing_tier: 'mid',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.12, high_usd: 0.40 },
    },
    living_template_params: [
      {
        key: 'crop_type',
        label: 'Crop Type',
        kind: 'enum',
        enum_values: ['chili', 'grape', 'tomato', 'coffee'],
        default_value: 'chili',
        description: 'Swap target crop; retunes yield coefficients.',
      },
    ],
    trust_score_pointer: '/registry/trust/id_tani_digital',
    audit_summary: 'First seen 2026-01-08, active, zero reported incidents.',
    created_at: '2026-01-08T10:00:00.000Z',
    updated_at: '2026-04-10T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_003_pr_review_companion',
    slug: 'pr-review-companion',
    display_name: 'PR Review Companion',
    short_description:
      'Reviews pull requests for security, style, and test coverage with inline comments, targets TypeScript monorepos.',
    long_description_markdown:
      'Demo seed listing. Posts structured review comments on a pull request. Configurable strictness via living template. Output is advisory; human approver remains in the loop.',
    creator_identity_id: 'id_acme_agents',
    vendor_origin: 'cursor',
    capability_tags: ['code_generation', 'analysis'],
    pricing_tier: 'mid',
    usage_cost_hint: {
      per_execution_unit: 'request',
      estimate_range: { low_usd: 0.15, high_usd: 0.60 },
    },
    trust_score_pointer: '/registry/trust/id_acme_agents',
    audit_summary: 'First seen 2025-12-02, active, one prior incident resolved.',
    created_at: '2025-12-02T10:00:00.000Z',
    updated_at: '2026-04-15T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_004_xauusd_signal_scout',
    slug: 'xauusd-signal-scout',
    display_name: 'XAU/USD Signal Scout',
    short_description:
      'Emits non-advisory trading signals for gold versus dollar across multi-session timeframes; backtested on fixture data.',
    long_description_markdown:
      'Demo seed listing. Produces directional signals with confidence band. Not financial advice. Intended as a research aid. Trust score reflects backtest consistency only, not live P&L.',
    creator_identity_id: 'id_finerium_research',
    vendor_origin: 'hand_coded',
    capability_tags: ['trading_signal', 'analysis'],
    pricing_tier: 'premium',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.80, high_usd: 3.50 },
    },
    trust_score_pointer: '/registry/trust/id_finerium_research',
    audit_summary: 'First seen 2025-09-01, active, zero reported incidents.',
    created_at: '2025-09-01T10:00:00.000Z',
    updated_at: '2026-04-20T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_005_clinic_note_drafter',
    slug: 'clinic-note-drafter',
    display_name: 'Clinic Note Drafter',
    short_description:
      'Drafts SOAP-style clinic notes from voice transcripts; outputs are advisory and always reviewed by a human clinician.',
    long_description_markdown:
      'Demo seed listing. Accepts consultation transcript, emits SOAP-format draft. Handles only de-identified transcripts. Not a medical device.',
    creator_identity_id: 'id_medwatch_labs',
    vendor_origin: 'claude_code',
    capability_tags: ['customer_support', 'data_extraction'],
    pricing_tier: 'mid',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.10, high_usd: 0.45 },
    },
    trust_score_pointer: '/registry/trust/id_medwatch_labs',
    audit_summary: 'First seen 2026-02-20, active, zero reported incidents.',
    created_at: '2026-02-20T10:00:00.000Z',
    updated_at: '2026-04-14T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_006_meeting_minutes_maker',
    slug: 'meeting-minutes-maker',
    display_name: 'Meeting Minutes Maker',
    short_description:
      'Summarizes meeting recordings into action items, decisions, and open questions; Slack and Notion exporters included.',
    long_description_markdown:
      'Demo seed listing. Detects action items by speaker. Living-template parameter picks output format.',
    creator_identity_id: 'id_worksync',
    vendor_origin: 'replit',
    capability_tags: ['data_extraction', 'customer_support'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'minute',
      estimate_range: { low_usd: 0.005, high_usd: 0.02 },
    },
    trust_score_pointer: '/registry/trust/id_worksync',
    audit_summary: 'First seen 2026-03-05, active, zero reported incidents.',
    created_at: '2026-03-05T10:00:00.000Z',
    updated_at: '2026-04-18T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_007_landing_page_pixie',
    slug: 'landing-page-pixie',
    display_name: 'Landing Page Pixie',
    short_description:
      'Generates a responsive landing page from a one-sentence pitch, including hero, features, and testimonial placeholders.',
    long_description_markdown:
      'Demo seed listing. Emits Next.js plus Tailwind scaffold. Living-template parameter picks tone and palette.',
    creator_identity_id: 'id_studio_lumen',
    vendor_origin: 'bolt',
    capability_tags: ['code_generation', 'design_asset'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.08, high_usd: 0.30 },
    },
    trust_score_pointer: '/registry/trust/id_studio_lumen',
    audit_summary: 'First seen 2026-03-18, active, zero reported incidents.',
    created_at: '2026-03-18T10:00:00.000Z',
    updated_at: '2026-04-19T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_008_campaign_copy_chef',
    slug: 'campaign-copy-chef',
    display_name: 'Campaign Copy Chef',
    short_description:
      'Drafts email, ads, and social copy for a product launch in a chosen brand voice.',
    long_description_markdown:
      'Demo seed listing. Accepts product brief plus brand voice sample, emits a multi-channel copy pack. Iterative refinement via chat.',
    creator_identity_id: 'id_brandforge',
    vendor_origin: 'gpt_store',
    capability_tags: ['marketing_copy'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.03, high_usd: 0.12 },
    },
    trust_score_pointer: '/registry/trust/id_brandforge',
    audit_summary: 'First seen 2025-10-12, active, two prior incidents resolved.',
    created_at: '2025-10-12T10:00:00.000Z',
    updated_at: '2026-04-11T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_009_contract_clause_reader',
    slug: 'contract-clause-reader',
    display_name: 'Contract Clause Reader',
    short_description:
      'Extracts key clauses, risks, and defined terms from commercial contracts; produces a structured summary for counsel review.',
    long_description_markdown:
      'Demo seed listing. Output is advisory and never a substitute for legal review. Supports PDF and DOCX input.',
    creator_identity_id: 'id_statute_studio',
    vendor_origin: 'langchain_hub',
    capability_tags: ['data_extraction', 'analysis'],
    pricing_tier: 'premium',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 1.20, high_usd: 6.00 },
    },
    trust_score_pointer: '/registry/trust/id_statute_studio',
    audit_summary: 'First seen 2025-11-01, active, zero reported incidents.',
    created_at: '2025-11-01T10:00:00.000Z',
    updated_at: '2026-04-16T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_010_tutor_nusantara',
    slug: 'tutor-nusantara',
    display_name: 'Tutor Nusantara',
    short_description:
      'Indonesian high-school tutor agent spanning math, physics, and chemistry; UTBK preparation mode included.',
    long_description_markdown:
      'Demo seed listing. Conversational in Bahasa Indonesia, switches to English on demand. Tracks per-topic mastery across sessions.',
    creator_identity_id: 'id_sekolah_rakyat',
    vendor_origin: 'claude_skills',
    capability_tags: ['customer_support', 'research'],
    pricing_tier: 'free',
    usage_cost_hint: {
      per_execution_unit: 'request',
      estimate_range: { low_usd: 0, high_usd: 0 },
    },
    trust_score_pointer: '/registry/trust/id_sekolah_rakyat',
    audit_summary: 'First seen 2026-01-22, active, zero reported incidents.',
    created_at: '2026-01-22T10:00:00.000Z',
    updated_at: '2026-04-05T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_011_literature_survey_scribe',
    slug: 'literature-survey-scribe',
    display_name: 'Literature Survey Scribe',
    short_description:
      'Produces a structured literature survey on a topic with citations, cluster map, and research gaps.',
    long_description_markdown:
      'Demo seed listing. Uses open academic sources only. Output is a markdown survey plus a BibTeX file.',
    creator_identity_id: 'id_archive_minds',
    vendor_origin: 'huggingface_space',
    capability_tags: ['research', 'data_extraction'],
    pricing_tier: 'mid',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.25, high_usd: 0.90 },
    },
    trust_score_pointer: '/registry/trust/id_archive_minds',
    audit_summary: 'First seen 2026-03-11, active, zero reported incidents.',
    created_at: '2026-03-11T10:00:00.000Z',
    updated_at: '2026-04-17T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_012_inbox_triage_owl',
    slug: 'inbox-triage-owl',
    display_name: 'Inbox Triage Owl',
    short_description:
      'Triages an email inbox by urgency, sender trust, and action required; emits a morning digest.',
    long_description_markdown:
      'Demo seed listing. Read-only against the inbox. Does not send or delete messages. Digest format configurable.',
    creator_identity_id: 'id_calm_mail',
    vendor_origin: 'lovable',
    capability_tags: ['domain_automation', 'analysis'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.01, high_usd: 0.05 },
    },
    trust_score_pointer: '/registry/trust/id_calm_mail',
    audit_summary: 'First seen 2026-03-25, active, zero reported incidents.',
    created_at: '2026-03-25T10:00:00.000Z',
    updated_at: '2026-04-21T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_013_merch_photo_stylist',
    slug: 'merch-photo-stylist',
    display_name: 'Merch Photo Stylist',
    short_description:
      'Batch-edits e-commerce product photos for background removal, white-balance, and composition consistency.',
    long_description_markdown:
      'Demo seed listing. Processes ZIP archives of photos. Style templates selectable via living template.',
    creator_identity_id: 'id_aurora_visuals',
    vendor_origin: 'vercel_gallery',
    capability_tags: ['design_asset'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.02, high_usd: 0.10 },
    },
    trust_score_pointer: '/registry/trust/id_aurora_visuals',
    audit_summary: 'First seen 2026-02-02, active, zero reported incidents.',
    created_at: '2026-02-02T10:00:00.000Z',
    updated_at: '2026-04-13T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_014_explainer_clip_conductor',
    slug: 'explainer-clip-conductor',
    display_name: 'Explainer Clip Conductor',
    short_description:
      'Generates short explainer video clips from a script; assembles voiceover, captions, and b-roll cues.',
    long_description_markdown:
      'Demo seed listing. Emits a rendered MP4 plus project file. Voices are synthetic; attribution is added automatically.',
    creator_identity_id: 'id_reel_forge',
    vendor_origin: 'cloudflare_marketplace',
    capability_tags: ['video_generation', 'marketing_copy'],
    pricing_tier: 'premium',
    usage_cost_hint: {
      per_execution_unit: 'minute',
      estimate_range: { low_usd: 0.40, high_usd: 1.80 },
    },
    trust_score_pointer: '/registry/trust/id_reel_forge',
    audit_summary: 'First seen 2026-03-01, active, zero reported incidents.',
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-04-19T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_015_ops_runbook_rover',
    slug: 'ops-runbook-rover',
    display_name: 'Ops Runbook Rover',
    short_description:
      'Converts incident transcripts into runbooks and postmortems; flags missing recovery steps.',
    long_description_markdown:
      'Demo seed listing. Reads chat-ops transcripts, emits a runbook in markdown. Suggests rollback paths.',
    creator_identity_id: 'id_steady_state',
    vendor_origin: 'mcp_hub',
    capability_tags: ['domain_automation', 'data_extraction'],
    pricing_tier: 'mid',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.10, high_usd: 0.35 },
    },
    trust_score_pointer: '/registry/trust/id_steady_state',
    audit_summary: 'First seen 2026-01-15, active, zero reported incidents.',
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-04-18T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_016_ticket_triage_scout',
    slug: 'ticket-triage-scout',
    display_name: 'Ticket Triage Scout',
    short_description:
      'Routes customer support tickets by product area, urgency, and required specialty; posts to the right queue.',
    long_description_markdown:
      'Demo seed listing. Integrates with common support platforms. Configurable routing tree via living template.',
    creator_identity_id: 'id_desk_concierge',
    vendor_origin: 'claude_code',
    capability_tags: ['customer_support', 'domain_automation'],
    pricing_tier: 'cheap',
    usage_cost_hint: {
      per_execution_unit: 'request',
      estimate_range: { low_usd: 0.002, high_usd: 0.01 },
    },
    trust_score_pointer: '/registry/trust/id_desk_concierge',
    audit_summary: 'First seen 2025-08-30, active, zero reported incidents.',
    created_at: '2025-08-30T10:00:00.000Z',
    updated_at: '2026-04-20T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_017_supply_chain_sentinel',
    slug: 'supply-chain-sentinel',
    display_name: 'Supply Chain Sentinel',
    short_description:
      'Forecasts stockouts and suggests reorder windows for small retail chains; integrates with common POS exports.',
    long_description_markdown:
      'Demo seed listing. Accepts weekly sales CSVs. Emits a reorder calendar plus risk flags.',
    creator_identity_id: 'id_warung_data',
    vendor_origin: 'hand_coded',
    capability_tags: ['analysis', 'domain_automation'],
    pricing_tier: 'mid',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0.08, high_usd: 0.30 },
    },
    trust_score_pointer: '/registry/trust/id_warung_data',
    audit_summary: 'First seen 2026-02-27, active, zero reported incidents.',
    created_at: '2026-02-27T10:00:00.000Z',
    updated_at: '2026-04-15T10:00:00.000Z',
    visibility: 'public',
  },
  {
    listing_id: 'lst_018_nerium_lumio_starter',
    slug: 'nerium-lumio-starter',
    display_name: 'NERIUM Lumio Starter',
    short_description:
      'Reference Builder output: the Lumio smart-reading landing page, shipped as a remixable NERIUM Builder template.',
    long_description_markdown:
      'Demo seed listing. Canonical Builder output used in the hackathon demo. Remixable living-template parameters cover hero copy, palette, and world theme.',
    creator_identity_id: 'id_nerium_builder',
    vendor_origin: 'nerium_builder',
    capability_tags: ['code_generation', 'design_asset'],
    pricing_tier: 'free',
    usage_cost_hint: {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0, high_usd: 0 },
    },
    living_template_params: [
      {
        key: 'world',
        label: 'World Theme',
        kind: 'enum',
        enum_values: ['medieval_desert', 'cyberpunk_shanghai', 'steampunk_victorian'],
        default_value: 'cyberpunk_shanghai',
        description: 'Swaps the visual world per NERIUM three-world lock.',
      },
    ],
    trust_score_pointer: '/registry/trust/id_nerium_builder',
    audit_summary: 'First seen 2026-04-22, active, zero reported incidents.',
    created_at: '2026-04-22T10:00:00.000Z',
    updated_at: '2026-04-22T10:00:00.000Z',
    visibility: 'public',
  },
];

// Parallel trust map: identity_id to scalar in [0, 1]. In production the
// Registry pillar resolves trust via trust_score_pointer; here we fix
// demo-seed values so the ranker behaves deterministically.
const trustById: Record<string, number> = {
  id_coffee_pipeline_co: 0.72,
  id_tani_digital: 0.81,
  id_acme_agents: 0.58,
  id_finerium_research: 0.89,
  id_medwatch_labs: 0.77,
  id_worksync: 0.63,
  id_studio_lumen: 0.55,
  id_brandforge: 0.49,
  id_statute_studio: 0.84,
  id_sekolah_rakyat: 0.74,
  id_archive_minds: 0.66,
  id_calm_mail: 0.52,
  id_aurora_visuals: 0.6,
  id_reel_forge: 0.57,
  id_steady_state: 0.79,
  id_desk_concierge: 0.7,
  id_warung_data: 0.68,
  id_nerium_builder: 0.95,
};

// Curator-picked featured IDs per strategic_decision_hard_stop recommendation
// "curated for demo quality control". Kept independent from algorithmic sort.
const CURATED_FEATURED_IDS: string[] = [
  'lst_018_nerium_lumio_starter',
  'lst_002_chili_yield_planner',
  'lst_001_restaurant_shift_scheduler',
  'lst_011_literature_survey_scribe',
  'lst_009_contract_clause_reader',
  'lst_015_ops_runbook_rover',
];

function matchesFilter(
  listing: AgentListing,
  filter: Parameters<MarketplaceCatalog['listBy']>[0],
  multiVendors: string[] | null,
): boolean {
  if (filter.capability_tag && !listing.capability_tags.includes(filter.capability_tag)) {
    return false;
  }
  if (!multiVendors) {
    if (filter.vendor_origin && listing.vendor_origin !== filter.vendor_origin) {
      return false;
    }
  } else if (multiVendors.length > 0 && !multiVendors.includes(listing.vendor_origin)) {
    return false;
  }
  if (filter.pricing_tier && listing.pricing_tier !== filter.pricing_tier) {
    return false;
  }
  if (filter.creator_identity_id && listing.creator_identity_id !== filter.creator_identity_id) {
    return false;
  }
  return true;
}

function compareByRecent(a: AgentListing, b: AgentListing): number {
  return b.updated_at.localeCompare(a.updated_at);
}

function compareByTrust(a: AgentListing, b: AgentListing): number {
  const ta = trustById[a.creator_identity_id] ?? 0;
  const tb = trustById[b.creator_identity_id] ?? 0;
  if (tb !== ta) return tb - ta;
  return compareByRecent(a, b);
}

export const mockCatalog: MarketplaceCatalog = {
  async getListing(listing_id: string) {
    return listings.find((l) => l.listing_id === listing_id) ?? null;
  },
  async listBy(filter) {
    return listings.filter((l) => matchesFilter(l, filter, null));
  },
  async upsert(listing) {
    return listing;
  },
  async archive() {
    return;
  },
};

// Extended helper: filter by an arbitrary vendor selection (multi-select) plus
// sort. Used directly by BrowseCanvas since the contract's listBy signature
// accepts a single vendor_origin.
export async function listByExtended(
  filter: Parameters<MarketplaceCatalog['listBy']>[0],
  multiVendors: string[] | null,
  sort: 'recent' | 'trust_weighted' | 'curator_picked' | 'popular',
): Promise<AgentListing[]> {
  const filtered = listings.filter((l) => matchesFilter(l, filter, multiVendors));
  if (sort === 'recent') {
    return filtered.slice().sort(compareByRecent);
  }
  if (sort === 'curator_picked') {
    const curatedIndex = new Map(CURATED_FEATURED_IDS.map((id, i) => [id, i]));
    return filtered.slice().sort((a, b) => {
      const ai = curatedIndex.get(a.listing_id);
      const bi = curatedIndex.get(b.listing_id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return compareByTrust(a, b);
    });
  }
  if (sort === 'popular') {
    // Popularity signal is not tracked in the hackathon prototype; fall back
    // to trust-weighted ordering which is the next-best proxy and is noted
    // in artemis.decisions.md ADR-03.
    return filtered.slice().sort(compareByTrust);
  }
  return filtered.slice().sort(compareByTrust);
}

export function getCuratedFeatured(limit: number): AgentListing[] {
  const clamped = Math.max(3, Math.min(6, limit));
  const out: AgentListing[] = [];
  for (const id of CURATED_FEATURED_IDS) {
    const match = listings.find((l) => l.listing_id === id);
    if (match) out.push(match);
    if (out.length >= clamped) break;
  }
  return out;
}

export function getTrustBandForListing(listing: AgentListing):
  | 'unverified'
  | 'emerging'
  | 'established'
  | 'trusted'
  | 'elite' {
  const score = trustById[listing.creator_identity_id] ?? 0;
  if (score >= 0.85) return 'elite';
  if (score >= 0.6) return 'trusted';
  if (score >= 0.4) return 'established';
  if (score >= 0.2) return 'emerging';
  return 'unverified';
}

export const DEMO_SEED_NOTICE = `All ${listings.length} listings on this page are demo seed data authored for the NERIUM hackathon prototype, not live marketplace entries.`;

export function countListings(): number {
  return listings.length;
}

export { SEED_ISO };
