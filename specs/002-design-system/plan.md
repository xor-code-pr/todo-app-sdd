# Implementation Plan: Design System

**Branch**: `002-design-system` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-design-system/spec.md`

## Summary

Replace nine hardcoded colours and a scattered set of spacing values with one token layer,
add a measured dark theme selected by system preference with a persisted three-state
override, and introduce a small motion vocabulary — without changing a single behaviour.

The work is mostly transcription. The parts that are not:

- **Applying a stored theme before first paint** (FR-006d), which in a client-rendered app
  means executing before React does.
- **Teaching the contrast checker to read tokens** instead of its own copy of the palette,
  which is what stops the gate rotting the moment a colour changes.
- **Not animating the things it would be natural to animate** — the list reorder, the
  validation error, the theme switch — each for a reason recorded in the spec.

## Technical Context

**Language/Version**: TypeScript 5.6 `strict`, Node 26

**Primary Dependencies**: Unchanged. React 18, Vite, CSS Modules. **No new runtime
dependency.** The binding stack forbids a component library and CSS-in-JS, and nothing here
needs either.

**Storage**: `localStorage`, one key, for the theme preference. No backend involvement; the
API, database and migrations are untouched by this feature.

**Testing**: Existing suites unchanged — Vitest + RTL, Playwright + `@axe-core/playwright`.
`scripts/check-contrast.mjs` is rewritten to read tokens and run twice.

**Target Platform**: Evergreen desktop browser. `prefers-color-scheme` and
`prefers-reduced-motion` are both required and both long-supported.

**Project Type**: Frontend-only change to an existing web application.

**Performance Goals**: None. One constraint instead: the stored theme must be applied before
first paint, so the work that reads it must be synchronous and tiny.

**Constraints**: Light-mode rendered output must be unchanged. Every existing test must pass
**without modification** (FR-019). A test that needs editing means a behaviour changed.

**Scale/Scope**: 7 stylesheets, 9 live colours, ~15 spacing and type values, 1 new component,
1 new hook, 1 rewritten verification script.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0

| Principle | Gate | Verdict |
|---|---|---|
| I. Spec-Driven Delivery | Spec exists, clarified (3 Q&A), no open markers | ✅ Pass |
| II. Test-Backed Delivery | ≥80% domain coverage, contract test per endpoint, E2E per story | ✅ Pass — no backend change; existing suites must pass unmodified, plus new coverage for the theme control |
| III. Accessibility | WCAG 2.2 AA, axe zero violations, native HTML before ARIA | ✅ Planned — and tightened: every state is now checked in **two** themes |
| IV. Typed Contracts | TS `strict`, no `any` | ✅ Pass — the theme state is a three-member union, not a boolean |
| V. Simplicity & YAGNI | No abstraction at one call site, deps justified, no new library | ✅ Pass — zero new dependencies; one justified inline script, see research.md R2 |
| VI. Coherent Visual System | Tokens, both themes measured, bounded motion, designed states | ✅ **This feature exists to satisfy it** |
| VII. Local Observability | Telemetry to a local file, four signals, no user content | ⬜ **Out of scope — known exception** |

**On Principle VII**: added in constitution v1.3.0, the same day as this plan. No telemetry
exists anywhere in the repository, and this feature does not introduce any. That is recorded
in Governance as a documented exception addressed by a future feature, not as a violation of
this plan. Mixing an observability subsystem into a styling change would make both harder to
review and would breach the spec's own non-regression promise.

### Post-Phase 1 re-check

| Principle | Re-verdict | Note |
|---|---|---|
| III | ✅ Pass | Theme control is a native `<select>` with a real `<label>`; zero new `role=` attributes. Focus ring gets a per-theme value — the current near-black would be invisible on dark. |
| IV | ✅ Pass | `ThemePreference = 'system' \| 'light' \| 'dark'`; the stored value is validated on read, not trusted. |
| V | ✅ Pass | One inline script (~6 lines), justified below. No build step, no data file, no dependency. |
| VI | ✅ Pass | All four areas addressed; contrast measured in both themes from the token source itself. |

## Architecture

### Token layer

One file, `frontend/src/styles/tokens.css`, imported once from `main.tsx` alongside
`index.css`. Not a CSS Module — these are global custom properties by design.

**Named by role, never by appearance** (FR-003). `--color-surface`, not `--color-white`. A
name describing a colour becomes a lie the moment the dark theme assigns it something else.

```
--color-page            page background
--color-surface         cards, rows, dialog
--color-text            body text
--color-text-muted      completed tasks, character counter
--color-border          row and card edges
--color-border-strong   input edges
--color-focus-ring      focus indicator           ← different per theme
--color-focus-halo      the separator inside the ring
--color-accent          Add Task fill
--color-on-accent       text on the accent fill
--color-danger          error text, delete affordance
--color-danger-invalid  invalid-input border      ← previously unmeasured
--space-1 … --space-8   spacing scale
--text-sm … --text-2xl  type scale
--radius-sm/-md         corner radii
--motion-fast           duration
--motion-ease           easing
--bp-narrow             320px breakpoint
```

**`--color-danger` and `--color-danger-invalid` stay separate tokens** even though both are
reds. They are different concepts — one is text, one is a border — and FR-004 forbids
collapsing values that merely coincide. Collapsing them would mean a later change to error
text silently restyles every invalid field.

### Theme selection — three states, two mechanisms

The `<html>` element carries `data-theme` **only when an explicit choice exists**. Its
absence means "follow the system". That makes CSS alone express all three states:

```css
:root                                        { /* light values */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light'])            { /* dark values */ }
}
:root[data-theme='dark']                     { /* dark values */ }
```

Reading it: light is the base; the system may override it to dark unless the user has forced
light; an explicit dark always wins. No JavaScript recomputes any colour — the browser does,
including when the OS preference changes live (FR-006b).

**The control** is a native `<select>` with a visible `<label>Theme</label>`. One tab stop,
browser-supplied keyboard behaviour, and a screen reader announces both the name and the
current value — "Theme, combo box, Follow system". A radio group was considered and rejected
in research.md R3.

### The inline script — the one thing that needs defending

FR-006d: the stored preference must apply **before first paint**. A flash of the wrong theme
is specified as a defect, not a cosmetic issue.

React cannot do this. By the time any component mounts, the browser has already painted. So
roughly six lines run synchronously in `index.html`, before the bundle loads: read the key,
validate it against the three allowed values, set `data-theme` if it is `light` or `dark`.

**Against Principle V**: this is not an abstraction, a dependency, or speculative generality.
It is the minimum code that can run at the only moment that satisfies the requirement. The
alternatives all cost more:

| Alternative | Cost |
|---|---|
| Set the attribute in React | Guaranteed flash on every load with a non-default theme |
| Server-render the attribute | Requires SSR — explicitly out of scope in the constitution |
| Block rendering until read | Trades a flash for a blank screen; worse |
| Accept the flash | Contradicts FR-006d, which calls it a defect |

The script is deliberately dumb: no error handling beyond a `try`, no feature detection, no
abstraction. If `localStorage` is unavailable it does nothing and the system preference
applies — which is the correct fallback, and covers the spec's "storage blocked" edge case.

### Contrast verification — reading the tokens

`scripts/check-contrast.mjs` is rewritten. Its hardcoded palette is **deleted** (FR-020).

1. **Parse.** Read `tokens.css`, extract `--name: value` declarations per selector block.
   Build two maps: light (from `:root`) and dark (from the dark blocks).
2. **Resolve.** A token whose value is `var(--other)` is followed, with a cycle guard. A
   value that cannot be resolved to a literal colour is an error, not a skip (FR-020c).
3. **Measure.** A declared list of pairings — foreground token, background token, threshold,
   label — is evaluated against **both** maps.
4. **Report orphans.** Any colour token no pairing references is reported (FR-020b).
   *Unmeasured* and *unused* are indistinguishable from the file alone, and the current
   checker demonstrates why: `--color-danger-invalid` exists in the stylesheets today and
   has never been measured. It happens to pass at 6.11:1. It might not have.
5. **Fail loudly.** Parse failure, unresolved reference, missing token, or any pairing below
   threshold exits non-zero.

The pairings list stays hand-written — it encodes *which combinations actually occur*, which
cannot be inferred from a token file. The values come from the tokens; the relationships come
from the author.

### Motion

Two tokens: `--motion-fast` and `--motion-ease`. Applied to exactly two things:

- **Hover and focus** on interactive controls. No layout, no focus handoff, no risk.
- **Dialog open and close**, as an opacity transition on the `[open]` state.

The dialog case needs care. `showModal()` moves focus synchronously, and the transition is
purely visual — it must never gate that. Transitioning `opacity` rather than `display`
guarantees the element is present and focusable throughout, so the browser's focus behaviour
is untouched (FR-012a).

**Not animated**, each for a stated reason already in the spec: the list reorder (focus is
handed to the moving row), the validation error (announced the instant it appears), and the
theme change (motion nobody asked for, during something unrelated).

`index.css` already zeroes animation and transition durations under
`prefers-reduced-motion: reduce`. That block stays and now covers the tokens too.

## Sequencing — the priority inversion

**US2 (tokens) is P2 but must be built before US1 (dark theme, P1).**

A measured dark theme requires somewhere to put the dark values and something to measure. Both
arrive with the token layer. Building the themes first would mean a second set of hardcoded
colours, which is the problem this feature exists to remove.

The spec's priorities are correct as *user value* — the dark theme is the visible win, the
token layer is invisible plumbing. They are simply not a build order, and recording that is
better than quietly reordering and leaving a reader to wonder whether it was a mistake.

The phases will therefore run: **tokens → themes → control → motion**.

## Non-regression strategy

FR-019 and SC-004 require every existing test to pass **without modification**. The method:

1. **Transcribe, don't redesign.** Each token takes the exact hex or rem value already in
   use. The light theme after tokenising is the same rendered output, not a similar one.
2. **The contrast numbers are the check.** Each light-mode pairing currently measures a known
   ratio — 17.33:1 for body text on surface, 3.19:1 for the row border, and so on. After
   tokenising, each must produce the *same* number. A changed ratio means a mistyped value.
3. **The existing suites are the behavioural check.** 31 E2E and 48 component tests run
   unchanged. Any test needing an edit indicates behaviour drifted, which this feature forbids.
4. **New coverage is additive only** — the theme control, and axe in the dark theme.

## Testing Strategy *(Principle II)*

| Layer | Scope |
|---|---|
| Contrast | Every declared pairing, **both themes**, from the token source. Orphan tokens reported. Runs in CI. |
| Component | New: theme control renders three options, reflects the stored value, writes on change, announces. Existing 48 unchanged. |
| E2E | New: dark theme renders and passes axe across all five states; the control persists across a reload; no flash on load with a stored theme. Existing 31 unchanged. |
| Manual | A screen-reader pass for the theme control — a new interactive element, so Principle III requires it. |

## Project Structure

### Documentation (this feature)

```text
specs/002-design-system/
├── plan.md              # This file
├── research.md          # Phase 0 — five decisions
├── data-model.md        # Phase 1 — the token inventory and its two themes
├── quickstart.md        # Phase 1 — how to verify
├── contracts/
│   └── tokens.md        # Phase 1 — token names, roles, and the pairing list
├── checklists/requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks
```

### Source Code

```text
frontend/
├── index.html                      + inline pre-paint theme script
├── src/
│   ├── styles/tokens.css           NEW — the single token source
│   ├── index.css                   trimmed to a baseline that references tokens
│   ├── hooks/useTheme.ts           NEW — read, validate, persist, apply
│   ├── components/
│   │   ├── ThemeControl/           NEW — native <select> + label
│   │   └── */*.module.css          rewritten to reference tokens only
└── scripts/check-contrast.mjs      rewritten: reads tokens, both themes, orphan report
```

**Structure Decision**: Frontend-only. No backend file is touched, no endpoint changes, no
migration. The generated API client is not regenerated because the schema does not change.

## Complexity Tracking

> One item. Everything else is within existing bounds.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Inline script in `index.html` | FR-006d requires the stored theme before first paint; React has already missed that moment | Setting it in React guarantees a visible flash on every load with a non-default theme, which FR-006d defines as a defect. SSR would avoid it but is out of scope in the constitution. |
