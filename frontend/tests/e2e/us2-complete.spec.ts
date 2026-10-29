import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * US2 — Mark a task done, and change your mind.
 *
 * NOTE on clicking: these use `.click()` rather than `.check()`/`.uncheck()`.
 * Playwright's check() verifies the control flipped immediately, but the
 * checkbox here is controlled by server state and only flips once the PATCH
 * and the refetch complete (research.md R5 — no optimistic updates). A plain
 * click followed by an auto-waiting `toBeChecked()` tests the real contract.
 *
 * Serial, sharing one database for the file: there is no DELETE endpoint
 * until US3, so tests cannot reset between cases. Each test creates its own
 * uniquely-named tasks and asserts on those.
 */
test.describe.configure({ mode: 'serial' })

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations, `axe violations in state: ${context}`).toEqual([])
}

function liveRegion(page: Page): Locator {
  return page.locator('[aria-live="polite"]')
}

function checkboxFor(page: Page, title: string): Locator {
  return page.getByRole('checkbox', { name: title })
}

/** Index of a task among all rendered rows, or -1. */
async function indexOf(page: Page, title: string): Promise<number> {
  return page.getByRole('listitem').evaluateAll(
    (nodes, wanted) => nodes.findIndex((n) => n.textContent === wanted),
    title,
  )
}

async function add(page: Page, title: string): Promise<void> {
  const input = page.getByLabel(/task title/i)
  await input.fill(title)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(1)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
})

test('completing a task strikes it through and sinks it below active tasks', async ({
  page,
}) => {
  await add(page, 'US2 alpha')
  await add(page, 'US2 bravo')
  await add(page, 'US2 charlie')

  // 'charlie' is newest, so it is currently at the top.
  expect(await indexOf(page, 'US2 charlie')).toBe(0)

  await checkboxFor(page, 'US2 charlie').click()

  await expect(checkboxFor(page, 'US2 charlie')).toBeChecked()
  const activeCount = await page.getByRole('checkbox').evaluateAll(
    (boxes) => boxes.filter((b) => !(b as HTMLInputElement).checked).length,
  )
  const charlieIndex = await indexOf(page, 'US2 charlie')
  expect(charlieIndex).toBeGreaterThanOrEqual(activeCount)

  await expectNoAxeViolations(page, 'list with a completed task')
})

test('focus follows the task to its new position and the move is announced', async ({
  page,
}) => {
  // FR-021 — the hardest requirement in the feature.
  await add(page, 'US2 focus-a')
  await add(page, 'US2 focus-b')
  await add(page, 'US2 focus-c')

  const before = await indexOf(page, 'US2 focus-c')
  await checkboxFor(page, 'US2 focus-c').click()

  // Wait for the round trip and refetch to land before reading position,
  // otherwise this measures the list as it was.
  await expect(checkboxFor(page, 'US2 focus-c')).toBeChecked()
  const after = await indexOf(page, 'US2 focus-c')
  expect(after, 'the task should have moved').not.toBe(before)

  // Focus is on the SAME task, in its new position — not on whatever now
  // occupies the old index.
  await expect(checkboxFor(page, 'US2 focus-c')).toBeFocused()

  await expect(liveRegion(page)).toContainText('Completed US2 focus-c.')
  await expect(liveRegion(page)).toContainText('Moved')
})

test('reverting restores the task to its place among active tasks', async ({ page }) => {
  await add(page, 'US2 revert-me')

  await checkboxFor(page, 'US2 revert-me').click()
  await expect(checkboxFor(page, 'US2 revert-me')).toBeChecked()

  await checkboxFor(page, 'US2 revert-me').click()

  await expect(checkboxFor(page, 'US2 revert-me')).not.toBeChecked()
  await expect(liveRegion(page)).toContainText('Reopened US2 revert-me.')

  // Newest active task, so back at the very top.
  expect(await indexOf(page, 'US2 revert-me')).toBe(0)
})

test('completed tasks are ordered most recently finished first', async ({ page }) => {
  // FR-018.
  await add(page, 'US2 order-x')
  await add(page, 'US2 order-y')

  await checkboxFor(page, 'US2 order-x').click()
  await expect(checkboxFor(page, 'US2 order-x')).toBeChecked()
  await checkboxFor(page, 'US2 order-y').click()
  await expect(checkboxFor(page, 'US2 order-y')).toBeChecked()

  // y was completed last, so it ranks above x within the completed group.
  expect(await indexOf(page, 'US2 order-y')).toBeLessThan(await indexOf(page, 'US2 order-x'))
})

test('completion survives a reload', async ({ page }) => {
  await add(page, 'US2 persists')
  await checkboxFor(page, 'US2 persists').click()
  await expect(checkboxFor(page, 'US2 persists')).toBeChecked()

  await page.reload()
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)

  await expect(checkboxFor(page, 'US2 persists')).toBeChecked()
})

test('completion is operable by keyboard alone', async ({ page }) => {
  // FR-019.
  await add(page, 'US2 keyboard')

  const box = checkboxFor(page, 'US2 keyboard')
  await box.focus()
  await page.keyboard.press('Space')

  await expect(box).toBeChecked()
  await expect(liveRegion(page)).toContainText('Completed US2 keyboard.')
})

test('every task is completed — axe still clean', async ({ page }) => {
  // One of the five states named in SC-003.
  //
  // Deliberately NOT indexed. Completing a task reorders the list, so
  // `boxes.nth(i)` walks a moving target — the element resolved before the
  // click is a different task by the time the assertion runs. Take the first
  // still-unchecked box each round instead, and wait for the remaining count
  // to drop, which is the only stable thing to assert against.
  const unchecked = page.locator('input[type="checkbox"]:not(:checked)')

  for (let remaining = await unchecked.count(); remaining > 0; remaining -= 1) {
    await unchecked.first().click()
    await expect(unchecked).toHaveCount(remaining - 1)
  }

  await expect(unchecked).toHaveCount(0)
  await expectNoAxeViolations(page, 'all tasks completed')
})
