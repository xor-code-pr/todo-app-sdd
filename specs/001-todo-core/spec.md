# Feature Specification: Core Todo

**Feature Branch**: `001-todo-core`

**Created**: 2026-10-29

**Status**: Approved — clarifications resolved, planned, tasked, and analyzed; ready for `/speckit-implement`

**Input**: User description: core todo lifecycle (create, complete, revert, delete), a required
title with validation, newest-first ordering with completed tasks sinking to the bottom, and
keyboard-continuous task entry under WCAG 2.2 AA.

## Clarifications

### Session 2026-10-29

- **Q: When completing a task moves it within the list, where does focus go?**
  **A**: Focus follows the task to its new position. The move must be announced so it is not
  silent (FR-021).
- **Q: Confirmation model for deletion — blocking modal, or delete-then-undo?**
  **A**: Blocking modal, confirmed before the delete happens. Deletion remains genuinely permanent
  with no recovery path (FR-012, FR-013, FR-022).
- **Q: Does Priority affect ordering, or is it informational?**
  **A**: Superseded — see below. (Answered "primary sort key", then withdrawn with the field.)
- **Q: Should the Priority field exist at all in V1?**
  **A**: **No.** Priority is removed entirely — no field, no control, no stored value, no effect on
  ordering. This supersedes the sort-key decision above and restores purely chronological
  ordering, newest first (FR-006, FR-016). Urgency cannot be expressed in V1.
- **Q: Can a task be edited after creation?**
  **A**: No. With priority gone there is nothing editable but the title, which stays immutable. A
  typo means delete and re-add.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a task without leaving the keyboard (Priority: P1)

A person has several things to record in quick succession. They type a title, press Enter or
activate "Add Task", and the task appears at the top of the list. The input empties and focus
returns to it, so they can immediately type the next one. They never reach for a mouse and never
have to hunt for where the cursor went.

**Why this priority**: Capture is the entire point of a todo application. Nothing else has value
if a task cannot be recorded. This story alone is a usable product — a list you can add to and
read is already worth shipping.

**Independent Test**: Load the application with an empty list, add three tasks using only the
keyboard, and confirm all three appear newest-first with focus resting in the empty input after
each one.

**Acceptance Scenarios**:

1. **Given** an empty title field, **When** the user types "Buy milk" and submits, **Then** a task
   titled "Buy milk" appears at the top of the list, the input is cleared, focus rests in the
   input, and the addition is announced to assistive technology.
2. **Given** a list with existing active tasks, **When** the user adds a new task, **Then** it
   appears above every existing active task.
3. **Given** an empty or whitespace-only title, **When** the user submits, **Then** no task is
   created, a visible error is shown, the error is announced, and focus remains in the input.
4. **Given** a title whose trimmed length exceeds 150 characters, **When** the user submits,
   **Then** no task is created and the user is told the limit and their current length.
5. **Given** a title with leading and trailing spaces, **When** the user submits, **Then** the
   stored and displayed title has that whitespace removed.

---

### User Story 2 - Mark a task done, and change your mind (Priority: P2)

A person finishes something and checks it off. It stays on screen with a strikethrough so they can
see what they have accomplished, but it moves out of the way to the bottom of the list so the
remaining work is what they read first. Focus travels with it, and they are told it moved. If they
checked the wrong thing, unchecking restores it to its place among the active tasks.

**Why this priority**: Completion is what separates a todo list from a notepad. It depends on
capture existing, so it follows P1.

**Independent Test**: With a list of five tasks, complete the third one and confirm it moves below
all active tasks with a strikethrough and that focus is on it in its new position; uncheck it and
confirm it returns to its chronological position.

**Acceptance Scenarios**:

1. **Given** an active task in a list, **When** the user marks it complete, **Then** it is rendered
   with a strikethrough, moves below every active task, focus follows it to its new position, its
   new position is scrolled into view, and both the completion and the move are announced.
2. **Given** a completed task, **When** the user marks it active again, **Then** the strikethrough
   is removed, the task returns to its position among active tasks by creation time, focus follows
   it, and the move is announced.
3. **Given** a task that is already the only item in the list, **When** the user completes it,
   **Then** it is struck through and the completion is still announced even though no reordering
   is visible — and no spurious "moved" announcement is made.
4. **Given** a screen reader user navigating the list, **When** they reach any task, **Then** its
   completion state is conveyed without relying on the strikethrough styling.

---

### User Story 3 - Delete a task on purpose, never by accident (Priority: P3)

A person wants a task gone for good. Activating delete opens a confirmation dialog that takes
focus and blocks interaction with the list behind it. Confirming removes the task permanently;
cancelling or pressing Escape leaves everything exactly as it was.

**Why this priority**: Deletion is destructive and unrecoverable, so it must be guarded, but a list
remains useful without it — completed tasks already move out of the way.

