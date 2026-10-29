# Phase 1 Token Inventory: Design System

**Feature**: 002-design-system | **Date**: 2026-10-30

The "data model" of a styling feature is its token set. One file,
`frontend/src/styles/tokens.css`, is the only place any of these values appears.

Every colour below has been measured. The dark values are **proposed and verified**, not
sketched — see the ratio tables.

---

## Colour tokens

Named for role, never appearance (FR-003). `--color-surface`, not `--color-white`.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-page` | Page background | `#f7f7fa` | `#121216` |
| `--color-surface` | Cards, rows, dialog | `#ffffff` | `#1c1c22` |
| `--color-text` | Body text | `#1a1a1f` | `#ececf1` |
| `--color-text-muted` | Completed tasks, counter | `#41414d` | `#b4b4c0` |
| `--color-border` | Row and card edges | `#8a8a96` | `#6e6e7a` |
| `--color-border-strong` | Input edges | `#5a5a66` | `#9a9aa6` |
| `--color-focus-ring` | Focus indicator | `#1a1a1f` | `#ffffff` |
| `--color-focus-halo` | Separator inside the ring | `#ffffff` | `#121216` |
| `--color-accent` | Add Task fill | `#1f3a8a` | `#9db8ff` |
| `--color-on-accent` | Text on the accent fill | `#ffffff` | `#10131c` |
| `--color-danger` | Error text, delete affordance | `#8c1d18` | `#ffa39e` |
| `--color-danger-fill` | Destructive button background | `#8c1d18` | `#ff6b63` |
| `--color-on-danger` | Text on the destructive fill | `#ffffff` | `#1a0a08` |
| `--color-danger-invalid` | Invalid-input border | `#b3261e` | `#ff8178` |

### Four decisions embedded in that table

**The focus ring inverts.** Light uses near-black, dark uses white. The current shipped value
is `#1a1a1f` — on a dark page that is effectively invisible. One indicator cannot serve both
themes, which is why FR-009 requires each to be measured separately.

**The focus halo inverts with it.** It is the explicit separator painted inside the
outline-offset gap so a dark ring never sits on a dark fill. In dark it becomes the dark
value, for the same reason in reverse.

**`--color-danger` and `--color-danger-fill` are separate tokens that hold the same value in
light.** They are different roles: one is text and borders, the other is a button background.
In dark they must diverge — text needs to be light against a dark page, a fill needs to be
dark enough to carry light text. Collapsing them because they coincide today is exactly what
FR-004 forbids, and the dark theme is the proof.

**`--color-danger-invalid` is its own token.** It is live in the shipped code as `#b3261e`
and has never been measured — the current checker has no entry for it. It passes at 6.11:1,
but nothing was watching. This is the case FR-020b exists for.

---

## Measured ratios

Thresholds: **4.5:1** normal text (SC 1.4.3), **3:1** UI components and focus indicators
(SC 1.4.11).

### Light — must be unchanged from today

Tokenising is a transcription. Each of these must produce the **same** number afterwards; a
changed ratio means a value was mistyped.

| Pairing | Ratio | Needs |
|---|---|---|
| text on surface | 17.33 | 4.5 |
| text on page | 16.21 | 4.5 |
| muted on surface | 10.06 | 4.5 |
| muted on page | 9.41 | 4.5 |
| danger on surface | 9.11 | 4.5 |
| danger on page | 8.52 | 4.5 |
| on-accent on accent | 10.34 | 4.5 |
| on-danger on danger-fill | 9.11 | 4.5 |
| focus ring on page | 16.21 | 3 |
| focus ring on surface | 17.33 | 3 |
| focus ring vs halo | 17.33 | 3 |
| halo vs accent fill | 10.34 | 3 |
| halo vs danger fill | 9.11 | 3 |
| border on page | 3.19 | 3 |
| border on surface | 3.41 | 3 |
| border-strong on page | 6.36 | 3 |
| invalid border on surface | 6.54 | 3 |

### Dark — proposed and verified

