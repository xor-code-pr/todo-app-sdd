import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type { MutationResult } from '../../hooks/useTasks'
import styles from './AddTaskForm.module.css'

const MAX_TITLE_GRAPHEMES = 150

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Count user-perceived characters, matching the server's UAX #29 rule.
 *
 * `"👨‍👩‍👧‍👦".length` is 11 — string length counts UTF-16 code units, which would
 * make the limit depend on encoding and reject a title of eleven emoji. This
 * count is advisory feedback only; the server re-validates and wins.
 */
function countGraphemes(value: string): number {
  let total = 0
  for (const _segment of segmenter.segment(value)) {
    total += 1
  }
  return total
}

export interface AddTaskFormProps {
  onCreate: (rawTitle: string) => Promise<MutationResult>
  announce: (message: string) => void
}

export function AddTaskForm({ onCreate, announce }: AddTaskFormProps) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const inputId = useId()
  const counterId = useId()
  const errorId = useId()

  const trimmed = title.trim()
  const graphemes = countGraphemes(trimmed)
  const tooLong = graphemes > MAX_TITLE_GRAPHEMES

  function fail(message: string): void {
    setError(message)
    announce(message)
    // FR-004: focus remains in the input so the user can correct in place.
    inputRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return

    if (trimmed.length === 0) {
      fail('Enter a task title before adding.')
      return
    }

    if (tooLong) {
      fail(`Title must be ${MAX_TITLE_GRAPHEMES} characters or fewer. Currently ${graphemes}.`)
      return
    }

    // Only the button is disabled during flight, never the input — the user
    // may already be typing the next title (research.md R6).
    setSubmitting(true)
    const result = await onCreate(title)
    setSubmitting(false)

    if (result.ok) {
      setTitle('')
      setError(null)
      announce(`Added ${trimmed}.`)
    } else {
      setError(result.message)
      announce(result.message)
    }

    // FR-005: focus returns to the now-empty input either way, so ten
    // consecutive adds never require relocating the cursor.
    inputRef.current?.focus()
  }

  const describedBy = [counterId, error === null ? null : errorId].filter(Boolean).join(' ')

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      noValidate
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={inputId}>
          Task title
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className={styles.input}
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error !== null) setError(null)
          }}
          aria-invalid={error !== null || tooLong}
          aria-describedby={describedBy}
          autoComplete="off"
        />
        <span
          id={counterId}
          className={tooLong ? `${styles.counter} ${styles.counterOver}` : styles.counter}
        >
          {graphemes} of {MAX_TITLE_GRAPHEMES} characters
        </span>
      </div>

      {/*
        Not disabled on empty or over-length input. FR-004 requires that
        submitting an invalid title produce a visible, announced error — a
        disabled button would swallow the attempt and explain nothing.
      */}
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add Task'}
      </button>

      {error !== null && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </form>
  )
}
