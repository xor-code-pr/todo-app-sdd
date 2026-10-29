# Feature Specification: Design System

**Feature Branch**: `002-design-system`

**Created**: 2026-10-30

**Status**: Draft — 3 open clarifications

**Input**: Bring TaskFlow into compliance with Principle VI (Coherent Visual System), added to
the constitution in v1.2.0 on 2026-10-30. `001-todo-core` is currently recorded in Governance
as a documented exception to it.

## Why this exists

Principle VI was added after `001-todo-core` shipped. The measured gap: **9 distinct
hardcoded colours** and **6 distinct spacing values** scattered across component stylesheets,
no shared vocabulary, no dark theme, no motion definitions.

That is a maintenance problem, but it is a *user* problem first:

- Someone working in a dark room has no dark theme and is shown a near-white page.
- Someone sensitive to motion has nothing to be sensitive about yet — but the moment motion
  is added without rules, they will.
- Errors, borders and disabled states drift apart over time when each is chosen by hand, so
  the interface slowly stops teaching the user what its colours mean.

This feature does not change what the application *does*. Every behaviour in `001-todo-core`
— the focus choreography, the live region, the confirmation dialog — stays exactly as it is.

## Clarifications

### Session 2026-10-30

- Q: Can someone switch to dark mode inside the app, or does it only follow the OS? →
  A: Both — follow the OS by default, plus an in-app control whose choice is remembered
  across visits (three states: follow system, light, dark).
- Q: Which parts of the interface should animate when they change? →
  A: Hover and focus states, plus the confirmation dialog opening and closing. Nothing else —
  list reordering, the validation error, and theme switching all stay instant.
- Q: Where should the contrast checker get its colour values from? →
  A: It reads the token source directly. One definition of the palette; no second copy to
  drift.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app matches how I've set up my computer (Priority: P1)

Someone who runs their operating system in dark mode opens TaskFlow and sees a dark
interface, not a bright white page. Someone running light mode sees light. Nothing is harder
to read in either case: text, borders, focus rings and the completed-task strikethrough are
all as legible in one as in the other.

**Why this priority**: It is the only part of this feature a user can actually see on first
load, and the only one that changes whether the app is comfortable to use at night.

**Independent Test**: Set the OS to dark, open the app, and confirm every state — empty,
populated, error, dialog open, all-completed — is rendered in dark with no element left
unreadable. Switch the OS to light and repeat.

**Acceptance Scenarios**:

1. **Given** the operating system is set to dark, **When** the user opens the application,
   **Then** the interface renders in its dark theme without a flash of light content.
2. **Given** the operating system is set to light, **When** the user opens the application,
   **Then** the interface renders in its light theme.
3. **Given** the application is open, **When** the user changes their system theme, **Then**
   the interface follows without a page reload.
4. **Given** either theme, **When** a user tabs to any control, **Then** the focus indicator
   is clearly visible against that theme's background.
5. **Given** either theme, **When** a screen reader user reaches a completed task, **Then**
   its state is still conveyed by the checkbox, not by colour or strikethrough.
6. **Given** either theme, **When** the confirmation dialog opens, **Then** the dialog, its
   backdrop and both buttons are legible and the destructive action remains distinguishable
   from the safe one by more than colour alone.
7. **Given** the theme control set to follow the system, **When** the user selects "always
   dark", **Then** the interface switches to dark and stays dark even if the system later
   changes to light.
8. **Given** an explicit choice was made on a previous visit, **When** the user returns,
   **Then** that choice is still in effect and is applied before the first paint.
9. **Given** the theme control, **When** a keyboard user reaches it, **Then** its purpose and
   current setting are both announced, and the change is announced when made.

---

### User Story 2 - The interface is internally consistent (Priority: P2)

Every colour, space, text size and corner radius in the application comes from one small
declared vocabulary. Two errors in different places are the same red. Two cards use the same
gap. Nothing is "nearly" the same as something else.

**Why this priority**: It is less visible than the dark theme but it is what makes the dark
theme possible at all — a palette defined once can be measured and re-themed; forty values
scattered across nine files cannot.

**Independent Test**: Search every component stylesheet for a raw colour or spacing literal.
There should be none. Change one token and confirm the change appears everywhere that
concept is used.

