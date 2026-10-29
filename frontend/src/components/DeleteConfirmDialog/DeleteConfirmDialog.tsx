import { useEffect, useId, useRef } from 'react'

import type { Task } from '../../hooks/useTasks'
import styles from './DeleteConfirmDialog.module.css'

export interface DeleteConfirmDialogProps {
  /** The task awaiting confirmation, or null when the dialog is closed. */
  task: Task | null
  onConfirm: (task: Task) => void
  onCancel: () => void
}

/**
 * Blocking confirmation before a permanent delete (FR-013, FR-014, FR-022).
 *
 * Uses the native `<dialog>` element with `showModal()`, which provides the
 * focus trap, Escape-to-close, and inertness of the background for free.
 * `role="dialog"` on a div would mean reimplementing all three, and the
 * constitution asks for native semantics before ARIA.
 *
 * The dialog names the task it is about to delete. A bare "Are you sure?"
 * gives a screen reader user no way to verify they are deleting the right
 * one — they cannot see which row they came from.
 */
export function DeleteConfirmDialog({ task, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return

    if (task !== null && !dialog.open) {
      dialog.showModal()
    } else if (task === null && dialog.open) {
      dialog.close()
    }
  }, [task])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={headingId}
      // The native `cancel` event is what Escape produces. Routing it through
      // onCancel keeps "dismissed" and "cancelled" the same path, so focus
      // returns to the trigger either way (FR-022).
      //
      // There is deliberately NO onClose handler. `close` fires for every
      // close including a successful confirm, so routing it to onCancel made
      // confirming also run the cancel path — refocusing a trigger that was
      // being removed from the DOM, and fighting the post-deletion focus
      // placement. Opening and closing are driven by the `task` prop; the
      // close event carries no information this component needs.
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      {task !== null && (
        <>
          <h2 id={headingId} className={styles.heading}>
            Delete this task?
          </h2>

          <p className={styles.body}>
            <span className={styles.title}>{task.title}</span>
          </p>

          <p className={styles.warning}>This cannot be undone.</p>

          <div className={styles.actions}>
            {/*
              Cancel comes first in DOM order, so it receives initial focus
              when the dialog opens. The safe choice should be the default
              one for a destructive, irreversible action.
            */}
            <button
              type="button"
              className={`${styles.button} ${styles.cancel}`}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.confirm}`}
              onClick={() => {
                onConfirm(task)
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
