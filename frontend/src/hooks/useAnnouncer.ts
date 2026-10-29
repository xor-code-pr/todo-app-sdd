import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Zero-width space. Appended to force a DOM text change when the same message
 * is announced twice in a row; it reads as nothing aloud.
 */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

/**
 * Delay before the live region is populated.
 *
 * Submitting clears the input, announces, and returns focus to the field all
 * in the same tick. A `polite` announcement landing in the same frame as a
 * focus change is routinely dropped — the screen reader services the focus
 * event and never comes back to the region. Letting the focus move settle
 * first costs nothing a user can perceive, and is the difference between the
 * announcement being spoken and being silent.
 */
const ANNOUNCE_DELAY_MS = 120

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const announce = useCallback((text: string) => {
    // A newer message supersedes one still waiting: announcing both would
    // read stale text aloud before the current state.
    if (timer.current !== null) clearTimeout(timer.current)

    timer.current = setTimeout(() => {
      setMessage((previous) => {
        const stripped = previous.endsWith(ZERO_WIDTH_SPACE)
          ? previous.slice(0, -1)
          : previous
        return stripped === text ? text + ZERO_WIDTH_SPACE : text
      })
    }, ANNOUNCE_DELAY_MS)
  }, [])

  return { message, announce }
}
