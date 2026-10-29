# Implementation Plan: Core Todo

**Branch**: `001-todo-core` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-todo-core/spec.md`

## Summary

A single-page todo list over a local SQLite file. Three user stories — capture, complete/revert,
delete — behind a FastAPI JSON API consumed by a React SPA whose client types are generated from
the emitted OpenAPI schema.

The architecturally interesting parts are not CRUD. They are: ordering, which is expressed as one
declarative `ORDER BY` so the server is the single authority on list position; the completion
model, which uses a single nullable `completed_at` column rather than a boolean plus a timestamp
that can disagree; and focus choreography (FR-021), which requires the frontend to re-locate a DOM
node that has moved and restore focus to it after React commits.

No state management library, no caching layer, no optimistic updates. Every mutation is followed
by a refetch of the canonical list, which makes FR-025 (converge on true stored state) true by
construction rather than by reconciliation logic.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.x in `strict` mode (frontend)

**Primary Dependencies**: FastAPI + Uvicorn, Pydantic v2, SQLAlchemy 2.0, Alembic, `regex`;
React 18, Vite, CSS Modules, `openapi-typescript` + `openapi-fetch`

**Storage**: SQLite, single file, accessed only through SQLAlchemy; schema changed only by Alembic

**Testing**: pytest + `httpx.AsyncClient` over `ASGITransport` (contract, in-process); Vitest +
React Testing Library (unit/component, network faked at the boundary); Playwright +
`@axe-core/playwright` (E2E against live frontend and live backend)

**Target Platform**: Modern evergreen desktop browser against a locally run API. Requires
`Intl.Segmenter` (Chrome 87+, Safari 14.1+, Firefox 125+) — see research.md R1.

**Project Type**: Web application — separate `backend/` and `frontend/` trees

**Performance Goals**: None specified and none pursued. The list is expected to hold tens to
hundreds of rows for one local user. SC-004's one-second announcement budget is the only timing
requirement in the spec, and it is bounded by local I/O.

**Constraints**: Single local user, no authentication, no owner column (constitution, Data and
Authentication). Offline in the sense that nothing leaves the machine; no network resilience
requirements beyond FR-025.

**Scale/Scope**: 3 user stories, 25 functional requirements, 4 HTTP endpoints, ~8 React components.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0

| Principle | Gate | Verdict |
|---|---|---|
| I. Spec-Driven Delivery | Spec exists, clarified, no open markers; plan precedes code | ✅ Pass |
| II. Test-Backed Delivery | ≥80% domain coverage, contract test per endpoint, E2E per story | ✅ Planned — see Testing Strategy |
| III. Accessibility | WCAG 2.2 AA, axe zero violations, native HTML before ARIA, keyboard, live region, manual SR | ✅ Planned — see Accessibility Architecture |
| IV. Typed Contracts | TS `strict` no `any`, `mypy --strict`, Pydantic v2 bodies, generated client | ✅ Planned — see Type Contract Chain |
| V. Simplicity & YAGNI | No abstraction at one call site, deps justified here, no state lib/cache/worker | ✅ Pass — see Dependency Justification |
| Stack & Constraints | Binding stack honoured; no owner column; Alembic only | ✅ Pass |

### Principles VI and VII — added after this plan was written

The checks above cover Principles I–V because those were the only ones that existed when
this plan was authored. Two were added later:

- **v1.2.0** (2026-10-30) added **VI. Coherent Visual System**. `001-todo-core` does not
  satisfy it: component stylesheets hold hardcoded colour and `px` values, the application
  ships light-only, and there are no motion tokens.
- **v1.3.0** (2026-10-30) added **VII. Local Observability**. `001-todo-core` does not
  satisfy it either: logging goes to a console that closes with its terminal, nothing is
  written to disk, and the browser records nothing at all — the `catch` clauses in
  `useTasks` swallow the error object entirely.

This is recorded in the constitution's Governance section as a documented exception, not a
violation. Compliance is new work and goes through `/speckit-specify` as its own feature.
This plan is left as written rather than retro-fitted — it was correct against the
constitution in force at the time, and rewriting it would obscure that the principle
postdates the feature.

### Stack substitution request — rejected, recorded

Prisma and Next.js API routes were requested for this plan. Both are prohibited: Prisma replaces
SQLAlchemy 2.0 and Alembic, and Next.js appears twice on the explicit out-of-scope list
("server-side rendering, Next.js, any Node.js backend"). Governance requires a constitutional
amendment, not a `plan.md` note, to substitute a binding stack element. The user elected to plan on
the sanctioned stack rather than amend. **No complexity-tracking entry is required** because no
violation was adopted.

### Post-Phase 1 re-check

| Principle | Re-verdict | Note |
|---|---|---|
| I | ✅ Pass | All design artifacts trace to FR/SC identifiers |
| II | ✅ Pass | 4 contract tests, 3 E2E specs, service layer isolated and framework-free |
| III | ✅ Pass | Native `<dialog>`, native `<input type=checkbox>`, one live region. Zero `role=` attributes in the design — see Accessibility Architecture |
| IV | ✅ Pass | Schema emitted by FastAPI → types generated → CI fails on drift |
| V | ✅ Pass | 3 new dependencies, each justified below. No index, no envelope, no optimistic layer, no extracted single-call-site hook |

## Architecture

### Backend layering

Dependencies point inward. `services/` imports neither FastAPI nor SQLAlchemy session machinery
beyond the type of the handle it is given, and is unit-testable without an HTTP client.

```text
api/routers/tasks.py     validate → delegate → serialise. No business rules, no queries.
schemas/task.py          Pydantic v2 request/response models. Delegates field rules to services.
services/tasks.py        Ordering, completion transitions, deletion. The heavily tested layer.
services/validation.py   Title trim + grapheme-length rule. Pure functions, no imports beyond `regex`.
models/task.py           SQLAlchemy 2.0 declarative model.
```

The one deliberate inversion: `schemas/` imports `services/validation` so that the title rule has
exactly one implementation and still surfaces as a 422 through Pydantic. `services/` never imports
`schemas/`.

### Ordering — one expression, server-authoritative

FR-009, FR-016, FR-017 and FR-018 are a single sort, computed in SQL:

```sql
ORDER BY (completed_at IS NULL) DESC,  -- active (1) before completed (0)
         completed_at DESC,            -- completed: most recently finished first
         created_at DESC,              -- active: newest first
         id DESC                       -- deterministic tie-break
