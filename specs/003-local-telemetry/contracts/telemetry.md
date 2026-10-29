# Phase 1 Contract: Telemetry

**Feature**: 003-local-telemetry | **Date**: 2026-10-30

Three contracts: the **sink** (internal), the **endpoint** (HTTP), and the **file** (what a
human finds on disk).

---

## 1. The sink

`backend/src/taskflow/telemetry.py` — no FastAPI import, usable from anywhere.

```python
record(kind, operation, **fields) -> None
```

| Guarantee | |
|---|---|
| Never raises | Every path wrapped; the fallback is silence |
| Never blocks meaningfully | One buffered append |
| Returns `None` always | A caller cannot branch on whether recording worked, so no code path can come to depend on it |
| Accepts | `str` from a known vocabulary, `int`, `float`, `bool` |
| Rejects | objects, exceptions, anything else — dropped, not raised |

Returning `None` unconditionally is deliberate. A boolean would invite
`if not record(...)`, and the moment anything branches on telemetry, telemetry is
load-bearing — which FR-016 forbids.

---

## 2. `POST /api/telemetry`

The only route by which a browser failure reaches the file.

### Request

```json
{ "operation": "task_created", "code": "NETWORK_UNREACHABLE", "duration_ms": 1203.4 }
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `operation` | enum | yes | From the closed vocabulary in data-model.md |
| `code` | string | yes | ≤ 64 chars, `[A-Z0-9_]` only — a code, not a message |
| `duration_ms` | float | no | ≥ 0 |

**The closed shape is a privacy control, not validation hygiene.** An endpoint accepting
free text is one through which a task title eventually arrives — inside a stack trace, a
serialised response, a URL. The `[A-Z0-9_]` constraint on `code` means prose cannot be
smuggled through the one string field.

### Response

| Condition | Status |
|---|---|
| Valid body | `204`, no content |
| Valid body, **sink broken** | `204` — identical |
| Malformed body | `422`, standard error envelope |

**`204` even when recording failed** (FR-006a). This endpoint reports failures; if it
answered with an error when broken, the browser would have a failed request to report, which
would fail, and so on. Making failure unobservable to the caller is the simplest way to stop
that loop.

`422` for a malformed body is not an exception to this: a malformed body is a programming
error in the caller, not a runtime failure, and it should be loud.

---

## 3. The file

```
telemetry.jsonl       current
telemetry.jsonl.1     one rotated predecessor
```

One JSON object per line:

```
{"ts":"2026-10-30T18:04:11.233Z","kind":"lifecycle","operation":"app_lifecycle","event":"startup"}
{"ts":"2026-10-30T18:04:19.881Z","kind":"timing","operation":"http_request","method":"POST","path_template":"/api/tasks","status":201,"duration_ms":4.12}
{"ts":"2026-10-30T18:04:19.883Z","kind":"usage","operation":"task_created"}
{"ts":"2026-10-30T18:05:02.104Z","kind":"failure","operation":"task_created","code":"TITLE_TOO_LONG","status":422,"exception_type":"TitleTooLongError","source":"server"}
```

Note the last line: **the code and the exception type, never the message.** The message is
*"Title must be 150 characters or fewer (received 184)"* — harmless here, but the same field
on a different error would carry the title itself, and the rule has to hold without
case-by-case judgement.

### What a reader can do with ordinary tools

```bash
grep '"kind":"failure"' telemetry.jsonl          # every failure
grep -c '"operation":"task_created"' *.jsonl      # how many tasks were created
tail -5 telemetry.jsonl                           # what happened last
```

---

## 4. Contract tests

| File | Asserts |
|---|---|
| `tests/contract/test_telemetry_endpoint.py` | `204` on valid; `422` on malformed and on prose in `code`; **`204` when the sink is broken**; the error envelope shape on `422` |
| `tests/unit/test_telemetry.py` | JSON Lines, one object per line; rotation at the cap with one backup kept; **never raises** when the path is unwritable; objects and exceptions rejected |
| `tests/e2e/telemetry.spec.ts` | Tasks created with distinctive titles; **zero occurrences anywhere in the record**; every operation still succeeds with the destination unwritable |
