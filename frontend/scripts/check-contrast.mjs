/**
 * Measure WCAG contrast for every colour pairing the interface uses, in both
 * themes, reading the values from the token source itself.
 *
 * Exists because axe-core does NOT check focus-indicator contrast, and the
 * constitution requires "a visible focus indicator meeting AA contrast"
 * (FR-019 of 001-todo-core). When that gap was first measured it found three
 * real failures, including a dark ring on a dark fill at 1.68:1.
 *
 * This version reads `src/styles/tokens.css` directly. It holds NO copy of
 * the palette (FR-020): a second copy is a second source of truth, and the
 * day someone edits a token without editing the checker, it reports success
 * about colours nobody is using.
 *
 * Thresholds:
 *   4.5:1  normal text                       (SC 1.4.3 Contrast Minimum, AA)
 *   3:1    UI components, graphical objects,
 *          and focus indicators              (SC 1.4.11 Non-text Contrast, AA)
 *
 * Run:  npm run check:contrast
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKENS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/styles/tokens.css',
)

/**
 * Which colours actually appear against each other.
 *
 * Hand-written on purpose. A token file says which colours exist; it cannot
 * say which ones are rendered on top of which. That relationship is authored
 * knowledge, and writing it down is what makes this check meaningful rather
 * than exhaustive and useless.
 */
const PAIRINGS = [
  ['--color-text', '--color-surface', 4.5, 'body text on a row or dialog'],
  ['--color-text', '--color-page', 4.5, 'body text on the page'],
  ['--color-text-muted', '--color-surface', 4.5, 'completed task title'],
  ['--color-text-muted', '--color-page', 4.5, 'character counter'],
  ['--color-danger', '--color-surface', 4.5, 'error text, row delete button'],
  ['--color-danger', '--color-page', 4.5, 'form-level error text'],
  ['--color-on-accent', '--color-accent', 4.5, '"Add Task" label'],
  ['--color-on-danger', '--color-danger-fill', 4.5, '"Delete" label in the dialog'],
  ['--color-focus-ring', '--color-page', 3, 'focus ring over the page'],
  ['--color-focus-ring', '--color-surface', 3, 'focus ring over a row'],
  ['--color-focus-ring', '--color-focus-halo', 3, 'ring against its own separator'],
  ['--color-focus-halo', '--color-accent', 3, 'separator against the accent fill'],
  ['--color-focus-halo', '--color-danger-fill', 3, 'separator against the destructive fill'],
  ['--color-border', '--color-page', 3, 'row edge on the page'],
  ['--color-border', '--color-surface', 3, 'row edge over a surface'],
  ['--color-border-strong', '--color-page', 3, 'input edge'],
  ['--color-danger-invalid', '--color-surface', 3, 'invalid input edge'],
]

class CheckFailure extends Error {}

// ---------------------------------------------------------------- parsing

/**
 * Pull `--name: value` declarations out of each selector block.
 *
 * Deliberately narrow: it understands custom property declarations and
 * nothing else. If tokens.css ever grows constructs this cannot read, the
 * check fails loudly rather than measuring a subset and reporting success.
 */
function parseTokens(css) {
  const blocks = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match

  while ((match = re.exec(css)) !== null) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim()
    const declarations = {}

    for (const line of match[2].split(';')) {
      const decl = line.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      const sep = decl.indexOf(':')
      if (sep === -1) continue
      const name = decl.slice(0, sep).trim()
      if (!name.startsWith('--')) continue
      declarations[name] = decl.slice(sep + 1).trim()
    }

    if (Object.keys(declarations).length > 0) blocks.push({ selector, declarations })
  }

  if (blocks.length === 0) {
    throw new CheckFailure('no custom-property blocks found — is tokens.css intact?')
  }
  return blocks
}

/** Follow `var(--other)` references, refusing to loop forever. */
function resolve(name, map, seen = new Set()) {
  const raw = map[name]
  if (raw === undefined) throw new CheckFailure(`token ${name} is not defined`)

  const reference = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(raw)
  if (reference === null) return raw

  if (seen.has(name)) {
    throw new CheckFailure(`circular reference: ${[...seen, name].join(' -> ')}`)
  }
  seen.add(name)
  return resolve(reference[1], map, seen)
}

// ------------------------------------------------------------- measuring

function luminance(hex) {
  const value = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(value)) {
    throw new CheckFailure(`"${hex}" is not a literal colour this checker can measure`)
  }
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

// ----------------------------------------------------------------- main

function main() {
  let css
  try {
    css = readFileSync(TOKENS, 'utf8')
  } catch (cause) {
    throw new CheckFailure(`cannot read ${TOKENS}: ${cause.message}`)
  }

  const blocks = parseTokens(css)

  const light = blocks.find((b) => b.selector === ':root')
  if (light === undefined) throw new CheckFailure('no `:root` block — light theme missing')

  const darkBlocks = blocks.filter((b) => b.selector.includes("data-theme='dark']") ||
    b.selector.includes(":root:not([data-theme='light'])"))
  if (darkBlocks.length === 0) throw new CheckFailure('no dark-theme block found')

  // Both dark blocks must declare the same tokens; a colour defined in one
  // and not the other renders differently depending on how dark was reached.
  const darkSets = darkBlocks.map((b) => Object.keys(b.declarations).sort().join(','))
  if (new Set(darkSets).size > 1) {
    throw new CheckFailure('the dark blocks declare different token sets')
  }

  const themes = {
    light: light.declarations,
    dark: { ...light.declarations, ...darkBlocks[0].declarations },
  }

  // Every colour token must appear in both themes.
  const colourTokens = Object.keys(light.declarations).filter((n) => n.startsWith('--color-'))
  for (const token of colourTokens) {
    if (!(token in darkBlocks[0].declarations)) {
      throw new CheckFailure(`${token} is defined in light but not in dark`)
    }
  }

  // An unmeasured colour and an unused colour look identical in the file.
  const referenced = new Set(PAIRINGS.flatMap(([fg, bg]) => [fg, bg]))
  const orphans = colourTokens.filter((t) => !referenced.has(t))

  let failures = 0
  console.log('\nWCAG contrast — tokens read from src/styles/tokens.css\n')

  for (const [name, map] of Object.entries(themes)) {
    console.log(`  ${name}`)
    for (const [fg, bg, threshold, label] of PAIRINGS) {
      const value = ratio(resolve(fg, map), resolve(bg, map))
      const pass = value >= threshold
      if (!pass) failures += 1
      console.log(
        `    ${pass ? 'PASS' : 'FAIL'}  ${value.toFixed(2).padStart(6)}:1  ` +
          `(needs ${String(threshold)}:1)  ${label}`,
      )
    }
    console.log('')
  }

  if (orphans.length > 0) {
    failures += orphans.length
    console.log('  Colour tokens no pairing references — unmeasured, not merely unused:')
    for (const token of orphans) console.log(`    ORPHAN  ${token}`)
    console.log('')
  }

  const measured = PAIRINGS.length * Object.keys(themes).length
  console.log(
    failures === 0
      ? `${String(measured)} measurements across ${String(Object.keys(themes).length)} themes — all meet AA.\n`
      : `${String(failures)} problem(s) found.\n`,
  )

  return failures === 0 ? 0 : 1
}

try {
  process.exit(main())
} catch (error) {
  if (error instanceof CheckFailure) {
    console.error(`\nCONTRAST CHECK FAILED: ${error.message}\n`)
    console.error('Refusing to report success without measuring. Fix tokens.css.\n')
    process.exit(1)
  }
  throw error
}
