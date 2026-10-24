"""AI agent behind POST /api/chat: a Groq tool-calling loop (Llama 3.3 70B).

The model decides which tools to call; we run them and feed the results back until it
answers without tool calls, or MAX_STEPS is reached.
"""

import json
import os
from typing import Annotated, Literal, Optional, Union

from groq import Groq
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt

import store
from calculations import calculate_scenario
from optimizer import OBJECTIVES, optimize_scenario, score

MODEL = "llama-3.3-70b-versatile"
MAX_STEPS = 6

SYSTEM_PROMPT = """You are the AI assistant for an Energy Dashboard that compares baseline vs. scenario energy consumption with rooftop PV over a 7-day hourly dataset.

Rules:
- Always use tools to obtain numbers. Never fabricate KPIs or baseline data.
- When the user asks for the "best", "optimal", or "ideal" PV size, call optimizeScenario.
- When the user asks a "what if" question about a specific PV size, call calculateScenario.
- When saving a scenario, you do NOT need the user to supply KPIs — the saveScenario tool computes them from the canonical baseline.
- KPI meanings (report these verbatim from tool output, do not recompute):
  - total_consumption_kwh: total grid consumption across the full 7-day window, in kWh.
  - pv_coverage_pct: total PV generation divided by total consumption across the full 7-day window, in %. This is a 7-day aggregate, not a strict daily average — phrase it as "PV coverage" rather than "daily average" unless the user explicitly asks about daily values.
  - co2_savings_ton: avoided grid emissions across the 7-day window, in metric tons.
- Always include units: kWh, %, tons (t).
- Keep answers concise (2-4 sentences). If a tool returns a lot of data, summarize it."""


# --- Chat messages (ChatMessage in shared/types.ts) -------------------------


