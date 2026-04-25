"""Crius W2 NP P5 Session 1: vendor_adapter_catalog global registry.

Revision ID: 053_crius_vendor_adapter
Revises: 052_tethys_agent_identity_ed25519
Create Date: 2026-04-25 14:00:00.000000

Author: Crius (W2 NP P5 Session 1).

Contract refs
-------------
- docs/contracts/vendor_adapter.contract.md Section 3 (multi-vendor
  registry; tenant-scoped overrides table 038 stays untouched, this
  migration introduces the GLOBAL platform catalogue per Section 3.1
  ``tenant_id IS NULL`` semantics).
- docs/contracts/feature_flag.contract.md (Hemera vendor.* kill switch
  flag namespace consumed by Crius dispatcher).

Scope
-----
Creates ``vendor_adapter_catalog`` as a GLOBAL (non-tenant-scoped)
table that lists every vendor adapter the Crius dispatcher recognises:
slug, display name, adapter type, opt-in metadata, enabled flag. The
existing tenant-scoped ``vendor_adapter`` (038) is preserved as-is for
S2 envelope-encryption per-tenant API key storage; this S1 migration
ships the catalogue surface only.

Why a separate table
--------------------
- 038 ``vendor_adapter`` is tenant-scoped with NOT NULL ``tenant_id``
  and forced RLS. Platform catalogue rows have no tenant; they
  describe code-side adapters available to every tenant. Adding
  nullable ``tenant_id`` to 038 would silently break the existing
  RLS USING clause (``tenant_id = current_setting(...)::uuid`` is
  never true for NULL) so we ship a clean global table instead.
- Pythia contract Section 3.1 already anticipated this split:
  "vendor_adapter_config is a GLOBAL table for tenant_id IS NULL
  (platform defaults) plus tenant-scoped rows for user-managed keys."
  Crius S1 ships the GLOBAL projection; tenant overrides remain in
  the existing 038 surface for S2.

API key storage
---------------
``vendor_adapter_catalog.config_json`` stores NON-SECRET vendor
configuration only (e.g. default model id, base URL override). Real
secrets (API keys) live in environment variables loaded by the
adapter at request time. Per-record AES-256-GCM envelope encryption
(KEK + DEK) is the S2 deliverable; S1 keeps the catalogue secret-free
so the seed rows ship safely without a live KEK provisioned.

Seed data
---------
Four catalogue rows seeded inside this migration:
- ``anthropic`` (enabled, chat) - primary per anti-pattern 7.
- ``stub`` (enabled, chat) - deterministic offline test adapter.
- ``openai`` (disabled, chat) - scaffold; raises NotImplementedError.
- ``google`` (disabled, chat) - scaffold; raises NotImplementedError.

Idempotent ON CONFLICT DO NOTHING so a re-run never duplicates rows.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "053_crius_vendor_adapter"
down_revision: str | Sequence[str] | None = "052_tethys_agent_identity_ed25519"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create vendor_adapter_catalog GLOBAL table + indexes + seed rows."""

    op.execute(
        """
        CREATE TABLE vendor_adapter_catalog (
            vendor_id      uuid PRIMARY KEY,
            vendor_slug    text NOT NULL UNIQUE,
            display_name   text NOT NULL,
            adapter_type   text NOT NULL,
            config_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
            enabled        boolean NOT NULL DEFAULT true,
            created_at     timestamptz NOT NULL DEFAULT now(),
            updated_at     timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    # Lookups by enabled subset are the hot path for ``GET /v1/protocol/vendors``
    # so a partial index on enabled rows keeps the catalogue scan tight.
    op.execute(
        "CREATE INDEX idx_vendor_adapter_catalog_enabled "
        "ON vendor_adapter_catalog(adapter_type, vendor_slug) "
        "WHERE enabled = true"
    )

    # The catalogue is GLOBAL but the app role still needs explicit grants
    # because Postgres does not infer privileges from absence of RLS.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE "
        "ON TABLE vendor_adapter_catalog TO nerium_api"
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_vendor_adapter_catalog_set_updated_at
            ON vendor_adapter_catalog;
        CREATE TRIGGER trg_vendor_adapter_catalog_set_updated_at
          BEFORE UPDATE ON vendor_adapter_catalog
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )

    # Seed catalogue rows. Deterministic UUID v7-shaped constants so
    # tests and downstream agents can reference known ids without a
    # round-trip read. Version nibble is 0x7 + variant 0b10 like the
    # demo seed values in src/backend/db/seed.py.
    seed_rows = [
        (
            "01926f00-4444-7a44-8444-000000000001",
            "anthropic",
            "Anthropic Claude",
            "chat",
            '{"default_model": "claude-opus-4-7"}',
            True,
        ),
        (
            "01926f00-4444-7a44-8444-000000000002",
            "stub",
            "Stub Echo Adapter",
            "chat",
            '{"deterministic": true}',
            True,
        ),
        (
            "01926f00-4444-7a44-8444-000000000003",
            "openai",
            "OpenAI GPT",
            "chat",
            '{"default_model": "gpt-4o"}',
            False,
        ),
        (
            "01926f00-4444-7a44-8444-000000000004",
            "google",
            "Google Gemini",
            "chat",
            '{"default_model": "gemini-1.5-pro"}',
            False,
        ),
    ]
    for vendor_id, slug, display, adapter_type, config, enabled in seed_rows:
        op.execute(
            f"""
            INSERT INTO vendor_adapter_catalog (
                vendor_id, vendor_slug, display_name,
                adapter_type, config_json, enabled
            )
            VALUES (
                '{vendor_id}'::uuid, '{slug}', '{display}',
                '{adapter_type}', '{config}'::jsonb, {str(enabled).lower()}
            )
            ON CONFLICT (vendor_slug) DO NOTHING
            """
        )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_vendor_adapter_catalog_set_updated_at "
        "ON vendor_adapter_catalog"
    )
    op.execute("DROP INDEX IF EXISTS idx_vendor_adapter_catalog_enabled")
    op.execute("DROP TABLE IF EXISTS vendor_adapter_catalog")
