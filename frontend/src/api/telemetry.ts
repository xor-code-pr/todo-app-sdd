/**
 * Fire-and-forget failure reporting.
 *
 * A browser cannot write to a file, and Principle VII requires failures from
 * both sides, so the only way a browser-side failure reaches the record is by
 * posting it to the local server. Nothing leaves the machine: this is the
 * same origin the application already talks to.
 *
 * Two properties matter more than anything this file does:
 *
 * 1. **It returns `void`, not a promise.** No caller can await it into a path
 *    the user is waiting on, which is how FR-017 is enforced structurally
 *    rather than by remembering.
 * 2. **It swallows everything.** Reporting a failure must never cause one
 *    (FR-006a). If the server is down, the report is simply lost — which is
 *    the honest limitation recorded in quickstart.md Scenario 2.
 *
 * What is sent is an operation name and a short code. Never the caught
 * error's message: that can carry a server response, a URL, or a task title.
 */

import { api } from './client'
import type { components } from './schema'

type Report = components['schemas']['TelemetryReport']

export type TelemetryOperation = Report['operation']

/**
 * Codes this client can produce.
 *
 * A closed set, upper-case and underscore-separated to match what the server
 * will accept — the endpoint rejects anything that could hold a sentence, so
 * a stray message passed here would be dropped at the boundary rather than
 * written. Keeping the vocabulary here as well means that never happens in
 * the first place.
 */
export const NETWORK_UNREACHABLE = 'NETWORK_UNREACHABLE'

/** Record a browser-side failure. Returns immediately, always. */
export function report(
  operation: TelemetryOperation,
  code: string,
  durationMs?: number,
): void {
  // Deliberately not returned and not awaited.
  void api
    .POST('/api/telemetry', {
      body: { operation, code, duration_ms: durationMs ?? null },
    })
    .catch(() => {
      // The server is unreachable, which is very often the same failure we
      // were trying to report. Nothing useful remains to be done, and doing
      // anything here would make the recorder load-bearing.
    })
}

/**
 * Normalise an arbitrary caught value into a code the endpoint will accept.
 *
 * Returns the envelope's `code` when there is one — it is already a closed
 * vocabulary — and a generic transport code otherwise. The envelope's
 * `message` beside it is human prose and is never sent.
 */
export function codeFrom(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null
  ) {
    const code = (value as { error: { code?: unknown } }).error.code
    if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)) {
      return code
    }
  }
  return NETWORK_UNREACHABLE
}
