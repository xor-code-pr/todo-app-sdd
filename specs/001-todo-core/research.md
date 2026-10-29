# Phase 0 Research: Core Todo

**Feature**: 001-todo-core | **Date**: 2026-10-29

Six decisions that the spec implied but did not settle. Each is resolved here so `data-model.md`
and `contracts/api.md` can be read as consequences rather than assertions.

---

## R1 — Counting grapheme clusters on both sides

**Decision**: Backend counts with the `regex` package's `\X` pattern. Frontend counts with the
native `Intl.Segmenter({ granularity: 'grapheme' })`. **The backend is authoritative**; the
frontend count is advisory UX only.

**Rationale**: FR-003 specifies 150 *user-perceived* characters. Python's `len()` counts code
points — `"👨‍👩‍👧‍👦"` is one perceived character and 11 code points, so the two measures diverge by an
order of magnitude on emoji-heavy input. Python's standard library has no UAX #29 segmentation at
any level; `unicodedata` exposes character properties but will not find cluster boundaries. `regex`
implements `\X` directly and is mature and widely deployed.

The browser needs no dependency at all: `Intl.Segmenter` is built in. It is the newest API in this
design — Chrome 87, Safari 14.1, Firefox 125 (April 2024) — which is acceptable for a locally run
single-user application on an evergreen browser, and is recorded in Technical Context as the
platform floor.

Two implementations of one rule is a drift risk, handled by making only one of them matter. The
client sends the raw string; the server trims and re-validates. If the two disagree — different
Unicode versions resolving a new emoji sequence differently — the user sees an ordinary 422 rather
than a truncated title in the database. A client that is wrong is a cosmetic bug; a server that is
wrong is a data bug.

**Alternatives considered**: `grapheme` (smaller and single-purpose, but far less maintained than
`regex`); counting UTF-16 code units to match naive JavaScript `.length` (rejected — it would make
the limit depend on encoding, and `"👍".length === 2` is exactly the behaviour FR-003 exists to
avoid); enforcing in SQLite via `length()` (rejected — SQLite counts characters, not clusters, and
cannot be taught otherwise).

---

## R2 — Completion state as one nullable column

**Decision**: The `tasks` table carries `completed_at TIMESTAMP NULL` and **no** `is_completed`
boolean. A task is active if and only if `completed_at IS NULL`. The API still exposes a derived
boolean `completed`.

**Rationale**: The spec needs both facts — whether a task is done (FR-008, FR-011) and when it was
finished, for ordering completed items (FR-018). Storing both a flag and a timestamp creates a
state that is representable but meaningless: `is_completed = true, completed_at = NULL`. Guarding
it needs a `CHECK` constraint, and every write path has to maintain two columns in step.

Deriving the flag from the timestamp deletes that entire class of bug. There is no invariant to
enforce because there is no way to express the invalid state. The transition is a single
assignment in each direction: set the timestamp, or null it.

The cost is a slightly clever `ORDER BY` (see R3) and an API surface that does not mirror the
table one-to-one — `TaskRead.completed` is computed. Both are documented and cheap.

**Alternatives considered**: boolean + nullable timestamp with a `CHECK` constraint (rejected —
solves a problem that need not exist); boolean only (rejected — FR-018 requires completion time
for ordering); a separate `completions` table (rejected — speculative generality for a
one-to-at-most-one relationship, Principle V).

---

## R3 — Ordering computed in SQL, not in the service layer

**Decision**: One `ORDER BY` expression in the list query produces the final display order. The
service layer owns the expression; neither the router nor the client re-sorts.

```sql
ORDER BY (completed_at IS NULL) DESC, completed_at DESC, created_at DESC, id DESC
```

**Rationale**: Four requirements collapse into four sort keys. `(completed_at IS NULL)` evaluates
to 1 for active rows and 0 for completed ones; `DESC` therefore puts every active task above every
completed one (FR-009). Active rows all tie on the first two keys — they are uniformly NULL — so
they fall through to `created_at DESC`, newest first (FR-016). Completed rows all carry a value,
so `completed_at DESC` ranks them most-recently-finished first (FR-018). `id DESC` is the final
tie-break (FR-017).

