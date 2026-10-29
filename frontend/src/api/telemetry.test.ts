import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { NETWORK_UNREACHABLE, codeFrom, report } from './telemetry'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Spy on the generated client rather than on `fetch`.
 *
 * `openapi-fetch` captures `globalThis.fetch` when the client is created, at
 * module load — so replacing the global afterwards changes nothing, and a
 * test written that way passes for the wrong reason or fails for a confusing
 * one. The client call is the boundary this module actually owns.
 */
function spyOnPost(impl: () => Promise<unknown>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(api, 'POST').mockImplementation(impl as never)
}

describe('report', () => {
  it('posts the operation and code to the local endpoint', () => {
    const post = spyOnPost(async () => ({ data: undefined, error: undefined }))

    report('task_created', NETWORK_UNREACHABLE)

    expect(post).toHaveBeenCalledWith('/api/telemetry', {
      body: { operation: 'task_created', code: 'NETWORK_UNREACHABLE', duration_ms: null },
    })
  })

  it('includes a duration when one is given', () => {
    const post = spyOnPost(async () => ({ data: undefined, error: undefined }))

    report('task_deleted', 'TASK_NOT_FOUND', 42.5)

    expect(post).toHaveBeenCalledWith('/api/telemetry', {
      body: { operation: 'task_deleted', code: 'TASK_NOT_FOUND', duration_ms: 42.5 },
    })
  })

  it('returns undefined, not a promise', () => {
    spyOnPost(async () => ({ data: undefined, error: undefined }))

    // Structural, not stylistic. A promise return would let a caller await
    // reporting inside a path the user is waiting on, and FR-017 says the
    // recorder must never slow a user action.
    expect(report('task_created', NETWORK_UNREACHABLE)).toBeUndefined()
  })

  it('does not throw when the request rejects', async () => {
    // The commonest case by far: the server being unreachable is usually the
    // very failure being reported.
    const post = spyOnPost(() => Promise.reject(new TypeError('Failed to fetch')))

    expect(() => report('task_created', NETWORK_UNREACHABLE)).not.toThrow()

    await vi.waitFor(() => expect(post).toHaveBeenCalled())
  })

  it('leaves no unhandled rejection behind', async () => {
    const post = spyOnPost(() => Promise.reject(new TypeError('Failed to fetch')))
    const unhandled = vi.fn()
    globalThis.addEventListener('unhandledrejection', unhandled)

    report('task_created', NETWORK_UNREACHABLE)
    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    await Promise.resolve()

    globalThis.removeEventListener('unhandledrejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('does not throw when the server rejects the body', () => {
    spyOnPost(async () => ({ data: undefined, error: { error: { code: 'VALIDATION_ERROR' } } }))

    expect(() => report('task_created', 'WHATEVER')).not.toThrow()
  })
})

describe('codeFrom', () => {
  it('uses the envelope code when there is one', () => {
    expect(codeFrom({ error: { code: 'TITLE_TOO_LONG', message: 'x' } })).toBe(
      'TITLE_TOO_LONG',
    )
  })

  it.each([
    undefined,
    null,
    'a string',
    {},
    { error: null },
    { error: {} },
    { error: { code: 42 } },
  ])('falls back to a transport code for %o', (value) => {
    expect(codeFrom(value)).toBe(NETWORK_UNREACHABLE)
  })

  it.each([
    'could not reach the server',
    "Title too long: 'Buy milk'",
    'lowercase',
    'has spaces',
    'x'.repeat(65),
  ])('refuses to pass %o through as a code', (value) => {
    // The endpoint would reject these anyway. Stopping them here means a
    // message that somehow reached this function never leaves the browser at
    // all, rather than being dropped at the boundary.
    expect(codeFrom({ error: { code: value } })).toBe(NETWORK_UNREACHABLE)
  })
})