```

Active rows all share `completed_at IS NULL`, so that key ties among them and the sort falls
through to `created_at`. Completed rows all have a value, so `completed_at DESC` ranks them.
One expression satisfies four requirements. Chosen over sorting in Python not for performance —
at this scale it is irrelevant — but because it is declarative and the database guarantees
stability. See research.md R3.

**The client never sorts.** It renders the array in the order received. This is what makes FR-021's
"did it actually move?" test a simple index comparison rather than a re-derivation of the rule.

### Frontend state

One owner component holds the task array. No Context, no reducer, no library.

```text
App
├── useTasks()        tasks, status, error + create/setCompleted/remove. Mutate → refetch list.
├── useAnnouncer()    announce(message) → feeds the single live region
├── AddTaskForm       controlled input, grapheme counter, submit disabled while in flight
├── TaskList          owns the ref map and the post-commit focus effect
│   └── TaskItem      native checkbox, title, delete button
├── DeleteConfirmDialog   native <dialog> + showModal()
└── LiveRegion        the one aria-live="polite" region in the application
```

**Mutate-then-refetch.** Every mutation awaits its response, then refetches `GET /api/tasks` and
replaces state wholesale. FR-025 becomes true by construction: there is no local projection of
server state that could diverge. On failure the previous array is retained untouched and the error
is announced. No optimistic updates, no rollback path, no cache invalidation — none of which the
spec asks for, and Principle V forbids inventing.

### Accessibility architecture

Design target: **zero `role=` attributes**. Every semantic in this feature has a native element.

| Requirement | Mechanism | Why not ARIA |
|---|---|---|
| FR-011 completion state | `<input type="checkbox" checked>` | The browser exposes the state. A hand-managed `aria-checked` can only drift from the real one. |
| FR-013, FR-022 dialog | `<dialog>` + `.showModal()` | Native modal gives focus trap, `Escape`, and inertness of the background for free. `role="dialog"` would reimplement all three. |
| FR-020 announcements | One `aria-live="polite"` region, app-level | Multiple live regions compete and interleave unpredictably. One owner, one queue. |
| FR-019 keyboard | Native `<button>`, `<input>`, `<form>` submit | Nothing custom to re-teach. |

**FR-021, the hard one.** After a completion or revert:

1. `TaskList` records `pendingFocusId` and the task's index *before* the refetch.
2. State updates; React re-renders. `TaskItem` elements are keyed by `task.id`, so React **moves**
   the existing DOM nodes rather than recreating them. Without stable keys the focused node is
   destroyed and focus falls to `<body>`, failing SC-008. This is the single most important
   implementation detail in the feature.
3. A `useLayoutEffect` runs after commit: look up the node in the ref map, `.focus()`, then
   `.scrollIntoView({ block: 'nearest' })`.
4. Compare the new index to the recorded one. Announce the completion always; announce the move
   **only if the index changed**, satisfying FR-021's "where no move occurs, no move MUST be
   announced."

The focus effect is not extracted into a shared hook — it has exactly one call site, and Principle
V says wait for the third.

### Validation and error handling

**Two layers, one implementation of the rule.**

`services/validation.py` holds `normalise_title(raw) -> str`, which trims and enforces 1–150
grapheme clusters, raising `TitleEmptyError` or `TitleTooLongError`. It imports only `regex`. It is
directly unit-testable and is the authority.

`schemas/task.py` exposes `TaskCreate` whose `@field_validator` calls that function, so a bad title
is rejected by Pydantic before the router body runs and emerges as HTTP 422.

**The client is never trusted.** The frontend counts graphemes with `Intl.Segmenter` for the live
counter and to disable submit, but sends the raw string. The server trims and re-validates. The two
implementations follow the same UAX #29 rule but may be built against different Unicode versions —
the server's answer is definitive, and a client/server disagreement surfaces as a normal 422 rather
than as corrupt data. See research.md R1.

**One error envelope.** FastAPI's default `RequestValidationError` shape differs from a hand-raised
exception's. Both are mapped to a single structure so the generated client has exactly one error
type to narrow:

```json
{ "error": { "code": "TITLE_TOO_LONG", "message": "...", "field": "title" } }
```

Handlers are registered for `RequestValidationError` and for a `DomainError` base class. See
[contracts/api.md](./contracts/api.md) for codes.

**Logging** uses the standard library `logging` module — no dependency. `WARNING` for expected
rejections (validation failures, 404s) with the error code and task id but **not** the task title;
`ERROR` with traceback for anything producing a 5xx. No request-id correlation and no structured
JSON formatter: there is one user, one process, and no log aggregator, so both are speculative
under Principle V.

### Type contract chain

```text
SQLAlchemy 2.0 Mapped[] annotations     →  mypy --strict
        ↓
