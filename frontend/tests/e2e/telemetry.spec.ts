import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * Local telemetry — the properties that are only observable end to end.
 *
 * Everything here reads the record as a file, with ordinary tools, because
 * that is what FR-004 promises. If these assertions needed a parser nobody
 * else has, the promise would be false.
 *
 * Serial, like the rest of the suite: one database and one record for the
 * whole file.
 */
test.describe.configure({ mode: 'serial' })

const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../backend',
)
const RECORD = path.join(BACKEND_DIR, 'e2e-telemetry.jsonl')

interface Entry {
  ts: string
  kind: string
  operation: string
  [key: string]: unknown
}

/** Every entry written so far, rotated predecessor first. */
function readRecord(): Entry[] {
  const entries: Entry[] = []
  for (const file of [`${RECORD}.1`, RECORD]) {
    let raw: string
    try {
      raw = readFileSync(file, 'utf-8')
    } catch {
      continue // not yet rotated, or not yet written
    }
    for (const line of raw.split('\n')) {
      if (line.trim()) {
        entries.push(JSON.parse(line) as Entry)
      }
    }
  }
  return entries
}

/** The record as one string — this is the `grep` of FR-004, verbatim. */
function readRecordText(): string {
  return readRecord()
    .map((entry) => JSON.stringify(entry))
    .join('\n')
}

function titleInput(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Task title' })
}

