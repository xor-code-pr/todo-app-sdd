import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { MutationResult } from '../../hooks/useTasks'
import { AddTaskForm } from './AddTaskForm'

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'

function setup(onCreate: (raw: string) => Promise<MutationResult>) {
  const announce = vi.fn()
  const user = userEvent.setup()
  render(<AddTaskForm onCreate={onCreate} announce={announce} />)
  return {
    user,
    announce,
    input: screen.getByLabelText(/task title/i),
    button: screen.getByRole('button', { name: /add task/i }),
  }
}

const succeed = async (): Promise<MutationResult> => ({ ok: true })

describe('successful submission', () => {
  it('clears the input and returns focus to it', async () => {
    const onCreate = vi.fn(succeed)
    const { user, input } = setup(onCreate)

    await user.type(input, 'Buy milk')
    await user.keyboard('{Enter}')

    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('supports ten consecutive adds without relocating the cursor', async () => {
    // SC-001 — the whole point of the story.
    const onCreate = vi.fn(succeed)
    const { user, input } = setup(onCreate)

    // The user reaches the field once; after that the keyboard never leaves it.
    await user.click(input)

    for (let i = 0; i < 10; i += 1) {
      await user.keyboard(`Task ${String(i)}{Enter}`)
      expect(input).toHaveFocus()
    }

    expect(onCreate).toHaveBeenCalledTimes(10)
    expect(onCreate).toHaveBeenLastCalledWith('Task 9')
  })

  it('sends the raw untrimmed title — the server is authoritative', async () => {
    const onCreate = vi.fn(succeed)
    const { user, input } = setup(onCreate)

    await user.type(input, '  Buy milk  ')
    await user.keyboard('{Enter}')

    expect(onCreate).toHaveBeenCalledWith('  Buy milk  ')
  })

  it('announces the addition', async () => {
    const { user, input, announce } = setup(vi.fn(succeed))

    await user.type(input, 'Buy milk')
    await user.keyboard('{Enter}')

    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Buy milk'))
  })
})

describe('blocked submissions', () => {
  it('blocks an empty title, announces, and keeps focus in the input', async () => {
    const onCreate = vi.fn(succeed)
    const { user, button, input, announce } = setup(onCreate)

    await user.click(button)

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByText(/enter a task title/i)).toBeInTheDocument()
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/enter a task title/i))
    expect(input).toHaveFocus()
  })

  it('blocks a whitespace-only title', async () => {
    const onCreate = vi.fn(succeed)
    const { user, input, button } = setup(onCreate)

    await user.type(input, '    ')
    await user.click(button)

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('leaves the submit button enabled so an invalid attempt can explain itself', () => {
    // A disabled button would swallow the attempt and show nothing, which
    // is precisely what FR-004 forbids.
    const { button } = setup(vi.fn(succeed))

    expect(button).toBeEnabled()
  })

  it('marks the input invalid and describes the error', async () => {
    const { user, button, input } = setup(vi.fn(succeed))

    await user.click(button)

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(expect.stringMatching(/enter a task title/i))
  })

  it('surfaces and announces a server rejection', async () => {
    const onCreate = vi.fn(
      async (): Promise<MutationResult> => ({ ok: false, message: 'Title is required.' }),
    )
    const { user, input, announce } = setup(onCreate)

    await user.type(input, 'x')
    await user.keyboard('{Enter}')

    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(announce).toHaveBeenCalledWith('Title is required.')
    expect(input).toHaveFocus()
  })
})

describe('grapheme counter', () => {
  it('counts user-perceived characters, not code units', async () => {
    const { user, input } = setup(vi.fn(succeed))

    await user.type(input, FAMILY)

    // String length would say 11.
    expect(screen.getByText(/^1 of 150 characters$/)).toBeInTheDocument()
    expect(input).toHaveValue(FAMILY)
  })

  it('blocks an over-length title before it reaches the server', async () => {
    const onCreate = vi.fn(succeed)
    const { user, input, button } = setup(onCreate)

    await user.click(input)
    await user.paste('a'.repeat(151))
    await user.click(button)

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByText(/150 characters or fewer/i)).toBeInTheDocument()
  })

  it('accepts exactly 150 characters', async () => {
    const onCreate = vi.fn(succeed)
    const { user, input, button } = setup(onCreate)

    await user.click(input)
    await user.paste('a'.repeat(150))
    await user.click(button)

    expect(onCreate).toHaveBeenCalledOnce()
  })
})

describe('in-flight behaviour', () => {
  it('disables the button but never the input while submitting', async () => {
    let release: () => void = () => undefined
    const pending = new Promise<MutationResult>((resolve) => {
      release = () => {
        resolve({ ok: true })
      }
    })
    const { user, input, button } = setup(() => pending)

    await user.type(input, 'Buy milk')
    await user.click(button)

    expect(button).toBeDisabled()
    // research.md R6: the user may already be typing the next title.
    expect(input).toBeEnabled()

    release()
  })
})
