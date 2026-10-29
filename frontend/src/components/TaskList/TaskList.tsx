import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { TaskItem } from '../TaskItem/TaskItem'
import type { LoadStatus, MutationResult, Task } from '../../hooks/useTasks'
import styles from './TaskList.module.css'

export interface TaskListProps {
  tasks: Task[]
  status: LoadStatus
  loadError: string | null
  onSetCompleted: (id: number, completed: boolean) => Promise<MutationResult>
  announce: (message: string) => void
}

interface PendingToggle {
  id: number
  previousIndex: number
  completed: boolean
  /** The array identity at request time — see the effect below. */
  tasksAtRequest: Task[]
}

export function TaskList({
  tasks,
  status,
  loadError,
  onSetCompleted,
  announce,
}: TaskListProps) {
  const checkboxes = useRef(new Map<number, HTMLInputElement>())
  const [pending, setPending] = useState<PendingToggle | null>(null)

  const registerCheckbox = useCallback((id: number, node: HTMLInputElement | null) => {
    if (node === null) {
      checkboxes.current.delete(id)
    } else {
      checkboxes.current.set(id, node)
    }
  }, [])

  const handleToggle = useCallback(
    (task: Task, completed: boolean): void => {
      setPending({
        id: task.id,
        previousIndex: tasks.findIndex((candidate) => candidate.id === task.id),
        completed,
        tasksAtRequest: tasks,
      })

      void onSetCompleted(task.id, completed).then((result) => {
        if (!result.ok) {
          // Nothing moved and nothing changed — drop the pending focus work
          // or the effect would wait forever for a list that never updates.
          setPending(null)
          announce(result.message)
        }
      })
    },
    [tasks, onSetCompleted, announce],
  )

  /**
   * FR-021 — focus follows a task that moved, and the move is announced only
   * when it actually happened.
   *
   * `useLayoutEffect` rather than `useEffect`: this must run after React has
   * committed the reordered DOM but before the browser paints, so focus never
   * lands on the old position for a frame.
   *
   * The `tasksAtRequest` guard is load-bearing. The effect also fires when
   * `pending` is first set, at which point `tasks` is still the pre-mutation
   * array — computing the new index then would always find it unchanged and
   * announce "no move" for every toggle. Comparing array identity tells us
   * whether the refetch has actually landed.
   */
  useLayoutEffect(() => {
    if (pending === null || tasks === pending.tasksAtRequest) return

    const newIndex = tasks.findIndex((candidate) => candidate.id === pending.id)
    const task = tasks[newIndex]

    if (newIndex === -1 || task === undefined) {
      setPending(null)
      return
    }

    // Keyed by task.id, so React moved this node rather than recreating it —
    // which is the only reason the element is still here to focus.
    const node = checkboxes.current.get(pending.id)
    if (node !== undefined) {
      node.focus()
      node.scrollIntoView({ block: 'nearest' })
    }

    const moved = newIndex !== pending.previousIndex
    const action = pending.completed ? 'Completed' : 'Reopened'
    const movement = moved
      ? pending.completed
        ? ' Moved below your active tasks.'
        : ' Moved back among your active tasks.'
      : ''

    announce(`${action} ${task.title}.${movement}`)
    setPending(null)
  }, [tasks, pending, announce])

  if (status === 'loading') {
    return <p className={styles.status}>Loading your tasks…</p>
  }

  if (status === 'error') {
    return <p className={styles.error}>{loadError ?? 'Could not load your tasks.'}</p>
  }

  if (tasks.length === 0) {
    // An explicit empty state rather than nothing at all, so the condition is
    // perceivable instead of inferred from blank space.
    return <p className={styles.empty}>No tasks yet. Add one above to get started.</p>
  }

  return (
    <ul className={styles.list}>
      {tasks.map((task) => (
        // ⚠️ key={task.id} — NEVER the array index.
        //
        // Completing a task relocates its row. With a stable key React moves
        // the existing DOM node and focus travels with it; with an index key
        // React recycles nodes by position, the focused element is destroyed,
        // focus falls to <body>, and SC-008 fails. The symptom looks like a
        // focus bug but the cause is reconciliation.
        <TaskItem
          key={task.id}
          task={task}
          onToggle={handleToggle}
          registerCheckbox={registerCheckbox}
        />
      ))}
    </ul>
  )
}
