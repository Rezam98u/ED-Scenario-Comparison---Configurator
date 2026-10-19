"""Data analysis of the baseline with pandas.

Pure functions only (no FastAPI, no database), like calculations.py.

Time zone assumption: the timestamps are UTC and all grouping (days, hours of the day)
is done in UTC. A "day" is therefore 00:00-23:59 UTC, which is 01:00-00:59 in German
winter time. Converting to local time would need a time zone and DST handling.
"""

import pandas as pd


def analyze_baseline(data: dict) -> dict:
    """Daily totals, average daily profile and peak hours of the baseline.

    `data` has the shape of the EnergyDataset row: { timestamps, baseline: { consumption,
    pv_generation }, ... }. Each value is the energy (kWh) of one hour.
    """
    # 1) Build a DataFrame: a table with one row per hour and one column per series.
    #    The index (row labels) is the timestamp. pd.to_datetime parses the ISO strings,
    #    utc=True makes the index time-zone aware (UTC), so pandas never guesses a zone.
    df = pd.DataFrame(
        {
            "consumption": data["baseline"]["consumption"],
            "pv": data["baseline"]["pv_generation"],
        },
        index=pd.to_datetime(data["timestamps"], utc=True),
    )

    if df.empty:
        return {"daily": [], "hourly_profile": [], "peak_consumption_hour": None, "peak_pv_hour": None}

    # 2) New column, calculated for all rows at once (no loop): the smaller of the two
    #    values per row (axis=1 means "across the columns of one row"). PV can only cover
    #    what is consumed in the same hour; the rest goes to the grid.
    df["self_consumed"] = df[["consumption", "pv"]].min(axis=1)

    # 3) Daily table: resample("D") groups the hourly rows into calendar days (UTC,
    #    because the index is UTC), and .sum() adds up each column per day.
    daily = df.resample("D").sum()

    # Autarky = share of consumption covered by own PV. Column / column divides row by
    # row. .where(cond, 0) keeps the value where cond is True and puts 0 elsewhere,
    # so a day without consumption gets 0 instead of a division by zero (NaN).
    daily["autarky_pct"] = (daily["self_consumed"] / daily["consumption"] * 100).where(
        daily["consumption"] > 0, 0
    )

    # .round() rounds every value in the table. Note: pandas (like Python's round())
    # rounds halves to the even neighbour, unlike JS Math.round in calculations.py.
    daily = daily.round({"consumption": 2, "pv": 2, "self_consumed": 2, "autarky_pct": 1})

    # 4) Average daily profile: df.index.hour is the hour of day (0-23) of every row.
    #    groupby collects all rows with the same hour (e.g. all 7 "12:00" rows) and
    #    .mean() averages each column within a group. The result is indexed by hour.
    profile = df.groupby(df.index.hour)[["consumption", "pv"]].mean()

    # 5) Peak hours: idxmax() returns the index label (here: the hour) of the largest
    #    value. On a tie it returns the first (earliest) hour. Done before rounding,
    #    so rounding cannot create a tie.
    peak_consumption_hour = int(profile["consumption"].idxmax())
    peak_pv_hour = int(profile["pv"].idxmax())
    profile = profile.round(2)

    # 6) Convert to plain lists of dicts for JSON. iterrows() walks the rows as
    #    (index label, row) pairs;
    #    float()/int() turn numpy numbers into normal Python numbers.
    daily_rows = [
        {
            "date": day.strftime("%Y-%m-%d"),
            "consumption_kwh": float(row["consumption"]),
            "pv_kwh": float(row["pv"]),
            "self_consumed_kwh": float(row["self_consumed"]),
            "autarky_pct": float(row["autarky_pct"]),
        }
        for day, row in daily.iterrows()
    ]
    profile_rows = [
        {"hour": int(hour), "consumption_kwh": float(row["consumption"]), "pv_kwh": float(row["pv"])}
        for hour, row in profile.iterrows()
    ]

    return {
        "daily": daily_rows,
        "hourly_profile": profile_rows,
        "peak_consumption_hour": peak_consumption_hour,
        "peak_pv_hour": peak_pv_hour,
    }