**Independent Test**: Delete a task, cancel at the confirmation, verify it still exists; delete
again, confirm, verify it is gone and stays gone after a reload.

**Acceptance Scenarios**:

1. **Given** a task in the list, **When** the user activates delete, **Then** a confirmation dialog
   opens, takes focus, identifies which task is about to be deleted by title, and the task is still
   present.
2. **Given** an open confirmation, **When** the user cancels, **Then** the task remains unchanged
   and focus returns to the delete control that opened the dialog.
3. **Given** an open confirmation, **When** the user presses Escape, **Then** the dialog closes,
   the task is not deleted, and focus returns to the delete control.
4. **Given** an open confirmation, **When** the user presses Tab repeatedly, **Then** focus cycles
   within the dialog and never reaches the list behind it.
5. **Given** an open confirmation, **When** the user confirms, **Then** the task is permanently
   removed, the removal is announced, and focus moves to a predictable nearby element rather than
   being lost.
6. **Given** a task was deleted, **When** the page is reloaded, **Then** the task does not reappear.

---

### Edge Cases

**Ordering and reordering**

- Two tasks created within the same clock tick — what guarantees a stable, repeatable order
  (FR-017)? Without a tie-break the list can shuffle between reloads.
- Un-completing a task moves it *upward*, potentially past many items, to a mid-list position
  determined by its creation time rather than to the top.
- Completing a task that is already the last active item produces no visible movement; the
  completion must still be announced, but a "moved" announcement would be a lie.
- Completing the most recently added task immediately after adding it — focus is in the input, not
  on the task. Focus-follows-the-row has nothing to follow from.

**Focus travel**

- On a list long enough to scroll, completing a task near the top sends focus to the bottom and
  scrolls the viewport with it. The user is now somewhere they did not choose to be. This is the
  accepted cost of the focus-follows-the-task decision.
- Completing several tasks in a row means repeatedly travelling to the bottom and navigating back.
- Programmatically moving focus is a change of context under WCAG 3.2.2; it is permissible because
  the user initiated it, but only if it is announced rather than silent.

**Title validation**

- A title of exactly 150 characters after trimming is valid; 151 is not.
- A 151-character title whose final character is a space becomes valid after trimming — validation
  must run on the trimmed value, not the raw input.
- Emoji, combining accents, and other multi-byte text: "150 characters" is counted in
  user-perceived characters (grapheme clusters), not code points. A family emoji is one perceived
  character and up to 11 code points (FR-003).
- Internal whitespace: "Buy    milk" — preserved as typed.
- Two tasks with identical titles — permitted, and distinguishable to a screen reader user who
  hears the same text twice.
- Pasting a 3,000-character title rather than typing it — the same limit and feedback apply.
- A typo is uncorrectable: titles are immutable and the only remedy is delete-and-retype.

**Deletion**

- Deleting the task that currently holds focus — focus must land somewhere predictable, never on
  the document body (FR-015).
- Deleting the last remaining task returns the list to its empty state; focus needs a destination
  that still exists.
- Rapid repeated activation of delete before the dialog renders.
- The confirmation dialog must name the task being deleted — a bare "Are you sure?" gives a screen
  reader user no way to verify they are deleting the right one.

**Failure and persistence**

- The add, complete, or delete operation fails at the storage layer: the displayed list must end up
  matching true stored state rather than an optimistic guess, and the failure must be announced,
  not shown only as a silent colour change.
- A submission is attempted twice in rapid succession (double-activation of Add) — one task or two?
- The browser is reloaded mid-entry: unsaved input in the title field is not a task and is lost.

**Presentation**

- Viewport at 320 CSS pixels and at 200% zoom — the list, controls and dialog must remain usable
  without horizontal scrolling.
- The empty state, before any task exists.

## Requirements *(mandatory)*

### Functional Requirements

**Creation and validation**

- **FR-001**: System MUST allow a user to create a task by supplying a title.
- **FR-002**: System MUST remove leading and trailing whitespace from the title before validating,
  storing, and displaying it.
- **FR-003**: System MUST reject a title whose trimmed length exceeds 150 characters, measured in
  user-perceived characters (grapheme clusters) so the limit behaves consistently for emoji and
  accented text.
- **FR-004**: System MUST block submission of an empty or whitespace-only title, create no task,
  display a visible error, announce that error to assistive technology, and leave focus in the
  title input.
- **FR-005**: On successful creation the system MUST clear the title input and place focus in it.
- **FR-006**: A newly created task MUST appear above every existing active task without requiring a
  manual refresh.

**Lifecycle**

- **FR-007**: Users MUST be able to mark an active task complete and return a completed task to
  active. A task's title MUST NOT be editable after creation.
- **FR-008**: Completed tasks MUST remain visible in the same list as active tasks and MUST be
  visually distinguished by a strikethrough.
