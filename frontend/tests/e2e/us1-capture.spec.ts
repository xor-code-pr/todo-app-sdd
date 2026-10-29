import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * US1 — Capture a task without leaving the keyboard.
 *
 * Runs against a live frontend and a live backend on a disposable SQLite
 * file. Nothing here is mocked.
 *
 * Serial mode with one database for the file: the API has no DELETE endpoint
 * until US3, so there is no way to reset between tests. Assertions are
 * therefore written as deltas, or scoped to uniquely-named tasks, rather than
 * assuming an empty list — except the first test, which runs against the
 * freshly migrated database created by global-setup.
 */
test.describe.configure({ mode: 'serial' })

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations, `axe violations in state: ${context}`).toEqual([])
}

function titleInput(page: Page): Locator {
  return page.getByLabel(/task title/i)
}

function items(page: Page): Locator {
  return page.getByRole('listitem')
}

/** The visible error inside the form. */
function formError(page: Page): Locator {
  return page.locator('form p')
}

/**
 * The single live region.
 *
 * Error text deliberately appears twice in the DOM — visibly in the form and
 * again here for assistive technology — so selectors must distinguish them.
 * That duplication is FR-004 being satisfied, not a bug.
 */
function liveRegion(page: Page): Locator {
  return page.locator('[aria-live="polite"]')
}

async function countItems(page: Page): Promise<number> {
  return items(page).count()
}

async function addViaKeyboard(page: Page, title: string): Promise<void> {
  const input = titleInput(page)
  await input.fill(title)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // The list loads asynchronously. Counting before it settles reads 0 and
  // makes every delta assertion in this file wrong by however many tasks
  // already existed.
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
})

test('empty state is perceivable and accessible', async ({ page }) => {
  await expect(page.getByText(/no tasks yet/i)).toBeVisible()
  await expect(items(page)).toHaveCount(0)

  await expectNoAxeViolations(page, 'empty list')
})

test('adds a task and returns focus to the empty input', async ({ page }) => {
  const input = titleInput(page)

  await input.click()
  await input.fill('Buy milk')
  await page.keyboard.press('Enter')

  await expect(items(page).filter({ hasText: 'Buy milk' })).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()

  await expectNoAxeViolations(page, 'populated list')
})

test('ten consecutive adds never require relocating the cursor', async ({ page }) => {
  // SC-001.
  const before = await countItems(page)
  const input = titleInput(page)
  await input.click()

  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.type(`Bulk ${String(i)}`)
    await page.keyboard.press('Enter')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('')
  }

  await expect(items(page)).toHaveCount(before + 10)
})

test('newest task appears at the top', async ({ page }) => {
  // FR-006, FR-016. Newest-first ordering means the three tasks created here
  // occupy the top three positions regardless of what already exists.
  for (const name of ['Order oldest', 'Order middle', 'Order newest']) {
    await addViaKeyboard(page, name)
  }

  // Read each row's label, not its textContent: a row also contains the
  // delete button's accessible text.
  const topThree = await items(page).evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => node.querySelector('label')?.textContent),
  )

  expect(topThree).toEqual(['Order newest', 'Order middle', 'Order oldest'])
})

test('blocks an empty submission with a visible error and keeps focus', async ({ page }) => {
  // FR-004.
  const before = await countItems(page)
  const input = titleInput(page)

  await input.click()
  await page.getByRole('button', { name: /add task/i }).click()

  // Visible AND announced — FR-004 requires both.
  await expect(formError(page)).toHaveText(/enter a task title/i)
  await expect(liveRegion(page)).toHaveText(/enter a task title/i)
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toBeFocused()
  await expect(items(page)).toHaveCount(before)

  await expectNoAxeViolations(page, 'validation error shown')
})

test('blocks a whitespace-only submission', async ({ page }) => {
  const before = await countItems(page)

  await titleInput(page).fill('     ')
  await page.getByRole('button', { name: /add task/i }).click()

  await expect(items(page)).toHaveCount(before)
})

test('trims leading and trailing whitespace', async ({ page }) => {
  // FR-002.
  await addViaKeyboard(page, '   Trimmed title   ')

  // Via the checkbox's accessible name: the title also appears inside the
  // delete button's hidden label, so a plain text query matches twice.
  await expect(page.getByRole('checkbox', { name: 'Trimmed title' })).toHaveCount(1)
})

test('rejects 151 characters and accepts exactly 150', async ({ page }) => {
  // FR-003 — the boundary is inclusive.
  const before = await countItems(page)
  const input = titleInput(page)

  await input.fill('a'.repeat(151))
  await page.getByRole('button', { name: /add task/i }).click()
  await expect(formError(page)).toHaveText(/150 characters or fewer/i)
  await expect(items(page)).toHaveCount(before)

  await input.fill('b'.repeat(150))
  await page.keyboard.press('Enter')
  await expect(items(page)).toHaveCount(before + 1)
})

test('counts grapheme clusters, not code units', async ({ page }) => {
  // 150 family emoji are 150 perceived characters but ~1650 code units.
  const before = await countItems(page)

  await titleInput(page).fill(FAMILY.repeat(150))
  await page.keyboard.press('Enter')

  await expect(items(page)).toHaveCount(before + 1)
})

test('persists across a reload', async ({ page }) => {
  // FR-024.
  await addViaKeyboard(page, 'Survives reload')
  await expect(items(page).filter({ hasText: 'Survives reload' })).toHaveCount(1)

  await page.reload()

  await expect(items(page).filter({ hasText: 'Survives reload' })).toHaveCount(1)
})
