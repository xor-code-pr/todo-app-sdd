import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Task } from '../../hooks/useTasks'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

function task(title = 'Buy milk'): Task {
  return {
    id: 1,
    title,
    completed: false,
    created_at: '2026-10-29T12:00:00Z',
    completed_at: null,
  }
}

function setup(subject: Task | null) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  const utils = render(
    <DeleteConfirmDialog task={subject} onConfirm={onConfirm} onCancel={onCancel} />,
  )
  return { ...utils, user, onConfirm, onCancel }
}

describe('visibility', () => {
  it('is closed when no task is pending', () => {
    setup(null)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens as a modal when a task is pending', () => {
    setup(task())

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('identifying the task', () => {
  it('names the task it is about to delete', () => {
    // FR-013. A bare "Are you sure?" gives a screen reader user no way to
    // verify they are deleting the right one — they cannot see the row.
    setup(task('Pay the gas bill'))

    expect(screen.getByRole('dialog')).toHaveTextContent('Pay the gas bill')
  })

  it('is labelled by its heading', () => {
    setup(task())

    expect(screen.getByRole('dialog', { name: /delete this task\?/i })).toBeInTheDocument()
  })

  it('says the action cannot be undone', () => {
    // FR-012 — deletion is permanent, and the user is told so before it happens.
    setup(task())

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('uses no role attribute — <dialog> supplies the semantics', () => {
    const { container } = setup(task())

    expect(container.querySelectorAll('[role]')).toHaveLength(0)
  })
})

describe('cancelling', () => {
  it('cancel reports a cancel and never a confirm', async () => {
    const { user, onCancel, onConfirm } = setup(task())

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('a native cancel event (Escape) is routed to onCancel, not onConfirm', () => {
    // What this owns: the wiring. The `cancel` event is what a browser fires
    // for Escape on a <dialog>; this asserts the handler routes it to the
    // safe path. That Escape actually PRODUCES the event is the browser's
    // job and is covered in E2E.
    const { onCancel, onConfirm } = setup(task())

    const dialog = screen.getByRole('dialog')
    dialog.dispatchEvent(new Event('cancel', { cancelable: true, bubbles: false }))

    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('places Cancel before Delete in DOM order', () => {
    // Why this matters: a native modal gives initial focus to the first
    // focusable element, so ordering is how "the safe choice is the default"
    // is actually implemented for an irreversible action. The resulting
    // focus is verified in E2E, where the browser supplies it.
    setup(task())

    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons[0]).toMatch(/cancel/i)
    expect(buttons[1]).toMatch(/delete/i)
  })
})

describe('confirming', () => {
  it('reports the task to delete', async () => {
    const subject = task()
    const { user, onConfirm } = setup(subject)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(onConfirm).toHaveBeenCalledWith(subject)
  })

  it('the confirm button is operable from the keyboard', async () => {
    const subject = task()
    const { user, onConfirm } = setup(subject)

    screen.getByRole('button', { name: /^delete$/i }).focus()
    await user.keyboard('{Enter}')

    expect(onConfirm).toHaveBeenCalledWith(subject)
  })
})

/*
 * Not tested here, on purpose: focus trapping, Escape-to-close, initial
 * focus, and background inertness. jsdom does not implement <dialog>, and the
 * stub in setupTests.ts deliberately does not emulate them — the entire point
 * of using a native <dialog> is that the browser provides those behaviours.
 * Asserting them against a stub would test the stub. They are covered by
 * us3-delete.spec.ts in a real browser.
 */
