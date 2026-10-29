import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * US3 — Delete a task on purpose, never by accident.
 *
 * This file is where the native <dialog> behaviours are actually verified.
 * The component tests deliberately skip focus trapping, Escape handling and
 * initial focus, because jsdom does not implement <dialog> and asserting them
 * against a stub would test the stub rather than the browser that supplies
 * them.
 */
test.describe.configure({ mode: 'serial' })

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations, `axe violations in state: ${context}`).toEqual([])
}

function dialog(page: Page): Locator {
  return page.getByRole('dialog')
}

function deleteButtonFor(page: Page, title: string): Locator {
  return page.getByRole('button', { name: `Delete ${title}` })
}

function rowFor(page: Page, title: string): Locator {
  return page.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) })
}

async function add(page: Page, title: string): Promise<void> {
  const input = page.getByLabel(/task title/i)
  await input.fill(title)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
  await expect(rowFor(page, title)).toHaveCount(1)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
})

test('delete opens a confirmation that names the task', async ({ page }) => {
  // FR-013 — a bare "Are you sure?" gives a screen reader user no way to
  // verify which task they are about to destroy.
  await add(page, 'US3 named')

  await deleteButtonFor(page, 'US3 named').click()

  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toContainText('US3 named')
  await expect(dialog(page)).toContainText(/cannot be undone/i)

  // Still present — nothing has been deleted yet.
  await expect(rowFor(page, 'US3 named')).toHaveCount(1)

  await expectNoAxeViolations(page, 'confirmation dialog open')

  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
})

test('initial focus is on Cancel, the safe choice', async ({ page }) => {
  await add(page, 'US3 safe-default')

  await deleteButtonFor(page, 'US3 safe-default').click()

  await expect(page.getByRole('button', { name: /^cancel$/i })).toBeFocused()

  await page.keyboard.press('Escape')
})

test('Escape closes without deleting and returns focus to the trigger', async ({ page }) => {
  // FR-022.
  await add(page, 'US3 escape')
  const trigger = deleteButtonFor(page, 'US3 escape')

  await trigger.click()
  await expect(dialog(page)).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(dialog(page)).toBeHidden()
  await expect(rowFor(page, 'US3 escape')).toHaveCount(1)
  await expect(trigger).toBeFocused()
})

test('Cancel closes without deleting and returns focus to the trigger', async ({ page }) => {
  await add(page, 'US3 cancel')
  const trigger = deleteButtonFor(page, 'US3 cancel')

  await trigger.click()
  await page.getByRole('button', { name: /^cancel$/i }).click()

  await expect(dialog(page)).toBeHidden()
  await expect(rowFor(page, 'US3 cancel')).toHaveCount(1)
  await expect(trigger).toBeFocused()
})

test('focus is trapped inside the dialog while it is open', async ({ page }) => {
  // Supplied by the native <dialog>, which is the entire reason for using it.
  await add(page, 'US3 trapped')
  await deleteButtonFor(page, 'US3 trapped').click()

  const titleInput = page.getByLabel(/task title/i)
  const addButton = page.getByRole('button', { name: /add task/i })

  // Tab well past the dialog's two buttons. The requirement is that the page
  // behind stays unreachable, which is what "modal" means — asserting on
  // activeElement containment instead would also fail on the browser's own
  // focus-cycle intermediate steps.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    await expect(dialog(page), `dialog closed after ${String(i + 1)} tabs`).toBeVisible()
    await expect(titleInput, `focus escaped to the page after ${String(i + 1)} tabs`)
      .not.toBeFocused()
    await expect(addButton).not.toBeFocused()
  }

  await page.keyboard.press('Escape')
})

test('confirming deletes permanently and announces it', async ({ page }) => {
  await add(page, 'US3 doomed')

  await deleteButtonFor(page, 'US3 doomed').click()
  await page.getByRole('button', { name: /^delete$/i }).click()

  await expect(dialog(page)).toBeHidden()
  await expect(rowFor(page, 'US3 doomed')).toHaveCount(0)
  await expect(page.locator('[aria-live="polite"]')).toContainText('Deleted US3 doomed.')
})

test('focus never falls to the body after a deletion', async ({ page }) => {
  // FR-015, SC-008. The trigger has just been removed from the DOM along with
  // its row, so focusing it would do nothing at all.
  await add(page, 'US3 focus-keeper')
  await add(page, 'US3 focus-victim')

  await deleteButtonFor(page, 'US3 focus-victim').click()
  await page.getByRole('button', { name: /^delete$/i }).click()
  await expect(rowFor(page, 'US3 focus-victim')).toHaveCount(0)

  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE')
  expect(activeTag, 'focus fell to the document body').not.toBe('BODY')
})

test('deletion survives a reload', async ({ page }) => {
  await add(page, 'US3 stays-gone')

  await deleteButtonFor(page, 'US3 stays-gone').click()
  await page.getByRole('button', { name: /^delete$/i }).click()
  await expect(rowFor(page, 'US3 stays-gone')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)

  await expect(rowFor(page, 'US3 stays-gone')).toHaveCount(0)
})

test('deleting the last task leaves an empty state with focus somewhere real', async ({
  page,
}) => {
  // Clear everything, one row at a time. Not indexed: the list reorders.
  const deleteButtons = page.getByRole('button', { name: /^Delete / })

  for (let remaining = await deleteButtons.count(); remaining > 0; remaining -= 1) {
    await deleteButtons.first().click()
    await page.getByRole('button', { name: /^delete$/i }).click()
    await expect(deleteButtons).toHaveCount(remaining - 1)
  }

  await expect(page.getByText(/no tasks yet/i)).toBeVisible()

  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE')
  expect(activeTag, 'focus fell to the body after the last deletion').not.toBe('BODY')

  await expectNoAxeViolations(page, 'empty after deleting everything')
})
