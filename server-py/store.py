"""Data access for the two tables, shared by the API routes (main.py) and the AI agent
(agent.py). Tests replace load_dataset, fetch_scenarios and insert_scenario, so these
are the only functions that touch the database.
"""

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional, Union

import psycopg
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, StrictFloat, StrictInt

from db import connect

logger = logging.getLogger(__name__)

# --- Types (mirror shared/types.ts) ------------------------------------------

# TypeScript has one `number` type, Python has int and float. Strict types reject
# "5" and true (plain Pydantic would convert them), and an int stays an int,
# so 5 is sent back as 5 (not 5.0), like Express.
JsonNumber = Union[StrictInt, StrictFloat]


class Kpis(BaseModel):
    total_consumption_kwh: JsonNumber
    pv_coverage_pct: JsonNumber
    co2_savings_ton: JsonNumber


class SavedScenario(BaseModel):
    id: str
    pvKw: JsonNumber
    kpis: Kpis
    savedAt: str
    datasetId: str  # the period the KPIs were calculated for


# --- Helpers -----------------------------------------------------------------

DATABASE_ERROR = "Database error. Check DATABASE_URL and that PostgreSQL is running."
NO_DATA_ERROR = "No energy data. Run migrations and seed."


def database_error() -> HTTPException:
    logger.exception("Database error")  # like console.error(err), with traceback
    # Same message as Express (here the variable is DATABASE_URL_PY)
    return HTTPException(status_code=500, detail=DATABASE_ERROR)


def js_number(value: float) -> JsonNumber:
    """Postgres DOUBLE PRECISION comes back as float; JS prints 5.0 as 5, so do the same."""
    return int(value) if value.is_integer() else value


def to_js_iso(value: datetime) -> str:
    """Same format as JS Date.toISOString(): 2025-01-01T12:00:00.000Z"""
    return value.isoformat(timespec="milliseconds") + "Z"


# --- EnergyDataset -----------------------------------------------------------


# The table holds one row per imported period. Without a dataset id, the API uses the
# oldest row (the default), so importing a new period never changes what users see.

DATASET_NOT_FOUND = "Dataset not found."

# Quoted names because Prisma created them case-sensitive
SUMMARY_COLUMNS = 'id, label, "rangeStart", "rangeEnd", params, "createdAt"'


def load_dataset(dataset_id: Optional[str] = None) -> dict:
    """Read one EnergyDataset row (the oldest when dataset_id is None).

    Raises HTTPException 500 (database) or 404 (empty table / unknown id).
    """
    columns = 'SELECT timestamps, baseline, scenario, kpis FROM "EnergyDataset" '
    try:
        with connect() as conn:
            if dataset_id is None:
                row = conn.execute(columns + 'ORDER BY "createdAt" ASC LIMIT 1').fetchone()
            else:
                row = conn.execute(columns + "WHERE id = %s", (dataset_id,)).fetchone()
    except psycopg.Error:
        raise database_error()

    # Checked outside the try, so this 404 can't be turned into a 500
    if row is None:
        raise HTTPException(
            status_code=404, detail=NO_DATA_ERROR if dataset_id is None else DATASET_NOT_FOUND
        )

    # psycopg already decodes JSONB columns into Python lists and dicts
    return {
        "timestamps": row["timestamps"],
        "baseline": row["baseline"],
        "scenario": row["scenario"],
        "kpis": row["kpis"],
    }


def to_summary(row: dict) -> dict:
    """A dataset without its hourly values, as listed by GET /api/energy/datasets."""
    return {
        "id": row["id"],
        "label": row["label"],
        "start": row["rangeStart"].isoformat(),
        "end": row["rangeEnd"].isoformat(),
        "params": row["params"],
        "createdAt": to_js_iso(row["createdAt"]),
    }


def list_datasets() -> list[dict]:
    """All datasets, oldest first, so the first one is the default."""
    try:
        with connect() as conn:
            rows = conn.execute(
                f'SELECT {SUMMARY_COLUMNS} FROM "EnergyDataset" ORDER BY "createdAt" ASC'
            ).fetchall()
    except psycopg.Error:
        raise database_error()
    return [to_summary(r) for r in rows]


