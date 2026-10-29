import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ThemePreference } from '../../hooks/useTheme'
import { ThemeControl } from './ThemeControl'

function setup(preference: ThemePreference = 'system') {
  const onChange = vi.fn()
  const announce = vi.fn()
  const user = userEvent.setup()
  const utils = render(
    <ThemeControl preference={preference} onChange={onChange} announce={announce} />,
  )
  return { ...utils, user, onChange, announce, select: screen.getByLabelText('Theme') }
}

describe('semantics', () => {
  it('is a native combo box named "Theme"', () => {
    // A screen reader reads "Theme, combo box, Follow system" — name and
    // current value together, with no ARIA required.
    setup()

    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
  })

  it('uses no role attribute', () => {
    const { container } = setup()

    expect(container.querySelectorAll('[role]')).toHaveLength(0)
  })

  it('offers exactly three options', () => {
    setup()

    const labels = screen.getAllByRole('option').map((o) => o.textContent)
    expect(labels).toEqual(['Follow system', 'Light', 'Dark'])
  })
})

describe('reflecting the current preference', () => {
  it.each<[ThemePreference, string]>([
    ['system', 'Follow system'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ])('shows %s as the selected option', (preference, label) => {
    const { select } = setup(preference)

    expect(select).toHaveValue(preference)
    expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
  })
})

describe('changing the preference', () => {
  it('reports the new value', async () => {
    const { user, select, onChange } = setup('system')

    await user.selectOptions(select, 'dark')

    expect(onChange).toHaveBeenCalledWith('dark')
  })

  it('announces the change through the live region', async () => {
    const { user, select, announce } = setup('system')

    await user.selectOptions(select, 'light')

    expect(announce).toHaveBeenCalledWith('Theme set to Light.')
  })

  it('announces once per change, not twice', async () => {
    const { user, select, announce } = setup('system')

    await user.selectOptions(select, 'dark')

    expect(announce).toHaveBeenCalledOnce()
  })

  it('names the option rather than echoing the raw value', async () => {
    // "Theme set to Follow system." reads better than "set to system".
    const { user, select, announce } = setup('dark')

    await user.selectOptions(select, 'system')

    expect(announce).toHaveBeenCalledWith('Theme set to Follow system.')
  })
})

describe('keyboard operation', () => {
  it('is reachable by Tab and operable without a mouse', async () => {
    const { user, select, onChange } = setup('system')

    await user.tab()
    expect(select).toHaveFocus()

    await user.selectOptions(select, 'light')
    expect(onChange).toHaveBeenCalledWith('light')
  })
})
