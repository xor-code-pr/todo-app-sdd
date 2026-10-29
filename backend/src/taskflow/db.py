"""Engine, session factory and declarative base.

The database file is chosen by ``TASKFLOW_DB_PATH`` so that the E2E suite can
point at a disposable file without touching the developer's local data. The
schema is never created from metadata — Alembic is the only permitted route to
a schema change (constitution, Data and Authentication).
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DEFAULT_DB_PATH = "taskflow.db"


class Base(DeclarativeBase):
    """Declarative base for every ORM model in the application."""


def database_url(db_path: str | None = None) -> str:
    """Build the SQLite URL for ``db_path``, defaulting to the env var."""
    path = db_path or os.environ.get("TASKFLOW_DB_PATH", DEFAULT_DB_PATH)
    return f"sqlite:///{Path(path).as_posix()}"


def build_engine(db_path: str | None = None) -> Engine:
    return create_engine(database_url(db_path), echo=False)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
