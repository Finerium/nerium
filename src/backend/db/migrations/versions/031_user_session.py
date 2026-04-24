"""user_session table: persistent refresh-token chain backing store.

Revision ID: 031_user_session
Revises: 030_app_user_extensions
Create Date: 2026-04-24 19:35:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/redis_session.contract.md Section 3.2 sess:* Redis KV
      cache (30 d TTL). This Postgres table is the durable fallback that
      survives Redis AOF gaps.
    - docs/contracts/oauth_dcr.contract.md refresh token family + rotation.
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Distinct from Redis ``sess:<token>`` (30 d KV cache managed by
``src.backend.redis_client``) AND distinct from Khronos's OAuth
``oauth_refresh_token`` chain (owned separately in
``src/backend/auth/refresh_chain.py``). ``user_session`` is the NERIUM
web session table: one row per logged-in browser / tauri client. Stores
only the SHA-256 hash of the refresh token (opaque token lives in the
cookie + Redis cache), the UA + IP fingerprint, and expiry markers so
operators can audit and revoke sessions from the admin panel.

Design notes
------------
- ``token_hash`` is the sha256 of the opaque refresh token. We NEVER
  store the plaintext token in Postgres. Redis stores the plaintext-keyed
  row for sub-ms cookie lookup; Postgres stores the hashed row for
  durability + revocation audit.
- ``revoked_at`` is a soft flag; the session row remains for audit
  trail (ops dashboard surfaces revoked sessions under a "recently
  revoked" filter). Hard delete runs after 180 d via a GDPR cron (Moros).
- The UNIQUE on ``token_hash`` is partial (WHERE revoked_at IS NULL) so a
  rotated chain can reuse hashes after revocation if collision ever
  happens (cryptographically negligible but defensive).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "031_user_session"
down_revision: Union[str, Sequence[str], None] = "030_app_user_extensions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create user_session with indexes, grants, RLS, and updated_at trigger."""

    op.execute(
        """
        CREATE TABLE user_session (
            id            uuid PRIMARY KEY,
            tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            token_hash    text NOT NULL,
            user_agent    text,
            ip_address    inet,
            expires_at    timestamptz NOT NULL,
            revoked_at    timestamptz,
            last_seen_at  timestamptz NOT NULL DEFAULT now(),
            metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    # Partial unique on active rows keeps the hashed lookup O(log n) while
    # letting revoked rows linger for audit without violating uniqueness.
    op.execute(
        "CREATE UNIQUE INDEX idx_user_session_token_hash_active "
        "ON user_session(token_hash) WHERE revoked_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_user_session_tenant_user_expires "
        "ON user_session(tenant_id, user_id, expires_at)"
    )
    op.execute(
        "CREATE INDEX idx_user_session_tenant_created "
        "ON user_session(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_user_session_expires_active "
        "ON user_session(expires_at) WHERE revoked_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_user_session_revoked "
        "ON user_session(revoked_at) WHERE revoked_at IS NOT NULL"
    )

    # RLS + grants via shared helper.
    for sql in enable_tenant_rls("user_session"):
        op.execute(sql)
    for sql in grant_app_role_crud("user_session"):
        op.execute(sql)

    # Attach the shared updated_at trigger installed in 030.
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_user_session_set_updated_at ON user_session;
        CREATE TRIGGER trg_user_session_set_updated_at
          BEFORE UPDATE ON user_session
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade: detach trigger, drop RLS, drop indexes, drop table."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_user_session_set_updated_at ON user_session"
    )
    for sql in disable_tenant_rls("user_session"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_user_session_revoked")
    op.execute("DROP INDEX IF EXISTS idx_user_session_expires_active")
    op.execute("DROP INDEX IF EXISTS idx_user_session_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_user_session_tenant_user_expires")
    op.execute("DROP INDEX IF EXISTS idx_user_session_token_hash_active")
    op.execute("DROP TABLE IF EXISTS user_session")
