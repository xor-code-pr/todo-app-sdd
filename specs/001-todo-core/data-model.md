# Phase 1 Data Model: Core Todo

**Feature**: 001-todo-core | **Date**: 2026-10-29

One entity, one table. Decisions behind the shape are in [research.md](./research.md) R2–R4.

---

## Entity: Task

A single item of work belonging to the one local user of this application.

### Columns

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `INTEGER` | no | autoincrement | Primary key. Also the final sort key (R4). |
| `title` | `TEXT` | no | — | Trimmed before storage. 1–150 grapheme clusters, enforced in `services/validation.py`. **Immutable after creation** (FR-007). |
| `created_at` | `TIMESTAMP` | no | — | Naive UTC, assigned by the service layer, not by a database default. |
| `completed_at` | `TIMESTAMP` | yes | `NULL` | `NULL` ⟺ the task is active. Naive UTC. |

No `is_completed` column — the flag is derived (R2). No `owner_id` or `user_id` column; the
constitution forbids adding one in anticipation of multi-user support. No `priority`, `due_date`,
or `description` — priority was specified, designed as a sort key, then withdrawn before planning,
and must not reappear speculatively (Principle V).

### Why timestamps are service-assigned

`created_at` is set in `services/tasks.py` with `datetime.now(timezone.utc)` rather than via a
SQLAlchemy `server_default` or `default=`. Two reasons: the spec's assumption that creation time is
"the server's record of when the task was stored, not client clock time" becomes a testable
property of a function, and the clock is injectable, so a unit test can create two tasks with an
identical `created_at` and assert FR-017's tie-break actually holds. A database default makes that
collision awkward to stage.

Values are stored naive and interpreted as UTC. SQLite has no timezone-aware type; recording the
convention here is what keeps it honest.

### SQLAlchemy 2.0 mapping — contract sketch

Typed with `Mapped[]` annotations so `mypy --strict` carries through to the Pydantic layer. Shape
only; no implementation.

```python
class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(600), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
```

`String(600)` is a storage ceiling, not the business rule. 150 grapheme clusters can occupy far
more than 150 characters — a single cluster may be a dozen code points — so the column must be
generous enough never to truncate a title the domain rule accepted. SQLite ignores `VARCHAR`
lengths entirely; the declaration documents intent and would matter under a stricter engine. **The
authoritative limit is `services/validation.py` and nowhere else.**

### Constraints

| Constraint | Expression | Purpose |
|---|---|---|
| `pk_tasks` | `PRIMARY KEY (id)` | Identity and tie-break ordering |
| `ck_tasks_title_not_blank` | `CHECK (length(trim(title)) > 0)` | Backstop against an empty title reaching storage |

The `CHECK` is deliberately coarse. SQLite's `length()` counts characters, not grapheme clusters,
so it cannot express FR-003's upper bound — attempting it would install a second, subtly different
rule in a place no test would think to look. It guards the one invariant SQLite *can* state: a
title is never blank. The real rule lives in one function and is unit-tested there.

No `CHECK` is needed to keep completion state coherent, because R2's single-column design makes the
incoherent state unrepresentable.

### Indexes

**None beyond the primary key.** The table holds tens to hundreds of rows for one local user, and
the ordering expression leads with `(completed_at IS NULL)` — a computed expression that a plain
column index cannot serve anyway. An index here would be speculative optimisation of a query that
has never been measured as slow, which Principle V rules out. Revisit if a documented performance
problem ever appears.

---

## State transitions

Two states, both transitions reversible. There is no deleted state — deletion is a row removal
(FR-012), not a flag.

```text
                 set completed_at = now()
    ┌─────────┐ ──────────────────────────> ┌───────────┐
    │ active  │                             │ completed │
    │ (NULL)  │ <────────────────────────── │ (not NULL)│
    └─────────┘   set completed_at = NULL   └───────────┘
         │                                        │
         └──────────── DELETE row ────────────────┘
                     (permanent, FR-012)
```

| Transition | Trigger | Effect | Spec |
|---|---|---|---|
| active → completed | `PATCH {completed: true}` | `completed_at = now()` | FR-008 |
| completed → active | `PATCH {completed: false}` | `completed_at = NULL` | FR-008, FR-010 |
| either → gone | `DELETE` | Row removed, no tombstone | FR-012 |

**Idempotence**: setting `completed: true` on an already-completed task must **not** refresh
`completed_at`. Doing so would silently reorder the completed group (FR-018 sorts by that value) in
response to a no-op. The service checks current state before writing, and the endpoint returns 200
with the row unchanged.

**Reverting discards the completion time.** A task completed, reverted, and completed again is
ordered by the *latest* completion. The spec does not ask for completion history, and keeping one
would be speculative.

---

## Validation rules

Ordered as they execute. Only the first layer is authoritative for the title.

| # | Rule | Where | Failure |
|---|---|---|---|
| 1 | Title present and a string | `TaskCreate` (Pydantic v2) | 422 `VALIDATION_ERROR` |
| 2 | Trim leading/trailing whitespace | `services/validation.normalise_title` | — (transformation) |
| 3 | Trimmed title is non-empty | same | 422 `TITLE_EMPTY` (FR-004) |
| 4 | Trimmed title ≤ 150 grapheme clusters | same, via `regex` `\X` | 422 `TITLE_TOO_LONG` (FR-003) |
| 5 | Title is absent from `TaskUpdate` | `TaskUpdate` schema | 422 — the field does not exist (FR-007) |
| 6 | Task exists | `services/tasks` | 404 `TASK_NOT_FOUND` |
| 7 | Non-blank title | `ck_tasks_title_not_blank` | 500 — a bug, not a user error |

Rules 2–4 run in **one function**, called by the Pydantic validator rather than reimplemented in
it, so the domain rule has a single definition that is unit-testable without FastAPI in scope.

Rule 7 firing means rules 2–4 were bypassed. It should be unreachable; if it is reached it is an
internal error, logged with a traceback, not reported to the user as a validation problem.

**Title immutability is structural.** `TaskUpdate` has no `title` field, so there is no code path
to change one. The absence is asserted by a contract test — a requirement that something cannot
happen needs a test, or it quietly grows back.

---

## Alembic revision shape

One revision for this feature. No data migration — the table does not yet exist.

| | |
|---|---|
| Revises | `None` (initial revision for the project) |
| Message | `create tasks table` |
| `upgrade()` | `op.create_table("tasks", ...)` with the four columns and the named `CHECK` |
| `downgrade()` | `op.drop_table("tasks")` |

Generated with `alembic revision --autogenerate -m "create tasks table"` and then **read before
committing**. Autogenerate does not reliably emit named `CHECK` constraints; the constraint must be
confirmed present in the generated script and added by hand if it is missing. The constitution
makes migrations the only permitted route to a schema change — which also means the generated file
is reviewed output, not trusted output.

### SQLite batch mode

Any *future* revision that alters or drops a column on this table must use
`op.batch_alter_table()`. SQLite cannot `ALTER COLUMN`; Alembic emulates it by creating a new
table, copying rows, and swapping. Not needed for this initial revision — recorded here because the
failure arrives at the second migration, by which time the reason is easy to miss.
