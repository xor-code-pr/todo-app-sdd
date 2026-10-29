import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Delete the E2E telemetry record before Playwright starts anything.
 *
 * This cannot live in `global-setup.ts`, and the reason is worth recording.
 * Playwright launches `webServer` **before** it runs `globalSetup`. The
 * backend records a `startup` lifecycle entry in its lifespan, which opens
 * the file immediately — so by the time `global-setup` runs, the record is
 * held open by another process and `rmSync` fails on Windows with EPERM.
 * Truncating instead would "work" and silently destroy the very startup
 * entry the suite asserts is present.
 *
 * The database does not have this problem: nothing opens it until the first
 * request, which is why deleting it in `global-setup` is fine and this is
 * not.
 *
 * Run from the `test:e2e` script, before `playwright test`.
 */
const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../backend',
)

for (const name of ['e2e-telemetry.jsonl', 'e2e-telemetry.jsonl.1']) {
  rmSync(path.join(BACKEND_DIR, name), { force: true })
}
