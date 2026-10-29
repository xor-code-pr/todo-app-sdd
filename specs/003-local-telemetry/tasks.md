# Tasks: Local Telemetry

**Feature**: `003-local-telemetry` | **Date**: 2026-10-30

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/telemetry.md](./contracts/telemetry.md) ·
[quickstart.md](./quickstart.md)

**Tests are REQUIRED** (Principle II). Authoring order is free.

---

## Two things a reader should know before starting

**1. US3 is not independent, and that is deliberate.** The usual rule is that each user
story phase stands alone. US3 ("the record stays small, private and harmless") cannot: its
acceptance test is *"create tasks through the application, then search the whole record for
their titles"*, which requires the instrumentation US1 and US2 install. US3 is therefore
the **proof phase** — the properties it asserts are built into the sink in Phase 2, and
Phase 5 is where they are demonstrated across the real surface. Stated here rather than
discovered halfway through.

**2. There is no manual screen-reader gate in this feature.** Every previous feature had
one. This one renders nothing, styles nothing and adds no interactive element, so
Principle III is *not engaged* rather than *passed* — see plan.md's Constitution Check.
`npm run check:contrast` must still pass unchanged, because unchanged is the claim.

---

## Phase 1: Setup

- [X] T001 Record the pre-change baseline **before touching any source file**: run
      `pytest` in `backend/`, `npm test` and `npm run test:e2e` in `frontend/`, and write
      the three counts into this file under *Baseline* below. FR-019 and SC-008 are
      comparisons, and a comparison needs a recorded left-hand side.
- [X] T002 Add telemetry path and size-cap resolution to `backend/src/taskflow/telemetry.py`
      (module created here, logic in Phase 2): `TASKFLOW_TELEMETRY_PATH` defaults to
      `telemetry.jsonl` beside the database, `TASKFLOW_TELEMETRY_MAX_BYTES` defaults to
      5_000_000. Mirrors the existing `TASKFLOW_DB_PATH` convention in `db.py`.
- [X] T003 [P] Add `telemetry.jsonl` and `telemetry.jsonl.*` to `.gitignore`. A record of a
      developer's local session is not a repository artefact, and committing one would be a
      privacy failure of exactly the kind FR-011 exists to prevent.
- [X] T004 [P] Confirm **zero new runtime dependencies**: `backend/pyproject.toml`
      `[project].dependencies` and `frontend/package.json` `dependencies` must be
      byte-identical at the end of this feature. Record the current contents now.

---

## Phase 2: Foundational — the sink (BLOCKING)

Everything downstream calls `record()`. Nothing else can start until it exists and is
proven harmless.

- [X] T005 Implement `record(kind, operation, **fields) -> None` in
      `backend/src/taskflow/telemetry.py`. No FastAPI import — it must stay importable from
      `services/`, from Alembic's `env.py`, and from a plain unit test.
- [X] T006 Implement the JSON Lines formatter in `backend/src/taskflow/telemetry.py`: one
      JSON object per line, `ts` as UTC ISO 8601 ending `Z`, keys `ts`, `kind`, `operation`
      on every entry (data-model.md § Entry). **No pretty-printing and no embedded
      newlines** — FR-004a depends on one entry occupying exactly one line.
- [X] T007 Implement the bound in `backend/src/taskflow/telemetry.py` using
      `logging.handlers.RotatingFileHandler` with `maxBytes` from T002 and
      **`backupCount=1`**. Standard library only. Worst-case disk is ~2× the cap
      (FR-015, FR-015a).
- [X] T008 Implement the field filter in `backend/src/taskflow/telemetry.py`: accept `str`,
      `int`, `float`, `bool`; **silently drop anything else** — objects, exceptions,
      lists, dicts. Dropping rather than raising is the point; see T009.
- [X] T009 Wrap the entire body of `record()` so it **can never raise** —
      `except Exception: return` with no logging that could itself raise
      (`backend/src/taskflow/telemetry.py`). FR-016, FR-017 and FR-018 all reduce to this
      one property, and it is the one most easily lost by a later well-meaning change.
