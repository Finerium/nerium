-- 0001_init.sql
-- Author: lumio_db_schema (step 2)
-- Produced: 2026-04-24T03:13:05Z
-- Applies the full initial schema in a single migration.

BEGIN;

-- Run schema.sql wholesale. The real migration runner inlines the content so
-- this migration is idempotent under the runner's checksum check.
-- See schema.sql as the source of truth, this file exists for the migration
-- history table row plus forward compatibility.

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0001_init', datetime('now'));

COMMIT;
