import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly. Vite's default `localhost` resolves to ::1 on
    // Windows, so a readiness probe or a baseURL using 127.0.0.1 is refused
    // while the same name works in a browser — a mismatch that shows up only
    // as an opaque Playwright webServer timeout.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    // Explicit imports from 'vitest' rather than ambient globals — keeps the
    // type surface honest under `strict`.
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,
  },
})
