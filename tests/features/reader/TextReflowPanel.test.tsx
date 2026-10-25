import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { TextReflowPanel } from '@/features/reader/components/TextReflowPanel'
import { EngineProvider } from '@/features/reader/engine-context'

const scrolled = vi.fn()
beforeEach(() => {
  scrolled.mockReset()
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled(this.textContent)
  }
})
afterEach(() => vi.restoreAllMocks())

const engine = () =>
  createEngine(['one', 'two', 'three', 'four'].map((w) => makeToken(w, { paraEnd: w === 'four' })))

describe('TextReflowPanel', () => {
  it('highlights the current word and brings it into view', () => {
    const e = engine()
    const { getByText } = render(
      <EngineProvider value={e}>
        <TextReflowPanel />
      </EngineProvider>,
    )
    expect(scrolled).toHaveBeenLastCalledWith('one')
    expect(getByText('one').className).toContain('bg-')
  })

  it('follows the word as the reader moves on', () => {
    const e = engine()
    render(
      <EngineProvider value={e}>
        <TextReflowPanel />
      </EngineProvider>,
    )
    act(() => e.seek(2))
    expect(scrolled).toHaveBeenLastCalledWith('three')
  })

  it('moves to a word when it is clicked', () => {
    const e = engine()
    const { getByText } = render(
      <EngineProvider value={e}>
        <TextReflowPanel />
      </EngineProvider>,
    )
    act(() => getByText('four').click())
    expect(e.index).toBe(3)
  })

  it('takes a click beside a word, on its space or line, as that word', () => {
    const e = engine()
    const { getByText } = render(
      <EngineProvider value={e}>
        <TextReflowPanel />
      </EngineProvider>,
    )
    // The padded box around "two" and the space after it.
    act(() => (getByText('two').parentElement as HTMLElement).click())
    expect(e.index).toBe(1)
  })

  it('renders more as the reader scrolls on, without pulling them back to the word', () => {
    const e = createEngine(Array.from({ length: 5000 }, (_, i) => makeToken(`w${i}`)))
    const { container, queryByText } = render(
      <EngineProvider value={e}>
        <TextReflowPanel book />
      </EngineProvider>,
    )
    expect(queryByText('w1499')).not.toBeNull()
    expect(queryByText('w2000')).toBeNull()
    scrolled.mockReset()

    // jsdom lays nothing out, so every scroll counts as reaching the end.
    fireEvent.scroll(container.firstChild as HTMLElement)
    expect(queryByText('w2000')).not.toBeNull()
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('lets the reader scroll far past the word without snapping back to it', () => {
    const e = createEngine(Array.from({ length: 20_000 }, (_, i) => makeToken(`w${i}`)))
    const { container, queryByText } = render(
      <EngineProvider value={e}>
        <TextReflowPanel book />
      </EngineProvider>,
    )
    for (let i = 0; i < 6; i++) fireEvent.scroll(container.firstChild as HTMLElement)
    // Grown well past MAX, so the start (and the word being read) is trimmed.
    expect(queryByText('w0')).toBeNull()
    expect(queryByText('w9000')).not.toBeNull()

    // A new word still brings the page back to it.
    act(() => e.seek(10))
    expect(queryByText('w10')).not.toBeNull()
  })
})
