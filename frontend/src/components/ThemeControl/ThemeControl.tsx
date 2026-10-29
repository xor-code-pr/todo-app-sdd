import { useId } from 'react'

import type { ThemePreference } from '../../hooks/useTheme'
import { isThemePreference } from '../../hooks/useTheme'
import styles from './ThemeControl.module.css'

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Follow system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export interface ThemeControlProps {
  preference: ThemePreference
  onChange: (next: ThemePreference) => void
  announce: (message: string) => void
}

/**
 * Theme preference control.
 *
 * A native `<select>` with a visible `<label>`: one tab stop, keyboard
 * behaviour supplied by the browser, and a screen reader announces both the
 * name and the current value — "Theme, combo box, Follow system". No `role=`
 * attribute is needed or used (Principle III).
 *
 * A radio group was the main alternative and is arguably clearer about
 * "three mutually exclusive choices", but costs three tab stops and three
 * labels for a preference set rarely (research.md R3). A toggle was rejected
 * outright: it expresses two states and there are three.
 */
export function ThemeControl({ preference, onChange, announce }: ThemeControlProps) {
  const selectId = useId()

  return (
    <div className={styles.control}>
      <label className={styles.label} htmlFor={selectId}>
        Theme
      </label>
      <select
        id={selectId}
        className={styles.select}
        value={preference}
        onChange={(event) => {
          const next = event.target.value
          // The value can only be one of the three rendered options, but
          // narrowing here keeps the union honest rather than asserting it.
          if (!isThemePreference(next)) return

          onChange(next)

          const label = OPTIONS.find((option) => option.value === next)?.label ?? next
          // Through the single existing live region — never a second one.
          announce(`Theme set to ${label}.`)
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
