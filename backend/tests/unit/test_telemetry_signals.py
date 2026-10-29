"""The four signals Principle VII names, at their instrumentation points.

`test_telemetry.py` proves the sink works. This file proves it is actually
called, and called with the right vocabulary — which is the half that rots
when someone adds a service method and forgets.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from sqlalchemy.orm import Session

from taskflow.services import tasks as tasks_service

Entries = Callable[[], list[dict[str, object]]]


def _operations(entries: list[dict[str, object]], kind: str) -> list[object]:
    return [e["operation"] for e in entries if e["kind"] == kind]


# --- FR-008, SC-007: feature counts --------------------------------------


def test_creating_a_task_records_one_usage_entry(
    session: Session, read_telemetry: Entries
) -> None:
    tasks_service.create_task(session, "Buy milk")

    assert _operations(read_telemetry(), "usage") == ["task_created"]


def test_completing_and_reopening_are_distinguished(
    session: Session, read_telemetry: Entries
) -> None:
    task = tasks_service.create_task(session, "Buy milk")
    tasks_service.set_completed(session, task.id, True)
    tasks_service.set_completed(session, task.id, False)

    assert _operations(read_telemetry(), "usage") == [
        "task_created",
        "task_completed",
        "task_reopened",
    ]


def test_an_idempotent_no_op_is_not_counted(
    session: Session, read_telemetry: Entries
) -> None:
    """SC-007 requires the counts to match what was actually done.

    `set_completed` returns early when the state is unchanged. Counting the
    request rather than the change would report completions that never
    happened for any client that re-sends the same value — which is exactly
    what a retry does.
    """
    task = tasks_service.create_task(session, "Buy milk")
    tasks_service.set_completed(session, task.id, True)
    tasks_service.set_completed(session, task.id, True)
    tasks_service.set_completed(session, task.id, True)

    assert _operations(read_telemetry(), "usage").count("task_completed") == 1


def test_deleting_a_task_records_one_usage_entry(
    session: Session, read_telemetry: Entries
) -> None:
    task = tasks_service.create_task(session, "Buy milk")
    tasks_service.delete_task(session, task.id)

    assert _operations(read_telemetry(), "usage").count("task_deleted") == 1


def test_listing_tasks_records_no_usage_entry(
    session: Session, read_telemetry: Entries
) -> None:
    """Reading is not a feature use.

    FR-008 names four counts — created, completed, reopened, deleted — and a
    read is already covered by the timing signal. Counting it here as well
    would double the volume of the record to say nothing new, and every
    mutation in this application triggers a refetch.
    """
    tasks_service.create_task(session, "Buy milk")
    tasks_service.list_tasks(session)
    tasks_service.list_tasks(session)

    assert _operations(read_telemetry(), "usage") == ["task_created"]


# --- FR-011: none of this carries a title --------------------------------


def test_no_usage_entry_contains_the_task_title(
    session: Session, read_telemetry: Entries
) -> None:
    marker = "zzqqxx-service-layer-marker"
    task = tasks_service.create_task(session, marker)
    tasks_service.set_completed(session, task.id, True)
    tasks_service.delete_task(session, task.id)

    assert marker not in str(read_telemetry())


# --- FR-009: lifecycle ---------------------------------------------------


def test_applying_a_migration_is_recorded(db_path: Path, read_telemetry: Entries) -> None:
    """`db_path` runs `alembic upgrade head` in-process, so requesting the
    fixture is what triggers the event under test."""
    assert db_path.exists()

    entries = read_telemetry()
    lifecycle = [e for e in entries if e["kind"] == "lifecycle"]

    assert any(e.get("event") == "migration_applied" for e in lifecycle)


def test_applying_a_migration_records_the_revision(
    db_path: Path, read_telemetry: Entries
) -> None:
    assert db_path.exists()
    applied = [
        e
        for e in read_telemetry()
        if e["kind"] == "lifecycle" and e.get("event") == "migration_applied"
    ]

    assert applied
    assert applied[0].get("revision")
