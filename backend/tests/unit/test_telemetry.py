"""The sink itself: format, bound, field filter, and the never-raise promise.

These tests are deliberately paranoid about the last one. Everything else here
is a format detail that a reader would notice was wrong; "recording cannot
break the application" is invisible until the day it isn't.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from taskflow import telemetry
from taskflow.db import DEFAULT_DB_PATH

# --- FR-004, FR-004a, FR-010, SC-002: the format -------------------------


def test_each_call_writes_exactly_one_line(telemetry_path: Path) -> None:
    for index in range(5):
        telemetry.record("usage", "task_created", index=index)

    lines = telemetry_path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 5


def test_every_line_parses_on_its_own(telemetry_path: Path) -> None:
    """FR-004a. A truncated final write must cost one entry, not the file."""
    telemetry.record("usage", "task_created")
    telemetry.record("usage", "task_deleted")

    for line in telemetry_path.read_text(encoding="utf-8").splitlines():
        assert isinstance(json.loads(line), dict)


def test_every_entry_carries_ts_kind_and_operation(telemetry_path: Path) -> None:
    """SC-002: 100% of entries carry a timestamp and an operation."""
    telemetry.record("lifecycle", "app_lifecycle", event="startup")

    entry = json.loads(telemetry_path.read_text(encoding="utf-8").strip())
    assert set(entry) >= {"ts", "kind", "operation"}
    assert entry["kind"] == "lifecycle"
    assert entry["operation"] == "app_lifecycle"


def test_timestamp_is_utc_iso_8601_ending_z(telemetry_path: Path) -> None:
    telemetry.record("usage", "task_created")

    ts = json.loads(telemetry_path.read_text(encoding="utf-8").strip())["ts"]
    assert ts.endswith("Z")
    assert "T" in ts
    assert "+" not in ts


def test_a_newline_inside_a_value_does_not_split_an_entry(telemetry_path: Path) -> None:
    """json.dumps escapes it. Without that, FR-004a would be a hope."""
    telemetry.record("failure", "task_created", code="A\nB")

    assert len(telemetry_path.read_text(encoding="utf-8").splitlines()) == 1


# --- FR-015, FR-015a, SC-006: the bound ----------------------------------


def test_rotation_keeps_exactly_one_predecessor(
    telemetry_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """FR-015: one rotated file retained, older ones removed."""
    monkeypatch.setenv("TASKFLOW_TELEMETRY_MAX_BYTES", "2000")
    telemetry.reset()

    for _ in range(400):
        telemetry.record("usage", "task_created", note="x" * 50)

    assert telemetry_path.exists()
    assert Path(f"{telemetry_path}.1").exists()
    assert not Path(f"{telemetry_path}.2").exists()


def test_total_disk_use_stays_within_twice_the_cap(
    telemetry_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """FR-015a. The whole point of a bound is that it holds under a burst."""
    cap = 2000
    monkeypatch.setenv("TASKFLOW_TELEMETRY_MAX_BYTES", str(cap))
    telemetry.reset()

    for _ in range(2000):
        telemetry.record("failure", "task_created", code="TITLE_TOO_LONG", status=422)

    total = sum(
        candidate.stat().st_size
        for candidate in (telemetry_path, Path(f"{telemetry_path}.1"))
        if candidate.exists()
    )
    # Rotation happens when the *next* write would exceed the cap, so one
    # entry of slack is expected on each of the two files.
    assert total <= cap * 2 + 1000


def test_rotated_entries_are_still_readable(
    telemetry_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Recent history survives the rollover — the reason for rotation over
    in-place truncation (data-model.md § Rotation)."""
    monkeypatch.setenv("TASKFLOW_TELEMETRY_MAX_BYTES", "1500")
    telemetry.reset()

    for _ in range(200):
        telemetry.record("usage", "task_completed")

    previous = Path(f"{telemetry_path}.1").read_text(encoding="utf-8").splitlines()
    assert previous
    assert all(json.loads(line)["operation"] == "task_completed" for line in previous)


# --- FR-016 to FR-018: it can never raise --------------------------------


def test_record_never_raises_when_the_directory_does_not_exist(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "nope" / "t.jsonl"))
    telemetry.reset()

    assert telemetry.record("usage", "task_created") is None


def test_record_never_raises_when_the_path_is_a_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory = tmp_path / "a-directory"
    directory.mkdir()
    monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(directory))
    telemetry.reset()

    assert telemetry.record("failure", "task_created", code="X") is None


def test_record_never_raises_on_an_unserialisable_kind(telemetry_path: Path) -> None:
    """Even the arguments the sink itself depends on cannot break a caller."""
    assert telemetry.record(object(), "task_created") is None  # type: ignore[arg-type]


