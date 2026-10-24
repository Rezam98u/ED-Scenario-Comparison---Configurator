"""Data access for the two tables, shared by the API routes (main.py) and the AI agent
(agent.py). Tests replace load_dataset, fetch_scenarios and insert_scenario, so these
are the only functions that touch the database.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Union

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


def load_dataset() -> dict:
    """Read the oldest EnergyDataset row. Raises HTTPException 500 (database) or 404 (empty)."""
    try:
        with connect() as conn:
            row = conn.execute(
                # Quoted names because Prisma created them case-sensitive
                'SELECT timestamps, baseline, scenario, kpis FROM "EnergyDataset" '
                'ORDER BY "createdAt" ASC LIMIT 1'
            ).fetchone()
    except psycopg.Error:
        raise database_error()

    # Checked outside the try, so this 404 can't be turned into a 500
    if row is None:
        raise HTTPException(status_code=404, detail=NO_DATA_ERROR)

    # psycopg already decodes JSONB columns into Python lists and dicts
    return {
        "timestamps": row["timestamps"],
        "baseline": row["baseline"],
        "scenario": row["scenario"],
        "kpis": row["kpis"],
    }


# --- SavedScenario -----------------------------------------------------------


def fetch_scenarios() -> list[SavedScenario]:
    try:
        with connect() as conn:
            rows = conn.execute(
                'SELECT id, "pvKw", kpis, "savedAt" FROM "SavedScenario" ORDER BY "savedAt" DESC'
            ).fetchall()
    except psycopg.Error:
        raise database_error()
    return [
        SavedScenario(
            id=r["id"], pvKw=js_number(r["pvKw"]), kpis=r["kpis"], savedAt=to_js_iso(r["savedAt"])
        )
        for r in rows
    ]


def insert_scenario(id: str, pv_kw: JsonNumber, kpis: Kpis, saved_at: datetime) -> None:
    try:
        with connect() as conn:
            conn.execute(
                'INSERT INTO "SavedScenario" (id, "pvKw", kpis, "savedAt") VALUES (%s, %s, %s, %s)',
                (id, pv_kw, Jsonb(kpis.model_dump()), saved_at),
            )
    except psycopg.Error:
        raise database_error()


def add_scenario(pv_kw: JsonNumber, kpis: Kpis) -> SavedScenario:
    scenario_id = str(uuid.uuid4())  # crypto.randomUUID() is a v4 UUID too
    # Stored as UTC without a time zone, in milliseconds (like Prisma's DateTime). Cut
    # to milliseconds here, so the response matches what is read back later.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    saved_at = now.replace(microsecond=now.microsecond // 1000 * 1000)

    insert_scenario(scenario_id, pv_kw, kpis, saved_at)
    return SavedScenario(id=scenario_id, pvKw=pv_kw, kpis=kpis, savedAt=to_js_iso(saved_at))
