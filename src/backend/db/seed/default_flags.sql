-- Hemera default flag seed.
--
-- Applied after ``alembic upgrade head`` via
-- ``psql -f src/backend/db/seed/default_flags.sql "$NERIUM_DATABASE_MIGRATION_URL"``.
--
-- Idempotent: every INSERT uses ``ON CONFLICT (flag_name) DO UPDATE``
-- so re-running the seed refreshes description / kind / tags without
-- creating duplicate rows. ``default_value`` is preserved when it has
-- already been curated away from the seed default so operators can tune
-- the value in admin UI without the next seed run clobbering it; apply
-- ``ON CONFLICT ... DO UPDATE SET default_value = EXCLUDED.default_value``
-- only when a forced re-seed is explicitly requested (``psql -v force=1``).
--
-- The audit trigger captures each INSERT as ``flag_created`` with actor
-- NULL (system seed). Existing rows skipped by DO NOTHING do not emit
-- audit rows.
--
-- Contract: docs/contracts/feature_flag.contract.md Section 3.3.

BEGIN;

INSERT INTO hemera_flag (flag_name, default_value, kind, description, owner_agent, tags) VALUES
  ('builder.live',                 'false'::jsonb,  'boolean',
    'Gate for live Builder Managed Agents sessions. Whitelist judges + Ghaisan + demo users via hemera_override.',
    'kratos',  ARRAY['demo', 'gate', 'exposed_to_user']),
  ('ma.daily_budget_usd',          '100'::jsonb,    'number',
    'Per-tenant daily Managed Agents spend cap in USD.',
    'moros',   ARRAY['budget']),
  ('ma.monthly_budget_usd',        '500'::jsonb,    'number',
    'Platform month-to-date Managed Agents spend cap in USD (authoritative source: Anthropic Admin cost_report).',
    'moros',   ARRAY['budget']),
  ('ma.budget_cap_threshold',      '0.90'::jsonb,   'number',
    'Warn threshold (fraction 0.0 to 1.0) at which Moros emits a non-blocking budget alert before the hard cap trips.',
    'moros',   ARRAY['budget']),
  ('ma.max_concurrent_per_user',   '3'::jsonb,      'number',
    'Concurrent running/streaming Managed Agents sessions per user.',
    'kratos',  ARRAY['quota']),
  ('ma.thinking_budget_default',   '10000'::jsonb,  'number',
    'Extended thinking budget tokens default for Kratos orchestration.',
    'kratos',  ARRAY['quality']),
  ('mcp.rate_limit_cap',           '100'::jsonb,    'number',
    'Legacy MCP per-minute rate-limit cap (pre-rate_limit_override). Retained for Khronos env-shim backward compatibility.',
    'khronos', ARRAY['legacy']),
  ('mcp.rate_limit_override',      'null'::jsonb,   'object',
    'Override MCP per-token + per-IP rate limits. JSON {"per_token_per_min": N, "per_ip_per_min": M}. null = use coded defaults.',
    'khronos', ARRAY['demo']),
  ('mcp.create_ma_session',        'false'::jsonb,  'boolean',
    'Allow MCP clients to spawn new Managed Agents sessions via the create_ma_session tool.',
    'khronos', ARRAY['gate']),
  ('mcp.edge_allowlist_disabled',  'false'::jsonb,  'boolean',
    'Bypass the Cloudflare WAF allowlist for /mcp (emergency unblock).',
    'khronos', ARRAY['demo', 'security']),
  ('oauth.dcr_enabled',            'true'::jsonb,   'boolean',
    'Allow Dynamic Client Registration per RFC 7591.',
    'khronos', ARRAY['security']),
  ('oauth.fallback_client_id',     'null'::jsonb,   'string',
    'Pre-registered fallback client_id for Claude.ai when DCR is disabled.',
    'khronos', ARRAY['fallback']),
  ('vendor.openai.disabled',       'false'::jsonb,  'boolean',
    'Disable OpenAI fallback vendor across all Crius call paths.',
    'crius',   ARRAY['vendor']),
  ('vendor.voyage.disabled',       'false'::jsonb,  'boolean',
    'Disable Voyage embedding vendor.',
    'crius',   ARRAY['vendor']),
  ('vendor.anthropic.disabled',    'false'::jsonb,  'boolean',
    'Disable primary Anthropic vendor (emergency stop; blocks Kratos reasoning layer).',
    'crius',   ARRAY['vendor']),
  ('vendor.chat.fallback_allowed', 'false'::jsonb,  'boolean',
    'Permit cross-vendor chat fallback beyond Anthropic. Default false preserves anti-pattern #7.',
    'crius',   ARRAY['anti_pattern_7']),
  ('billing.live_mode_enabled',    'false'::jsonb,  'boolean',
    'Enable Stripe live mode. Must stay false until Stripe Atlas underwriting lands.',
    'plutus',  ARRAY['billing']),
  ('billing.midtrans.production_enabled', 'false'::jsonb, 'boolean',
    'Enable Midtrans production endpoint (Indonesia). Default false = sandbox.',
    'plutus',  ARRAY['billing']),
  ('billing.price_id_map',         '{}'::jsonb,     'object',
    'Stripe Price ID map per plan x interval. {"solo.monthly": "price_xxx", ...}',
    'plutus',  ARRAY['billing']),
  ('commerce.verified_take_rate',  '0.15'::jsonb,   'number',
    'Marketplace take-rate for Verified creators (fraction 0.0 to 1.0).',
    'iapetus', ARRAY['commerce']),
  ('email.daily_cap',              '50'::jsonb,     'number',
    'Per-domain daily email send cap during DKIM warmup.',
    'pheme',   ARRAY['email']),
  ('marketplace.premium_issuance', 'false'::jsonb,  'boolean',
    'Allow Phanes to accept new Premium-tier listings. Gated pre-submission.',
    'phanes',  ARRAY['commerce']),
  ('search.pgvector_enabled',      'true'::jsonb,   'boolean',
    'Enable the semantic-search branch of the hybrid RRF pipeline.',
    'hyperion', ARRAY['search']),
  ('realtime.max_ws_per_user',     '5'::jsonb,      'number',
    'Max concurrent WebSocket connections per authenticated user.',
    'nike',    ARRAY['quota']),
  ('cors.allow_localhost',         'true'::jsonb,   'boolean',
    'Allow http://localhost:3000 + :3100 origins in CORS. Dev only.',
    'aether',  ARRAY['dev']),
  ('docs.public',                  'true'::jsonb,   'boolean',
    'Expose /docs + /docs-swagger endpoints publicly. Pre-GA true; post-GA flip.',
    'aether',  ARRAY['dev']),
  ('system.maintenance_mode',      'false'::jsonb,  'boolean',
    'Platform-wide maintenance banner. Broadcasts nerium.system.maintenance_mode_changed on flip.',
    'eunomia', ARRAY['ops', 'exposed_to_user'])
ON CONFLICT (flag_name) DO UPDATE SET
  description = EXCLUDED.description,
  owner_agent = EXCLUDED.owner_agent,
  tags        = EXCLUDED.tags,
  kind        = EXCLUDED.kind,
  updated_at  = now();
-- default_value intentionally NOT refreshed on re-seed so admin tunings
-- persist across seed runs. Force-refresh via:
--   UPDATE hemera_flag SET default_value = '<new>'::jsonb WHERE flag_name = '<name>';

COMMIT;
