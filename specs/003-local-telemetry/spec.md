# Feature Specification: Local Telemetry

**Feature Branch**: `003-local-telemetry`

**Created**: 2026-10-30

**Status**: Clarified — 3 questions resolved 2026-10-30, 16/16 on the quality checklist,
no open markers

**Input**: Satisfy Principle VII (Local Observability), added to the constitution in v1.3.0
and currently the only entry in its Known exceptions block.

## Why this exists

When something goes wrong in TaskFlow today, **there is no record of it afterwards.**

- The server writes to a console that closes with its terminal. Nothing reaches disk.
- The browser records nothing at all. The `catch` clauses in the API client swallow the
  error object entirely.

This is not theoretical. During development the API became unreachable; the interface
correctly told the user *"Could not reach the server"*, and **that sentence was the only
record that ever existed.** Nobody could later answer what failed, when, or how often.

### What this is not

This application has **one local user, with no account**. Telemetry usually answers *"what
are my users doing that I can't see?"* — here there is nobody who cannot be seen, and the
one existing rule on the subject says task titles are never logged, precisely because this
is personal data.

So this is **diagnosis after the fact for whoever maintains the app**, not analytics about a
user. Nothing is transmitted anywhere. Nothing a person typed is recorded.

## Clarifications

### Session 2026-10-30 — decided in the author's absence

The author asked for the feature to be completed overnight. These three were resolved with
the reasoning below rather than left blocking. **Each is flagged for review**; none is
expensive to reverse.

- **Q: How do browser failures reach the record?**
  **A: A new endpoint the browser posts to, writing to the same file.** Barely a choice:
  Principle VII requires failures from *both* the server and the browser, and the browser
  cannot write to a file. The alternatives leave half the principle unsatisfied. The cost is
  real and accepted — new API surface, request validation, a contract test, and a reporting
  path that must never itself cause the failure it is reporting.
- **Q: What format, and where?**
  **A: One JSON object per line, in a file beside the database.** Each line parses
  independently, so a truncated final write costs one entry rather than the file — which
  matters because the most likely moment to be interrupted is a crash, exactly when the
  record is most needed. Greps and filters with ordinary tools.
- **Q: What bounds the record?**
  **A: A size cap with rotation, keeping the current file and one previous.** Bounds disk
  use predictably and keeps recent history across the rollover. An age cap was rejected
  because it does nothing about a burst of failures in a single day, which is the scenario
  that actually threatens the file.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - I can find out what went wrong, after it went wrong (Priority: P1)

Something failed yesterday — a request errored, or the interface showed a message that made
no sense. The person maintaining the app opens a file and finds the failure: when it
happened, what kind it was, and which operation was in flight. They did not need to be
watching at the time, and they did not need to reproduce it.

**Why this priority**: It is the entire reason the principle exists. Everything else here is
nice to have; this is the gap that currently has no answer at all.

**Independent Test**: Cause a server error and a browser-side failure, close everything,
reopen the record, and find both.

**Acceptance Scenarios**:

1. **Given** a request fails on the server, **When** the operator later opens the record,
   **Then** they find an entry with the time, the kind of failure, and the operation it
   occurred in.
2. **Given** the browser cannot reach the API, **When** the operator later opens the record,
   **Then** that failure is present too — not only the server's side of the story.
3. **Given** the application has been closed and reopened, **When** the operator opens the
   record, **Then** entries from the previous run are still there.
4. **Given** any recorded failure, **When** the operator reads the entry, **Then** it
   contains no task title and no text the user typed.

---

### User Story 2 - I can see how the application has been behaving (Priority: P2)

Beyond failures: how long operations took, which features were used and how often, and when
the application started, stopped, or applied a migration. Enough to answer "was it always
like this?" without guessing.

**Why this priority**: Useful context, but a failure with no record is a worse problem than
a trend with no data. This is what makes the record diagnostic rather than merely a list of
errors.

**Independent Test**: Use the app normally, then confirm the record shows startup, the
operations performed with their durations, and a count of each kind.

**Acceptance Scenarios**:

