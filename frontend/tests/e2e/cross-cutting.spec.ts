import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Cross-cutting checks from quickstart.md — the requirements that belong to
 * no single user story.
 */
test.describe.configure({ mode: 'serial' })

async function add(page: Page, title: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Task title' })
  await input.fill(title)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
}

/** Horizontal overflow of the document, in CSS pixels. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
})

test('usable at a 320 CSS pixel viewport without horizontal scrolling', async ({ page }) => {
  // FR-023.
  await page.setViewportSize({ width: 320, height: 720 })
  await add(page, 'A fairly long entry that will need to wrap on a narrow screen')

  expect(await horizontalOverflow(page), 'page scrolls horizontally at 320px').toBeLessThanOrEqual(0)

  // Controls must still be reachable and operable, not merely present.
  await expect(page.getByRole('button', { name: /add task/i })).toBeVisible()
  await expect(page.getByRole('checkbox').first()).toBeVisible()

  await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
    .then((results) => {
      expect(results.violations, 'axe violations at 320px').toEqual([])
    })
})

test('usable at 200% zoom without horizontal scrolling', async ({ page }) => {
  // FR-023. Emulated the way WCAG 1.4.4 means it: halve the viewport so the
  // same CSS pixels occupy twice the relative space.
  await page.setViewportSize({ width: 640, height: 512 })
  await add(page, 'Zoomed task')

  expect(await horizontalOverflow(page), 'page scrolls horizontally at 200%').toBeLessThanOrEqual(0)
  await expect(page.getByRole('button', { name: /add task/i })).toBeVisible()
})

test('the dialog is usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await add(page, 'Narrow delete')

  await page.getByRole('button', { name: 'Delete Narrow delete' }).click()

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: /^cancel$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^delete$/i })).toBeVisible()
  expect(await horizontalOverflow(page), 'dialog overflows at 320px').toBeLessThanOrEqual(0)

  await page.keyboard.press('Escape')
})

test('rapid double submission creates exactly one task', async ({ page }) => {
  // research.md R6 — the submit button is disabled while a request is in
  // flight, which is the only point where the ambiguity exists.
  await page.setViewportSize({ width: 1280, height: 720 })

  const input = page.getByRole('textbox', { name: 'Task title' })
  const button = page.getByRole('button', { name: /add task/i })
  const unique = `Double ${String(Date.now())}`

  await input.fill(unique)
  await Promise.all([button.click(), button.click().catch(() => undefined)])

  await expect(page.getByRole('checkbox', { name: unique })).toHaveCount(1)
})

test('ordering is stable across reloads', async ({ page }) => {
  // FR-017 — the id tie-break must make repeated reads identical.
  const idsOf = async (): Promise<(string | null)[]> =>
    page.getByRole('listitem').evaluateAll((nodes) =>
      nodes.map((n) => n.querySelector('label')?.textContent ?? null),
    )

  const before = await idsOf()
  await page.reload()
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)

  expect(await idsOf()).toEqual(before)
})