| Pairing | Ratio | Needs |
|---|---|---|
| text on surface | 14.40 | 4.5 |
| text on page | 15.87 | 4.5 |
| muted on surface | 8.26 | 4.5 |
| muted on page | 9.10 | 4.5 |
| danger on surface | 8.87 | 4.5 |
| danger on page | 9.77 | 4.5 |
| on-accent on accent | 9.48 | 4.5 |
| on-danger on danger-fill | 6.91 | 4.5 |
| focus ring on page | 18.69 | 3 |
| focus ring on surface | 16.95 | 3 |
| focus ring vs halo | 18.69 | 3 |
| halo vs accent fill | 9.55 | 3 |
| halo vs danger fill | 6.70 | 3 |
| border on page | 3.71 | 3 |
| border on surface | 3.37 | 3 |
| border-strong on page | 6.72 | 3 |
| invalid border on surface | 6.99 | 3 |

**All pass in both themes. Both tables list the same 17 pairings as
[contracts/tokens.md](./contracts/tokens.md), in the same order** — they are what T020 and
T030 compare the checker's output against, so a row missing here is a measurement nobody
verifies.

The tightest margins are the borders — 3.19 light, 3.37 dark — which is expected: a border
is the one element deliberately quieter than text.

### A threshold that was wrong

An early check compared `--color-surface` against `--color-page` at 1.2:1, to confirm cards
are distinguishable from the background. Dark measured 1.10:1 and "failed".

The rule was invented, and checking it against the shipped light theme showed why it was
wrong: light measures **1.07:1** — the already-passing, already-shipped theme would have
failed it too. What actually separates a row from the page is its **border**, which is a real
SC 1.4.11 requirement and passes in both themes at 3.19 and 3.71.

The pairing was removed rather than the colours adjusted. Recorded because inventing a
threshold and then tuning values to satisfy it is a way to produce a confident, meaningless
green check.

---

## Non-colour tokens

| Token | Value | Replaces |
|---|---|---|
| `--space-1` … `--space-8` | `0.25` `0.3125` `0.5` `0.625` `0.75` `1` `1.25` `1.5` rem | 8 of the current literals |
| `--text-sm` / `-base` / `-lg` / `-xl` | `0.875` `1` `1.125` `1.75` rem | 4 literals |
| `--radius-sm` / `-md` | `4px` / `6px` | 2 literals |
| `--border-width` | `1px` | the hairline |
| `--focus-ring-width` | `3px` | the outline |
| `--focus-ring-offset` | `3px` | outline-offset |
| `--motion-fast` | `120ms` | new |
| `--motion-ease` | `cubic-bezier(0.2, 0, 0, 1)` | new |
| `--bp-narrow` | `320px` | the viewport floor |
| `--measure` / `--field-min` / `--dialog-max` | `44rem` / `16rem` / `28rem` | 3 layout literals |

**`--border-width`, `--focus-ring-width` and `--focus-ring-offset` are tokens even though the
spec exempts structural pixels.** They are design decisions here, not incidental: the ring
width and offset are load-bearing for FR-009, and both were tuned during the T072 contrast
work in `001-todo-core`. Leaving them as literals would scatter the one value that matters
most to the focus indicator.

---

## Theme state

Not stored data in the usual sense — one value, in `localStorage`.

| | |
|---|---|
| Key | `taskflow-theme` |
| Values | `system` · `light` · `dark` |
| Absent / invalid | Treated as `system` |
| Applied as | `data-theme` attribute on `<html>`, **omitted entirely** when `system` |

**Validation on read is required, not optional.** A value of `"Dark"`, `"true"`, or anything
written by an older version must be ignored. An unrecognised value written to the attribute
silently stops matching the selectors, and the user gets light with no explanation and no
error — the spec lists exactly this as an edge case.

### Transitions

```text
          select "light"            select "dark"
  system ──────────────► light ──────────────► dark
    ▲                      │                     │
    └──── select "system" ─┴─────────────────────┘

  While in `system`: OS preference changes are followed live.
  Once light or dark: OS changes are ignored until the user returns to `system`.
```

That asymmetry is FR-006b, and it is the reason this is a three-state control rather than a
toggle. "Dark" and "currently dark because the system is" are different states that behave
differently when the OS changes.