- [X] T010 Make `record()` return `None` unconditionally, with a docstring stating why: a
      boolean return invites `if not record(...)`, and the moment any code branches on
      telemetry, telemetry is load-bearing (contracts/telemetry.md § 1).
- [X] T011 Add a `telemetry_path` autouse fixture to `backend/tests/conftest.py` that points
      `TASKFLOW_TELEMETRY_PATH` at `tmp_path` for **every** backend test. Without this a
      test run appends to the developer's own record, and `pytest` becomes a way to
      pollute the thing under test.
- [X] T012 [P] Unit test in `backend/tests/unit/test_telemetry.py`: N calls produce N lines,
      each independently `json.loads`-able, each carrying `ts`, `kind` and `operation`
      (SC-002).
- [X] T013 [P] Unit test in `backend/tests/unit/test_telemetry.py`: write past the cap →
      `telemetry.jsonl` and `telemetry.jsonl.1` exist, **`telemetry.jsonl.2` does not**,
      total size within ~2× the cap (SC-006).
- [X] T014 [P] Unit test in `backend/tests/unit/test_telemetry.py`: with
      `TASKFLOW_TELEMETRY_PATH` pointing into a non-existent directory, `record()` returns
      normally and raises nothing. Repeat with the path pointing at a directory, and at a
      read-only file.
- [X] T015 [P] Unit test in `backend/tests/unit/test_telemetry.py`: passing an exception
      object, a dict and a list as field values drops those fields and still writes a valid
      line. **Assert the exception's message text is absent from the output** — this is the
      type-level half of the FR-013 defence.

**Checkpoint** — the sink exists, is bounded, and cannot hurt anything. Nothing is
instrumented yet, so `pytest` must still report the T001 baseline plus the new tests only.

---

## Phase 3: User Story 1 — find out what went wrong, after it went wrong (P1)

**Goal**: a server failure and a browser failure both survive to the file.

**Independent test**: cause both, close everything, reopen the record, find both.

### Server side

- [X] T016 [US1] Instrument `handle_domain_error` in `backend/src/taskflow/main.py`:
      `record("failure", operation, code=exc.code, status=status,
      exception_type=type(exc).__name__, source="server")`. **Never `str(exc)`** —
      data-model.md § What an entry must never contain.
- [X] T017 [US1] Instrument `handle_validation_error` in `backend/src/taskflow/main.py` with
      the resolved `code` and `field` name. The *field name* is a schema identifier and is
      permitted; the field *value* is user input and is not.
- [X] T018 [US1] Instrument `handle_unexpected` in `backend/src/taskflow/main.py` with
      `code="INTERNAL_ERROR"` and `exception_type`. The existing `logger.exception` call
      stays — a traceback on the console is useful and is not written to the record.

- [X] T018a [US1] Contract test in `backend/tests/contract/test_telemetry_endpoint.py`:
      **with the sink unwritable, a request that fails still returns its normal error
      envelope** with the right status and code. FR-018 — a failure inside the recorder
      while handling a failure must not swallow the first one. Nothing else tests this;
      T014 proves `record()` does not raise, which is necessary but not the same claim.

### The reporting endpoint

- [X] T019 [US1] Create `backend/src/taskflow/schemas/telemetry.py` with a Pydantic v2
      `TelemetryReport`: `operation` constrained to the closed vocabulary in data-model.md,
      `code` a `str` of **max length 64 matching `^[A-Z0-9_]+$`**, `duration_ms` an optional
      `float` with `ge=0`. `model_config = ConfigDict(extra="forbid")`.
      The pattern is a privacy control, not hygiene: prose cannot be smuggled through a
      field that admits no lowercase letters and no spaces (FR-006b).
- [X] T020 [US1] Create `backend/src/taskflow/api/routers/telemetry.py` with
      `POST /api/telemetry` returning **`204` always**, including when `record()` did
      nothing (FR-006a). Thin: validate, delegate, return.
