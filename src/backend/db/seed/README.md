# Hemera flag seed files

This directory holds idempotent SQL seed scripts for the Hemera feature
flag service. They complement (but do not replace) the Python demo seed
at `src/backend/db/seed.py` which populates the full NP demo dataset.

## Files

- `default_flags.sql`. the 25-flag default catalogue. Apply after
  `alembic upgrade head` on fresh DBs; safe to re-run against live DBs
  (preserves admin-tuned `default_value` on conflict).
- `submission_whitelist_overrides.sql`. permanent `builder.live=true`
  overrides for judges + Ghaisan + demo. Apply just before submission.

## Apply order

1. `alembic upgrade head` (creates tables + triggers).
2. `psql "$NERIUM_DATABASE_MIGRATION_URL" -f default_flags.sql`.
3. `psql "$NERIUM_DATABASE_MIGRATION_URL" -v judges_emails="'judge1@example.com','judge2@example.com'" -f submission_whitelist_overrides.sql`.

## Re-seed semantics

- `default_flags.sql` uses `ON CONFLICT (flag_name) DO UPDATE SET
  description, owner_agent, tags, kind, updated_at` but intentionally
  preserves `default_value` on re-seed so admin tunings do not revert.
  Force-refresh via a direct UPDATE statement.
- `submission_whitelist_overrides.sql` uses `ON CONFLICT (flag_name,
  scope_kind, scope_id) DO UPDATE SET value, reason, expires_at,
  updated_at` so re-running extends coverage and lifts any prior
  expiry on the whitelist rows.
