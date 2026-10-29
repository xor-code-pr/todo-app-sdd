import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Task } from '../../hooks/useTasks'
import { TaskList } from './TaskList'

function task(id: number, title: string): Task {
  return {
    id,
    title,
    completed: false,
    created_at: '2026-10-29T12:00:00Z',
    completed_at: null,
  }
}

describe('rendering', () => {
  it('renders tasks in the order received, without re-sorting', () => {
    const tasks = [task(3, 'newest'), task(2, 'middle'), task(1, 'oldest')]

    render(<TaskList tasks={tasks} status="ready" loadError={null} />)

    const items = screen.getAllByRole('listitem').map((node) => node.textContent)
    expect(items).toEqual(['newest', 'middle', 'oldest'])
  })

  it('uses a list so assistive technology reports the item count', () => {
    render(<TaskList tasks={[task(1, 'Buy milk')]} status="ready" loadError={null} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('shows an explicit empty state rather than nothing', () => {
    render(<TaskList tasks={[]} status="ready" loadError={null} />)

    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    render(<TaskList tasks={[]} status="loading" loadError={null} />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows the load error when one is present', () => {
    render(<TaskList tasks={[]} status="error" loadError="Could not load your tasks." />)

    expect(screen.getByText('Could not load your tasks.')).toBeInTheDocument()
  })
})

describe('reconciliation identity', () => {
  it('moves existing DOM nodes on reorder instead of recreating them', () => {
    // The guard for FR-021 and SC-008.
    //
    // TaskItem is keyed by task.id. When US2 completes a task and the row
    // relocates, React must MOVE the existing node so focus travels with it.
    // An index key would make React recycle nodes by position: the focused
    // element would be destroyed, focus would fall to <body>, and the failure
    // would look like a focus bug rather than a keying bug.
    const first = task(1, 'first')
    const second = task(2, 'second')

    const { rerender } = render(
      <TaskList tasks={[first, second]} status="ready" loadError={null} />,
    )

    const before = screen.getAllByRole('listitem')
    const nodeForFirst = before[0]
    const nodeForSecond = before[1]
    expect(nodeForFirst?.textContent).toBe('first')

    rerender(<TaskList tasks={[second, first]} status="ready" loadError={null} />)

    const after = screen.getAllByRole('listitem')
    expect(after[0]).toBe(nodeForSecond)
    expect(after[1]).toBe(nodeForFirst)
    expect(after[0]?.textContent).toBe('second')
  })
})