**Acceptance Scenarios**:

1. **Given** the stylesheets, **When** they are inspected, **Then** no component stylesheet
   contains a literal colour or spacing value — every one references a shared token.
2. **Given** a token is changed, **When** the application is reloaded, **Then** every place
   that concept appears changes together.
3. **Given** the full token set, **When** contrast is measured, **Then** every foreground and
   background pairing that the application actually uses is covered by the measurement, in
   both themes.

---

### User Story 3 - Motion is purposeful, and optional (Priority: P3)

Interface changes feel considered rather than abrupt — but a user who has asked their system
to reduce motion sees none of it, and nothing important is communicated by movement alone.

**Why this priority**: The smallest user-visible gain of the three, and the one most able to
cause harm if done carelessly. Deferring it costs nothing.

**Independent Test**: With reduced motion off, confirm transitions occur and complete
quickly. Turn reduced motion on and confirm the same interactions happen instantly, with
identical end states.

**Acceptance Scenarios**:

1. **Given** the user has not requested reduced motion, **When** an interface state changes,
   **Then** any transition uses a defined duration and easing rather than an ad-hoc value.
2. **Given** the user has requested reduced motion, **When** the same interaction occurs,
   **Then** no animation plays and the end state is reached immediately.
3. **Given** a task is completed and the list reorders, **When** focus moves to that task in
   its new position, **Then** the reorder is **not** animated — focus never lands on a
   moving target.
4. **Given** any transition, **When** it is removed entirely, **Then** no information is
   lost: motion never carries meaning on its own.
5. **Given** the confirmation dialog is opening, **When** focus moves to the Cancel button,
   **Then** focus arrives immediately and is not held back by the transition.
6. **Given** a validation error appears, **When** it is announced, **Then** it appears
   instantly — the announcement and the appearance are not separated in time.
7. **Given** the user switches theme, **When** the interface changes, **Then** it changes
   instantly rather than cross-fading.

---

### Edge Cases

**Theming**

- **The current focus ring is `#1a1a1f`, a near-black.** On a dark background it would be
  invisible. Focus indicators cannot simply be re-used across themes; each theme needs its
  own, measured.
- The completed-task colour is currently darkened rather than greyed to hold contrast. The
  dark theme needs the equivalent treatment in the opposite direction, and "lighten it a bit"
  will not automatically pass.
- The destructive-action red and the error red must both stay distinguishable from body text
  **and** from each other in dark, where saturated reds lose contrast quickly.
- A system theme change while the confirmation dialog is open, or while a live-region message
  is being announced.
- A user with no system preference expressed at all — which theme do they get?
- A stored preference that is missing, corrupt, or from an older version of the control.
- The stored preference says dark while the system says light — the stored value wins, but
  only until the user returns the control to "follow system".
- Storage unavailable or blocked. The control must still work for the session rather than
  failing outright.
- Forced-colors / high-contrast mode, where the operating system overrides the palette
  entirely. Does the interface survive that, and is it in scope?
- A flash of the wrong theme before styles apply.

**Tokens**

- Values that look like duplicates but mean different things — a border grey and a disabled
  text grey that happen to match today — must not be collapsed into one token, or changing
  one later silently changes the other.
- Pixel values that are genuinely not spacing: a `1px` border, a `3px` focus ring width. Are
  these tokens, or exempt?
- The contrast script currently holds its own copy of the palette. The moment tokens exist,
  that copy is a second source of truth and is removed (FR-020).
- A token that is defined but used by no declared pairing: the checker reports it rather than
  skipping it, because "unmeasured" and "unused" look identical from the file alone.
- A token whose value is itself a reference to another token, rather than a literal colour.
- A malformed or unreadable token file must fail the check, not produce an empty pass.

**Motion**

- The dialog's open transition runs while the browser is already moving focus inside it. A
  transition that delays or intercepts that would break FR-022 from `001-todo-core`.
- A user toggling reduced motion while the dialog is mid-transition.
- Hover transitions on a touch device, where hover state can stick after a tap.

**Non-regression**

- Tokenising is expected to produce *identical* rendered output in light mode. Any visible
  change means a value was transcribed wrong.
- All 31 end-to-end tests and 48 component tests must continue to pass untouched; any test
  that needs editing indicates behaviour changed, which this feature forbids.

