import psycopg
import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

ERROR_400 = {"error": "pvKw (number) and kpis (object) are required"}
KPIS = {"total_consumption_kwh": 1200.5, "pv_coverage_pct": 35.2, "co2_savings_ton": 1.8}


@pytest.fixture(autouse=True)
def clear_scenarios():
    # The store is a module-level list, so reset it between tests
    main.saved_scenarios.clear()
    yield
    main.saved_scenarios.clear()


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_save_and_list_scenarios():
    assert client.get("/api/energy/scenarios").json() == []

    first = client.post("/api/energy/scenarios", json={"pvKw": 5, "kpis": KPIS})
    assert first.status_code == 201
    body = first.json()
    assert set(body) == {"id", "pvKw", "kpis", "savedAt"}
    assert body["pvKw"] == 5 and isinstance(body["pvKw"], int)  # stays 5, not 5.0
    assert body["kpis"] == KPIS
    assert body["savedAt"].endswith("Z")

    second = client.post("/api/energy/scenarios", json={"pvKw": 12.5, "kpis": KPIS}).json()

    listed = client.get("/api/energy/scenarios").json()
    assert [s["id"] for s in listed] == [second["id"], body["id"]]  # newest first


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"kpis": KPIS},
        {"pvKw": 5},
        {"pvKw": "5", "kpis": KPIS},  # string is not a number
        {"pvKw": True, "kpis": KPIS},  # bool is not a number
        {"pvKw": 5, "kpis": None},
        {"pvKw": 5, "kpis": "x"},
    ],
)
def test_invalid_body_returns_400(payload):
    res = client.post("/api/energy/scenarios", json=payload)
    assert res.status_code == 400
    assert res.json() == ERROR_400


def test_unknown_route_uses_error_shape():
    res = client.get("/api/nope")
    assert res.status_code == 404
    assert "error" in res.json() and "detail" not in res.json()


def test_energy_database_error(monkeypatch):
    def fail(*_args, **_kwargs):
        raise psycopg.OperationalError("connection refused")

    monkeypatch.setattr(main.psycopg, "connect", fail)
    res = client.get("/api/energy")
    assert res.status_code == 500
    assert res.json() == {"error": "Database error. Check DATABASE_URL and that PostgreSQL is running."}


def test_energy_no_data(monkeypatch):
    monkeypatch.setattr(main, "fetch_oldest_dataset", lambda: None)
    res = client.get("/api/energy")
    assert res.status_code == 404
    assert res.json() == {"error": "No energy data. Run migrations and seed."}
