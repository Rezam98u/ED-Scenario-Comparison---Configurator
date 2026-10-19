"""Tests for main.py. Run from server-py/:  pytest"""

import re
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

VALID_KPIS = {"total_consumption_kwh": 1430.7, "pv_coverage_pct": 7.6, "co2_savings_ton": 0.027}
INVALID_BODY_ERROR = {"error": "pvKw (number) and kpis (object) are required"}


@pytest.fixture(autouse=True)
def empty_store():
    # The scenario store is a module-level list, so reset it before every test
    main.saved_scenarios.clear()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_save_and_list_scenarios():
    first = client.post("/api/energy/scenarios", json={"pvKw": 5, "kpis": VALID_KPIS})
    assert first.status_code == 201
    assert '"pvKw":5,' in first.text  # 5 stays 5, not 5.0 (same as Express)

    saved = first.json()
    assert saved["kpis"] == VALID_KPIS
    assert uuid.UUID(saved["id"]).version == 4
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", saved["savedAt"])

    second = client.post("/api/energy/scenarios", json={"pvKw": 12.5, "kpis": VALID_KPIS})
    assert second.status_code == 201

    response = client.get("/api/energy/scenarios")
    assert response.status_code == 200
    assert response.json() == [second.json(), saved]  # newest first


@pytest.mark.parametrize(
    "body",
    [
        {"kpis": VALID_KPIS},  # pvKw missing
        {"pvKw": "5", "kpis": VALID_KPIS},  # number sent as a string
        {"pvKw": True, "kpis": VALID_KPIS},  # boolean
        {"pvKw": 5},  # kpis missing
        {"pvKw": 5, "kpis": None},  # kpis null
        {"pvKw": 5, "kpis": {"pv_coverage_pct": 7.6}},  # kpis incomplete
    ],
)
def test_invalid_body_returns_400(body):
    response = client.post("/api/energy/scenarios", json=body)
    assert response.status_code == 400
    assert response.json() == INVALID_BODY_ERROR  # { error }, never { detail }
    assert main.saved_scenarios == []


def test_malformed_json_returns_400():
    response = client.post(
        "/api/energy/scenarios",
        content="{not json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json() == INVALID_BODY_ERROR


def test_unknown_route_uses_error_shape():
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {"error": "Not Found"}


def test_energy_database_error_returns_500(monkeypatch):
    def broken_connect(*args, **kwargs):
        raise psycopg.OperationalError("connection refused")

    # Replace psycopg.connect so this test does not need a running database
    monkeypatch.setattr(main.psycopg, "connect", broken_connect)

    response = client.get("/api/energy")
    assert response.status_code == 500
    assert response.json() == {
        "error": "Database error. Check DATABASE_URL and that PostgreSQL is running."
    }


def test_energy_empty_table_returns_404(monkeypatch):
    class EmptyTableConnection:
        """Stands in for a psycopg connection whose query finds no rows."""

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def execute(self, query):
            return self

        def fetchone(self):
            return None

    monkeypatch.setattr(main.psycopg, "connect", lambda *args, **kwargs: EmptyTableConnection())

    response = client.get("/api/energy")
    assert response.status_code == 404
    assert response.json() == {"error": "No energy data. Run migrations and seed."}


# --- POST /api/energy/calculate ----------------------------------------------

CALCULATE_INVALID_BODY_ERROR = {"error": "pvKw (number) is required"}
SMALL_DATASET = {
    "timestamps": ["2025-01-01T00:00:00.000Z", "2025-01-01T01:00:00.000Z"],
    "baseline": {"consumption": [10, 20], "pv_generation": [0, 4]},
    "scenario": {"consumption": [10, 20], "pv_generation": [0, 4]},
    "kpis": VALID_KPIS,
}


@pytest.fixture
def fake_dataset(monkeypatch):
    # Replace load_dataset so the endpoint tests do not need a database
    monkeypatch.setattr(main, "load_dataset", lambda: SMALL_DATASET)


def test_calculate_returns_scenario_and_kpis(fake_dataset):
    response = client.post("/api/energy/calculate", json={"pvKw": 10})
    assert response.status_code == 200
    body = response.json()
    assert body == main.calculate_scenario(SMALL_DATASET["baseline"], 10)
    assert set(body) == {"scenario", "kpis"}
    assert set(body["scenario"]) == {"consumption", "pv_generation"}
    assert len(body["scenario"]["consumption"]) == 2


def test_calculate_accepts_float(fake_dataset):
    response = client.post("/api/energy/calculate", json={"pvKw": 33.3})
    assert response.status_code == 200


def test_calculate_negative_pv_returns_400(monkeypatch):
    # No fake_dataset: the check runs before the database is touched
    def must_not_be_called():
        raise AssertionError("load_dataset should not be called")

    monkeypatch.setattr(main, "load_dataset", must_not_be_called)
    response = client.post("/api/energy/calculate", json={"pvKw": -1})
    assert response.status_code == 400
    assert response.json() == {"error": "PV capacity cannot be negative"}


@pytest.mark.parametrize(
    "body",
    [
        {},  # pvKw missing
        {"pvKw": "5"},  # number sent as a string
        {"pvKw": True},  # boolean
        {"pvKw": None},
    ],
)
def test_calculate_invalid_body_returns_400(fake_dataset, body):
    response = client.post("/api/energy/calculate", json=body)
    assert response.status_code == 400
    assert response.json() == CALCULATE_INVALID_BODY_ERROR


@pytest.mark.parametrize("content", ["{not json", '{"pvKw": NaN}', '{"pvKw": Infinity}'])
def test_calculate_malformed_or_non_finite_returns_400(fake_dataset, content):
    response = client.post(
        "/api/energy/calculate", content=content, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 400
    assert response.json() == CALCULATE_INVALID_BODY_ERROR


def test_scenarios_keeps_its_own_validation_message():
    response = client.post("/api/energy/scenarios", json={})
    assert response.json() == INVALID_BODY_ERROR


def test_calculate_database_error_returns_500(monkeypatch):
    def broken_connect(*args, **kwargs):
        raise psycopg.OperationalError("connection refused")

    monkeypatch.setattr(main.psycopg, "connect", broken_connect)
    response = client.post("/api/energy/calculate", json={"pvKw": 10})
    assert response.status_code == 500
    assert response.json() == {
        "error": "Database error. Check DATABASE_URL and that PostgreSQL is running."
    }


def test_calculate_no_data_returns_404(monkeypatch):
    def no_data():
        raise main.HTTPException(status_code=404, detail="No energy data. Run migrations and seed.")

    monkeypatch.setattr(main, "load_dataset", no_data)
    response = client.post("/api/energy/calculate", json={"pvKw": 10})
    assert response.status_code == 404
    assert response.json() == {"error": "No energy data. Run migrations and seed."}
