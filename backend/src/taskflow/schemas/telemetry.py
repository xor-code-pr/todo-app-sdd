"""Request body for the browser's failure reports.

Every constraint here is a privacy control, not validation hygiene.

A browser cannot write to a file, and Principle VII requires failures from
both sides, so there has to be an endpoint. An endpoint that accepts arbitrary
text is an endpoint through which a task title eventually arrives — inside a
stack trace, a serialised response, a URL. So this body admits no free text at
all: a closed operation vocabulary, and a code field whose pattern excludes
lowercase letters, spaces and punctuation. Prose cannot be smuggled through a
field that will not hold a sentence.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

#: The browser half of the vocabulary in data-model.md. Operations the
#: frontend never performs are absent rather than tolerated.
BrowserOperation = Literal[
    "task_created",
    "task_completed",
    "task_reopened",
    "task_deleted",
    "task_list_read",
]


class TelemetryReport(BaseModel):
    """One failure, observed in the browser."""

    model_config = ConfigDict(extra="forbid")

    operation: BrowserOperation

    #: A code, not a message. ``NETWORK_UNREACHABLE``, ``TITLE_TOO_LONG``.
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Z0-9_]+$")

    #: Optional: how long the failed operation took before giving up.
    duration_ms: float | None = Field(default=None, ge=0)
