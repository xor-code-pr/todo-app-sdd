import styles from './LiveRegion.module.css'

export interface LiveRegionProps {
  message: string
}

/**
 * The one and only live region in the application (FR-020).
 *
 * Deliberately singular. Multiple live regions compete and interleave
 * unpredictably across screen readers — one owner, one queue, one place to
 * look when an announcement goes missing.
 *
 * `aria-live` is an attribute, not a role: there is no native HTML element
 * that expresses "announce changes to this region", so this is the case
 * Principle III permits ARIA for.
 */
export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <div className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
