"""Tests for analysis.py and GET /api/energy/analysis. Run from server-py/:  pytest"""

import psycopg
import pytest
from fastapi.testclient import TestClient

import main
import store
from analysis import analyze_baseline

client = TestClient(main.app)


def make_dataset(days):
    """Build a dataset from {date: (consumption[24], pv[24])}, one value per UTC hour."""
    timestamps, consumption, pv = [], [], []
    for date, (day_consumption, day_pv) in days.items():
        timestamps += [f"{date}T{hour:02d}:00:00.000Z" for hour in range(24)]
        consumption += day_consumption
        pv += day_pv
    return {
        "timestamps": timestamps,
        "baseline": {"consumption": consumption, "pv_generation": pv},
        "scenario": {"consumption": consumption, "pv_generation": pv},
        "kpis": {"total_consumption_kwh": 0, "pv_coverage_pct": 0, "co2_savings_ton": 0},
    }


def hours(default, **values):
    """24 hourly values: `default` everywhere, except e.g. h18=5."""
    return [values.get(f"h{hour}", default) for hour in range(24)]


# Day 1: consumption 1 kWh per hour, 5 kWh at 18:00          -> 23 * 1 + 5 = 28 kWh
#        PV 0.5 / 2 / 3 / 0.5 at 10-13 h                     -> 6 kWh
#        self-consumed min(c, pv): 0.5 + 1 + 1 + 0.5         -> 3 kWh
#        autarky 3 / 28 * 100 = 10.714...                    -> 10.7 %
# Day 2: consumption 2 kWh per hour, 3 kWh at 18:00          -> 23 * 2 + 3 = 49 kWh
#        PV 1 / 1 at 12-13 h, both fully used                -> 2 kWh, self-consumed 2 kWh
#        autarky 2 / 49 * 100 = 4.0816...                    -> 4.1 %
TWO_DAYS = make_dataset(
    {
        "2025-01-01": (hours(1, h18=5), hours(0, h10=0.5, h11=2, h12=3, h13=0.5)),
        "2025-01-02": (hours(2, h18=3), hours(0, h12=1, h13=1)),
    }
)


def test_daily_table():
    assert analyze_baseline(TWO_DAYS)["daily"] == [
        {
            "date": "2025-01-01",
            "consumption_kwh": 28,
            "pv_kwh": 6,
            "self_consumed_kwh": 3,
            "autarky_pct": 10.7,
        },
        {
            "date": "2025-01-02",
            "consumption_kwh": 49,
            "pv_kwh": 2,
            "self_consumed_kwh": 2,
            "autarky_pct": 4.1,
        },
    ]


def test_hourly_profile_is_the_average_per_hour_of_day():
    profile = analyze_baseline(TWO_DAYS)["hourly_profile"]
    assert [p["hour"] for p in profile] == list(range(24))
    assert profile[0] == {"hour": 0, "consumption_kwh": 1.5, "pv_kwh": 0}  # (1 + 2) / 2
    assert profile[18] == {"hour": 18, "consumption_kwh": 4, "pv_kwh": 0}  # (5 + 3) / 2
    assert [profile[h]["pv_kwh"] for h in (10, 11, 12, 13)] == [0.25, 1, 2, 0.75]


def test_peak_hours():
    result = analyze_baseline(TWO_DAYS)
    assert result["peak_consumption_hour"] == 18
    assert result["peak_pv_hour"] == 12


def test_days_are_utc_days():
    # 23:00Z on Jan 1 would be 00:00 on Jan 2 in German time, but counts for Jan 1 here
    result = analyze_baseline(TWO_DAYS)
    assert [d["date"] for d in result["daily"]] == ["2025-01-01", "2025-01-02"]


def test_day_without_consumption_has_zero_autarky():
    data = make_dataset({"2025-01-01": (hours(0), hours(0, h12=1))})
    assert analyze_baseline(data)["daily"][0]["autarky_pct"] == 0


def test_peak_tie_returns_earliest_hour():
    data = make_dataset({"2025-01-01": (hours(1, h8=4, h19=4), hours(0))})
    assert analyze_baseline(data)["peak_consumption_hour"] == 8


# --- GET /api/energy/analysis ------------------------------------------------


def test_analysis_endpoint(monkeypatch):
    # Replace load_dataset so this test does not need a database
    monkeypatch.setattr(store, "load_dataset", lambda dataset_id=None: TWO_DAYS)

    response = client.get("/api/energy/analysis")
    assert response.status_code == 200
    body = response.json()
    expected = analyze_baseline(TWO_DAYS)
    assert body == {
        "daily": expected["daily"],
        "hourlyProfile": expected["hourly_profile"],
        "peakConsumptionHour": 18,
        "peakPvHour": 12,
    }


def test_analysis_database_error_returns_500(monkeypatch):
    def broken_connect(*args, **kwargs):
        raise psycopg.OperationalError("connection refused")

    monkeypatch.setattr(psycopg, "connect", broken_connect)
    response = client.get("/api/energy/analysis")
    assert response.status_code == 500
    assert response.json() == {
        "error": "Database error. Check DATABASE_URL and that PostgreSQL is running."
    }


def test_analysis_no_data_returns_404(monkeypatch):
    def no_data(dataset_id=None):
        raise main.HTTPException(status_code=404, detail="No energy data. Run migrations and seed.")

    monkeypatch.setattr(store, "load_dataset", no_data)
    response = client.get("/api/energy/analysis")
    assert response.status_code == 404
    assert response.json() == {"error": "No energy data. Run migrations and seed."}
