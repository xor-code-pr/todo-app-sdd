"""Contract: POST /api/tasks — FR-001 to FR-005."""

from __future__ import annotations

from httpx import AsyncClient

FAMILY = "\U0001f468‍\U0001f469‍\U0001f467‍\U0001f466"  # one grapheme cluster


def assert_envelope(body: object, code: str, field: str | None = None) -> None:
    """Every non-2xx body must use the single error envelope.

    A correct status code with a malformed body still breaks the generated
    client, so the shape is asserted, not just the status.
    """
    assert isinstance(body, dict), body
    assert set(body) == {"error"}
    detail = body["error"]
    assert set(detail) == {"code", "message", "field"}
    assert detail["code"] == code
    assert isinstance(detail["message"], str) and detail["message"]
    if field is not None:
        assert detail["field"] == field


class TestSuccessfulCreation:
    async def test_returns_201_and_the_created_task(self, client: AsyncClient) -> None:
        response = await client.post("/api/tasks", json={"title": "Buy milk"})

        assert response.status_code == 201
        body = response.json()
        assert body["title"] == "Buy milk"
        assert body["completed"] is False
        assert body["completed_at"] is None
        assert isinstance(body["id"], int)

    async def test_created_task_appears_in_the_list(self, client: AsyncClient) -> None:
        await client.post("/api/tasks", json={"title": "Buy milk"})

        listed = (await client.get("/api/tasks")).json()

        assert [t["title"] for t in listed] == ["Buy milk"]

    async def test_title_is_trimmed(self, client: AsyncClient) -> None:
        """FR-002."""
        body = (await client.post("/api/tasks", json={"title": "  Buy milk  "})).json()

        assert body["title"] == "Buy milk"

    async def test_internal_whitespace_is_preserved(self, client: AsyncClient) -> None:
        body = (await client.post("/api/tasks", json={"title": "Buy    milk"})).json()

        assert body["title"] == "Buy    milk"

    async def test_newest_task_leads_the_list(self, client: AsyncClient) -> None:
        """FR-006."""
        await client.post("/api/tasks", json={"title": "first"})
        await client.post("/api/tasks", json={"title": "second"})

        listed = (await client.get("/api/tasks")).json()

        assert listed[0]["title"] == "second"


class TestTitleRejection:
    async def test_empty_title_is_rejected(self, client: AsyncClient) -> None:
        """FR-004."""
        response = await client.post("/api/tasks", json={"title": ""})

        assert response.status_code == 422
        assert_envelope(response.json(), "TITLE_EMPTY", field="title")

    async def test_whitespace_only_title_is_rejected(self, client: AsyncClient) -> None:
        response = await client.post("/api/tasks", json={"title": "   \t\n  "})

        assert response.status_code == 422
        assert_envelope(response.json(), "TITLE_EMPTY", field="title")

    async def test_rejected_title_creates_nothing(self, client: AsyncClient) -> None:
        await client.post("/api/tasks", json={"title": ""})

        assert (await client.get("/api/tasks")).json() == []

    async def test_missing_title_field_is_a_validation_error(
        self, client: AsyncClient
    ) -> None:
        response = await client.post("/api/tasks", json={})

        assert response.status_code == 422
        assert_envelope(response.json(), "VALIDATION_ERROR")

    async def test_unknown_field_is_rejected(self, client: AsyncClient) -> None:
        response = await client.post("/api/tasks", json={"title": "x", "completed": True})

        assert response.status_code == 422
        assert_envelope(response.json(), "VALIDATION_ERROR")


class TestLengthBoundary:
    async def test_exactly_150_characters_is_accepted(self, client: AsyncClient) -> None:
        """FR-003 — the boundary is inclusive."""
        title = "a" * 150

        response = await client.post("/api/tasks", json={"title": title})

        assert response.status_code == 201
        assert response.json()["title"] == title

    async def test_151_characters_is_rejected(self, client: AsyncClient) -> None:
        response = await client.post("/api/tasks", json={"title": "a" * 151})

        assert response.status_code == 422
        assert_envelope(response.json(), "TITLE_TOO_LONG", field="title")

    async def test_trailing_space_brings_an_over_length_title_into_range(
        self, client: AsyncClient
    ) -> None:
        """Validation runs on the trimmed value, not the raw input."""
        response = await client.post("/api/tasks", json={"title": "a" * 150 + " "})

        assert response.status_code == 201
        assert response.json()["title"] == "a" * 150

    async def test_150_family_emoji_are_accepted(self, client: AsyncClient) -> None:
        """Clusters are counted, not code points — the reason `regex` is a dependency."""
        title = FAMILY * 150

        response = await client.post("/api/tasks", json={"title": title})

        assert response.status_code == 201, "counting code points would wrongly reject this"
        assert response.json()["title"] == title

    async def test_151_family_emoji_are_rejected(self, client: AsyncClient) -> None:
        response = await client.post("/api/tasks", json={"title": FAMILY * 151})

        assert response.status_code == 422
        assert_envelope(response.json(), "TITLE_TOO_LONG", field="title")
