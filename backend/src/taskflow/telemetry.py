"""Local telemetry sink.

One public function, ``record()``, appending JSON Lines to a bounded file on
the machine running the application. Nothing is transmitted anywhere.

This module imports no FastAPI symbol. It is called from the exception
handlers, from a middleware, from the service layer and from Alembic's
``env.py``, and it must stay importable by all of them — and by a unit test
that has no application at all.

**It can never raise.** Everything below is written around that one property:
the natural shape of "append to a file" raises on a full disk, a missing
directory or a permissions error, and none of those may reach a user who was
adding a task (FR-016, FR-017, FR-018).

It also lives outside ``services/`` on purpose. It has no opinion about tasks;
it is infrastructure, like ``db.py``. Putting it under ``services/`` would drag
it into the ≥80% domain-coverage gate for the wrong reason.
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import os
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

#: Beside the database, matching the TASKFLOW_DB_PATH convention in db.py.
DEFAULT_TELEMETRY_PATH = "telemetry.jsonl"

#: Five megabytes of JSON Lines is roughly 40,000 entries — months of ordinary
#: use, and small enough to open in anything. One predecessor is retained, so
#: worst-case disk is about twice this (FR-015a).
DEFAULT_MAX_BYTES = 5_000_000

#: Field values the sink will write. Anything else is dropped rather than
#: coerced: an object's repr is exactly where a task title would hide
#: (data-model.md § What an entry must never contain).
_ALLOWED = (str, int, float, bool)

logger = logging.getLogger("taskflow.telemetry")
logger.setLevel(logging.INFO)

# Never propagate to the root logger. basicConfig() in main.py installs a
# console handler there; without this every entry would also be printed, which
# is both noise and a second place for user content to surface.
logger.propagate = False

#: The (path, max_bytes) the current handler was built for. Re-read on every
#: call so a test that re-points TASKFLOW_TELEMETRY_PATH gets a fresh file
#: rather than the previous test's.
_handler_key: tuple[str, int] | None = None


class _SilentRotatingFileHandler(logging.handlers.RotatingFileHandler):
    """A rotating handler that stays quiet when it cannot write.

    ``logging`` normally reports a handler failure on stderr. Here that would
    turn a full disk into console noise during an unrelated user action, and
    would make "the recorder failed" visible in a place it has no business
    being. Dropping the entry is the whole contract.
    """

    def handleError(self, record: logging.LogRecord) -> None:
        del record
        return


def telemetry_path() -> Path:
    """Where the record lives. ``TASKFLOW_TELEMETRY_PATH`` overrides."""
    return Path(os.environ.get("TASKFLOW_TELEMETRY_PATH", DEFAULT_TELEMETRY_PATH))


def max_bytes() -> int:
    """The size cap. A malformed override falls back rather than failing."""
    raw = os.environ.get("TASKFLOW_TELEMETRY_MAX_BYTES")
    if raw is None:
        return DEFAULT_MAX_BYTES
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MAX_BYTES


def _ensure_handler() -> None:
    """Attach a handler for the currently configured destination.

    Not locked, deliberately. The only window in which two threads could both
    build a handler is the very first call, and the application's lifespan
    records a ``startup`` entry before it serves anything — so by the time
    FastAPI runs a sync endpoint in its threadpool, the key matches and this
    returns immediately. The worst outcome if that reasoning is ever wrong is
    a duplicated line, which ``record()`` cannot escalate into anything a user
    sees. A lock here would be machinery for a problem nobody has had, which
    Principle V asks us not to add.
    """
    global _handler_key

    key = (str(telemetry_path()), max_bytes())
    if _handler_key == key and logger.handlers:
        return

    for existing in list(logger.handlers):
        logger.removeHandler(existing)
        existing.close()

    # delay=True: the file is not opened until the first entry. A destination
    # that cannot be opened therefore fails inside emit(), where handleError
    # swallows it, rather than at import time where nothing is guarding.
    handler = _SilentRotatingFileHandler(
        key[0],
        maxBytes=key[1],
        backupCount=1,
        encoding="utf-8",
        delay=True,
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    _handler_key = key


def reset() -> None:
    """Close the current handler and forget the destination.

    Needed because the handler is cached per destination: a caller that
    re-points ``TASKFLOW_TELEMETRY_PATH`` would otherwise keep writing to the
    file the previous destination opened. The test suite does exactly that for
    every test, which is the only reason this is public.
    """
    global _handler_key

    for existing in list(logger.handlers):
        logger.removeHandler(existing)
        with suppress(Exception):
            existing.close()
    _handler_key = None


def _timestamp() -> str:
    """UTC, ISO 8601, ending Z — the existing convention for stored times."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def record(kind: str, operation: str, **fields: object) -> None:
    """Append one entry. Returns nothing, always, and raises nothing, ever.

    ``None`` is returned unconditionally — not a success flag — so that no
    caller can write ``if not record(...)``. The moment any code branches on
    telemetry, telemetry is load-bearing, and FR-016 exists to prevent exactly
    that (contracts/telemetry.md § 1).

    Field values outside ``_ALLOWED`` are dropped silently. Passing an
    exception object is the mistake this guards against: ``str(exc)`` for a
    validation failure is where the offending title lives.
    """
    with suppress(Exception):
        entry: dict[str, object] = {
            "ts": _timestamp(),
            "kind": kind,
            "operation": operation,
        }
        for name, value in fields.items():
            if value is not None and isinstance(value, _ALLOWED):
                entry[name] = value

        # separators and ensure_ascii keep one entry to one line: json.dumps
        # escapes any newline inside a string value, so FR-004a holds even if
        # a field somehow carries one.
        line = json.dumps(entry, separators=(",", ":"), ensure_ascii=True)

        _ensure_handler()
        logger.info(line)
