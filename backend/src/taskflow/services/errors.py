"""Domain error hierarchy.

These carry a stable machine-readable ``code`` and, where relevant, the field
at fault. They deliberately do NOT carry an HTTP status: mapping a domain
failure onto a status code is a transport concern, and this module must stay
importable without FastAPI in scope (constitution — domain logic is
framework-free). The mapping lives in taskflow.main.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base for every expected, user-caused failure."""

    code: str = "INTERNAL_ERROR"
    field: str | None = None

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class TitleEmptyError(DomainError):
    """FR-004 — title is empty or whitespace-only after trimming."""

    code = "TITLE_EMPTY"
    field = "title"


class TitleTooLongError(DomainError):
    """FR-003 — trimmed title exceeds the grapheme-cluster limit."""

    code = "TITLE_TOO_LONG"
    field = "title"


class TaskNotFoundError(DomainError):
    """No task exists with the requested identifier."""

    code = "TASK_NOT_FOUND"