## Requirements *(mandatory)*

### Functional Requirements

**Tokens**

- **FR-001**: Every colour, spacing, type-size, line-height, radius and shadow value used by
  the interface MUST be defined once in a single shared token source.
- **FR-002**: Component stylesheets MUST reference tokens. A literal colour or spacing value
  in a component stylesheet is a defect.
- **FR-003**: Tokens MUST be named for their role rather than their appearance, so that a
  theme change does not make a name a lie.
- **FR-004**: Values that coincide today but represent different concepts MUST remain
  separate tokens.

**Themes**

- **FR-005**: The interface MUST provide a light theme and a dark theme.
- **FR-006**: Theme selection MUST default to the user's system preference, and the
  application MUST also provide a control to override it. The control MUST offer three
  states: follow system, always light, always dark.
- **FR-006a**: The chosen state MUST persist across visits.
- **FR-006b**: While the control is set to follow system, a change to the system preference
  MUST still be followed live. Once an explicit light or dark choice is made, system changes
  MUST NOT override it.
- **FR-006c**: The control MUST be operable by keyboard alone, carry an accessible name that
  states both its purpose and current setting, and announce the change when the theme
  switches.
- **FR-006d**: The stored preference MUST be applied before first paint. A flash of the wrong
  theme is a defect, not a cosmetic issue.
- **FR-007**: A theme change MUST take effect without a page reload.
- **FR-008**: Every foreground/background pairing the interface uses MUST meet the
  Principle III contrast thresholds **in both themes**, verified by measurement.
- **FR-009**: The focus indicator MUST be clearly visible in both themes, and MUST be
  measured in both. It MUST NOT be assumed that one indicator works for both.
- **FR-010**: A theme whose contrast has not been measured MUST NOT ship.
- **FR-011**: No state MUST be conveyed by colour alone in either theme.

**Motion**

- **FR-012**: Transitions MUST use defined duration and easing tokens, and are limited to:
  hover and focus state changes on interactive controls, and the confirmation dialog opening
  and closing. Everything else changes instantly.
- **FR-012a**: The dialog transition MUST NOT delay focus arriving inside the dialog, nor
  delay any announcement. The native open behaviour is unchanged; the transition is purely
  visual and runs alongside it.
- **FR-012b**: The following MUST NOT be animated, each for a stated reason:
  - **list reordering** — focus is handed to the moving row (FR-014);
  - **the validation error appearing** — it is announced the moment it appears, and animating
    it risks delaying or desynchronising that;
  - **a theme change** — cross-fading the whole page is motion the user did not ask for while
    doing something unrelated.
- **FR-013**: When the user has requested reduced motion, no animation MUST play, and every
  interaction MUST reach the same end state immediately.
- **FR-014**: A list reordering MUST NOT be animated while focus is being moved
  programmatically.
- **FR-015**: No information MUST be carried by motion alone.

**Layout and state**

- **FR-016**: Breakpoints MUST be defined as tokens rather than repeated literals.
- **FR-017**: The empty, loading and error states MUST be deliberately styled in both themes.

**Non-regression**

- **FR-018**: No component behaviour MUST change. Focus handling, announcements, dialog
  semantics and keyboard operation stay exactly as they are.
- **FR-019**: All existing automated tests MUST pass without modification. A test requiring a
  change indicates a behaviour change, which this feature forbids.
- **FR-020**: Contrast verification MUST read colour values from the token source itself.
  No second copy of the palette may exist.
- **FR-020a**: Verification MUST cover both themes, and MUST fail the build when any pairing
  the interface actually uses falls below its threshold.
- **FR-020b**: A colour token that no declared pairing references MUST be reported, not
  silently ignored — an unmeasured colour in the file is indistinguishable from a forgotten
  one.
- **FR-020c**: If the token source cannot be read or parsed, verification MUST fail loudly
  rather than pass with nothing measured.

### Key Entities

- **Token**: A named design decision — a role, a value per theme, and a category (colour,
  spacing, type, radius, shadow, duration, easing, breakpoint). Named for what it is *for*,
  not what it looks like.
- **Theme**: A complete set of values for every colour token. Two exist: light and dark.
  Neither is a modification of the other; each is measured independently.

## Open Questions

These three block `/speckit-plan`.

