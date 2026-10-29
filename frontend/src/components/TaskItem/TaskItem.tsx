import type { Task } from '../../hooks/useTasks'
import styles from './TaskItem.module.css'

export interface TaskItemProps {
  task: Task
}

/**
 * A single row.
 *
 * US1 renders the title only. The completion checkbox arrives in US2 and the
 * delete control in US3; each slice adds to this component rather than
 * replacing it.
 */
export function TaskItem({ task }: TaskItemProps) {
  return (
    <li className={styles.item}>
      <span className={styles.title}>{task.title}</span>
    </li>
  )
}
