"""Contract: PATCH /api/tasks/{id} — FR-007, FR-008, FR-010."""

from __future__ import annotations

from httpx import AsyncClient


def assert_envelope(body: object, code: str) -> None:
    assert isinstance(body, dict), body
    assert set(body) == {"error"}
    detail = body["error"]
    assert set(detail) == {"code", "message", "field"}
    assert detail["code"] == code


async def create(client: AsyncClient, title: str = "Buy milk") -> dict[str, object]:
    response = await client.post("/api/tasks", json={"title": title})
    assert response.status_code == 201
    body = response.json()
    assert isinstance(body, dict)
    return body


class TestCompletionToggle:
    async def test_completing_returns_200_and_the_updated_task(
        self, client: AsyncClient
    ) -> None:
        task = await create(client)

        response = await client.patch(
            f"/api/tasks/{task['id']}", json={"completed": True}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["completed"] is True
        assert body["completed_at"] is not None

    async def test_reverting_clears_the_completion_time(
        self, client: AsyncClient
    ) -> None:
        task = await create(client)
        await client.patch(f"/api/tasks/{task['id']}", json={"completed": True})

        response = await client.patch(
            f"/api/tasks/{task['id']}", json={"completed": False}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["completed"] is False
        assert body["completed_at"] is None

    async def test_title_is_untouched_by_a_completion_change(
        self, client: AsyncClient
    ) -> None:
        task = await create(client, "Buy milk")

        body = (
            await client.patch(f"/api/tasks/{task['id']}", json={"completed": True})
        ).json()

        assert body["title"] == "Buy milk"


class TestIdempotence:
    async def test_recompleting_does_not_refresh_the_timestamp(
        self, client: AsyncClient
    ) -> None:
        """A no-op must not silently reorder the completed group (FR-018)."""
        task = await create(client)
        first = (
            await client.patch(f"/api/tasks/{task['id']}", json={"completed": True})
        ).json()

        again = await client.patch(
            f"/api/tasks/{task['id']}", json={"completed": True}
        )

        assert again.status_code == 200
        assert again.json()["completed_at"] == first["completed_at"]

    async def test_reverting_an_already_active_task_is_a_no_op(
        self, client: AsyncClient
    ) -> None:
        task = await create(client)

        response = await client.patch(
            f"/api/tasks/{task['id']}", json={"completed": False}
        )

        assert response.status_code == 200
        assert response.json()["completed_at"] is None


class TestTitleImmutability:
    """FR-007 — there must be no route by which a title changes."""

    async def test_sending_a_title_is_rejected_and_changes_nothing(
        self, client: AsyncClient
    ) -> None:
        task = await create(client, "Original")

        response = await client.patch(
            f"/api/tasks/{task['id']}", json={"completed": True, "title": "Hacked"}
        )

        assert response.status_code == 422
        assert_envelope(response.json(), "VALIDATION_ERROR")

        listed = (await client.get("/api/tasks")).json()
        assert listed[0]["title"] == "Original"
        assert listed[0]["completed"] is False, "the rejected request changed nothing"


class TestErrors:
    async def test_unknown_id_returns_404(self, client: AsyncClient) -> None:
        response = await client.patch("/api/tasks/999999", json={"completed": True})

        assert response.status_code == 404
        assert_envelope(response.json(), "TASK_NOT_FOUND")

    async def test_missing_completed_field_is_a_validation_error(
        self, client: AsyncClient
    ) -> None:
        task = await create(client)

        response = await client.patch(f"/api/tasks/{task['id']}", json={})

        assert response.status_code == 422
        assert_envelope(response.json(), "VALIDATION_ERROR")
