-- Hemera submission whitelist override seed.
--
-- Pre-submission, Ghaisan runs this after the real judge emails are
-- populated in ``app_user``. The script upserts permanent (no
-- ``expires_at``) ``builder.live = true`` overrides for each
-- whitelisted account so the gate stays closed for the public while
-- judges + Ghaisan + the demo user can exercise the Builder path.
--
-- The audit trigger records an ``override_created`` row for each
-- upserted override, with ``actor_user_id`` NULL (system seed).
--
-- Usage
-- -----
-- ::
--     psql "$NERIUM_DATABASE_MIGRATION_URL" \
--          -v judges_emails="'judge1@example.com','judge2@example.com'" \
--          -f src/backend/db/seed/submission_whitelist_overrides.sql
--
-- Whitelist sources
-- -----------------
-- - ``ghaisan@nerium.com``           : owner, always on.
-- - ``demo@nerium.com``              : demo walkthrough user.
-- - ``:judges_emails``               : comma-separated emails passed at
--   invocation time via ``psql -v judges_emails="'a@x','b@y'"``. Leave
--   empty for internal runs.
--
-- Contract: docs/contracts/feature_flag.contract.md Section 4.5.

\set ON_ERROR_STOP on

\if :{?judges_emails}
\else
  \set judges_emails ''''''
\endif

BEGIN;

WITH whitelist(email) AS (
  SELECT unnest(ARRAY[
    'ghaisan@nerium.com',
    'demo@nerium.com'
  ]::text[])
  UNION
  SELECT unnest(string_to_array(:judges_emails, ',')::text[])
  WHERE length(trim(:judges_emails)) > 0
),
targets AS (
  SELECT u.id AS user_id
  FROM app_user u
  JOIN whitelist w ON lower(trim(u.email)) = lower(trim(w.email))
)
INSERT INTO hemera_override (flag_name, scope_kind, scope_id, value, reason)
SELECT 'builder.live', 'user', t.user_id, 'true'::jsonb, 'whitelist_submission'
FROM targets t
ON CONFLICT (flag_name, scope_kind, scope_id) DO UPDATE SET
  value      = EXCLUDED.value,
  reason     = EXCLUDED.reason,
  expires_at = NULL,  -- explicitly lift any prior expiry
  updated_at = now();

COMMIT;
