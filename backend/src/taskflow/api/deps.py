"""Request-scoped dependencies."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy.orm import Session

from taskflow.db import SessionLocal


def get_session() -> Generator[Session, None, None]:
    """Yield a session bound to the request, closing it afterwards."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
