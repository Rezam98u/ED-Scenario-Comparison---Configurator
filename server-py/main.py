"""FastAPI backend: energy data, scenarios, analysis and the AI agent.

Run from server-py/:  uvicorn main:app --reload   (http://localhost:8000, docs at /docs)
"""

import logging
import math
import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

import agent
import store
from analysis import analyze_baseline
from calculations import calculate_scenario
from store import JsonNumber, Kpis, SavedScenario

logger = logging.getLogger(__name__)

app = FastAPI(title="Energy API (FastAPI)")

# Express's cors() allows all methods and headers by default; Starlette's
# CORSMiddleware only allows GET unless we say otherwise.
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


# --- Types (mirror shared/types.ts; Kpis and SavedScenario are in store.py) ---


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
# src/api/energyApi.ts and chatApi.ts read body.error, so every error must be
# { "error": "..." } instead of FastAPI's default { "detail": ... }.


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
    "/api/chat": "Invalid request body",
}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # FastAPI would answer 422 with a list of details; Express answers 400 with one message.
    message = VALIDATION_ERRORS.get(request.url.path, DEFAULT_VALIDATION_ERROR)
    return JSONResponse(status_code=400, content={"error": message})


# --- Routes ------------------------------------------------------------------
# Plain `def` (not `async def`) routes run in a worker thread, so the blocking
# psycopg and Groq calls do not freeze the server.


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/energy/scenarios", response_model=list[SavedScenario])
def list_scenarios():
    return store.fetch_scenarios()


@app.post("/api/energy/scenarios", status_code=201, response_model=SavedScenario)
def save_scenario(body: NewScenario):
    # FastAPI has already validated the body against NewScenario; an invalid body
    # never gets here (see the 400 handler).
    return store.add_scenario(body.pvKw, body.kpis)


@app.get("/api/energy")
def get_energy():
    return store.load_dataset()


@app.post("/api/energy/calculate", response_model=ScenarioResult)
def calculate(body: CalculateRequest):
    # Python's JSON parser accepts NaN and Infinity (JSON itself does not), so reject them
    if not math.isfinite(body.pvKw):
        raise RequestValidationError([])
    # Checked before loading, so a negative value is a 400 even if the database is down
    if body.pvKw < 0:
        raise HTTPException(status_code=400, detail="PV capacity cannot be negative")

    dataset = store.load_dataset()
    return calculate_scenario(dataset["baseline"], body.pvKw)


@app.get("/api/energy/analysis", response_model=AnalysisResponse)
def get_analysis():
    result = analyze_baseline(store.load_dataset())
    # analysis.py uses Python names; the API uses camelCase like the rest of the JSON
    return {
        "daily": result["daily"],
        "hourlyProfile": result["hourly_profile"],
        "peakConsumptionHour": result["peak_consumption_hour"],
        "peakPvHour": result["peak_pv_hour"],
    }


@app.post("/api/chat")
def chat(body: agent.ChatRequest):
    """Run the agent on the conversation and return the full updated history, so the
    client can show the tool calls."""
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured on the server.")

    messages = [m.model_dump(exclude_unset=True) for m in body.messages]
    try:
        return {"messages": agent.run_agent(messages, agent.groq_client())}
    except Exception as err:
        logger.exception("Agent error")
        return JSONResponse(status_code=500, content={"error": str(err) or "Agent error"})