### Q1: Is there an in-app theme control, or OS preference only? *(FR-006)*

| Option | Answer | Implications |
|--------|--------|--------------|
| A | OS preference only | Smallest surface. No control to build, no preference to store, no new state for axe and E2E to cover. A user who wants dark in a light OS cannot have it. |
| B | OS preference plus an in-app toggle, remembered | More control for the user. Adds a persisted preference, a new interactive control that must be keyboard-operable and announced, a third state ("follow system"), and a potential flash of the wrong theme before the stored value is read. |
| Custom | Provide your own | — |

**Your choice**: _[awaiting response]_

### Q2: What actually animates? *(FR-012)*

The obvious candidate — a task sliding to its new position when completed — is **prohibited
by Principle VI**, because that is exactly where focus is handed over.

| Option | Answer | Implications |
|--------|--------|--------------|
| A | Hover and focus states only | Smallest and safest. No interaction with focus movement, announcements or layout. Barely noticeable, which may be the point. |
| B | Hover/focus, plus dialog open and close | Adds the one transition users most expect. The dialog's open/close is browser-driven, so it must not fight the native focus behaviour. |
| C | Hover/focus, dialog, and the validation error appearing | Most expressive. The error already announces itself; an appearing animation must not delay or duplicate that. |
| Custom | Provide your own | — |

**Your choice**: _[awaiting response]_

### Q3: How does contrast verification read the palette? *(FR-020)*

| Option | Answer | Implications |
|--------|--------|--------------|
| A | The checker parses the token source | One source of truth; a token change is automatically measured. Requires the verification script to read and interpret the token file, and to know which pairings are real. |
| B | Tokens are declared in a shared data file that both the stylesheet and the checker consume | Avoids parsing, keeps one source. Adds a build step to turn that file into stylesheet variables. |
| C | The checker keeps its own copy, with a test asserting the two match | Simplest to write. Two copies exist, and the test is the only thing preventing drift. |
| Custom | Provide your own | — |

**Your choice**: _[awaiting response]_

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Automated accessibility checking reports zero violations in **both themes**
  across all five states already covered: empty, populated, validation error shown,
  confirmation dialog open, and all-tasks-completed.
- **SC-002**: 100% of the foreground/background pairings the interface uses meet the AA
  thresholds, measured, in both themes.
- **SC-012**: Changing a colour token and running the check requires no other edit — the
  measurement follows the token automatically, and no copy of the palette exists elsewhere.
- **SC-003**: Zero literal colour or spacing values remain in component stylesheets.
- **SC-004**: All 31 existing end-to-end tests and all 48 component tests pass **without
  modification**.
- **SC-005**: The focus indicator is measurably visible in both themes on every interactive
  element.
- **SC-006**: With reduced motion requested, no animation occurs anywhere, and every
  interaction reaches the same end state as without it.
- **SC-011**: Completing a task, showing a validation error, and switching theme are all
  instant in both motion settings — no transition is applied to any of the three.
- **SC-007**: With the control set to follow the system, changing the system theme updates
  the interface without a reload.
- **SC-009**: An explicit light or dark choice survives a reload and is applied before first
  paint — no flash of the other theme at any point.
- **SC-010**: The theme control is reachable and operable by keyboard alone, and both its
  current setting and each change are announced.
- **SC-008**: A reviewer can change one token and observe every use of that concept change
  together, with no place left behind.

## Assumptions

- **Rendered output in light mode is unchanged.** Tokenising is a transcription, not a
  redesign. A visible difference means a value was copied wrong, and the existing contrast
  measurements and axe assertions are the check.
- **No new runtime dependency.** The stack is unchanged — CSS Modules, no component library,
  no CSS-in-JS (Technology Stack, binding, not amended by v1.2.0).
- **Structural pixel values are exempt** from the token rule where they are not design
  decisions — a `1px` hairline border, a focus-ring width. Where a value expresses rhythm or
  scale, it is a token.
- **Forced-colors / high-contrast mode is out of scope** for this feature. It overrides the
  palette entirely and deserves its own spec rather than a partial attempt here.
- **No theme flash is acceptable** in either direction; the correct theme applies on first
  paint.
- **Users with no expressed system preference** receive the light theme, matching the
  current behaviour.
