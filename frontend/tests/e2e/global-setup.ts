import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_FILENAME = 'e2e.db'
const TELEMETRY_FILENAME = 'e2e-telemetry.jsonl'

/**
 * Build a fresh, migrated database before any server starts.
 *
 * The migration runs here rather than being chained onto the webServer
 * command with `&&`. Chaining looked fine and silently did not run the
 * upgrade: uvicorn started regardless, created a 0-byte SQLite file on its
 * first query, and every request failed with "no such table: tasks" — which
 * reached the browser as an opaque transport error because a 500 raised
 * above the CORS middleware carries no CORS headers.
 *
 * Running it here keeps the ordering explicit and the failure loud: if the
 * migration fails, the suite stops with Alembic's own output instead of ten
 * tests failing for a reason none of them mention.
 *
 * The schema is built by Alembic, never by metadata.create_all — migrations
 * are the only permitted route to a schema (constitution).
 */
export default function globalSetup(): void {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const backendDir = path.resolve(here, '../../../backend')

  for (const name of [DB_FILENAME, `${DB_FILENAME}-journal`, `${DB_FILENAME}-wal`, `${DB_FILENAME}-shm`]) {
    rmSync(path.join(backendDir, name), { force: true })
  }

  // The telemetry record is NOT reset here — see tests/e2e/reset-telemetry.mjs.
  // Playwright starts webServer before globalSetup, and the backend opens the
  // record during its lifespan, so by this point another process holds it.

  execFileSync('python', ['-m', 'alembic', 'upgrade', 'head'], {
    cwd: backendDir,
    env: {
      ...process.env,
      TASKFLOW_DB_PATH: DB_FILENAME,
      TASKFLOW_TELEMETRY_PATH: TELEMETRY_FILENAME,
    },
    stdio: 'inherit',
  })
}