Performance played no part in this choice and should not be cited as its justification: the table
holds tens to hundreds of rows for one local user, and sorting in Python would be imperceptibly
different. SQL wins because it is one declarative statement that the database is contractually
obliged to apply consistently, rather than a sort scattered across a service method and possibly
re-derived in a component.

The client rendering the array verbatim is what makes FR-021's no-move detection tractable:
"did this task move?" is an index comparison, not a re-evaluation of the sort rule.

**Alternatives considered**: fetching unordered and sorting in `services/` (rejected — same result,
more code, and invites a second sort to appear in the frontend); two queries unioned, one per
group (rejected — two round trips and a merge step to replace one `ORDER BY`).

---

## R4 — Tie-breaking identical creation timestamps

**Decision**: An autoincrementing `INTEGER PRIMARY KEY` is the task identifier and the final sort
key. No UUIDs.

**Rationale**: FR-017 requires ordering to be deterministic and stable across reloads when two
tasks share a `created_at`. SQLite's timestamp resolution makes same-value collisions reachable in
a fast scripted test, and an unstable sort there is a genuine reproducibility problem, not a
theoretical one. A monotonic integer key resolves it with no extra column, and in practice
`id DESC` already agrees with creation order.

UUIDs carry no ordering information and would need a separate sequence column to do the same job.
They exist to avoid collisions across distributed writers or to avoid leaking row counts to
untrusted clients. There is one writer and one local user, so both motivations are absent and
Principle V rules them out.

**Alternatives considered**: UUIDv7 (time-sortable, and a reasonable choice in a multi-writer
system — rejected here as speculative); a dedicated monotonic `sequence` column (rejected —
duplicates what the primary key already guarantees).

---

## R5 — Frontend state: mutate, then refetch

**Decision**: No state library, no optimistic updates. Every mutation awaits its response, then
refetches `GET /api/tasks` and replaces the array wholesale.

**Rationale**: FR-025 requires the displayed list to converge on true stored state after a failed
operation. The usual way to earn that is an optimistic update plus a rollback path plus
reconciliation — three mechanisms, each with its own failure modes. Refetching makes the
requirement true by construction: there is no locally-derived projection of server state, so there
is nothing that can diverge from it. On failure the previous array is simply retained.

This also keeps ordering single-sourced. A mutation can change a task's position (completing it
sends it to the bottom), so the client would have to re-derive the sort rule to place it
optimistically — duplicating R3's expression in TypeScript. Refetching means the server answers
that question, every time.

The cost is one extra round trip per mutation, against a local SQLite file. Principle V names
state management libraries and caching layers as things that wait for "a specific documented
problem"; there is none here.

**Alternatives considered**: optimistic updates with rollback (rejected — three mechanisms to
satisfy one requirement, and it duplicates the ordering rule client-side); TanStack Query
(rejected — a caching library, explicitly the kind of dependency Principle V defers); returning
the full list from every mutation endpoint (rejected — overloads each endpoint's contract to save
a local round trip, and makes the response shape of `DELETE` surprising).

---

## R6 — Double submission of the Add form

**Decision**: The submit control is disabled while a create request is in flight. No idempotency
keys, no client-generated request IDs, no server-side duplicate detection.

**Rationale**: The spec's edge-case list asks whether a rapid double-activation of Add produces one
task or two. Disabling the control for the duration of the request answers it at the only point
where the ambiguity exists. Duplicate titles are explicitly permitted by the spec, so the server
cannot and must not infer that two identical creates are a mistake.

The disabled state must not steal focus: FR-005 puts focus in the title input after a successful
add, and the user may well have typed the next title before the response lands. Disabling the
button — not the input — keeps typing uninterrupted.

**Alternatives considered**: an idempotency key per submission (rejected — distributed-systems
machinery for a local single-user form, Principle V); debouncing (rejected — guesses at a time
window rather than tracking actual request state); allowing both tasks (rejected — the spec raises
it as an edge case to decide, and silently creating duplicates is the worse answer).
