"""FastAPI port of the Express backend in server/ (same endpoints, same JSON).

Run from server-py/:  uvicorn main:app --reload   (http://localhost:8000, docs at /docs)
"""

import logging
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Union

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, StrictFloat, StrictInt
from starlette.exceptions import HTTPException as StarletteHTTPException

from analysis import analyze_baseline
from calculations import calculate_scenario

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


class TimeSeries(BaseModel):
    consumption: list[JsonNumber]
    pv_generation: list[JsonNumber]


class CalculateRequest(BaseModel):
    """Request body of POST /api/energy/calculate."""

    pvKw: JsonNumber


class ScenarioResult(BaseModel):
    """Response of POST /api/energy/calculate (ScenarioResult in src/types/energy.ts)."""

    scenario: TimeSeries
    kpis: Kpis


class DailyStats(BaseModel):
    date: str  # YYYY-MM-DD (UTC day)
    consumption_kwh: float
    pv_kwh: float
    self_consumed_kwh: float
    autarky_pct: float


class HourlyProfilePoint(BaseModel):
    hour: int  # 0-23 (UTC)
    consumption_kwh: float
    pv_kwh: float


class AnalysisResponse(BaseModel):
    """Response of GET /api/energy/analysis."""

    daily: list[DailyStats]
    hourlyProfile: list[HourlyProfilePoint]
    peakConsumptionHour: Optional[int]  # None only when the dataset has no hours
    peakPvHour: Optional[int]


# --- Error contract ----------------------------------------------------------
# src/api/energyApi.ts reads body.error, so every error must be { "error": "..." }
# instead of FastAPI's default { "detail": ... }.


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Handles our own `raise HTTPException(...)` and FastAPI's 404/405 for unknown routes.
    return JSONResponse(
        status_code=exc.status_code, content={"error": exc.detail}, headers=exc.headers
    )


# One message per endpoint. Paths not listed keep the message Express uses for
# POST /api/energy/scenarios.
DEFAULT_VALIDATION_ERROR = "pvKw (number) and kpis (object) are required"
VALIDATION_ERRORS = {
    "/api/energy/calculate": "pvKw (number) is required",
}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # FastAPI would answer 422 with a list of details; Express answers 400 with one message.
    message = VALIDATION_ERRORS.get(request.url.path, DEFAULT_VALIDATION_ERROR)
    return JSONResponse(status_code=400, content={"error": message})


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


def load_dataset() -> dict:
    """Read the oldest EnergyDataset row. Raises HTTPException 500 (database) or 404 (empty).

    Kept separate from the routes so tests can replace it without a database.
    """
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


@app.get("/api/energy")
def get_energy():
    # A plain `def` (not `async def`) runs in a worker thread, so the blocking
    # psycopg calls do not freeze the server.
    return load_dataset()


@app.post("/api/energy/calculate", response_model=ScenarioResult)
def calculate(body: CalculateRequest):
    # Python's JSON parser accepts NaN and Infinity (JSON itself does not), so reject them
    if not math.isfinite(body.pvKw):
        raise RequestValidationError([])
    # Checked before loading, so a negative value is a 400 even if the database is down
    if body.pvKw < 0:
        raise HTTPException(status_code=400, detail="PV capacity cannot be negative")

    dataset = load_dataset()
    return calculate_scenario(dataset["baseline"], body.pvKw)


@app.get("/api/energy/analysis", response_model=AnalysisResponse)
def get_analysis():
    result = analyze_baseline(load_dataset())
    # analysis.py uses Python names; the API uses camelCase like the rest of the JSON
    return {
        "daily": result["daily"],
        "hourlyProfile": result["hourly_profile"],
        "peakConsumptionHour": result["peak_consumption_hour"],
        "peakPvHour": result["peak_pv_hour"],
    }
