# Phase 1 Contract: Tokens and Verification

**Feature**: 002-design-system | **Date**: 2026-10-30

Two contracts. The **token file** is what the browser and the checker both read. The
**pairing list** is authored knowledge the checker cannot infer.

---

## 1. Token file contract

`frontend/src/styles/tokens.css` — the single source. Imported once from `main.tsx`. Not a
CSS Module: these are global custom properties by design.

### Required structure

The checker parses this file, so its shape is part of the contract.

```css
:root {
  /* light values, and every non-colour token */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    /* dark colour values */
  }
}

:root[data-theme='dark'] {
  /* dark colour values — identical set */
}
```

**Rules the parser depends on:**

1. Declarations are `--name: value;`, one per line.
2. Light values live in the bare `:root` block.
3. Dark values live in the two dark blocks, which **MUST declare an identical set of colour
   tokens**. A token present in one and missing from the other is an error, not a fallback.
4. A value may be `var(--other)`. References are resolved with a cycle guard; an unresolvable
   reference is an error (FR-020c).
5. No colour literal may appear anywhere else in `frontend/src`. Component stylesheets
   reference tokens only (FR-002).

### Consumption

```css
/* component.module.css */
.row {
  background: var(--color-surface);
  border: var(--border-width) solid var(--color-border);
  padding: var(--space-5) var(--space-6);
}
```

No fallback values in `var()`. A missing token must fail visibly during development rather
than silently render a second, unmeasured colour.

---

## 2. Pairing contract

A token file says which colours exist. It cannot say which appear **against** each other.
That is authored, and lives in the checker as a declared list.

| Foreground | Background | Threshold | What it is |
|---|---|---|---|
| `--color-text` | `--color-surface` | 4.5 | Body text on a row or dialog |
| `--color-text` | `--color-page` | 4.5 | Body text on the page |
| `--color-text-muted` | `--color-surface` | 4.5 | Completed task title |
| `--color-text-muted` | `--color-page` | 4.5 | Character counter |
| `--color-danger` | `--color-surface` | 4.5 | Error text, row delete button |
| `--color-danger` | `--color-page` | 4.5 | Form-level error text |
| `--color-on-accent` | `--color-accent` | 4.5 | "Add Task" label |
| `--color-on-danger` | `--color-danger-fill` | 4.5 | "Delete" label in the dialog |
| `--color-focus-ring` | `--color-page` | 3 | Focus ring over the page |
| `--color-focus-ring` | `--color-surface` | 3 | Focus ring over a row |
| `--color-focus-ring` | `--color-focus-halo` | 3 | Ring against its own separator |
| `--color-focus-halo` | `--color-accent` | 3 | Separator against the accent fill |
| `--color-focus-halo` | `--color-danger-fill` | 3 | Separator against the destructive fill |
| `--color-border` | `--color-page` | 3 | Row edge |
| `--color-border` | `--color-surface` | 3 | Row edge over a surface |
| `--color-border-strong` | `--color-page` | 3 | Input edge |
| `--color-danger-invalid` | `--color-surface` | 3 | Invalid input edge |

**17 pairings, evaluated twice — once per theme. 34 measurements.**

### Checker behaviour

| Condition | Result |
|---|---|
| Every pairing meets its threshold in both themes | exit 0 |
| Any pairing below threshold | exit 1, naming pairing, theme, measured and required |
| A colour token referenced by no pairing | **reported**, exit 1 (FR-020b) |
| A colour token in one theme but not the other | exit 1 |
| `var()` reference unresolvable or cyclic | exit 1 |
| `tokens.css` unreadable or unparseable | exit 1, **never a silent pass** (FR-020c) |

The orphan rule is the one most likely to be argued with, so to be explicit: a colour nobody
measured and a colour nobody uses look identical in the file. The shipped code already proves
the cost — `#b3261e` is live, unmeasured, and passes at 6.11:1 only by luck of the draw.

**The hardcoded palette in the current `check-contrast.mjs` is deleted** (FR-020). No second
copy may exist.

---

## 3. Theme preference contract

| | |
|---|---|
| Storage key | `taskflow-theme` |
| Permitted values | `system` · `light` · `dark` |
| Anything else | Treated as `system`; MUST NOT be written to the attribute |
| DOM | `data-theme` on `<html>`; **omitted** for `system` |
| Applied | Before first paint, by a synchronous script in `index.html` (FR-006d) |
| Storage unavailable | Script does nothing; system preference applies |

### The control

| | |
|---|---|
| Element | Native `<select>` with a visible `<label>` |
| Accessible name | "Theme" — announced with its current value |
| Options | "Follow system" · "Light" · "Dark" |
| Keyboard | Browser-supplied; no custom handlers |
| On change | Persist, apply the attribute, and announce through the existing live region |
| `role=` attributes | **Zero.** `<select>` and `<label>` carry the semantics |

---

## 4. Motion contract

| Token | Value |
|---|---|
| `--motion-fast` | `120ms` |
| `--motion-ease` | `cubic-bezier(0.2, 0, 0, 1)` |

**Animated** — hover and focus state changes on interactive controls; dialog open and close
via `opacity`.

**Never animated**, each for a recorded reason:

| Not animated | Because |
|---|---|
| List reordering | Focus is handed to the moving row (FR-014) |
| Validation error appearing | It is announced the instant it appears |
| Theme change | Motion the user did not ask for, during something unrelated |

Under `prefers-reduced-motion: reduce`, all durations collapse to near-zero and every
interaction reaches the same end state immediately (FR-013).

**The dialog transition MUST NOT gate focus.** `showModal()` moves focus synchronously;
transitioning `opacity` keeps the element present and focusable throughout. The existing E2E
test `initial focus is on Cancel, the safe choice` is the guard and must keep passing
**unmodified** — adjusting it to tolerate a delay would be the failure, not the fix.
