"""link SavedScenario to its dataset

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-24 18:19:47.340735

A saved scenario's KPIs belong to one period: "10 kW in August" and "10 kW in October"
are different results. Scenarios saved before this migration get the default (oldest)
dataset, the only one the dashboard could show when they were saved.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('ALTER TABLE "SavedScenario" ADD COLUMN "datasetId" TEXT')
    op.execute(
        'UPDATE "SavedScenario" SET "datasetId" = '
        '(SELECT id FROM "EnergyDataset" ORDER BY "createdAt" ASC LIMIT 1)'
    )
    op.execute('ALTER TABLE "SavedScenario" ALTER COLUMN "datasetId" SET NOT NULL')
    op.execute(
        'ALTER TABLE "SavedScenario" ADD CONSTRAINT "SavedScenario_datasetId_fkey" '
        'FOREIGN KEY ("datasetId") REFERENCES "EnergyDataset" (id)'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "SavedScenario" DROP COLUMN "datasetId"')
