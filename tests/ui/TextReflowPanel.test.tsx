import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../src/core/engine'
import { makeToken } from '../../src/core/types'
import { TextReflowPanel } from '../../src/ui/components/TextReflowPanel'
import { EngineProvider } from '../../src/ui/engine-context'

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
})
