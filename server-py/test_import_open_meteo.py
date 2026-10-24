"""Tests for import_open_meteo.py. Run from server-py/:  pytest

None of these call Open-Meteo or the database.
"""

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

import import_open_meteo as imp
from calculations import calculate_scenario, js_sum

HERE = Path(__file__).parent
REAL_WEEK = json.loads((HERE / "tests/fixtures/baseline_2026-08-01_2026-08-07.json").read_text())
AUG_1 = datetime(2026, 8, 1, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "year, expected", [(2024, date(2024, 3, 31)), (2025, date(2025, 4, 20)), (2026, date(2026, 4, 5))]
)
def test_easter_sunday(year, expected):
    assert imp.easter_sunday(year) == expected


def test_nrw_holidays_2026():
    holidays = imp.nrw_holidays(2026)
    assert len(holidays) == 11
    assert date(2026, 4, 3) in holidays  # Good Friday
    assert date(2026, 5, 14) in holidays  # Ascension
    assert date(2026, 6, 4) in holidays  # Corpus Christi
    assert date(2026, 8, 3) not in holidays


@pytest.mark.parametrize(
    "day, expected",
    [
        (date(2026, 3, 20), "winter"),
        (date(2026, 3, 21), "transition"),
        (date(2026, 5, 15), "summer"),
        (date(2026, 9, 14), "summer"),
        (date(2026, 9, 15), "transition"),
        (date(2026, 11, 1), "winter"),
    ],
)
def test_season_boundaries(day, expected):
    assert imp.season(day) == expected


def test_consumption_matches_the_real_week_snapshot():
    # The snapshot was written by the TypeScript importer, so this also checks the port
    assert imp.consumption_kwh(AUG_1, 168, 75000) == REAL_WEEK["baseline"]["consumption"]


def test_consumption_of_a_whole_year_adds_up_to_annual_kwh():
    new_year_local = datetime(2025, 12, 31, 23, tzinfo=timezone.utc)  # Jan 1 00:00 in Berlin
    values = imp.consumption_kwh(new_year_local, 8760, 75000)
    # Each value is rounded to 3 decimals, so allow for that rounding
    assert js_sum(values) == pytest.approx(75000, abs=8760 * 0.0005)


def test_pv_uses_the_value_labelled_at_the_end_of_the_hour():
    # Open-Meteo labels the mean of 00:00–01:00 as 01:00
    irradiance = {"2026-08-01T01:00": 500, "2026-08-01T02:00": 0}
    assert imp.pv_kwh(irradiance, AUG_1, 2, kwp=10, pr=0.85) == [4.25, 0]


def test_pv_missing_hour_raises():
    with pytest.raises(RuntimeError, match="no data for 2026-08-01T01:00:00.000Z"):
        imp.pv_kwh({"2026-08-01T01:00": None}, AUG_1, 1, kwp=10, pr=0.85)


def test_build_dataset(monkeypatch):
    def fake_fetch(opts, start, end):
        assert (start, end) == (date(2026, 8, 1), date(2026, 8, 2))
        return {f"2026-08-0{d}T{h:02d}:00": 100 for d in (1, 2, 3) for h in range(24)}

    monkeypatch.setattr(imp, "fetch_irradiance", fake_fetch)
    row = imp.build_dataset({**imp.DEFAULTS, "start": "2026-08-01", "end": "2026-08-02"})

    assert row["label"] == "open-meteo 51.2277,6.7735 10 kWp + BDEW G0"
    assert (row["rangeStart"], row["rangeEnd"]) == (date(2026, 8, 1), date(2026, 8, 2))
    assert row["timestamps"][:2] == ["2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z"]
    assert len(row["timestamps"]) == 48
    assert row["baseline"]["pv_generation"] == [0.85] * 48  # 10 kWp × 0.1 × 0.85
    expected = calculate_scenario(row["baseline"], imp.SCENARIO_PV_KW)
    assert (row["scenario"], row["kpis"]) == (expected["scenario"], expected["kpis"])


@pytest.mark.parametrize(
    "start, end", [("2026-08-07", "2026-08-01"), ("2026-13-01", "2026-13-02"), ("yesterday", "today")]
)
def test_build_dataset_rejects_bad_dates(start, end):
    with pytest.raises(ValueError, match="start <= end"):
        imp.build_dataset({**imp.DEFAULTS, "start": start, "end": end})
