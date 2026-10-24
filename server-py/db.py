"""Database settings shared by the API (main.py) and the migrations (migrations/env.py)."""

import os

import psycopg
from psycopg.rows import dict_row

# Prisma's DATABASE_URL ends with "?schema=public", which psycopg does not accept,
# so the Python backend reads its own variable.
DATABASE_URL = os.environ.get(
    "DATABASE_URL_PY", "postgresql://postgres:postgres@localhost:5432/energy_dashboard"
)


def connect():
    # connect_timeout=5 is the same as Prisma's default connection timeout
    return psycopg.connect(DATABASE_URL, connect_timeout=5, row_factory=dict_row)
