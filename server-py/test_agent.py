"""Tests for agent.py, optimizer.py and POST /api/chat. Run from server-py/:  pytest

Groq is replaced by FakeGroq and the database by fakes, so nothing leaves the machine.
"""

import json
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import agent
import main
import store
from analysis import analyze_baseline
from calculations import calculate_scenario
from optimizer import optimize_scenario

client = TestClient(main.app)

BASELINE = {"consumption": [10, 20, 30, 20], "pv_generation": [0, 4, 6, 0]}
DATASET = {
    "timestamps": [f"2026-08-01T{h:02d}:00:00.000Z" for h in (10, 11, 12, 13)],
    "baseline": BASELINE,
    "scenario": BASELINE,
    "kpis": {"total_consumption_kwh": 80, "pv_coverage_pct": 12.5, "co2_savings_ton": 0},
}
USER = {"role": "user", "content": "What if I install 10 kW?"}
TODAY = date(2026, 10, 24)
AUGUST = {"id": "aug", "start": "2026-08-01", "end": "2026-08-07"}
OCTOBER = {"id": "oct", "start": "2026-10-01", "end": "2026-10-07"}


def new_turn(dataset_id=None):
    return agent.Turn(today=TODAY, dataset_id=dataset_id)


class FakeGroq:
    """Stands in for groq.Groq: returns the scripted replies in order and records requests."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **request):
        self.requests.append(request)
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        return SimpleNamespace(choices=[SimpleNamespace(message=reply)])


def answer(text):
    return SimpleNamespace(content=text, tool_calls=None)


def tool_call(name, arguments, call_id="call_1"):
    call = SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=arguments))
    return SimpleNamespace(content=None, tool_calls=[call])


@pytest.fixture
def fake_db(monkeypatch):
    rows = []

    def insert_scenario(id, pv_kw, kpis, saved_at, dataset_id):
        linked_id = dataset_id or AUGUST["id"]  # the real one links None to the oldest dataset
        rows.insert(0, store.SavedScenario(
            id=id, pvKw=pv_kw, kpis=kpis, savedAt=store.to_js_iso(saved_at), datasetId=linked_id
        ))
        return linked_id

    monkeypatch.setattr(store, "load_dataset", lambda dataset_id=None: DATASET)
    monkeypatch.setattr(store, "insert_scenario", insert_scenario)
    monkeypatch.setattr(store, "fetch_scenarios", lambda: list(rows))
    monkeypatch.setattr(store, "list_datasets", lambda: [AUGUST, OCTOBER])
    return rows


# --- optimizer ---------------------------------------------------------------


def test_optimizer_searches_the_whole_range():
    result = optimize_scenario(BASELINE, "coverage", min_kw=0, max_kw=10, step_kw=5)
    assert [p["pvKw"] for p in result["searchPath"]] == [0, 5, 10]
    assert result["bestPvKw"] == 10  # more PV, more coverage
    assert result["bestKpis"] == calculate_scenario(BASELINE, 10)["kpis"]


def test_optimizer_keeps_the_first_of_equal_scores():
    # Without PV generation, no pvKw changes CO2 savings much; ties keep the smallest pvKw
    flat = {"consumption": [0, 0], "pv_generation": [0, 0]}
    assert optimize_scenario(flat, "co2", max_kw=5)["bestPvKw"] == 0


@pytest.mark.parametrize("kwargs", [{"min_kw": -1}, {"min_kw": 5, "max_kw": 4}, {"step_kw": 0}])
def test_optimizer_rejects_invalid_ranges(kwargs):
    with pytest.raises(ValueError, match="Invalid optimizer range"):
        optimize_scenario(BASELINE, "co2", **kwargs)


# --- tools -------------------------------------------------------------------


def test_calculate_tool(fake_db):
    result = json.loads(agent.run_tool("calculateScenario", '{"pvKw": 10}', new_turn()))
    assert result == {"pvKw": 10, "kpis": calculate_scenario(BASELINE, 10)["kpis"]}


def test_get_energy_data_returns_a_summary_not_hourly_values(fake_db):
    result = json.loads(agent.run_tool("getEnergyData", "", new_turn()))
    analysis = analyze_baseline(DATASET)
    assert result == {
        "start": "2026-08-01",
        "end": "2026-08-01",
        "hours": 4,
        "baseline": {"consumptionKwh": 80, "pvGenerationKwh": 10, "pvCoveragePct": 12.5},
        "dashboardScenario": {"addedPvKw": 10, "kpis": DATASET["kpis"]},
        "daily": analysis["daily"],
        "hourlyProfileUtc": analysis["hourly_profile"],
        "peakConsumptionHourUtc": 12,
        "peakPvHourUtc": 12,
    }
    assert "timestamps" not in result and "consumption" not in result["baseline"]  # no hourly lists


def test_get_energy_data_stays_small_for_a_31_day_period(monkeypatch):
    hours = 31 * 24
    month = {
        **DATASET,
        "timestamps": [f"2026-08-{1 + h // 24:02d}T{h % 24:02d}:00:00.000Z" for h in range(hours)],
        "baseline": {"consumption": [5.123] * hours, "pv_generation": [2.456] * hours},
    }
    monkeypatch.setattr(store, "load_dataset", lambda dataset_id=None: month)
    content = agent.run_tool("getEnergyData", "", new_turn())
    # ~4 characters per token: well under the free plan's 8,000 tokens per minute
    assert len(content) < 8_000


def test_optimize_tool_downsamples_the_search_path(fake_db):
    result = json.loads(agent.run_tool("optimizeScenario", '{"objective": "coverage", "maxKw": 30}', new_turn()))
    assert result["bestPvKw"] == 30
    assert [p["pvKw"] for p in result["topFive"]] == [30, 29, 28, 27, 26]
    assert [p["pvKw"] for p in result["sampledPath"]] == [0, 10, 20, 30]


def test_save_and_list_tools_share_the_store(fake_db):
    saved = json.loads(agent.run_tool("saveScenario", '{"pvKw": 5}', new_turn()))
    assert saved["pvKw"] == 5
    assert saved["kpis"] == calculate_scenario(BASELINE, 5)["kpis"]
    assert json.loads(agent.run_tool("listScenarios", "{}", new_turn())) == [saved]
    # The dashboard reads the same table
    assert client.get("/api/energy/scenarios").json() == [saved]


@pytest.mark.parametrize(
    "name, arguments, message",
    [
        ("noSuchTool", "{}", "Unknown tool: noSuchTool"),
        ("calculateScenario", '{"pvKw": -1}', "greater than or equal to 0"),
        ("calculateScenario", '{"pvKw": "5"}', "pvKw"),
        ("optimizeScenario", '{"objective": "cheapest"}', "objective"),
        ("listScenarios", '{"extra": 1}', "extra"),
        ("calculateScenario", "{not json", "Expecting property name"),
    ],
)
def test_tool_errors_are_returned_to_the_model(fake_db, name, arguments, message):
    result = json.loads(agent.run_tool(name, arguments, new_turn()))
    assert message in result["error"]


def test_tool_reports_database_errors_by_message(monkeypatch):
    def no_data(dataset_id=None):
        raise store.HTTPException(status_code=404, detail=store.NO_DATA_ERROR)

    monkeypatch.setattr(store, "load_dataset", no_data)
    assert json.loads(agent.run_tool("calculateScenario", '{"pvKw": 1}', new_turn())) == {"error": store.NO_DATA_ERROR}


# --- agent loop --------------------------------------------------------------


def test_run_agent_runs_tools_until_the_final_answer(fake_db):
    groq = FakeGroq(tool_call("calculateScenario", '{"pvKw": 10}'), answer("Coverage would be 30%."))
    messages = agent.run_agent([USER], groq, new_turn())

    kpis = calculate_scenario(BASELINE, 10)["kpis"]
    assert messages == [
        USER,
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "call_1", "name": "calculateScenario", "arguments": '{"pvKw": 10}'}],
        },
        {
            "role": "tool",
            "tool_call_id": "call_1",
            "name": "calculateScenario",
            "content": json.dumps({"pvKw": 10, "kpis": kpis}, separators=(",", ":")),
        },
        {"role": "assistant", "content": "Coverage would be 30%."},
    ]

    first, second = groq.requests
    system = first["messages"][0]
    assert system["role"] == "system"
    assert "Today is 2026-10-24 (UTC). The dashboard currently shows 2026-08-01 to 2026-08-07." in system["content"]
    assert first["tools"] == agent.TOOL_SCHEMAS and first["model"] == agent.MODEL
    # Groq needs the full tool_calls shape on earlier assistant messages
    assert second["messages"][2]["tool_calls"] == [
        {"id": "call_1", "type": "function", "function": {"name": "calculateScenario", "arguments": '{"pvKw": 10}'}}
    ]
    assert second["messages"][3] == {"role": "tool", "tool_call_id": "call_1", "content": messages[2]["content"]}


def test_run_agent_stops_after_max_steps(fake_db):
    groq = FakeGroq(tool_call("listScenarios", "{}"))  # never answers
    messages = agent.run_agent([USER], groq, new_turn())
    assert len(groq.requests) == agent.MAX_STEPS
    assert messages[-1]["content"].startswith("I ran out of tool-call steps")


# --- POST /api/chat ----------------------------------------------------------


@pytest.fixture
def groq_key(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")


def test_chat_returns_the_updated_history(fake_db, groq_key, monkeypatch):
    monkeypatch.setattr(agent, "groq_client", lambda: FakeGroq(answer("Hello!")))
    response = client.post("/api/chat", json={"messages": [USER]})
    assert response.status_code == 200
    assert response.json() == {"messages": [USER, {"role": "assistant", "content": "Hello!"}]}


def test_chat_without_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    response = client.post("/api/chat", json={"messages": [USER]})
    assert response.status_code == 503
    assert response.json() == {"error": "GROQ_API_KEY is not configured on the server."}


@pytest.mark.parametrize(
    "body",
    [
        {"messages": []},
        {"messages": [{"role": "robot", "content": "hi"}]},
        {"messages": [{"role": "user"}]},  # content is required (it may be null)
        {"messages": [USER] * 51},
    ],
)
def test_chat_invalid_body_returns_400(groq_key, body):
    response = client.post("/api/chat", json=body)
    assert response.status_code == 400
    assert response.json() == {"error": "Invalid request body"}


def test_chat_agent_error_returns_500(groq_key, monkeypatch):
    def broken_client():
        raise RuntimeError("Groq is down")

    monkeypatch.setattr(agent, "groq_client", broken_client)
    response = client.post("/api/chat", json={"messages": [USER]})
    assert response.status_code == 500
    assert response.json() == {"error": "Groq is down"}


# --- periods: loadPeriod and the turn's dataset -----------------------------


@pytest.fixture
def fake_import(monkeypatch):
    """Fake import_open_meteo.import_period: 'imports' any period as dataset 'oct'."""
    calls = []

    def import_period(opts):
        calls.append((opts["start"], opts["end"]))
        return {**OCTOBER, "start": opts["start"], "end": opts["end"]}, True

    monkeypatch.setattr(agent.import_open_meteo, "import_period", import_period)
    return calls


@pytest.fixture
def requested_ids(fake_db, monkeypatch):
    """Records which dataset id each tool asked store.load_dataset for."""
    ids = []

    def load_dataset(dataset_id=None):
        ids.append(dataset_id)
        return DATASET

    monkeypatch.setattr(store, "load_dataset", load_dataset)
    return ids


def test_tools_use_the_period_the_dashboard_shows(requested_ids):
    agent.run_tool("calculateScenario", '{"pvKw": 10}', new_turn("oct"))
    agent.run_tool("getEnergyData", "", new_turn())
    assert requested_ids == ["oct", None]


def test_load_period_switches_the_rest_of_the_turn(requested_ids, fake_import):
    groq = FakeGroq(
        tool_call("loadPeriod", '{"start": "2026-10-01", "end": "2026-10-07"}'),
        tool_call("calculateScenario", '{"pvKw": 10}', call_id="call_2"),
        answer("In the first week of October, coverage would be 30%."),
    )
    turn = new_turn()
    messages = agent.run_agent([{"role": "user", "content": "Give me the first week in October"}], groq, turn)

    assert fake_import == [("2026-10-01", "2026-10-07")]
    assert json.loads(messages[2]["content"]) == {"start": "2026-10-01", "end": "2026-10-07", "newlyImported": True}
    assert requested_ids == ["oct"]  # calculateScenario used the loaded period
    assert (turn.dataset_id, turn.loaded_dataset_id) == ("oct", "oct")


@pytest.mark.parametrize(
    "arguments, message",
    [
        ('{"start": "2026-10-20", "end": "2026-10-30"}', "only available up to yesterday (2026-10-23)"),
        ('{"start": "2026-08-01", "end": "2026-09-30"}', "at most 31 days"),
        ('{"start": "2026-10-07", "end": "2026-10-01"}', "end must not be before start"),
        ('{"start": "first week of October", "end": "2026-10-07"}', "start"),
    ],
)
def test_load_period_errors_go_back_to_the_model(fake_import, arguments, message):
    turn = new_turn()
    result = json.loads(agent.run_tool("loadPeriod", arguments, turn))
    assert message in result["error"]
    assert fake_import == [] and turn.loaded_dataset_id is None  # nothing imported or shown


@pytest.mark.parametrize("dataset_id, expected", [(None, "2026-08-01 to 2026-08-07"), ("oct", "2026-10-01 to 2026-10-07"), ("gone", "no data")])
def test_describe_period(fake_db, dataset_id, expected):
    assert agent.describe_period(dataset_id) == expected


def test_chat_passes_the_period_and_reports_a_loaded_one(fake_db, fake_import, groq_key, monkeypatch):
    groq = FakeGroq(tool_call("loadPeriod", '{"start": "2025-10-01", "end": "2025-10-07"}'), answer("Done."))
    monkeypatch.setattr(agent, "groq_client", lambda: groq)

    response = client.post("/api/chat", json={"messages": [USER], "datasetId": "oct"})
    assert response.status_code == 200
    assert response.json()["showDatasetId"] == "oct"
    assert "currently shows 2026-10-01 to 2026-10-07" in groq.requests[0]["messages"][0]["content"]


def test_chat_without_load_period_has_no_show_dataset_id(fake_db, groq_key, monkeypatch):
    monkeypatch.setattr(agent, "groq_client", lambda: FakeGroq(answer("Hello!")))
    assert "showDatasetId" not in client.post("/api/chat", json={"messages": [USER]}).json()
