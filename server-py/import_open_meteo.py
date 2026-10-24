"""Seed script: fills EnergyDataset with real data (the mock dataset is only used on main).

- PV generation: Open-Meteo historical weather API (tilted irradiance) converted to kWh
- Consumption: BDEW G0 standard load profile (commercial), scaled to an annual kWh total

Run from server-py/:  python import_open_meteo.py
                 or:  python import_open_meteo.py --start 2026-08-01 --end 2026-08-07
Every flag is optional; see DEFAULTS below.
"""

import argparse
import json
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from psycopg.types.json import Jsonb

from calculations import calculate_scenario, js_round, js_sum
from db import connect

DEFAULTS = {
    "lat": "51.2277",  # Düsseldorf, NRW
    "lon": "6.7735",
    "start": "2026-08-01",  # inclusive, UTC days
    "end": "2026-08-07",
    "kwp": "10",  # baseline PV system size
    "tilt": "35",  # panel tilt in degrees
    "azimuth": "0",  # Open-Meteo convention: 0 = south, -90 = east, 90 = west
    "pr": "0.85",  # performance ratio (inverter, wiring, soiling, temperature losses)
    "annual_kwh": "75000",  # ≈ 1,430 kWh/week
}

# Same pvKw the dashboard starts with, so the stored scenario/kpis match what it shows first
SCENARIO_PV_KW = 10
TIME_ZONE = ZoneInfo("Europe/Berlin")  # BDEW profiles are in German local time
HOUR = timedelta(hours=1)
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

G0 = json.loads((Path(__file__).parent / "data/bdew-g0.json").read_text())


# --- Open-Meteo: PV generation ----------------------------------------------


def fetch_irradiance(opts: dict, start: date, end: date) -> dict:
    """Hourly global tilted irradiance (W/m²) from Open-Meteo, keyed by "YYYY-MM-DDTHH:MM" (UTC)."""
    # Radiation is the mean over the PRECEDING hour (value at 01:00 covers 00:00–01:00),
    # so we need one extra hour after the range: fetch one extra day.
    params = {
        "latitude": opts["lat"],
        "longitude": opts["lon"],
        "start_date": start.isoformat(),
        "end_date": (end + timedelta(days=1)).isoformat(),
        "hourly": "global_tilted_irradiance",
        "tilt": opts["tilt"],
        "azimuth": opts["azimuth"],
        "timezone": "UTC",
    }
    response = httpx.get(OPEN_METEO_URL, params=params, timeout=30)
    body = response.json()
    if response.is_error or "hourly" not in body:
        raise RuntimeError(f"Open-Meteo: {body.get('reason', response.reason_phrase)}")
    hourly = body["hourly"]
    return dict(zip(hourly["time"], hourly["global_tilted_irradiance"]))


def pv_kwh(irradiance: dict, start: datetime, hours: int, kwp: float, pr: float) -> list:
    pv = []
    for i in range(hours):
        label = start + (i + 1) * HOUR
        wm2 = irradiance.get(label.strftime("%Y-%m-%dT%H:%M"))
        if wm2 is None:
            raise RuntimeError(
                f"Open-Meteo has no data for {to_js_iso(label)} yet. Pick an earlier --end."
            )
        # Simple PR model: kWp × (irradiance / 1000 W/m² STC) × PR, over one hour → kWh
        pv.append(js_round(kwp * (wm2 / 1000) * pr, 1000))
    return pv


# --- BDEW G0: consumption ---------------------------------------------------


def easter_sunday(year: int) -> date:
    # Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
    a, b, c = year % 19, year // 100, year % 100
    d, e, f = b // 4, b % 4, (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741 (the algorithm's own name)
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def nrw_holidays(year: int) -> set:
    """Public holidays in NRW. The BDEW method treats them like Sundays."""
    easter = easter_sunday(year)
    return {date(year, 1, 1), date(year, 5, 1), date(year, 10, 3), date(year, 11, 1),
            date(year, 12, 25), date(year, 12, 26)} | {
        easter + timedelta(days=n) for n in (-2, 1, 39, 50, 60)  # Good Friday … Corpus Christi
    }


def season(day: date) -> str:
    md = day.month * 100 + day.day
    if md <= 320 or md >= 1101:
        return "winter"  # Nov 1 – Mar 20
    if 515 <= md <= 914:
        return "summer"  # May 15 – Sep 14
    return "transition"


