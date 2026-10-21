import { fireEvent, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEngine } from '../../src/core/engine'
import { makeToken, type ContentLayout } from '../../src/core/types'
import { EngineProvider } from '../../src/ui/engine-context'
import { useReaderKeyboardShortcuts } from '../../src/ui/hooks/useKeyboardShortcuts'
import { useAppStore } from '../../src/ui/store'

// Two words on each of pages 0, 1 and 2.
const tokens = [0, 0, 1, 1, 2, 2].map((page) => makeToken('w', { page }))

function setup(layout: ContentLayout, index = 0) {
  const engine = createEngine(tokens, { index })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <EngineProvider value={engine}>{children}</EngineProvider>
    </MemoryRouter>
  )
  renderHook(() => useReaderKeyboardShortcuts(layout), { wrapper })
  return engine
}

const press = (key: string) => fireEvent.keyDown(window, { key })

beforeEach(() => {
  useAppStore.setState({ mode: 'book', bookLayout: 'single' })
})

describe('book-mode keys over a paged book', () => {
  const paged: ContentLayout = { kind: 'paged', pages: 3 }

  it('PageDown and PageUp turn the page', () => {
    const engine = setup(paged)
    press('PageDown')
    expect(engine.index).toBe(2) // first word of page 1
    press('PageUp')
    expect(engine.index).toBe(0)
  })

  it('Home and End go to the first and last page', () => {
    const engine = setup(paged, 2)
    press('End')
    expect(engine.index).toBe(4) // first word of page 2, the last page
    press('Home')
    expect(engine.index).toBe(0)
  })
})

describe('book-mode keys over reflowed text', () => {
  const reflow: ContentLayout = { kind: 'reflow' }

  it('PageDown and PageUp step one word, even if the tokens carry pages', () => {
    const engine = setup(reflow)
    press('PageDown')
    expect(engine.index).toBe(1)
    press('PageUp')
    expect(engine.index).toBe(0)
  })

  it('Home and End go to the first and last word', () => {
    const engine = setup(reflow, 2)
    press('End')
    expect(engine.index).toBe(5)
    press('Home')
    expect(engine.index).toBe(0)
  })
})

describe('RSVP mode', () => {
  it('ignores PageDown, whatever the layout', () => {
    useAppStore.setState({ mode: 'rsvp' })
    const engine = setup({ kind: 'paged', pages: 3 })
    press('PageDown')
    expect(engine.index).toBe(0)
  })
})
