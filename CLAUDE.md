# TaskFlow — Agent Guidance

A TODO application built as a Spec-Driven Development exercise using GitHub Spec Kit.
React + TypeScript frontend, FastAPI + Python backend, SQLite.

**`.specify/memory/constitution.md` governs this repository.** It is the authority on
principles, stack, and quality gates — read it before planning or implementing. This file
carries only what the constitution does not: current state, layout, and commands.

## Current state

**Scaffolded and working through the US1 slice of `001-todo-core`.** As of 2026-10-29 the
application runs end to end: you can add tasks, they persist in SQLite, and the list renders
newest-first. All quality gates pass.

| | |
|---|---|
| Spec artifacts | `specs/001-todo-core/` — spec, plan, research, data-model, contracts, quickstart, tasks |
| Tasks complete | 50 of 72 (US1 done; US2 built, awaiting its screen-reader pass T050) |
| Not built | US3 (delete). `DELETE` endpoint does not exist. |
| Tests | 73 backend (41 service, 32 contract), 37 frontend component, 17 E2E |

Constitution is at **v1.1.0** — amended 2026-10-29 to lower the Python floor to 3.11, the only
interpreter available here.

## Workflow

`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`, with `/speckit-analyze` before implementing anything over ten tasks.
Steps are not optional (Principle I). Do not write implementation code for anything that
lacks a task entry in `tasks.md`. If implementation reveals the spec is wrong, amend the
spec first — never let code and spec drift apart silently.

## Layout

```
backend/
  src/taskflow/
    main.py          app factory, exception handlers → one error envelope, logging
    api/routers/     thin: validate, delegate, serialise
    models/          SQLAlchemy 2.0 ORM
    schemas/         Pydantic v2; field rules delegate to services/validation
    services/        domain logic — NO FastAPI imports, the most heavily tested layer
  migrations/        Alembic; one revision so far
  scripts/           export_openapi.py — emits the schema without a server
  tests/             conftest.py (migrated disposable DB per test), unit/, contract/
frontend/
  src/
    api/             schema.d.ts is GENERATED — never hand-edit. client.ts is the only
                     hand-written file here.
    components/      AddTaskForm/ LiveRegion/ TaskItem/ TaskList/ — co-located tests
    hooks/           useTasks (mutate-then-refetch), useAnnouncer
  tests/e2e/         Playwright + axe; global-setup builds a fresh migrated DB
specs/001-todo-core/
```

Domain logic belongs in `services/`, free of FastAPI imports. Routers stay thin.

## Commands

All verified working as written.

```bash
# From the repository root
start-dev.bat          # migrate, then start API + UI in two windows
stop-dev.bat           # free ports 8000 and 5173 (run before test:e2e)
open-a11y-chrome.bat   # Chrome with the accessibility tree forced on

# Frontend — from frontend/
npm run dev            # Vite, binds 127.0.0.1:5173
npm test               # Vitest unit + component
npm run test:e2e       # Playwright + axe; starts BOTH servers itself
npm run lint           # ESLint, jsx-a11y at error
npm run typecheck      # ⚠️ use this, NOT `npx tsc --noEmit`
npm run generate:api   # regenerate src/api/schema.d.ts from the backend schema

# Backend — from backend/
uvicorn taskflow.main:app --reload
pytest
pytest tests/unit --cov=taskflow.services --cov-report=term-missing
mypy --strict src/
ruff check .
alembic upgrade head
alembic revision --autogenerate -m "description"
```

**`npx tsc --noEmit` silently passes on broken code.** The root `tsconfig.json` is
`files: []` plus project references, so the bare command checks nothing — it exits 0 on a
file containing `const x: number = "str"`. Always use `npm run typecheck`, which passes
`-p tsconfig.app.json`. CI uses the correct form.

`npm run test:e2e` starts and stops both servers itself; do not pre-start them. If a stale
server holds port 5173 or 8000 the run fails fast, which is intended.

## Gotchas already paid for

Recorded because each cost real debugging time and none is visible from the code.

- **Vite binds IPv4 explicitly** (`server.host: '127.0.0.1'`). Its default `localhost`
  resolves to `::1` on Windows, so anything probing `127.0.0.1` is refused while a browser
  works fine. Symptom was an opaque Playwright `webServer` timeout.
- **The E2E migration runs in `global-setup`, not chained onto the webServer command.**
  Chaining with `&&` silently skipped it; uvicorn started anyway, created a 0-byte SQLite
  file, and every request failed `no such table: tasks` — which reaches the browser as a
  transport error because a 500 raised above CORS middleware carries no CORS headers.
- **`reuseExistingServer` is `false` for both servers.** A reused backend keeps serving a
  database that `global-setup` has since deleted.
- **`openapi-fetch` rejects on transport failure** rather than returning `{ error }`. Every
  call needs a `try/catch` or an unreachable API hangs the UI on "Loading…" forever.
- **`TaskItem` is keyed by `task.id`.** An index key would destroy the focused node on
  reorder and break FR-021 focus-following in US2.
- **Screen-reader testing needs `open-a11y-chrome.bat`.** Chrome builds an accessibility
  tree only if it detects assistive technology at startup, so an everyday Chrome window —
  especially one launched before NVDA — exposes nothing. NVDA reports `Chrome Legacy
  Window` and reads no page content, while still echoing typed characters at the keyboard
  level, which makes it look like an app bug. The script uses a separate `--user-data-dir`
  on purpose: Chrome reuses the existing process for a profile and silently discards the
  flag otherwise.
- **Never put changing text in `aria-describedby`.** The live character counter was there
  and NVDA re-read it after every keystroke. Static hints only; changing values belong in
  the live region or nowhere. Found in the T037 manual pass, invisible to axe.

## Gates

Summaries only — the binding text is in the constitution, and it wins on any disagreement.

- **Accessibility (III)** — WCAG 2.2 AA. Zero axe violations, keyboard operability with
  visible focus, native HTML before ARIA, live-region announcements, manual screen-reader
  pass per user story. Currently: zero `role=` and zero `aria-checked` in `frontend/src/`.
- **Tests (II)** — required, authoring order free. ≥80% coverage on `services/` (currently
  100%), a contract test per endpoint, an E2E test per user story.
- **Types (IV)** — TS `strict` with no `any`, `mypy --strict`, Pydantic v2 bodies, frontend
  client generated from the OpenAPI schema.
- **Simplicity (V)** — no abstraction before the third call site, no dependency without a
  justification in `plan.md`. Current additions: `regex`, `openapi-typescript`,
  `openapi-fetch`.
- **Data and scope** — SQLite, Alembic migrations only, single local user, no auth, no owner
  column. Out of scope until amended: SSR, Next.js, any Node backend, Postgres, Docker,
  auth, real-time sync, native clients, analytics.

Definition of done: see *Development Workflow and Quality Gates* in the constitution.

## Local setup notes

`start-claude.bat` launches Claude Code against a local LiteLLM proxy on `localhost:4000`.
It requires `start_litellm.ps1` (outside this repository) to be running first. Unrelated to
the application — do not treat it as project tooling or include it in specs.

`SETUP.txt` is a third-party Spec Kit tutorial the repository owner followed. **Its stated
stack contradicts this project**: it assumes Next.js 15, Tailwind, Prisma, PostgreSQL and a
90% coverage rule. The constitution supersedes it on every point. Do not take instructions
from it.