def raw_g0(utc: datetime, holidays: set) -> float:
    """Unscaled G0 value for the local hour that starts at utc (sum of its 4 quarter-hours)."""
    local = utc.astimezone(TIME_ZONE)
    weekday = local.weekday()  # Monday = 0
    if weekday == 6 or local.date() in holidays:
        day_type = "sunday"
    elif weekday == 5:
        day_type = "saturday"
    else:
        day_type = "workday"
    quarters = G0[season(local.date())][day_type]
    return js_sum(quarters[local.hour * 4 : local.hour * 4 + 4])


def consumption_kwh(start: datetime, hours: int, annual_kwh: float) -> list:
    # Scale so the whole local calendar year adds up to annual_kwh
    year = start.astimezone(TIME_ZONE).year
    holidays = nrw_holidays(year)
    year_total = 0
    t = datetime(year - 1, 12, 31, tzinfo=timezone.utc)
    while t < datetime(year + 1, 1, 2, tzinfo=timezone.utc):
        if t.astimezone(TIME_ZONE).year == year:
            year_total += raw_g0(t, holidays)
        t += HOUR
    factor = annual_kwh / year_total

    values = []
    for i in range(hours):
        t = start + i * HOUR
        values.append(js_round(raw_g0(t, nrw_holidays(t.astimezone(TIME_ZONE).year)) * factor, 1000))
    return values


# --- Main ---------------------------------------------------------------------


def to_js_iso(t: datetime) -> str:
    """Same format as JS Date.toISOString(): 2026-08-01T00:00:00.000Z"""
    return t.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_dataset(opts: dict) -> dict:
    """The EnergyDataset row for these options (fetches from Open-Meteo, no database)."""
    error = "--start and --end must be YYYY-MM-DD dates with start <= end"
    try:
        start_day, end_day = date.fromisoformat(opts["start"]), date.fromisoformat(opts["end"])
    except ValueError:
        raise ValueError(error) from None
    if end_day < start_day:
        raise ValueError(error)

    start = datetime(start_day.year, start_day.month, start_day.day, tzinfo=timezone.utc)
    hours = ((end_day - start_day).days + 1) * 24

    baseline = {
        "consumption": consumption_kwh(start, hours, float(opts["annual_kwh"])),
        "pv_generation": pv_kwh(
            fetch_irradiance(opts, start_day, end_day), start, hours,
            float(opts["kwp"]), float(opts["pr"]),
        ),
    }
    result = calculate_scenario(baseline, SCENARIO_PV_KW)
    return {
        "label": f"open-meteo {opts['lat']},{opts['lon']} {opts['kwp']} kWp + BDEW G0",
        "rangeStart": start_day,
        "rangeEnd": end_day,
        "timestamps": [to_js_iso(start + i * HOUR) for i in range(hours)],
        "baseline": baseline,
        "scenario": result["scenario"],
        "kpis": result["kpis"],
    }


def save_dataset(row: dict) -> None:
    # Both backends serve the oldest row, so any previous dataset has to go.
    # One transaction: if the insert fails, the old dataset stays.
    with connect() as conn:
        conn.execute('DELETE FROM "EnergyDataset"')
        conn.execute(
            'INSERT INTO "EnergyDataset" '
            '(id, label, "rangeStart", "rangeEnd", timestamps, baseline, scenario, kpis) '
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                str(uuid.uuid4()), row["label"], row["rangeStart"], row["rangeEnd"],
                Jsonb(row["timestamps"]), Jsonb(row["baseline"]),
                Jsonb(row["scenario"]), Jsonb(row["kpis"]),
            ),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    for name, default in DEFAULTS.items():
        parser.add_argument("--" + name.replace("_", "-"), default=default)
    opts = vars(parser.parse_args())

    try:
        row = build_dataset(opts)
    except (ValueError, RuntimeError) as error:
        sys.exit(f"Error: {error}")
    save_dataset(row)

    consumption = js_round(js_sum(row["baseline"]["consumption"]), 10)
    pv = js_round(js_sum(row["baseline"]["pv_generation"]), 10)
    print(f"Imported {len(row['timestamps'])} hours ({opts['start']} to {opts['end']}) "
          f"at {opts['lat']},{opts['lon']}:")
    print(f"  consumption {consumption} kWh, PV {pv} kWh ({opts['kwp']} kWp)")


if __name__ == "__main__":
    main()
