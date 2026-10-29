# Quickstart & Validation: Core Todo

**Feature**: 001-todo-core | **Date**: 2026-10-29

How to run the feature and prove it works. Commands describe the **intended** layout — none of it
exists until `/speckit-implement` builds it. Verify before reporting any of this as working.

---

## Prerequisites

| | |
|---|---|
| Python | 3.11+ |
| Node | 26 — see `.nvmrc`; CI pins the same |
| Browser | Evergreen, with `Intl.Segmenter` — Chrome 87+, Safari 14.1+, Firefox 125+ (research.md R1) |
| Screen reader | NVDA (Windows) or VoiceOver (macOS) — required for sign-off, not optional |

---

## First run

```bash
# Backend — from backend/
pip install -e ".[dev]"
alembic upgrade head              # creates the SQLite file and the tasks table
uvicorn taskflow.main:app --reload    # http://127.0.0.1:8000
```

```bash
# Frontend — from frontend/
npm install
npm run generate:api              # regenerates src/api/ from the emitted schema
npm run dev                       # http://127.0.0.1:5173
```

`npm run generate:api` runs `python ../backend/scripts/export_openapi.py` and pipes the result
through `openapi-typescript`. It does **not** need a running server — the schema is produced by
importing the app, so generation works in CI.

`src/api/` is generated output. Never hand-edit it; edit the Pydantic models and regenerate.

---

## Verification gates

Run in this order — fast checks first, so a failure stops the pipeline before the slow stages
(constitution, Development Workflow and Quality Gates).

```bash
# 1. Lint
cd frontend && npm run lint          # ESLint, jsx-a11y at error
cd backend  && ruff check .

# 2. Types
cd frontend && npx tsc --noEmit      # strict, no `any`
cd backend  && mypy --strict src/

# 3. Unit + component
cd backend  && pytest tests/unit --cov=taskflow --cov-report=term-missing   # ≥80% on services/
cd frontend && npm test

# 4. Contract
cd backend  && pytest tests/contract

# 5. Schema drift — must produce no diff
cd frontend && npm run generate:api && git diff --exit-code src/api/

# 6. E2E + accessibility — needs BOTH servers running
cd frontend && npm run test:e2e
```

Gate 5 is the mechanism behind the constitution's requirement that a schema change breaking the
generated client fails CI rather than surfacing at runtime. A non-empty diff means someone changed
a Pydantic model without regenerating.

---

## Scenario validation

Each maps to a user story. Every scenario must pass **twice**: once by keyboard alone, once with a
screen reader running. Automated checks catch roughly half of real barriers.

### US1 — Capture a task (P1)

1. Load the app with an empty list. Confirm the empty-state message is present and announced.
2. Tab to the title input. Type `Buy milk`. Press Enter.
3. **Expect**: the task appears at the top; the input is empty; **focus is still in the input**;
   the addition is announced.
4. Without touching the mouse, type `Call the dentist` and press Enter. Repeat eight more times.
5. **Expect**: ten tasks, newest first, focus never left the input (SC-001).
6. Submit an empty field, then a field of only spaces. **Expect**: no task created, a visible
   error, the error announced, focus still in the input (FR-004).
7. Paste 151 characters. **Expect**: submission blocked, the limit and current count shown.
8. Enter exactly 150 characters. **Expect**: accepted.
9. Enter `👨‍👩‍👧‍👦` 150 times. **Expect**: accepted — clusters are counted, not code points (FR-003).
10. Enter `  Buy milk  `. **Expect**: stored and displayed as `Buy milk` (FR-002).

### US2 — Complete and revert (P2)

1. With five tasks, check the third.
2. **Expect**: strikethrough applied; the task moves below every active task; **focus is on that
   same task's checkbox in its new position**; the position is scrolled into view; completion and
   movement are both announced (FR-021).
3. Uncheck it. **Expect**: strikethrough removed; the task returns to its chronological position
   among active tasks; focus follows; the move is announced (FR-010).
4. Complete every task but one, then complete the last active task — the one already at the bottom
   of the active group. **Expect**: completion announced, **no movement announced** (FR-021).
5. Complete three tasks in sequence. **Expect**: completed group ordered most-recently-completed
   first (FR-018).
6. With a screen reader, navigate the list. **Expect**: each task's completion state is conveyed
   without reference to the strikethrough (FR-011, SC-007).

### US3 — Delete with confirmation (P3)

1. Activate delete on a task. **Expect**: a dialog opens, takes focus, and **names the task**.
2. Press Tab repeatedly. **Expect**: focus cycles inside the dialog and never reaches the list.
3. Press Escape. **Expect**: dialog closes, task intact, **focus back on its delete button**.
4. Reopen and cancel. **Expect**: same as above.
5. Reopen and confirm. **Expect**: task gone, removal announced, focus on a predictable element —
   never on `<body>` (FR-015, SC-008).
6. Delete the last remaining task. **Expect**: empty state, focus somewhere that still exists.
7. Reload. **Expect**: deleted tasks stay deleted (FR-024).

### Cross-cutting

| Check | Expect | Spec |
|---|---|---|
| axe on empty, populated, error, dialog-open, all-completed | Zero violations in all five | SC-003 |
| Every interactive element via keyboard | Visible focus indicator at AA contrast | FR-019 |
| Viewport at 320 px, and at 200% zoom | No horizontal scrolling | FR-023 |
| Stop the backend, then complete a task | Error announced; list reverts to true state | FR-025 |
| Double-activate Add rapidly | Exactly one task (research.md R6) | — |
| Two tasks created in the same tick, then reload | Order unchanged | FR-017 |

---

## Definition of done

From the constitution. A task is done only when **all** hold:

- [ ] Acceptance criteria in `spec.md` demonstrably met
- [ ] Tests exist per Principle II and the full suite passes
- [ ] `tsc --noEmit` and `mypy --strict` both clean
- [ ] ESLint and Ruff both clean
- [ ] `axe-core` reports zero violations on every affected page
- [ ] Flow exercised by keyboard only **and** with a screen reader
