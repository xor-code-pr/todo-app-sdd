---

description: "Task list for 001-todo-core"
---

# Tasks: Core Todo

**Input**: Design documents from `/specs/001-todo-core/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Required, not optional. Constitution Principle II is a binding gate — ≥80% coverage on
`services/`, one contract test per endpoint, one E2E test per user story. Authoring order is
deliberately free (write them before or after the code they cover), but nothing is done untested.

**Organization**: Foundation first, then one vertical slice per user story. Each slice carries its
own service logic, endpoint, components, tests and screen-reader pass. After Phase 3 the
application is demoable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, dependencies already satisfied
- **[Story]**: US1 / US2 / US3. Setup, Foundational and Polish tasks carry no story label.

## Path Conventions

Web application, two trees: `backend/src/taskflow/`, `frontend/src/`. Paths below are
repository-relative and exact.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring a repository and two toolchains into existence. Nothing exists yet — not
`package.json`, not `pyproject.toml`, not a git repository.

- [X] T001 Initialise git and create root `.gitignore` covering `__pycache__/`, `.pytest_cache/`, `.venv/`, `node_modules/`, `dist/`, `*.db`, `.coverage`, `playwright-report/`
- [X] T002 [P] Create `backend/pyproject.toml` with runtime deps (fastapi, uvicorn[standard], pydantic>=2, sqlalchemy>=2, alembic, regex) and dev deps (pytest, pytest-asyncio, pytest-cov, httpx, mypy, ruff); configure `[tool.mypy] strict = true`, `[tool.ruff]`, and `[tool.pytest.ini_options]`. `regex` is the only non-constitutional backend dependency and is justified in plan.md — do not add others.
- [X] T003 [P] Scaffold `frontend/` with Vite React-TS; set `"strict": true` in `frontend/tsconfig.json` and confirm `noUncheckedIndexedAccess` is on
- [X] T004 Create `frontend/eslint.config.js` with `eslint-plugin-jsx-a11y` at **error** severity (constitution Principle III — warnings are not acceptable). Depends on T003.
- [X] T005 [P] Configure Vitest + React Testing Library in `frontend/vite.config.ts` and `frontend/src/setupTests.ts`. Depends on T003.
- [X] T006 [P] Configure Playwright in `frontend/playwright.config.ts` with `@axe-core/playwright`. Set **two** `webServer` entries: the Vite dev server, **and uvicorn running against a disposable SQLite file** created fresh per run and torn down after. The constitution requires E2E to run "against a live frontend and a live backend with a disposable SQLite file" — Playwright talks to a live API, never a mock, so a Vite-only `webServer` leaves every E2E task (T036, T049, T061) with no backend to reach. Depends on T003.
- [X] T007 Create `.github/workflows/ci.yml` running gates in constitution order — lint → types → unit → contract → E2E/axe — plus a schema-drift step that regenerates `frontend/src/api/` and fails on a non-empty `git diff`. **This workflow will not execute until the repository has a GitHub remote**; every gate it runs must also be runnable by hand per quickstart.md. It will fail until Phase 2 completes — that is expected.

**Checkpoint**: Both toolchains install and their config files lint clean. No application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The database, the domain rules, the error envelope and the generated-client pipeline.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 Create `backend/src/taskflow/db.py` with the SQLAlchemy 2.0 engine, `sessionmaker`, and declarative `Base`; SQLite file path from an env var with a local default
- [X] T009 Create `backend/src/taskflow/models/task.py` — the `Task` model, `__tablename__ = "tasks"`, typed with `Mapped[]`. Columns exactly per data-model.md: `id: Mapped[int]` primary key autoincrement; `title: Mapped[str]` `String(600)` not null (storage ceiling only — **"The authoritative limit is `services/validation.py` and nowhere else"**); `created_at: Mapped[datetime]` not null; `completed_at: Mapped[datetime | None]` nullable default `None`. **No `is_completed` column** (research.md R2), no `owner_id`, no `priority`.
- [X] T010 Run `alembic init` into `backend/migrations/`; wire `env.py` to `Base.metadata` and the engine from T008. Add a comment recording that any future column alteration on SQLite must use `op.batch_alter_table()`.
- [X] T011 Generate the initial revision with `alembic revision --autogenerate -m "create tasks table"`, then **read the generated script before committing it**. Confirm the named `CHECK (length(trim(title)) > 0)` constraint `ck_tasks_title_not_blank` is present and add it by hand if autogenerate omitted it. Verify `alembic upgrade head` creates the table and `downgrade` drops it. Depends on T009, T010.
- [X] T012 [P] Create `backend/src/taskflow/services/errors.py` — `DomainError` base plus `TitleEmptyError`, `TitleTooLongError`, `TaskNotFoundError`, each carrying the stable `code` from contracts/api.md. No FastAPI imports.
- [X] T013 [P] Create `backend/src/taskflow/services/validation.py` — `normalise_title(raw: str) -> str`: trim leading/trailing whitespace, then enforce **1–150 grapheme clusters** counted with the `regex` package's `\X` (research.md R1). Raises `TitleEmptyError` / `TitleTooLongError`. Imports only `regex` and `errors` — no FastAPI, no Pydantic, no SQLAlchemy.
- [X] T014 [P] Write unit tests in `backend/tests/unit/test_validation.py` covering the boundaries: empty, whitespace-only, 1 char, **exactly 150 (accepted)**, 151 (rejected), a 151-char title ending in a space (valid after trim), internal whitespace preserved, and a 150×family-emoji title accepted — asserting clusters are counted, not code points. Depends on T013.
- [X] T015 Create `backend/src/taskflow/schemas/task.py` — `TaskCreate` (`title: str`, `@field_validator` **delegating to** `normalise_title`, not reimplementing it), `TaskUpdate` (`completed: bool` and **no `title` field** — its absence is how FR-007 is enforced), `TaskRead` (`id`, `title`, `completed` **derived** from `completed_at is not None`, `created_at`, `completed_at`), and `ErrorResponse`. Depends on T013.
- [X] T016 Create `backend/src/taskflow/main.py` — app factory, router mount point, CORS for the Vite dev origin, and exception handlers mapping **both** `RequestValidationError` and `DomainError` to the single envelope `{"error": {"code", "message", "field"}}` from contracts/api.md. Two error shapes would mean two narrowing paths in the generated client.
- [X] T017 [P] Configure stdlib `logging` in `backend/src/taskflow/main.py`: `WARNING` for expected rejections (422, 404) with method, path, status, error code and task id; `ERROR` with traceback for 5xx. **Task titles are never logged.** No `structlog`, no request-id correlation (Principle V). Depends on T016.
- [X] T018 [P] Create `backend/src/taskflow/api/deps.py` — the request-scoped session dependency. Depends on T008.
- [X] T071 Create `backend/tests/conftest.py` — the shared pytest fixtures every backend test layer depends on: an application fixture, an `httpx.AsyncClient` over `ASGITransport` for in-process contract tests, and a **disposable SQLite database per test** with the schema applied and torn down after. *(Added after `/speckit-analyze`: four contract tasks and three service-test tasks assumed this existed and no task built it. Without it the first contract test invents a fixture and the next two phases invent it differently.)* Depends on T011, T016, T018.
- [X] T019 Create `backend/scripts/export_openapi.py` — imports the app and writes `openapi.json` to stdout or a path **without starting a server**, so generation works in CI. Depends on T016.
- [X] T020 Add `"generate:api"` to `frontend/package.json` running T019 piped through `openapi-typescript` into `frontend/src/api/schema.d.ts`; install `openapi-typescript` (dev) and `openapi-fetch` (runtime); create the typed client wrapper in `frontend/src/api/client.ts`. Add `frontend/src/api/schema.d.ts` to the repo with a header comment marking it **generated output — never hand-edit**. Depends on T019.
- [X] T021 [P] Create `frontend/src/components/LiveRegion/` (component + CSS module, visually hidden) and `frontend/src/hooks/useAnnouncer.ts` exposing `announce(message)`. **Exactly one `aria-live="polite"` region exists in the application** — multiple regions interleave unpredictably (FR-020).
- [X] T022 Create `frontend/src/hooks/useTasks.ts` with `tasks`, `status`, `error` and a `refetch()` over `GET /api/tasks` only. Mutations are added by each story slice. Establishes the **mutate-then-refetch** contract from research.md R5 — no optimistic updates, no state library, no cache. Depends on T020.
- [X] T023 Create `frontend/src/App.tsx` shell mounting `LiveRegion` and a placeholder list region; wire `useTasks`. Depends on T021, T022.

**Checkpoint**: `alembic upgrade head` succeeds, the app boots, `/openapi.json` is emitted, and
`npm run generate:api` produces a committed, type-checking client. No endpoints yet.

---

## Phase 3: User Story 1 - Capture a task without leaving the keyboard (Priority: P1) 🎯 MVP

**Goal**: Add tasks from the keyboard, see them newest-first, never lose the cursor.

**Independent Test**: Load with an empty list, add three tasks using only the keyboard, confirm all
three appear newest-first with focus resting in the empty input after each.

### Tests for User Story 1

- [X] T024 [P] [US1] Contract test `backend/tests/contract/test_list_tasks.py` — `200`; body validates against the schema; ordering holds, including **two tasks created with an identical `created_at` ordering deterministically by `id DESC`** (FR-017). Assert the error envelope shape, not just status codes.
- [X] T025 [P] [US1] Contract test `backend/tests/contract/test_create_task.py` — `201` and body; trimming applied; `TITLE_EMPTY` on blank and whitespace-only; `TITLE_TOO_LONG` at 151; **accepted at exactly 150**; an emoji title near the boundary counts clusters not code points (FR-003).
- [X] T026 [P] [US1] Service tests `backend/tests/unit/test_tasks_service.py` for `list_tasks` and `create_task`, using an injected clock to stage identical `created_at` values. These run against a **real SQLite session** from the T071 fixtures, not a mock — the ordering expression leans on SQLite's own NULL semantics (research.md R3) and only a real engine exercises it. Depends on T027, T071.

### Implementation for User Story 1

- [X] T027 [US1] Create `backend/src/taskflow/services/tasks.py` — `list_tasks()` and `create_task()`. `create_task` calls `normalise_title` and assigns `created_at` from an **injectable clock** (`datetime.now(timezone.utc)` by default), never a database default, so tests can stage timestamp collisions. `list_tasks` issues the full four-key ordering from research.md R3: `ORDER BY (completed_at IS NULL) DESC, completed_at DESC, created_at DESC, id DESC` — write it complete now; it degenerates correctly while nothing is completed. **No FastAPI imports in this file.** Depends on T009, T013.
- [X] T028 [US1] Create `backend/src/taskflow/api/routers/tasks.py` with `GET /api/tasks` → `200 list[TaskRead]` and `POST /api/tasks` → `201 TaskRead`. Routers validate, delegate, serialise — no business rules, no queries. Register the router in `main.py`. Depends on T027, T015, T016.
- [X] T029 [US1] Run `npm run generate:api` and commit the regenerated `frontend/src/api/schema.d.ts`. The schema changed in T028; the CI drift gate (T007) fails otherwise. Depends on T028.
- [X] T030 [US1] Extend `frontend/src/hooks/useTasks.ts` with `create(title)` — await the response, then `refetch()`, then replace state. On failure retain the previous array untouched and surface the error (FR-025). Depends on T029.
- [X] T031 [P] [US1] Create `frontend/src/components/AddTaskForm/` — controlled `<input>` inside a `<form>` so Enter submits natively; live grapheme counter using `Intl.Segmenter({granularity:'grapheme'})`; **sends the raw untrimmed string** (the server is authoritative, research.md R1); submit **button** disabled while a request is in flight — never the input, so typing is uninterrupted (research.md R6); on success clear the input and return focus to it (FR-005); on failure show a visible error, announce it, and leave focus in the input (FR-004). Depends on T030.
- [X] T032 [P] [US1] Create `frontend/src/components/TaskList/` and `frontend/src/components/TaskItem/` rendering the array **verbatim, never sorting client-side**. ⚠️ **`TaskItem` must be keyed by `task.id`** — `key={task.id}`, never the array index. plan.md identifies this as the highest-risk detail in the feature: without a stable key React recreates the DOM node on reorder instead of moving it, focus falls to `<body>`, and SC-008 fails in Phase 4. Depends on T029.
- [X] T033 [US1] Add the empty-state message to `TaskList` for when no tasks exist, so the state is perceivable rather than inferred from blank space. Depends on T032.
- [X] T034 [P] [US1] Component tests `frontend/src/components/AddTaskForm/AddTaskForm.test.tsx` — submit clears and refocuses, blank submission blocked with announced error, counter reflects grapheme clusters, button disabled during flight. **Network faked at the boundary** — no component test performs a request. Depends on T031.
- [X] T035 [P] [US1] Component tests `frontend/src/components/TaskList/TaskList.test.tsx` — renders in received order, renders the empty state, assigns stable keys. Depends on T032, T033.
- [X] T036 [US1] E2E spec `frontend/tests/e2e/us1-capture.spec.ts` covering quickstart.md US1 steps 1–10, with an `@axe-core/playwright` assertion on the empty, populated and validation-error states. Depends on T031–T033.
- [ ] T037 [US1] **Manual screen-reader verification** (NVDA or VoiceOver) of US1. Listen for: each addition announced; the validation error announced, not just shown; the empty state perceivable; focus audibly remaining in the input across ten consecutive adds. While here, time a first task end to end against SC-002's 10-second target — the only success criterion that needs observation rather than a test. Record the result — Principle III makes this a gate, and automation catches roughly half of real barriers.

**Checkpoint**: 🎯 **MVP.** The application captures tasks and lists them newest-first. Demoable.

---

## Phase 4: User Story 2 - Mark a task done, and change your mind (Priority: P2)

**Goal**: Complete and revert tasks, with the list reordering under the user without losing them.

**Independent Test**: With five tasks, complete the third — it moves below all active tasks with a
strikethrough and focus is on it in its new position. Uncheck it and it returns chronologically.

### Tests for User Story 2

- [ ] T038 [P] [US2] Contract test `backend/tests/contract/test_update_task.py` — `200`; `completed` toggles both ways; `completed_at` set and cleared; **re-sending the current value does not refresh `completed_at`** (which would silently reorder the completed group); **sending `title` does not change the stored title** (FR-007); `404 TASK_NOT_FOUND` on an unknown id.
- [ ] T039 [US2] Extend `backend/tests/contract/test_list_tasks.py` with the completed-ordering assertions now reachable: every active task above every completed one (FR-009), and completed tasks ordered most-recently-completed first (FR-018). Depends on T041.
- [ ] T040 [P] [US2] Extend `backend/tests/unit/test_tasks_service.py` with `set_completed` cases against a real SQLite session: both transitions, idempotent no-op, and that reverting clears `completed_at` rather than retaining history. Depends on T041, T071.

### Implementation for User Story 2

- [ ] T041 [US2] Add `set_completed(task_id, completed)` to `backend/src/taskflow/services/tasks.py` — sets `completed_at` to now or to `None`. **Checks current state first and returns unchanged if it already matches**, so a no-op never refreshes the timestamp. Raises `TaskNotFoundError` for an unknown id. Depends on T027.
- [ ] T042 [US2] Add `PATCH /api/tasks/{id}` → `200 TaskRead` to `backend/src/taskflow/api/routers/tasks.py`. Depends on T041.
- [ ] T043 [US2] Run `npm run generate:api` and commit the regenerated client. Depends on T042.
- [ ] T044 [US2] Add `setCompleted(id, completed)` to `frontend/src/hooks/useTasks.ts`, following the same mutate-then-refetch contract. Depends on T043.
- [ ] T045 [US2] Add a **native `<input type="checkbox">`** to `TaskItem` bound to `task.completed`, with the strikethrough applied via CSS module on the completed state. ⚠️ **Do not add `aria-checked`** — the browser derives checkbox state, and a hand-managed attribute can only drift from the real one. Zero `role=` attributes (Principle III: native semantic HTML before ARIA). Depends on T044.
- [ ] T046 [US2] Implement the focus choreography in `frontend/src/components/TaskList/` (FR-021): hold a ref map keyed by task id; record the task's index **before** the refetch; in a `useLayoutEffect` after commit, `.focus()` the node and `.scrollIntoView({block:'nearest'})`; compare the new index to the recorded one and **announce the move only if it changed**. Announce the completion always. Not extracted into a shared hook — one call site, and Principle V says wait for the third. Depends on T045.
- [ ] T047 [P] [US2] Component tests `frontend/src/components/TaskItem/TaskItem.test.tsx` — checkbox reflects and toggles state, completion state is exposed without reference to the strikethrough, no `aria-checked` attribute is present. Depends on T045.
- [ ] T048 [P] [US2] Component test in `frontend/src/components/TaskList/TaskList.test.tsx` asserting focus lands on the moved task's checkbox after a reorder, and that **no move is announced when the index is unchanged**. Depends on T046.
- [ ] T049 [US2] E2E spec `frontend/tests/e2e/us2-complete.spec.ts` covering quickstart.md US2 steps 1–6, including the already-last-task case that must announce completion but not movement, with an axe assertion on the all-completed state. Depends on T045, T046.
- [ ] T050 [US2] **Manual screen-reader verification** of US2. Listen for: completion state conveyed **without** the strikethrough; the move announced when the task relocates; **silence about movement** when it does not move; focus landing on the same task after it travels, not on a neighbour.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Delete a task on purpose, never by accident (Priority: P3)

**Goal**: Permanent deletion behind a confirmation that cannot be triggered by a stray click.

**Independent Test**: Delete, cancel, confirm the task survives; delete, confirm, verify it is gone
and stays gone after a reload.

### Tests for User Story 3

- [ ] T051 [P] [US3] Contract test `backend/tests/contract/test_delete_task.py` — `204` with no body; the row is absent from a subsequent list; `404 TASK_NOT_FOUND` on an unknown id; `404` on deleting the same id twice.
- [ ] T052 [P] [US3] Extend `backend/tests/unit/test_tasks_service.py` with `delete_task` cases against a real SQLite session, including deletion of an unknown id. Depends on T053, T071.

### Implementation for User Story 3

- [ ] T053 [US3] Add `delete_task(task_id)` to `backend/src/taskflow/services/tasks.py` — removes the row, no tombstone, no soft-delete flag (FR-012). Raises `TaskNotFoundError`. Depends on T027.
- [ ] T054 [US3] Add `DELETE /api/tasks/{id}` → `204` to `backend/src/taskflow/api/routers/tasks.py`. Depends on T053.
- [ ] T055 [US3] Run `npm run generate:api` and commit the regenerated client. Depends on T054.
- [ ] T056 [US3] Add `remove(id)` to `frontend/src/hooks/useTasks.ts`, same mutate-then-refetch contract. Depends on T055.
- [ ] T057 [US3] Create `frontend/src/components/DeleteConfirmDialog/` using the **native `<dialog>` element with `.showModal()`** — this provides the focus trap, `Escape`-to-close and background inertness for free, where `role="dialog"` would mean reimplementing all three (Principle III). The dialog **names the task by title** (FR-013) — a bare "Are you sure?" gives a screen reader user no way to verify the target. On cancel or dismiss, return focus to the triggering delete button (FR-022). Depends on T056.
- [ ] T058 [US3] Add the delete button to `TaskItem` and wire it to the dialog. Depends on T057.
- [ ] T059 [US3] Implement the post-deletion focus destination in `TaskList` (FR-015): focus moves to a defined, still-existing element and **never to `<body>`** — including when the deleted task was the last one and the list is now empty. Depends on T058.
- [ ] T060 [P] [US3] Component tests `frontend/src/components/DeleteConfirmDialog/DeleteConfirmDialog.test.tsx` — opens with focus inside, names the task, Escape closes without deleting, cancel restores focus to the trigger, Tab cycles within the dialog. Assert that cancelling and dismissing both leave the task **entirely unchanged** (FR-014), not merely undeleted. Depends on T057.
- [ ] T061 [US3] E2E spec `frontend/tests/e2e/us3-delete.spec.ts` covering quickstart.md US3 steps 1–7, including deleting the last remaining task, with an axe assertion on the dialog-open state. Depends on T057–T059.
- [ ] T062 [US3] **Manual screen-reader verification** of US3. Listen for: the dialog announcing itself and **naming the task**; Escape and cancel both returning focus audibly to the delete button; the removal announced; focus landing somewhere real after the last task is deleted.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T063 Run `pytest tests/unit --cov=taskflow --cov-report=term-missing` and confirm **≥80% line coverage on `backend/src/taskflow/services/`** (Principle II). Measure on the service tests alone, matching quickstart.md gate 3 — running the whole suite would inflate the figure with coverage incidentally produced by contract tests, which is not what "coverage on domain logic" means. Add tests for any uncovered branch; do not lower the threshold.
- [ ] T064 [P] Verify `services/` imports no FastAPI symbol anywhere: `grep -r "fastapi" backend/src/taskflow/services/` must return nothing (constitution — domain logic is framework-free).
- [ ] T065 [P] Run the full gate sequence from quickstart.md in order — lint → types → unit → contract → schema-drift → E2E/axe — and confirm each passes locally. Depends on all story phases.
- [ ] T066 [P] Verify the cross-cutting checks in quickstart.md: 320 CSS pixel viewport and 200% zoom without horizontal scrolling (FR-023); backend stopped mid-operation converges on true state with the failure announced (FR-025); rapid double-activation of Add creates exactly one task (research.md R6); two tasks created in the same tick keep their order across a reload (FR-017); and tasks survive **a full application restart**, not just a page reload — stop uvicorn, restart it, confirm the list is intact (FR-024).
- [ ] T067 [P] Confirm `frontend/src/api/` contains only generated output and has no hand-edits: regenerate and verify `git diff --exit-code frontend/src/api/` is clean.
- [ ] T068 Update the **Current state** section of `CLAUDE.md` — it currently states the application is not scaffolded and that every command in it is aspirational. Replace with the real layout and verify each documented command actually runs.
- [ ] T069 [P] Confirm zero `role=` attributes and zero `aria-checked` attributes exist in `frontend/src/`; every semantic in this feature has a native element. Any exception requires written justification per Principle III.
- [ ] T072 Verify the **focus indicator meets AA contrast** on every interactive element — title input, Add button, each checkbox, each delete button, and both dialog buttons — in both the default and completed row states. Measure the contrast between the indicator and its adjacent background with a contrast tool; do not judge by eye. *(Added after `/speckit-analyze`: FR-019 requires "a visible focus indicator meeting AA contrast" and had no verification task. `axe-core` does not test focus-indicator contrast, so the existing automated gates would have passed a feature that fails this NON-NEGOTIABLE requirement.)*
- [ ] T070 Push to a GitHub remote and confirm `.github/workflows/ci.yml` (T007) executes and passes. Until this task is done the workflow is dormant and the gates are hand-run only.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies — starts immediately
- **Phase 2 Foundational**: Depends on Phase 1 — **blocks all user stories**
- **Phase 3 US1 (P1)**: Depends on Phase 2. Delivers the MVP.
- **Phase 4 US2 (P2)**: Depends on Phase 2. Independently testable, but T039 extends a US1 test file and T041 extends the US1 service file.
- **Phase 5 US3 (P3)**: Depends on Phase 2. Independently testable; touches the same service and router files as US1/US2.
- **Phase 6 Polish**: Depends on every story phase intended for this release.

### Story Independence — an honest note

The three stories are independently *testable* and independently *demoable*, which is what the
spec's structure requires. They are not independently *editable*: all three add methods to
`services/tasks.py`, routes to `routers/tasks.py` and mutations to `useTasks.ts`. Two developers
working Phase 4 and Phase 5 in parallel will collide in those three files. With one developer,
run the phases in priority order and the question does not arise.

### Within Each Story

Service → endpoint → regenerate client → hook → components → component tests → E2E → screen reader.
The regeneration step is not optional housekeeping: skipping it fails the CI drift gate and leaves
the frontend typed against a stale schema.

**Test tasks are grouped at the top of each phase for readability, not to mandate authoring
order.** Principle II deliberately leaves order free, so T026, T040 and T052 each declare a
dependency on the implementation they cover and may be written before or after it. Their position
in the list is presentational; the dependency is the real constraint.

### Parallel Opportunities

- **Phase 1**: T002 and T003 (separate trees); then T005 and T006 after T003
- **Phase 2**: T012, T013 together; T017, T018, T021 together once their dependencies land
- **Phase 3**: T024 and T025 together; T031 and T032 together; T034 and T035 together
- **Phase 4**: T038 and T040 together; T047 and T048 together
- **Phase 5**: T051 and T052 together
- **Phase 6**: T064, T065, T066, T067, T069 all together

---

## Parallel Example: User Story 1

```bash
# Contract tests for US1 — independent files, no shared state:
Task: "Contract test for GET /api/tasks in backend/tests/contract/test_list_tasks.py"
Task: "Contract test for POST /api/tasks in backend/tests/contract/test_create_task.py"

# Components for US1 — separate directories:
Task: "AddTaskForm in frontend/src/components/AddTaskForm/"
Task: "TaskList and TaskItem in frontend/src/components/TaskList/, TaskItem/"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1
4. **STOP and VALIDATE**: run the US1 scenarios from quickstart.md by keyboard and with a screen
   reader. The application captures tasks and lists them newest-first.
5. Demo.

### Incremental Delivery

Foundation → US1 (MVP, demo) → US2 (demo) → US3 (demo) → Polish. Each story adds value without
breaking the previous one. Stop at any checkpoint.

---

## Notes

- **72 tasks.** `/speckit-analyze` was run on 2026-10-29; all ten findings were remediated. T071
  and T072 are post-analysis additions and carry out-of-sequence IDs deliberately — renumbering
  would have invalidated roughly forty dependency references for no gain.
- Test authoring order is free (Principle II), but no task is done until its tests exist and pass.
- Never skip, xfail or delete a test to reach green. Fix the code or amend the spec.
- `frontend/src/api/` is generated. Regenerate; never hand-edit.
- The manual screen-reader tasks (T037, T050, T062) are gates, not suggestions. Automation catches
  roughly half of real accessibility barriers.
