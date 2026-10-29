# Phase 1 Data Model: Local Telemetry

**Feature**: 003-local-telemetry | **Date**: 2026-10-30

One entity, written to one file. The interesting part is not its shape but what it is
forbidden from containing.

---

## Entry

One line of `telemetry.jsonl`. One JSON object. Independently parseable.

### Fields present on every entry

| Field | Type | Notes |
|---|---|---|
| `ts` | string | UTC, ISO 8601, ending `Z` — matching the existing convention for stored times |
| `kind` | string | One of `failure` · `timing` · `usage` · `lifecycle` |
| `operation` | string | From a known vocabulary, never free text |

### Kind-specific fields

| `kind` | Additional fields |
|---|---|
| `failure` | `code` (domain code or `INTERNAL_ERROR`), `status` (int), `exception_type` (class name), `source` (`server` or `browser`) |
| `timing` | `method`, `path_template`, `status` (int), `duration_ms` (float) |
| `usage` | nothing beyond `operation` — the entry *is* the count |
| `lifecycle` | `event` (`startup` · `shutdown` · `migration_applied`), `revision` for migrations |

### The operation vocabulary

Closed. A value outside it is a defect, not an extension point.

```
task_created · task_completed · task_reopened · task_deleted · task_list_read
app_lifecycle · http_request
```

---

## What an entry must never contain

This is the part worth reading twice.

| Forbidden | Why |
|---|---|
| Task titles | FR-011. The existing rule said "never log task titles" for console output; a file on disk outlives the process, survives a crash, and gets copied into backups without anyone deciding to. |
| **Exception messages** | They are where user content hides. `TitleTooLongError` is recorded; *"Title too long: 'Buy milk and…'"* is not. |
| Literal request paths | `/api/tasks/42` becomes `/api/tasks/{task_id}`. An identifier is useless for aggregation and one step from carrying something that is not. |
| Free-form strings from a caller | The reporting endpoint's body is closed precisely so the browser cannot send one. |
| Stack traces | They contain local variables, and local variables contain titles. |

### Enforcement, in three layers

1. **Type-level** — the sink accepts strings from a known vocabulary, ints, floats and
   bools. Not objects, not exceptions.
2. **Discipline** — the instrumentation records `type(exc).__name__` and `exc.code`, never
   `str(exc)`.
3. **A test that greps** — tasks are created with distinctive titles and the whole file is
   searched (FR-014, SC-003).

The third is the one that will catch a regression. The first two depend on someone
remembering; the third does not.

---

## Record

| | |
|---|---|
| Location | `telemetry.jsonl`, beside the SQLite database; `TASKFLOW_TELEMETRY_PATH` overrides |
| Format | JSON Lines, append-only |
| Bound | Size cap, one rotated predecessor retained (`telemetry.jsonl.1`) |
| Worst-case disk | ~2× the cap |
| Unwritable | Entries are dropped silently. **No error reaches the user.** |

### Rotation

```text
  telemetry.jsonl reaches the cap
        │
        ├─ existing telemetry.jsonl.1  →  removed
        ├─ telemetry.jsonl             →  telemetry.jsonl.1
        └─ new empty telemetry.jsonl
```

Recent history survives the rollover, which an in-place truncation would not give. The cost
is a second file and a predictable doubling of the bound.

---

## Entry lifecycle

There is none — entries are append-only and never updated, read back, or deleted
individually. They leave only by rotation.

That is deliberate. A telemetry store that supports querying and mutation is a database, and
this project already has one. Keeping the record write-only in the application means it can
never become load-bearing for a feature, which is what FR-016 is ultimately protecting.
