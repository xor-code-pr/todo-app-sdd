import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyPreference, isThemePreference, readStoredPreference, useTheme } from './useTheme'

const KEY = 'taskflow-theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('validating what was stored', () => {
  it.each(['system', 'light', 'dark'])('accepts %s', (value) => {
    expect(isThemePreference(value)).toBe(true)
  })

  it.each(['Dark', 'true', '', 'DARK', 'auto', 'light-mode', '1'])(
    'rejects %o and falls back to system',
    (value) => {
      // A value from an older version of the control, or from anywhere else,
      // must never reach data-theme: an unrecognised value stops matching the
      // selectors and the user silently gets light with no error.
      localStorage.setItem(KEY, value)

      expect(isThemePreference(value)).toBe(false)
      expect(readStoredPreference()).toBe('system')
    },
  )

  it('falls back to system when nothing is stored', () => {
    expect(readStoredPreference()).toBe('system')
  })

  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    expect(readStoredPreference()).toBe('system')
  })
})

describe('applying a preference to the document', () => {
  it('omits data-theme entirely for system', () => {
    // Absence is what means "follow the system" in tokens.css. Writing
    // data-theme="system" would need a second selector for one state.
    applyPreference('dark')
    applyPreference('system')

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it.each<['light' | 'dark', string]>([
    ['light', 'light'],
    ['dark', 'dark'],
  ])('sets data-theme=%s for an explicit choice', (preference, expected) => {
    applyPreference(preference)

    expect(document.documentElement.getAttribute('data-theme')).toBe(expected)
  })
})

describe('useTheme', () => {
  it('starts from the stored preference', () => {
    localStorage.setItem(KEY, 'dark')

    const { result } = renderHook(() => useTheme())

    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('starts at system when the stored value is invalid', () => {
    localStorage.setItem(KEY, 'Dark')

    const { result } = renderHook(() => useTheme())

    expect(result.current.preference).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('persists a change so it survives a reload', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setPreference('light')
    })

    expect(localStorage.getItem(KEY)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('still applies the choice for this session when storage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setPreference('dark')
    })

    // The preference does not survive a reload, but failing the interaction
    // outright would be the worse outcome.
    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('returning to system removes the attribute again', () => {
    localStorage.setItem(KEY, 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setPreference('system')
    })

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('system')
  })
})
