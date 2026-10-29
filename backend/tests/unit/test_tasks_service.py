"""Service-layer tests — FR-001, FR-002, FR-006, FR-016, FR-017.

These run against a real SQLite session, not a mock. The ordering expression
leans on SQLite's own NULL semantics (research.md R3); a mocked session would
assert the rule against a fiction.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from taskflow.services.errors import TitleEmptyError, TitleTooLongError
from taskflow.services.tasks import create_task, list_tasks, utc_now

T0 = datetime(2026, 10, 29, 12, 0, 0)
T1 = datetime(2026, 10, 29, 12, 0, 1)
T2 = datetime(2026, 10, 29, 12, 0, 2)


def at(moment: datetime):  # noqa: ANN201 - test helper
    """A clock frozen at ``moment``."""
    return lambda: moment


class TestDefaultClock:
    def test_returns_naive_utc(self) -> None:
        """Timestamps are stored naive and interpreted as UTC.

        SQLite has no timezone-aware type, so the convention has to hold by
        discipline rather than by the column type enforcing it.
        """
        now = utc_now()

        assert now.tzinfo is None
        delta = abs((now - datetime.now(UTC).replace(tzinfo=None)).total_seconds())
        assert delta < 5, "default clock should track real UTC, not local time"


class TestCreateTask:
    def test_stores_the_trimmed_title(self, session: Session) -> None:
        task = create_task(session, "  Buy milk  ", clock=at(T0))
        assert task.title == "Buy milk"

    def test_new_task_is_active(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))
        assert task.completed_at is None
        assert task.completed is False

    def test_created_at_comes_from_the_injected_clock(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T1))
        assert task.created_at == T1

    def test_assigns_an_identifier(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))
        assert isinstance(task.id, int)

    def test_rejects_a_blank_title(self, session: Session) -> None:
        with pytest.raises(TitleEmptyError):
            create_task(session, "   ", clock=at(T0))

    def test_rejects_an_over_length_title(self, session: Session) -> None:
        with pytest.raises(TitleTooLongError):
            create_task(session, "a" * 151, clock=at(T0))

    def test_a_rejected_title_creates_no_row(self, session: Session) -> None:
        with pytest.raises(TitleEmptyError):
            create_task(session, "", clock=at(T0))
        assert list_tasks(session) == []

    def test_duplicate_titles_are_permitted(self, session: Session) -> None:
        create_task(session, "Buy milk", clock=at(T0))
        create_task(session, "Buy milk", clock=at(T1))
        assert len(list_tasks(session)) == 2


class TestListOrdering:
    def test_empty_database_returns_empty_list(self, session: Session) -> None:
        assert list_tasks(session) == []

    def test_newest_first(self, session: Session) -> None:
        """FR-016 — active tasks ordered by creation time, newest first."""
        create_task(session, "oldest", clock=at(T0))
        create_task(session, "middle", clock=at(T1))
        create_task(session, "newest", clock=at(T2))

        assert [t.title for t in list_tasks(session)] == ["newest", "middle", "oldest"]

    def test_identical_timestamps_tie_break_by_id_descending(self, session: Session) -> None:
        """FR-017 — ordering is deterministic when created_at collides.

        Without the id tie-break this ordering is whatever SQLite happens to
        return, which can differ between runs and makes the bug miserable to
        reproduce.
        """
        first = create_task(session, "first", clock=at(T0))
        second = create_task(session, "second", clock=at(T0))
        third = create_task(session, "third", clock=at(T0))

        assert first.created_at == second.created_at == third.created_at
        assert [t.id for t in list_tasks(session)] == [third.id, second.id, first.id]

    def test_order_is_stable_across_repeated_queries(self, session: Session) -> None:
        for name in ("a", "b", "c", "d"):
            create_task(session, name, clock=at(T0))

        first_pass = [t.id for t in list_tasks(session)]
        for _ in range(5):
            assert [t.id for t in list_tasks(session)] == first_pass

    def test_a_newly_created_task_leads_the_list(self, session: Session) -> None:
        """FR-006 — a new task appears above every existing active task."""
        create_task(session, "existing", clock=at(T0))
        newest = create_task(session, "brand new", clock=at(T2))

        assert list_tasks(session)[0].id == newest.id
