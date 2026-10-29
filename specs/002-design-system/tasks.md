---

description: "Task list for 002-design-system"
---

# Tasks: Design System

**Input**: Design documents from `/specs/002-design-system/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/tokens.md](./contracts/tokens.md),
[quickstart.md](./quickstart.md)

**Tests**: Required. Principle II is binding. All new coverage here is **additive** — no
existing test file may be edited (FR-019).

## ⚠️ The story order is deliberately inverted

**US2 (tokens) is P2 but is built first. US1 (dark theme) is P1 but comes second.**

A measured dark theme needs somewhere to put dark values and something to measure, and both
arrive with the token layer. Building themes first would mean a second set of hardcoded
colours — the exact problem this feature removes.

The spec's priorities are correct as *user value*: the dark theme is what a person sees, the
token layer is invisible plumbing. They are simply not a build order. Recorded here rather
than silently reordered, so nobody later reads it as a mistake. See plan.md § Sequencing.

Order: **Setup → Foundational → tokens (US2) → themes + control (US1) → motion (US3) → Polish**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, dependencies already satisfied
- Paths are repository-relative and exact

---

## Phase 1: Setup

**Purpose**: Make a place for tokens to live and confirm the starting state is what the plan
assumed.

- [X] T001 Create `frontend/src/styles/` and an empty `frontend/src/styles/tokens.css`; import it from `frontend/src/main.tsx` **before** `./index.css` so component styles can reference tokens.
- [X] T002 Record the pre-change baseline: run `npm run check:contrast` and save the 17 light-mode ratios. These are the numbers the transcription must reproduce exactly (data-model.md § Light). A changed ratio later means a mistyped value, not a design choice.
- [X] T003 Confirm the starting inventory matches plan.md: 9 live colours and the spacing/type values listed in data-model.md. `#c8c8d0` appears **only in a comment** and is dead — do not carry it into tokens.

**Checkpoint**: tokens.css exists, is imported, and the baseline ratios are written down.

---

## Phase 2: Foundational (Blocking)

**Purpose**: Define the full token set — both themes — before any stylesheet references it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 (FR-001, FR-005) Write the colour tokens into `frontend/src/styles/tokens.css` for **both themes**, using the exact values in data-model.md § Colour tokens. Structure exactly as contracts/tokens.md § Required structure specifies: light in bare `:root`; dark in `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` **and** `:root[data-theme='dark']`. Both dark blocks MUST declare an identical token set.
- [X] T005 [P] (FR-001, FR-016) Add the non-colour tokens to `frontend/src/styles/tokens.css` per data-model.md § Non-colour tokens: `--space-1`…`--space-8`, `--text-sm`…`--text-xl`, `--radius-sm`/`-md`, `--border-width` `1px`, `--focus-ring-width` `3px`, `--focus-ring-offset` `3px`, `--motion-fast` `120ms`, `--motion-ease` `cubic-bezier(0.2, 0, 0, 1)`, `--bp-narrow` `320px`, `--measure` `44rem`, `--field-min` `16rem`, `--dialog-max` `28rem`.
- [X] T006 Name every token by **role, not appearance** (FR-003). `--color-surface`, never `--color-white`. Verify no token name describes a colour, a size in words, or a specific component.
- [X] T007 Keep `--color-danger` and `--color-danger-fill` as **separate tokens** even though both are `#8c1d18` in light (FR-004). They diverge in dark — text must be light on a dark page, a fill must be dark enough to carry light text. Same for `--color-danger-invalid`, which is `#b3261e` and a third distinct role.

**Checkpoint**: The complete token vocabulary exists in both themes. Nothing references it yet.

---

## Phase 3: User Story 2 — The interface is internally consistent (Priority: P2) 🎯 built first

**Goal**: Every value in every component stylesheet comes from a token. Rendered output in
light mode is unchanged.

**Independent Test**: Search every `*.module.css` for `#`, `rgb(`, `hsl(` — no matches. Change
one token and watch every use of that concept change together.

### Tests for User Story 2

