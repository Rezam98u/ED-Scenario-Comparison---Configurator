"""drop Prisma bookkeeping table

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-24 17:51:51.334241

Databases that Prisma set up before this branch switched to Alembic still have
_prisma_migrations. Nothing on this branch uses Prisma any more, so it goes.
A fresh database never had it (IF EXISTS).
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "_prisma_migrations"')


def downgrade() -> None:
    # Prisma's migration history cannot be rebuilt here, and nothing needs it
    pass