- **FR-009**: Completed tasks MUST be ordered below every active task.
- **FR-010**: A task returned to active MUST take its position among active tasks by creation time,
  not jump to the top.
- **FR-011**: A task's completion state MUST be programmatically determinable by assistive
  technology, independent of the strikethrough styling.
- **FR-012**: Deletion MUST be permanent, with no recovery path and no undo.
- **FR-013**: The system MUST require explicit confirmation in a blocking dialog before deleting,
  and the dialog MUST identify the task by title.
- **FR-014**: Cancelling or dismissing the confirmation MUST leave the task entirely unchanged.
- **FR-015**: After a deletion completes, focus MUST move to a defined, still-existing element and
  MUST NOT be lost to the document body — including when the deleted task was the last in the list.

**Ordering**

- **FR-016**: Active tasks MUST be ordered by creation time, newest first.
- **FR-017**: Ordering MUST be deterministic and stable across reloads when two tasks share a
  creation timestamp.
- **FR-018**: Completed tasks MUST be ordered among themselves by completion time, most recently
  completed first.

**Accessibility** *(constitution Principle III — WCAG 2.2 AA)*

- **FR-019**: Every action — add, complete, revert, delete, confirm, cancel — MUST be operable by
  keyboard alone, with a visible focus indicator meeting AA contrast.
- **FR-020**: Task added, completed, reverted, deleted, and validation-error events MUST be
  announced through a live region.
- **FR-021**: When completing or reverting a task moves it within the list, focus MUST follow the
  task to its new position, that position MUST be scrolled into view, and the move MUST be
  announced. Where no move occurs — completing an already-last active task — no move MUST be
  announced.
- **FR-022**: The confirmation dialog MUST trap focus while open, close on Escape, and return focus
  to its triggering control when cancelled or dismissed.
- **FR-023**: The interface MUST remain usable without horizontal scrolling at a 320 CSS pixel
  viewport width and at 200% zoom.

**Persistence and failure**

- **FR-024**: Tasks and their state MUST survive a page reload and an application restart.
- **FR-025**: When a create, complete, revert, or delete operation fails, the displayed list MUST
  converge on true stored state, and the failure MUST be announced, not signalled by colour alone.

### Key Entities

- **Task**: A single item of work. Carries a stable identifier, a title (trimmed, 1–150
  user-perceived characters, immutable after creation), a completion state, a creation timestamp
  used for ordering active tasks, and a completion timestamp used for ordering completed tasks.
  Tasks carry no owner or user reference — the application serves a single local user. Tasks carry
  no priority, due date, or description in V1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add ten consecutive tasks using only the keyboard, without once relocating
  the input field or touching a pointing device.
- **SC-002**: A first-time user can add their first task within 10 seconds of the application
  becoming ready.
- **SC-003**: Automated accessibility checking reports zero violations in every state: empty list,
  populated list, validation error shown, confirmation dialog open, and all-tasks-completed.
- **SC-004**: Every state change — add, complete, revert, delete, error — is announced to assistive
  technology within one second of the change.
- **SC-005**: In 100% of observed states, no completed task appears above any active task.
- **SC-006**: 100% of invalid submissions are rejected with feedback that is both visible and
  announced, and none creates a task.
- **SC-007**: A screen reader user can determine every task's completion state without any
  reference to visual styling.
- **SC-008**: Focus is never lost to the document body after any action, measured across every
  acceptance scenario in this spec.
- **SC-009**: The complete add → complete → delete journey can be performed end to end with a
  keyboard only, and independently with a screen reader, by a tester following the acceptance
  scenarios unaided.

## Assumptions

Recorded defaults for details the description left open. Each is a decision that can be overturned
cheaply now and expensively later.

- **No editing in V1** (decided, not assumed — see Clarifications). Titles are immutable and
  nothing else is editable. A typo means delete and re-add. This is the sharpest usability gap in
  the specification and the first thing to revisit if V1 feedback is poor.
- **Over-length titles are not silently truncated**: the input accepts typing or pasting past 150
  characters and submission is blocked with an explicit message plus a live character count. A hard
  input cap was rejected because silently swallowing keystrokes gives the user no feedback about
  why their text stopped appearing.
- **Internal whitespace is preserved** exactly as typed; only leading and trailing whitespace is
  trimmed.
- **Duplicate titles are permitted** — there is no uniqueness constraint.
- **Empty state**: when no tasks exist the list area shows a short message confirming the list is
  empty rather than rendering nothing, so the state is perceivable rather than inferred from blank
  space.
- **No pagination, search, filtering, or bulk actions** in V1. The list renders in full.
- **Single local user**, no accounts, no authentication, no sharing — per the constitution's stack
  constraints.
- **No priority, due dates, or long description field.** Priority was specified, designed as a sort
  key, then removed before planning; the Task entity has no priority column and must not gain one
  speculatively (Principle V). If it returns, it returns as its own feature with its own spec.
