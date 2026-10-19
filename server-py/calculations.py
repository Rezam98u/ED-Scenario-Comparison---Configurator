"""Scenario calculation: an exact port of src/utils/calculateScenario.ts.

Pure functions only (no FastAPI, no database), so they are easy to test.
The TypeScript version stays in the frontend as the reference for the parity test
(test_calculations.py).
"""

import math

HOURS_PER_DAY = 4  # Peak sun hours per day
SELF_CONSUMPTION = 0.6  # 60% of PV generation is self-consumed
CO2_FACTOR = 0.4  # kg CO2 per kWh from grid


def js_round(value: float, factor: int) -> float:
    """Reproduce JavaScript's Math.round(value * factor) / factor.

    JS Math.round rounds halves up (towards +infinity): Math.round(2.5) is 3 and
    Math.round(-2.5) is -2. Python's round() uses banker's rounding (halves go to the
    even neighbour): round(2.5) is 2. So round(x, 1) would sometimes differ from JS.

    The shortcut math.floor(x + 0.5) is not exact either: for x = 0.49999999999999994
    the addition x + 0.5 rounds up to 1.0, but JS returns 0. Comparing the fraction
    instead avoids that, because y - floor(y) is calculated without rounding error.
    """
    scaled = value * factor
    if not math.isfinite(scaled):
        return scaled / factor  # Math.round(Infinity) is Infinity, like here
    rounded = math.floor(scaled)
    if scaled - rounded >= 0.5:
        rounded += 1
    return rounded / factor


def _js_sum(values: list) -> float:
    """Add up left to right, like JS reduce((s, v) => s + v, 0).

    Python 3.12+ sum() uses compensated summation for floats, which can give a
    slightly different (more precise) result than JS, so a plain loop is used instead.
    """
    total = 0
    for v in values:
        total += v
    return total


def calculate_scenario(baseline: dict, pv_kw: float) -> dict:
    """Return { "scenario": {...}, "kpis": {...} }, same shape as ScenarioResult in TS."""
    if pv_kw < 0:
        raise ValueError("PV capacity cannot be negative")

    additional_pv_per_hour = (pv_kw * HOURS_PER_DAY) / 24

    # Math.max(...[]) is -Infinity in JS; Python's max() would raise on an empty list
    max_base_pv = max(baseline["pv_generation"], default=-math.inf)

    scenario = {"consumption": [], "pv_generation": []}

    for i in range(len(baseline["consumption"])):
        base_consumption = baseline["consumption"][i]
        base_pv_generation = baseline["pv_generation"][i]

        new_pv_generation = base_pv_generation

        if pv_kw > 0:
            if base_pv_generation > 0 and max_base_pv > 0:
                scale_factor = base_pv_generation / max_base_pv
                new_pv_generation = base_pv_generation + additional_pv_per_hour * scale_factor
            else:
                new_pv_generation = additional_pv_per_hour * 0.1

        additional_pv = new_pv_generation - base_pv_generation
        consumption_reduction = min(additional_pv * SELF_CONSUMPTION, base_consumption * 0.8)
        new_consumption = max(base_consumption - consumption_reduction, base_consumption * 0.2)

        scenario["consumption"].append(new_consumption)
        scenario["pv_generation"].append(new_pv_generation)

    total_baseline_consumption = _js_sum(baseline["consumption"])
    total_scenario_consumption = _js_sum(scenario["consumption"])
    total_pv_generation = _js_sum(scenario["pv_generation"])

    consumption_savings = total_baseline_consumption - total_scenario_consumption
    pv_coverage_pct = (
        (total_pv_generation / total_baseline_consumption) * 100
        if total_baseline_consumption > 0
        else 0
    )
    co2_savings_ton = (consumption_savings * CO2_FACTOR) / 1000

    kpis = {
        "total_consumption_kwh": js_round(total_scenario_consumption, 10),
        "pv_coverage_pct": js_round(pv_coverage_pct, 10),
        "co2_savings_ton": js_round(co2_savings_ton, 1000),
    }

    return {"scenario": scenario, "kpis": kpis}
