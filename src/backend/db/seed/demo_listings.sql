-- Demo listings seed for the Marketplace pitch surface.
--
-- Owner: Phanes (W2 NP P1 Session 2). Populates 3-5 listings per category
-- across the 7-category taxonomy (21 listings total). Every row is a
-- published MIT/CC0/Apache listing authored by one of the DEMO_USER_*
-- users seeded by src/backend/db/seed.py so the INSERT satisfies the
-- creator_user_id FK and the RLS policy.
--
-- Idempotent: every row declares a fixed UUID and uses ON CONFLICT (id)
-- DO NOTHING so re-runs never duplicate.
--
-- Apply order (after alembic upgrade head + seed.py tenants and users):
--   psql "$NERIUM_DATABASE_MIGRATION_URL" -f src/backend/db/seed/demo_listings.sql
--
-- Premium category rows are intentionally created with status=draft so
-- they do not appear in public lists until the marketplace.premium_issuance
-- Hemera flag is flipped on. This matches the Section 4.2 gate behaviour.
--
-- Contract refs:
--   docs/contracts/marketplace_listing.contract.md Sections 3.1-3.5, 4.2.

BEGIN;

-- Convenience: locally bind the tenant used for the bulk of rows.
-- DEMO_TENANT_A = 01926f00-0000-7a00-8000-000000000aaa
-- DEMO_TENANT_B = 01926f00-0000-7a00-8000-000000000bbb
-- DEMO_USER_ALICE   = 01926f00-1111-7a11-8111-000000000001  (tenant A)
-- DEMO_USER_BOB     = 01926f00-1111-7a11-8111-000000000002  (tenant A)
-- DEMO_USER_CHARLIE = 01926f00-1111-7a11-8111-000000000003  (tenant B)
SELECT set_config('app.tenant_id', '01926f00-0000-7a00-8000-000000000aaa', true);