- [X] T008 [P] [US2] Rewrite `frontend/scripts/check-contrast.mjs`: **delete the hardcoded palette entirely** (FR-020), parse `tokens.css` for `--name: value` declarations grouped by selector block, build a light map and a dark map, resolve `var()` references with a cycle guard, and evaluate the 17 pairings from contracts/tokens.md § Pairing contract against **both** maps — 34 measurements.
- [X] T009 [US2] Implement the four failure modes in `frontend/scripts/check-contrast.mjs`, each exiting non-zero with a message naming the cause: (a) any pairing below threshold, naming pairing/theme/measured/required; (b) a colour token referenced by **no** pairing — reported, not skipped (FR-020b); (c) a colour token present in one theme and missing from the other; (d) `tokens.css` unreadable, unparseable, or containing an unresolvable or cyclic `var()` — **never a silent pass** (FR-020c). Depends on T008.
- [X] T010 [P] [US2] Verify each failure mode by deliberately breaking `tokens.css` one way at a time and confirming a non-zero exit and the right message, then reverting. A gate nobody has seen fail is a gate nobody knows works. Depends on T009.

### Implementation for User Story 2

- [X] T011 [US2] (FR-002, FR-013) Convert `frontend/src/index.css` to reference tokens. Keep the `prefers-reduced-motion` block and extend it to cover the new motion tokens. Remove the `color-scheme: light` lock — the dark theme replaces it. Depends on T004, T005.
- [X] T012 [P] [US2] Convert `frontend/src/App.module.css` to tokens only. Depends on T004, T005.
- [X] T013 [P] [US2] Convert `frontend/src/components/AddTaskForm/AddTaskForm.module.css` to tokens only, including the explicit white focus separator (`--color-focus-halo`) on the submit button. Depends on T004, T005.
- [X] T014 [P] [US2] Convert `frontend/src/components/TaskItem/TaskItem.module.css` to tokens only. The completed-task colour is `--color-text-muted`; the row border is `--color-border`. Depends on T004, T005.
- [X] T015 [P] [US2] Convert `frontend/src/components/TaskList/TaskList.module.css` to tokens only. Depends on T004, T005.
- [X] T016 [P] [US2] Convert `frontend/src/components/DeleteConfirmDialog/DeleteConfirmDialog.module.css` to tokens only, using `--color-danger-fill` / `--color-on-danger` for the destructive button and `--color-focus-halo` for its ring separator. Depends on T004, T005.
- [X] T017 [P] [US2] Convert `frontend/src/components/LiveRegion/LiveRegion.module.css` to tokens where applicable (the visually-hidden clip values are structural, not design decisions — they stay literal). Depends on T004, T005.
- [X] T018 [US2] (FR-002) Use no fallback values in `var()`. A missing token must fail visibly in development rather than silently render a second, unmeasured colour (contracts/tokens.md § Consumption).
- [X] T019 [US2] (FR-002, SC-003) **Verify by search, not assertion**: `grep -rE "#[0-9a-fA-F]{3,}|rgb\(|hsl\(" frontend/src --include=*.module.css` returns nothing. Depends on T011–T017.
- [X] T020 [US2] (FR-018, SC-004) **Verify the transcription**: run `npm run check:contrast` and confirm every light-mode ratio equals the T002 baseline and the table in data-model.md § Light **exactly**. Any difference is a mistyped value, not a design change. Depends on T019.
- [X] T021 [US2] Run `npm test` and `npm run test:e2e`. All 48 component and 31 E2E tests must pass **with no test file edited** (FR-019, SC-004). Confirm with `git diff --name-only` that no file under a `__tests__`, `*.test.tsx` or `tests/e2e/` path appears. Depends on T019.

**Checkpoint**: One vocabulary, light mode pixel-identical, every existing test still green.

