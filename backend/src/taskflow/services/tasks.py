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
from taskflow.services.errors import TaskNotFoundError
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


def get_task(session: Session, task_id: int) -> Task:
    """Fetch a task or raise. Not exposed over HTTP — nothing reads one task."""
    task = session.get(Task, task_id)
    if task is None:
        raise TaskNotFoundError(f"No task with id {task_id}.")
    return task


def set_completed(
    session: Session,
    task_id: int,
    completed: bool,
    *,
    clock: Clock = utc_now,
) -> Task:
    """Complete a task, or return it to active.

    Setting the state a task already holds is a **no-op that does not touch
    ``completed_at``**. Refreshing the timestamp on a repeat request would
    silently reorder the completed group, since FR-018 ranks completed tasks
    by that value — a user re-sending ``completed: true`` would watch an
    unrelated task move.

    Reverting discards the completion time rather than keeping history: the
    spec asks for no such history, and storing it would be speculative.
    """
    task = get_task(session, task_id)

    if task.completed == completed:
        return task

    task.completed_at = clock() if completed else None
    session.commit()
    session.refresh(task)
    return task


def delete_task(session: Session, task_id: int) -> None:
    """Remove a task permanently.

    The row is deleted outright (FR-012): no tombstone, no soft-delete flag,
    no recovery path. The confirmation dialog in the UI is the only thing
    standing between the user and this, which is why it is a blocking dialog
    rather than an undo toast.
    """
    task = get_task(session, task_id)
    session.delete(task)
    session.commit()
