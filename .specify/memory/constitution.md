# TaskFlow Constitution

## Core Principles

### I. Spec-Driven Delivery (NON-NEGOTIABLE)

Specification precedes implementation. Every unit of work MUST originate from a
`spec.md` describing observable behaviour and acceptance criteria, pass through a
`plan.md` recording technical approach, and decompose into a `tasks.md` before any
production code is written.

Implementation code MUST NOT be written for work that has no corresponding task entry.
When reality contradicts the spec mid-build, the spec is amended first and the change is
recorded — the code does not silently diverge.

Rationale: This project exists to practise spec-driven development. Allowing code to run
ahead of the spec defeats the only purpose the repository has.

### II. Test-Backed Delivery

No feature is complete without tests. Tests MAY be written before or after the
implementation they cover — authoring order is deliberately left to the engineer — but no
feature merges without them.

Binding gates:

- Domain logic MUST hold at least 80% line coverage on both the React and Python sides.
- Every HTTP endpoint MUST have a contract test asserting its request and response shape
  against the generated OpenAPI schema.
- Every user story in a `spec.md` MUST have at least one end-to-end test exercising it
  through the real UI against a running API.
- A failing test suite blocks merge. Tests MUST NOT be skipped, xfailed, or deleted to
  achieve green; fix the code or amend the spec.

Rationale: Strict red-green-refactor was considered and rejected as too costly across a
two-language stack while contract testing is still being learned. The coverage and
contract gates preserve the safety net without dictating keystroke order.

### III. Accessibility Is a Release Gate (NON-NEGOTIABLE)

The frontend MUST conform to WCAG 2.2 Level AA. Accessibility is a build-breaking
condition, not a review suggestion.

Binding gates:

- `axe-core` MUST report zero violations across all E2E-covered pages. Violations fail CI.
- `eslint-plugin-jsx-a11y` MUST run at `error` severity; warnings are not acceptable.
- Every interactive affordance MUST be operable by keyboard alone, with a visible focus
  indicator meeting AA contrast. No action may be mouse-only or pointer-only.
- Native semantic HTML MUST be preferred over ARIA. An ARIA attribute is permitted only
  where no native element expresses the semantic, and its use MUST be justified in review.
- Dynamic changes (task added, completed, deleted, errors) MUST be announced to assistive
  technology via an appropriate live region.
- Each user story MUST be verified manually with a screen reader (NVDA or VoiceOver)
  before it is marked done. Automated checks catch roughly half of real barriers; they do
  not substitute for this.

Rationale: Accessibility retrofitted is accessibility not done. Enforcing it at the gate
means the cost is paid per-component, while the component is still small.

### IV. Typed Contracts End to End

Type safety MUST be unbroken from database row to rendered DOM node.

- TypeScript runs in `strict` mode. `any` is prohibited; `unknown` with narrowing is the
  permitted escape hatch. `@ts-expect-error` requires an inline justification comment.
- Python runs under `mypy --strict`. All function signatures MUST be annotated.
- All API request and response bodies MUST be defined as Pydantic v2 models. The frontend
  client types MUST be generated from the emitted OpenAPI schema, never hand-written.
- A schema change that breaks the generated client MUST fail CI rather than surface at
  runtime.

Rationale: Two languages meeting over HTTP is exactly where silent drift lives. A
generated client makes the contract the single source of truth and turns a class of
integration bugs into compile errors.

### V. Simplicity and YAGNI

Build what the current spec requires and nothing beyond it.

- No abstraction may be introduced for a single call site. Wait for the third occurrence.
- No dependency may be added without recording, in `plan.md`, what it provides and why the
  standard library or existing dependencies are insufficient.
- No state management library, caching layer, or background worker may be added until a
  specific documented problem demands it.
- Speculative generality — configuration nobody sets, hooks nobody calls, interfaces with
  one implementor — MUST be removed on sight.

Rationale: A TODO application is small by nature. Complexity added here is complexity added
for its own sake, and it obscures the spec-driven workflow this project exists to teach.