async function addTask(page: Page, title: string): Promise<void> {
  await titleInput(page).fill(title)
  await page.getByRole('button', { name: 'Add Task' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(titleInput(page)).toBeVisible()
})

// --- US1: a failure survives ---------------------------------------------

test('a server-side failure is recorded with its code and no user text', async ({
  request,
}) => {
  const marker = 'zzqqxx-server-failure-marker'
  const tooLong = `${marker} `.repeat(40) // well over 150 graphemes

  const response = await request.post('http://127.0.0.1:8000/api/tasks', {
    data: { title: tooLong },
  })
  expect(response.status()).toBe(422)

  await expect(() => {
    const failures = readRecord().filter((e) => e.kind === 'failure')
    expect(
      failures.some((e) => e.code === 'TITLE_TOO_LONG' && e.source === 'server'),
    ).toBe(true)
  }).toPass({ timeout: 5000 })

  // The length was the problem; the text was not the record's business.
  expect(readRecordText()).not.toContain(marker)
})

test('a browser-side failure reaches the same record', async ({ page }) => {
  // Make only the task request fail. The telemetry route stays reachable,
  // which is the case the endpoint exists for: the browser observed a
  // failure it cannot write down itself.
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() === 'POST') {
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await titleInput(page).fill('Buy milk')
  await page.getByRole('button', { name: 'Add Task' }).click()

  await expect(() => {
    const reported = readRecord().filter(
      (e) => e.kind === 'failure' && e.source === 'browser',
    )
    expect(
      reported.some(
        (e) => e.operation === 'task_created' && e.code === 'NETWORK_UNREACHABLE',
      ),
    ).toBe(true)
  }).toPass({ timeout: 5000 })
})

test('entries from an earlier moment are still there later', async ({ page }) => {
  // The whole point of a file: this run has already written entries that no
  // one was watching at the time, and they are readable now.
  const entries = readRecord()

  expect(entries.length).toBeGreaterThan(0)
  expect(entries.some((e) => e.kind === 'lifecycle' && e.event === 'startup')).toBe(true)
  await expect(titleInput(page)).toBeEnabled()
})

// --- US2: how the application has been behaving --------------------------

test('every entry carries a timestamp and an operation', () => {
  const entries = readRecord()

  expect(entries.length).toBeGreaterThan(0)
  for (const entry of entries) {
    expect(entry.ts, JSON.stringify(entry)).toMatch(/Z$/)
    expect(entry.operation, JSON.stringify(entry)).toBeTruthy()
  }
})

test('request timings record the route template, never the literal path', () => {
  const timings = readRecord().filter((e) => e.kind === 'timing')

  expect(timings.length).toBeGreaterThan(0)
  for (const entry of timings) {
    expect(typeof entry.duration_ms).toBe('number')
    // /api/tasks/42 would be useless for aggregation and one step from
    // carrying something that is not an integer.
    expect(String(entry.path_template)).not.toMatch(/\/api\/tasks\/\d+/)
  }
})

test('feature counts are recoverable, and match what was actually done', async ({
  page,
}) => {
  const before = readRecord().length

  const titles = ['zzqqxx-count-a', 'zzqqxx-count-b', 'zzqqxx-count-c']
  for (const title of titles) {
    await addTask(page, title)
  }

  const rowFor = (title: string): Locator =>
    page.getByRole('listitem').filter({ hasText: title })

  await rowFor(titles[0]!).getByRole('checkbox').click()
  await expect(rowFor(titles[0]!).getByRole('checkbox')).toBeChecked()
  await rowFor(titles[1]!).getByRole('checkbox').click()
  await expect(rowFor(titles[1]!).getByRole('checkbox')).toBeChecked()
  await rowFor(titles[0]!).getByRole('checkbox').click()
  await expect(rowFor(titles[0]!).getByRole('checkbox')).not.toBeChecked()

  await rowFor(titles[2]!).getByRole('button', { name: /delete/i }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(rowFor(titles[2]!)).toHaveCount(0)

  await expect(() => {
    const since = readRecord().slice(before)
    const count = (operation: string): number =>
      since.filter((e) => e.kind === 'usage' && e.operation === operation).length

    expect(count('task_created')).toBe(3)
    expect(count('task_completed')).toBe(2)
    expect(count('task_reopened')).toBe(1)
    expect(count('task_deleted')).toBe(1)
  }).toPass({ timeout: 5000 })
})

// --- US3: small, private, harmless ---------------------------------------

test('no task title ever appears anywhere in the record', async ({ page }) => {
  // The test that will actually catch a regression. The field filter and the
  // coding discipline behind it both depend on someone remembering; this
  // does not.
  const markers = [
    'zzqqxx-privacy-alpha',
    'zzqqxx-privacy-bravo — with punctuation, and an em dash',
    'zzqqxx-privacy-charlie 🧪',
  ]

  for (const title of markers) {
    await addTask(page, title)
  }

  const rowFor = (title: string): Locator =>
    page.getByRole('listitem').filter({ hasText: title })

  await rowFor(markers[0]!).getByRole('checkbox').click()
  await expect(rowFor(markers[0]!).getByRole('checkbox')).toBeChecked()
  await rowFor(markers[0]!).getByRole('checkbox').click()
  await expect(rowFor(markers[0]!).getByRole('checkbox')).not.toBeChecked()

  await rowFor(markers[1]!).getByRole('button', { name: /delete/i }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(rowFor(markers[1]!)).toHaveCount(0)

  // And a failure, since a failure is where a title is most likely to leak.
  await page.request.post('http://127.0.0.1:8000/api/tasks', {
    data: { title: `${markers[2]} `.repeat(40) },
  })

  const text = readRecordText()
  for (const marker of markers) {
    expect(text, `found a task title in the record: ${marker}`).not.toContain(marker)
  }
  // Also the distinctive stem, in case a title were truncated rather than
  // omitted — a truncated title is still a title.
  expect(text).not.toContain('zzqqxx-privacy')
})

test('the application works normally when telemetry cannot be reported', async ({
  page,
}) => {
  // The browser half of SC-004. The server half is proved in the backend
  // suite, which can make the destination itself unwritable; a Playwright
  // test cannot, because the backend process is started once per run from
  // playwright.config.ts and its environment is fixed at that point.
  await page.route('**/api/telemetry', (route) => route.abort('failed'))

  const title = 'zzqqxx-unreportable'
  await addTask(page, title)

  const row = page.getByRole('listitem').filter({ hasText: title })
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).not.toBeChecked()

  await row.getByRole('button', { name: /delete/i }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row).toHaveCount(0)

  // Nothing about telemetry reached the interface.
  await expect(page.getByText(/telemetry/i)).toHaveCount(0)
  await expect(page.locator('form p')).toHaveCount(0)
})

test('the record is plain text, one JSON object per line', () => {
  // FR-004 and FR-004a together. Read as lines, parsed one at a time, with
  // nothing but what the standard library provides — which is the claim.
  const raw = readFileSync(RECORD, 'utf-8')
  const lines = raw.split('\n').filter((line) => line.trim())

  expect(lines.length).toBeGreaterThan(0)
  for (const line of lines) {
    expect(() => JSON.parse(line) as unknown).not.toThrow()
  }
})

test('no telemetry request leaves this machine', async ({ page }) => {
  // SC-009. Observed rather than asserted from the source: the test watches
  // every request the page makes for a full round of ordinary use.
  const hosts = new Set<string>()
  page.on('request', (request) => {
    hosts.add(new URL(request.url()).host)
  })

  const title = 'zzqqxx-no-egress'
  await addTask(page, title)
  const row = page.getByRole('listitem').filter({ hasText: title })
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()

  for (const host of hosts) {
    expect(host, `unexpected host contacted: ${host}`).toMatch(/^127\.0\.0\.1:(5173|8000)$/)
  }
})