- [X] T021 [US1] Register the router in `backend/src/taskflow/main.py`. Confirm the existing
      CORS `allow_methods` already permits `POST` — it does; do not widen it.
- [X] T022 [US1] Contract test in `backend/tests/contract/test_telemetry_endpoint.py`:
      valid body → `204`, no content, entry present in the record with `source="browser"`.
- [X] T023 [US1] Contract test in `backend/tests/contract/test_telemetry_endpoint.py`:
      malformed body → `422` **in the existing error envelope**
      (`{"error": {"code", "message", "field"}}`). One envelope for the whole API; a second
      shape would mean a second narrowing path in the generated client.
- [X] T024 [US1] Contract test in `backend/tests/contract/test_telemetry_endpoint.py`:
      `code` containing prose (`"could not reach the server"`) → `422`, and an unknown
      `operation` → `422`. These two tests are the enforcement of FR-006b.
- [X] T025 [US1] Contract test in `backend/tests/contract/test_telemetry_endpoint.py`:
      **with the sink unwritable, a valid body still returns `204`.** Reporting a failure
      must not produce one.
- [X] T026 [US1] Regenerate the client: `npm run generate:api` in `frontend/`. `schema.d.ts`
      is GENERATED — the new path must appear there by regeneration, never by hand. CI has a
      drift gate on this file.

### Browser side

- [X] T027 [US1] Create `frontend/src/api/telemetry.ts` exporting
      `report(operation, code, durationMs?): void`. Fire-and-forget: it returns `void`, not
      a promise, so no caller can await it into a user's critical path (FR-017). Its own
      `.catch(() => {})` swallows every failure including an unreachable server.
- [X] T028 [US1] Wire `report()` into the four `catch` clauses in
      `frontend/src/hooks/useTasks.ts` (`refetch`, `create`, `setCompleted`, `remove`),
      which currently discard the error object entirely. Send the operation and a code such
      as `NETWORK_UNREACHABLE` — **not** the caught error, whose message can contain a
      server response, a URL or a title.
- [X] T029 [US1] Wire `report()` into the four HTTP-error branches in
      `frontend/src/hooks/useTasks.ts` as well, using `error.error.code` from the envelope.
      The code is already a closed vocabulary; the `message` beside it is not and must not
      be sent.
- [X] T030 [P] [US1] Component test in `frontend/src/api/telemetry.test.ts`: `report()`
      posts to `/api/telemetry` with the expected body, returns synchronously, and **does
      not reject when the fetch rejects**.
- [X] T031 [P] [US1] Component test in **new** file `frontend/src/hooks/useTasks.test.ts`:
      a transport failure during `create` triggers exactly one report and **the user-facing
      `MutationResult` is unchanged**. There is no such file today — the hook is covered
      through the components — so this adds coverage without editing any existing test
      (FR-019, FR-020).
- [X] T032 [US1] E2E in `frontend/tests/e2e/telemetry.spec.ts`: trigger a server-side
      validation failure through the UI, then read the record from disk and assert the
      `failure` entry is present with its code and no user text.

**Checkpoint** — US1 is independently demonstrable: cause a failure, close the app, find
it in the file. The feature's entire reason for existing is satisfied here.

---

## Phase 4: User Story 2 — see how the application has been behaving (P2)

**Goal**: timings, feature counts and lifecycle events.

**Independent test**: use the app normally, then recover what happened and how long it took.

- [X] T033 [US2] Create `backend/src/taskflow/middleware.py` with an HTTP middleware timing
      every request via `time.perf_counter`, recording `method`, `status`, `duration_ms`
      and **`path_template`** — `/api/tasks/{task_id}`, read from
      `request.scope["route"].path`, never `request.url.path`. A literal path carries an
      identifier that is useless for aggregation and one step from carrying something that
      is not (FR-007).
