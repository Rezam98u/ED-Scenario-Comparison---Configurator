"""EnergyDataset params and unique period

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-24 18:01:33.434414

The table now holds one row per imported period. "params" stores the import settings
(location, kWp, tilt, azimuth, PR, annual kWh), so the same dates with other settings
are a different dataset. The unique index makes importing the same period twice reuse
the existing row. Rows from before this migration have params NULL and never match.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('ALTER TABLE "EnergyDataset" ADD COLUMN "params" JSONB')
    op.execute(
        'CREATE UNIQUE INDEX "EnergyDataset_period_key" '
        'ON "EnergyDataset" ("rangeStart", "rangeEnd", "params")'
    )


def downgrade() -> None:
    op.execute('DROP INDEX "EnergyDataset_period_key"')
    op.execute('ALTER TABLE "EnergyDataset" DROP COLUMN "params"')
