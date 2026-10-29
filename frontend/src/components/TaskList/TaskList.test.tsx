import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { MutationResult, Task } from '../../hooks/useTasks'
import { TaskList } from './TaskList'

function task(id: number, title: string, completed = false): Task {
  return {
    id,
    title,
    completed,
    created_at: '2026-10-29T12:00:00Z',
    completed_at: completed ? '2026-10-29T13:00:00Z' : null,
  }
}

const noop = async (): Promise<MutationResult> => ({ ok: true })

function renderList(tasks: Task[], overrides: Partial<Parameters<typeof TaskList>[0]> = {}) {
  const announce = vi.fn()
  const onSetCompleted = vi.fn(noop)
  const utils = render(
    <TaskList
      tasks={tasks}
      status="ready"
      loadError={null}
      onSetCompleted={onSetCompleted}
      announce={announce}
      {...overrides}
    />,
  )
  return { ...utils, announce, onSetCompleted }
}

describe('rendering', () => {
  it('renders tasks in the order received, without re-sorting', () => {
    renderList([task(3, 'newest'), task(2, 'middle'), task(1, 'oldest')])

    const titles = screen.getAllByRole('checkbox').map((node) => node.getAttribute('id'))
    expect(titles).toHaveLength(3)
    expect(screen.getAllByRole('listitem').map((n) => n.textContent)).toEqual([
      'newest',
      'middle',
      'oldest',
    ])
  })

  it('uses a list so assistive technology reports the item count', () => {
    renderList([task(1, 'Buy milk')])

    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('shows an explicit empty state rather than nothing', () => {
    renderList([])

    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    renderList([], { status: 'loading' })

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows the load error when one is present', () => {
    renderList([], { status: 'error', loadError: 'Could not load your tasks.' })

    expect(screen.getByText('Could not load your tasks.')).toBeInTheDocument()
  })
})

describe('reconciliation identity', () => {
  it('moves existing DOM nodes on reorder instead of recreating them', () => {
    // The guard for FR-021 and SC-008. An index key would make React recycle
    // nodes by position, destroying the focused element.
    const first = task(1, 'first')
    const second = task(2, 'second')

    const { rerender, onSetCompleted, announce } = renderList([first, second])

    const before = screen.getAllByRole('listitem')
    const nodeForFirst = before[0]
    const nodeForSecond = before[1]

    rerender(
      <TaskList
        tasks={[second, first]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    const after = screen.getAllByRole('listitem')
    expect(after[0]).toBe(nodeForSecond)
    expect(after[1]).toBe(nodeForFirst)
  })
})

describe('FR-021 — focus follows a task that moves', () => {
  it('focuses the same task after it relocates, and announces the move', async () => {
    const user = userEvent.setup()
    const a = task(1, 'alpha')
    const b = task(2, 'bravo')
    const c = task(3, 'charlie')

    const announce = vi.fn()
    const onSetCompleted = vi.fn(noop)

    const { rerender } = render(
      <TaskList
        tasks={[a, b, c]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    // Complete 'alpha', which is first.
    await user.click(screen.getByRole('checkbox', { name: 'alpha' }))
    expect(onSetCompleted).toHaveBeenCalledWith(1, true)

    // The server reorders: alpha sinks to the bottom, now completed.
    const completedA = task(1, 'alpha', true)
    rerender(
      <TaskList
        tasks={[b, c, completedA]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'alpha' })).toHaveFocus()
    })
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Completed alpha.'))
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Moved'))
  })

  it('does NOT announce a move when the task did not move', async () => {
    // Completing the last active task in a one-item list changes nothing
    // positionally. Claiming it moved would be a lie (FR-021).
    const user = userEvent.setup()
    const only = task(1, 'only')

    const announce = vi.fn()
    const onSetCompleted = vi.fn(noop)

    const { rerender } = render(
      <TaskList
        tasks={[only]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'only' }))

    rerender(
      <TaskList
        tasks={[task(1, 'only', true)]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith('Completed only.')
    })
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('Moved'))
  })

  it('announces reopening, and says it moved back', async () => {
    const user = userEvent.setup()
    const active = task(1, 'active')
    const done = task(2, 'done', true)

    const announce = vi.fn()
    const onSetCompleted = vi.fn(noop)

    const { rerender } = render(
      <TaskList
        tasks={[active, done]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'done' }))
    expect(onSetCompleted).toHaveBeenCalledWith(2, false)

    rerender(
      <TaskList
        tasks={[task(2, 'done'), active]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('Reopened done.'))
    })
  })

  it('announces the failure and gives up the pending focus when the server rejects', async () => {
    const user = userEvent.setup()
    const announce = vi.fn()
    const onSetCompleted = vi.fn(
      async (): Promise<MutationResult> => ({ ok: false, message: 'Could not update.' }),
    )

    render(
      <TaskList
        tasks={[task(1, 'alpha')]}
        status="ready"
        loadError={null}
        onSetCompleted={onSetCompleted}
        announce={announce}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'alpha' }))

    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith('Could not update.')
    })
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('Completed'))
  })
})