- [X] T034 [US2] Register the middleware in `backend/src/taskflow/main.py`, **inside** CORS
      so that a 500 raised below it still leaves through the CORS layer. Ordering here has
      bitten this project before: a 500 raised above CORS carries no CORS headers and
      reaches the browser as an opaque transport error.
- [X] T035 [US2] Add a FastAPI `lifespan` to `backend/src/taskflow/main.py` recording
      `lifecycle` `startup` and `shutdown` (FR-009).
- [X] T036 [US2] Record `lifecycle` `migration_applied` with the target `revision` in
      `backend/migrations/env.py`. Must not break `alembic upgrade head` if the telemetry
      destination is unwritable — T009 already guarantees this; add the call, do not add a
      guard around it.
- [X] T037 [US2] Record `usage` entries in `backend/src/taskflow/services/tasks.py`:
      `task_created`, `task_completed`, `task_reopened`, `task_deleted`, `task_list_read`.
      **`set_completed` must not record when it is a no-op** — the early return for an
      unchanged state is not a feature use, and counting it would make SC-007 false for any
      client that re-sends the same value.
- [X] T038 [P] [US2] Unit test in `backend/tests/unit/test_telemetry_signals.py`: each of
      the four kinds produces an entry with the right `kind` and `operation`.
- [X] T039 [P] [US2] Unit test in `backend/tests/unit/test_telemetry_signals.py`: calling
      `set_completed(id, True)` twice produces **one** `task_completed` entry.
- [X] T040 [P] [US2] Contract test in `backend/tests/contract/test_telemetry_endpoint.py`:
      a request to `/api/tasks/{id}` records a `timing` entry whose `path_template` contains
      `{task_id}` and **does not contain the literal id**.
- [X] T041 [US2] E2E in `frontend/tests/e2e/telemetry.spec.ts`: perform a known sequence
      (3 created, 2 completed, 1 reopened, 1 deleted), then recover those counts from the
      record with a plain substring count and assert they match exactly (SC-007).

**Checkpoint** — the record is diagnostic, not merely a list of errors.

---

## Phase 5: User Story 3 — small, private, harmless (P3)

**Depends on US1 and US2** — see the note at the top of this file. The properties are
already implemented; this phase proves them across the real surface.

- [X] T042 [US3] E2E in `frontend/tests/e2e/telemetry.spec.ts` — **the privacy proof
      (FR-014, SC-003)**: create tasks whose titles are distinctive, improbable markers,
      exercise create / complete / reopen / delete / an induced failure, then read
      `telemetry.jsonl` **and `telemetry.jsonl.1`** and assert **zero** occurrences of each
      marker. This is the test that will actually catch a regression; the type filter and
      the coding discipline both rely on someone remembering.
- [X] T043 [US3] E2E in `frontend/tests/e2e/telemetry.spec.ts`: with
      `page.route('**/api/telemetry', r => r.abort())`, add, complete, reopen and delete a
      task through the UI — **all four succeed, nothing is announced about telemetry, and
      no error appears** (SC-004, browser half).
      Aborting the route is used rather than an unwritable path because Playwright starts
      the backend once per run from `playwright.config.ts`; a test cannot change that
      process's environment mid-suite. The server half of SC-004 is proved by T014, T025
      and T018a, which can make the destination unwritable directly.
- [X] T044 [US3] Point the E2E backend at a disposable record: add
      `TASKFLOW_TELEMETRY_PATH: 'e2e-telemetry.jsonl'` to the backend `webServer.env` in
      `frontend/playwright.config.ts`, beside the existing `TASKFLOW_DB_PATH`, and add the
      file to `.gitignore`.
- [X] T045 [US3] Reset that file in `frontend/tests/e2e/global-setup.ts` alongside the
      existing database reset — both `e2e-telemetry.jsonl` and `e2e-telemetry.jsonl.1` — so
      the counts asserted in T041 start from zero. Put it in `global-setup`, **not** chained
      onto the webServer command: chaining with `&&` silently skipped the migration once in
      this project and the failure surfaced as an unrelated transport error.
