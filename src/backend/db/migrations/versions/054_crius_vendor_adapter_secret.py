"""Crius W2 NP P5 Session 2: vendor_adapter_secret tenant API key envelope store.

Revision ID: 054_crius_vendor_adapter_secret
Revises: 053_crius_vendor_adapter
Create Date: 2026-04-25 18:30:00.000000

Author: Crius (W2 NP P5 Session 2).

Contract refs
-------------
- docs/contracts/vendor_adapter.contract.md Section 3.2 envelope
  encryption (KEK + DEK + AES-256-GCM + RFC 5649 wrap).
- docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Adds a fresh tenant-scoped table ``vendor_adapter_secret`` for the
per-record AES-256-GCM envelope encryption of tenant-supplied vendor
API keys. The legacy 038 ``vendor_adapter`` table stays as-is for the
Aether scaffold + Pythia tenant override projection; 054 introduces a
clean surface owned wholly by Crius S2 so the envelope columns
(``ciphertext``, ``nonce``, ``wrapped_dek``) live on a single row
referenced by ``(tenant_id, vendor_slug)``.

Why a separate table
--------------------
- 038 ``vendor_adapter`` has ``config_encrypted`` + ``dek_wrapped`` as
  NOT NULL bytea placeholders but no ``nonce`` column. An ALTER would
  break the existing scaffold semantics (NOT NULL nonce on legacy rows).
- The S2 wire shape needs three blobs: ciphertext (with appended
  GCM tag), nonce, wrapped DEK. Plus a ``last_4`` echo for the list
  surface so admins can identify a key without decryption.
- Per-record metadata (``kek_kid``) stays nullable to support the
  post-S2 dual-KEK rotation grace window without a follow-up ALTER.

Schema
------
``vendor_adapter_secret``::

    id              uuid PRIMARY KEY
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE
    vendor_slug     text NOT NULL          -- references vendor_adapter_catalog.vendor_slug
    secret_ciphertext  bytea NOT NULL       -- AES-256-GCM ct + tag
    secret_nonce       bytea NOT NULL       -- 12-byte GCM nonce
    secret_wrapped_dek bytea NOT NULL       -- RFC 5649 wrapped DEK
    last_4          text NOT NULL          -- non-secret echo for the list UI
    kek_kid         text                   -- nullable; populated post-rotation
    created_at      timestamptz NOT NULL DEFAULT now()
    updated_at      timestamptz NOT NULL DEFAULT now()
    UNIQUE (tenant_id, vendor_slug)

RLS
---
Enable canonical tenant_isolation policy via the shared helper. The
unique constraint scopes one secret per (tenant, vendor) pair so a
re-register replaces (DELETE + INSERT) the prior row deterministically;
no per-row history is retained at S2 (the post-S2 audit log inherits
the existing ``vendor_adapter_audit`` table from 038 for actions like
``rotate_key``).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from src.backend.db.rls import (
    disable_tenant_rls,
    enable_tenant_rls,
    grant_app_role_crud,
)

# revision identifiers, used by Alembic.
revision: str = "054_crius_vendor_adapter_secret"
down_revision: str | Sequence[str] | None = "053_crius_vendor_adapter"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create vendor_adapter_secret + indexes + tenant RLS + grants + trigger."""

    op.execute(
        """
        CREATE TABLE vendor_adapter_secret (
            id                  uuid PRIMARY KEY,
            tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            vendor_slug         text NOT NULL,
            secret_ciphertext   bytea NOT NULL,
            secret_nonce        bytea NOT NULL,
            secret_wrapped_dek  bytea NOT NULL,
            last_4              text NOT NULL,
            kek_kid             text,
            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, vendor_slug)
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_vendor_adapter_secret_tenant_created "
        "ON vendor_adapter_secret(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_vendor_adapter_secret_tenant_slug "
        "ON vendor_adapter_secret(tenant_id, vendor_slug)"
    )

    for sql in enable_tenant_rls("vendor_adapter_secret"):
        op.execute(sql)
    for sql in grant_app_role_crud("vendor_adapter_secret"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_vendor_adapter_secret_set_updated_at
            ON vendor_adapter_secret;
        CREATE TRIGGER trg_vendor_adapter_secret_set_updated_at
          BEFORE UPDATE ON vendor_adapter_secret
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_vendor_adapter_secret_set_updated_at "
        "ON vendor_adapter_secret"
    )
    for sql in disable_tenant_rls("vendor_adapter_secret"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_vendor_adapter_secret_tenant_slug")
    op.execute("DROP INDEX IF EXISTS idx_vendor_adapter_secret_tenant_created")
    op.execute("DROP TABLE IF EXISTS vendor_adapter_secret")
