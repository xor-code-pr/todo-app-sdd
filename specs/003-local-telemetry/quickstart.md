# Quickstart: Local Telemetry

**Feature**: 003-local-telemetry | **Date**: 2026-10-30

How to prove this feature works. Every scenario below maps to a success criterion and is
runnable by hand.

## Prerequisites

Unchanged — no new dependency, no new tooling.

```bash
# backend/
pip install -e ".[dev]"
alembic upgrade head

# frontend/
npm ci
```

## Where the record lives

```
backend/telemetry.jsonl       beside taskflow.db
backend/telemetry.jsonl.1     the one retained predecessor
```

`TASKFLOW_TELEMETRY_PATH` overrides the location. The test suite sets it to a temporary
directory so a test run never writes into the developer's record.

---

## Scenario 1 — a failure survives the process (SC-001, US1)

```bash
start-dev.bat
# add a task with a 200-character title — the UI blocks it, the server also would
curl -X POST http://127.0.0.1:8000/api/tasks -H "Content-Type: application/json" \
     -d '{"title":"'"$(python -c "print('x'*200)")"'"}'
stop-dev.bat

grep '"kind":"failure"' backend/telemetry.jsonl
```

**Expect** a line with `"code":"TITLE_TOO_LONG"`, a timestamp, and the operation.
**Expect not** the 200 `x` characters — the length is recorded, the text is not.

The entry is still there after `stop-dev.bat`. That is the whole point of the feature.

## Scenario 2 — the browser's side of the story (SC-001, US1)

```bash
# start the UI only, with no backend
cd frontend && npm run dev
# load http://127.0.0.1:5173 — "Could not reach the server"
```

The browser cannot record this; it posts to `/api/telemetry`, which is also down, and the
report is lost. **That is correct and expected.** Now:

```bash
start-dev.bat                       # both up
# in the browser, stop the backend, then try to complete a task
```

**Expect** `"source":"browser"` in the record once the backend is reachable again.

This asymmetry is worth understanding rather than treating as a bug: a browser failure
caused by the server being down cannot reach a server-side file. Principle VII is satisfied
for every browser failure that is *not* "the recorder itself is unreachable".

## Scenario 3 — nothing a person typed (SC-003, US3) ← the important one

```bash
cd frontend && npx playwright test telemetry.spec.ts
```

The test creates tasks with distinctive titles, exercises every operation, then searches the
entire record — current file and rotated predecessor — for each title. **Zero matches
required.**

By hand:

```bash
# create a task titled: zzqqxx-unique-marker
grep -r 'zzqqxx-unique-marker' backend/telemetry.jsonl backend/telemetry.jsonl.1
# expect: no output, exit 1
```

## Scenario 4 — the recorder breaks, the app does not (SC-004, SC-005, US3)

```bash
TASKFLOW_TELEMETRY_PATH=/nonexistent/dir/telemetry.jsonl uvicorn taskflow.main:app
```

Then use the application normally: add, complete, reopen, delete.

**Expect** every operation to succeed, no error in the UI, no traceback in the console, and
no perceptible slowdown. This is FR-016 through FR-018, and it is the property most likely
to be broken by a later change — which is why it has its own tests rather than only this
scenario.

## Scenario 5 — the file stays bounded (SC-006, US3)

```bash
cd backend && pytest tests/unit/test_telemetry.py -k rotation -v
```

**Expect** `telemetry.jsonl` and `telemetry.jsonl.1`, no `.2`, and total size within roughly
twice the cap.

## Scenario 6 — counts are recoverable (SC-007, US2)

```bash
grep -c '"operation":"task_created"'   backend/telemetry.jsonl
grep -c '"operation":"task_completed"' backend/telemetry.jsonl
grep -c '"operation":"task_deleted"'   backend/telemetry.jsonl
```

**Expect** the numbers to match what was actually done. "Readable with ordinary tools"
(FR-004) means exactly this — `grep -c` is the acceptance test.

## Scenario 7 — timings and lifecycle (SC-002, US2)

```bash
grep '"kind":"lifecycle"' backend/telemetry.jsonl     # startup, shutdown, migration_applied
grep '"kind":"timing"'    backend/telemetry.jsonl | head -3
```

**Expect** every timing entry to carry `duration_ms`, and every entry of any kind to carry
`ts` and `operation` (SC-002).

## Scenario 8 — nothing leaves the machine (SC-009)

Open the browser's network panel and use the application for a full session.

**Expect** requests to `127.0.0.1:8000` only. The single telemetry request —
`POST /api/telemetry` — goes to the same local server. No other host appears.

---

## The full gate sweep

```bash
# backend/
ruff check . && mypy --strict src/ && pytest
pytest tests/unit --cov=taskflow.services --cov-report=term-missing   # ≥80%

# frontend/
npm run lint && npm run typecheck && npm test
npm run check:contrast        # unchanged — 34 measurements, no styling touched here
npm run generate:api          # schema.d.ts must regenerate cleanly with the new endpoint
npm run test:e2e
```

**All 85 backend, 79 component and 47 E2E tests must still pass** (FR-019, SC-008), plus the
new ones this feature adds.

`npm run typecheck` — never `npx tsc --noEmit`, which checks nothing here.