- [X] T046 [US3] Unit test in `backend/tests/unit/test_telemetry.py`: measure N `record()`
      calls with the destination writable and with it unwritable; assert the unwritable case
      is not slower (SC-005). A broken recorder that blocks is worse than no recorder.
- [X] T047 [US3] Verify SC-009 by inspection and record the result in this file: the only
      network request made for telemetry is `POST` to the same local origin the application
      already uses. Grep `frontend/src/` for any absolute URL other than the configured
      base.

**Checkpoint** — the feature is safe to leave running.

---

## Phase 6: Polish & gates

- [X] T048 Backend gates from `backend/`: `ruff check .`, `mypy --strict src/`, `pytest`,
      and `pytest tests/unit --cov=taskflow.services --cov-report=term-missing` ≥ 80%.
      Note that `telemetry.py` sits outside `services/` on purpose (plan.md § Structure
      Decision) — it is infrastructure, and pulling it into the domain-coverage gate would
      inflate that number for the wrong reason.
- [X] T049 Frontend gates from `frontend/`: `npm run lint`, **`npm run typecheck`**
      (never `npx tsc --noEmit`, which is vacuous here), `npm test`,
      `npm run check:contrast`, `npm run test:e2e`.
- [X] T050 Confirm FR-019 and SC-008: the T001 baseline counts all still pass, and
      `git diff --name-only` shows **no pre-existing test file modified at all**. The only
      test-adjacent files touched are `backend/tests/conftest.py` (T011, a new autouse
      fixture), `frontend/tests/e2e/global-setup.ts` (T045) and
      `frontend/playwright.config.ts` (T044) — infrastructure, not assertions. Every other
      new test lives in a new file.
- [X] T051 Confirm T004: `[project].dependencies` and `package.json` `dependencies` are
      unchanged. Zero new runtime dependencies is a Principle V claim this feature makes in
      plan.md.
- [X] T052 Update `CLAUDE.md`: current state table, the Observability gate (VII) from
      "⚠️ Nothing implements this yet" to satisfied, and add any gotcha this feature paid
      for to *Gotchas already paid for*.
- [X] T053 Update `README.md` with the telemetry record: where it lives, what it contains,
      what it never contains, and that nothing is transmitted.
- [X] T054 **Remove Principle VII from the Known exceptions block in
      `.specify/memory/constitution.md`.** It is the only remaining entry, so the block
      itself goes. A satisfied exception left in place is how this list stops being read —
      the same rule applied when `002-design-system` discharged Principle VI.
- [X] T055 Commit and push; confirm CI green on every gate.

---

## Dependencies

```
Phase 1 Setup
   └─> Phase 2 Foundational (the sink)          BLOCKING
          ├─> Phase 3 US1 (failures)            P1
          ├─> Phase 4 US2 (behaviour)           P2
          └─> Phase 5 US3 (proofs)   requires US1 AND US2
                 └─> Phase 6 Polish & gates
```

US1 and US2 are independent of each other and may be built in either order. US3 is not
independent — stated once at the top and repeated here so it is not discovered by surprise.

Within phases, `[P]` marks tasks in genuinely different files with satisfied dependencies.

## MVP scope

**Phase 1 + Phase 2 + Phase 3.** At that point a failure that happened yesterday can be
found today, which is the gap Principle VII was written about. Phases 4 and 5 make the
record useful and safe respectively; neither is what the principle is *for*.

## Baseline

Filled by T001 before any source file is touched.

Measured 2026-10-30, before any source file was touched.

| | Baseline | After 003 | Pre-existing still passing |
|---|---|---|---|
| Backend tests | 85 | **137** (+52) | 85/85 |
| Frontend component tests | 79 | **104** (+25) | 79/79 |
| E2E tests | 47 | **57** (+10) | 47/47 |
| Contrast measurements | 34 | **34** (unchanged) | 34/34 |

