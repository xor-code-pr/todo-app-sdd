import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * US3 — Motion is purposeful, and optional.
 *
 * Two things are checked here that a human would struggle to: that the three
 * prohibited animations really carry no transition, and that requesting
 * reduced motion collapses every duration rather than merely shortening it.
 */
test.describe.configure({ mode: 'serial' })

/** Total transition duration in seconds, summed across all properties. */
async function transitionSeconds(locator: Locator): Promise<number> {
  return locator.evaluate((el) =>
    getComputedStyle(el)
      .transitionDuration.split(',')
      .reduce((total, part) => {
        const value = part.trim()
        const seconds = value.endsWith('ms')
          ? Number.parseFloat(value) / 1000
          : Number.parseFloat(value)
        return total + (Number.isNaN(seconds) ? 0 : seconds)
      }, 0),
  )
}

async function addTask(page: Page, title: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Task title' })
  await input.fill(title)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
})

test.describe('what is deliberately NOT animated', () => {
  test('the task row carries no transition — reordering must not animate', async ({ page }) => {
    // FR-014. Focus is handed to the moving row; animating it would mean
    // focus landing on a target still in motion.
    await addTask(page, 'Motion row')

    const row = page.getByRole('listitem').first()
    expect(await transitionSeconds(row)).toBe(0)
  })

  test('the validation error carries no transition', async ({ page }) => {
    // It is announced the instant it appears; animating risks separating the
    // announcement from the appearance.
    await page.getByRole('button', { name: /add task/i }).click()

    const error = page.locator('form p')
    await expect(error).toBeVisible()
    expect(await transitionSeconds(error)).toBe(0)
  })

  test('switching theme does not cross-fade the page', async ({ page }) => {
    // Motion the user did not ask for, during something unrelated.
    expect(await transitionSeconds(page.locator('body'))).toBe(0)

    await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute('data-theme')),
    ).toBe('dark')

    expect(await transitionSeconds(page.locator('body'))).toBe(0)
    await page.getByRole('combobox', { name: 'Theme' }).selectOption('system')
  })
})

test.describe('what is animated', () => {
  test('interactive controls transition on hover and focus', async ({ page }) => {
    const button = page.getByRole('button', { name: /add task/i })

    // Present but brief — the point is that a duration is defined at all,
    // and that it comes from the token rather than an ad-hoc value.
    const seconds = await transitionSeconds(button)
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThan(1)
  })

  test('the dialog transition never delays focus reaching Cancel', async ({ page }) => {
    // FR-012a. The stricter guard is the existing us3-delete test; this
    // checks the same property from the motion side.
    await addTask(page, 'Motion dialog')
    await page.getByRole('button', { name: 'Delete Motion dialog' }).click()

    // No waiting, no polling — focus must already be there.
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
    expect(focused).toMatch(/cancel/i)

    await page.keyboard.press('Escape')
  })
})

test.describe('with reduced motion requested', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no transition runs anywhere', async ({ page }) => {
    // FR-013, SC-006. Durations collapse rather than merely shorten.
    await addTask(page, 'Reduced motion')

    const controls = [
      page.getByRole('button', { name: /add task/i }),
      page.getByRole('combobox', { name: 'Theme' }),
      page.getByRole('textbox', { name: 'Task title' }),
      page.getByRole('button', { name: /^Delete / }).first(),
    ]

    for (const control of controls) {
      expect(await transitionSeconds(control), 'duration must collapse').toBeLessThan(0.001)
    }
  })

  test('every interaction reaches the same end state', async ({ page }) => {
    await addTask(page, 'Reduced end state')

    const checkbox = page.getByRole('checkbox', { name: 'Reduced end state' })
    await checkbox.click()
    await expect(checkbox).toBeChecked()

    await page.getByRole('button', { name: 'Delete Reduced end state' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /^delete$/i }).click()

    await expect(
      page.getByRole('checkbox', { name: 'Reduced end state' }),
    ).toHaveCount(0)
  })
})
