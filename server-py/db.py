"""Settings shared by the API (main.py), the seed script and the migrations (migrations/env.py)."""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

# server-py/.env (git-ignored) can set DATABASE_URL_PY and GROQ_API_KEY.
# Variables already set in the environment win.
load_dotenv(Path(__file__).parent / ".env")

# Prisma's DATABASE_URL ends with "?schema=public", which psycopg does not accept,
# so the Python backend reads its own variable.
DATABASE_URL = os.environ.get(
    "DATABASE_URL_PY", "postgresql://postgres:postgres@localhost:5432/energy_dashboard"
)


def connect():
    # connect_timeout=5 is the same as Prisma's default connection timeout
    return psycopg.connect(DATABASE_URL, connect_timeout=5, row_factory=dict_row)