> **Phase 3 result — 2026-10-30. Complete.**
>
> - Zero literal colours in any `*.module.css`. The single `rgb(0 0 0 / 50%)` is the dialog
>   backdrop scrim — not a theme colour, no foreground is ever placed on it, so it has no
>   pairing to measure.
> - **34 measurements across both themes, all AA.** Every light ratio identical to the
>   baseline recorded in T002 before any file was touched.
> - 48 component and 31 E2E tests pass **with no test file edited** (`git diff --name-only`
>   shows no test path).
> - The checker's four failure modes were each verified by deliberately breaking
>   `tokens.css`: dimmed text → 2 FAILs; unused token → `ORPHAN`; light-only token →
>   "defined in light but not in dark"; truncated file → "no custom-property blocks found".
>
> One thing that needed checking rather than assuming: the raw multiset diff of baseline vs
> new light ratios reported `3.19` and `9.11` as "lost". They were not. The old checker
> measured two pairs of identical colour combinations under different labels
> (`error text on surface` / `row Delete button text on surface`, and
> `row border` / `empty-state border`). Comparing distinct values confirmed no baseline
> ratio is absent.

---

## Phase 4: User Story 1 — The app matches how I've set up my computer (Priority: P1)

**Goal**: A dark theme that follows the system, plus a persisted three-state override.

**Independent Test**: Set the OS to dark, open the app, walk all five states — each rendered
in dark, each axe-clean, focus visible everywhere. Switch the OS to light and repeat.

### Tests for User Story 1

- [X] T022 [P] [US1] (FR-006, FR-006c) Component tests in `frontend/src/components/ThemeControl/ThemeControl.test.tsx`: renders three options; reflects the stored value; writes on change; announces through the announcer prop; **treats an invalid stored value (`"Dark"`, `"true"`, `""`) as `system`**; carries no `role=` attribute. Depends on T026.
- [X] T023 [P] [US1] (FR-006a, FR-006b) Component tests in `frontend/src/hooks/useTheme.test.ts`: validates on read against exactly `system | light | dark`; omits `data-theme` for `system`; sets it for the other two; survives `localStorage` throwing. Depends on T025.
- [X] T024 [US1] (FR-005, FR-006b, FR-006d, FR-007, SC-001) E2E spec `frontend/tests/e2e/theme.spec.ts`: dark theme axe-clean across all five states (empty, populated, validation error, dialog open, all completed); an explicit choice survives a reload **with no flash of the other theme**; an explicit choice is **not** overridden when the OS preference changes; returning to "Follow system" resumes following it. Use Playwright's `colorScheme` emulation. Depends on T028.

### Implementation for User Story 1

- [X] T025 [US1] (FR-006, FR-006a, FR-006b) Create `frontend/src/hooks/useTheme.ts`: `ThemePreference = 'system' | 'light' | 'dark'`. Read and **validate** `localStorage['taskflow-theme']` — anything not in the union is treated as `system` and MUST NOT be written to the attribute. Apply by setting `data-theme` on `<html>`, **omitting it entirely for `system`** (contracts/tokens.md § Theme preference contract). Wrap storage access so a throw degrades to `system`.
- [X] T026 [US1] (FR-006c, FR-011) Create `frontend/src/components/ThemeControl/` — a native `<select>` with a visible `<label>Theme</label>` and three options ("Follow system", "Light", "Dark"). **Zero `role=` attributes**; `<select>` and `<label>` carry the semantics. On change: persist, apply, and announce through the **existing** live region — do not add a second one. Depends on T025.
- [X] T027 [US1] Mount `ThemeControl` in `frontend/src/App.tsx` header and pass the existing `announce` from `useAnnouncer`. Depends on T026.
- [X] T028 [US1] (FR-006d) Add the pre-paint script to `frontend/index.html` — roughly six lines, synchronous, before the module bundle: read `taskflow-theme`, accept only `'light'` or `'dark'`, set `data-theme`, wrap in `try` so blocked storage is a no-op. This is the single Complexity Tracking entry in plan.md; it exists because React has already missed first paint (FR-006d). Depends on T025.
- [X] T029 [US1] (FR-009) Verify the focus ring is visible in **dark** on every interactive element — title input, Add button, each checkbox, each delete button, the theme control, both dialog buttons. The light theme's near-black ring would be invisible here; `--color-focus-ring` inverts to white, and `--color-focus-halo` inverts with it. Depends on T011–T017, T004.
- [X] T030 [US1] (FR-008, FR-010, FR-020a, SC-002) Run `npm run check:contrast` and confirm **all 34 measurements pass** — 17 pairings × 2 themes — matching data-model.md § Dark. Depends on T004, T009.

