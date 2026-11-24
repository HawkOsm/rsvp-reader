import { fireEvent, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken, type ContentLayout } from '@/core/types'
import { EngineProvider } from '@/features/reader/engine-context'
import {
  useReaderKeyboardShortcuts,
  type ReaderKeys,
} from '@/features/reader/hooks/useReaderKeyboardShortcuts'
import { useAppStore } from '@/stores/app-store'

// Two words on each of pages 0, 1 and 2.
const tokens = [0, 0, 1, 1, 2, 2].map((page) => makeToken('w', { page }))

function setup(layout: ContentLayout, index = 0, extra: ReaderKeys = {}) {
  const engine = createEngine(tokens, { index })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <EngineProvider value={engine}>{children}</EngineProvider>
    </MemoryRouter>
  )
  renderHook(() => useReaderKeyboardShortcuts(layout, extra), { wrapper })
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

  it('the arrows step one word, even if the tokens carry pages', () => {
    const engine = setup(reflow)
    press('ArrowRight')
    expect(engine.index).toBe(1)
    press('ArrowLeft')
    expect(engine.index).toBe(0)
  })

  it('Space and the paging keys scroll a screen, moving no word themselves', () => {
    const engine = setup(reflow)
    const scroller = document.createElement('div')
    scroller.id = 'book-scroll'
    Object.defineProperty(scroller, 'clientHeight', { value: 1000 })
    const scrollBy = vi.fn()
    scroller.scrollBy = scrollBy
    document.body.append(scroller)
    press(' ')
    press('PageDown')
    press('PageUp')
    expect(scrollBy.mock.calls).toEqual([[{ top: 850 }], [{ top: 850 }], [{ top: -850 }]])
    expect(engine.index).toBe(0)
    scroller.remove()
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

describe('book-mode keys for getting around', () => {
  const paged: ContentLayout = { kind: 'paged', pages: 3 }

  it('n and p turn the page, as PageDown and PageUp do', () => {
    const engine = setup(paged)
    press('n')
    expect(engine.index).toBe(2)
    press('p')
    expect(engine.index).toBe(0)
  })

  it('Alt with an arrow goes back and forward through the jumps, and turns no page', () => {
    const jumps = { back: vi.fn(), forward: vi.fn() }
    const engine = setup(paged, 0, { jumps })
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })
    expect(jumps.back).toHaveBeenCalledOnce()
    expect(jumps.forward).toHaveBeenCalledOnce()
    expect(engine.index).toBe(0)
  })

  it('G opens the jump panel, and Enter shows or hides the header, unless it is pressing a button', () => {
    const onOpenJump = vi.fn()
    const onToggleControls = vi.fn()
    setup(paged, 0, { onOpenJump, onToggleControls })
    press('g')
    expect(onOpenJump).toHaveBeenCalledOnce()
    press('Enter')
    expect(onToggleControls).toHaveBeenCalledOnce()

    const button = document.createElement('button')
    document.body.append(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onToggleControls).toHaveBeenCalledOnce()
    button.remove()

    // Neither means anything while the words are flashing by.
    useAppStore.setState({ mode: 'rsvp' })
    setup(paged, 0, { onOpenJump, onToggleControls })
    press('g')
    expect(onOpenJump).toHaveBeenCalledOnce()
  })
})
