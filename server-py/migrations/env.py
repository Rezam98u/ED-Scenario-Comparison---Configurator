"""Alembic environment: runs the migrations in versions/ against DATABASE_URL_PY.

The app has no SQLAlchemy models (it uses plain SQL with psycopg), so the migrations
are written by hand and there is no autogenerate.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from db import DATABASE_URL

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)

# "postgresql+psycopg" tells SQLAlchemy to use psycopg 3, the driver the app already uses
SQLALCHEMY_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)


def run_migrations_offline() -> None:
    """alembic upgrade head --sql: print the SQL instead of running it."""
    context.configure(url=SQLALCHEMY_URL, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with create_engine(SQLALCHEMY_URL).connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
