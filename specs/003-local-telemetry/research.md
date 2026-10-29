# Phase 0 Research: Local Telemetry

**Feature**: 003-local-telemetry | **Date**: 2026-10-30

Four decisions the spec implied but did not settle.

---

## R1 — No new dependency, and why that is not stubbornness

**Decision**: Python's standard library only. `logging.handlers.RotatingFileHandler` for the
bound, `json` for the format, `time.perf_counter` for durations.

**Rationale**: `001`'s plan rejected `structlog` as "one process, no aggregator… speculative
under Principle V". It is worth asking whether that still holds now that the requirement has
changed, because reusing an old justification without re-examining it is how a stack
quietly stops being defensible.

It holds. What this feature adds is **persistence**, not structure — and persistence is a
handler, not a library. Emitting JSON is a formatter of roughly fifteen lines. Rotation is
a class that already exists. A dependency to avoid fifteen lines would be a poor trade in a
project whose Principle V says to wait for a documented problem, and no problem has been
documented.

If this ever grows a second process, a collector, or correlation across services, the
calculation changes. It has not.

**Alternatives considered**: `structlog` (rejected, above); OpenTelemetry (rejected — a
collector is a second process and a network hop, and Principle VII says local only);
hand-rolled rotation (rejected — the standard library's is better tested than anything
written here would be).

---

## R2 — The sink must be incapable of raising

**Decision**: every path through `record()` is wrapped, and the fallback is silence.

**Rationale**: FR-016, FR-017 and FR-018 are three requirements for one property, which
usually signals over-specification. Here it signals the opposite — it is the property most
easily lost, because the natural implementation of "append to a file" raises on a full disk,
a missing directory, or a permissions change, and every one of those would then surface to
someone who was adding a task.

The failure mode is particularly unpleasant in the exception handlers: telemetry raising
*while handling an error* would replace a useful message with a confusing one, and the
original failure would never reach the user (FR-018).

Swallowing exceptions is normally a smell. Here it is the requirement. The mitigation is
that it is confined to exactly one module with one entry point, so "where did my telemetry
go" has one place to look.

**Alternatives considered**: let it raise and catch at call sites (rejected — four call
sites that must each remember, and one forgetting breaks a user action); a background queue
(rejected — a thread and a buffer to solve a problem one `try` solves).

---

## R3 — JSON Lines, and why not a single JSON document

**Decision**: one JSON object per line, appended.

**Rationale**: "Readable with ordinary text tools" is satisfied by several formats; what
separates them is what happens when a write is interrupted.

A single JSON array must be rewritten or carefully patched on every append, and a crash
mid-write leaves a file no parser will open — losing every entry, including the ones
explaining the crash. That is precisely the moment the record matters most.

JSON Lines appends. A torn final line costs one entry. `grep`, `tail` and `wc -l` all work
on it unchanged, and each line parses independently for anything more structured.

**Alternatives considered**: a JSON array (rejected, above); plain prose lines (rejected —
easy to read, but every consumer re-parses an ad-hoc shape, and counting reliably becomes
guesswork); CSV (rejected — a failure and a timing share almost no fields, so most columns
would be empty).

---

## R4 — A closed body for the reporting endpoint

**Decision**: `POST /api/telemetry` accepts a Pydantic model with a fixed field set — an
operation from a known vocabulary, a short code, an optional duration. It returns `204`
regardless of whether recording succeeded.

**Rationale**: two separate problems.

**The closed shape is a privacy control, not validation hygiene.** An endpoint accepting
free text is an endpoint through which a task title eventually arrives — in a stack trace, a
serialised response, a URL. Closing the shape means the browser *cannot* send user content
even by accident, which is a stronger guarantee than asking callers to be careful.

**The unconditional 204 exists because this endpoint reports failures.** If it answered with
an error when the sink was broken, the browser would have a failed request to report, which
would fail, and so on. FR-006a says reporting a failure must not cause one; the simplest way
to honour that is to make failure unobservable to the caller.

**Alternatives considered**: a free-form JSON blob (rejected — the privacy hazard above);
returning the real status (rejected — the loop above); batching reports client-side
(rejected — a buffer and a flush policy before anyone has seen the volume).
