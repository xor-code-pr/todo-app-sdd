import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import * as telemetry from '../api/telemetry'
import { useTasks } from './useTasks'

/**
 * Failure reporting from the hook that owns every API call.
 *
 * A new file: the hook has until now been covered through the components
 * that use it, so nothing here edits an existing test (FR-019).
 *
 * The assertions are deliberately in two halves. The first is that a report
 * goes out. The second — the one that matters — is that the value the UI
 * receives is **unchanged**, because FR-020 says this feature adds a record
 * and changes nothing a person sees.
 */

const TASK = {
  id: 1,
  title: 'Buy milk',
  completed: false,
  created_at: '2026-10-30T10:00:00Z',
  completed_at: null,
}

let reportSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  reportSpy = vi.spyOn(telemetry, 'report').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockList(tasks: unknown[] = [TASK]): void {
  vi.spyOn(api, 'GET').mockImplementation(
    (async () => ({ data: tasks, error: undefined })) as never,
  )
}

async function readyHook(): Promise<ReturnType<typeof renderHook<ReturnType<typeof useTasks>, void>>> {
  const rendered = renderHook(() => useTasks())
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'))
  return rendered
}

describe('reporting a transport failure', () => {
  it('reports once when the list cannot be loaded, and still shows the message', async () => {
    vi.spyOn(api, 'GET').mockImplementation(
      (() => Promise.reject(new TypeError('Failed to fetch'))) as never,
    )

    const { result } = renderHook(() => useTasks())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(reportSpy).toHaveBeenCalledTimes(1)
    expect(reportSpy).toHaveBeenCalledWith('task_list_read', 'NETWORK_UNREACHABLE')
    // Unchanged from before this feature existed.
    expect(result.current.loadError).toBe(
      'Could not reach the server. Check that the API is running.',
    )
  })

  it('reports a failed create without altering what the caller is told', async () => {
    mockList()
    vi.spyOn(api, 'POST').mockImplementation(
      (() => Promise.reject(new TypeError('Failed to fetch'))) as never,
    )
    const { result } = await readyHook()

    let outcome: Awaited<ReturnType<typeof result.current.create>> | undefined
    await act(async () => {
      outcome = await result.current.create('Buy milk')
    })

    expect(reportSpy).toHaveBeenCalledWith('task_created', 'NETWORK_UNREACHABLE')
    expect(outcome).toEqual({
      ok: false,
      message: 'Could not reach the server. Your task was not saved.',
    })
  })

  it('distinguishes completing from reopening', async () => {
    mockList()
    vi.spyOn(api, 'PATCH').mockImplementation(
      (() => Promise.reject(new TypeError('Failed to fetch'))) as never,
    )
    const { result } = await readyHook()

    await act(async () => {
      await result.current.setCompleted(1, true)
    })
    await act(async () => {
      await result.current.setCompleted(1, false)
    })

    expect(reportSpy).toHaveBeenCalledWith('task_completed', 'NETWORK_UNREACHABLE')
    expect(reportSpy).toHaveBeenCalledWith('task_reopened', 'NETWORK_UNREACHABLE')
  })

  it('reports a failed delete', async () => {
    mockList()
    vi.spyOn(api, 'DELETE').mockImplementation(
      (() => Promise.reject(new TypeError('Failed to fetch'))) as never,
    )
    const { result } = await readyHook()

    await act(async () => {
      await result.current.remove(1)
    })

    expect(reportSpy).toHaveBeenCalledWith('task_deleted', 'NETWORK_UNREACHABLE')
  })
})

describe('reporting an HTTP error response', () => {
  it('sends the envelope code, never the message beside it', async () => {
    mockList()
    vi.spyOn(api, 'POST').mockImplementation(
      (async () => ({
        data: undefined,
        error: {
          error: {
            code: 'TITLE_TOO_LONG',
            // The shape of message that makes this feature's privacy rule
            // necessary: a server-authored sentence quoting what was typed.
            message: "Title too long: 'Buy milk and call the dentist'",
            field: 'title',
          },
        },
      })) as never,
    )
    const { result } = await readyHook()

    await act(async () => {
      await result.current.create('Buy milk and call the dentist')
    })

    expect(reportSpy).toHaveBeenCalledWith('task_created', 'TITLE_TOO_LONG')
    const reported = JSON.stringify(reportSpy.mock.calls)
    expect(reported).not.toContain('dentist')
  })
})

describe('nothing is reported when nothing fails', () => {
  it('stays silent through a successful load and create', async () => {
    mockList()
    vi.spyOn(api, 'POST').mockImplementation(
      (async () => ({ data: TASK, error: undefined })) as never,
    )
    const { result } = await readyHook()

    await act(async () => {
      await result.current.create('Buy milk')
    })

    expect(reportSpy).not.toHaveBeenCalled()
  })
})
