"""Title normalisation and validation — the single authority for FR-002/003/004.

Imports only ``regex`` and the domain errors. No FastAPI, no Pydantic, no
SQLAlchemy, so this is unit-testable in isolation and callable from both the
schema layer and the service layer without duplicating the rule.
"""

from __future__ import annotations

import regex

from taskflow.services.errors import TitleEmptyError, TitleTooLongError

MAX_TITLE_GRAPHEMES = 150

# \X matches one extended grapheme cluster (UAX #29). Python's len() counts
# code points: a family emoji is one user-perceived character but up to eleven
# code points, so the two measures diverge by an order of magnitude on
# emoji-heavy input. FR-003 specifies user-perceived characters.
_GRAPHEME_CLUSTER = regex.compile(r"\X")


def count_graphemes(value: str) -> int:
    """Number of user-perceived characters in ``value``."""
    return sum(1 for _ in _GRAPHEME_CLUSTER.finditer(value))


def normalise_title(raw: str) -> str:
    """Trim ``raw`` and enforce the title rules, returning the stored form.

    Raises:
        TitleEmptyError: the trimmed title is empty (FR-004).
        TitleTooLongError: the trimmed title exceeds the limit (FR-003).
    """
    trimmed = raw.strip()

    if not trimmed:
        raise TitleEmptyError("Title is required.")

    length = count_graphemes(trimmed)
    if length > MAX_TITLE_GRAPHEMES:
        raise TitleTooLongError(
            f"Title must be {MAX_TITLE_GRAPHEMES} characters or fewer (received {length})."
        )

    return trimmed
