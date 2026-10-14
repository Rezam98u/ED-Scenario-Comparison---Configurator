# FastAPI port of the Express backend (server/src/index.ts + server/src/routes/energy.ts).
# Same endpoints, same JSON, same { "error": ... } error shape, so the React frontend works unchanged.

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Union

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StrictFloat, StrictInt
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("energy-api")

# Prisma's DATABASE_URL ends with ?schema=public, which psycopg rejects, so we use our own variable.
DATABASE_URL = os.environ.get(
    "DATABASE_URL_PY", "postgresql://postgres:postgres@localhost:5432/energy_dashboard"
)


# --- Types (mirror shared/types.ts) ---------------------------------------------------------

class Kpis(BaseModel):
    total_consumption_kwh: float
    pv_coverage_pct: float
    co2_savings_ton: float


class SavedScenario(BaseModel):
    id: str
    pvKw: float
    kpis: Kpis
    savedAt: str


class SaveScenarioRequest(BaseModel):
    # Strict types = no coercion: "5" or true are rejected, like `typeof pvKw !== 'number'` in Express.
    # The Union keeps 5 as 5 in the response (a plain float would turn it into 5.0).
    pvKw: Union[StrictInt, StrictFloat]
    # Express only checks "is a non-null object" and stores it as-is (`kpis as Kpis`),
    # so we accept any JSON object here instead of validating against Kpis.
    kpis: Dict[str, Any]


# --- App setup (equivalent of server/src/index.ts) ------------------------------------------

app = FastAPI(title="Energy API (FastAPI)")

# Same allowed origins as the Express cors() config
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
)


# FastAPI's default error body is { "detail": ... }; the frontend reads body.error, so we
# replace both default handlers to return { "error": ... } like Express.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# FastAPI validates the body before our function runs and would answer 422.
# Express does this check by hand and answers 400, so we convert it here.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=400, content={"error": "pvKw (number) and kpis (object) are required"}
    )


# --- Routes (equivalent of server/src/routes/energy.ts) -------------------------------------

# In-memory store for saved scenarios (resets on server restart)
saved_scenarios: List[Dict[str, Any]] = []


# `responses=` documents the shape in /docs without validating the output,
# just like the TS types only describe the data (Express never checks kpis fields).
@app.get("/api/energy/scenarios", responses={200: {"model": List[SavedScenario]}})
def list_scenarios():
    return saved_scenarios


@app.post("/api/energy/scenarios", status_code=201, responses={201: {"model": SavedScenario}})
def save_scenario(body: SaveScenarioRequest):
    # By the time we get here FastAPI has already validated the body (Express does it by hand).
    scenario = {
        "id": str(uuid.uuid4()),
        "pvKw": body.pvKw,
        "kpis": body.kpis,
        # Same format as JS new Date().toISOString(): 2025-01-01T12:00:00.000Z
        "savedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }
    saved_scenarios.insert(0, scenario)  # insert(0, ...) = JS unshift (newest first)
    return scenario


def fetch_oldest_dataset():
    """Return the oldest EnergyDataset row as a dict, or None if the table is empty."""
    # Prisma creates quoted, case-sensitive names, so "EnergyDataset" and "createdAt" need quotes.
    # psycopg decodes JSONB columns into Python lists/dicts automatically.
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        row = conn.execute(
            'SELECT timestamps, baseline, scenario, kpis FROM "EnergyDataset" '
            'ORDER BY "createdAt" ASC LIMIT 1'
        ).fetchone()
    if row is None:
        return None
    timestamps, baseline, scenario, kpis = row
    return {"timestamps": timestamps, "baseline": baseline, "scenario": scenario, "kpis": kpis}


@app.get("/api/energy")
def get_energy():
    try:
        data = fetch_oldest_dataset()
    except Exception:
        logger.exception("Database error")  # like console.error(err)
        return JSONResponse(
            status_code=500,
            content={"error": "Database error. Check DATABASE_URL and that PostgreSQL is running."},
        )

    if data is None:
        return JSONResponse(status_code=404, content={"error": "No energy data. Run migrations and seed."})

    return data


@app.get("/health")
def health():
    return {"ok": True}