**Checkpoint**: Both themes render, both measured, the control works and persists.

> **Phase 4 result — 2026-10-30. Complete.**
>
> - 79 component tests (was 48) and **37 E2E (was 31) — the 31 unmodified**.
> - 34 contrast measurements still clean; lint and types clean.
> - The no-flash test reads `data-theme` **immediately after reload**, before waiting for
>   the app to settle. Waiting first would let a flash pass, so only the inline script can
>   satisfy it.
> - The focus-ring test asserts the ring is **not** the light ink value, rather than
>   hardcoding white — it catches the real failure (reusing `#1a1a1f` on a dark page) without
>   pinning the test to one palette choice.
>
> `index.css` traded `color-scheme: light` for `light dark`. The lock existed because a dark
> user-agent palette would flip defaults while component styles stayed fixed; that reason is
> gone now both themes exist and are measured. Scrollbars, caret and native form chrome now
> follow the active theme.

---

## Phase 5: User Story 3 — Motion is purposeful, and optional (Priority: P3)

**Goal**: A small, defined motion vocabulary that disappears entirely on request.

**Independent Test**: With reduced motion off, transitions occur and complete quickly. Turn it
on; the same interactions are instant with identical end states.

### Tests for User Story 3

- [X] T031 [P] [US3] (FR-013, SC-006) Extend `frontend/tests/e2e/theme.spec.ts` (or a new motion spec) to assert that with `prefers-reduced-motion: reduce` emulated, no animation occurs and every interaction reaches the same end state. Depends on T033.
- [X] T032 [US3] (FR-012b, SC-011) E2E assertion that completing a task, showing a validation error, and switching theme are **all instant in both motion settings** — none of the three may be animated (SC-011, FR-012b). Depends on T033.

### Implementation for User Story 3

- [X] T033 [US3] (FR-012) Apply `--motion-fast` and `--motion-ease` to hover and focus state changes on interactive controls only, across the component stylesheets. Depends on T005, T011–T017.
- [X] T034 [US3] (FR-012, FR-012a) Add the dialog open/close transition in `DeleteConfirmDialog.module.css` as an **`opacity`** transition on `[open]`. **Never transition `display`**, and never defer `showModal()` behind an animation — the element must stay present and focusable throughout so native focus movement is untouched (FR-012a, research.md R5). Depends on T016.
- [X] T035 [US3] ⚠️ Verify the existing E2E test `initial focus is on Cancel, the safe choice` still passes **unmodified**. It is the guard for T034: if the transition ever starts gating focus, that test fails. Adjusting it to tolerate a delay would be the failure, not the fix. Depends on T034.
- [X] T036 [US3] (FR-012b, FR-014, FR-015) Confirm nothing animates the list reorder, the validation error, or the theme change. Each exclusion has a recorded reason in contracts/tokens.md § Motion contract — do not add transitions to these three. Depends on T033.
- [X] T037 [US3] (FR-013) Verify the `prefers-reduced-motion` block in `frontend/src/index.css` zeroes the motion tokens, so a single rule covers every transition added in T033–T034. Depends on T033, T034.

**Checkpoint**: All three stories complete.

> **Phase 5 result — 2026-10-30. Complete.**
>
> Animated: hover/focus on interactive controls, and the dialog via `opacity` only.
> The three exclusions are verified **by measurement**, not by reading the CSS —
> `motion.spec.ts` reads computed `transition-duration` and asserts 0 on the task row, the
> validation error, and `body`.
>
> `initial focus is on Cancel, the safe choice` still passes **unmodified** with the dialog
> transition in place — T035's guard held.
>
> Reduced motion asserts durations **collapse** (< 0.001s), not merely shorten. A 50 ms
> "subtle" transition would fail, which is the point.

---

## Phase 6: Polish & Cross-Cutting

