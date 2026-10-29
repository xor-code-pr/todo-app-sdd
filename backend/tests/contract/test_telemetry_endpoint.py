"""Contract: POST /api/telemetry — FR-006, FR-006a, FR-006b.

Also the request-timing signal, which has no endpoint of its own but is only
observable through one.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from httpx import AsyncClient

from taskflow import telemetry

Entries = Callable[[], list[dict[str, object]]]

VALID = {"operation": "task_created", "code": "NETWORK_UNREACHABLE"}


def assert_envelope(body: object, code: str) -> None:
    """One error shape for the whole API.

    A second shape would mean a second narrowing path in the generated
    TypeScript client, and the second one is always the one that gets
    forgotten.
    """
    assert isinstance(body, dict), body
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "field"}
    assert body["error"]["code"] == code


class TestSuccessfulReport:
    async def test_returns_204_with_no_content(self, client: AsyncClient) -> None:
        response = await client.post("/api/telemetry", json=VALID)

        assert response.status_code == 204
        assert response.content == b""

    async def test_the_report_reaches_the_record(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        await client.post("/api/telemetry", json=VALID)

        failures = [e for e in read_telemetry() if e["kind"] == "failure"]
        reported = [e for e in failures if e.get("source") == "browser"]
        assert len(reported) == 1
        assert reported[0]["operation"] == "task_created"
        assert reported[0]["code"] == "NETWORK_UNREACHABLE"

    async def test_an_optional_duration_is_kept(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        await client.post("/api/telemetry", json={**VALID, "duration_ms": 1203.5})

        reported = [e for e in read_telemetry() if e.get("source") == "browser"]
        assert reported[0]["duration_ms"] == pytest.approx(1203.5)


class TestRejectedBodies:
    """FR-006b. Each of these is a privacy control, not validation hygiene."""

    @pytest.mark.parametrize(
        "code",
        [
            "could not reach the server",  # prose
            "Title too long: 'Buy milk'",  # prose carrying user content
            "lowercase_code",
            "has spaces",
            "x" * 65,  # over the length cap
            "",
        ],
    )
    async def test_a_code_that_could_hold_a_sentence_is_rejected(
        self, client: AsyncClient, code: str
    ) -> None:
        response = await client.post("/api/telemetry", json={**VALID, "code": code})

        assert response.status_code == 422
        assert_envelope(response.json(), "VALIDATION_ERROR")

    async def test_an_unknown_operation_is_rejected(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/telemetry", json={**VALID, "operation": "arbitrary_text"}
        )

        assert response.status_code == 422

    async def test_an_extra_field_is_rejected(self, client: AsyncClient) -> None:
        """extra='forbid'. An endpoint that quietly ignores unknown fields is
        one somebody will eventually send a stack trace to."""
        response = await client.post(
            "/api/telemetry", json={**VALID, "message": "Could not save 'Buy milk'"}
        )

        assert response.status_code == 422

    async def test_a_rejected_body_is_never_recorded(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        marker = "zzqqxx-rejected-body-marker"
        await client.post("/api/telemetry", json={**VALID, "code": marker})

        assert marker not in str(read_telemetry())


class TestReportingCannotCauseAFailure:
    """FR-006a — and the reason the endpoint exists at all.

    If this endpoint answered with an error when it could not record, the
    browser would have a failed request to report, which would fail, and so
    on. Making the failure unobservable to the caller is what stops the loop.
    """

    async def test_204_even_when_the_sink_is_unwritable(
        self, client: AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "no" / "t.jsonl"))
        telemetry.reset()

        response = await client.post("/api/telemetry", json=VALID)

        assert response.status_code == 204


class TestRecordingNeverSwallowsTheOriginalFailure:
    """FR-018.

    `record()` not raising is necessary but not sufficient. What the user
    actually needs is for the *original* error to still arrive, correctly
    shaped, while the recorder is broken underneath it.
    """

    async def test_a_domain_error_still_returns_its_envelope(
        self, client: AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "no" / "t.jsonl"))
        telemetry.reset()

        response = await client.patch("/api/tasks/99999", json={"completed": True})

        assert response.status_code == 404
        assert_envelope(response.json(), "TASK_NOT_FOUND")

    async def test_a_validation_error_still_returns_its_envelope(
        self, client: AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "no" / "t.jsonl"))
        telemetry.reset()

        response = await client.post("/api/tasks", json={"title": "   "})

        assert response.status_code == 422
        assert_envelope(response.json(), "TITLE_EMPTY")

    async def test_a_successful_request_still_succeeds(
        self, client: AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "no" / "t.jsonl"))
        telemetry.reset()

        response = await client.post("/api/tasks", json={"title": "Buy milk"})

        assert response.status_code == 201


class TestServerFailuresAreRecorded:
    """FR-005."""

    async def test_a_domain_error_is_recorded_with_its_code(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        await client.delete("/api/tasks/99999")

        failures = [e for e in read_telemetry() if e["kind"] == "failure"]
        assert any(
            e["code"] == "TASK_NOT_FOUND"
            and e["status"] == 404
            and e["source"] == "server"
            and e["operation"] == "task_deleted"
            for e in failures
        )

    async def test_a_validation_failure_records_the_field_name_not_its_value(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        marker = "zzqqxx " * 40  # over 150 graphemes, and distinctive
        await client.post("/api/tasks", json={"title": marker})

        written = str(read_telemetry())
        assert "TITLE_TOO_LONG" in written
        assert '"field": "title"' in written.replace("'", '"')
        assert "zzqqxx" not in written


class TestRequestTiming:
    """FR-007."""

    async def test_every_request_is_timed(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        await client.get("/api/tasks")

        timings = [e for e in read_telemetry() if e["kind"] == "timing"]
        assert timings
        assert all("duration_ms" in e for e in timings)
        assert any(e["path_template"] == "/api/tasks" for e in timings)

    async def test_the_template_is_recorded_not_the_literal_path(
        self, client: AsyncClient, read_telemetry: Entries
    ) -> None:
        """`/api/tasks/42` carries an identifier that is useless for
        aggregation and one step from carrying something that is not."""
        created = (await client.post("/api/tasks", json={"title": "Buy milk"})).json()
        await client.delete(f"/api/tasks/{created['id']}")

        templates = [
            e["path_template"] for e in read_telemetry() if e["kind"] == "timing"
        ]
        assert "/api/tasks/{task_id}" in templates
        assert f"/api/tasks/{created['id']}" not in templates