1. **Given** the application starts, **When** the operator opens the record, **Then** a
   startup entry is present.
2. **Given** a migration is applied, **When** the operator opens the record, **Then** that
   is recorded as a distinct event.
3. **Given** several tasks are created and completed, **When** the operator opens the record,
   **Then** the counts of each kind of operation are recoverable.
4. **Given** any operation, **When** the operator reads its entry, **Then** its duration is
   present.

---

### User Story 3 - The record stays small, private, and harmless (Priority: P3)

The file never grows without limit. It contains nothing anyone typed. And if recording ever
fails — disk full, permissions wrong — the application carries on working as though nothing
happened.

**Why this priority**: These are the properties that make the first two stories safe to ship
rather than a liability. Low priority only because they are constraints on the others, not
independently valuable.

**Independent Test**: Generate entries past the configured limit and confirm the file is
bounded. Make the destination unwritable and confirm every feature still works.

**Acceptance Scenarios**:

1. **Given** the record reaches its limit, **When** more entries are written, **Then** the
   file stays bounded rather than growing indefinitely.
2. **Given** the destination cannot be written — missing directory, no permission, disk
   full — **When** the user adds, completes or deletes a task, **Then** the operation
   succeeds normally and the user sees no error about telemetry.
3. **Given** recording is failing, **When** the user measures how long operations take,
   **Then** they are not noticeably slower.
4. **Given** the entire record, **When** it is searched for any task title that was ever
   created, **Then** none is found.

---

### Edge Cases

**Privacy — the sharpest risk here**

- An error message that *embeds* user content. A validation failure naturally wants to say
  "title too long: 'Buy milk and then…'" — the length belongs in the record, the text does
  not.
- A stack trace or exception message containing a task title as a value.
- A URL or request path containing user text.
- The record is a file on disk, so it outlives the process, survives a crash, and can be
  copied or backed up without anyone thinking about it. That is precisely why the
  no-user-content rule matters more here than it did for console output.

**Failure of the recorder itself**

- The destination directory does not exist, or is read-only.
- The disk is full.
- Two processes writing at once — the API server and a test run, or two servers.
- Recording throws *while handling an error*. The original failure must still reach the user.
- The record is open in another program when rotation or truncation is attempted.

**Volume and bounds**

- A tight loop of failures producing many identical entries in a short time.
- A single entry larger than the whole size limit.
- The limit reached mid-write.
- The file deleted while the application is running.

**Browser-side**

- A failure occurring before the application has finished loading.
- A failure in the very mechanism that reports failures.
- The browser closed immediately after an error, before it could be recorded.

## Requirements *(mandatory)*

### Functional Requirements

**Where it goes**

- **FR-001**: Telemetry MUST be written to a file on the machine running the application.
- **FR-002**: Telemetry MUST NOT be transmitted anywhere. No third-party service, no remote
  collector, no network request leaves the machine for this purpose.
- **FR-003**: The record MUST survive the application being closed and reopened.
- **FR-004**: The record MUST be readable with ordinary text tools: **one JSON object per
  line**, in a file alongside the database.
- **FR-004a**: Each line MUST be independently parseable, so that a truncated final write
  costs one entry rather than the whole record.

**What it records**

- **FR-005**: Failures on the server MUST be recorded, with the time, the kind of failure,
  and the operation in flight.
- **FR-006**: Failures in the browser MUST be recorded, by reporting them to the server,
  which writes them to the same record.
- **FR-006a**: Reporting a browser failure MUST NOT be able to cause one. A failure to
  report is swallowed — it never surfaces to the user and never blocks the action that
  produced the original error.
- **FR-006b**: The reporting endpoint MUST validate what it accepts and MUST NOT record
  arbitrary caller-supplied text, for the same reason FR-011 exists.
- **FR-007**: The duration of each operation MUST be recorded.
- **FR-008**: Counts of feature use — tasks created, completed, reopened, deleted — MUST be
  recoverable from the record.
- **FR-009**: Lifecycle events MUST be recorded: application start, shutdown, and a
  migration being applied.
