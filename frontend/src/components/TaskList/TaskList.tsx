import { TaskItem } from '../TaskItem/TaskItem'
import type { LoadStatus, Task } from '../../hooks/useTasks'
import styles from './TaskList.module.css'

export interface TaskListProps {
  tasks: Task[]
  status: LoadStatus
  loadError: string | null
}

export function TaskList({ tasks, status, loadError }: TaskListProps) {
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
        // In US2 completing a task relocates its row. With a stable key React
        // moves the existing DOM node and focus travels with it; with an index
        // key React recreates the node, the focused element is destroyed,
        // focus falls to <body>, and SC-008 fails. The symptom looks like a
        // focus bug but the cause is reconciliation.
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  )
}