Pydantic v2 response models             →  mypy --strict
        ↓
FastAPI emits openapi.json              →  scripts/export_openapi.py (no live server needed)
        ↓
openapi-typescript generates src/api/schema.d.ts
        ↓
openapi-fetch gives a typed client      →  tsc --noEmit, no `any`
```

CI regenerates `schema.d.ts` and fails on any diff against the committed file. That is the
mechanism behind the constitution's "a schema change that breaks the generated client MUST fail CI
rather than surface at runtime." `src/api/` is generated output and is never hand-edited.

### Dependency justification *(Principle V)*

Everything else in the stack is named in the constitution and needs no defence.

| Dependency | Provides | Why stdlib/existing is insufficient |
|---|---|---|
| `regex` (backend) | `\X` — UAX #29 grapheme cluster matching | Python has no grapheme segmentation. `len()` counts code points; a family emoji counts as 1 perceived character but up to 11 code points. FR-003 specifies perceived characters. `unicodedata` exposes properties, not segmentation. |
| `openapi-typescript` (frontend, dev) | Generates TS types from `openapi.json` | The constitution mandates a generated client. Zero runtime output — types only. |
| `openapi-fetch` (frontend, ~2 KB) | Typed `fetch` wrapper consuming those types | Keeps URL/method/body plumbing schema-driven. A hand-written wrapper would reintroduce the hand-maintained layer the constitution prohibits. |

Rejected: `structlog` (one process, no aggregator), any state library (Principle V names them
explicitly), a database index (see data-model.md), a response envelope for list endpoints, and
optimistic update infrastructure.

## Testing Strategy *(Principle II)*

| Layer | Tool | Scope |
|---|---|---|
| Unit | pytest | `services/validation.py` and `services/tasks.py` — ordering, transitions, title rules, grapheme boundaries. Runs against a **real SQLite session**, not a mock: the ordering expression depends on SQLite's own NULL semantics (R3), and a mocked session would assert the rule against a fiction. ≥80% line coverage on `services/`, measured on this layer alone. |
| Contract | pytest + `httpx.AsyncClient` over `ASGITransport` | One per endpoint (4). In-process against the real app, asserting status codes, response shape against the schema, and every error code. |
| Component | Vitest + RTL | `AddTaskForm`, `TaskItem`, `DeleteConfirmDialog`, `LiveRegion`. **Network faked at the boundary** — no component test performs a request. |
| E2E | Playwright + `@axe-core/playwright` | One spec per user story (3), against a live frontend and a live backend on a disposable SQLite file. axe assertion in every spec, covering all five states named in SC-003. |
| Manual | NVDA or VoiceOver | Each story verified by hand before it is marked done (SC-009, Principle III). Not automatable; not optional. |

Test ordering is free (Principle II) but nothing merges untested, and no test is skipped or deleted
to reach green.

## Project Structure

### Documentation (this feature)

```text
specs/001-todo-core/
├── plan.md              # This file
├── research.md          # Phase 0 — five resolved decisions
├── data-model.md        # Phase 1 — schema, constraints, Alembic revision shape
├── quickstart.md        # Phase 1 — how to run and validate
├── contracts/
│   └── api.md           # Phase 1 — endpoint contracts and error codes
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 — created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
backend/
├── src/taskflow/
│   ├── main.py                  app factory, exception handlers, CORS for the Vite origin
│   ├── api/
│   │   ├── deps.py              session dependency
│   │   └── routers/tasks.py     4 routes, thin
│   ├── models/task.py           SQLAlchemy 2.0 declarative model
│   ├── schemas/task.py          TaskCreate, TaskUpdate, TaskRead, ErrorResponse
│   ├── services/
│   │   ├── tasks.py             list/create/set_completed/delete + the ordering expression
│   │   ├── validation.py        normalise_title, grapheme counting
│   │   └── errors.py            DomainError hierarchy → codes
│   └── db.py                    engine, session factory
├── migrations/                  Alembic; one revision for this feature
├── scripts/export_openapi.py    dumps openapi.json without running a server
└── tests/
    ├── conftest.py              app fixture, ASGITransport client, disposable SQLite per test
    ├── unit/                    services, against a real SQLite session
    └── contract/                one file per endpoint

frontend/
├── src/
│   ├── api/                     GENERATED from openapi.json — never hand-edited
│   ├── components/              AddTaskForm/ TaskList/ TaskItem/ DeleteConfirmDialog/ LiveRegion/
│   ├── hooks/                   useTasks.ts, useAnnouncer.ts
│   ├── types/                   only what is not derived from the schema
│   └── App.tsx
└── tests/e2e/                   one spec per user story, each with an axe assertion
```

**Structure Decision**: Two-tree web application, matching the layout in `CLAUDE.md`. Domain logic
lives in `backend/src/taskflow/services/` free of FastAPI imports; routers validate, delegate and
serialise. `frontend/src/api/` is generated output under CI diff protection.

## Complexity Tracking

> No Constitution Check violations were adopted. This table is intentionally empty.

The one request that would have required an entry — Prisma and Next.js API routes — was rejected
rather than justified, since Governance requires an amendment for stack substitution and the user
chose not to amend. Recorded in Constitution Check above.
