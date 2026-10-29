"""Service-layer tests — FR-001, FR-002, FR-006, FR-016, FR-017.

These run against a real SQLite session, not a mock. The ordering expression
leans on SQLite's own NULL semantics (research.md R3); a mocked session would
assert the rule against a fiction.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from taskflow.services.errors import TaskNotFoundError, TitleEmptyError, TitleTooLongError
from taskflow.services.tasks import (
    create_task,
    delete_task,
    list_tasks,
    set_completed,
    utc_now,
)

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


class TestSetCompleted:
    def test_completing_stamps_the_completion_time(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))

        updated = set_completed(session, task.id, True, clock=at(T1))

        assert updated.completed is True
        assert updated.completed_at == T1

    def test_reverting_clears_the_completion_time(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))
        set_completed(session, task.id, True, clock=at(T1))

        updated = set_completed(session, task.id, False, clock=at(T2))

        assert updated.completed is False
        assert updated.completed_at is None

    def test_recompleting_does_not_refresh_the_timestamp(self, session: Session) -> None:
        """A no-op must not reorder the completed group (FR-018)."""
        task = create_task(session, "Buy milk", clock=at(T0))
        set_completed(session, task.id, True, clock=at(T1))

        unchanged = set_completed(session, task.id, True, clock=at(T2))

        assert unchanged.completed_at == T1, "a repeat request must not move the task"

    def test_reverting_an_active_task_is_a_no_op(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))

        unchanged = set_completed(session, task.id, False, clock=at(T1))

        assert unchanged.completed_at is None

    def test_completion_history_is_not_retained(self, session: Session) -> None:
        """Complete, revert, complete again — ordered by the LATEST completion."""
        task = create_task(session, "Buy milk", clock=at(T0))
        set_completed(session, task.id, True, clock=at(T0))
        set_completed(session, task.id, False, clock=at(T1))

        final = set_completed(session, task.id, True, clock=at(T2))

        assert final.completed_at == T2

    def test_unknown_id_raises(self, session: Session) -> None:
        with pytest.raises(TaskNotFoundError):
            set_completed(session, 999999, True, clock=at(T0))


class TestOrderingWithCompletion:
    def test_completed_tasks_sink_below_every_active_task(self, session: Session) -> None:
        """FR-009 — regardless of creation time."""
        create_task(session, "old active", clock=at(T0))
        newest = create_task(session, "new but done", clock=at(T2))

        set_completed(session, newest.id, True, clock=at(T2))

        assert [t.title for t in list_tasks(session)] == ["old active", "new but done"]

    def test_completed_group_is_ordered_by_completion_time_desc(
        self, session: Session
    ) -> None:
        """FR-018 — and NOT by creation time."""
        first = create_task(session, "first", clock=at(T0))
        second = create_task(session, "second", clock=at(T1))

        set_completed(session, second.id, True, clock=at(T0))
        set_completed(session, first.id, True, clock=at(T2))

        assert [t.title for t in list_tasks(session)] == ["first", "second"]

    def test_reverted_task_rejoins_active_by_creation_time(self, session: Session) -> None:
        """FR-010 — it does not jump to the top."""
        oldest = create_task(session, "oldest", clock=at(T0))
        create_task(session, "middle", clock=at(T1))
        create_task(session, "newest", clock=at(T2))

        set_completed(session, oldest.id, True, clock=at(T2))
        set_completed(session, oldest.id, False, clock=at(T2))

        assert [t.title for t in list_tasks(session)] == ["newest", "middle", "oldest"]


class TestDeleteTask:
    def test_removes_the_row(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))

        delete_task(session, task.id)

        assert list_tasks(session) == []

    def test_leaves_other_tasks_untouched(self, session: Session) -> None:
        keep = create_task(session, "keep", clock=at(T0))
        remove = create_task(session, "remove", clock=at(T1))

        delete_task(session, remove.id)

        assert [t.id for t in list_tasks(session)] == [keep.id]

    def test_a_completed_task_can_be_deleted(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))
        set_completed(session, task.id, True, clock=at(T1))

        delete_task(session, task.id)

        assert list_tasks(session) == []

    def test_unknown_id_raises(self, session: Session) -> None:
        with pytest.raises(TaskNotFoundError):
            delete_task(session, 999999)

    def test_deleting_twice_raises_the_second_time(self, session: Session) -> None:
        task = create_task(session, "Buy milk", clock=at(T0))
        delete_task(session, task.id)

        with pytest.raises(TaskNotFoundError):
            delete_task(session, task.id)
