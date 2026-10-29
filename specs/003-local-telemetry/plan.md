# Implementation Plan: Local Telemetry

**Branch**: `003-local-telemetry` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-local-telemetry/spec.md`

## Summary

A bounded, local, human-readable record of what the application did — so that a failure can
be diagnosed after it happened rather than only while someone is watching.

The work splits cleanly:

- A **sink** that appends JSON Lines to a file beside the database, rotates at a size cap,
  and can never raise.
- **Instrumentation** at four points: the existing exception handlers, a request-timing
  middleware, the service layer's feature counts, and the application lifespan.
- A **reporting endpoint** so browser failures reach the same file, since the browser cannot
  write to one and Principle VII requires both sides.
- A **redaction discipline** so nothing anyone typed is ever written.

The whole feature is additive. No user-visible behaviour changes, and no existing test
should need editing.

## Technical Context

**Language/Version**: Python 3.11+, TypeScript 5.6 `strict`, Node 26

**Primary Dependencies**: **None new.** Python's standard library provides everything
required — `logging.handlers.RotatingFileHandler` for the bound, `json` for the format,
`time.perf_counter` for durations.

**On `structlog`**: `001`'s plan rejected it as "one process, no aggregator, no log
aggregator, so speculative under Principle V". **That reasoning still holds.** What changed
is persistence, not structure, and persistence is a handler — not a library. Emitting JSON
is a formatter of roughly fifteen lines. Adding a dependency to avoid those fifteen lines
would be the wrong trade in a project whose Principle V says to wait for a documented
problem.

**Storage**: One file, `telemetry.jsonl`, beside the SQLite database, plus at most one
rotated predecessor.

**Testing**: pytest for the sink, redaction and endpoint; Vitest for the browser reporter;
an E2E proving a task title never reaches the file.

**Target Platform**: Unchanged.

**Performance Goals**: One, and it is a constraint rather than a target — recording must not
measurably slow a user action, including when it is failing.

**Constraints**: Nothing transmitted. Nothing user-authored recorded. Never load-bearing.
All 85 backend, 79 component and 47 E2E tests keep passing.

**Scale/Scope**: 1 new module, 1 middleware, 1 endpoint, 1 browser reporter, ~4 instrumented
call sites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0

| Principle | Gate | Verdict |
|---|---|---|
| I. Spec-Driven Delivery | Spec exists, clarified, no open markers | ✅ Pass |
| II. Test-Backed Delivery | ≥80% on `services/`, contract test per endpoint, E2E per story | ✅ Planned — a contract test for the new endpoint, and the sink lives where coverage is measured |
| III. Accessibility | WCAG 2.2 AA | ✅ **Not engaged** — no UI. Nothing rendered, nothing announced, no new interactive element |
| IV. Typed Contracts | TS `strict` no `any`, `mypy --strict`, Pydantic v2 bodies, generated client | ✅ Planned — the report body is a Pydantic model, and the client is regenerated |
| V. Simplicity & YAGNI | No abstraction at one call site, deps justified | ✅ Pass — **zero new dependencies**; see the `structlog` note above |
| VI. Coherent Visual System | Tokens, both themes, bounded motion | ✅ **Not engaged** — no styling |
| VII. Local Observability | Local file, four signals, no user content, bounded, readable, never load-bearing | ✅ **This feature exists to satisfy it** |

**Three principles are not engaged**, which is unusual and worth saying rather than quietly
ticking. This feature renders nothing and styles nothing. Claiming a passing accessibility
gate for a file writer would devalue the gate.

### Post-Phase 1 re-check

| Principle | Re-verdict | Note |
|---|---|---|
| II | ✅ Pass | Redaction gets its own tests; the "never load-bearing" property is tested by making the destination unwritable |
| IV | ✅ Pass | `TelemetryReport` is a Pydantic v2 model with a closed field set — the endpoint cannot be used to write arbitrary text |
| V | ✅ Pass | Zero dependencies. The sink is one module with one call site per signal |
| VII | ✅ Pass | All six rules have a requirement and a test |

## Architecture

### The sink

`backend/src/taskflow/telemetry.py` — one module, no FastAPI import, so it stays testable in
isolation and usable from anywhere.

```text
record(kind, operation, **fields) -> None     the only public entry point
```

Four kinds, matching the four signals Principle VII names: `failure`, `timing`, `usage`,
`lifecycle`. Every entry carries `ts` (UTC, ISO 8601), `kind`, `operation`.

**It can never raise.** The entire body is wrapped, and the fallback is to do nothing. This
is stated three times in the spec (FR-016, FR-017, FR-018) because it is the property most
easily lost: the natural shape of "write to a file" raises on a full disk, and that must not
reach a user who was adding a task.

**Bound**: `RotatingFileHandler` with a size cap and `backupCount=1`. Disk use never exceeds
roughly twice the cap. From the standard library — a bound worth having is not worth a
dependency.

### What gets recorded, and where it is hooked

| Signal | Hook | Example fields |
|---|---|---|
| `failure` | The three existing exception handlers in `main.py` | `code`, `status`, `exception_type` |
| `timing` | A new middleware around each request | `method`, `path_template`, `status`, `duration_ms` |
| `usage` | `services/tasks.py`, one call per operation | `operation: task_created` |
| `lifecycle` | FastAPI lifespan, plus the Alembic env | `event: startup / shutdown / migration_applied` |

**`path_template`, not `path`.** `/api/tasks/42` becomes `/api/tasks/{task_id}`. The literal
path carries an identifier that is useless for aggregation and is one step from carrying
something that is not.

### Redaction — the part most likely to go wrong

The rule is "no user-authored text". The hazard is that the most natural error messages
quote exactly that: *"Title must be 150 characters or fewer (received 184)"* is fine, but
*"Title too long: 'Buy milk and then…'"* is not, and the second is what a developer writes
without thinking.

Three defences:

1. **The sink accepts only a closed set of field types** — strings from a known vocabulary,
   integers, floats, booleans. Not arbitrary objects, not exception messages.
2. **Exception *messages* are never recorded; exception *types* and domain *codes* are.**
   `TitleTooLongError` and `TITLE_TOO_LONG` say everything useful. The message is where the
   user's text lives.
3. **A test creates tasks with distinctive titles and greps the entire record for them**
   (FR-014, SC-003). This is the one that will actually catch a regression, because the
   first two rely on discipline.

### The reporting endpoint

`POST /api/telemetry` — the only way browser failures reach a server-side file.

| | |
|---|---|
| Body | `TelemetryReport`: `operation` (from a closed enum), `code` (short string), `duration_ms` (optional) |
| Response | `204`, always — see below |
| Never accepts | Free text, stack traces, task titles, arbitrary objects |

**It returns 204 even when it cannot record.** Reporting a failure must not produce one
(FR-006a). A client that gets an error from the error-reporting endpoint has learned nothing
it can act on and may well loop.

The body is a closed Pydantic model rather than a free-form blob precisely because an
endpoint that accepts arbitrary text is an endpoint through which a task title eventually
arrives.

### The browser side

`frontend/src/api/telemetry.ts` — a `report()` that posts and swallows everything, wired
into the four `catch` clauses in `useTasks.ts` that currently discard the error object
entirely.

What is sent: the operation name and a short code. **Not** the caught error's message, which
can contain a server response, a URL, or a title.

`report()` is fire-and-forget and never awaited in a path the user is waiting on.

## Testing Strategy *(Principle II)*

| Layer | Scope |
|---|---|
| Unit | The sink: writes JSON Lines, one object per line, rotates at the cap, keeps one backup, **never raises** when the destination is unwritable |
| Unit | Redaction: a closed field set; exception messages rejected; `path_template` not literal path |
| Contract | `POST /api/telemetry` — 204 on valid, 422 on malformed, **204 even when the sink is broken** |
| Unit | The four signals each produce an entry with the right `kind` |
| Component | The browser reporter posts, and swallows a failure to post |
| E2E | **Create tasks with distinctive titles, then grep the whole record — zero matches** |
| E2E | With the destination unwritable, every operation still succeeds |

## Project Structure

### Documentation (this feature)

```text
specs/003-local-telemetry/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/telemetry.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
backend/src/taskflow/
  telemetry.py                   NEW — the sink. No FastAPI import.
  api/routers/telemetry.py       NEW — POST /api/telemetry
  schemas/telemetry.py           NEW — TelemetryReport, closed field set
  middleware.py                  NEW — request timing
  main.py                        + instrument the 3 handlers, lifespan, middleware
  services/tasks.py              + usage counts
  migrations/env.py              + migration_applied
