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
below the active ones. The interface follows your system's light or dark setting, with an
in-app override that persists. What happened is written to a local file you can read with
`grep`. Nothing more — no priority, no due dates, no accounts.

| | |
|---|---|
| **Backend** | FastAPI · Pydantic v2 · SQLAlchemy 2.0 · Alembic · SQLite · Python 3.11+ |
| **Frontend** | React 18 · Vite · TypeScript `strict` · CSS Modules · design tokens, light + dark |
| **API client** | Generated from the emitted OpenAPI schema — never hand-written |
| **Telemetry** | JSON Lines, local file, bounded, **never transmitted** — stdlib only |
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
/speckit-tasks    →  tasks.md        ordered, dependency-aware tasks
/speckit-analyze  →  cross-artifact consistency check
/speckit-implement → executes tasks.md
```

Three features, 173 tasks: [`001-todo-core`](specs/001-todo-core/) (72),
[`002-design-system`](specs/002-design-system/) (45),
[`003-local-telemetry`](specs/003-local-telemetry/) (56). Each carries a spec, plan,
research, data model, contract, quickstart, and a task list with every manual verification
result recorded inline.

[`.specify/memory/constitution.md`](.specify/memory/constitution.md) governs the repository.
It has been amended four times, each through the documented procedure rather than by quietly
editing code: **1.1.0** lowered the Python floor to 3.11, **1.2.0** added Principle VI
*(Coherent Visual System)*, **1.3.0** added Principle VII *(Local Observability)*, and
**1.3.1** fixed two errors the document had accumulated — a Review clause still saying
"five principles" after two had been added, and a definition of done citing `tsc --noEmit`,
which [checks nothing in this repository](#the-command-that-checks-nothing).

**All seven principles are now satisfied by shipped code, and the Known exceptions block is
empty.** Each of VI and VII spent time in that block first: added by amendment, listed as a
documented exception, then discharged by its own feature and the entry removed. A principle
that silently invalidates shipped work is how a governing document stops being believed —
and a *satisfied* exception left in the list is how the list stops being read.

---

## Quality gates

CI runs on every push to `main` and every pull request, as **one sequential job** so a
failure halts the pipeline instead of burning a browser install to report something `ruff`
already knew.

| Gate | Time |
|---|---|
| Ruff · ESLint (`jsx-a11y` at **error**) | 2s |
| `mypy --strict` · `npm run typecheck` | 7s |
| WCAG contrast — 34 measurements, both themes, read from the token file | 0s |
| 137 backend tests — **100%** coverage on `services/` | 8s |
| 104 component tests | 5s |
| Generated-client drift check | 0s |
| 57 Playwright E2E + `axe-core`, both themes | ~60s |

Fast checks first is a constitutional requirement, not a preference. The last two steps cost
55 seconds; everything before them costs 20.

<a id="the-command-that-checks-nothing"></a>
**One of those commands used to check nothing.** The root `tsconfig.json` is `files: []`
plus project references, so a bare `tsc --noEmit` exits 0 on a file containing
`const x: number = "str"`. CI had the correct form; the constitution's definition of done
did not, until v1.3.1. A green gate that cannot fail is worse than no gate, because people
believe it.

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

## The telemetry record

Principle VII asks for observability that is local, bounded, readable, private, and never
load-bearing. `003-local-telemetry` is the answer, and it added **no dependency at all** —
`logging.handlers.RotatingFileHandler` and `json` were already in the standard library.

```bash
grep '"kind":"failure"' backend/telemetry.jsonl       # everything that went wrong
grep -c '"operation":"task_created"' backend/*.jsonl  # how many tasks you made
tail -5 backend/telemetry.jsonl                       # what happened last
```

```json
{"ts":"2026-10-30T18:04:19.881Z","kind":"timing","operation":"task_created","method":"POST","path_template":"/api/tasks","status":201,"duration_ms":4.12}
{"ts":"2026-10-30T18:05:02.104Z","kind":"failure","operation":"task_created","code":"TITLE_TOO_LONG","status":422,"exception_type":"TitleTooLongError","source":"server"}
```

Read that second line again: the **code** and the exception **type**, never the exception
**message**. The message is *"Title must be 150 characters or fewer (received 184)"* — and
the same field on a different error would carry the title itself. The rule has to hold
without case-by-case judgement, so three things enforce it:

1. The sink accepts `str`, `int`, `float` and `bool` and drops everything else. An
   exception object passed by mistake is simply not written.
2. Instrumentation records `type(exc).__name__` and `exc.code`, never `str(exc)`. Routes
   are recorded as `/api/tasks/{task_id}`, never `/api/tasks/42`.
3. **A test creates tasks with distinctive titles and searches the entire record for
   them.** This is the one that will actually catch a regression; the first two depend on
   someone remembering. It was verified by deliberately leaking a title and watching both
   it and the backend equivalent fail.

The other property worth stating: `record()` returns `None` unconditionally — not a success
flag — so no caller can write `if not record(...)`. The moment anything branches on
telemetry, telemetry is load-bearing. With the destination unwritable, every operation
still succeeds, the interface says nothing about it, and a test measures that the broken
path is not slower than the working one.

A browser cannot write to a file, so browser failures `POST /api/telemetry`, which answers
`204` **even when it cannot record** — an error-reporting endpoint that reports errors is a
loop. The honest limitation is written down rather than hidden: a browser failure caused by
the server being unreachable cannot reach a server-side file.

---

## Layout

```
backend/src/taskflow/
  main.py          app factory, one error envelope, logging
  api/routers/     thin: validate, delegate, serialise
  services/        domain logic — NO FastAPI imports, most heavily tested
  models/ schemas/ SQLAlchemy 2.0 · Pydantic v2
  telemetry.py     the sink — no FastAPI import, never raises, bounded
  middleware.py    request timing, by route template
frontend/src/
  api/             GENERATED from the OpenAPI schema — never hand-edited
  components/      co-located tests
  hooks/           useTasks (mutate-then-refetch), useAnnouncer, useTheme
  styles/tokens.css  every colour, space, type and radius value
specs/001-todo-core/ 002-design-system/ 003-local-telemetry/
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
- **No telemetry viewer, and no third-party analytics.** The record is a file; reading it is
  your job and `grep` is the interface. Nothing is transmitted anywhere, and the constitution
  keeps analytics out of scope — `003-local-telemetry` does not relax that and must not be
  read as a step toward it.

`SETUP.txt` is a third-party tutorial whose stated stack (Next.js, Prisma, PostgreSQL, 90%
coverage) contradicts this project on every point. The constitution supersedes it.
