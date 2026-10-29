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

import json
from collections.abc import AsyncGenerator, Callable, Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from taskflow import telemetry as telemetry_module
from taskflow.api.deps import get_session
from taskflow.db import build_engine
from taskflow.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def telemetry_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """Point the telemetry record at a disposable file, for every test.

    Autouse and unconditional. Without it a test run appends to the
    developer's own record, which makes `pytest` a way to pollute the thing
    under test and leaves assertions about entry counts at the mercy of
    whatever happened last time someone ran the app.

    The module caches a handler per (path, size) pair, so the cache is reset
    here too — otherwise the first test's file would be held open and every
    later test would write into it.
    """
    path = tmp_path / "telemetry.jsonl"
    monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(path))
    telemetry_module.reset()
    yield path
    telemetry_module.reset()


@pytest.fixture
def read_telemetry(telemetry_path: Path) -> Callable[[], list[dict[str, object]]]:
    """Every entry written so far, current file and rotated predecessor."""

    def _read() -> list[dict[str, object]]:
        entries: list[dict[str, object]] = []
        for candidate in (Path(f"{telemetry_path}.1"), telemetry_path):
            if not candidate.exists():
                continue
            for line in candidate.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    entries.append(json.loads(line))
        return entries

    return _read


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