- **FR-010**: Every entry MUST carry the time it occurred.

**What it must never record**

- **FR-011**: The record MUST NOT contain task titles or any other text the user typed.
- **FR-012**: Identifiers, durations, counts, error codes and operation names are permitted.
- **FR-013**: Where a failure naturally embeds user content — a validation message quoting
  the offending title — the content MUST be replaced by a non-identifying description such
  as its length.
- **FR-014**: A test MUST verify that a task title created through the application never
  appears anywhere in the record.

**Staying harmless**

- **FR-015**: The record MUST be bounded by file size. On reaching the limit the current
  file MUST be rotated and exactly one previous file retained; older files MUST be removed.
- **FR-015a**: Total disk use MUST therefore never exceed roughly twice the configured
  limit.
- **FR-016**: A failure to record MUST NOT fail, block, or surface an error for the user's
  action. The operation completes as though recording had succeeded.
- **FR-017**: A failure to record MUST NOT noticeably slow the user's action.
- **FR-018**: Recording MUST NOT prevent an original error from reaching the user. A failure
  inside the recorder while handling a failure must not swallow the first one.

**Not regressing**

- **FR-019**: All existing tests — 85 backend, 79 component, 47 end-to-end — MUST continue
  to pass.
- **FR-020**: No user-visible behaviour MUST change. This feature adds a record; it changes
  nothing a person sees in the interface.

### Key Entities

- **Entry**: One thing that happened. Carries a timestamp, a kind (failure, timing, feature
  use, lifecycle), the operation it relates to, and kind-specific detail — an error code, a
  duration, a count. Never user-authored text.
- **Record**: The accumulated entries on disk. Bounded, readable, and local to the machine.

## Decisions taken without the author

Recorded here as well as in Clarifications, because they were made in their absence and
each deserves a second look:

| # | Decision | Reversibility |
|---|---|---|
| Q1 | Browser failures are posted to a new endpoint | Moderate — removing the endpoint later means losing browser-side coverage, which Principle VII requires |
| Q2 | JSON Lines, beside the database | Cheap — format is internal; nothing depends on it |
| Q3 | Size cap with one rotated file retained | Cheap — a limit and a strategy, both configurable |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A server failure and a browser failure that occurred before the application
  was last closed can both be found in the record afterwards.
- **SC-002**: 100% of recorded entries carry a timestamp and an operation.
- **SC-003**: **Zero** occurrences of any task title appear in the record, verified by
  creating tasks with distinctive titles and searching the entire file.
- **SC-004**: With the destination unwritable, 100% of add, complete, reopen and delete
  operations still succeed, and the interface shows no telemetry-related error.
- **SC-005**: With the destination unwritable, operations take no longer than with recording
  working normally.
- **SC-006**: After generating entries well past the configured limit, the record remains
  within its bound.
- **SC-007**: The counts of tasks created, completed, reopened and deleted during a session
  are recoverable from the record and match what was actually done.
- **SC-008**: All 85 backend, 79 component and 47 end-to-end tests continue to pass.
- **SC-009**: No network request is made for telemetry purposes, verified by observing
  traffic during a full session.

## Assumptions

- **Recording is best-effort, always.** Every write is wrapped so that no failure in it can
  reach the user. This is stated repeatedly because it is the property most likely to be
  lost during implementation.
- **No viewer is built.** The record is a file; reading it is the operator's job with their
  own tools. A UI for it would be its own feature.
- **No configuration UI.** Location and limits are fixed or environment-driven, not
  user-adjustable.
- **No log levels.** The four signals are the vocabulary. Adding verbosity settings would be
  speculative generality (Principle V).
- **Timestamps are UTC**, matching the existing convention for stored times.
- **The browser's own console continues to exist** and is unaffected by whatever Q1 decides.
- **Single writer assumed.** One application instance writes the record. Concurrent writers
  are an edge case to handle gracefully, not a supported configuration.
- **Third-party analytics remains out of scope** under the constitution's Technology Stack
  section. This feature does not relax that and must not be read as a step toward it.