- [X] T038 Run the full gate sequence in constitution order: `npm run lint`, `npm run typecheck`, `npm run check:contrast`, `npm test`, `npm run test:e2e`, plus backend `ruff check .`, `mypy --strict src/`, `pytest`. All must pass.
- [X] T039 [P] Wire the contrast gate's new behaviour into `.github/workflows/ci.yml` if the command or its arguments changed; confirm the step still runs before the unit stage.
- [X] T040 [P] Confirm **zero** `role=` and zero `aria-checked` attributes remain in `frontend/src` production code, now including `ThemeControl`.
- [X] T041 [P] (FR-016, FR-017) Verify the cross-cutting checks from quickstart.md § F in **both themes**: 320 px viewport and 200% zoom without horizontal overflow; the dialog usable at 320 px.
- [X] T042 (FR-006a) Verify the storage edge cases from quickstart.md § F: `"Dark"` wrong case, `"true"`, missing key, and storage blocked — each falls back to `system` with no error.
- [ ] T043 (FR-006c, FR-011, SC-005) **Manual screen-reader verification** (NVDA or VoiceOver, via `open-a11y-chrome.bat`) of the theme control — a new interactive element, so Principle III requires it. Listen for: the control announcing **name and current value** on focus; the change announced **once, not twice**; a completed task's state still conveyed by the checkbox in dark; the delete dialog still naming the task in **both** themes.
- [X] T044 Update `CLAUDE.md`: Principle VI is now satisfied, the gotchas list gains the token rule, and the commands list gains anything new. Remove the VI entry from the constitution's **Known exceptions** block in `.specify/memory/constitution.md` — leaving a satisfied exception in place is how that list stops being read.
- [X] T045 Update `README.md`: the design system exists, both themes are measured, and only Principle VII remains unsatisfied.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** → no dependencies
- **Phase 2 Foundational** → depends on Phase 1; **blocks everything**
- **Phase 3 US2 (tokens)** → depends on Phase 2. **Must precede US1.**
- **Phase 4 US1 (themes)** → depends on Phase 3. Cannot start earlier: there is nothing to put dark values into until tokens exist.
- **Phase 5 US3 (motion)** → depends on Phase 3 for the tokens, Phase 4 only for the dialog work.
- **Phase 6 Polish** → depends on all stories.

### Story independence — an honest note

Unlike `001-todo-core`, these stories are **not independently deliverable**. US1 depends on
US2 structurally, not just conveniently. US3 could in principle ship without US1, but its
dialog transition touches a file US1 does not, so there is no real conflict.

What *is* independently testable is each story's acceptance criteria once its phase completes.

### Parallel opportunities

- **Phase 2**: T005 alongside T004
- **Phase 3**: T012–T017 are six different stylesheets and can run together; T008 runs alongside them
- **Phase 4**: T022 and T023 together
- **Phase 5**: T031 alongside T033
- **Phase 6**: T039, T040, T041 together

---

## Implementation Strategy

### Incremental delivery

1. Setup + Foundational → the vocabulary exists
2. **US2** → one source of values, light mode unchanged, every existing test still green.
   **Stop and validate here** — if the light theme shifted at all, a value was mistyped, and
   that is far cheaper to find now than after the dark theme is layered on top.
3. **US1** → the dark theme and the control. The visible win.
4. **US3** → motion.
5. Polish.

---

## Notes

- **45 tasks.** Over the ten-task threshold, so run `/speckit-analyze` before
  `/speckit-implement`.
- **No existing test file may be edited.** T021 and T035 check this explicitly. A test that
  needs changing means behaviour drifted, which FR-018 forbids.
- **No new runtime dependency.** CSS Modules, no component library, no CSS-in-JS — the
  Technology Stack section is binding and was not amended by v1.2.0.
- **Principle VII (Local Observability) is out of scope here.** It was added in v1.3.0 and is
  tracked as a separate known exception in the constitution's Governance section. Mixing an
  observability subsystem into a styling change would breach this feature's own
  non-regression promise.
- The one Complexity Tracking entry is T028, the pre-paint script. It is justified in plan.md
  against Principle V; the alternatives all cost more than six lines.
