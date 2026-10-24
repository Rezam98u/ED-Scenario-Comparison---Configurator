"""Tests for calculations.py. Run from server-py/:  pytest

tests/fixtures/scenario_parity.json is a frozen regression fixture: the results of the
former TypeScript calculation (src/utils/calculateScenario.ts, still on main) for the
real week. Python must keep returning exactly these numbers. If the calculation is
changed on purpose, rewrite the fixture from Python's new results and review the diff.
"""

import json
from pathlib import Path

import pytest

from calculations import calculate_scenario, js_round

HERE = Path(__file__).parent
# Snapshot of the real-data import, so the tests never call Open-Meteo
REAL_WEEK = json.loads((HERE / "tests/fixtures/baseline_2026-08-01_2026-08-07.json").read_text())
PARITY_CASES = json.loads((HERE / "tests/fixtures/scenario_parity.json").read_text())["cases"]


@pytest.mark.parametrize("case", PARITY_CASES, ids=lambda c: f"pvKw={c['pvKw']}")
def test_matches_the_frozen_typescript_results(case):
    result = calculate_scenario(REAL_WEEK["baseline"], case["pvKw"])
    # == on floats is an exact comparison, so this fails on any difference in the last bit
    assert result == case["result"]


def test_parity_fixture_covers_the_requested_values():
    assert [c["pvKw"] for c in PARITY_CASES] == [0, 5, 10, 33.3, 100]


@pytest.mark.parametrize(
    "value, factor, expected",
    [
        # Expected values are what JS Math.round(value * factor) / factor returns
        (0.25, 10, 0.3),  # Python round(0.25, 1) gives 0.2 (banker's rounding)
        (-0.25, 10, -0.2),  # JS rounds halves towards +infinity
        (2.5, 1, 3),
        (-2.5, 1, -2),
        (1.45, 10, 1.5),  # 1.45 * 10 is exactly 14.5 in floating point
        (0.0005, 1000, 0.001),
        (0.49999999999999994, 1, 0),  # math.floor(x + 0.5) would give 1 here
        (1430.66, 10, 1430.7),
    ],
)
def test_js_round(value, factor, expected):
    assert js_round(value, factor) == expected


def test_negative_pv_raises():
    with pytest.raises(ValueError, match="PV capacity cannot be negative"):
        calculate_scenario({"consumption": [1], "pv_generation": [0]}, -1)


def test_zero_consumption_gives_zero_coverage():
    result = calculate_scenario({"consumption": [0, 0], "pv_generation": [0, 0]}, 10)
    assert result["kpis"]["pv_coverage_pct"] == 0


# --- Behaviour (ported from the former src/utils/calculateScenario.test.ts) ---

BASELINE_WITH_PV = {"consumption": [100, 200, 150], "pv_generation": [10, 20, 5]}
BASELINE_ZERO_PV = {"consumption": [100, 200, 150], "pv_generation": [0, 0, 0]}


def test_zero_pv_leaves_the_baseline_unchanged():
    result = calculate_scenario(BASELINE_WITH_PV, 0)
    assert result["scenario"] == BASELINE_WITH_PV
    assert result["kpis"]["co2_savings_ton"] == 0


def test_more_pv_raises_generation_and_lowers_consumption():
    scenario = calculate_scenario(BASELINE_WITH_PV, 10)["scenario"]
    for new, base in zip(scenario["pv_generation"], BASELINE_WITH_PV["pv_generation"]):
        assert new >= base
    for new, base in zip(scenario["consumption"], BASELINE_WITH_PV["consumption"]):
        assert new <= base


def test_consumption_never_drops_below_20_percent_of_baseline():
    scenario = calculate_scenario(BASELINE_WITH_PV, 9999)["scenario"]
    for new, base in zip(scenario["consumption"], BASELINE_WITH_PV["consumption"]):
        assert new >= base * 0.2 - 0.0001  # tiny float tolerance


def test_larger_pv_gives_at_least_as_much_generation():
    small = calculate_scenario(BASELINE_WITH_PV, 5)["scenario"]["pv_generation"]
    large = calculate_scenario(BASELINE_WITH_PV, 10)["scenario"]["pv_generation"]
    assert all(l >= s for s, l in zip(small, large))


def test_kpis_are_complete_and_non_negative_with_pv():
    kpis = calculate_scenario(BASELINE_WITH_PV, 5)["kpis"]
    assert set(kpis) == {"total_consumption_kwh", "pv_coverage_pct", "co2_savings_ton"}
    assert kpis["pv_coverage_pct"] >= 0
    assert kpis["co2_savings_ton"] >= 0


def test_hours_without_sun_get_the_fallback_generation():
    # base PV 0 → additional_pv_per_hour * 0.1
    scenario = calculate_scenario(BASELINE_ZERO_PV, 10)["scenario"]
    assert all(v > 0 for v in scenario["pv_generation"])


@pytest.mark.parametrize(
    "baseline", [BASELINE_WITH_PV, {"consumption": [200], "pv_generation": [10]}]
)
def test_output_has_the_same_length_as_the_baseline(baseline):
    scenario = calculate_scenario(baseline, 5)["scenario"]
    assert len(scenario["consumption"]) == len(baseline["consumption"])
    assert len(scenario["pv_generation"]) == len(baseline["pv_generation"])