def test_record_returns_none_even_when_it_succeeds(telemetry_path: Path) -> None:
    """Not a success flag.

    If this returned a bool, somebody would eventually write
    `if not record(...)`, and at that moment telemetry becomes load-bearing —
    which is precisely what FR-016 forbids.
    """
    assert telemetry.record("usage", "task_created") is None


def test_a_broken_destination_is_not_slower(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SC-005. A recorder that blocks while failing is worse than none."""
    working = tmp_path / "working.jsonl"
    monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(working))
    telemetry.reset()
    start = time.perf_counter()
    for _ in range(300):
        telemetry.record("usage", "task_created")
    working_seconds = time.perf_counter() - start

    monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "nope" / "t.jsonl"))
    telemetry.reset()
    start = time.perf_counter()
    for _ in range(300):
        telemetry.record("usage", "task_created")
    broken_seconds = time.perf_counter() - start

    # Generous: the claim is "not noticeably slower", not "faster". A retry
    # loop or a per-call reopen would blow past this by orders of magnitude.
    assert broken_seconds < working_seconds + 0.5


# --- FR-011 to FR-013: the field filter ----------------------------------


def test_exception_objects_are_dropped_and_their_message_never_written(
    telemetry_path: Path,
) -> None:
    """The type-level half of the privacy defence.

    An exception's message is where user content hides: a validation error
    naturally reads "Title too long: 'Buy milk and then…'". The sink will not
    write one even if an instrumentation site passes it by mistake.
    """
    secret = "Buy milk and call the dentist"
    telemetry.record(
        "failure",
        "task_created",
        code="TITLE_TOO_LONG",
        exc=ValueError(f"Title too long: {secret}"),
    )

    written = telemetry_path.read_text(encoding="utf-8")
    assert secret not in written
    assert "exc" not in json.loads(written.strip())
    assert json.loads(written.strip())["code"] == "TITLE_TOO_LONG"


@pytest.mark.parametrize("value", [{"a": 1}, [1, 2], (1, 2), {1, 2}, object()])
def test_structured_values_are_dropped(telemetry_path: Path, value: object) -> None:
    telemetry.record("usage", "task_created", payload=value)

    entry = json.loads(telemetry_path.read_text(encoding="utf-8").strip())
    assert "payload" not in entry


def test_permitted_scalars_are_kept(telemetry_path: Path) -> None:
    """FR-012: identifiers, durations, counts, codes and names are allowed."""
    telemetry.record(
        "timing",
        "http_request",
        method="POST",
        status=201,
        duration_ms=4.125,
        cached=False,
    )

    entry = json.loads(telemetry_path.read_text(encoding="utf-8").strip())
    assert entry["method"] == "POST"
    assert entry["status"] == 201
    assert entry["duration_ms"] == pytest.approx(4.125)
    assert entry["cached"] is False


def test_none_valued_fields_are_omitted_rather_than_written_as_null(
    telemetry_path: Path,
) -> None:
    telemetry.record("failure", "task_created", code="X", field=None)

    assert "field" not in json.loads(telemetry_path.read_text(encoding="utf-8").strip())


# --- configuration -------------------------------------------------------


def test_a_malformed_size_cap_falls_back_rather_than_failing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TASKFLOW_TELEMETRY_MAX_BYTES", "not-a-number")

    assert telemetry.max_bytes() == telemetry.DEFAULT_MAX_BYTES


def test_the_default_path_sits_beside_the_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Nothing else covers this.

    Every test and the E2E suite override TASKFLOW_TELEMETRY_PATH so a run
    never touches the developer's own record — which means the path the
    application actually uses in production is the one path no test exercises
    unless this one does.
    """
    monkeypatch.delenv("TASKFLOW_TELEMETRY_PATH", raising=False)

    assert telemetry.telemetry_path() == Path(telemetry.DEFAULT_TELEMETRY_PATH)
    # Beside taskflow.db: both are relative to the working directory, and
    # both start-dev.bat and the uvicorn command run from backend/.
    assert telemetry.telemetry_path().parent == Path(DEFAULT_DB_PATH).parent


def test_the_path_follows_the_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TASKFLOW_TELEMETRY_PATH", str(tmp_path / "elsewhere.jsonl"))

    assert telemetry.telemetry_path() == tmp_path / "elsewhere.jsonl"


def test_entries_do_not_reach_the_root_logger(
    telemetry_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """propagate=False.

    Without it every entry would also print through the console handler
    basicConfig() installs in main.py — noise, and a second surface on which
    anything recorded becomes visible.
    """
    with caplog.at_level("INFO"):
        telemetry.record("usage", "task_created")

    assert not [r for r in caplog.records if r.name == "taskflow.telemetry"]
