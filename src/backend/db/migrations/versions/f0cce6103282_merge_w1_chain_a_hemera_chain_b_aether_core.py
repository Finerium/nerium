"""merge W1 chain A hemera + chain B aether core

Revision ID: f0cce6103282
Revises: 025_hemera_flags, 038_vendor_adapter
Create Date: 2026-04-24 10:31:00.740693+00:00

Author: TODO set agent name
Contract refs: docs/contracts/postgres_multi_tenant.contract.md
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0cce6103282'
down_revision: Union[str, Sequence[str], None] = ('025_hemera_flags', '038_vendor_adapter')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
