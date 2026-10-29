import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Task } from '../../hooks/useTasks'
import { TaskItem } from './TaskItem'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Buy milk',
    completed: false,
    created_at: '2026-10-29T12:00:00Z',
    completed_at: null,
    ...overrides,
  }
}

function setup(subject: Task) {
  const onToggle = vi.fn()
  const registerCheckbox = vi.fn()
  const user = userEvent.setup()
  render(<TaskItem task={subject} onToggle={onToggle} registerCheckbox={registerCheckbox} />)
  return { user, onToggle, registerCheckbox }
}

describe('completion state exposed to assistive technology', () => {
  it('names the checkbox with the task title', () => {
    setup(task())

    // A screen reader reads "Buy milk, checkbox, not checked".
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
  })

  it('an active task is unchecked', () => {
    setup(task({ completed: false }))

    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('a completed task is checked', () => {
    setup(task({ completed: true, completed_at: '2026-10-29T13:00:00Z' }))

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('carries no aria-checked attribute', () => {
    // The browser derives checkbox state. A hand-managed aria-checked can
    // only drift out of sync with the real one.
    setup(task({ completed: true }))

    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-checked')
  })

  it('uses no role attribute anywhere', () => {
    const { container } = render(
      <TaskItem task={task()} onToggle={vi.fn()} registerCheckbox={vi.fn()} />,
    )

    expect(container.querySelectorAll('[role]')).toHaveLength(0)
  })

  it('conveys completion without reference to the strikethrough', () => {
    // Remove every stylesheet effect and the state is still readable.
    setup(task({ completed: true }))

    const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' })
    expect(checkbox).toBeChecked()
  })
})

describe('toggling', () => {
  it('reports the new state when checked', async () => {
    const subject = task({ completed: false })
    const { user, onToggle } = setup(subject)

    await user.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledWith(subject, true)
  })

  it('reports the new state when unchecked', async () => {
    const subject = task({ completed: true })
    const { user, onToggle } = setup(subject)

    await user.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledWith(subject, false)
  })

  it('can be toggled from the keyboard with Space', async () => {
    const subject = task()
    const { user, onToggle } = setup(subject)

    screen.getByRole('checkbox').focus()
    await user.keyboard(' ')

    expect(onToggle).toHaveBeenCalledWith(subject, true)
  })

  it('clicking the title toggles it, since the title is the label', async () => {
    const subject = task()
    const { user, onToggle } = setup(subject)

    await user.click(screen.getByText('Buy milk'))

    expect(onToggle).toHaveBeenCalledWith(subject, true)
  })
})

describe('checkbox registration', () => {
  it('registers its checkbox node so the list can refocus it after a move', () => {
    const { registerCheckbox } = setup(task({ id: 42 }))

    expect(registerCheckbox).toHaveBeenCalledWith(42, expect.any(HTMLInputElement))
  })
})