FR-019 and SC-008 hold. `git diff --name-only` shows **no existing test file modified** —
the only test-adjacent changes are `backend/tests/conftest.py` (a new autouse fixture),
`frontend/tests/e2e/global-setup.ts`, `frontend/playwright.config.ts` and the `test:e2e`
script, all infrastructure.

Dependencies: `backend/pyproject.toml` `[project].dependencies` and `frontend/package.json`
`dependencies` are **byte-identical** to the baseline (T004, T051). Zero new runtime
dependencies.

## Notes

- **Principle III is not engaged** and Principle VI is not engaged. No UI, no styling, no
  new interactive element, and therefore no manual screen-reader gate — the first feature
  in this repository without one. `npm run check:contrast` must still pass **unchanged**,
  since "unchanged" is precisely the claim being made.
- `schema.d.ts` is generated. T026 regenerates it; hand-editing it fails the CI drift gate
  and would be a Principle IV violation besides.
- The honest limitation, recorded rather than hidden: a browser failure caused by the
  server being unreachable cannot be reported to a server-side file. quickstart.md
  Scenario 2 states this plainly. Principle VII is satisfied for every browser failure
  except the one where the recorder itself is unreachable.


---

## Outcomes

### The gate was watched failing

T042 and the backend's `test_no_usage_entry_contains_the_task_title` were both verified by
deliberately recording a task title in `create_task` and confirming each failed, then
reverting. A gate nobody has watched fail is a gate nobody knows works — the same check
`002-design-system` applied to the contrast checker's four failure modes.

Both caught it, independently, from opposite ends of the stack.

### Three things that cost real time, now in CLAUDE.md

1. **`fileConfig` disables every existing logger.** Alembic's `env.py` calls
   `logging.config.fileConfig`, which defaults to `disable_existing_loggers=True` and
   switched `taskflow.telemetry` off in any process that had run a migration. The symptom
   was telemetry tests passing alone and failing in the full suite, with nothing in the
   record and no error anywhere. Now called with `disable_existing_loggers=False`. This
   would have silently disabled telemetry in production too.
2. **Playwright starts `webServer` before `globalSetup`.** The database survives this
   because nothing opens it until the first request. The telemetry record does not — the
   backend writes a `startup` entry in its lifespan — so `rmSync` failed with `EPERM`. The
   reset moved to `tests/e2e/reset-telemetry.mjs`, ahead of `playwright test`. Truncating
   in `global-setup` instead would have "worked" and silently destroyed the startup entry
   the suite asserts is present.
3. **`openapi-fetch` captures `globalThis.fetch` at client creation.** Stubbing `fetch`
   afterwards changes nothing; the first version of `telemetry.test.ts` failed for that
   reason. Spy on `api.POST` instead.

### Decisions taken in the author's absence

Four, each reversible, each flagged for review:

| # | Decision | Where |
|---|---|---|
| Q1 | Browser failures post to a new `POST /api/telemetry` | spec.md Clarifications |
| Q2 | JSON Lines beside the database | spec.md Clarifications |
| Q3 | Size cap with one rotated predecessor | spec.md Clarifications |
| Q4 | `task_updated` added to the vocabulary | api/operations.py — PATCH cannot be resolved into complete-vs-reopen without reading the body, and the body is where user content is. The service layer records the finer distinction once it legitimately knows. |

### Constitution v1.3.1

T054 removed Principle VII from Known exceptions, leaving the block empty. Two further
defects found while there, both corrected in the same PATCH:

- **Review said "five principles"** — stale since v1.2.0 and v1.3.0 added two more.
- **Definition of done cited `tsc --noEmit`** — which exits 0 on broken code in this
  repository, as CLAUDE.md has recorded since 001. It now cites `npm run typecheck` and
  says why.

### What Principle III did not get

No manual screen-reader pass. This is the first feature in the repository without one, and
it is because the feature renders nothing, styles nothing, and adds no interactive element
— Principle III is *not engaged* rather than *passed*. `npm run check:contrast` still runs
its 34 measurements and still passes, which is the claim being made.
