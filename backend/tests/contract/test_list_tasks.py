"""Contract: GET /api/tasks — FR-006, FR-009, FR-016, FR-017, FR-018."""

from __future__ import annotations

from datetime import datetime

from httpx import AsyncClient
from sqlalchemy.orm import Session

from taskflow.services.tasks import create_task, set_completed

T0 = datetime(2026, 10, 29, 12, 0, 0)
T1 = datetime(2026, 10, 29, 12, 0, 1)
T2 = datetime(2026, 10, 29, 12, 0, 2)


def at(moment: datetime):  # noqa: ANN201 - test helper
    return lambda: moment


class TestResponseShape:
    async def test_empty_database_returns_an_empty_array(self, client: AsyncClient) -> None:
        response = await client.get("/api/tasks")

        assert response.status_code == 200
        assert response.json() == []

    async def test_body_is_a_bare_array_not_an_envelope(
        self, client: AsyncClient, session: Session
    ) -> None:
        create_task(session, "Buy milk", clock=at(T0))

        body = (await client.get("/api/tasks")).json()

        assert isinstance(body, list)

    async def test_each_task_matches_the_schema(
        self, client: AsyncClient, session: Session
    ) -> None:
        create_task(session, "Buy milk", clock=at(T0))

        task = (await client.get("/api/tasks")).json()[0]

        assert set(task) == {"id", "title", "completed", "created_at", "completed_at"}
        assert isinstance(task["id"], int)
        assert task["title"] == "Buy milk"
        assert task["completed"] is False
        assert task["completed_at"] is None
        assert task["created_at"].endswith("Z"), "instant must be unambiguous"


class TestOrdering:
    async def test_newest_active_task_first(
        self, client: AsyncClient, session: Session
    ) -> None:
        """FR-016."""
        create_task(session, "oldest", clock=at(T0))
        create_task(session, "middle", clock=at(T1))
        create_task(session, "newest", clock=at(T2))

        titles = [t["title"] for t in (await client.get("/api/tasks")).json()]

        assert titles == ["newest", "middle", "oldest"]

    async def test_identical_created_at_tie_breaks_by_id_descending(
        self, client: AsyncClient, session: Session
    ) -> None:
        """FR-017 — deterministic and repeatable when timestamps collide."""
        first = create_task(session, "first", clock=at(T0))
        second = create_task(session, "second", clock=at(T0))
        third = create_task(session, "third", clock=at(T0))

        ids = [t["id"] for t in (await client.get("/api/tasks")).json()]

        assert ids == [third.id, second.id, first.id]

    async def test_order_is_identical_across_repeated_requests(
        self, client: AsyncClient, session: Session
    ) -> None:
        for name in ("a", "b", "c", "d"):
            create_task(session, name, clock=at(T0))

        first_pass = [t["id"] for t in (await client.get("/api/tasks")).json()]

        for _ in range(3):
            assert [t["id"] for t in (await client.get("/api/tasks")).json()] == first_pass


class TestCompletedOrdering:
    """FR-009 and FR-018 — reachable only once completion exists (US2)."""

    async def test_every_active_task_sits_above_every_completed_one(
        self, client: AsyncClient, session: Session
    ) -> None:
        oldest = create_task(session, "oldest", clock=at(T0))
        create_task(session, "middle", clock=at(T1))
        create_task(session, "newest", clock=at(T2))

        # Complete the NEWEST one: it must drop below both active tasks even
        # though its creation time would otherwise put it first.
        newest_id = (await client.get("/api/tasks")).json()[0]["id"]
        await client.patch(f"/api/tasks/{newest_id}", json={"completed": True})

        body = (await client.get("/api/tasks")).json()

        assert [t["title"] for t in body] == ["middle", "oldest", "newest"]
        assert body[-1]["completed"] is True
        assert oldest.id in {t["id"] for t in body}

    async def test_completed_tasks_rank_most_recently_finished_first(
        self, client: AsyncClient, session: Session
    ) -> None:
        first = create_task(session, "first", clock=at(T0))
        second = create_task(session, "second", clock=at(T1))
        third = create_task(session, "third", clock=at(T2))

        # Complete in an order unrelated to creation order.
        set_completed(session, second.id, True, clock=at(T0))
        set_completed(session, first.id, True, clock=at(T1))
        set_completed(session, third.id, True, clock=at(T2))

        titles = [t["title"] for t in (await client.get("/api/tasks")).json()]

        assert titles == ["third", "first", "second"]

    async def test_reverting_returns_a_task_above_the_completed_group(
        self, client: AsyncClient, session: Session
    ) -> None:
        create_task(session, "stays active", clock=at(T0))
        toggled = create_task(session, "toggled", clock=at(T1))

        await client.patch(f"/api/tasks/{toggled.id}", json={"completed": True})
        assert [t["title"] for t in (await client.get("/api/tasks")).json()] == [
            "stays active",
            "toggled",
        ]

        await client.patch(f"/api/tasks/{toggled.id}", json={"completed": False})

        # Back above, by creation time — newest first (FR-010).
        assert [t["title"] for t in (await client.get("/api/tasks")).json()] == [
            "toggled",
            "stays active",
        ]
