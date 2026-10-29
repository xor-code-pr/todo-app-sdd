# TaskFlow

[![CI](https://github.com/xor-code-pr/todo-app-sdd/actions/workflows/ci.yml/badge.svg)](https://github.com/xor-code-pr/todo-app-sdd/actions/workflows/ci.yml)

A todo application built as a **Spec-Driven Development** exercise with
[GitHub Spec Kit](https://github.com/github/spec-kit), under a project constitution that
treats accessibility as a build gate rather than a review suggestion.

The application itself is small on purpose. The interesting part is everything around it:
the specification, the recorded decisions, and the gates — including one defect that only a
human with a screen reader could find.

---

## What it does

Add a task, complete it, reopen it, delete it. Completed tasks keep a strikethrough and sink
below the active ones. Nothing more — no priority, no due dates, no accounts.

| | |
|---|---|
| **Backend** | FastAPI · Pydantic v2 · SQLAlchemy 2.0 · Alembic · SQLite · Python 3.11+ |
| **Frontend** | React 18 · Vite · TypeScript `strict` · CSS Modules |
| **API client** | Generated from the emitted OpenAPI schema — never hand-written |
| **Tests** | pytest · Vitest + React Testing Library · Playwright + `axe-core` |

---

## Quick start

```bash
# Backend
cd backend && pip install -e ".[dev]" && alembic upgrade head

# Frontend
cd frontend && npm install && npm run generate:api
```

Then, from the repository root:

```bash
start-dev.bat          # migrate, start API (:8000) and UI (:5173)
stop-dev.bat           # free both ports — run before test:e2e
open-a11y-chrome.bat   # Chrome with the accessibility tree forced on
```

Open <http://127.0.0.1:5173>.

> The third script exists because Chrome builds an accessibility tree **only if it detects a
> screen reader at startup**. An everyday Chrome window exposes nothing to NVDA — it reports
> `Chrome Legacy Window` and reads no page content, while still echoing typed characters at
> the keyboard level. That combination looks exactly like an application bug and is not one.

---

## How it was built

Every line of code traces to a numbered task, every task to a requirement, every requirement
to a decision someone recorded.

```
/speckit-specify  →  spec.md         what and why, acceptance criteria
/speckit-clarify  →  resolves open questions
/speckit-plan     →  plan.md         technical approach, Constitution Check
/speckit-tasks    →  tasks.md        72 ordered, dependency-aware tasks
/speckit-analyze  →  cross-artifact consistency check
/speckit-implement → executes tasks.md
```

Artifacts live in [`specs/001-todo-core/`](specs/001-todo-core/) — spec, plan, research,
data model, API contract, quickstart, and the task list with every manual verification
result recorded inline.

[`.specify/memory/constitution.md`](.specify/memory/constitution.md) governs the repository.
It was amended once, from 1.0.0 to 1.1.0, to lower the Python floor — through the documented
amendment procedure rather than by quietly editing `pyproject.toml`.

---

## Quality gates

CI runs on every push to `main` and every pull request, as **one sequential job** so a
failure halts the pipeline instead of burning a browser install to report something `ruff`
already knew.

| Gate | Time |
|---|---|
| Ruff · ESLint (`jsx-a11y` at **error**) | 2s |
| `mypy --strict` · `tsc --noEmit` | 7s |
| WCAG contrast, incl. focus indicators | 0s |
| 85 backend tests — **100%** coverage on `services/` | 5s |
| 48 component tests | 3s |
| Generated-client drift check | 0s |
| 31 Playwright E2E + `axe-core` | 55s |

Fast checks first is a constitutional requirement, not a preference. The last two steps cost
55 seconds; everything before them costs 17.

### Not automatable

Each user story was verified by hand with **NVDA**. CI cannot do this, and the results are
recorded in `tasks.md`. The next section is why that matters.

---

## Three defects, three different gates

None of these would have been caught by the others.

**The manual screen-reader pass found what nothing else could.** The live character counter
sat in the title input's `aria-describedby`, so NVDA re-read *"1 of 150 characters"*,
*"2 of 150 characters"* after **every keystroke** — a 40-character title meant hearing the
count forty times. `axe-core` passed it, 19 component tests passed it, 10 E2E tests passed
it, and an accessibility-tree snapshot passed it. All of them correctly: the markup *was*
right. It was simply unpleasant to use. Fixed by hiding the live count from assistive
technology and describing the field with a static limit that never changes.

**E2E found a focus bug no component test could reach.** Post-deletion focus used
`requestAnimationFrame`, which fired *before* React committed the new list. It focused the
row that was about to be removed; React removed it; focus fell to `<body>`. It only surfaced
when deleting the **last** task, because in every other case the keyed node survived the
commit and focus survived with it — the right result by the wrong mechanism. jsdom flushes
updates synchronously inside `act()`, so the commit boundary that caused it does not exist
there.

**`/speckit-analyze` was right about the thing it called CRITICAL.** Focus-indicator contrast
had zero verification, because `axe-core` does not test it. Measuring found three failures,
including a dark focus ring on a dark button fill at **1.68:1** that read correctly only
because `outline-offset` happened to expose the page background behind it. Both filled
buttons now paint an explicit white separator. `npm run check:contrast` makes it repeatable
and runs in CI.

---

## Design decisions worth a look

Each is argued in [`research.md`](specs/001-todo-core/research.md) with the alternatives that
were rejected.

**One `ORDER BY` covers four requirements.**

```sql
ORDER BY (completed_at IS NULL) DESC, completed_at DESC, created_at DESC, id DESC
```

Active tasks above completed ones, newest first within each group, completed ranked by when
they were finished, and a deterministic tie-break. The client renders the array verbatim and
never sorts.

**No `is_completed` boolean.** A task is active if and only if `completed_at IS NULL`.
Storing a flag *and* a timestamp makes `completed = true, completed_at = NULL` representable,
which then needs a constraint and two columns maintained in step. Deriving the flag makes the
incoherent state impossible to express rather than merely forbidden.

**No optimistic updates, no state library.** Every mutation awaits its response and refetches.
FR-025 — "the displayed list must converge on true stored state" — becomes true by
construction instead of by reconciliation logic. It also keeps the sort rule single-sourced:
placing a moved task locally would mean reimplementing that `ORDER BY` in TypeScript.

**Zero `role=` and zero `aria-checked`.** Every semantic in this feature has a native element:
`<input type="checkbox">` with the title as its `<label>`, `<dialog>` with `showModal()` for
the focus trap and `Escape` handling, `<output>` for the live region.

**Grapheme clusters, not code points.** `"👨‍👩‍👧‍👦".length` is 11. The 150-character limit counts
user-perceived characters via UAX #29 — `regex`'s `\X` on the server, `Intl.Segmenter` in the
browser. The server is authoritative; the client count is advisory.

---

## Layout

```
backend/src/taskflow/
  main.py          app factory, one error envelope, logging
  api/routers/     thin: validate, delegate, serialise
  services/        domain logic — NO FastAPI imports, most heavily tested
  models/ schemas/ SQLAlchemy 2.0 · Pydantic v2
frontend/src/
  api/             GENERATED from the OpenAPI schema — never hand-edited
  components/      co-located tests
  hooks/           useTasks (mutate-then-refetch), useAnnouncer
specs/001-todo-core/
.specify/memory/constitution.md
```

[`CLAUDE.md`](CLAUDE.md) carries agent guidance and a *"Gotchas already paid for"* section —
the things that cost real debugging time and are invisible from the code.

---

## Deliberately absent

Recorded as decisions in the spec's Assumptions, not oversights:

- **No editing.** A typo means delete and re-add — the sharpest remaining usability gap.
- **No priority.** Specified, promoted to primary sort key, then withdrawn before planning.
  The Task entity must not gain the column speculatively; if priority returns, it returns as
  its own feature with its own spec.
- **No pagination, search, filtering, or bulk actions.** Single local user, no accounts, no
  authentication, no owner column.

`SETUP.txt` is a third-party tutorial whose stated stack (Next.js, Prisma, PostgreSQL, 90%
coverage) contradicts this project on every point. The constitution supersedes it.