backend/tests/
  conftest.py                    + autouse fixture redirecting the record to tmp_path
  unit/test_telemetry.py         NEW — the sink: format, bound, never-raise, field filter
  unit/test_telemetry_signals.py NEW — the four kinds, and the idempotent no-op
  contract/test_telemetry_endpoint.py  NEW
frontend/src/api/telemetry.ts    NEW — fire-and-forget reporter
frontend/src/api/telemetry.test.ts   NEW
frontend/src/hooks/useTasks.ts   + report from the four catch clauses
frontend/src/hooks/useTasks.test.ts  NEW — no existing component test is edited
frontend/tests/e2e/telemetry.spec.ts NEW — the no-user-content proof
frontend/tests/e2e/global-setup.ts   + reset the record beside the database
frontend/playwright.config.ts    + TASKFLOW_TELEMETRY_PATH for the E2E backend
```

**Structure Decision**: The sink sits at `taskflow/telemetry.py` rather than under
`services/`. It is not domain logic — it has no opinion about tasks — and putting it in
`services/` would drag it into the ≥80% domain-coverage gate for the wrong reason. It is
infrastructure, like `db.py`.

## Complexity Tracking

> No Constitution Check violations were adopted. One judgement worth recording.

| Item | Why | Alternative rejected because |
|---|---|---|
| A new endpoint for browser failures | Principle VII requires failures from **both** sides, and a browser cannot write to a file | Keeping browser telemetry in the browser leaves half the principle unsatisfied and splits the record in two, with the harder-to-reach half being the one that currently has no coverage at all |
