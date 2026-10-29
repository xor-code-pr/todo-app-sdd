"""Task domain logic.

Framework-free: this module imports no FastAPI symbol and is unit-testable
against a plain SQLAlchemy session.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from taskflow.models.task import Task
from taskflow.services.validation import normalise_title

#: Injectable so tests can stage two tasks with an identical created_at and
#: assert the FR-017 tie-break actually holds. A database-side default would
#: make that collision awkward to produce on purpose.
Clock = Callable[[], datetime]


def utc_now() -> datetime:
    """Current UTC time, stored naive (SQLite has no timezone-aware type)."""
    return datetime.now(UTC).replace(tzinfo=None)


def list_tasks(session: Session) -> list[Task]:
    """Every task, in display order.

    Four requirements collapse into one ORDER BY (research.md R3):

    * ``completed_at IS NULL`` yields 1 for active rows and 0 for completed
      ones, so DESC puts every active task above every completed one (FR-009).
    * Active rows all tie on the first two keys — uniformly NULL — and fall
      through to ``created_at DESC``, newest first (FR-016).
    * Completed rows all carry a value, so ``completed_at DESC`` ranks them
      most-recently-finished first (FR-018).
    * ``id DESC`` is the deterministic final tie-break (FR-017).

    The client renders this order verbatim and never sorts.
    """
    statement = select(Task).order_by(
        Task.completed_at.is_(None).desc(),
        Task.completed_at.desc(),
        Task.created_at.desc(),
        Task.id.desc(),
    )
    return list(session.scalars(statement))


def create_task(session: Session, raw_title: str, *, clock: Clock = utc_now) -> Task:
    """Create a task from a raw, untrimmed title.

    The title rule is applied here as well as in the schema layer. The schema
    delegates to the same function, so this is not a second implementation —
    it is what makes the service correct when called directly, which is how
    every unit test calls it.
    """
    task = Task(title=normalise_title(raw_title), created_at=clock())
    session.add(task)
    session.commit()
    session.refresh(task)
    return task
