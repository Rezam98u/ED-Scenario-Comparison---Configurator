"""Deterministic grid-search optimizer for PV capacity, exposed as an agent tool.

Runs calculate_scenario across a range of pvKw values and returns the best one for the
requested objective, plus the full search path.
"""

from calculations import calculate_scenario

OBJECTIVES = ("co2", "coverage", "minConsumption")


def score(kpis: dict, objective: str) -> float:
    if objective == "co2":
        return kpis["co2_savings_ton"]
    if objective == "coverage":
        return kpis["pv_coverage_pct"]
    return -kpis["total_consumption_kwh"]  # minConsumption


def optimize_scenario(baseline: dict, objective: str, min_kw=0, max_kw=100, step_kw=1) -> dict:
    if min_kw < 0 or max_kw < min_kw or step_kw <= 0:
        raise ValueError("Invalid optimizer range")

    search_path = []
    best = None
    best_score = float("-inf")

    kw = min_kw
    while kw <= max_kw:  # kw += step_kw, like the JS loop (same float steps)
        point = {"pvKw": kw, "kpis": calculate_scenario(baseline, kw)["kpis"]}
        search_path.append(point)
        s = score(point["kpis"], objective)
        if s > best_score:  # strictly better, so ties keep the smallest pvKw
            best_score = s
            best = point
        kw += step_kw

    return {
        "objective": objective,
        "bestPvKw": best["pvKw"],
        "bestKpis": best["kpis"],
        "searchPath": search_path,
    }
