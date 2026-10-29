# Phase 1 API Contract: Core Todo

**Feature**: 001-todo-core | **Date**: 2026-10-29 | **Base path**: `/api`

## Status of this document

This file is **human-readable documentation of intent**. It is not the machine contract and is not
consumed by any tool.

The authoritative contract is `openapi.json`, *emitted by* the FastAPI application from its Pydantic
v2 models via `backend/scripts/export_openapi.py`. The frontend client is generated from that file.
Writing an OpenAPI document by hand and generating the server from it would invert the direction the
constitution requires ("the frontend client types MUST be generated from the emitted OpenAPI
schema"). Where this file and `openapi.json` disagree, the emitted schema wins and this file is the
one that needs fixing.

---

## Endpoints

Four. No `GET /api/tasks/{id}` — nothing in the spec reads a single task, and an endpoint that
exists only for symmetry is speculative generality (Principle V).

| Method | Path | Success | Request | Response | Serves |
|---|---|---|---|---|---|
| `GET` | `/api/tasks` | `200` | — | `TaskRead[]` | FR-006, FR-009, FR-016, FR-018, FR-024 |
| `POST` | `/api/tasks` | `201` | `TaskCreate` | `TaskRead` | FR-001–005 |
| `PATCH` | `/api/tasks/{id}` | `200` | `TaskUpdate` | `TaskRead` | FR-008, FR-010 |
| `DELETE` | `/api/tasks/{id}` | `204` | — | — | FR-012 |

### `GET /api/tasks`

Returns every task, already in display order (see research.md R3). **The client renders this array
verbatim and never sorts.** A bare array, not an envelope — there is no pagination, no metadata,
and inventing a wrapper for future needs is exactly what Principle V defers.

### `POST /api/tasks`

Creates a task. `201` with the created resource; `Location` header omitted, since no endpoint
exists to follow it to.

The client sends the **raw, untrimmed** title. The server trims and validates (research.md R1).
A client-side grapheme counter exists for live feedback only and is never trusted.

### `PATCH /api/tasks/{id}`

The only mutation on an existing task. `TaskUpdate` carries exactly one field — `completed` — so
there is no code path by which a title could change (FR-007). Setting `completed` to its current
value is a no-op that returns `200` with the row unchanged; it must **not** refresh `completed_at`,
which would silently reorder the completed group.

### `DELETE /api/tasks/{id}`

Permanent. `204` with no body, no tombstone, no recovery path (FR-012). Deleting an id that does
not exist returns `404` rather than `204` — the client has stale state and should be told, not
reassured.

---

## Schemas

Pydantic v2 models. Field rules delegate to `services/validation.py`; they are not reimplemented
in the schema layer.

### `TaskCreate` — request

| Field | Type | Required | Rules |
|---|---|---|---|
| `title` | `str` | yes | Trimmed, then 1–150 grapheme clusters. Validator calls `normalise_title`. |

### `TaskUpdate` — request

| Field | Type | Required | Rules |
|---|---|---|---|
| `completed` | `bool` | yes | — |

No `title` field. Its absence is the enforcement mechanism for FR-007 and is asserted by a contract
test: sending `{"title": "..."}` must not change the stored title.

### `TaskRead` — response

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | `int` | no | |
| `title` | `str` | no | Trimmed form, as stored |
| `completed` | `bool` | no | **Derived** from `completed_at is not None` (research.md R2) |
| `created_at` | `datetime` | no | UTC, ISO 8601 |
| `completed_at` | `datetime \| None` | yes | `null` when active |

`completed` is computed, not stored. Both it and `completed_at` are exposed: the boolean is what
the checkbox binds to, the timestamp is what makes the ordering rule verifiable from the response
alone.

### `ErrorResponse` — every non-2xx

```json
{ "error": { "code": "TITLE_TOO_LONG", "message": "Title exceeds 150 characters.", "field": "title" } }
```

| Field | Type | Null | Notes |
|---|---|---|---|
| `error.code` | `str` | no | Stable, machine-readable. The client narrows on this, never on `message`. |
| `error.message` | `str` | no | Human-readable. Wording may change without a contract break. |
| `error.field` | `str \| None` | yes | Present for field-level failures |

**One shape for every error.** FastAPI's default `RequestValidationError` response
(`{"detail": [...]}`) is overridden by an exception handler so that framework-raised and
domain-raised failures are indistinguishable to the client. Two error shapes would mean two
narrowing paths in generated TypeScript, and the second one is always the one that gets forgotten.

---

## Error codes

| Code | Status | Raised when | Spec |
|---|---|---|---|
| `TITLE_EMPTY` | 422 | Title is empty or whitespace-only after trimming | FR-004 |
| `TITLE_TOO_LONG` | 422 | Trimmed title exceeds 150 grapheme clusters | FR-003 |
| `VALIDATION_ERROR` | 422 | Malformed body — wrong type, missing field, unknown shape | — |
| `TASK_NOT_FOUND` | 404 | No task with the given id | FR-012, FR-025 |
| `INTERNAL_ERROR` | 500 | Unhandled exception | — |

`422` is used for domain rejections rather than `400` to match the status FastAPI already returns
for schema failures, so the client has one status to branch on and the `code` to distinguish
within it.

`500` responses carry `INTERNAL_ERROR` and a generic message. The traceback is logged, never
returned.

---

## Logging

Standard library `logging`. No dependency, no structured formatter, no request-id correlation —
one process, one user, no aggregator, so both are speculative (Principle V).

| Level | Events | Fields |
|---|---|---|
| `WARNING` | Expected rejections: 422s, 404s | Method, path, status, error code, task id where applicable |
| `ERROR` | Any 5xx | The above, plus traceback |

**Task titles are never logged.** They are user content, they add nothing to a diagnosis that the
error code does not already give, and a log file is a far easier thing to leak than a database.

---

## Contract tests

One per endpoint (Principle II), run in-process with `httpx.AsyncClient` over `ASGITransport`
against the real application — no live server, no mocked router.

| File | Asserts |
|---|---|
| `test_list_tasks.py` | `200`; response validates against the schema; **ordering holds** — active before completed, active newest-first, completed by completion time, and the `id` tie-break with two identical `created_at` values |
| `test_create_task.py` | `201` and body; trimming applied; `TITLE_EMPTY` on blank and whitespace-only; `TITLE_TOO_LONG` at 151; **accepted at exactly 150**; an emoji title near the boundary counts clusters, not code points |
| `test_update_task.py` | `200`; `completed` toggles both ways; `completed_at` set and cleared; re-sending the current value does not refresh the timestamp; **sending `title` does not change it**; `404` on unknown id |
| `test_delete_task.py` | `204`; row is gone on a subsequent list; `404` on unknown id; `404` on deleting the same id twice |

Every test asserts the error envelope shape, not just the status code. A correct status with a
malformed body still breaks the generated client.
