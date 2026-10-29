import { useCallback, useState } from 'react'

/**
 * Zero-width space. Appended to force a DOM text change when the same message
 * is announced twice in a row; it reads as nothing aloud.
 */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

export interface Announcer {
  /** Current live-region text. */
  message: string
  /** Queue a message for assistive technology. */
  announce: (text: string) => void
}

/**
 * Feeds the single live region (FR-020).
 *
 * Announcing identical text twice in a row is a real case here — completing
 * two tasks with the same name, or hitting the same validation error twice —
 * and a screen reader ignores a live region whose text did not change.
 * Alternating a zero-width space makes consecutive identical messages differ
 * as strings while reading identically aloud.
 */
export function useAnnouncer(): Announcer {
  const [message, setMessage] = useState('')

  const announce = useCallback((text: string) => {
    setMessage((previous) => {
      const stripped = previous.endsWith(ZERO_WIDTH_SPACE) ? previous.slice(0, -1) : previous
      return stripped === text ? text + ZERO_WIDTH_SPACE : text
    })
  }, [])

  return { message, announce }
}
