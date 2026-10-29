import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against a live frontend AND a live backend on a disposable SQLite
 * file (constitution, Testing boundaries). Playwright talks to a real API here,
 * never a mock.
 *
 * The database file is deleted by global-setup before the run, then created by
 * `alembic upgrade head` — never by `metadata.create_all`, because migrations
 * are the only permitted route to a schema.
 */
const BACKEND_PORT = 8000
const FRONTEND_PORT = 5173

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',

  // One worker, no parallelism: every test shares a single SQLite file, so
  // concurrent workers would race on the same rows and make ordering
  // assertions (FR-016 to FR-018) nondeterministic.
  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Serve only. global-setup has already deleted and re-migrated the
      // database by this point.
      command: `python -m uvicorn taskflow.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: '../backend',
      env: { TASKFLOW_DB_PATH: 'e2e.db' },
      url: `http://127.0.0.1:${BACKEND_PORT}/openapi.json`,
      // Never reuse. global-setup deletes the database file, so a reused
      // server would keep serving a connection to a file that no longer has
      // a tasks table — `alembic upgrade head` only runs when the process
      // starts. The symptom is a 500 with no CORS headers, which reaches the
      // browser as an opaque transport failure rather than as a server error.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      // Also false: a reused dev server predates any change to vite.config.ts,
      // which makes configuration bugs look like application bugs.
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
