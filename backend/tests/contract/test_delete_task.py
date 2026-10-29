"""Contract: DELETE /api/tasks/{id} — FR-012."""

from __future__ import annotations

from httpx import AsyncClient


def assert_envelope(body: object, code: str) -> None:
    assert isinstance(body, dict), body
    assert set(body) == {"error"}
    detail = body["error"]
    assert set(detail) == {"code", "message", "field"}
    assert detail["code"] == code


async def create(client: AsyncClient, title: str = "Buy milk") -> int:
    response = await client.post("/api/tasks", json={"title": title})
    assert response.status_code == 201
    task_id = response.json()["id"]
    assert isinstance(task_id, int)
    return task_id


class TestDeletion:
    async def test_returns_204_with_no_body(self, client: AsyncClient) -> None:
        task_id = await create(client)

        response = await client.delete(f"/api/tasks/{task_id}")

        assert response.status_code == 204
        assert response.content == b""

    async def test_the_task_is_gone_from_the_list(self, client: AsyncClient) -> None:
        keep = await create(client, "keep me")
        remove = await create(client, "remove me")

        await client.delete(f"/api/tasks/{remove}")

        listed = (await client.get("/api/tasks")).json()
        assert [t["id"] for t in listed] == [keep]

    async def test_a_completed_task_can_be_deleted(self, client: AsyncClient) -> None:
        task_id = await create(client)
        await client.patch(f"/api/tasks/{task_id}", json={"completed": True})

        response = await client.delete(f"/api/tasks/{task_id}")

        assert response.status_code == 204
        assert (await client.get("/api/tasks")).json() == []

    async def test_deleting_the_only_task_leaves_an_empty_list(
        self, client: AsyncClient
    ) -> None:
        task_id = await create(client)

        await client.delete(f"/api/tasks/{task_id}")

        assert (await client.get("/api/tasks")).json() == []


class TestErrors:
    async def test_unknown_id_returns_404(self, client: AsyncClient) -> None:
        response = await client.delete("/api/tasks/999999")

        assert response.status_code == 404
        assert_envelope(response.json(), "TASK_NOT_FOUND")

    async def test_deleting_twice_returns_404_the_second_time(
        self, client: AsyncClient
    ) -> None:
        """Not idempotent-with-204 on purpose: the client has stale state and
        should be told, not reassured."""
        task_id = await create(client)

        first = await client.delete(f"/api/tasks/{task_id}")
        second = await client.delete(f"/api/tasks/{task_id}")

        assert first.status_code == 204
        assert second.status_code == 404
        assert_envelope(second.json(), "TASK_NOT_FOUND")


class TestPermanence:
    async def test_deletion_is_not_recoverable(self, client: AsyncClient) -> None:
        """FR-012 — no tombstone, no soft-delete flag, nothing to restore."""
        task_id = await create(client, "gone forever")

        await client.delete(f"/api/tasks/{task_id}")

        # There is no endpoint that could bring it back, and the row itself
        # is absent — not merely filtered out of the list.
        assert (await client.get("/api/tasks")).json() == []
        assert (await client.patch(
            f"/api/tasks/{task_id}", json={"completed": True}
        )).status_code == 404
