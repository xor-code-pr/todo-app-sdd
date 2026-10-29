# Quickstart & Validation: Design System

**Feature**: 002-design-system | **Date**: 2026-10-30

How to verify this feature. Everything below describes the **intended** state — none of it
exists until `/speckit-implement` builds it. Verify, don't assume.

---

## Prerequisites

Unchanged from `001-todo-core`: Python 3.11+, Node 26, an evergreen browser, and NVDA or
VoiceOver for the manual pass.

Plus the ability to switch your OS between light and dark — on Windows, Settings →
Personalisation → Colours → "Choose your mode".

---

## Gates

```bash
cd frontend

npm run check:contrast   # 17 pairings × 2 themes = 34 measurements, + orphan report
npm run lint             # no literal colour may remain in a component stylesheet
npm run typecheck
npm test                 # 48 existing + new theme-control tests
npm run test:e2e         # 31 existing + new dark-theme and persistence specs
```

`check:contrast` is the gate that matters most here, and it now fails for four reasons rather
than one: a pairing below threshold, a token measured in one theme but not the other, a token
no pairing references, or a token file it cannot parse.

---

## Scenario validation

### A. Tokens are the only source of values

1. Search every `*.module.css` under `frontend/src` for `#`, `rgb(`, `hsl(`.
   **Expect**: no matches.
2. Change `--color-accent` in `tokens.css` to an obviously different colour and reload.
   **Expect**: the Add Task button changes, and nothing else that should not.
3. Run `npm run check:contrast`.
   **Expect**: it measures the *new* value — proving it read the token, not a copy.
4. Revert.

### B. The dark theme

1. Set the OS to dark, open the app.
   **Expect**: dark interface, no flash of light at any point.
2. Walk all five states — empty, populated, validation error, dialog open, all completed.
   **Expect**: every one legible; axe clean in each.
3. Tab to every control in turn.
   **Expect**: the focus ring is clearly visible on every one. This is the specific thing
   that would be invisible if the light theme's near-black ring had been reused.
4. Switch the OS to light with the app open.
   **Expect**: the interface follows immediately, no reload (SC-007).

### C. The theme control

1. Tab to it. **Expect**: "Theme, combo box, Follow system".
2. Choose "Dark" while the OS is light. **Expect**: dark applies; the change is announced.
3. Switch the OS to dark and back to light. **Expect**: the app **stays dark** — an explicit
   choice is not overridden by the system (FR-006b).
4. Reload. **Expect**: still dark, and **no flash of light** before it applies (FR-006d).
5. Choose "Follow system". **Expect**: it follows the OS again, live.
6. Operate the control with the keyboard alone. **Expect**: fully usable, nothing
   mouse-only.

### D. Motion

1. With reduced motion off, hover and focus controls; open and close the dialog.
   **Expect**: brief transitions, nothing sluggish.
2. Open the dialog and watch where focus lands.
   **Expect**: Cancel is focused **immediately** — the transition never delays it.
3. Complete a task.
   **Expect**: the row relocates **instantly**. Animating that is prohibited (FR-014).
4. Trigger a validation error, then switch theme.
   **Expect**: both instant.
5. Turn on reduced motion and repeat 1–4.
   **Expect**: no animation anywhere; identical end states.

### E. Non-regression — the point of the exercise

1. `npm test` and `npm run test:e2e`.
   **Expect**: all 48 and all 31 pass **without any test file having been edited**. A test
   requiring a change means behaviour drifted, which this feature forbids (FR-019).
2. Compare the light-theme contrast output against the table in `data-model.md`.
   **Expect**: identical ratios. A changed number means a value was mistyped during
   transcription.

### F. Storage edge cases

| Do this | Expect |
|---|---|
| Set `taskflow-theme` to `"Dark"` (wrong case) and reload | Treated as `system`, no error |
| Set it to `"true"` and reload | Treated as `system` |
| Delete the key and reload | Follows the system |
| Block storage in browser settings, reload | App works; follows the system |

---

## Manual screen-reader pass

Required: the theme control is a **new interactive element**, so Principle III applies.

Run `open-a11y-chrome.bat` — an everyday Chrome window still exposes nothing to NVDA.

Listen for:

1. The control announces **name and current value** on focus.
2. Changing it announces the new theme through the live region — once, not twice.
3. In dark, a completed task's state is still conveyed by the checkbox, not by colour.
4. The dialog still announces itself and names the task, in **both** themes.

---

## Definition of done

- [ ] `check:contrast` passes — 34 measurements, no orphan tokens
- [ ] axe clean in **both** themes across all five states
- [ ] 48 component and 31 E2E tests pass **unmodified**, plus new coverage
- [ ] Light-theme ratios identical to the table in `data-model.md`
- [ ] No literal colour or spacing value in any component stylesheet
- [ ] `tsc --noEmit`, ESLint, Ruff, mypy all clean
- [ ] Manual screen-reader pass on the theme control
