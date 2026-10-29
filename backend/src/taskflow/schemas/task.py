"""Pydantic v2 request and response models.

Field rules are *delegated* to services/validation.py rather than
reimplemented here, so the title rule has exactly one definition that is
testable without FastAPI or Pydantic in scope.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_serializer, field_validator
from pydantic_core import PydanticCustomError

from taskflow.services.errors import DomainError
from taskflow.services.validation import normalise_title


class TaskCreate(BaseModel):
    """Request body for creating a task."""

    model_config = ConfigDict(extra="forbid")

    title: str

    @field_validator("title")
    @classmethod
    def _normalise_title(cls, value: str) -> str:
        try:
            return normalise_title(value)
        except DomainError as exc:
            # Carry the domain code through Pydantic's machinery so the
            # exception handler can emit the same envelope it uses for
            # directly-raised domain errors.
            raise PydanticCustomError(exc.code, exc.message) from exc


class TaskUpdate(BaseModel):
    """Request body for mutating an existing task.

    There is deliberately **no** ``title`` field. Its absence is how FR-007
    ("a task's title MUST NOT be editable after creation") is enforced: with
    ``extra="forbid"`` there is no code path by which a title could change,
    and an attempt to send one is reported rather than silently ignored.
    """

    model_config = ConfigDict(extra="forbid")

    completed: bool


class TaskRead(BaseModel):
    """Response body for a single task."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    # Derived from completed_at, not stored. Both are exposed: the boolean is
    # what the checkbox binds to, the timestamp is what makes the ordering
    # rule verifiable from the response alone.
    completed: bool
    created_at: datetime
    completed_at: datetime | None

    @field_serializer("created_at", "completed_at")
    def _as_utc(self, value: datetime | None) -> str | None:
        """Emit an explicit UTC marker.

        Timestamps are stored naive because SQLite has no timezone-aware type,
        and a naive ISO string would be parsed as local time by a browser.
        Nothing displays these today, but shipping an ambiguous instant in a
        public contract is a bug waiting for its first consumer.
        """
        return None if value is None else f"{value.isoformat()}Z"


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None


class ErrorResponse(BaseModel):
    """The single error shape for every non-2xx response."""

    error: ErrorDetail
