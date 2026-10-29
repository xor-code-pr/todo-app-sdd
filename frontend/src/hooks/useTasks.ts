import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api/client'
import type { components } from '../api/schema'
import { NETWORK_UNREACHABLE, codeFrom, report } from '../api/telemetry'

export type Task = components['schemas']['TaskRead']

export type LoadStatus = 'loading' | 'ready' | 'error'

export type MutationResult = { ok: true } | { ok: false; message: string }

export interface UseTasks {
  /** Tasks in the order the server returned them. Never re-sorted here. */
  tasks: Task[]
  status: LoadStatus
  /** Set when the list itself could not be loaded. */
  loadError: string | null
  create: (rawTitle: string) => Promise<MutationResult>
  setCompleted: (id: number, completed: boolean) => Promise<MutationResult>
  remove: (id: number) => Promise<MutationResult>
  refetch: () => Promise<void>
}

/**
 * Owns the task list.
 *
 * No state library, no cache, no optimistic updates (Principle V,
 * research.md R5). Every mutation awaits its response and then refetches the
 * canonical list, which makes FR-025 — "the displayed list MUST converge on
 * true stored state" — true by construction rather than by reconciliation
 * logic. On failure the previous array is simply left alone.
 *
 * Refetching also keeps the ordering rule single-sourced: a mutation can move
 * a task, so placing it optimistically would mean reimplementing the server's
 * ORDER BY in TypeScript.
 *
 * Every failure path reports to the local record (Principle VII). The catch
 * clauses below used to discard the error object entirely, which is why "the
 * API became unreachable during development and the only trace that ever
 * existed was a sentence on screen" was a true statement about this file.
 * `report` is never awaited and cannot throw, so none of this changes what a
 * user sees (FR-020).
 */
export function useTasks(): UseTasks {
  const [tasks, setTasks] = useState<Task[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const refetch = useCallback(async (): Promise<void> => {
    // openapi-fetch returns `{ error }` for an HTTP error response, but a
    // transport failure — server down, DNS, connection refused — rejects the
    // promise instead. Without this catch the await throws, `status` never
    // leaves 'loading', and an unreachable backend shows a spinner forever
    // with nothing announced. FR-025 requires the opposite.
    try {
      const { data, error } = await api.GET('/api/tasks')

      if (error !== undefined || data === undefined) {
        report('task_list_read', codeFrom(error))
        setStatus('error')
        setLoadError(errorMessage(error, 'Could not load your tasks.'))
        return
      }

      setTasks(data)
      setStatus('ready')
      setLoadError(null)
    } catch {
      report('task_list_read', NETWORK_UNREACHABLE)
      setStatus('error')
      setLoadError('Could not reach the server. Check that the API is running.')
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const create = useCallback(
    async (rawTitle: string): Promise<MutationResult> => {
      try {
        // The raw, untrimmed string goes to the server: it is authoritative
        // for trimming and length, and the client-side counter is advisory.
        const { error } = await api.POST('/api/tasks', { body: { title: rawTitle } })

        if (error !== undefined) {
          report('task_created', codeFrom(error))
          return { ok: false, message: errorMessage(error, 'Could not add the task.') }
        }
      } catch {
        // Transport failure. The list is left exactly as it was, so the
        // display still matches the last known true state.
        report('task_created', NETWORK_UNREACHABLE)
        return { ok: false, message: 'Could not reach the server. Your task was not saved.' }
      }

      await refetch()
      return { ok: true }
    },
    [refetch],
  )

  const setCompleted = useCallback(
    async (id: number, completed: boolean): Promise<MutationResult> => {
      try {
        const { error } = await api.PATCH('/api/tasks/{task_id}', {
          params: { path: { task_id: id } },
          body: { completed },
        })

        if (error !== undefined) {
          report(completed ? 'task_completed' : 'task_reopened', codeFrom(error))
          return { ok: false, message: errorMessage(error, 'Could not update the task.') }
        }
      } catch {
        report(completed ? 'task_completed' : 'task_reopened', NETWORK_UNREACHABLE)
        return { ok: false, message: 'Could not reach the server. Nothing was changed.' }
      }

      // Refetch rather than patching the item in place: completing a task
      // moves it, and placing it locally would mean reimplementing the
      // server's ORDER BY in TypeScript (research.md R3, R5).
      await refetch()
      return { ok: true }
    },
    [refetch],
  )

  const remove = useCallback(
    async (id: number): Promise<MutationResult> => {
      try {
        const { error } = await api.DELETE('/api/tasks/{task_id}', {
          params: { path: { task_id: id } },
        })

        if (error !== undefined) {
          report('task_deleted', codeFrom(error))
          return { ok: false, message: errorMessage(error, 'Could not delete the task.') }
        }
      } catch {
        report('task_deleted', NETWORK_UNREACHABLE)
        return { ok: false, message: 'Could not reach the server. Nothing was deleted.' }
      }

      await refetch()
      return { ok: true }
    },
    [refetch],
  )

  return { tasks, status, loadError, create, setCompleted, remove, refetch }
}
