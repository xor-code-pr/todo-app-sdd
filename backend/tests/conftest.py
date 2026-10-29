"""Shared fixtures for every backend test layer.

Each test gets a fresh SQLite file whose schema is built by **running the
Alembic migration**, not by ``Base.metadata.create_all``. That costs a few
milliseconds per test and buys something worth having: the tests exercise the
exact schema the application ships, including the named CHECK constraint.
A create_all shortcut would let the migration and the tested schema drift
apart silently, which is the failure the constitution's migrations-only rule
exists to prevent.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from taskflow.api.deps import get_session
from taskflow.db import build_engine
from taskflow.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A disposable database file, migrated to head."""
    path = tmp_path / "test.db"

    # migrations/env.py reads the URL from TASKFLOW_DB_PATH.
    monkeypatch.setenv("TASKFLOW_DB_PATH", str(path))

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(config, "head")

    return path


@pytest.fixture
def engine(db_path: Path) -> Generator[Engine, None, None]:
    eng = build_engine(str(db_path))
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def session(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """A session for service-layer tests, against real SQLite."""
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def app(session_factory: sessionmaker[Session]) -> FastAPI:
    """The real application, pointed at the disposable database."""
    application = create_app()

    def override_get_session() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    application.dependency_overrides[get_session] = override_get_session
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """In-process HTTP client — the real app, no live server, no mocks."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http
