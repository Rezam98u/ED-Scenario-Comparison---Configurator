"""create EnergyDataset and SavedScenario

Revision ID: 0001
Revises:
Create Date: 2026-10-24 17:40:45.964507

The same tables the Prisma migrations created before this branch switched to Alembic,
so a fresh database matches one that Prisma set up. A database that already has these
tables only needs `alembic stamp 0001`.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Quoted names keep Prisma's camelCase, which main.py's SQL relies on.
    # "EnergyDataset_key" (not _pkey) is the name the Prisma migration used.
    op.execute(
        """
        CREATE TABLE "EnergyDataset" (
            "id" TEXT NOT NULL,
            "label" TEXT NOT NULL DEFAULT 'default',
            "rangeStart" DATE NOT NULL,
            "rangeEnd" DATE NOT NULL,
            "timestamps" JSONB NOT NULL,
            "baseline" JSONB NOT NULL,
            "scenario" JSONB NOT NULL,
            "kpis" JSONB NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "EnergyDataset_key" PRIMARY KEY ("id")
        )
        """
    )
    op.execute(
        """
        CREATE TABLE "SavedScenario" (
            "id" TEXT NOT NULL,
            "pvKw" DOUBLE PRECISION NOT NULL,
            "kpis" JSONB NOT NULL,
            "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "SavedScenario_pkey" PRIMARY KEY ("id")
        )
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE "SavedScenario"')
    op.execute('DROP TABLE "EnergyDataset"')
