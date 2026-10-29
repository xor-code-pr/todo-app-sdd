import styles from './LiveRegion.module.css'

export interface LiveRegionProps {
  message: string
}

/**
 * The one and only live region in the application (FR-020).
 *
 * Uses `<output>`, not a `<div aria-live>`. `<output>` is the native element
 * for "result of a calculation or user action" and carries an implicit
 * `status` role, which is itself an implicit polite live region — so this
 * satisfies Principle III's "native semantic HTML before ARIA" without
 * reaching for `role=`.
 *
 * This matters in practice, not just on paper: a bare `aria-live` attribute
 * on a plain div was verified silent in NVDA 2026.2 + Chrome during the T037
 * manual pass, while the element's own text was provably correct in the DOM.
 * `aria-live` and `aria-atomic` are kept as explicit belt-and-braces, since
 * support for `<output>` as a live region varies between screen readers.
 *
 * Deliberately singular. Multiple live regions compete and interleave
 * unpredictably — one owner, one queue, one place to look when an
 * announcement goes missing.
 */
export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <output className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
      {message}
    </output>
  )
}
