import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api/client'
import type { components } from '../api/schema'

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
        setStatus('error')
        setLoadError(errorMessage(error, 'Could not load your tasks.'))
        return
      }

      setTasks(data)
      setStatus('ready')
      setLoadError(null)
    } catch {
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
          return { ok: false, message: errorMessage(error, 'Could not add the task.') }
        }
      } catch {
        // Transport failure. The list is left exactly as it was, so the
        // display still matches the last known true state.
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
          return { ok: false, message: errorMessage(error, 'Could not update the task.') }
        }
      } catch {
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
          return { ok: false, message: errorMessage(error, 'Could not delete the task.') }
        }
      } catch {
        return { ok: false, message: 'Could not reach the server. Nothing was deleted.' }
      }

      await refetch()
      return { ok: true }
    },
    [refetch],
  )

  return { tasks, status, loadError, create, setCompleted, remove, refetch }
}
