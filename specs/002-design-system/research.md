# Phase 0 Research: Design System

**Feature**: 002-design-system | **Date**: 2026-10-30

Five decisions the spec implied but did not settle.

---

## R1 — Expressing three theme states in CSS alone

**Decision**: `<html>` carries `data-theme` **only when an explicit choice exists**. Its
absence means "follow the system".

```css
:root                             { /* light */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark  */ }
}
:root[data-theme='dark']          { /* dark  */ }
```

**Rationale**: three states, no JavaScript in the rendering path. Light is the base; the
system may override to dark unless the user forced light; an explicit dark always wins. When
the OS preference changes while the app is open, the browser re-evaluates the media query on
its own — satisfying FR-006b and SC-007 with no listener, no re-render, and no risk of the
app and the OS disagreeing.

Absence-means-system is the key choice. The obvious alternative — `data-theme="system"` —
reads more explicitly in the DOM but requires `:root[data-theme='system']` inside the media
query *and* a bare `:root` fallback for the first paint before the script runs, which is two
code paths for one state.

**Alternatives considered**: a `theme` class toggled by React (rejected — cannot run before
first paint, FR-006d); CSS custom properties recomputed in JavaScript (rejected — duplicates
in script what the cascade already does, and breaks live OS switching); separate stylesheets
per theme (rejected — doubles the payload and makes a token change two edits).

---

## R2 — Applying the stored theme before first paint

**Decision**: a ~6-line synchronous `<script>` in `index.html`, before the module bundle.
Read the key, validate against the three allowed values, set `data-theme` for `light` or
`dark`, do nothing for anything else.

**Rationale**: FR-006d calls a flash of the wrong theme a defect rather than a cosmetic
issue, and nothing in a client-rendered React app runs early enough to prevent it. The
browser paints before any component mounts.

Against Principle V: this is not an abstraction, a dependency, or generality for a future
need. It is the minimum code that can execute at the only moment that satisfies the
requirement, and it has exactly one call site.

The validation matters more than it looks. A stored value of `"Dark"`, `"true"`, or anything
from an older version of the control must be ignored rather than written to the attribute,
or the selector set silently stops matching and the user gets light with no explanation. The
spec lists "stored preference missing, corrupt, or from an older version" as an edge case.

Wrapping in `try` covers blocked or unavailable storage: the script does nothing, no
attribute is set, and the system preference applies — the correct fallback and the spec's
"storage unavailable" case.

**Alternatives considered**: set the attribute in a React effect (rejected — guaranteed
flash); server-render it (rejected — SSR is out of scope in the constitution); block
rendering until storage is read (rejected — trades a flash for a blank screen); accept the
flash (rejected — contradicts FR-006d).

---

## R3 — The shape of the theme control

**Decision**: a native `<select>` with a visible `<label>Theme</label>` and three options.

**Rationale**: one tab stop, keyboard behaviour supplied by the browser, and a screen reader
announces both the control's name and its current value — "Theme, combo box, Follow system".
Principle III asks for native semantics before ARIA, and this needs no `role=` at all.

A radio group in a `<fieldset>` with a `<legend>` was the main contender and is arguably
better at communicating "three mutually exclusive choices". It was rejected on surface area:
three tab-reachable inputs instead of one, three labels to name, and more visual space in a
header that currently holds only a heading. For a preference the user sets rarely, a compact
single control is the better trade.

A toggle button was rejected outright: it expresses two states, and there are three. The
difference between "dark" and "follow a system that is currently dark" is exactly what
FR-006b is about.

**Alternatives considered**: radio group (above); icon-only button cycling states (rejected —
no accessible name without inventing one, and cycling hides the available options); a
settings dialog (rejected — a whole modal for one preference, Principle V).

---

## R4 — How the contrast checker reads tokens

**Decision**: parse `tokens.css` directly with a regex over `--name: value` declarations,
grouped by selector block. Build a light map and a dark map. Resolve `var()` references with
a cycle guard. Evaluate a hand-written list of pairings against both maps.

**Rationale**: FR-020 requires one definition of the palette, and the stylesheet is where it
has to live for the browser. Parsing it is therefore the only way to measure the real values
without a build step (which Principle V would want justified) or a second file (which is the
drift FR-020 exists to prevent).

The parsing is narrow on purpose. It handles custom property declarations and nothing else —
no general CSS parser, no dependency. If `tokens.css` ever grows constructs this cannot read,
the checker fails loudly (FR-020c) rather than measuring a subset and reporting success.

**The pairings list stays hand-written**, and that is not a weakness. A token file says what
colours exist; it cannot say which ones appear *against* each other. That relationship is
authored knowledge, and writing it down is what makes the check meaningful rather than
exhaustive-and-useless.

**Orphan reporting** (FR-020b) closes the loop: any colour token no pairing mentions is
reported. Today's checker demonstrates why this is needed — `#b3261e`, the invalid-input
border, is live in the stylesheets and has never been measured. It passes at 6.11:1 against
the page. Nothing would have told us if it did not.

**Alternatives considered**: a shared JSON/JS token file consumed by both the stylesheet and
the checker via a build step (rejected — real, and the right answer at larger scale, but adds
a build step for nine colours); keeping the hardcoded copy with a test asserting equality
(rejected — two sources of truth and a test as the only thing preventing drift).

---

## R5 — Transitioning a native `<dialog>` without delaying focus

**Decision**: transition `opacity` on the `[open]` state. Never transition `display`, and
never gate `showModal()` behind an animation.

**Rationale**: `showModal()` moves focus synchronously as part of opening. FR-012a requires
the transition to be purely visual and never delay that, and FR-022 from `001-todo-core`
requires focus to land on Cancel — a requirement already verified by a passing E2E test.

Transitioning `opacity` keeps the element present and focusable for the whole transition, so
the browser's focus behaviour is untouched; the dialog is merely fading while already focused.
Transitioning `display`, or deferring `showModal()` until an animation finishes, would both
put focus movement behind a timer.

The existing E2E test `initial focus is on Cancel, the safe choice` is the guard. If the
transition ever starts gating focus, that test fails — which is why it must keep passing
unmodified rather than being adjusted to tolerate a delay.

**Alternatives considered**: `@starting-style` with `transition-behavior: allow-discrete`
(rejected for now — the modern idiom and worth revisiting, but it entangles the transition
with `display`, which is precisely the mechanism that risks the focus timing); animating the
backdrop only (rejected — the dialog itself appearing abruptly is the jarring part);
JavaScript-driven animation (rejected — more code to achieve what CSS does, and it would have
to coordinate with native focus).
