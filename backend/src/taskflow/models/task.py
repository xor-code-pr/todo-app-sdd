"""The Task ORM model.

Shape follows specs/001-todo-core/data-model.md. Two absences are deliberate
and load-bearing:

* No ``is_completed`` boolean. A task is active if and only if ``completed_at``
  is NULL, which makes the incoherent state (flagged complete, no completion
  time) unrepresentable rather than merely forbidden.
* No owner or user column. The constitution forbids adding one in anticipation
  of multi-user support.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from taskflow.db import Base


class Task(Base):
    __tablename__ = "tasks"

    __table_args__ = (
        # Coarse backstop only. SQLite's length() counts characters, not
        # grapheme clusters, so it cannot express FR-003's upper bound --
        # attempting it would install a second, subtly different rule in a
        # place no test would think to look. The authoritative limit lives in
        # services/validation.py and nowhere else.
        CheckConstraint("length(trim(title)) > 0", name="ck_tasks_title_not_blank"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # String(600) is a storage ceiling, not the business rule: 150 grapheme
    # clusters can occupy far more than 150 characters. SQLite ignores VARCHAR
    # lengths entirely; the declaration documents intent.
    title: Mapped[str] = mapped_column(String(600), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    @property
    def completed(self) -> bool:
        """Derived completion flag. Not a column."""
        return self.completed_at is not None
