/**
 * Measure WCAG contrast ratios for this feature's colour pairs.
 *
 * Exists because axe-core does NOT check focus-indicator contrast, and the
 * constitution requires "a visible focus indicator meeting AA contrast"
 * (FR-019). /speckit-analyze flagged that gap as CRITICAL: every automated
 * gate would have passed a feature that fails this requirement.
 *
 * Thresholds:
 *   4.5:1  normal text                     (SC 1.4.3 Contrast Minimum, AA)
 *   3:1    large text, UI components and
 *          graphical objects incl. focus
 *          indicators                      (SC 1.4.11 Non-text Contrast, AA)
 *
 * Run:  node scripts/check-contrast.mjs
 */

const PAGE = '#f7f7fa' // body background
const SURFACE = '#ffffff' // cards, rows, dialog
const INK = '#1a1a1f' // body text and every focus outline
const MUTED = '#41414d' // completed task text, counter
const DANGER = '#8c1d18' // error text, delete affordances
const PRIMARY = '#1f3a8a' // Add Task button fill

/** sRGB hex -> relative luminance (WCAG 2.x definition). */
function luminance(hex) {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value

  const channels = [0, 2, 4].map((i) => {
    const srgb = parseInt(full.slice(i, i + 2), 16) / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** [label, foreground, background, threshold] */
const CHECKS = [
  // --- Focus indicators (FR-019). Every outline is INK.
  //
  // All outlines use `outline-offset: 2px`, so the indicator is separated
  // from the control by a gap showing the surface behind it. The adjacent
  // colour is therefore the surface, not the control's own fill — which
  // matters most for the two filled buttons.
  ['focus ring on page background', INK, PAGE, 3],
  ['focus ring on card/row/dialog surface', INK, SURFACE, 3],

  // The two filled buttons paint an explicit white separator in the
  // outline-offset gap (box-shadow), because a dark ring directly on a dark
  // fill measures 1.68:1 and 1.90:1 respectively. Both sides of the ring and
  // both sides of the separator are checked, so the whole stack is verified
  // rather than assumed.
  ['focus ring vs its white separator', INK, SURFACE, 3],
  ['white separator vs Add Task fill', SURFACE, PRIMARY, 3],
  ['white separator vs Delete-confirm fill', SURFACE, DANGER, 3],

  // --- Text (SC 1.4.3)
  ['body text on surface', INK, SURFACE, 4.5],
  ['body text on page', INK, PAGE, 4.5],
  ['completed task text on surface', MUTED, SURFACE, 4.5],
  ['character counter on page', MUTED, PAGE, 4.5],
  ['error text on surface', DANGER, SURFACE, 4.5],
  ['error text on page', DANGER, PAGE, 4.5],
  ['Add Task label on its fill', SURFACE, PRIMARY, 4.5],
  ['Delete-confirm label on its fill', SURFACE, DANGER, 4.5],
  ['row Delete button text on surface', DANGER, SURFACE, 4.5],

  // --- Component boundaries (SC 1.4.11)
  ['input border on page', '#5a5a66', PAGE, 3],
  ['row border on page', '#8a8a96', PAGE, 3],
  ['empty-state border on page', '#8a8a96', PAGE, 3],
]

let failures = 0
console.log('\nWCAG contrast — TaskFlow 001-todo-core\n')

for (const [label, fg, bg, threshold] of CHECKS) {
  const value = ratio(fg, bg)
  const pass = value >= threshold
  if (!pass) failures += 1
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${value.toFixed(2).padStart(6)}:1  (needs ${String(threshold)}:1)  ${label}`,
  )
}

console.log(
  failures === 0
    ? '\nAll pairs meet AA.\n'
    : `\n${String(failures)} pair(s) below threshold.\n`,
)

process.exit(failures === 0 ? 0 : 1)
