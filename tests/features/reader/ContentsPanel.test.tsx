import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { ContentsPanel } from '@/features/reader/components/ContentsPanel'
import { EngineProvider } from '@/features/reader/engine-context'

const chapters = [
  { title: 'Chapter 1', startTokenIndex: 2 },
  { title: 'Chapter 2', startTokenIndex: 5 },
]

function renderPanel(onPicked?: () => void) {
  const engine = createEngine(Array.from({ length: 8 }, (_, i) => makeToken(`w${i}`)))
  render(
    <EngineProvider value={engine}>
      <ContentsPanel chapters={chapters} onPicked={onPicked} />
    </EngineProvider>,
  )
  return engine
}

const current = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-current') === 'true')
    .map((b) => b.textContent)

describe('ContentsPanel', () => {
  it('marks the chapter being read, and none before the first', () => {
    const engine = renderPanel()
    expect(current()).toEqual([])
    act(() => engine.seek(3))
    expect(current()).toEqual(['Chapter 1'])
    act(() => engine.seek(7))
    expect(current()).toEqual(['Chapter 2'])
  })

  it('goes to a chapter’s first word when it is picked', async () => {
    const onPicked = vi.fn()
    const engine = renderPanel(onPicked)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter 2' }))
    expect(engine.index).toBe(5)
    expect(current()).toEqual(['Chapter 2'])
    expect(onPicked).toHaveBeenCalled()
  })
})
