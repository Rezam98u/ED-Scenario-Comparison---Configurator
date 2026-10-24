"""Tests for multiple datasets: ?datasetId=, GET/POST /api/energy/datasets and
import_open_meteo.import_period. Run from server-py/:  pytest

The database and Open-Meteo are replaced by fakes.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import import_open_meteo as imp
import main
import store

client = TestClient(main.app)

DATASET = {
    "timestamps": ["2026-10-01T00:00:00.000Z", "2026-10-01T01:00:00.000Z"],
    "baseline": {"consumption": [10, 20], "pv_generation": [0, 4]},
    "scenario": {"consumption": [10, 20], "pv_generation": [0, 4]},
    "kpis": {"total_consumption_kwh": 30, "pv_coverage_pct": 13.3, "co2_savings_ton": 0},
}
SUMMARY = {
    "id": "oct",
    "label": "open-meteo 51.2277,6.7735 10 kWp + BDEW G0",
    "start": "2026-10-01",
    "end": "2026-10-07",
    "params": imp.dataset_params(imp.DEFAULTS),
    "createdAt": "2026-10-24T12:00:00.000Z",
}
YESTERDAY = datetime.now(timezone.utc).date() - timedelta(days=1)


@pytest.fixture
def requested_ids(monkeypatch):
    """Fake load_dataset that records which dataset id each request asked for."""
    ids = []

    def load_dataset(dataset_id=None):
        ids.append(dataset_id)
        return DATASET

    monkeypatch.setattr(store, "load_dataset", load_dataset)
    return ids


# --- ?datasetId= on the energy endpoints ------------------------------------


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("get", "/api/energy", None),
        ("post", "/api/energy/calculate", {"pvKw": 10}),
        ("get", "/api/energy/analysis", None),
    ],
)
def test_energy_endpoints_pass_the_dataset_id(requested_ids, method, path, body):
    assert client.request(method, path, json=body).status_code == 200
    assert client.request(method, path + "?datasetId=oct", json=body).status_code == 200
    assert requested_ids == [None, "oct"]  # no id → default dataset


def test_unknown_dataset_id_returns_404(monkeypatch):
    class NoRowConnection:
        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def execute(self, query, params=None):
            return self

        def fetchone(self):
            return None

    monkeypatch.setattr(store, "connect", lambda: NoRowConnection())
    response = client.get("/api/energy?datasetId=nope")
    assert response.status_code == 404
    assert response.json() == {"error": "Dataset not found."}


# --- GET /api/energy/datasets ------------------------------------------------


def test_list_datasets(monkeypatch):
    monkeypatch.setattr(store, "list_datasets", lambda: [SUMMARY])
    response = client.get("/api/energy/datasets")
    assert response.status_code == 200
    assert response.json() == [SUMMARY]


# --- POST /api/energy/datasets -----------------------------------------------


@pytest.fixture
def fake_import(monkeypatch):
    """Fake import_period: returns SUMMARY, created on the first call for a period."""
    calls = []

    def import_period(opts):
        calls.append(opts)
        return SUMMARY, len(calls) == 1

    monkeypatch.setattr(imp, "import_period", import_period)
    return calls


def test_import_creates_then_reuses(fake_import):
    body = {"start": "2026-10-01", "end": "2026-10-07"}
    first = client.post("/api/energy/datasets", json=body)
    second = client.post("/api/energy/datasets", json=body)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json() == second.json() == SUMMARY
    # The other import settings are the defaults
    assert fake_import[0] == {**imp.DEFAULTS, "start": "2026-10-01", "end": "2026-10-07"}


@pytest.mark.parametrize(
    "body, message",
    [
        ({"start": "2026-10-07", "end": "2026-10-01"}, "end must not be before start"),
        ({"start": "2026-08-01", "end": "2026-09-30"}, "at most 31 days"),
        (
            {"start": YESTERDAY.isoformat(), "end": (YESTERDAY + timedelta(days=1)).isoformat()},
            "only available up to yesterday",
        ),
        ({"start": "2026-10-01"}, "start and end (YYYY-MM-DD) are required"),
        ({"start": "first week", "end": "2026-10-07"}, "start and end (YYYY-MM-DD) are required"),
    ],
)
def test_import_rejects_bad_periods(fake_import, body, message):
    response = client.post("/api/energy/datasets", json=body)
    assert response.status_code == 400
    assert message in response.json()["error"]
    assert fake_import == []  # nothing fetched


def test_import_reports_open_meteo_errors_as_502(monkeypatch):
    def failing_import(opts):
        raise RuntimeError("Open-Meteo: service unavailable")

    monkeypatch.setattr(imp, "import_period", failing_import)
    response = client.post("/api/energy/datasets", json={"start": "2026-10-01", "end": "2026-10-07"})
    assert response.status_code == 502
    assert "Open-Meteo: service unavailable" in response.json()["error"]


# --- import_open_meteo.import_period -----------------------------------------


def test_dataset_params_are_numbers():
    params = imp.dataset_params({**imp.DEFAULTS, "kwp": "10.0"})
    assert params == imp.dataset_params(imp.DEFAULTS)  # "10" and "10.0" are the same
    assert set(params) == {"lat", "lon", "kwp", "tilt", "azimuth", "pr", "annual_kwh"}


def test_import_period_reuses_an_existing_dataset(monkeypatch):
    monkeypatch.setattr(store, "find_dataset", lambda start, end, params: SUMMARY)

    def must_not_fetch(*args):
        raise AssertionError("Open-Meteo should not be called")

    monkeypatch.setattr(imp, "fetch_irradiance", must_not_fetch)
    assert imp.import_period({**imp.DEFAULTS, "start": "2026-10-01", "end": "2026-10-07"}) == (SUMMARY, False)


def test_import_period_stores_a_new_dataset(monkeypatch):
    inserted = []
    monkeypatch.setattr(store, "find_dataset", lambda start, end, params: None)
    monkeypatch.setattr(store, "insert_dataset", lambda row: inserted.append(row) or SUMMARY)
    monkeypatch.setattr(
        imp, "fetch_irradiance",
        lambda opts, start, end: {f"2026-10-0{d}T{h:02d}:00": 0 for d in (1, 2) for h in range(24)},
    )

    result = imp.import_period({**imp.DEFAULTS, "start": "2026-10-01", "end": "2026-10-01"})
    assert result == (SUMMARY, True)
    (row,) = inserted
    assert (row["rangeStart"], row["rangeEnd"]) == (date(2026, 10, 1), date(2026, 10, 1))
    assert row["params"] == imp.dataset_params(imp.DEFAULTS)
    assert len(row["timestamps"]) == 24
