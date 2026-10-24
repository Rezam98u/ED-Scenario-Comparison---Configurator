"""Tests for calculations.py. Run from server-py/:  pytest

The parity fixture is produced by the TypeScript reference implementation. Regenerate it
from the repo root with:
    npx tsx server-py/tests/generate_parity_fixture.ts
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
def test_matches_typescript_exactly(case):
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
