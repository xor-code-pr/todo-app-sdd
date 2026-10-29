import { useId } from 'react'

import type { Task } from '../../hooks/useTasks'
import styles from './TaskItem.module.css'

export interface TaskItemProps {
  task: Task
  onToggle: (task: Task, completed: boolean) => void
  onRequestDelete: (task: Task) => void
  /** Lets TaskList find this row's checkbox again after the list reorders. */
  registerCheckbox: (id: number, node: HTMLInputElement | null) => void
}

/**
 * A single row.
 *
 * The checkbox is a native `<input type="checkbox">` and carries **no**
 * `aria-checked`. The browser derives that state from the element itself; a
 * hand-managed attribute can only drift out of sync with the real one. The
 * title is the checkbox's `<label>`, which gives it an accessible name — a
 * screen reader reads "Buy milk, checkbox, not checked", so completion state
 * is conveyed without any reference to the strikethrough (FR-011).
 */
export function TaskItem({
  task,
  onToggle,
  onRequestDelete,
  registerCheckbox,
}: TaskItemProps) {
  const checkboxId = useId()

  return (
    <li className={styles.item}>
      <input
        id={checkboxId}
        ref={(node) => {
          registerCheckbox(task.id, node)
        }}
        className={styles.checkbox}
        type="checkbox"
        checked={task.completed}
        onChange={(event) => {
          onToggle(task, event.target.checked)
        }}
      />
      <label
        htmlFor={checkboxId}
        className={task.completed ? `${styles.title} ${styles.done}` : styles.title}
      >
        {task.title}
      </label>

      {/*
        The accessible name includes the title, so a screen reader user moving
        between rows hears "Delete Buy milk, button" rather than a column of
        identical "Delete" buttons with no way to tell them apart.
      */}
      <button
        type="button"
        className={styles.delete}
        onClick={() => {
          onRequestDelete(task)
        }}
      >
        Delete<span className={styles.visuallyHidden}> {task.title}</span>
      </button>
    </li>
  )
}
