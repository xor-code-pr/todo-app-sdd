"""Unit tests for the title rule — FR-002, FR-003, FR-004."""

from __future__ import annotations

import pytest

from taskflow.services.errors import TitleEmptyError, TitleTooLongError
from taskflow.services.validation import (
    MAX_TITLE_GRAPHEMES,
    count_graphemes,
    normalise_title,
)

FAMILY = "\U0001f468‍\U0001f469‍\U0001f467‍\U0001f466"  # one cluster, 7 code points
E_ACUTE_COMBINING = "é"  # one cluster, 2 code points


class TestTrimming:
    """FR-002 — leading and trailing whitespace is removed before storage."""

    def test_strips_leading_and_trailing_spaces(self) -> None:
        assert normalise_title("  Buy milk  ") == "Buy milk"

    def test_strips_tabs_and_newlines(self) -> None:
        assert normalise_title("\t\nBuy milk\n\t") == "Buy milk"

    def test_preserves_internal_whitespace_exactly(self) -> None:
        assert normalise_title("Buy    milk") == "Buy    milk"


class TestEmptyRejection:
    """FR-004 — empty and whitespace-only submissions are blocked."""

    @pytest.mark.parametrize("raw", ["", "   ", "\t", "\n", " \t\n "])
    def test_blank_titles_rejected(self, raw: str) -> None:
        with pytest.raises(TitleEmptyError):
            normalise_title(raw)

    def test_single_character_is_accepted(self) -> None:
        assert normalise_title("x") == "x"


class TestLengthBoundary:
    """FR-003 — the limit is 150 grapheme clusters, measured after trimming."""

    def test_exactly_at_the_limit_is_accepted(self) -> None:
        title = "a" * MAX_TITLE_GRAPHEMES
        assert normalise_title(title) == title

    def test_one_over_the_limit_is_rejected(self) -> None:
        with pytest.raises(TitleTooLongError):
            normalise_title("a" * (MAX_TITLE_GRAPHEMES + 1))

    def test_trailing_space_makes_an_over_length_title_valid(self) -> None:
        """Validation runs on the trimmed value, not the raw input."""
        raw = "a" * MAX_TITLE_GRAPHEMES + " "
        assert normalise_title(raw) == "a" * MAX_TITLE_GRAPHEMES

    def test_error_message_reports_the_actual_length(self) -> None:
        with pytest.raises(TitleTooLongError) as excinfo:
            normalise_title("a" * 200)
        assert "200" in str(excinfo.value)
        assert str(MAX_TITLE_GRAPHEMES) in str(excinfo.value)


class TestGraphemeCounting:
    """The reason `regex` is a dependency at all — len() would be wrong here."""

    def test_family_emoji_is_one_perceived_character(self) -> None:
        assert count_graphemes(FAMILY) == 1
        assert len(FAMILY) > 1, "guard: this emoji must be multi-code-point"

    def test_combining_accent_is_one_perceived_character(self) -> None:
        assert count_graphemes(E_ACUTE_COMBINING) == 1
        assert len(E_ACUTE_COMBINING) == 2

    def test_150_family_emoji_are_accepted(self) -> None:
        """Counting code points would reject this at ~1050 and be wrong."""
        title = FAMILY * MAX_TITLE_GRAPHEMES
        assert normalise_title(title) == title
        assert len(title) > MAX_TITLE_GRAPHEMES * 6

    def test_151_family_emoji_are_rejected(self) -> None:
        with pytest.raises(TitleTooLongError):
            normalise_title(FAMILY * (MAX_TITLE_GRAPHEMES + 1))

    def test_empty_string_counts_zero(self) -> None:
        assert count_graphemes("") == 0