## Technology Stack and Constraints

The following stack is binding. Substituting any element requires a constitutional
amendment under Governance, not merely a decision recorded in `plan.md`.

**Frontend**

- React 18 with TypeScript in `strict` mode
- Vite as build tool and dev server
- CSS Modules for styling — no component library, no CSS-in-JS runtime
- Vitest with React Testing Library for unit and component tests
- Playwright with `@axe-core/playwright` for E2E and accessibility assertions
- ESLint with `eslint-plugin-jsx-a11y` at `error` severity

**Backend**

- Python 3.11 or newer
- FastAPI served by Uvicorn
- Pydantic v2 for all validation and serialisation
- SQLAlchemy 2.0 for data access, Alembic for migrations
- pytest with `httpx.AsyncClient` for unit, integration, and contract tests
- mypy in `--strict` mode

**Data and Authentication**

- SQLite, file-based, as the sole datastore
- Alembic migrations are mandatory — no schema change applied by hand, ever
- No authentication and no user accounts. The application serves a single local user, and
  todo records MUST NOT carry an owner column in anticipation of multi-user support.

**Explicitly out of scope** until amended: server-side rendering, Next.js, any
Node.js backend, PostgreSQL, Docker, JWT or session authentication, real-time sync,
mobile or native clients, and third-party analytics.

Testing boundaries: component tests MUST NOT reach the network — the API is faked at the
boundary. Contract tests MUST run against the real FastAPI application via an in-process
transport. E2E tests MUST run against a live frontend and a live backend with a disposable
SQLite file.

## Development Workflow and Quality Gates

**Workflow order.** `/speckit-specify` → `/speckit-clarify` (when the spec has open
questions) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Steps MUST NOT be
skipped. `/speckit-analyze` SHOULD be run before implementation begins on any feature
spanning more than ten tasks.

**Definition of done.** A task is done only when all of the following hold:

1. Its acceptance criteria in `spec.md` are demonstrably met.
2. Tests exist per Principle II and the full suite passes.
3. `tsc --noEmit` and `mypy --strict` both report zero errors.
4. ESLint and Ruff report zero errors.
5. `axe-core` reports zero violations on every affected page.
6. The affected flow has been exercised with a keyboard only, and with a screen reader.

**Gate ordering.** Fast checks run first — lint, then types, then unit, then contract,
then E2E and accessibility. A failure at any stage halts the pipeline; later stages do not
run against a known-broken build.

**Review.** Every change MUST be checked against each of the five principles above before
it is accepted. A reviewer who cannot identify which principle a piece of complexity serves
MUST request its removal. Deviations are not approved informally; they require either a
spec amendment or a constitutional amendment.

## Governance

This constitution supersedes all other development practices, conventions, and preferences
in this repository. Where `CLAUDE.md`, a template, or an agent instruction conflicts with
this document, this document wins, and the conflicting file MUST be corrected.

**Amendment procedure.** Amendments are proposed as an edit to this file accompanied by a
written rationale and, where the change invalidates existing code, a migration note
describing what must be updated. An amendment takes effect only once this file is updated
with a new version number and an amendment date.

**Versioning policy.** This document follows semantic versioning:

- MAJOR — a principle is removed or redefined in a backward-incompatible way, or a stack
  element in a binding section is replaced.
- MINOR — a new principle or section is added, or existing guidance is materially expanded.
- PATCH — clarification, rewording, or typo correction that does not change what is
  permitted or required.

**Compliance review.** Principle adherence is verified at every review, and this
constitution is re-read at the start of each feature's `/speckit-plan` step. The
Constitution Check section of `plan.md` MUST cite the specific principles a plan engages.
Any complexity the plan introduces MUST be justified there against Principle V, or dropped.

`CLAUDE.md` at the repository root carries runtime development guidance — commands, layout,
and working conventions. It elaborates this constitution and MUST NOT contradict it.

**Version**: 1.1.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-29