-- ---------------------------------------------------------------------
-- CORE_AGENT (3 listings)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4001-7a40-8401-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'core_agent', 'agent', 'apollo-village-advisor',
   'Apollo Village Advisor',
   'Single-agent NPC that runs a village tutorial flow.',
   '## Apollo Village Advisor\n\nRuns the opening tutorial flow for the NERIUM vertical-slice demo.',
   ARRAY['advisor','tutorial','rpg']::text[], 'MIT', 'free', '{}'::jsonb,
   jsonb_build_object(
     'runtime_requirements', jsonb_build_object('model','claude-opus-4-7','tools',jsonb_build_array('search','read_file')),
     'prompt_artifact_id','01926f00-5001-7a50-8501-000000000001',
     'example_inputs', jsonb_build_array(jsonb_build_object('greeting','hi')),
     'success_criteria','Advisor completes the onboarding quest.'
   ),
   'published', '1.0.0', now() - interval '3 days'),
  ('01926f00-4001-7a40-8401-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'core_agent', 'agent_bundle', 'restaurant-automation-suite',
   'Restaurant Automation Suite',
   'Bundle of 4 agents for POS, reservations, inventory, and support.',
   '## Restaurant Automation Suite\n\nFour agents assembled into a turnkey bundle. Inspired by the restaurant pain in NarasiGhaisan Section 5.',
   ARRAY['restaurant','smb','pos']::text[], 'APACHE_2', 'subscription_monthly',
   '{"amount_cents": 4900, "currency": "USD"}'::jsonb,
   jsonb_build_object(
     'runtime_requirements', jsonb_build_object('model','claude-opus-4-7','mcp_servers',jsonb_build_array('pos-mcp','inventory-mcp')),
     'prompt_artifact_id','01926f00-5001-7a50-8501-000000000002',
     'example_inputs', jsonb_build_array(),
     'success_criteria','Closed-loop POS, reservation, and support across a 1-hour shift.'
   ),
   'published', '1.2.0', now() - interval '9 days'),
  ('01926f00-4001-7a40-8401-000000000003',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'core_agent', 'agent_team', 'cyberpunk-heist-crew',
   'Cyberpunk Heist Crew',
   'A 3-agent narrative team (hacker, face, runner) for cyberpunk quests.',
   '## Cyberpunk Heist Crew\n\nThree roleplay agents coordinating over a shared inventory.',
   ARRAY['rpg','cyberpunk','team']::text[], 'MIT', 'one_time',
   '{"amount_cents": 1500, "currency": "USD"}'::jsonb,
   jsonb_build_object(
     'runtime_requirements', jsonb_build_object('model','claude-opus-4-7'),
     'prompt_artifact_id','01926f00-5001-7a50-8501-000000000003',
     'example_inputs', jsonb_build_array()
   ),
   'published', '0.9.0', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- CONTENT (4 listings)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4002-7a40-8402-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'content', 'prompt', 'investment-thesis-prompt',
   'Investment Thesis Prompt',
   'Battle-tested prompt for generating equity investment theses.',
   '## Investment Thesis Prompt\n\nGuides the model through DCF, moat, and catalyst analysis.',
   ARRAY['investing','fundamentals']::text[], 'CC_BY_4', 'free', '{}'::jsonb,
   jsonb_build_object('content_format','markdown','language','en','word_count',850,'inline_preview','You are an equity analyst...'),
   'published', '1.1.0', now() - interval '7 days'),
  ('01926f00-4002-7a40-8402-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'content', 'skill', 'pixel-sprite-describer',
   'Pixel Sprite Describer Skill',
   'Claude Skill that describes a pixel sprite in under 50 words.',
   '## Pixel Sprite Describer\n\nConstraint-tuned skill scoped to 50-word outputs with consistent vocabulary.',
   ARRAY['skill','pixel','description']::text[], 'MIT', 'one_time',
   '{"amount_cents": 500, "currency": "USD"}'::jsonb,
   jsonb_build_object('content_format','json','language','en','word_count',1200),
   'published', '1.0.0', now() - interval '2 days'),
  ('01926f00-4002-7a40-8402-000000000003',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'content', 'quest_template', 'lumio-onboarding-quest',
   'Lumio Onboarding Quest Template',
   'Quest template used to drive the NERIUM vertical-slice demo.',
   '## Lumio Onboarding Quest\n\n9-step FSM that unlocks the caravan and awards the first item.',
   ARRAY['quest','template','onboarding']::text[], 'MIT', 'free', '{}'::jsonb,
   jsonb_build_object('content_format','yaml','language','en','inline_preview','quest_id: lumio_onboarding\nsteps:\n  - ...'),
   'published', '1.0.0', now() - interval '10 days'),
  ('01926f00-4002-7a40-8402-000000000004',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'content', 'context_pack', 'idx-equity-context-pack',
   'IDX Equity Context Pack',
   'Context pack bundling IDX listing taxonomy + sector primers.',
   '## IDX Equity Context Pack\n\nReady-to-drop context for IDX research agents.',
   ARRAY['idx','research','context']::text[], 'CC_BY_SA_4', 'subscription_yearly',
   '{"amount_cents": 9900, "currency": "USD"}'::jsonb,
   jsonb_build_object('content_format','markdown','language','id','word_count',15000),
   'published', '0.4.0', now() - interval '4 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- INFRASTRUCTURE (3 listings)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4003-7a40-8403-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'infrastructure', 'mcp_config', 'postgres-multi-tenant-mcp',
   'Postgres Multi-Tenant MCP',
   'MCP server that runs tenant-scoped SQL against Postgres with RLS.',
   '## Postgres Multi-Tenant MCP\n\nTenant binding via SET LOCAL; safe for agent use.',
   ARRAY['mcp','postgres','rls']::text[], 'APACHE_2', 'free', '{}'::jsonb,
   jsonb_build_object('platform_compat', jsonb_build_array('mcp_remote','mcp_local'),'config_schema', jsonb_build_object(),'install_instructions_md','## Install\n\n```bash\nnpm i @nerium/pg-mcp\n```'),
   'published', '1.3.0', now() - interval '14 days'),
  ('01926f00-4003-7a40-8403-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'infrastructure', 'connector', 'midtrans-payment-connector',
   'Midtrans Payment Connector',
   'Plug-and-play adapter for Midtrans + QRIS payments.',
   '## Midtrans Payment Connector\n\nTenant-scoped, webhook-verified, production-ready.',
   ARRAY['payment','midtrans','qris']::text[], 'MIT', 'subscription_monthly',
   '{"amount_cents": 1900, "currency": "USD"}'::jsonb,
   jsonb_build_object('platform_compat', jsonb_build_array('anthropic_api','openai_api'),'config_schema', jsonb_build_object('server_key',jsonb_build_object('type','secret_string'))),
   'published', '2.0.0', now() - interval '6 days'),
  ('01926f00-4003-7a40-8403-000000000003',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'infrastructure', 'eval_suite', 'advisor-onboarding-evals',
   'Advisor Onboarding Evals',
   'Eval suite covering the advisor onboarding flow (18 scenarios).',
   '## Advisor Onboarding Evals\n\n18 scenario rubric-scored evals with golden transcripts.',
   ARRAY['eval','advisor','rubric']::text[], 'MIT', 'one_time',
   '{"amount_cents": 2500, "currency": "USD"}'::jsonb,
   jsonb_build_object('platform_compat', jsonb_build_array('anthropic_api'),'config_schema', jsonb_build_object()),
   'published', '1.1.0', now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- ASSETS (4 listings)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4004-7a40-8404-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'assets', 'sprite_pack', 'medieval-desert-sprites',
   'Medieval Desert Sprite Pack',
   '64 animated sprites: NPC, caravan, terrain tiles.',
   '## Medieval Desert Sprite Pack\n\n64 pixel sprites, 32x32 base resolution.',
   ARRAY['sprite','pixel','medieval']::text[], 'CC_BY_4', 'one_time',
   '{"amount_cents": 1200, "currency": "USD"}'::jsonb,
   jsonb_build_object('media_type','image','file_format','png','dimensions',jsonb_build_object('width',32,'height',32)),
   'published', '1.0.0', now() - interval '11 days'),
  ('01926f00-4004-7a40-8404-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'assets', 'voice_profile', 'apollo-advisor-voice',
   'Apollo Advisor Voice Profile',
   'TTS voice profile for Apollo Advisor character (warm, reassuring).',
   '## Apollo Advisor Voice\n\nTuned for the NERIUM advisor chat persona.',
   ARRAY['tts','voice','apollo']::text[], 'CC_BY_NC_4', 'subscription_monthly',
   '{"amount_cents": 700, "currency": "USD"}'::jsonb,
   jsonb_build_object('media_type','audio','file_format','wav','dimensions',jsonb_build_object('duration_s',0),'license_notes','Attribution required on commercial use.'),
   'published', '1.0.0', now() - interval '8 days'),
  ('01926f00-4004-7a40-8404-000000000003',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'assets', 'sound_pack', 'cyberpunk-shanghai-ambience',
   'Cyberpunk Shanghai Ambience',
   '40 looping ambience tracks for cyberpunk scenes.',
   '## Cyberpunk Shanghai Ambience\n\nHigh-fidelity loops at 44.1kHz 16-bit.',
   ARRAY['sound','ambience','cyberpunk']::text[], 'CC0', 'free', '{}'::jsonb,
   jsonb_build_object('media_type','audio','file_format','mp3','dimensions',jsonb_build_object('duration_s',120)),
   'published', '1.1.0', now() - interval '15 days'),
  ('01926f00-4004-7a40-8404-000000000004',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'assets', 'visual_theme', 'steampunk-victorian-theme',
   'Steampunk Victorian Theme',
   'Design tokens + component theme for a steampunk UI variant.',
   '## Steampunk Victorian Theme\n\nOKLCH tokens + shadcn overrides.',
   ARRAY['theme','steampunk','design-tokens']::text[], 'MIT', 'one_time',
   '{"amount_cents": 1800, "currency": "USD"}'::jsonb,
   jsonb_build_object('media_type','image','file_format','svg'),
   'published', '0.7.0', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- SERVICES (3 listings)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4005-7a40-8405-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'services', 'custom_build_service', 'nerium-express-build',
   'NERIUM Express Build',
   '2-week express Builder engagement: concept to staged deploy.',
   '## NERIUM Express Build\n\nEnds with a staged deploy and a handoff playbook.',
   ARRAY['service','builder','express']::text[], 'CUSTOM_COMMERCIAL', 'one_time',
   '{"amount_cents": 500000, "currency": "USD"}'::jsonb,
   jsonb_build_object('service_kind','custom_build','delivery_time_days',14,'scope_description','Scope, design, build, staged deploy, 3 revision rounds.','included_revisions',3,'sla','Weekly checkpoint call.'),
   'published', '1.0.0', now() - interval '7 days'),
  ('01926f00-4005-7a40-8405-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'services', 'consulting_hour', 'ghaisan-indieops-hour',
   'Indie Ops Consulting Hour',
   'One-hour consulting block on indie AI ops + infra.',
   '## Indie Ops Consulting Hour\n\nBring an ops question; leave with a plan.',
   ARRAY['service','consulting','ops']::text[], 'CUSTOM_COMMERCIAL', 'one_time',
   '{"amount_cents": 25000, "currency": "USD"}'::jsonb,
   jsonb_build_object('service_kind','consulting','delivery_time_days',1,'scope_description','One 60-minute session with a follow-up brief.','included_revisions',0),
   'published', '1.0.0', now() - interval '3 days'),
  ('01926f00-4005-7a40-8405-000000000003',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'services', 'custom_build_service', 'lumio-quest-integration',
   'Lumio Quest Integration',
   'Integrate the Lumio quest FSM into an existing app.',
   '## Lumio Quest Integration\n\nFor teams shipping a gamified onboarding layer.',
   ARRAY['service','integration','quest']::text[], 'CUSTOM_COMMERCIAL', 'one_time',
   '{"amount_cents": 120000, "currency": "USD"}'::jsonb,
   jsonb_build_object('service_kind','integration','delivery_time_days',7,'scope_description','Wire the quest FSM + dialogue runner + event bus into your app.','included_revisions',2),
   'published', '1.0.0', now() - interval '6 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- PREMIUM (3 listings, status=draft so gate behaviour stays honest)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4006-7a40-8406-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'premium', 'verified_certification', 'nerium-verified-creator',
   'Verified Creator Certification',
   'Identity + code verification badge for creators. Pre-GA.',
   '## Verified Creator Certification\n\nUnlocks the verified-creator badge on listing cards. Issuance workflow pending per contract open question 5.',
   ARRAY['premium','verification','badge']::text[], 'PROPRIETARY', 'one_time',
   '{"amount_cents": 4900, "currency": "USD"}'::jsonb,
   jsonb_build_object('premium_kind','verified_certification','validity_days',365,'renewal_policy','Annual renewal; revoked automatically on flagged identity change.'),
   'draft', '0.1.0', NULL),
  ('01926f00-4006-7a40-8406-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'premium', 'priority_listing', 'priority-marketplace-placement',
   'Priority Marketplace Placement',
   'Boosted ranking in Marketplace search. Pre-GA.',
   '## Priority Marketplace Placement\n\nRanks above organic results within the chosen category for 30 days.',
   ARRAY['premium','placement','ranking']::text[], 'PROPRIETARY', 'one_time',
   '{"amount_cents": 9900, "currency": "USD"}'::jsonb,
   jsonb_build_object('premium_kind','priority_listing','validity_days',30),
   'draft', '0.1.0', NULL),
  ('01926f00-4006-7a40-8406-000000000003',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'premium', 'custom_domain_agent', 'bring-your-own-agent-domain',
   'Custom Agent Domain',
   'Route yourname.nerium.app to your hosted agent. Pre-GA.',
   '## Custom Agent Domain\n\nDNS + TLS automation for creator domains.',
   ARRAY['premium','domain','dns']::text[], 'PROPRIETARY', 'subscription_yearly',
   '{"amount_cents": 14900, "currency": "USD"}'::jsonb,
   jsonb_build_object('premium_kind','custom_domain_agent','validity_days',365,'renewal_policy','Auto-renew unless cancelled 7 days prior.'),
   'draft', '0.1.0', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- DATA (3 listings)
-- ---------------------------------------------------------------------

INSERT INTO marketplace_listing (
  id, tenant_id, creator_user_id, category, subtype, slug,
  title, short_description, long_description,
  capability_tags, license, pricing_model, pricing_details,
  category_metadata, status, version, published_at
) VALUES
  ('01926f00-4007-7a40-8407-000000000001',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000001',
   'data', 'dataset', 'idx-equities-taxonomy',
   'IDX Equities Taxonomy',
   'Cleaned IDX ticker list with sector + sub-sector mapping.',
   '## IDX Equities Taxonomy\n\n800+ tickers across 11 sectors with NAICS cross-walk.',
   ARRAY['idx','data','taxonomy']::text[], 'CC_BY_SA_4', 'one_time',
   '{"amount_cents": 1500, "currency": "USD"}'::jsonb,
   jsonb_build_object('size_mb',12,'update_frequency','monthly','source_attribution','IDX public listing feed; author aggregated.','row_count',842),
   'published', '1.0.0', now() - interval '4 days'),
  ('01926f00-4007-7a40-8407-000000000002',
   '01926f00-0000-7a00-8000-000000000aaa',
   '01926f00-1111-7a11-8111-000000000002',
   'data', 'dataset', 'quest-playtest-transcripts',
   'Quest Playtest Transcripts',
   'Anonymised playtest transcripts from Lumio onboarding.',
   '## Quest Playtest Transcripts\n\n420 anonymised sessions with step-level FSM annotations.',
   ARRAY['data','playtest','quest']::text[], 'CC_BY_NC_4', 'subscription_monthly',
   '{"amount_cents": 1900, "currency": "USD"}'::jsonb,
   jsonb_build_object('size_mb',85,'update_frequency','weekly','source_attribution','NERIUM internal playtest program.','row_count',420),
   'published', '0.3.0', now() - interval '6 days'),
  ('01926f00-4007-7a40-8407-000000000003',
   '01926f00-0000-7a00-8000-000000000bbb',
   '01926f00-1111-7a11-8111-000000000003',
   'data', 'analytics_dashboard', 'marketplace-health-dashboard',
   'Marketplace Health Dashboard',
   'Grafana dashboard for listing velocity, trust scores, and conversion.',
   '## Marketplace Health Dashboard\n\n12 panels tracking the Marketplace pillar.',
   ARRAY['analytics','grafana','marketplace']::text[], 'MIT', 'free', '{}'::jsonb,
   jsonb_build_object('size_mb',1,'update_frequency','on_demand','source_attribution','NERIUM ops telemetry.'),
   'published', '1.0.0', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

COMMIT;