class ChatToolCall(BaseModel):
    id: str
    name: str
    arguments: str


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: Optional[str]  # required, but may be null (an assistant message with only tool calls)
    tool_calls: Optional[list[ChatToolCall]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


class ChatRequest(BaseModel):
    """Request body of POST /api/chat."""

    messages: list[ChatMessage] = Field(min_length=1, max_length=50)


# --- Tool arguments (what the model sends, checked before running a tool) ---

Kw = Annotated[Union[StrictInt, StrictFloat], Field(ge=0, le=1000)]


class NoArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PvKwArgs(BaseModel):
    pvKw: Kw


class OptimizeArgs(BaseModel):
    objective: Literal[OBJECTIVES]
    minKw: Optional[Kw] = None
    maxKw: Optional[Kw] = None
    stepKw: Optional[Annotated[Union[StrictInt, StrictFloat], Field(ge=0.1, le=50)]] = None


# --- Tool schemas (the shape Groq/OpenAI expect for `tools`) ----------------


def _tool(name: str, description: str, properties: Optional[dict] = None, required=None) -> dict:
    parameters = {"type": "object", "properties": properties or {}}
    if required:
        parameters["required"] = required
    return {"type": "function", "function": {"name": name, "description": description, "parameters": parameters}}


PV_KW_PROPERTY = {"pvKw": {"type": "number", "description": "PV capacity in kW (0-1000)"}}

TOOL_SCHEMAS = [
    _tool(
        "getEnergyData",
        "Return the seeded 7-day hourly baseline dataset (timestamps, consumption kWh, PV generation kWh) and its baseline KPIs. Call this first if you need to know what data is available before doing calculations.",
    ),
    _tool(
        "calculateScenario",
        'Simulate what the KPIs would be if PV capacity were set to pvKw. Use this for "what-if" questions about a specific PV size.',
        PV_KW_PROPERTY,
        ["pvKw"],
    ),
    _tool(
        "optimizeScenario",
        'Find the optimal PV capacity (kW) that maximizes the given objective. Use this whenever the user asks for the "best", "optimal", or "ideal" PV size. Returns the best pvKw, its KPIs, and the full search path.',
        {
            "objective": {
                "type": "string",
                "enum": list(OBJECTIVES),
                "description": "co2 = maximize CO2 savings (tons); coverage = maximize PV coverage (%); minConsumption = minimize grid consumption (kWh)",
            },
            "minKw": {"type": "number", "description": "Lower bound of search range in kW (default 0)"},
            "maxKw": {"type": "number", "description": "Upper bound of search range in kW (default 100)"},
            "stepKw": {"type": "number", "description": "Search step size in kW (default 1)"},
        },
        ["objective"],
    ),
    _tool("listScenarios", "Return all scenarios the user has saved (from the dashboard or this chat), newest first."),
    _tool(
        "saveScenario",
        "Save a scenario with the given PV capacity. The KPIs are computed server-side from the canonical baseline so the saved record stays consistent with the dashboard.",
        PV_KW_PROPERTY,
        ["pvKw"],
    ),
]


# --- Tool handlers -----------------------------------------------------------


def get_energy_data(args: dict) -> dict:
    NoArgs.model_validate(args)
    dataset = store.load_dataset()
    return {"timestamps": dataset["timestamps"], "baseline": dataset["baseline"], "baselineKpis": dataset["kpis"]}


def calculate(args: dict) -> dict:
    pv_kw = PvKwArgs.model_validate(args).pvKw
    return {"pvKw": pv_kw, "kpis": calculate_scenario(store.load_dataset()["baseline"], pv_kw)["kpis"]}


def optimize(args: dict) -> dict:
    parsed = OptimizeArgs.model_validate(args)
    ranges = {"min_kw": parsed.minKw, "max_kw": parsed.maxKw, "step_kw": parsed.stepKw}
    result = optimize_scenario(
        store.load_dataset()["baseline"],
        parsed.objective,
        **{k: v for k, v in ranges.items() if v is not None},  # unset → optimizer defaults
    )
    # Downsample the search path so the model's context stays small: the top 5
    # plus every 10th point.
    path = result["searchPath"]
    ranked = sorted(path, key=lambda p: score(p["kpis"], parsed.objective), reverse=True)
    return {
        "objective": result["objective"],
        "bestPvKw": result["bestPvKw"],
        "bestKpis": result["bestKpis"],
        "topFive": ranked[:5],
        "sampledPath": path[::10],
    }


def list_scenarios(args: dict) -> list:
    NoArgs.model_validate(args)
    return [s.model_dump() for s in store.fetch_scenarios()]


def save_scenario(args: dict) -> dict:
    pv_kw = PvKwArgs.model_validate(args).pvKw
    kpis = calculate_scenario(store.load_dataset()["baseline"], pv_kw)["kpis"]
    return store.add_scenario(pv_kw, store.Kpis(**kpis)).model_dump()


TOOL_HANDLERS = {
    "getEnergyData": get_energy_data,
    "calculateScenario": calculate,
    "optimizeScenario": optimize,
    "listScenarios": list_scenarios,
    "saveScenario": save_scenario,
}


def run_tool(name: str, arguments: str) -> str:
    """Run one tool call and return its JSON result, or {"error": ...} for the model to read."""
    try:
        handler = TOOL_HANDLERS.get(name)
        if handler is None:
            raise ValueError(f"Unknown tool: {name}")
        result = handler(json.loads(arguments) if arguments else {})
    except Exception as err:  # the model gets the message and can try again
        result = {"error": getattr(err, "detail", None) or str(err)}
    # Compact, like JSON.stringify
    return json.dumps(result, separators=(",", ":"), ensure_ascii=False)


# --- Agent loop --------------------------------------------------------------


def groq_client() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def to_groq_message(msg: dict) -> dict:
    """Our compact ChatMessage → the OpenAI/Groq wire format.

    Groq requires tool_calls to carry { id, type: "function", function: { name, arguments } }
    on every assistant message in the history, otherwise it answers 400 on turn 2+.
    """
    if msg["role"] == "assistant" and msg.get("tool_calls"):
        return {
            "role": "assistant",
            "content": msg["content"],
            "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                for tc in msg["tool_calls"]
            ],
        }
    if msg["role"] == "tool":
        return {"role": "tool", "tool_call_id": msg.get("tool_call_id"), "content": msg["content"]}
    return {"role": msg["role"], "content": msg["content"]}


def run_agent(messages: list[dict], client) -> list[dict]:
    """Return the conversation after the agent's turn (without the system prompt)."""
    history = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]

    for _ in range(MAX_STEPS):
        response = client.chat.completions.create(
            model=MODEL,
            messages=[to_groq_message(m) for m in history],
            tools=TOOL_SCHEMAS,
            tool_choice="auto",
            temperature=0.2,
        )
        if not response.choices:
            raise RuntimeError("Groq returned no message")
        msg = response.choices[0].message

        assistant = {"role": "assistant", "content": msg.content}
        if msg.tool_calls:
            assistant["tool_calls"] = [
                {"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments}
                for tc in msg.tool_calls
            ]
        history.append(assistant)

        # No tool calls → the model gave its final answer
        if not msg.tool_calls:
            return history[1:]

        for call in msg.tool_calls:
            history.append({
                "role": "tool",
                "tool_call_id": call.id,
                "name": call.function.name,
                "content": run_tool(call.function.name, call.function.arguments),
            })

    # Max steps hit: add a message so the UI has something to show
    history.append({
        "role": "assistant",
        "content": "I ran out of tool-call steps before producing a final answer. Please try a more specific question.",
    })
    return history[1:]
