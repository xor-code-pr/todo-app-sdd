import { useCallback, useEffect, useState } from 'react'

/**
 * Three states, not a boolean.
 *
 * "dark" and "currently dark because the system is" behave differently when
 * the OS preference later changes, which is the whole reason this is not a
 * toggle (FR-006b).
 */
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'taskflow-theme'

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && PREFERENCES.includes(value as ThemePreference)
}

/**
 * Read the stored preference, **validating** rather than trusting it.
 *
 * A value of "Dark", "true", or anything written by an older version of the
 * control must be ignored. An unrecognised value written to `data-theme`
 * silently stops matching the selectors in tokens.css, and the user gets
 * light with no explanation and no error.
 */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    // Storage blocked or unavailable. Following the system is the correct
    // fallback, not an error worth surfacing.
    return 'system'
  }
}

/**
 * Apply a preference to the document.
 *
 * `data-theme` is **omitted entirely** for `system`. Its absence is what
 * means "follow the system" in tokens.css — light is the base, the media
 * query overrides it unless the user forced light, and an explicit dark
 * always wins. No colour is computed here; the cascade does that, which is
 * why a live OS change needs no listener.
 */
export function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', preference)
  }
}

export interface UseTheme {
  preference: ThemePreference
  setPreference: (next: ThemePreference) => void
}

export function useTheme(): UseTheme {
  const [preference, setState] = useState<ThemePreference>(readStoredPreference)

  // The inline script in index.html has normally already done this before
  // first paint. Re-applying is idempotent and covers the cases where that
  // script did not run — component tests, and any future host page.
  useEffect(() => {
    applyPreference(preference)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setState(next)
    applyPreference(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The choice still applies for this session; it simply will not
      // survive a reload. Failing the interaction would be worse.
    }
  }, [])

  return { preference, setPreference }
}