def find_dataset(start: date, end: date, params: dict) -> Optional[dict]:
    """The dataset already imported for this period and these settings, if any."""
    try:
        with connect() as conn:
            row = conn.execute(
                f'SELECT {SUMMARY_COLUMNS} FROM "EnergyDataset" '
                'WHERE "rangeStart" = %s AND "rangeEnd" = %s AND params = %s',
                (start, end, Jsonb(params)),
            ).fetchone()
    except psycopg.Error:
        raise database_error()
    return to_summary(row) if row else None


def insert_dataset(row: dict) -> dict:
    """Insert an imported period and return its summary. If the same period and settings
    were inserted in the meantime, return that one instead (unique index)."""
    try:
        with connect() as conn:
            inserted = conn.execute(
                'INSERT INTO "EnergyDataset" '
                '(id, label, "rangeStart", "rangeEnd", params, timestamps, baseline, scenario, kpis) '
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                f"ON CONFLICT DO NOTHING RETURNING {SUMMARY_COLUMNS}",
                (
                    str(uuid.uuid4()), row["label"], row["rangeStart"], row["rangeEnd"],
                    Jsonb(row["params"]), Jsonb(row["timestamps"]), Jsonb(row["baseline"]),
                    Jsonb(row["scenario"]), Jsonb(row["kpis"]),
                ),
            ).fetchone()
    except psycopg.Error:
        raise database_error()
    return to_summary(inserted) if inserted else find_dataset(
        row["rangeStart"], row["rangeEnd"], row["params"]
    )


# --- SavedScenario -----------------------------------------------------------


def fetch_scenarios() -> list[SavedScenario]:
    try:
        with connect() as conn:
            rows = conn.execute(
                'SELECT id, "pvKw", kpis, "savedAt", "datasetId" FROM "SavedScenario" '
                'ORDER BY "savedAt" DESC'
            ).fetchall()
    except psycopg.Error:
        raise database_error()
    return [
        SavedScenario(
            id=r["id"], pvKw=js_number(r["pvKw"]), kpis=r["kpis"],
            savedAt=to_js_iso(r["savedAt"]), datasetId=r["datasetId"],
        )
        for r in rows
    ]


def insert_scenario(
    id: str, pv_kw: JsonNumber, kpis: Kpis, saved_at: datetime, dataset_id: Optional[str]
) -> str:
    """Insert a scenario for the given dataset (None = the default one) and return the
    dataset id it was linked to. Raises HTTPException 404 for an unknown dataset id."""
    try:
        with connect() as conn:
            # One statement picks the dataset and inserts, so it can't change in between
            row = conn.execute(
                'INSERT INTO "SavedScenario" (id, "pvKw", kpis, "savedAt", "datasetId") '
                'SELECT %s, %s, %s, %s, id FROM "EnergyDataset" '
                'WHERE id = %s OR %s::text IS NULL ORDER BY "createdAt" ASC LIMIT 1 '
                'RETURNING "datasetId"',
                (id, pv_kw, Jsonb(kpis.model_dump()), saved_at, dataset_id, dataset_id),
            ).fetchone()
    except psycopg.Error:
        raise database_error()
    if row is None:
        raise HTTPException(
            status_code=404, detail=NO_DATA_ERROR if dataset_id is None else DATASET_NOT_FOUND
        )
    return row["datasetId"]


def add_scenario(pv_kw: JsonNumber, kpis: Kpis, dataset_id: Optional[str] = None) -> SavedScenario:
    """Save a scenario for a dataset (None = the default one)."""
    scenario_id = str(uuid.uuid4())  # crypto.randomUUID() is a v4 UUID too
    # Stored as UTC without a time zone, in milliseconds (like Prisma's DateTime). Cut
    # to milliseconds here, so the response matches what is read back later.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    saved_at = now.replace(microsecond=now.microsecond // 1000 * 1000)

    linked_id = insert_scenario(scenario_id, pv_kw, kpis, saved_at, dataset_id)
    return SavedScenario(
        id=scenario_id, pvKw=pv_kw, kpis=kpis, savedAt=to_js_iso(saved_at), datasetId=linked_id
    )
