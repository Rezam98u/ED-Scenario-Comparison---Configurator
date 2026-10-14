"""FastAPI port of the Express backend in server/ (same endpoints, same JSON).

Run from server-py/:  uvicorn main:app --reload   (http://localhost:8000, docs at /docs)
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Union

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, StrictFloat, StrictInt
from starlette.exceptions import HTTPException as StarletteHTTPException

# Prisma's DATABASE_URL ends with "?schema=public", which psycopg does not accept,
# so the Python backend reads its own variable.
DATABASE_URL = os.environ.get(
    "DATABASE_URL_PY", "postgresql://postgres:postgres@localhost:5432/energy_dashboard"
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Energy API (FastAPI)")

# Same origins as server/src/index.ts. Express's cors() allows all methods and headers
# by default; Starlette's CORSMiddleware only allows GET unless we say otherwise.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class NewScenario(BaseModel):
    """Request body of POST /api/energy/scenarios."""

    pvKw: JsonNumber
    kpis: Kpis


# --- Error contract ----------------------------------------------------------
# src/api/energyApi.ts reads body.error, so every error must be { "error": "..." }
# instead of FastAPI's default { "detail": ... }.


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Handles our own `raise HTTPException(...)` and FastAPI's 404/405 for unknown routes.
    return JSONResponse(
        status_code=exc.status_code, content={"error": exc.detail}, headers=exc.headers
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # FastAPI would answer 422 with a list of details; Express answers 400 with one message.
    return JSONResponse(
        status_code=400, content={"error": "pvKw (number) and kpis (object) are required"}
    )


# --- Routes ------------------------------------------------------------------

# In-memory store for saved scenarios (resets on server restart)
saved_scenarios: list[SavedScenario] = []


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/energy/scenarios", response_model=list[SavedScenario])
def list_scenarios():
    return saved_scenarios


@app.post("/api/energy/scenarios", status_code=201, response_model=SavedScenario)
def save_scenario(body: NewScenario):
    # Express checks typeof by hand. Here FastAPI has already validated the body
    # against NewScenario; an invalid body never gets here (see the 400 handler).
    scenario = SavedScenario(
        id=str(uuid.uuid4()),  # crypto.randomUUID() is a v4 UUID too
        pvKw=body.pvKw,
        kpis=body.kpis,
        # Same format as JS new Date().toISOString(): 2025-01-01T12:00:00.000Z
        savedAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    )
    saved_scenarios.insert(0, scenario)  # insert(0, ...) is JS unshift(): newest first
    return scenario


@app.get("/api/energy")
def get_energy():
    # A plain `def` (not `async def`) runs in a worker thread, so the blocking
    # psycopg calls do not freeze the server.
    try:
        # connect_timeout=5 is the same as Prisma's default connection timeout
        with psycopg.connect(DATABASE_URL, connect_timeout=5, row_factory=dict_row) as conn:
            row = conn.execute(
                # Quoted names because Prisma created them case-sensitive
                'SELECT timestamps, baseline, scenario, kpis FROM "EnergyDataset" '
                'ORDER BY "createdAt" ASC LIMIT 1'
            ).fetchone()
    except psycopg.Error:
        logger.exception("Database error")  # like console.error(err), with traceback
        # Same message as Express (here the variable is DATABASE_URL_PY)
        raise HTTPException(
            status_code=500,
            detail="Database error. Check DATABASE_URL and that PostgreSQL is running.",
        )

    # Checked outside the try, so this 404 can't be turned into a 500
    if row is None:
        raise HTTPException(status_code=404, detail="No energy data. Run migrations and seed.")

    # psycopg already decodes JSONB columns into Python lists and dicts
    return {
        "timestamps": row["timestamps"],
        "baseline": row["baseline"],
        "scenario": row["scenario"],
        "kpis": row["kpis"],
    }
