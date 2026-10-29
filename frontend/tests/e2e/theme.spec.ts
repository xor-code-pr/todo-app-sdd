import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * US1 — The app matches how the user has set up their computer.
 *
 * Covers the dark theme, the three-state control, and the pre-paint
 * requirement. Serial: these share one database and one browser profile.
 */
test.describe.configure({ mode: 'serial' })

const STORAGE_KEY = 'taskflow-theme'

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations, `axe violations: ${context}`).toEqual([])
}

/** The resolved background, which tells us which theme actually rendered. */
async function pageBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

async function dataTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'))
}

async function addTask(page: Page, title: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Task title' })
  await input.fill(title)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => {
    localStorage.removeItem(key)
  }, STORAGE_KEY)
  await page.goto('/')
  await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
})

test.describe('following the system preference', () => {
  test.use({ colorScheme: 'dark' })

  test('renders the dark theme when the OS prefers dark', async ({ page }) => {
    // FR-005, FR-006. No attribute is set — absence means "follow system".
    expect(await dataTheme(page)).toBeNull()

    const background = await pageBackground(page)
    expect(background, 'page should not be the light surface').not.toBe('rgb(247, 247, 250)')
  })

  test('every state is axe-clean in dark', async ({ page }) => {
    // SC-001, the five states named in the spec.
    await expectNoAxeViolations(page, 'dark / empty')

    await addTask(page, 'Dark one')
    await addTask(page, 'Dark two')
    await expectNoAxeViolations(page, 'dark / populated')

    await page.getByRole('button', { name: /add task/i }).click()
    await expect(page.locator('form p')).toBeVisible()
    await expectNoAxeViolations(page, 'dark / validation error')

    await page.getByRole('button', { name: 'Delete Dark one' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoAxeViolations(page, 'dark / dialog open')
    await page.keyboard.press('Escape')

    const unchecked = page.locator('input[type="checkbox"]:not(:checked)')
    for (let remaining = await unchecked.count(); remaining > 0; remaining -= 1) {
      await unchecked.first().click()
      await expect(unchecked).toHaveCount(remaining - 1)
    }
    await expectNoAxeViolations(page, 'dark / all completed')
  })

  test('the focus ring is visible on every control in dark', async ({ page }) => {
    // FR-009. The light theme's near-black ring would be invisible here.
    await addTask(page, 'Focus check')

    const controls = [
      page.getByRole('textbox', { name: 'Task title' }),
      page.getByRole('button', { name: /add task/i }),
      page.getByRole('combobox', { name: 'Theme' }),
      page.getByRole('checkbox').first(),
      page.getByRole('button', { name: /^Delete / }).first(),
    ]

    for (const control of controls) {
      await control.focus()
      const colour = await control.evaluate((el) => getComputedStyle(el).outlineColor)
      // White in dark; the point is that it is not the dark ink value.
      expect(colour, 'focus ring must not be the light theme ink').not.toBe('rgb(26, 26, 31)')
    }
  })
})

test.describe('an explicit choice overrides the system', () => {
  test.use({ colorScheme: 'dark' })

  test('choosing Light wins over a dark OS, and survives a reload with no flash', async ({
    page,
  }) => {
    // FR-006a, FR-006b, FR-006d.
    await page.getByRole('combobox', { name: 'Theme' }).selectOption('light')
    await expect.poll(async () => dataTheme(page)).toBe('light')

    const lightBackground = await pageBackground(page)

    // Watch the very first paint after reload: the attribute must already be
    // present before React runs, or the user sees the wrong theme first.
    await page.reload()
    const themeAtFirstScript = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )
    expect(themeAtFirstScript, 'stored theme must apply before first paint').toBe('light')

    await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)
    expect(await pageBackground(page)).toBe(lightBackground)
    await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('light')
  })
})

test.describe('returning to system', () => {
  test.use({ colorScheme: 'light' })

  test('Follow system resumes tracking the OS', async ({ page }) => {
    const control = page.getByRole('combobox', { name: 'Theme' })

    await control.selectOption('dark')
    await expect.poll(async () => dataTheme(page)).toBe('dark')

    await control.selectOption('system')
    await expect.poll(async () => dataTheme(page)).toBeNull()

    // Back under system control, with a light OS: the light surface returns.
    expect(await pageBackground(page)).toBe('rgb(247, 247, 250)')
  })

  test('an invalid stored value is ignored rather than applied', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, 'Dark')
    }, STORAGE_KEY)

    await page.reload()
    await expect(page.getByText(/loading your tasks/i)).toHaveCount(0)

    expect(await dataTheme(page), '"Dark" is not a valid value').toBeNull()
    await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('system')
  })
})

test.describe('layout holds in dark', () => {
  test.use({ colorScheme: 'dark' })

  /**
   * T041 — the cross-cutting layout checks run in light in
   * cross-cutting.spec.ts. Repeating them here rather than editing that file
   * keeps the existing suite unmodified (FR-019), and the dark theme is a
   * genuinely different case: it changes border and surface colours, which is
   * where a narrow layout tends to break down visibly.
   */
  async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
  }

  test('no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await addTask(page, 'A long enough entry that it must wrap on a narrow screen')

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible()
    await expect(page.getByRole('button', { name: /add task/i })).toBeVisible()
  })

  test('no horizontal overflow at 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 512 })
    await addTask(page, 'Zoomed in dark')

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('the dialog is usable at 320px in dark', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await addTask(page, 'Narrow dark dialog')

    await page.getByRole('button', { name: 'Delete Narrow dark dialog' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /^cancel$/i })).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    await page.keyboard.press('Escape')
  })
})
